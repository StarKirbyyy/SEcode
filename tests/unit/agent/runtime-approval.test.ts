import { afterEach, describe, expect, it, vi } from "vitest";

import { nativeAgentRuntimeDependencies } from "@/lib/agent/dependencies";
import { createAgentRuntimeWithDependencies } from "@/lib/agent/runtime";
import { createToolSuccess } from "@/lib/tools/types";
import { EventStoreError, type JsonlEventStore } from "@/lib/storage";

import {
  RUN_ID,
  QueueModelClient,
  createAgentFixture,
  createStaticContextProvider,
  createTextCompletion,
  createToolCompletion,
  removeAgentTemporaryDirectories,
} from "./helpers";

afterEach(removeAgentTemporaryDirectories);

const PROCESS_CALL_ID = "00000000-0000-4000-8000-000000000301";
const WRONG_APPROVAL_ID = "00000000-0000-4000-8000-000000000399";

function approvalToolCompletion() {
  return createToolCompletion([
    {
      ok: true,
      call: {
        id: PROCESS_CALL_ID,
        name: "run_process",
        arguments: {
          program: "pnpm",
          args: ["install"],
          cwd: ".",
          timeoutMs: 1_000,
        },
      },
    },
  ]);
}

async function waitForPending(
  runtime: ReturnType<typeof createAgentRuntimeWithDependencies>,
) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const view = runtime.getActiveRun(RUN_ID);
    if (view?.pendingApproval !== undefined) return view.pendingApproval;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("approval did not become pending");
}

describe("Agent approval runtime", () => {
  it("persists approval before executing an approved tool", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const execute = vi.fn(async () => createToolSuccess("模拟安装完成"));
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([
          approvalToolCompletion(),
          createTextCompletion(),
        ]),
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        executeAuthorizedLocalTool: execute,
      },
    );

    const handle = await runtime.startRun({ sessionId, prompt: "安装依赖" });
    const pending = await waitForPending(runtime);
    expect(runtime.getActiveRun(RUN_ID)?.status).toBe("awaiting_approval");
    await expect(
      runtime.resolveApproval(RUN_ID, pending.approvalId, {
        approved: true,
        reason: "允许一次",
      }),
    ).resolves.toEqual({ status: "resolved", approved: true });
    await handle.completion;

    const types = (await fixture.store.readEvents(sessionId)).events.map(
      (event) => event.type,
    );
    expect(types.indexOf("approval.required")).toBeLessThan(
      types.indexOf("approval.resolved"),
    );
    expect(types.indexOf("approval.resolved")).toBeLessThan(
      types.indexOf("tool.started"),
    );
    expect(types.indexOf("tool.started")).toBeLessThan(
      types.indexOf("tool.result"),
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects a tool without creating tool.started and continues", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const execute = vi.fn();
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([
          approvalToolCompletion(),
          createTextCompletion(),
        ]),
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        executeAuthorizedLocalTool: execute,
      },
    );

    const handle = await runtime.startRun({ sessionId, prompt: "安装依赖" });
    const pending = await waitForPending(runtime);
    await runtime.resolveApproval(RUN_ID, pending.approvalId, {
      approved: false,
      reason: "拒绝 sk-abcdefghijklmnopqrstuvwxyz",
    });
    await expect(handle.completion).resolves.toMatchObject({ status: "completed" });

    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.some((event) => event.type === "tool.started")).toBe(false);
    expect(events.find((event) => event.type === "approval.resolved")).toMatchObject({
      data: { approved: false, reason: "拒绝 [REDACTED]" },
    });
    expect(events.find((event) => event.type === "tool.result")).toMatchObject({
      data: { result: { error: { code: "TOOL_APPROVAL_REJECTED" } } },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps pending approval intact after a wrong ID", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([
          approvalToolCompletion(),
          createTextCompletion(),
        ]),
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        executeAuthorizedLocalTool: async () => createToolSuccess("done"),
      },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    const pending = await waitForPending(runtime);
    const before = (await fixture.store.readEvents(sessionId)).events.length;

    await expect(
      runtime.resolveApproval(RUN_ID, WRONG_APPROVAL_ID, { approved: true }),
    ).resolves.toMatchObject({
      status: "invalid",
      error: { code: "AGENT_APPROVAL_INVALID" },
    });
    expect((await fixture.store.readEvents(sessionId)).events).toHaveLength(before);
    expect(runtime.getActiveRun(RUN_ID)?.pendingApproval?.approvalId).toBe(
      pending.approvalId,
    );

    await runtime.resolveApproval(RUN_ID, pending.approvalId, { approved: false });
    await handle.completion;
    await expect(
      runtime.resolveApproval(RUN_ID, pending.approvalId, { approved: false }),
    ).resolves.toMatchObject({ status: "invalid" });
  });

  it("does not execute when approval.resolved cannot be committed", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const append = fixture.store.appendEvent.bind(fixture.store);
    const failingStore: JsonlEventStore = {
      ...fixture.store,
      initialize: fixture.store.initialize.bind(fixture.store),
      createSession: fixture.store.createSession.bind(fixture.store),
      getSessionMetadata: fixture.store.getSessionMetadata.bind(fixture.store),
      listSessions: fixture.store.listSessions.bind(fixture.store),
      listRecentWorkspaces: fixture.store.listRecentWorkspaces.bind(fixture.store),
      readEvents: fixture.store.readEvents.bind(fixture.store),
      inspectSession: fixture.store.inspectSession.bind(fixture.store),
      async appendEvent(targetSessionId, draft) {
        if (draft.type === "approval.resolved") {
          throw new EventStoreError({
            code: "EVENT_COMMIT_UNCERTAIN",
            message: "审批事实提交状态不确定",
            recoverable: false,
          });
        }
        return append(targetSessionId, draft);
      },
    };
    const execute = vi.fn();
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: failingStore,
        modelClient: new QueueModelClient([approvalToolCompletion()]),
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        executeAuthorizedLocalTool: execute,
      },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    const pending = await waitForPending(runtime);

    await expect(
      runtime.resolveApproval(RUN_ID, pending.approvalId, { approved: true }),
    ).rejects.toMatchObject({ error: { code: "EVENT_COMMIT_UNCERTAIN" } });
    await expect(handle.completion).rejects.toMatchObject({
      error: { code: "EVENT_COMMIT_UNCERTAIN" },
    });
    expect(execute).not.toHaveBeenCalled();
    expect((await fixture.store.readEvents(sessionId)).events.at(-1)?.type).toBe(
      "approval.required",
    );
  });
});
