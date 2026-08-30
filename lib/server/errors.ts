import { AgentLayerError } from "@/lib/agent";
import { ErrorInfoSchema, type ErrorInfo, type JsonObject } from "@/lib/domain";
import { ModelLayerError } from "@/lib/model";
import { EventStoreError } from "@/lib/storage";
import { WorkspaceLayerError } from "@/lib/workspace";
import { ZodError } from "zod";

export const SERVER_ERROR_CODES = [
  "API_REQUEST_INVALID",
  "API_HOST_FORBIDDEN",
  "API_ORIGIN_FORBIDDEN",
  "API_REQUEST_TOO_LARGE",
  "API_CONTENT_TYPE_UNSUPPORTED",
  "API_MODEL_PROFILE_UNAVAILABLE",
  "API_SESSION_BUSY",
  "API_STREAM_FAILED",
  "API_INTERNAL_ERROR",
  "API_WORKSPACE_PICKER_UNAVAILABLE",
  "API_WORKSPACE_PICKER_CONFIG_INVALID",
  "API_WORKSPACE_PICKER_PATH_INVALID",
  "API_WORKSPACE_PICKER_PATH_FORBIDDEN",
  "API_WORKSPACE_PICKER_IO_ERROR",
] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];

export class ServerLayerError extends Error {
  readonly error: ErrorInfo;
  declare readonly cause: unknown;

  constructor(error: ErrorInfo, cause?: unknown) {
    const parsed = ErrorInfoSchema.parse(error);
    super(parsed.message);
    this.name = "ServerLayerError";
    this.error = parsed;
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

export function createServerError(
  code: ServerErrorCode,
  message: string,
  recoverable: boolean,
  details?: JsonObject,
  cause?: unknown,
): ServerLayerError {
  return new ServerLayerError(
    { code, message, recoverable, ...(details === undefined ? {} : { details }) },
    cause,
  );
}

function knownErrorInfo(error: unknown): ErrorInfo | undefined {
  if (
    error instanceof ServerLayerError ||
    error instanceof AgentLayerError ||
    error instanceof ModelLayerError ||
    error instanceof EventStoreError ||
    error instanceof WorkspaceLayerError
  ) {
    return error.error;
  }
  return undefined;
}

export function toPublicErrorInfo(error: unknown): ErrorInfo {
  const known = knownErrorInfo(error);
  if (known !== undefined) return ErrorInfoSchema.parse(known);
  if (error instanceof ZodError) {
    return {
      code: "API_REQUEST_INVALID",
      message: "请求参数无效",
      recoverable: true,
      details: {
        issues: error.issues.slice(0, 16).map((issue) => ({
          path: issue.path.map(String).slice(0, 8).join("."),
          code: issue.code,
          message: issue.message.slice(0, 512),
        })),
      },
    };
  }
  return {
    code: "API_INTERNAL_ERROR",
    message: "服务端发生未分类错误",
    recoverable: false,
  };
}

const BAD_REQUEST_CODES = new Set([
  "API_REQUEST_INVALID",
  "API_WORKSPACE_PICKER_PATH_INVALID",
  "WORKSPACE_INPUT_INVALID",
  "WORKSPACE_ROOT_NOT_ABSOLUTE",
  "WORKSPACE_ROOT_NOT_FOUND",
  "WORKSPACE_ROOT_NOT_DIRECTORY",
  "WORKSPACE_ROOT_TOO_BROAD",
  "WORKSPACE_ACCESS_DENIED",
]);
const NOT_FOUND_CODES = new Set(["SESSION_NOT_FOUND", "AGENT_RUN_NOT_FOUND"]);
const CONFLICT_CODES = new Set([
  "API_SESSION_BUSY",
  "AGENT_SESSION_BUSY",
  "AGENT_APPROVAL_NOT_PENDING",
  "AGENT_APPROVAL_INVALID",
  "AGENT_PLAN_NOT_PENDING",
  "AGENT_PLAN_APPROVAL_INVALID",
]);
const INTERNAL_CODES = new Set([
  "AGENT_HISTORY_INVALID",
  "SESSION_METADATA_CORRUPT",
  "SESSION_ID_MISMATCH",
  "EVENT_LOG_CORRUPT",
  "EVENT_SEQUENCE_CONFLICT",
  "EVENT_ID_DUPLICATE",
  "EVENT_SESSION_MISMATCH",
]);
const UNAVAILABLE_CODES = new Set([
  "API_WORKSPACE_PICKER_UNAVAILABLE",
  "API_WORKSPACE_PICKER_CONFIG_INVALID",
  "EVENT_STORE_CONFIG_INVALID",
  "EVENT_STORE_NOT_INITIALIZED",
  "EVENT_STORE_IO_ERROR",
  "MODEL_CONFIG_MISSING",
  "MODEL_CONFIG_INVALID",
  "MODEL_PROVIDER_UNAVAILABLE",
  "MODEL_NETWORK_ERROR",
  "MODEL_TIMEOUT",
  "AGENT_MODEL_UNAVAILABLE",
]);

export function statusForErrorInfo(error: ErrorInfo): number {
  if (BAD_REQUEST_CODES.has(error.code)) return 400;
  if (
    error.code === "API_HOST_FORBIDDEN" ||
    error.code === "API_ORIGIN_FORBIDDEN" ||
    error.code === "API_WORKSPACE_PICKER_PATH_FORBIDDEN"
  ) return 403;
  if (NOT_FOUND_CODES.has(error.code)) return 404;
  if (CONFLICT_CODES.has(error.code)) return 409;
  if (error.code === "API_REQUEST_TOO_LARGE") return 413;
  if (error.code === "API_CONTENT_TYPE_UNSUPPORTED") return 415;
  if (error.code === "API_MODEL_PROFILE_UNAVAILABLE" || error.code === "AGENT_INPUT_INVALID") return 422;
  if (UNAVAILABLE_CODES.has(error.code)) return 503;
  if (INTERNAL_CODES.has(error.code)) return 500;
  return 500;
}
