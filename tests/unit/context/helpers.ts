import {
  DurableAgentEventSchema,
  type DurableAgentEvent,
  type JsonObject,
} from "@/lib/domain";
import type { ModelClient, ModelCompletion } from "@/lib/model";
import type { ContextEventSource } from "@/lib/context/types";
import { createJsonlEventStore, type JsonlEventStore } from "@/lib/storage";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { vi } from "vitest";

export const SESSION_ID = "10000000-0000-4000-8000-000000000001";
export const RUN_ID = "20000000-0000-4000-8000-000000000001";
export const SECOND_RUN_ID = "20000000-0000-4000-8000-000000000002";
export const TOOL_CALL_ID = "30000000-0000-4000-8000-000000000001";
export const SECOND_TOOL_CALL_ID = "30000000-0000-4000-8000-000000000002";
export const APPROVAL_ID = "40000000-0000-4000-8000-000000000001";

export function contextEvent(
  seq: number,
  type: DurableAgentEvent["type"],
  data: JsonObject,
  runId: string | null = RUN_ID,
): DurableAgentEvent {
  return DurableAgentEventSchema.parse({
    protocolVersion: 1,
    durable: true,
    id: `50000000-0000-4000-8000-${seq.toString().padStart(12, "0")}`,
    seq,
    sessionId: SESSION_ID,
    ...(runId === null ? {} : { runId }),
    type,
    createdAt: `2026-08-28T00:00:${String(seq % 60).padStart(2, "0")}.000Z`,
    data,
  });
}

export function sessionCreated(seq = 1): DurableAgentEvent {
  return contextEvent(seq, "session.created", {
    session: {
      id: SESSION_ID,
      title: "测试 Session",
      workspacePath: "/tmp/secode-context-workspace",
      modelProfileId: "deepseek",
      status: "idle",
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
    },
  }, null);
}

export function runStarted(seq: number, runId = RUN_ID): DurableAgentEvent {
  return contextEvent(seq, "run.started", {
    promptPreview: "任务",
    limits: { maxIterations: 30, maxDurationMs: 600_000 },
  }, runId);
}

export function activeRunPrefix(
  goal = "修复测试",
  runId = RUN_ID,
): DurableAgentEvent[] {
  return [
    sessionCreated(),
    runStarted(2, runId),
    contextEvent(3, "user.message", { content: goal }, runId),
  ];
}

export function numberedRunId(index: number): string {
  return `20000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

export function manyCompletedRuns(
  roundCount: number,
  contentCharacters = 32,
): DurableAgentEvent[] {
  const events: DurableAgentEvent[] = [sessionCreated()];
  let seq = 2;
  for (let index = 1; index <= roundCount; index += 1) {
    const runId = numberedRunId(index);
    events.push(
      runStarted(seq++, runId),
      contextEvent(seq++, "user.message", { content: `任务 ${index}` }, runId),
      contextEvent(seq++, "model.requested", {
        iteration: 1,
        modelProfileId: "deepseek",
      }, runId),
      contextEvent(seq++, "model.completed", {
        iteration: 1,
        finishReason: "stop",
      }, runId),
      contextEvent(seq++, "assistant.message", {
        kind: "final",
        content: `${index}:`.padEnd(contentCharacters, "x"),
      }, runId),
      contextEvent(seq++, "run.completed", {
        iterations: 1,
        durationMs: 1,
      }, runId),
    );
  }
  const activeId = numberedRunId(roundCount + 1);
  events.push(
    runStarted(seq++, activeId),
    contextEvent(seq, "user.message", { content: "当前任务" }, activeId),
  );
  return events;
}

export function createMemoryEventSource(
  events: readonly DurableAgentEvent[],
  maximumPageSize = Number.POSITIVE_INFINITY,
): ContextEventSource & {
  getSessionMetadata: ReturnType<typeof vi.fn>;
  readEvents: ReturnType<typeof vi.fn>;
} {
  const metadata = {
    storageVersion: 1 as const,
    id: SESSION_ID,
    title: "测试 Session",
    workspacePath: "/tmp/secode-context-workspace",
    modelProfileId: "deepseek",
    createdAt: "2026-08-28T00:00:00.000Z",
  };
  return {
    getSessionMetadata: vi.fn(async () => metadata),
    readEvents: vi.fn(async (_sessionId: string, query?: { afterSeq?: number; limit?: number }) => {
      const afterSeq = query?.afterSeq ?? 0;
      const requestedLimit = query?.limit ?? 500;
      const limit = Math.min(requestedLimit, maximumPageSize);
      const remaining = events.filter((event) => event.seq > afterSeq);
      const pageEvents = remaining.slice(0, limit);
      return {
        events: pageEvents,
        lastSeq: events.at(-1)?.seq ?? 0,
        hasMore: remaining.length > pageEvents.length,
        recovery: {
          tailRepaired: false,
          discardedTailBytes: 0,
          lastStableSeq: events.at(-1)?.seq ?? 0,
          openRunIds: events.at(-1)?.runId === undefined
            ? []
            : [events.at(-1)!.runId!],
        },
      };
    }),
  };
}

export function modelCompletion(content: string): ModelCompletion {
  return {
    content,
    toolCalls: [],
    finishReason: "stop",
    continuation: Object.freeze({}) as ModelCompletion["continuation"],
  };
}

export function createFakeModelClient(
  contextWindow: number,
  complete: ModelClient["complete"] = vi.fn(async () => modelCompletion("简短摘要")),
): ModelClient {
  return {
    complete,
    getConfigSnapshot: () => ({
      profiles: [{
        id: "deepseek",
        label: "DeepSeek",
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-test",
        contextWindow,
        supportsThinking: true,
        configured: true,
      }],
      issues: [],
    }),
  };
}

export async function createTempContextStore(): Promise<{
  root: string;
  workspacePath: string;
  store: JsonlEventStore;
  cleanup(): Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "secode-context-"));
  const workspacePath = path.join(root, "workspace");
  const dataDir = path.join(root, "data");
  await mkdir(workspacePath, { recursive: true });
  const store = createJsonlEventStore({ dataDir });
  await store.initialize();
  return {
    root,
    workspacePath,
    store,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}
