import type { FileHandle } from "node:fs/promises";

import {
  DurableAgentEventSchema,
  isTerminalRunEvent,
  type DurableAgentEvent,
  type RunId,
} from "@/lib/domain";

import type { EventStoreDependencies } from "./dependencies";
import {
  EventStoreError,
  createEventStoreError,
  mapStorageIoError,
} from "./errors";
import { MAX_EVENT_LINE_BYTES } from "./types";

const DEFAULT_READ_CHUNK_BYTES = 64 * 1024;

export interface ScanEventLogOptions {
  readonly sessionId: string;
  readonly afterSeq: number;
  readonly limit: number;
  readonly chunkBytes?: number;
}

export interface EventLogScanResult {
  readonly events: readonly DurableAgentEvent[];
  readonly hasMore: boolean;
  readonly lastSeq: number;
  readonly lastStableOffset: number;
  readonly discardedTailBytes: number;
  readonly eventIds: ReadonlySet<string>;
  readonly firstEvent: DurableAgentEvent;
  readonly openRunIds: readonly RunId[];
}

function corrupt(
  message: string,
  line: number,
  byteOffset: number,
  cause?: unknown,
): never {
  throw createEventStoreError(
    "EVENT_LOG_CORRUPT",
    message,
    { line, byteOffset },
    cause,
  );
}

export function serializeDurableEvent(event: unknown): Buffer {
  const parsed = DurableAgentEventSchema.safeParse(event);
  if (!parsed.success) {
    throw createEventStoreError(
      "EVENT_LOG_CORRUPT",
      "A durable event failed schema validation before serialization.",
      undefined,
      parsed.error,
    );
  }
  const buffer = Buffer.from(`${JSON.stringify(parsed.data)}\n`, "utf8");
  if (buffer.byteLength > MAX_EVENT_LINE_BYTES) {
    throw createEventStoreError(
      "EVENT_TOO_LARGE",
      "The durable event exceeds the JSONL record limit.",
    );
  }
  return buffer;
}

function decodeEventLine(
  bytes: Buffer,
  line: number,
  byteOffset: number,
): DurableAgentEvent {
  if (bytes.byteLength === 0) {
    corrupt("The event log contains an empty line.", line, byteOffset);
  }
  if (
    line === 1 &&
    bytes.byteLength >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    corrupt("The event log cannot contain a UTF-8 BOM.", line, byteOffset);
  }
  if (bytes.at(-1) === 0x0d) {
    corrupt("The event log must use LF line endings.", line, byteOffset);
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    corrupt("The event log contains invalid UTF-8.", line, byteOffset, error);
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    corrupt("The event log contains invalid JSON.", line, byteOffset, error);
  }

  const parsed = DurableAgentEventSchema.safeParse(value);
  if (!parsed.success) {
    corrupt(
      "An event log record failed durable event validation.",
      line,
      byteOffset,
      parsed.error,
    );
  }
  return parsed.data;
}

export async function scanEventLog(
  handle: FileHandle,
  options: ScanEventLogOptions,
  dependencies: EventStoreDependencies,
): Promise<EventLogScanResult> {
  const chunkBytes = options.chunkBytes ?? DEFAULT_READ_CHUNK_BYTES;
  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) {
    throw createEventStoreError(
      "EVENT_STORE_CONFIG_INVALID",
      "The event log chunk size is invalid.",
      { field: "chunkBytes", reason: "must_be_positive_integer" },
    );
  }

  const page: DurableAgentEvent[] = [];
  const eventIds = new Set<string>();
  const startedRunOrder: RunId[] = [];
  const startedRuns = new Set<RunId>();
  const terminalRuns = new Set<RunId>();
  const lineParts: Buffer[] = [];
  let lineBytes = 0;
  let lineOversized = false;
  let totalBytes = 0;
  let lastStableOffset = 0;
  let line = 0;
  let lastSeq = 0;
  let firstEvent: DurableAgentEvent | undefined;

  const processLine = (lineBuffer: Buffer, offset: number) => {
    line += 1;
    const event = decodeEventLine(lineBuffer, line, offset);

    if (event.sessionId !== options.sessionId) {
      throw createEventStoreError(
        "EVENT_SESSION_MISMATCH",
        "An event belongs to a different session.",
        { sessionId: options.sessionId, line, byteOffset: offset },
      );
    }

    const expectedSeq = lastSeq + 1;
    if (event.seq !== expectedSeq) {
      throw createEventStoreError(
        "EVENT_SEQUENCE_CONFLICT",
        "The event sequence is not continuous.",
        {
          sessionId: options.sessionId,
          line,
          byteOffset: offset,
          expectedSeq,
          actualSeq: event.seq,
        },
      );
    }

    if (eventIds.has(event.id)) {
      throw createEventStoreError(
        "EVENT_ID_DUPLICATE",
        "The event log contains a duplicate event identifier.",
        {
          sessionId: options.sessionId,
          line,
          byteOffset: offset,
          eventId: event.id,
        },
      );
    }

    if (line === 1) {
      if (event.type !== "session.created" || event.runId !== undefined) {
        corrupt(
          "The first event must be an unscoped session.created event.",
          line,
          offset,
        );
      }
      firstEvent = event;
    } else if (event.type === "session.created") {
      corrupt(
        "The event log contains more than one session.created event.",
        line,
        offset,
      );
    }

    eventIds.add(event.id);
    lastSeq = event.seq;

    if (
      event.type === "run.started" &&
      event.runId !== undefined &&
      !startedRuns.has(event.runId)
    ) {
      startedRuns.add(event.runId);
      startedRunOrder.push(event.runId);
    }
    if (isTerminalRunEvent(event) && event.runId !== undefined) {
      terminalRuns.add(event.runId);
    }

    if (event.seq > options.afterSeq && page.length <= options.limit) {
      page.push(event);
    }
  };

  try {
    const stream = dependencies.createReadStream(handle, chunkBytes);
    for await (const rawChunk of stream) {
      const chunk = Buffer.isBuffer(rawChunk)
        ? rawChunk
        : Buffer.from(rawChunk);
      let cursor = 0;
      while (cursor < chunk.byteLength) {
        const newline = chunk.indexOf(0x0a, cursor);
        const end = newline === -1 ? chunk.byteLength : newline;
        const segment = chunk.subarray(cursor, end);
        lineBytes += segment.byteLength;
        if (!lineOversized) {
          if (lineBytes + 1 > MAX_EVENT_LINE_BYTES) {
            lineOversized = true;
            lineParts.length = 0;
          } else if (segment.byteLength > 0) {
            lineParts.push(Buffer.from(segment));
          }
        }

        if (newline === -1) {
          cursor = chunk.byteLength;
          continue;
        }

        const lineOffset = lastStableOffset;
        const newlineOffset = totalBytes + newline + 1;
        if (lineOversized) {
          throw createEventStoreError(
            "EVENT_TOO_LARGE",
            "The event log contains a record larger than the limit.",
            { line: line + 1, byteOffset: lineOffset },
          );
        }
        processLine(Buffer.concat(lineParts, lineBytes), lineOffset);
        lineParts.length = 0;
        lineBytes = 0;
        lineOversized = false;
        lastStableOffset = newlineOffset;
        cursor = newline + 1;
      }
      totalBytes += chunk.byteLength;
    }
  } catch (error) {
    if (error instanceof EventStoreError) {
      throw error;
    }
    throw mapStorageIoError(
      error,
      "The event log could not be streamed.",
      { sessionId: options.sessionId },
    );
  }

  if (firstEvent === undefined) {
    throw createEventStoreError(
      "EVENT_LOG_CORRUPT",
      "The event log does not contain a complete session.created record.",
      { sessionId: options.sessionId },
    );
  }

  const hasMore = page.length > options.limit;
  const events = hasMore ? page.slice(0, options.limit) : page;
  const openRunIds = startedRunOrder.filter(
    (runId) => !terminalRuns.has(runId),
  );

  return {
    events,
    hasMore,
    lastSeq,
    lastStableOffset,
    discardedTailBytes: lineBytes,
    eventIds,
    firstEvent,
    openRunIds,
  };
}

export async function repairIncompleteTail(
  handle: FileHandle,
  stableOffset: number,
): Promise<void> {
  let truncateAttempted = false;
  try {
    truncateAttempted = true;
    await handle.truncate(stableOffset);
    await handle.sync();
  } catch (error) {
    throw createEventStoreError(
      truncateAttempted ? "EVENT_COMMIT_UNCERTAIN" : "EVENT_STORE_IO_ERROR",
      "The incomplete event log tail could not be repaired safely.",
      { byteOffset: stableOffset },
      error,
    );
  }
}

export async function writeBufferFully(
  handle: FileHandle,
  buffer: Buffer,
): Promise<void> {
  let offset = 0;
  while (offset < buffer.byteLength) {
    const result = await handle.write(
      buffer,
      offset,
      buffer.byteLength - offset,
      null,
    );
    if (result.bytesWritten <= 0) {
      throw new Error("filesystem reported a zero-byte write");
    }
    offset += result.bytesWritten;
  }
}
