import { randomUUID } from "node:crypto";

import { createJsonlEventStore, type DurableEventDraft } from "@/lib/storage";

import type { RuntimeManifest } from "./runtime-manifest";

export type SyntheticRunEnding =
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "open";

export interface SyntheticHistorySession {
  readonly sessionId: string;
  readonly runId: string;
  readonly tailMarker: string;
  readonly totalEvents: number;
  readonly openRunIds: readonly string[];
}

async function appendCompletedFixtureRun(
  store: ReturnType<typeof createJsonlEventStore>,
  sessionId: string,
  ordinal: number,
) {
  const runId = randomUUID();
  await store.appendEvent(sessionId, {
    type: "run.started",
    runId,
    data: {
      promptPreview: `合成已完成历史 ${ordinal}`,
      limits: { maxIterations: 1, maxToolCalls: 1, maxDurationMs: 60_000 },
    },
  });
  await store.appendEvent(sessionId, {
    type: "user.message",
    runId,
    data: { content: `合成已完成请求 ${ordinal}` },
  });
  await store.appendEvent(sessionId, {
    type: "model.requested",
    runId,
    data: { iteration: 1, modelProfileId: "generic" },
  });
  await store.appendEvent(sessionId, {
    type: "model.completed",
    runId,
    data: { iteration: 1, finishReason: "stop" },
  });
  await store.appendEvent(sessionId, {
    type: "assistant.message",
    runId,
    data: { content: `合成已完成响应 ${ordinal}`, kind: "final" },
  });
  await store.appendEvent(sessionId, {
    type: "run.completed",
    runId,
    data: { iterations: 1, durationMs: 10 },
  });
}

function terminalDraft(
  ending: Exclude<SyntheticRunEnding, "open">,
  runId: string,
  stableSeqBeforeTerminal: number,
): DurableEventDraft {
  switch (ending) {
    case "completed":
      return { type: "run.completed", runId, data: { iterations: 1, durationMs: 25 } };
    case "failed":
      return {
        type: "run.failed",
        runId,
        data: {
          error: {
            code: "SYNTHETIC_HISTORY_FAILED",
            message: "合成长历史失败终态",
            recoverable: true,
          },
          iterations: 1,
        },
      };
    case "cancelled":
      return { type: "run.cancelled", runId, data: { reason: "合成长历史已取消", iterations: 1 } };
    case "interrupted":
      return {
        type: "run.interrupted",
        runId,
        data: { reason: "合成长历史已中断", lastStableSeq: stableSeqBeforeTerminal },
      };
  }
}

export async function createSyntheticHistorySession(
  runtime: RuntimeManifest,
  options: {
    readonly totalEvents: number;
    readonly ending: SyntheticRunEnding;
    readonly title?: string;
  },
): Promise<SyntheticHistorySession> {
  if (options.totalEvents < 7) throw new Error("synthetic history requires at least seven events");
  const store = createJsonlEventStore({ dataDir: runtime.dataDir });
  await store.initialize();
  const created = await store.createSession({
    title: options.title ?? `history-${options.ending}-${options.totalEvents}`,
    workspacePath: runtime.workspace,
    modelProfileId: "generic",
  });
  const sessionId = created.session.id;
  const runId = randomUUID();
  const tailMarker = `合成历史尾部 ${options.ending} ${options.totalEvents}`;
  const terminalCount = options.ending === "open" ? 0 : 1;
  const finalRunBaseEvents = 5 + terminalCount;
  const precedingBudget = options.totalEvents - 1 - finalRunBaseEvents;
  const completedRuns = Math.floor(precedingBudget / 6);
  const compactionCount = precedingBudget % 6;
  for (let index = 1; index <= completedRuns; index += 1) {
    await appendCompletedFixtureRun(store, sessionId, index);
  }
  await store.appendEvent(sessionId, {
    type: "run.started",
    runId,
    data: {
      promptPreview: "合成长历史分页回归",
      limits: { maxIterations: 100, maxToolCalls: 100, maxDurationMs: 60_000 },
    },
  });
  await store.appendEvent(sessionId, {
    type: "user.message",
    runId,
    data: { content: "合成长历史分页回归" },
  });
  const precedingTailSeq = 1 + completedRuns * 6;
  for (let index = 1; index <= compactionCount; index += 1) {
    await store.appendEvent(sessionId, {
      type: "context.compacted",
      runId,
      data: {
        throughSeq: precedingTailSeq + index - 1,
        summary: `合成尾部压缩摘要 ${index}`,
        retainedRange: {
          fromSeq: precedingTailSeq + index,
          toSeq: precedingTailSeq + index + 1,
        },
      },
    });
  }
  await store.appendEvent(sessionId, {
    type: "model.requested",
    runId,
    data: { iteration: 1, modelProfileId: "generic" },
  });
  await store.appendEvent(sessionId, {
    type: "model.completed",
    runId,
    data: { iteration: 1, finishReason: "stop" },
  });
  await store.appendEvent(sessionId, {
    type: "assistant.message",
    runId,
    data: { content: tailMarker, kind: "final" },
  });
  if (options.ending !== "open") {
    await store.appendEvent(
      sessionId,
      terminalDraft(options.ending, runId, options.totalEvents - 1),
    );
  }
  const inspection = await store.inspectSession(sessionId);
  if (inspection.lastSeq !== options.totalEvents) {
    throw new Error("synthetic history event count mismatch");
  }
  return {
    sessionId,
    runId,
    tailMarker,
    totalEvents: options.totalEvents,
    openRunIds: inspection.recovery.openRunIds,
  };
}
