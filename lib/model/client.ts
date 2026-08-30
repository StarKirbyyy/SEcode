import {
  redactSecrets,
  sanitizeForEvent,
  truncateUtf8,
  type JsonObject,
} from "@/lib/domain";

import { accumulateChatCompletion } from "./chat-accumulator";
import { buildChatRequest } from "./chat-mapper";
import {
  getModelRegistrySnapshot,
  readModelApiKey,
  resolveServerModelProfile,
} from "./config";
import { parseSseStream } from "./sse";
import {
  DEFAULT_MAX_MODEL_ATTEMPTS,
  DEFAULT_MODEL_TIMEOUT_MS,
  MAX_HTTP_ERROR_BODY_BYTES,
  MAX_RETRY_AFTER_MS,
  ModelAbortError,
  ModelLayerError,
  createModelError,
  type ModelClient,
  type ModelClientDependencies,
  type ModelClientOptions,
  type ModelErrorCode,
  type ModelRequest,
} from "./types";

interface AttemptContext {
  controller: AbortController;
  dispose: () => void;
  timedOut: () => boolean;
}

interface HttpFailure {
  error: ModelLayerError;
  retryable: boolean;
  retryAfterMs?: number;
}

function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ModelAbortError("模型重试等待已取消", signal.reason));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ModelAbortError("模型重试等待已取消", signal.reason));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

const DEFAULT_DEPENDENCIES: ModelClientDependencies = {
  fetch: globalThis.fetch.bind(globalThis),
  sleep: defaultSleep,
  now: Date.now,
  random: Math.random,
  timeoutMs: DEFAULT_MODEL_TIMEOUT_MS,
  maxAttempts: DEFAULT_MAX_MODEL_ATTEMPTS,
};

function createAttemptContext(
  callerSignal: AbortSignal,
  timeoutMs: number,
): AttemptContext {
  const controller = new AbortController();
  let didTimeout = false;
  const onCallerAbort = () => controller.abort(callerSignal.reason);
  if (callerSignal.aborted) {
    controller.abort(callerSignal.reason);
  } else {
    callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort(new Error("model attempt timeout"));
  }, timeoutMs);
  return {
    controller,
    timedOut: () => didTimeout,
    dispose: () => {
      clearTimeout(timer);
      callerSignal.removeEventListener("abort", onCallerAbort);
    },
  };
}

function scrubPrivateFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubPrivateFields);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:reasoning|reasoning_content)$/i.test(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = scrubPrivateFields(item);
    }
  }
  return result;
}

function safeErrorPreview(raw: string, apiKey: string | undefined): string {
  let redacted = redactSecrets(raw);
  if (apiKey) {
    redacted = redacted.split(apiKey).join("[REDACTED]");
  }
  try {
    const parsed = JSON.parse(redacted);
    redacted = JSON.stringify(
      sanitizeForEvent(scrubPrivateFields(parsed), {
        maxStringBytes: MAX_HTTP_ERROR_BODY_BYTES,
      }),
    );
  } catch {
    redacted = redacted.replace(
      /(["']?reasoning(?:_content)?["']?\s*[:=]\s*)([^,\r\n}]+)/gi,
      "$1[REDACTED]",
    );
  }
  return truncateUtf8(redacted, MAX_HTTP_ERROR_BODY_BYTES).value;
}

async function readErrorBody(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total <= MAX_HTTP_ERROR_BODY_BYTES) {
      if (signal.aborted) throw signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = MAX_HTTP_ERROR_BODY_BYTES + 1 - total;
      const selected = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(selected);
      total += selected.byteLength;
      if (total > MAX_HTTP_ERROR_BODY_BYTES) break;
    }
    if (total > MAX_HTTP_ERROR_BODY_BYTES) {
      await reader.cancel("HTTP error preview limit reached").catch(() => undefined);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined.slice(0, MAX_HTTP_ERROR_BODY_BYTES));
}

function parseRetryAfter(
  value: string | null,
  now: () => number,
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  let milliseconds: number;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    milliseconds = Number(trimmed) * 1_000;
  } else {
    const timestamp = Date.parse(trimmed);
    if (Number.isNaN(timestamp)) return undefined;
    milliseconds = timestamp - now();
  }
  if (!Number.isFinite(milliseconds)) return undefined;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, Math.round(milliseconds)));
}

function httpErrorCode(status: number): {
  code: ModelErrorCode;
  recoverable: boolean;
  retryable: boolean;
} {
  if (status === 401 || status === 403) {
    return { code: "MODEL_AUTH_ERROR", recoverable: false, retryable: false };
  }
  if (status === 402) {
    return {
      code: "MODEL_PAYMENT_REQUIRED",
      recoverable: false,
      retryable: false,
    };
  }
  if (status === 408) {
    return { code: "MODEL_TIMEOUT", recoverable: true, retryable: true };
  }
  if (status === 429) {
    return { code: "MODEL_RATE_LIMITED", recoverable: true, retryable: true };
  }
  if (status >= 500) {
    return {
      code: "MODEL_PROVIDER_UNAVAILABLE",
      recoverable: true,
      retryable: true,
    };
  }
  return {
    code: "MODEL_REQUEST_INVALID",
    recoverable: false,
    retryable: false,
  };
}

async function mapHttpFailure(
  response: Response,
  attempt: number,
  profileId: string,
  provider: string,
  apiKey: string | undefined,
  signal: AbortSignal,
  callerSignal: AbortSignal,
  now: () => number,
): Promise<HttpFailure> {
  const mapped = httpErrorCode(response.status);
  let rawBody = "";
  try {
    rawBody = await readErrorBody(response, signal);
  } catch (cause) {
    if (callerSignal.aborted) throw cause;
  }
  const safeBodyPreview = safeErrorPreview(rawBody, apiKey);
  const details: JsonObject = {
    provider,
    profileId,
    attempt,
    status: response.status,
    ...(safeBodyPreview ? { safeBodyPreview } : {}),
  };
  return {
    error: createModelError(
      mapped.code,
      `模型服务返回 HTTP ${response.status}`,
      mapped.recoverable,
      details,
    ),
    retryable: mapped.retryable,
    retryAfterMs: parseRetryAfter(response.headers.get("retry-after"), now),
  };
}

function retryDelay(
  attempt: number,
  retryAfterMs: number | undefined,
  random: () => number,
): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  const base = 500 * 2 ** (attempt - 1);
  return Math.min(MAX_RETRY_AFTER_MS, Math.round(base * (0.5 + random())));
}

function callerAbort(signal: AbortSignal): never {
  throw new ModelAbortError("模型请求已由调用方取消", signal.reason);
}

function partialError(error: ModelLayerError): ModelLayerError {
  const existing = error.error.details ?? {};
  return createModelError(
    error.error.code as ModelErrorCode,
    error.error.message,
    error.error.recoverable,
    { ...existing, partialOutputDiscarded: true },
    error,
  );
}

function isRetryableStreamError(error: ModelLayerError): boolean {
  return error.error.code === "MODEL_RATE_LIMITED" ||
    error.error.code === "MODEL_PROVIDER_UNAVAILABLE" ||
    error.error.code === "MODEL_TIMEOUT";
}

function annotateStreamError(
  error: ModelLayerError,
  attempt: number,
  profileId: string,
  provider: string,
): ModelLayerError {
  if (typeof error.error.details?.providerCode !== "string") return error;
  return createModelError(
    error.error.code as ModelErrorCode,
    error.error.message,
    error.error.recoverable,
    { ...error.error.details, attempt, profileId, provider },
    error,
  );
}

function validateDependencies(dependencies: ModelClientDependencies): void {
  if (
    !Number.isSafeInteger(dependencies.timeoutMs) ||
    dependencies.timeoutMs <= 0 ||
    !Number.isSafeInteger(dependencies.maxAttempts) ||
    dependencies.maxAttempts <= 0 ||
    dependencies.maxAttempts > DEFAULT_MAX_MODEL_ATTEMPTS
  ) {
    throw createModelError(
      "MODEL_CONFIG_INVALID",
      "模型客户端 timeoutMs 必须为正整数，maxAttempts 必须介于 1 和 3",
      false,
    );
  }
}

function networkError(
  attempt: number,
  profileId: string,
  provider: string,
  cause: unknown,
): ModelLayerError {
  return createModelError(
    "MODEL_NETWORK_ERROR",
    "模型服务网络请求失败",
    true,
    { provider, profileId, attempt },
    cause,
  );
}

export function createModelClient(options: ModelClientOptions): ModelClient {
  const dependencies: ModelClientDependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...options.dependencies,
  };
  validateDependencies(dependencies);

  return {
    getConfigSnapshot: () => getModelRegistrySnapshot(options.env),

    async complete(request: ModelRequest) {
      if (request.signal.aborted) callerAbort(request.signal);
      const definition = resolveServerModelProfile(request.profileId, options.env);
      const apiKey = readModelApiKey(definition, options.env);
      const plan = buildChatRequest(request, definition);
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      };
      let lastError: ModelLayerError | undefined;

      for (let attempt = 1; attempt <= dependencies.maxAttempts; attempt += 1) {
        if (request.signal.aborted) callerAbort(request.signal);
        const attemptContext = createAttemptContext(
          request.signal,
          dependencies.timeoutMs,
        );
        let semanticAccepted = false;
        let retryAfterMs: number | undefined;
        let retryable = false;
        let response: Response | undefined;

        try {
          response = await dependencies.fetch(definition.endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(plan.body),
            signal: attemptContext.controller.signal,
          });
          if (!response.ok) {
            const failure = await mapHttpFailure(
              response,
              attempt,
              definition.profile.id,
              definition.adapter,
              apiKey,
              attemptContext.controller.signal,
              request.signal,
              dependencies.now,
            );
            lastError = failure.error;
            retryable = failure.retryable;
            retryAfterMs = failure.retryAfterMs;
          } else if (!response.body) {
            throw createModelError(
              "MODEL_PROTOCOL_ERROR",
              "模型响应缺少可读取的 body",
              false,
              {
                provider: definition.adapter,
                profileId: definition.profile.id,
                attempt,
              },
            );
          } else {
            const parsed = parseSseStream(response.body, {
              signal: attemptContext.controller.signal,
            });
            const completion = await accumulateChatCompletion(
              parsed,
              {
                definition,
                continuationState: plan.continuationState,
                onTextDelta: request.onTextDelta,
                onSemanticOutput: () => {
                  semanticAccepted = true;
                },
              },
            );
            return attempt === 1
              ? completion
              : { ...completion, usageComplete: false };
          }
        } catch (cause) {
          if (request.signal.aborted) callerAbort(request.signal);

          let error: ModelLayerError;
          if (attemptContext.timedOut()) {
            error = createModelError(
              "MODEL_TIMEOUT",
              "模型请求超过单次时间限制",
              true,
              {
                provider: definition.adapter,
                profileId: definition.profile.id,
                attempt,
              },
              cause,
            );
            retryable = !semanticAccepted;
          } else if (cause instanceof ModelLayerError) {
            error = annotateStreamError(
              cause,
              attempt,
              definition.profile.id,
              definition.adapter,
            );
            retryable = !semanticAccepted && isRetryableStreamError(cause);
          } else if (cause instanceof ModelAbortError) {
            error = networkError(
              attempt,
              definition.profile.id,
              definition.adapter,
              cause,
            );
            retryable = !semanticAccepted;
          } else {
            error = networkError(
              attempt,
              definition.profile.id,
              definition.adapter,
              cause,
            );
            retryable = !semanticAccepted;
          }
          lastError = semanticAccepted ? partialError(error) : error;
          if (response?.body) {
            await response.body.cancel("model stream failed").catch(() => undefined);
          }
        } finally {
          attemptContext.dispose();
        }

        if (!lastError) {
          throw createModelError(
            "MODEL_PROTOCOL_ERROR",
            "模型客户端进入了无结果状态",
            false,
          );
        }
        if (!retryable || attempt >= dependencies.maxAttempts) {
          throw lastError;
        }
        try {
          await dependencies.sleep(
            retryDelay(attempt, retryAfterMs, dependencies.random),
            request.signal,
          );
        } catch (cause) {
          if (request.signal.aborted || cause instanceof ModelAbortError) {
            callerAbort(request.signal);
          }
          throw networkError(
            attempt,
            definition.profile.id,
            definition.adapter,
            cause,
          );
        }
      }

      throw lastError ??
        createModelError(
          "MODEL_PROTOCOL_ERROR",
          "模型客户端未产生结果",
          false,
        );
    },
  };
}
