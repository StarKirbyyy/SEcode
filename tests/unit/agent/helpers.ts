import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DurableAgentEventSchema,
  type DurableAgentEvent,
  type JsonObject,
} from "@/lib/domain";
import type {
  ModelClient,
  ModelCompletion,
  ModelContinuation,
  ModelRegistrySnapshot,
  ModelRequest,
} from "@/lib/model";
import { createJsonlEventStore, type JsonlEventStore } from "@/lib/storage";
import type { AgentContextProvider } from "@/lib/agent/types";

export const SESSION_ID = "00000000-0000-4000-8000-000000000101";
export const RUN_ID = "00000000-0000-4000-8000-000000000102";
export const TOOL_CALL_ID = "00000000-0000-4000-8000-000000000103";
export const APPROVAL_ID = "00000000-0000-4000-8000-000000000104";
export const EVENT_ID = "00000000-0000-4000-8000-000000000105";
export const CREATED_AT = "2026-08-27T00:00:00.000Z";

export function createDurableEvent(
  seq: number,
  type: DurableAgentEvent["type"],
  data: JsonObject,
  options: { runId?: string; sessionId?: string } = {},
): DurableAgentEvent {
  return DurableAgentEventSchema.parse({
    protocolVersion: 1,
    durable: true,
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    seq,
    sessionId: options.sessionId ?? SESSION_ID,
    ...(type === "session.created"
      ? {}
      : { runId: options.runId ?? RUN_ID }),
    type,
    createdAt: CREATED_AT,
    data,
  });
}

export function createSessionCreatedEvent(seq = 1): DurableAgentEvent {
  return createDurableEvent(seq, "session.created", {
    session: {
      id: SESSION_ID,
      title: "Agent test",
      workspacePath: "/tmp/secode-agent-test",
      modelProfileId: "deepseek",
      status: "idle",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  });
}

export function createRunStartedEvent(
  seq = 2,
  planningEnabled?: boolean,
): DurableAgentEvent {
  return createDurableEvent(seq, "run.started", {
    promptPreview: "修复测试",
    limits: { maxIterations: 30, maxDurationMs: 600_000 },
    ...(planningEnabled === undefined ? {} : { planningEnabled }),
  });
}

const temporaryDirectories = new Set<string>();

export async function createAgentTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "secode-agent-test-"));
  temporaryDirectories.add(directory);
  return directory;
}

export async function removeAgentTemporaryDirectories(): Promise<void> {
  const directories = [...temporaryDirectories];
  temporaryDirectories.clear();
  await Promise.all(
    directories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
}

export interface AgentFixture {
  root: string;
  dataDir: string;
  workspace: string;
  store: JsonlEventStore;
}

export async function createAgentFixture(
  modelProfileId = "test-model",
): Promise<AgentFixture> {
  const root = await createAgentTemporaryDirectory();
  const dataDir = path.join(root, "data");
  const workspace = path.join(root, "workspace");
  await mkdir(workspace);
  const store = createJsonlEventStore({ dataDir });
  await store.initialize();
  await store.createSession({
    title: "Agent test",
    workspacePath: workspace,
    modelProfileId,
  });
  return { root, dataDir, workspace, store };
}

export function createModelContinuation(): ModelContinuation {
  return Object.freeze({}) as unknown as ModelContinuation;
}

export function createTextCompletion(content = "任务已完成"): ModelCompletion {
  return {
    content,
    toolCalls: [],
    finishReason: "stop",
    continuation: createModelContinuation(),
  };
}

export function createToolCompletion(
  calls: ModelCompletion["toolCalls"],
  content: string | null = null,
): ModelCompletion {
  return {
    content,
    toolCalls: calls,
    finishReason: "tool_calls",
    continuation: createModelContinuation(),
  };
}

export class QueueModelClient implements ModelClient {
  readonly requests: ModelRequest[] = [];
  readonly completions: Array<
    ModelCompletion | Error | ((request: ModelRequest) => Promise<ModelCompletion>)
  >;
  readonly snapshot: ModelRegistrySnapshot;

  constructor(
    completions: Array<
      ModelCompletion | Error | ((request: ModelRequest) => Promise<ModelCompletion>)
    >,
    configured = true,
  ) {
    this.completions = [...completions];
    this.snapshot = {
      profiles: [
        {
          id: "test-model",
          label: "Test Model",
          provider: "generic",
          baseUrl: "http://localhost:3001",
          model: "test",
          contextWindow: 128_000,
          supportsThinking: true,
          configured,
        },
      ],
      issues: [],
    };
  }

  getConfigSnapshot(): ModelRegistrySnapshot {
    return this.snapshot;
  }

  async complete(request: ModelRequest): Promise<ModelCompletion> {
    this.requests.push(request);
    const next = this.completions.shift();
    if (next === undefined) throw new Error("fake model queue exhausted");
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next(request);
    if (next.content !== null && request.onTextDelta !== undefined) {
      await request.onTextDelta(next.content);
    }
    return next;
  }
}

export function createStaticContextProvider(
  content = "task",
): AgentContextProvider {
  return {
    async buildContext() {
      return { messages: [{ role: "user", content }] };
    },
  };
}

export async function readAllAgentEvents(store: JsonlEventStore) {
  const page = await store.readEvents(SESSION_ID, { afterSeq: 0, limit: 1_000 });
  return page.events;
}
