import { AgentEventSchema, type AgentEvent } from "@/lib/domain";

import { createServerError } from "./errors";
import { MAX_NDJSON_LINE_BYTES, MAX_NDJSON_QUEUE_BYTES } from "./schemas";

const encoder = new TextEncoder();
const DISCONNECT_REASON = "HTTP 事件消费者已断开";

export interface CancellableRunHandle {
  cancel(reason?: string): boolean;
}

export interface NdjsonEventBridge {
  readonly stream: ReadableStream<Uint8Array>;
  publish(event: AgentEvent): Promise<void>;
  close(): Promise<void>;
  fail(error: unknown): void;
  bindRunHandle(handle: CancellableRunHandle): void;
}

interface WaitingProducer {
  chunk: Uint8Array;
  resolve(): void;
  reject(error: unknown): void;
}

interface BridgeLimits {
  maximumLineBytes: number;
  maximumQueueBytes: number;
}

export function createNdjsonEventBridgeWithLimits(
  onCancel: (reason: string) => void = () => undefined,
  limits: BridgeLimits,
): NdjsonEventBridge {
  const waiting: WaitingProducer[] = [];
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let state: "open" | "closing" | "closed" | "failed" | "cancelled" = "open";
  let terminalError: unknown;
  let runHandle: CancellableRunHandle | undefined;
  let cancellationNotified = false;
  let closeResolved = false;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const settleClosed = () => {
    if (!closeResolved) {
      closeResolved = true;
      resolveClosed();
    }
  };

  const streamFailure = (message: string, cause?: unknown) =>
    createServerError("API_STREAM_FAILED", message, true, undefined, cause);

  const rejectWaiting = (error: unknown) => {
    for (const producer of waiting.splice(0)) producer.reject(error);
  };

  const notifyCancel = () => {
    if (cancellationNotified) return;
    cancellationNotified = true;
    onCancel(DISCONNECT_REASON);
    runHandle?.cancel(DISCONNECT_REASON);
  };

  const finishIfReady = () => {
    if (state === "closing" && waiting.length === 0) {
      state = "closed";
      controller?.close();
      settleClosed();
    }
  };

  const admitWaiting = () => {
    while (waiting.length > 0) {
      const producer = waiting[0]!;
      if ((controller?.desiredSize ?? 0) < producer.chunk.byteLength) break;
      waiting.shift();
      controller!.enqueue(producer.chunk);
      producer.resolve();
    }
    finishIfReady();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
    },
    pull() {
      admitWaiting();
      finishIfReady();
    },
    cancel() {
      if (state === "closed" || state === "failed" || state === "cancelled") return;
      state = "cancelled";
      const error = streamFailure("NDJSON 消费者已断开");
      terminalError = error;
      rejectWaiting(error);
      notifyCancel();
      settleClosed();
    },
  }, {
    highWaterMark: limits.maximumQueueBytes,
    size: (chunk) => chunk.byteLength,
  });

  return {
    stream,
    async publish(event) {
      if (state !== "open") {
        throw terminalError ?? streamFailure("NDJSON 流已关闭");
      }
      let chunk: Uint8Array;
      try {
        const validated = AgentEventSchema.parse(event);
        chunk = encoder.encode(`${JSON.stringify(validated)}\n`);
      } catch (cause) {
        throw streamFailure("Agent 事件无法编码", cause);
      }
      if (chunk.byteLength > limits.maximumLineBytes) {
        throw streamFailure("NDJSON 事件超过单行大小限制");
      }
      if (waiting.length === 0 && (controller?.desiredSize ?? 0) >= chunk.byteLength) {
        controller!.enqueue(chunk);
        return;
      }
      await new Promise<void>((resolve, reject) => {
        waiting.push({ chunk, resolve, reject });
      });
    },
    close() {
      if (state === "open") state = "closing";
      finishIfReady();
      return closed;
    },
    fail(error) {
      if (state === "closed" || state === "failed" || state === "cancelled") return;
      state = "failed";
      terminalError = error;
      rejectWaiting(error);
      controller?.error(error);
      notifyCancel();
      settleClosed();
    },
    bindRunHandle(handle) {
      runHandle = handle;
      if (state === "cancelled" || state === "failed") handle.cancel(DISCONNECT_REASON);
    },
  };
}

export function createNdjsonEventBridge(
  onCancel?: (reason: string) => void,
): NdjsonEventBridge {
  return createNdjsonEventBridgeWithLimits(onCancel, {
    maximumLineBytes: MAX_NDJSON_LINE_BYTES,
    maximumQueueBytes: MAX_NDJSON_QUEUE_BYTES,
  });
}
