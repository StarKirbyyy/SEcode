import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createAgentContextProvider } from "@/lib/context/provider";
import { ContextLayerError } from "@/lib/context/errors";

import {
  SESSION_ID,
  activeRunPrefix,
  createFakeModelClient,
  createMemoryEventSource,
  createTempContextStore,
  contextEvent,
  manyCompletedRuns,
  numberedRunId,
} from "./helpers";

function request(runId: string, signal = new AbortController().signal) {
  return { sessionId: SESSION_ID, runId, iteration: 1, signal };
}

describe("event-backed context provider", () => {
  it("builds a first-turn context without calling the summary model", async () => {
    const source = createMemoryEventSource(activeRunPrefix());
    const model = createFakeModelClient(1_000_000);
    const provider = createAgentContextProvider({ eventSource: source, modelClient: model });
    const result = await provider.buildContext(request(numberedRunId(1)));

    expect(result.compaction).toBeUndefined();
    expect(result.messages.map((message) => message.role)).toEqual([
      "system", "system", "user",
    ]);
    expect(result.messages.at(-1)).toEqual({ role: "user", content: "修复测试" });
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

  it("creates one compaction and reuses its durable summary", async () => {
    const events = [...manyCompletedRuns(12, 2_500)];
    const source = createMemoryEventSource(events);
    const model = createFakeModelClient(22_000);
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
    expect(afterRestart).toEqual(second);
    expect(vi.mocked(model.complete)).not.toHaveBeenCalled();
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
