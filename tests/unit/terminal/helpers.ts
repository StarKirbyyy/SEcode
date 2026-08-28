import type { TerminalFrame, TerminalIO } from "@/lib/terminal/types";
import { AgentEventSchema, type AgentEvent } from "@/lib/domain";

export const SESSION_ID = "00000000-0000-4000-8000-000000000001";
export const RUN_ID = "00000000-0000-4000-8000-000000000002";
export const EVENT_ID = "00000000-0000-4000-8000-000000000003";

export function agentEvent(
  type: AgentEvent["type"],
  data: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): AgentEvent {
  const live = type === "assistant.delta";
  return AgentEventSchema.parse({
    protocolVersion: 1,
    durable: !live,
    id: EVENT_ID,
    ...(live ? { streamSeq: 1 } : { seq: 1 }),
    sessionId: SESSION_ID,
    ...(type === "session.created" ? {} : { runId: RUN_ID }),
    type,
    createdAt: "2026-08-28T00:00:00.000Z",
    data,
    ...overrides,
  });
}

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export class FakeTerminalIO implements TerminalIO {
  readonly frames: TerminalFrame[] = [];
  readonly input: AsyncIterable<string>;
  readonly interactive: boolean;
  closeCount = 0;
  private readonly lines: string[];
  private readonly interrupts = new Set<() => void>();
  private writeFailure?: Error;

  constructor(lines: readonly string[] = [], interactive = true) {
    this.lines = [...lines];
    this.interactive = interactive;
    this.input = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          const line = this.lines.shift();
          return line === undefined ? { done: true, value: undefined } : { done: false, value: line };
        },
      }),
    };
  }

  failWrites(error = new Error("fake write failure")): void {
    this.writeFailure = error;
  }

  async write(frame: TerminalFrame): Promise<void> {
    if (this.writeFailure) throw this.writeFailure;
    this.frames.push(frame);
  }

  onInterrupt(listener: () => void): () => void {
    this.interrupts.add(listener);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.interrupts.delete(listener);
    };
  }

  interrupt(): void {
    for (const listener of [...this.interrupts]) listener();
  }

  async close(): Promise<void> {
    this.closeCount += 1;
    this.interrupts.clear();
  }
}
