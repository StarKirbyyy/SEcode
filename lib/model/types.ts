import {
  ErrorInfoSchema,
  type ChatMessage,
  type ErrorInfo,
  type JsonObject,
  type ModelProfile,
  type ToolCall,
  type ToolCallId,
  type ToolDefinition,
} from "@/lib/domain";

export const DEFAULT_MODEL_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_MODEL_ATTEMPTS = 3;
export const MAX_RETRY_AFTER_MS = 30_000;
export const MAX_SSE_EVENT_BYTES = 8 * 1024 * 1024;
export const MAX_MODEL_CONTENT_BYTES = 8 * 1024 * 1024;
export const MAX_MODEL_REASONING_BYTES = 8 * 1024 * 1024;
export const MAX_TOOL_ARGUMENT_BYTES = 4 * 1024 * 1024;
export const MAX_HTTP_ERROR_BODY_BYTES = 8 * 1024;

export const MODEL_ERROR_CODES = [
  "MODEL_CONFIG_MISSING",
  "MODEL_CONFIG_INVALID",
  "MODEL_AUTH_ERROR",
  "MODEL_PAYMENT_REQUIRED",
  "MODEL_REQUEST_INVALID",
  "MODEL_RATE_LIMITED",
  "MODEL_PROVIDER_UNAVAILABLE",
  "MODEL_NETWORK_ERROR",
  "MODEL_TIMEOUT",
  "MODEL_PROTOCOL_ERROR",
  "MODEL_RESPONSE_TOO_LARGE",
  "MODEL_OUTPUT_TRUNCATED",
  "MODEL_CONTENT_FILTERED",
  "MODEL_INVALID_TOOL_CALL",
] as const;

export type ModelErrorCode = (typeof MODEL_ERROR_CODES)[number];
export type ModelAdapter = "deepseek" | "longcat" | "generic";
export type ModelEnvironment = Readonly<Record<string, string | undefined>>;

export interface ServerModelProfileDefinition {
  profile: ModelProfile;
  endpoint: string;
  apiKeyEnv: string;
  requiresApiKey: boolean;
  adapter: ModelAdapter;
}

export interface ModelConfigIssue {
  profileId: string;
  code:
    | "MISSING_BASE_URL"
    | "MISSING_MODEL"
    | "MISSING_API_KEY"
    | "INVALID_VALUE";
  message: string;
}

export interface ModelRegistrySnapshot {
  profiles: ModelProfile[];
  issues: ModelConfigIssue[];
}

declare const continuationBrand: unique symbol;

export interface ModelContinuation {
  readonly [continuationBrand]: true;
}

export interface ModelThinkingOptions {
  enabled: boolean;
  effort?: "low" | "high" | "max";
}

export interface ModelRequest {
  profileId: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  signal: AbortSignal;
  continuation?: ModelContinuation;
  thinking?: ModelThinkingOptions;
  onTextDelta?: (content: string) => void | Promise<void>;
}

export type NormalizedFinishReason = "stop" | "tool_calls";

export interface ModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedPromptTokens?: number;
  cacheMissPromptTokens?: number;
}

export type ProviderCacheStatus =
  | "reported"
  | "partial"
  | "unreported"
  | "unsupported";

export type NormalizedModelToolCall =
  | { ok: true; call: ToolCall }
  | {
      ok: false;
      id: ToolCallId;
      name: string | null;
      rawArgumentsPreview: string;
      error: ErrorInfo;
    };

export interface ModelCompletion {
  content: string | null;
  toolCalls: NormalizedModelToolCall[];
  finishReason: NormalizedFinishReason;
  usage?: ModelUsage;
  usageComplete?: boolean;
  continuation: ModelContinuation;
}

export type ModelFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ModelClientDependencies {
  fetch: ModelFetch;
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  now: () => number;
  random: () => number;
  timeoutMs: number;
  maxAttempts: number;
}

export interface ModelClientOptions {
  env: ModelEnvironment;
  dependencies?: Partial<ModelClientDependencies>;
}

export interface ModelClient {
  complete(request: ModelRequest): Promise<ModelCompletion>;
  getConfigSnapshot(): ModelRegistrySnapshot;
}

export class ModelLayerError extends Error {
  readonly error: ErrorInfo;
  declare readonly cause: unknown;

  constructor(error: ErrorInfo, cause?: unknown) {
    const parsed = ErrorInfoSchema.parse(error);
    super(parsed.message);
    this.name = "ModelLayerError";
    this.error = parsed;
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

export class ModelAbortError extends Error {
  declare readonly cause: unknown;

  constructor(message = "模型请求已取消", cause?: unknown) {
    super(message);
    this.name = "ModelAbortError";
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

export function createModelError(
  code: ModelErrorCode,
  message: string,
  recoverable: boolean,
  details?: JsonObject,
  cause?: unknown,
): ModelLayerError {
  return new ModelLayerError(
    {
      code,
      message,
      recoverable,
      ...(details === undefined ? {} : { details }),
    },
    cause,
  );
}
