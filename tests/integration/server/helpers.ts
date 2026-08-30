import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createAgentRuntime } from "@/lib/agent";
import { createAgentContextProvider } from "@/lib/context";
import type { DurableAgentEvent, JsonObject } from "@/lib/domain";
import type {
  ModelClient,
  ModelCompletion,
  ModelContinuation,
  ModelRegistrySnapshot,
  ModelRequest,
} from "@/lib/model";
import { createJsonlEventStore, type JsonlEventStore } from "@/lib/storage";
import { createWorkspaceHandle } from "@/lib/workspace";
import { createServerApplication } from "@/lib/server/application";
import { createWorkspacePickerService } from "@/lib/server/workspace-picker";
import type { ServerApplication } from "@/lib/server";

const APPLICATION_KEY = Symbol.for("secode.server.application.v1");
const registeredRoots = new Set<string>();
let toolCallCounter = 100;

export interface ServerFixture {
  root: string;
  dataDir: string;
  workspace: string;
  store: JsonlEventStore;
  model: QueueFakeModel;
  application: ServerApplication;
}

export function modelContinuation(): ModelContinuation {
  return Object.freeze({}) as ModelContinuation;
}

export function textCompletion(content = "任务完成"): ModelCompletion {
  return { content, toolCalls: [], finishReason: "stop", continuation: modelContinuation() };
}

export function toolCompletion(
  name: string,
  arguments_: JsonObject,
): ModelCompletion {
  toolCallCounter += 1;
  return {
    content: null,
    toolCalls: [{
      ok: true,
      call: {
        id: `00000000-0000-4000-8000-${String(toolCallCounter).padStart(12, "0")}`,
        name,
        arguments: arguments_,
      },
    }],
    finishReason: "tool_calls",
    continuation: modelContinuation(),
  };
}

export class QueueFakeModel implements ModelClient {
  readonly requests: ModelRequest[] = [];
  readonly queue: Array<ModelCompletion | Error | ((request: ModelRequest) => Promise<ModelCompletion>)>;
  readonly snapshot: ModelRegistrySnapshot;

  constructor(queue: Array<ModelCompletion | Error | ((request: ModelRequest) => Promise<ModelCompletion>)> = []) {
    this.queue = [...queue];
    this.snapshot = {
      profiles: [{
        id: "test-model",
        label: "Test Model",
        provider: "generic",
        baseUrl: "http://localhost:3001",
        model: "fake",
        contextWindow: 128_000,
        supportsThinking: true,
        configured: true,
      }],
      issues: [],
    };
  }

  getConfigSnapshot(): ModelRegistrySnapshot {
    return this.snapshot;
  }

  async complete(request: ModelRequest): Promise<ModelCompletion> {
    this.requests.push(request);
    const next = this.queue.shift();
    if (next === undefined) throw new Error("fake model queue exhausted");
    if (next instanceof Error) throw next;
    const completion = typeof next === "function" ? await next(request) : next;
    if (completion.content !== null && request.onTextDelta !== undefined) {
      await request.onTextDelta(completion.content);
    }
    return completion;
  }
}

export async function createServerFixture(
  completions: QueueFakeModel["queue"] = [],
): Promise<ServerFixture> {
  const root = await mkdtemp(path.join(tmpdir(), "secode-server-"));
  registeredRoots.add(root);
  const dataDir = path.join(root, "data");
  const workspaceInput = path.join(root, "workspace");
  await mkdir(workspaceInput);
  const workspace = await realpath(workspaceInput);
  const store = createJsonlEventStore({ dataDir });
  await store.initialize();
  const model = new QueueFakeModel(completions);
  const runtime = createAgentRuntime({
    eventStore: store,
    modelClient: model,
    contextProvider: createAgentContextProvider({ eventSource: store, modelClient: model }),
  });
  const application = createServerApplication({
    store,
    modelClient: model,
    runtime,
    createWorkspace: createWorkspaceHandle,
    workspacePicker: createWorkspacePickerService({
      env: { SECODE_WORKSPACE_PICKER_ROOT: workspace },
    }),
  });
  (globalThis as Record<symbol, unknown>)[APPLICATION_KEY] = Promise.resolve(application);
  return { root, dataDir, workspace, store, model, application };
}

export async function createSlugFixture(completions: QueueFakeModel["queue"] = []) {
  const fixture = await createServerFixture(completions);
  await mkdir(path.join(fixture.workspace, "src"));
  await mkdir(path.join(fixture.workspace, "tests"));
  const source = 'export function slugify(value) {\n  return value.toLowerCase().replace(" ", "-");\n}\n';
  await writeFile(path.join(fixture.workspace, "src/slug.mjs"), source, "utf8");
  await writeFile(path.join(fixture.workspace, "README.md"), "trim, collapse whitespace, lowercase\n", "utf8");
  await writeFile(path.join(fixture.workspace, "package.json"), JSON.stringify({ name: "server-fixture", type: "module", scripts: { test: "node --test tests/*.test.mjs" } }, null, 2) + "\n", "utf8");
  await writeFile(path.join(fixture.workspace, "tests/slug.test.mjs"), `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { slugify } from "../src/slug.mjs";\ntest("simple", () => assert.equal(slugify("Hello World"), "hello-world"));\ntest("spaces", () => assert.equal(slugify("  Hello   World  "), "hello-world"));\ntest("tabs", () => assert.equal(slugify("Hello\\tWorld"), "hello-world"));\ntest("existing", () => assert.equal(slugify("hello-world"), "hello-world"));\n`, "utf8");
  return { ...fixture, source };
}

export function jsonRequest(pathname: string, method: string, body?: unknown, headers: HeadersInit = {}): Request {
  return new Request(`http://localhost${pathname}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function parseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

export async function cleanupServerFixtures(): Promise<void> {
  delete (globalThis as Record<symbol, unknown>)[APPLICATION_KEY];
  const roots = [...registeredRoots];
  registeredRoots.clear();
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
}

export function assertNoSecrets(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const forbidden of ["apiKeyEnv", "baseUrl", "endpoint", "Authorization", "Bearer fake-secret", "stack", "cause", "reasoning"]) {
    if (serialized.includes(forbidden)) throw new Error(`secret or internal field leaked: ${forbidden}`);
  }
}

export async function waitForTerminalEvent(
  store: JsonlEventStore,
  sessionId: string,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page = await store.readEvents(sessionId, { afterSeq: 0, limit: 1_000 });
    if (page.events.some((event) =>
      event.type === "run.completed" ||
      event.type === "run.failed" ||
      event.type === "run.cancelled" ||
      event.type === "run.interrupted"
    )) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("terminal event was not persisted before cleanup");
}

export async function waitForEventType<TType extends DurableAgentEvent["type"]>(
  store: JsonlEventStore,
  sessionId: string,
  type: TType,
  timeoutMs = 2_000,
): Promise<Extract<DurableAgentEvent, { type: TType }>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page = await store.readEvents(sessionId, { afterSeq: 0, limit: 1_000 });
    const event = page.events.find((candidate) => candidate.type === type);
    if (event !== undefined) {
      return event as Extract<DurableAgentEvent, { type: TType }>;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${type} was not persisted before timeout`);
}
