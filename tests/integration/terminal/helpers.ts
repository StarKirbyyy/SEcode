import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { JsonObject } from "@/lib/domain";
import type { ModelClient, ModelCompletion, ModelContinuation, ModelRegistrySnapshot, ModelRequest } from "@/lib/model";
import type { TerminalFrame, TerminalIO } from "@/lib/terminal/types";

export const TOOL_CALL_ID = "00000000-0000-4000-8000-000000000501";

export function continuation(): ModelContinuation {
  return Object.freeze({}) as unknown as ModelContinuation;
}

export function textCompletion(content: string): ModelCompletion {
  return { content, toolCalls: [], finishReason: "stop", continuation: continuation() };
}

export function toolCompletion(
  name: string,
  args: JsonObject,
  id = TOOL_CALL_ID,
): ModelCompletion {
  return {
    content: null,
    toolCalls: [{ ok: true, call: { id, name, arguments: args } }],
    finishReason: "tool_calls",
    continuation: continuation(),
  };
}

export class QueueFakeModel implements ModelClient {
  readonly requests: ModelRequest[] = [];
  readonly snapshot: ModelRegistrySnapshot = {
    profiles: [{ id: "test-model", label: "Test Model", provider: "generic", baseUrl: "http://localhost:3001", model: "test", contextWindow: 128_000, supportsThinking: false, configured: true }],
    issues: [],
  };

  constructor(readonly queue: Array<ModelCompletion | ((request: ModelRequest) => Promise<ModelCompletion>)>) {}

  getConfigSnapshot(): ModelRegistrySnapshot { return this.snapshot; }

  async complete(request: ModelRequest): Promise<ModelCompletion> {
    this.requests.push(request);
    const next = this.queue.shift();
    if (!next) throw new Error("fake model queue exhausted");
    const completion = typeof next === "function" ? await next(request) : next;
    if (completion.content && request.onTextDelta) await request.onTextDelta(completion.content);
    return completion;
  }
}

export class ControlledTerminalIO implements TerminalIO {
  readonly interactive = true;
  readonly frames: TerminalFrame[] = [];
  readonly input: AsyncIterable<string>;
  private queued: string[] = [];
  private waiters: Array<(value: IteratorResult<string>) => void> = [];
  private interrupts = new Set<() => void>();
  private ended = false;

  constructor() {
    this.input = { [Symbol.asyncIterator]: () => ({ next: () => this.next() }) };
  }

  private next(): Promise<IteratorResult<string>> {
    const line = this.queued.shift();
    if (line !== undefined) return Promise.resolve({ done: false, value: line });
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  push(line: string): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value: line });
    else this.queued.push(line);
  }

  end(): void {
    this.ended = true;
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  interrupt(): void { for (const listener of [...this.interrupts]) listener(); }
  async write(frame: TerminalFrame): Promise<void> { this.frames.push(frame); }
  onInterrupt(listener: () => void): () => void {
    this.interrupts.add(listener);
    return () => { this.interrupts.delete(listener); };
  }
  async close(): Promise<void> { this.end(); this.interrupts.clear(); }
  text(): string { return this.frames.map((frame) => frame.text).join("\n"); }
}

export async function createTerminalFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "secode-terminal-integration-"));
  const dataDir = path.join(root, "data");
  const workspace = path.join(root, "workspace");
  await mkdir(workspace);
  await writeFile(path.join(workspace, "hello.txt"), "hello terminal\n", "utf8");
  return { root, dataDir, workspace, cleanup: () => rm(root, { recursive: true, force: true }) };
}
