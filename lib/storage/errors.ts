import {
  ErrorInfoSchema,
  type ErrorInfo,
  type JsonObject,
} from "@/lib/domain";
import { z } from "zod";

import type { EventStoreErrorCode } from "./types";

export type EventStoreErrorDetails = JsonObject & {
  field?: string;
  reason?: string;
  sessionId?: string;
  line?: number;
  byteOffset?: number;
  expectedSeq?: number;
  actualSeq?: number;
  eventId?: string;
  expectedKind?: string;
  actualKind?: string;
};

const EventStoreErrorDetailsSchema = z.strictObject({
  field: z.string().max(128).optional(),
  reason: z.string().max(512).optional(),
  sessionId: z.string().max(64).optional(),
  line: z.int().positive().optional(),
  byteOffset: z.int().nonnegative().optional(),
  expectedSeq: z.int().positive().optional(),
  actualSeq: z.int().positive().optional(),
  eventId: z.string().max(64).optional(),
  expectedKind: z.string().max(64).optional(),
  actualKind: z.string().max(64).optional(),
});

const ERROR_RECOVERABILITY: Record<EventStoreErrorCode, boolean> = {
  EVENT_STORE_CONFIG_INVALID: false,
  EVENT_STORE_NOT_INITIALIZED: true,
  EVENT_STORE_IO_ERROR: true,
  EVENT_COMMIT_UNCERTAIN: false,
  EVENT_STORE_SYMLINK_DENIED: false,
  EVENT_STORE_PATH_CONFLICT: false,
  SESSION_ALREADY_EXISTS: false,
  SESSION_NOT_FOUND: true,
  SESSION_METADATA_CORRUPT: false,
  SESSION_ID_MISMATCH: false,
  EVENT_LOG_CORRUPT: false,
  EVENT_TOO_LARGE: true,
  EVENT_SEQUENCE_CONFLICT: false,
  EVENT_ID_DUPLICATE: false,
  EVENT_TYPE_FORBIDDEN: true,
  EVENT_SESSION_MISMATCH: false,
};

export class EventStoreError extends Error {
  readonly error: ErrorInfo;
  declare readonly cause: unknown;

  constructor(error: ErrorInfo, cause?: unknown) {
    const parsed = ErrorInfoSchema.parse(error);
    super(parsed.message);
    this.name = "EventStoreError";
    this.error = parsed;
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

export function createEventStoreError(
  code: EventStoreErrorCode,
  message: string,
  details?: EventStoreErrorDetails,
  cause?: unknown,
): EventStoreError {
  const parsedDetails =
    details === undefined
      ? undefined
      : EventStoreErrorDetailsSchema.parse(details);
  return new EventStoreError(
    {
      code,
      message,
      recoverable: ERROR_RECOVERABILITY[code],
      ...(parsedDetails === undefined ? {} : { details: parsedDetails }),
    },
    cause,
  );
}

export function isErrno(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

export function mapStorageIoError(
  error: unknown,
  message: string,
  details?: EventStoreErrorDetails,
): EventStoreError {
  if (error instanceof EventStoreError) {
    return error;
  }
  return createEventStoreError(
    "EVENT_STORE_IO_ERROR",
    message,
    details,
    error,
  );
}
