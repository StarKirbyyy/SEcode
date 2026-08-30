import { afterEach, describe, expect, it, vi } from "vitest";

import { nativeAgentRuntimeDependencies } from "@/lib/agent/dependencies";
import { createAgentRuntimeWithDependencies } from "@/lib/agent/runtime";

import {
  QueueModelClient,
  createAgentFixture,
  createStaticContextProvider,
  createTextCompletion,
  createToolCompletion,
  removeAgentTemporaryDirectories,
} from "./helpers";

afterEach(removeAgentTemporaryDirectories);

function uuidSequence() {
  let value = 900;
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

async function eventsFor(
  fixture: Awaited<ReturnType<typeof createAgentFixture>>,
  sessionId: string,
) {
  return (await fixture.store.readEvents(sessionId)).events;
}

describe("Agent assistant language enforcement", () => {
  it("rejects an English final and completes with a Chinese restatement", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0]!.id;
    const model = new QueueModelClient([
      createTextCompletion("I inspected the repository and the task is complete."),
      createTextCompletion("已检查仓库，任务已经完成。"),
    ]);
    const delivered: unknown[] = [];
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: uuidSequence() },
    );

    const handle = await runtime.startRun(
      { sessionId, prompt: "检查项目" },
      { onEvent: (event) => { delivered.push(event); } },
    );
    await expect(handle.completion).resolves.toMatchObject({
      status: "completed",
      modelRequests: 2,
      toolCalls: 0,
    });

    const stored = await eventsFor(fixture, sessionId);
    expect(stored.filter((event) => event.type === "model.output.rejected"))
      .toHaveLength(1);
    expect(stored.find((event) => event.type === "model.output.rejected"))
      .toMatchObject({
        data: {
          iteration: 1,
          reason: "language_mismatch",
          action: "retry",
          retryAttempt: 1,
        },
      });
    expect(stored.filter((event) => event.type === "assistant.message"))
      .toEqual([expect.objectContaining({
        data: { content: "已检查仓库，任务已经完成。", kind: "final" },
      })]);
    expect(JSON.stringify(stored)).not.toContain("repository");
    expect(JSON.stringify(delivered)).not.toContain("repository");
    expect(model.requests[1]!.messages.at(-1)).toMatchObject({ role: "system" });
    expect(model.requests[1]!.messages.at(-1)!.content).toContain("只使用简体中文重述");
  });

  it("rejects an English plan before exposing the Chinese proposal", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0]!.id;
    const model = new QueueModelClient([
      createTextCompletion("I will inspect the code, update it, and run the tests."),
      createTextCompletion("计划：先检查代码，再完成最小修改，最后运行相关测试。"),
    ]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: uuidSequence() },
    );

    const handle = await runtime.startRun({
      sessionId,
      prompt: "修复问题",
      planningEnabled: true,
    });
    await vi.waitFor(() => {
      expect(runtime.getActiveRun(handle.runId)?.pendingPlanApproval?.content)
        .toContain("先检查代码");
    });

    const stored = await eventsFor(fixture, sessionId);
    expect(stored.filter((event) => event.type === "plan.proposed"))
      .toHaveLength(1);
    expect(stored.some((event) => event.type === "model.output.rejected"))
      .toBe(true);
    expect(JSON.stringify(stored)).not.toContain("update it");
    handle.cancel("结束语言测试");
    await expect(handle.completion).resolves.toMatchObject({
      status: "cancelled",
      modelRequests: 2,
    });
  });

  it("fails deterministically after three non-Chinese stop completions", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0]!.id;
    const model = new QueueModelClient([
      createTextCompletion("The first English response is not acceptable."),
      createTextCompletion("The second English response is still not acceptable."),
      createTextCompletion("The third English response is also not acceptable."),
    ]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: uuidSequence() },
    );

    const handle = await runtime.startRun({
      sessionId,
      prompt: "检查项目",
      limits: { maxModelRequests: 3 },
    });
    await expect(handle.completion).resolves.toMatchObject({
      status: "failed",
      modelRequests: 3,
      error: { code: "AGENT_OUTPUT_LANGUAGE_INVALID" },
    });
    const stored = await eventsFor(fixture, sessionId);
    expect(stored.filter((event) => event.type === "model.output.rejected"))
      .toHaveLength(3);
    expect(stored.some((event) => event.type === "assistant.message")).toBe(false);
    expect(JSON.stringify(stored)).not.toContain("English response");
  });

  it("suppresses English tool narration and executes the tool call once", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0]!.id;
    const toolCall = {
      ok: true as const,
      call: {
        id: "00000000-0000-4000-8000-000000000980",
        name: "list_directory",
        arguments: { path: ".", depth: 1, limit: 20 },
      },
    };
    const execute = vi.fn(nativeAgentRuntimeDependencies.executeAuthorizedLocalTool);
    const model = new QueueModelClient([
      createToolCompletion(
        [toolCall],
        "I will inspect the workspace before making any changes.",
      ),
      createTextCompletion("已检查工作区，未进行任何修改。"),
    ]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: uuidSequence(),
        executeAuthorizedLocalTool: execute,
      },
    );

    const handle = await runtime.startRun({ sessionId, prompt: "查看目录" });
    await expect(handle.completion).resolves.toMatchObject({
      status: "completed",
      modelRequests: 2,
      toolCalls: 1,
    });
    const stored = await eventsFor(fixture, sessionId);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(stored.find((event) => event.type === "model.output.rejected"))
      .toMatchObject({ data: { action: "content_suppressed", retryAttempt: 0 } });
    expect(stored.some((event) =>
      event.type === "assistant.message" && event.data.kind === "intermediate"
    )).toBe(false);
    expect(JSON.stringify(stored)).not.toContain("inspect the workspace");
  });
});
