import { afterEach, describe, expect, it, vi } from "vitest";

import { nativeAgentRuntimeDependencies } from "@/lib/agent/dependencies";
import { createAgentRuntimeWithDependencies } from "@/lib/agent/runtime";
import { EventStoreError, type JsonlEventStore } from "@/lib/storage";

import {
  QueueModelClient,
  createAgentFixture,
  createStaticContextProvider,
  createTextCompletion,
  removeAgentTemporaryDirectories,
} from "./helpers";

afterEach(removeAgentTemporaryDirectories);

function uuidSequence() {
  let value = 800;
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

describe("Agent plan approval identity", () => {
  it("rejects wrong, crossed and duplicate decisions without extra durable events", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0]!.id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([
          createTextCompletion("目标：检查\n事实：已知\n任务：执行\n验证：测试\n风险：无\n不执行：安装"),
          createTextCompletion("完成"),
        ]),
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: uuidSequence() },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task", planningEnabled: true });
    await vi.waitFor(() => expect(runtime.getActiveRun(handle.runId)?.pendingPlanApproval).toBeDefined());
    const pending = runtime.getActiveRun(handle.runId)!.pendingPlanApproval!;
    const before = (await fixture.store.readEvents(sessionId)).events.length;

    await expect(runtime.resolvePlanApproval(
      handle.runId,
      "00000000-0000-4000-8000-000000009999",
      { planId: pending.planId, approved: true },
    )).resolves.toMatchObject({ status: "invalid" });
    await expect(runtime.resolvePlanApproval(
      handle.runId,
      pending.approvalId,
      { planId: "00000000-0000-4000-8000-000000009998", approved: true },
    )).resolves.toMatchObject({ status: "invalid" });
    expect((await fixture.store.readEvents(sessionId)).events).toHaveLength(before);

    await runtime.resolvePlanApproval(handle.runId, pending.approvalId, {
      planId: pending.planId,
      approved: true,
    });
    await expect(runtime.resolvePlanApproval(handle.runId, pending.approvalId, {
      planId: pending.planId,
      approved: true,
    })).resolves.toMatchObject({ status: "invalid" });
    await expect(handle.completion).resolves.toMatchObject({ status: "completed" });
  });

  it("keeps the plan pending when durable approval append fails", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0]!.id;
    const append = fixture.store.appendEvent.bind(fixture.store);
    const store: JsonlEventStore = {
      initialize: fixture.store.initialize.bind(fixture.store),
      createSession: fixture.store.createSession.bind(fixture.store),
      deleteSession: fixture.store.deleteSession.bind(fixture.store),
      getSessionMetadata: fixture.store.getSessionMetadata.bind(fixture.store),
      listSessions: fixture.store.listSessions.bind(fixture.store),
      listRecentWorkspaces: fixture.store.listRecentWorkspaces.bind(fixture.store),
      readEvents: fixture.store.readEvents.bind(fixture.store),
      inspectSession: fixture.store.inspectSession.bind(fixture.store),
      async appendEvent(id, draft) {
        if (draft.type === "plan.approval.resolved") {
          throw new EventStoreError({
            code: "EVENT_STORE_IO_ERROR",
            message: "测试拒绝写入",
            recoverable: true,
          });
        }
        return append(id, draft);
      },
    };
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: store,
        modelClient: new QueueModelClient([
          createTextCompletion("目标：检查\n事实：已知\n任务：执行\n验证：测试\n风险：无\n不执行：安装"),
        ]),
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: uuidSequence() },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task", planningEnabled: true });
    await vi.waitFor(() => expect(runtime.getActiveRun(handle.runId)?.pendingPlanApproval).toBeDefined());
    const pending = runtime.getActiveRun(handle.runId)!.pendingPlanApproval!;
    await expect(runtime.resolvePlanApproval(handle.runId, pending.approvalId, {
      planId: pending.planId,
      approved: true,
    })).rejects.toMatchObject({ error: { code: "EVENT_STORE_IO_ERROR" } });
    expect(runtime.getActiveRun(handle.runId)).toMatchObject({
      status: "awaiting_plan_approval",
      pendingPlanApproval: pending,
    });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.some((event) => event.type === "plan.approval.resolved")).toBe(false);
    expect(events.some((event) => event.type === "tool.requested")).toBe(false);
    handle.cancel("结束测试");
    await handle.completion;
  });
});
