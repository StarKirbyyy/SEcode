import {
  ErrorInfoSchema,
  sanitizeForEvent,
  type ErrorInfo,
  type JsonObject,
} from "@/lib/domain";

import {
  AGENT_ERROR_CODES,
  type AgentErrorCode,
} from "./types";

const ERROR_RECOVERABILITY: Record<AgentErrorCode, boolean> = {
  AGENT_INPUT_INVALID: false,
  AGENT_START_ABORTED: true,
  AGENT_SESSION_BUSY: true,
  AGENT_HISTORY_INVALID: false,
  AGENT_WORKSPACE_UNAVAILABLE: true,
  AGENT_MODEL_UNAVAILABLE: true,
  AGENT_CONTEXT_FAILED: true,
  AGENT_RUN_NOT_FOUND: true,
  AGENT_APPROVAL_NOT_PENDING: true,
  AGENT_APPROVAL_INVALID: true,
  AGENT_PLAN_NOT_PENDING: true,
  AGENT_PLAN_APPROVAL_INVALID: true,
  AGENT_ITERATION_LIMIT: false,
  AGENT_TOOL_CALL_LIMIT: false,
  AGENT_NO_PROGRESS_LIMIT: false,
  AGENT_RUN_TIMEOUT: true,
  AGENT_REPEATED_TOOL_ERROR: false,
  AGENT_MODEL_OUTPUT_INVALID: true,
  AGENT_OUTPUT_LANGUAGE_INVALID: true,
  AGENT_WRITE_DEPENDENCY_UNRESOLVED: true,
  AGENT_COMPLETION_EVIDENCE_MISSING: false,
  AGENT_VALIDATION_NO_PROGRESS: false,
  AGENT_ASSISTANT_MESSAGE_TOO_LARGE: false,
  AGENT_INTERNAL_ERROR: false,
};

export class AgentLayerError extends Error {
  readonly error: ErrorInfo;
  declare readonly cause: unknown;

  constructor(error: ErrorInfo, cause?: unknown) {
    const parsed = ErrorInfoSchema.parse(error);
    super(parsed.message);
    this.name = "AgentLayerError";
    this.error = parsed;
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

function sanitizeDetails(details: JsonObject | undefined): JsonObject | undefined {
  if (details === undefined) return undefined;
  const sanitized = sanitizeForEvent(details);
  return sanitized !== null && !Array.isArray(sanitized) && typeof sanitized === "object"
    ? sanitized
    : undefined;
}

export function createAgentError(
  code: AgentErrorCode,
  message: string,
  details?: JsonObject,
  cause?: unknown,
): AgentLayerError {
  return new AgentLayerError(
    {
      code,
      message,
      recoverable: ERROR_RECOVERABILITY[code],
      ...(sanitizeDetails(details) === undefined
        ? {}
        : { details: sanitizeDetails(details) }),
    },
    cause,
  );
}

export function isAgentErrorCode(value: string): value is AgentErrorCode {
  return (AGENT_ERROR_CODES as readonly string[]).includes(value);
}
