import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentContextProvider } from "@/lib/context/provider";
import { ContextLayerError } from "@/lib/context/errors";
import { projectContextHistory } from "@/lib/context/history-projector";
import { selectContextCompaction } from "@/lib/context/compaction";
import { renderContextMessages } from "@/lib/context/message-renderer";
import { estimateContextTokens } from "@/lib/context/token-estimator";
import { ModelLayerError } from "@/lib/model";
import {
  DEPENDENCY_RECOVERY_TOOL_DEFINITIONS,
  LOCAL_TOOL_DEFINITIONS,
} from "@/lib/tools";

import {
  SESSION_ID,
  activeRunPrefix,
  createFakeModelClient,
  createMemoryEventSource,
  createTempContextStore,
  contextEvent,
  manyCompletedRuns,
  manyCompletedToolRuns,
  numberedRunId,
} from "./helpers";

function request(runId: string, signal = new AbortController().signal) {
  return {
    sessionId: SESSION_ID,
    runId,
    iteration: 1,
    signal,
    toolCapability: "normal" as const,
  };
}

describe("event-backed context provider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it("builds a first-turn context without calling the summary model", async () => {
    const source = createMemoryEventSource(activeRunPrefix());
    const model = createFakeModelClient(1_000_000);
    const provider = createAgentContextProvider({ eventSource: source, modelClient: model });
    const result = await provider.buildContext(request(numberedRunId(1)));

    expect(result.compaction).toBeUndefined();
    expect(result.contextCache).toMatchObject({
      status: "cold",
      reusedEvents: 0,
      tailEvents: 3,
      avoidedBytes: 0,
    });
    expect(result.messages.map((message) => message.role)).toEqual([
      "system", "system", "user", "system", "system",
    ]);
    expect(result.messages.at(-3)).toEqual({ role: "user", content: "修复测试" });
    expect(result.messages.at(-2)?.content).toContain("易变运行记忆");
    expect(result.messages.at(-1)).toMatchObject({ role: "system" });
    expect(result.messages.at(-1)!.content).toContain("输出语言强制策略");
    expect(vi.mocked(model.complete)).not.toHaveBeenCalled();
  });

  it("reads multiple event pages with exact afterSeq progress", async () => {
    const events = manyCompletedRuns(10);
    const source = createMemoryEventSource(events, 7);
    const model = createFakeModelClient(1_000_000);
    const provider = createAgentContextProvider({ eventSource: source, modelClient: model });
    await provider.buildContext(request(numberedRunId(11)));
    expect(source.readEvents.mock.calls.length).toBeGreaterThan(2);
    expect(source.readEvents.mock.calls[0][1]).toEqual({ afterSeq: 0, limit: 1_000 });
    expect(source.readEvents.mock.calls[1][1].afterSeq).toBe(7);
  });

  it.each([
    [9, 1, 4_000, 48_000, 60_000],
    [9, 1, 4_500, 50_000, 62_000],
    [5, 2, 8_000, 60_000, 78_000],
    [7, 2, 5_000, 60_000, 80_000],
  ])("recovers sanitized replay with %i rounds and %i reads per round", async (
    roundCount,
    toolsPerRound,
    secondaryOutputBytes,
    minimumRawTokens,
    maximumRawTokens,
  ) => {
    const events = manyCompletedToolRuns(
      roundCount,
      secondaryOutputBytes,
      toolsPerRound,
      55_785,
    );
    const history = projectContextHistory(events);
    const rawMessages = renderContextMessages({
      history,
      workspacePath: "/sanitized/context-workspace",
      rounds: history.rounds,
    });
    const rawEstimate = estimateContextTokens(
      rawMessages,
      LOCAL_TOOL_DEFINITIONS,
      64_000,
    );
    expect(rawEstimate.inputBudgetTokens).toBe(48_000);
    expect(rawEstimate.estimatedTokens).toBeGreaterThan(minimumRawTokens);
    expect(rawEstimate.estimatedTokens).toBeLessThan(maximumRawTokens);
    expect(() => selectContextCompaction({
      history,
      workspacePath: "/sanitized/context-workspace",
      contextWindow: 64_000,
      tools: LOCAL_TOOL_DEFINITIONS,
    })).toThrow();

    const model = createFakeModelClient(64_000);
    const provider = createAgentContextProvider({
      eventSource: createMemoryEventSource(events),
      modelClient: model,
    });
    const result = await provider.buildContext(request(numberedRunId(roundCount + 1)));
    const toolMessages = result.messages.filter((message) => message.role === "tool");
    expect(toolMessages).toHaveLength(roundCount * toolsPerRound);
    expect(estimateContextTokens(
      result.messages,
      LOCAL_TOOL_DEFINITIONS,
      64_000,
    ).estimatedTokens).toBeLessThan(48_000);
    expect(JSON.stringify(result.messages)).not.toContain("x".repeat(20_000));
    expect(vi.mocked(model.complete)).not.toHaveBeenCalled();
  });

  it("creates one compaction and reuses its durable summary", async () => {
    const events = [...manyCompletedRuns(12, 2_500)];
    const source = createMemoryEventSource(events);
    const model = createFakeModelClient(25_000);
    const provider = createAgentContextProvider({ eventSource: source, modelClient: model });
    const runId = numberedRunId(13);
    const first = await provider.buildContext(request(runId));
    expect(first.compaction).toBeDefined();
    expect(vi.mocked(model.complete)).toHaveBeenCalledTimes(1);
    const seq = events.at(-1)!.seq + 1;
    const compaction = first.compaction!;
    events.push(contextEvent(seq, "context.compacted", {
      throughSeq: compaction.throughSeq,
      summary: compaction.summary,
      retainedRange: {
        fromSeq: compaction.retainedRange.fromSeq,
        toSeq: compaction.retainedRange.toSeq,
      },
    }, runId));
    vi.mocked(model.complete).mockClear();

    const second = await provider.buildContext(request(runId));
    expect(second.compaction).toBeUndefined();
    expect(JSON.stringify(second.messages)).toContain("SECODE_CONTEXT_SUMMARY_V1");
    expect(vi.mocked(model.complete)).not.toHaveBeenCalled();

    const restartedProvider = createAgentContextProvider({
      eventSource: source,
      modelClient: model,
    });
    const afterRestart = await restartedProvider.buildContext(request(runId));
    expect(afterRestart.messages).toEqual(second.messages);
    expect(afterRestart.compaction).toEqual(second.compaction);
    expect(second.contextCache?.status).toBe("warm");
    expect(afterRestart.contextCache?.status).toBe("cold");
    expect(vi.mocked(model.complete)).not.toHaveBeenCalled();
  });

  it("reuses a verified projection and reads only a continuous tail", async () => {
    const events = [...activeRunPrefix()];
    const source = createMemoryEventSource(events);
    const provider = createAgentContextProvider({
      eventSource: source,
      modelClient: createFakeModelClient(1_000_000),
    });
    const runId = numberedRunId(1);

    const cold = await provider.buildContext(request(runId));
    vi.mocked(source.readEvents).mockClear();
    const warm = await provider.buildContext(request(runId));
    expect(warm.messages).toEqual(cold.messages);
    expect(warm.contextCache).toMatchObject({
      status: "warm",
      reusedEvents: 3,
      tailEvents: 0,
    });
    expect(warm.contextCache!.avoidedBytes).toBeGreaterThan(0);
    expect(source.readEvents).toHaveBeenCalledTimes(1);
    expect(source.readEvents.mock.calls[0][1]).toEqual({
      afterSeq: 3,
      limit: 1_000,
    });

    events.push(
      contextEvent(4, "model.requested", {
        iteration: 1,
        modelProfileId: "deepseek",
      }, runId),
      contextEvent(5, "model.completed", {
        iteration: 1,
        finishReason: "tool_calls",
      }, runId),
      contextEvent(6, "tool.requested", {
        toolCallId: "30000000-0000-4000-8000-000000000099",
        toolName: "read_file",
        publicArguments: { path: "a.ts" },
        argumentsTruncated: false,
      }, runId),
      contextEvent(7, "tool.result", {
        toolCallId: "30000000-0000-4000-8000-000000000099",
        toolName: "read_file",
        result: { ok: true, summary: "读取完成", output: "a" },
      }, runId),
    );
    vi.mocked(source.readEvents).mockClear();
    const tailed = await provider.buildContext({ ...request(runId), iteration: 2 });
    expect(tailed.contextCache).toMatchObject({
      status: "warm",
      reusedEvents: 3,
      tailEvents: 4,
    });
    expect(source.readEvents.mock.calls[0][1]).toEqual({
      afterSeq: 3,
      limit: 1_000,
    });

    provider.invalidateSession?.(SESSION_ID);
    vi.mocked(source.readEvents).mockClear();
    const invalidated = await provider.buildContext({
      ...request(runId),
      iteration: 2,
    });
    expect(invalidated.contextCache).toMatchObject({
      status: "cold",
      reusedEvents: 0,
      tailEvents: 7,
    });
    expect(source.readEvents.mock.calls[0][1]).toEqual({
      afterSeq: 0,
      limit: 1_000,
    });
  });

  it("invalidates the local context cache when tool capability changes", async () => {
    const source = createMemoryEventSource(activeRunPrefix());
    const provider = createAgentContextProvider({
      eventSource: source,
      modelClient: createFakeModelClient(1_000_000),
    });
    const runId = numberedRunId(1);
    const normal = await provider.buildContext(request(runId));
    const recovery = await provider.buildContext({
      ...request(runId),
      iteration: 2,
      toolCapability: "dependency_recovery",
    });
    expect(normal.contextCache?.status).toBe("cold");
    expect(recovery.contextCache?.status).toBe("invalidated");
    expect(estimateContextTokens(
      recovery.messages,
      DEPENDENCY_RECOVERY_TOOL_DEFINITIONS,
      1_000_000,
    ).estimatedTokens).toBeLessThan(estimateContextTokens(
      recovery.messages,
      LOCAL_TOOL_DEFINITIONS,
      1_000_000,
    ).estimatedTokens);
  });

  it("invalidates a warm entry and cold rebuilds after a repaired tail", async () => {
    const events = [...activeRunPrefix()];
    const source = createMemoryEventSource(events);
    const provider = createAgentContextProvider({
      eventSource: source,
      modelClient: createFakeModelClient(1_000_000),
    });
    const runId = numberedRunId(1);
    await provider.buildContext(request(runId));

    const normalRead = source.readEvents.getMockImplementation()!;
    source.readEvents.mockImplementationOnce(async () => ({
      events: [],
      lastSeq: 3,
      hasMore: false,
      recovery: {
        tailRepaired: true,
        discardedTailBytes: 12,
        lastStableSeq: 3,
        openRunIds: [runId],
      },
    })).mockImplementation(normalRead);

    const rebuilt = await provider.buildContext(request(runId));
    expect(rebuilt.contextCache).toMatchObject({
      status: "invalidated",
      reusedEvents: 0,
      tailEvents: 3,
      avoidedBytes: 0,
    });
    expect(source.readEvents.mock.calls.at(-2)?.[1]).toEqual({
      afterSeq: 3,
      limit: 1_000,
    });
    expect(source.readEvents.mock.calls.at(-1)?.[1]).toEqual({
      afterSeq: 0,
      limit: 1_000,
    });
  });

  it("continues through model and timeout-fallback compactions before a normal stop", async () => {
    const events = [...manyCompletedRuns(20, 4_000)];
    let summaryRequest = 0;
    const complete = vi.fn(async () => {
      summaryRequest += 1;
      if (summaryRequest === 1) return {
        content: "较早任务已经完成并验证",
        toolCalls: [],
        finishReason: "stop" as const,
        continuation: Object.freeze({}) as never,
      };
      throw new ModelLayerError({
        code: "MODEL_TIMEOUT",
        message: "summary timeout",
        recoverable: true,
      });
    });
    const model = createFakeModelClient(50_000, complete);
    const provider = createAgentContextProvider({
      eventSource: createMemoryEventSource(events),
      modelClient: model,
    });
    const runId = numberedRunId(21);

    const first = await provider.buildContext(request(runId));
    expect(first.compaction).toMatchObject({ strategy: "model" });
    let seq = events.at(-1)!.seq + 1;
    const firstCompaction = first.compaction!;
    events.push(contextEvent(seq++, "context.compacted", {
      throughSeq: firstCompaction.throughSeq,
      summary: firstCompaction.summary,
      retainedRange: firstCompaction.retainedRange,
      strategy: "model",
    }, runId));

    for (let iteration = 1; iteration <= 12; iteration += 1) {
      const toolCallId = `30000000-0000-4000-8000-${String(iteration).padStart(12, "0")}`;
      events.push(
        contextEvent(seq++, "model.requested", {
          iteration,
          modelProfileId: "deepseek",
        }, runId),
        contextEvent(seq++, "model.completed", {
          iteration,
          finishReason: "tool_calls",
        }, runId),
        contextEvent(seq++, "tool.requested", {
          toolCallId,
          toolName: "read_file",
          publicArguments: { path: `fixture-${iteration}.txt` },
          argumentsTruncated: false,
        }, runId),
        contextEvent(seq++, "tool.started", {
          toolCallId,
          toolName: "read_file",
        }, runId),
        contextEvent(seq++, "tool.result", {
          toolCallId,
          toolName: "read_file",
          result: {
            ok: true,
            summary: "读取完成",
            output: `${iteration}:`.padEnd(4_000, "x"),
          },
        }, runId),
      );
    }

    const second = await provider.buildContext({ ...request(runId), iteration: 13 });
    expect(second.compaction).toMatchObject({
      strategy: "deterministic_fallback",
      fallbackReason: "model_timeout",
    });
    const secondCompaction = second.compaction!;
    events.push(contextEvent(seq++, "context.compacted", {
      throughSeq: secondCompaction.throughSeq,
      summary: secondCompaction.summary,
      retainedRange: secondCompaction.retainedRange,
      strategy: "deterministic_fallback",
      fallbackReason: "model_timeout",
    }, runId));
    events.push(
      contextEvent(seq++, "model.requested", {
        iteration: 13,
        modelProfileId: "deepseek",
      }, runId),
      contextEvent(seq++, "model.completed", {
        iteration: 13,
        finishReason: "stop",
      }, runId),
      contextEvent(seq++, "assistant.message", {
        kind: "final",
        content: "任务已正常完成",
      }, runId),
      contextEvent(seq++, "run.completed", {
        iterations: 13,
        durationMs: 1,
      }, runId),
    );

    const history = projectContextHistory(events);
    expect(history.latestCompaction).toMatchObject({
      strategy: "deterministic_fallback",
      fallbackReason: "model_timeout",
    });
    expect(events.at(-1)?.type).toBe("run.completed");
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("uses the finite reason when projected non-output rounds still exceed budget", async () => {
    const events = manyCompletedRuns(8, 10_000);
    const model = createFakeModelClient(10_000);
    const provider = createAgentContextProvider({
      eventSource: createMemoryEventSource(events),
      modelClient: model,
    });
    await expect(provider.buildContext(request(numberedRunId(9))))
      .rejects.toMatchObject({
        error: {
          code: "CONTEXT_BUDGET_EXCEEDED",
          details: { reason: "projected_recent_rounds_over_budget" },
        },
      });
    expect(vi.mocked(model.complete)).not.toHaveBeenCalled();
  });

  it("falls back after the dedicated summary timeout and preserves parent cancellation", async () => {
    vi.useFakeTimers();
    const events = manyCompletedRuns(12, 2_500);
    const complete = vi.fn(() => new Promise<never>(() => undefined));
    const model = createFakeModelClient(25_000, complete);
    const provider = createAgentContextProvider({
      eventSource: createMemoryEventSource(events),
      modelClient: model,
    });
    const pending = provider.buildContext(request(numberedRunId(13)));
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(pending).resolves.toMatchObject({
      compaction: {
        strategy: "deterministic_fallback",
        fallbackReason: "model_timeout",
      },
    });
    expect(complete).toHaveBeenCalledTimes(1);

    const controller = new AbortController();
    const cancelled = provider.buildContext(request(numberedRunId(13), controller.signal));
    controller.abort("用户停止");
    await expect(cancelled).rejects.toMatchObject({
      error: { code: "CONTEXT_ABORTED" },
    });
  });

  it("does not mutate a durable JSONL log during a direct build", async () => {
    const fixture = await createTempContextStore();
    try {
      const created = await fixture.store.createSession({
        title: "只读 provider",
        workspacePath: fixture.workspacePath,
        modelProfileId: "deepseek",
      });
      const runId = numberedRunId(1);
      await fixture.store.appendEvent(created.metadata.id, {
        type: "run.started",
        runId,
        data: {
          promptPreview: "检查项目",
          limits: { maxIterations: 30, maxDurationMs: 600_000 },
        },
      });
      await fixture.store.appendEvent(created.metadata.id, {
        type: "user.message",
        runId,
        data: { content: "检查项目" },
      });
      const eventPath = path.join(
        fixture.root,
        "data",
        "sessions",
        created.metadata.id,
        "events.jsonl",
      );
      const before = await readFile(eventPath);
      const provider = createAgentContextProvider({
        eventSource: fixture.store,
        modelClient: createFakeModelClient(1_000_000),
      });

      await provider.buildContext({
        sessionId: created.metadata.id,
        runId,
        iteration: 1,
        signal: new AbortController().signal,
        toolCapability: "normal",
      });

      expect(await readFile(eventPath)).toEqual(before);
      expect((await fixture.store.readEvents(created.metadata.id)).events).toHaveLength(3);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects unavailable profiles and pre-aborted requests", async () => {
    const source = createMemoryEventSource(activeRunPrefix());
    const missingModel = createFakeModelClient(1_000_000);
    missingModel.getConfigSnapshot = () => ({ profiles: [], issues: [] });
    const provider = createAgentContextProvider({ eventSource: source, modelClient: missingModel });
    await expect(provider.buildContext(request(numberedRunId(1))))
      .rejects.toMatchObject({ error: { code: "CONTEXT_MODEL_UNAVAILABLE" } });

    const controller = new AbortController();
    controller.abort();
    const freshSource = createMemoryEventSource(activeRunPrefix());
    const abortedProvider = createAgentContextProvider({
      eventSource: freshSource,
      modelClient: createFakeModelClient(1_000_000),
    });
    await expect(abortedProvider.buildContext(request(numberedRunId(1), controller.signal)))
      .rejects.toMatchObject({ error: { code: "CONTEXT_ABORTED" } });
    expect(freshSource.getSessionMetadata).not.toHaveBeenCalled();
  });

  it("fails closed when pagination makes no progress", async () => {
    const source = createMemoryEventSource(activeRunPrefix());
    source.readEvents = vi.fn(async () => ({
      events: [],
      lastSeq: 3,
      hasMore: true,
      recovery: {
        tailRepaired: false,
        discardedTailBytes: 0,
        lastStableSeq: 3,
        openRunIds: [],
      },
    }));
    const provider = createAgentContextProvider({
      eventSource: source,
      modelClient: createFakeModelClient(1_000_000),
    });
    await expect(provider.buildContext(request(numberedRunId(1))))
      .rejects.toMatchObject({ error: { code: "CONTEXT_HISTORY_INVALID" } });
  });

  it("validates factory capabilities without serializing them", () => {
    expect(() => createAgentContextProvider({} as never)).toThrow(ContextLayerError);
  });
});
