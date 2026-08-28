import {
  ErrorInfoSchema,
  redactSecrets,
  type ErrorInfo,
  type JsonObject,
  type JsonValue,
} from "@/lib/domain";

import {
  CONTEXT_ERROR_CODES,
  type ContextErrorCode,
} from "./types";

const ERROR_RECOVERABILITY: Record<ContextErrorCode, boolean> = {
  CONTEXT_INPUT_INVALID: false,
  CONTEXT_SESSION_UNAVAILABLE: true,
  CONTEXT_MODEL_UNAVAILABLE: true,
  CONTEXT_HISTORY_INVALID: false,
  CONTEXT_BUDGET_EXCEEDED: true,
  CONTEXT_SUMMARY_FAILED: true,
  CONTEXT_SUMMARY_INVALID: true,
  CONTEXT_ABORTED: true,
  CONTEXT_INTERNAL_ERROR: false,
};

export class ContextLayerError extends Error {
  readonly error: ErrorInfo;
  declare readonly cause: unknown;

  constructor(error: ErrorInfo, cause?: unknown) {
    const parsed = ErrorInfoSchema.parse(error);
    super(parsed.message);
    this.name = "ContextLayerError";
    this.error = parsed;
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

const ALLOWED_DETAIL_FIELDS = new Set([
  "profileId",
  "runId",
  "iteration",
  "seq",
  "eventSeq",
  "page",
  "afterSeq",
  "count",
  "inputBudgetTokens",
  "estimatedTokens",
  "contextWindow",
  "targetTokens",
  "throughSeq",
  "retainedFromSeq",
  "retainedToSeq",
  "reason",
]);

function sanitizeDetails(details: JsonObject | undefined): JsonObject | undefined {
  if (details === undefined) return undefined;
  const result: JsonObject = {};
  for (const [key, value] of Object.entries(details)) {
    if (!ALLOWED_DETAIL_FIELDS.has(key)) continue;
    let sanitized: JsonValue | undefined;
    if (typeof value === "string") sanitized = redactSecrets(value).slice(0, 4_096);
    else if (typeof value === "number" && Number.isFinite(value)) sanitized = value;
    else if (typeof value === "boolean" || value === null) sanitized = value;
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

export function createContextError(
  code: ContextErrorCode,
  message: string,
  details?: JsonObject,
  cause?: unknown,
): ContextLayerError {
  const safeDetails = sanitizeDetails(details);
  return new ContextLayerError(
    {
      code,
      message,
      recoverable: ERROR_RECOVERABILITY[code],
      ...(safeDetails === undefined ? {} : { details: safeDetails }),
    },
    cause,
  );
}

export function isContextErrorCode(value: string): value is ContextErrorCode {
  return (CONTEXT_ERROR_CODES as readonly string[]).includes(value);
}
