import { afterEach, describe, expect, it } from "vitest";

import { nativeAgentRuntimeDependencies } from "@/lib/agent/dependencies";
import { createAgentRuntimeWithDependencies } from "@/lib/agent/runtime";
import { ModelLayerError } from "@/lib/model";

import {
  RUN_ID,
  QueueModelClient,
  createAgentFixture,
  createModelContinuation,
  createStaticContextProvider,
  createTextCompletion,
  removeAgentTemporaryDirectories,
} from "./helpers";

afterEach(removeAgentTemporaryDirectories);

describe("Agent text completion runtime", () => {
  it("persists the full text completion trajectory", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([
      {
        ...createTextCompletion("已完成修复"),
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          reasoningTokens: 99,
        },
      },
    ]);
    const events: unknown[] = [];
    let now = 100;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        monotonicNow: () => {
          const value = now;
          now += 50;
          return value;
        },
      },
    );

    const handle = await runtime.startRun(
      { sessionId, prompt: "修复 sk-abcdefghijklmnopqrstuvwxyz" },
      { onEvent: (event) => { events.push(event); } },
    );
    const outcome = await handle.completion;
    const stored = (await fixture.store.readEvents(sessionId)).events;

    expect(outcome).toMatchObject({
      status: "completed",
      iterations: 1,
      durationMs: 50,
    });
    expect(stored.map((event) => event.type)).toEqual([
      "session.created",
      "run.started",
      "user.message",
      "model.requested",
      "model.completed",
      "assistant.message",
      "run.completed",
    ]);
    expect(JSON.stringify(stored)).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(stored[4]).toMatchObject({
      data: {
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    });
    expect(JSON.stringify(stored[4])).not.toContain("reasoningTokens");
    expect(events.some((event) =>
      (event as { type?: string }).type === "assistant.delta"
    )).toBe(true);
    expect(runtime.getActiveRun(handle.runId)).toBeUndefined();
  });

  it("commits a context compaction before requesting the model", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([createTextCompletion()]),
        contextProvider: {
          async buildContext() {
            return {
              messages: [{ role: "user", content: "task" }],
              compaction: {
                throughSeq: 1,
                summary: "已知目标",
                retainedRange: { fromSeq: 2, toSeq: 3 },
              },
            };
          },
        },
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );

    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await handle.completion;
    expect((await fixture.store.readEvents(sessionId)).events.map((event) => event.type))
      .toEqual([
        "session.created",
        "run.started",
        "user.message",
        "context.compacted",
        "model.requested",
        "model.completed",
        "assistant.message",
        "run.completed",
      ]);
  });

  it("maps context, model and oversized output failures", async () => {
    const cases = [
      {
        provider: { async buildContext() { throw new Error("context private"); } },
        model: new QueueModelClient([]),
        code: "AGENT_CONTEXT_FAILED",
      },
      {
        provider: createStaticContextProvider(),
        model: new QueueModelClient([
          new ModelLayerError({
            code: "MODEL_TIMEOUT",
            message: "模型请求超时",
            recoverable: true,
          }),
        ]),
        code: "MODEL_TIMEOUT",
      },
      {
        provider: createStaticContextProvider(),
        model: new QueueModelClient([createTextCompletion("x".repeat(1_048_577))]),
        code: "AGENT_ASSISTANT_MESSAGE_TOO_LARGE",
      },
    ];

    for (const testCase of cases) {
      const fixture = await createAgentFixture();
      const sessionId = (await fixture.store.listSessions())[0].id;
      const runtime = createAgentRuntimeWithDependencies(
        {
          eventStore: fixture.store,
          modelClient: testCase.model,
          contextProvider: testCase.provider,
        },
        { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
      );
      const handle = await runtime.startRun({ sessionId, prompt: "task" });
      await expect(handle.completion).resolves.toMatchObject({
        status: "failed",
        error: { code: testCase.code },
      });
    }
  });

  it("passes only in-memory continuation to a later request", async () => {
    const continuation = createModelContinuation();
    const first = {
      content: null,
      toolCalls: [
        {
          ok: false as const,
          id: "00000000-0000-4000-8000-000000000155",
          name: null,
          rawArgumentsPreview: "{bad",
          error: {
            code: "MODEL_INVALID_TOOL_CALL",
            message: "invalid",
            recoverable: true,
          },
        },
      ],
      finishReason: "tool_calls" as const,
      continuation,
    };
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([first, createTextCompletion()]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await handle.completion;

    expect(model.requests[0].continuation).toBeUndefined();
    expect(model.requests[1].continuation).toBe(continuation);
    expect(JSON.stringify((await fixture.store.readEvents(sessionId)).events))
      .not.toContain("continuation");
  });
});
