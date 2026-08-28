import { ErrorInfoSchema, redactSecrets, type ErrorInfo, type JsonObject, type JsonValue } from "@/lib/domain";

export const TERMINAL_ERROR_CODES = [
  "TERMINAL_ARGUMENT_INVALID",
  "TERMINAL_TTY_REQUIRED",
  "TERMINAL_COMMAND_INVALID",
  "TERMINAL_MODEL_UNAVAILABLE",
  "TERMINAL_SESSION_UNAVAILABLE",
  "TERMINAL_WORKSPACE_UNAVAILABLE",
  "TERMINAL_NO_ACTIVE_RUN",
  "TERMINAL_NO_PENDING_APPROVAL",
  "TERMINAL_IO_ERROR",
  "TERMINAL_INTERNAL_ERROR",
] as const;

export type TerminalErrorCode = (typeof TERMINAL_ERROR_CODES)[number];

export const TERMINAL_ERROR_RECOVERABLE: Readonly<Record<TerminalErrorCode, boolean>> = Object.freeze({
  TERMINAL_ARGUMENT_INVALID: false,
  TERMINAL_TTY_REQUIRED: false,
  TERMINAL_COMMAND_INVALID: true,
  TERMINAL_MODEL_UNAVAILABLE: true,
  TERMINAL_SESSION_UNAVAILABLE: true,
  TERMINAL_WORKSPACE_UNAVAILABLE: true,
  TERMINAL_NO_ACTIVE_RUN: true,
  TERMINAL_NO_PENDING_APPROVAL: true,
  TERMINAL_IO_ERROR: false,
  TERMINAL_INTERNAL_ERROR: false,
});

const DETAIL_KEYS = new Set([
  "field",
  "reason",
  "profileId",
  "sessionId",
  "runId",
  "approvalId",
  "command",
  "count",
]);

function safeDetails(details: Readonly<Record<string, unknown>> | undefined): JsonObject | undefined {
  if (details === undefined) return undefined;
  const safe: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!DETAIL_KEYS.has(key)) continue;
    if (typeof value === "string") safe[key] = redactSecrets(value).slice(0, 4_096);
    else if (typeof value === "number" && Number.isSafeInteger(value)) safe[key] = value;
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

export class TerminalLayerError extends Error {
  readonly error: ErrorInfo;
  declare readonly cause: unknown;

  constructor(error: ErrorInfo, cause?: unknown) {
    const parsed = ErrorInfoSchema.parse(error);
    super(parsed.message);
    this.name = "TerminalLayerError";
    this.error = parsed;
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }

  toJSON(): ErrorInfo {
    return this.error;
  }
}

export function createTerminalError(
  code: TerminalErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
  cause?: unknown,
): TerminalLayerError {
  const filtered = safeDetails(details);
  return new TerminalLayerError(
    {
      code,
      message: redactSecrets(message).slice(0, 8_192),
      recoverable: TERMINAL_ERROR_RECOVERABLE[code],
      ...(filtered === undefined ? {} : { details: filtered }),
    },
    cause,
  );
}

export function asTerminalError(error: unknown): TerminalLayerError {
  if (error instanceof TerminalLayerError) return error;
  return createTerminalError("TERMINAL_INTERNAL_ERROR", "终端发生未分类错误", undefined, error);
}
