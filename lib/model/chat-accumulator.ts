import { createHash } from "node:crypto";

import { z } from "zod";

import {
  JsonObjectSchema,
  ToolCallSchema,
  ToolNameSchema,
  UuidSchema,
  redactSecrets,
  truncateUtf8,
  utf8ByteLength,
  type ErrorInfo,
  type JsonObject,
} from "@/lib/domain";

import {
  cloneContinuationState,
  createContinuationToken,
  type InternalContinuationState,
  type ProviderAssistantTurn,
  type ProviderToolCallState,
} from "./chat-mapper";
import type { SseStreamEvent } from "./sse";
import {
  MAX_MODEL_CONTENT_BYTES,
  MAX_MODEL_REASONING_BYTES,
  MAX_TOOL_ARGUMENT_BYTES,
  createModelError,
  type ModelLayerError,
  type ModelCompletion,
  type ModelUsage,
  type NormalizedModelToolCall,
  type ServerModelProfileDefinition,
} from "./types";

const WireToolCallSchema = z.object({
  index: z.int().nonnegative().optional(),
  id: z.string().max(1_024).nullable().optional(),
  type: z.literal("function").optional(),
  function: z
    .object({
      name: z.string().max(1_024).nullable().optional(),
      arguments: z.union([z.string(), JsonObjectSchema]).optional(),
    })
    .optional(),
});

const WireChoiceSchema = z.object({
  index: z.int().nonnegative(),
  delta: z.object({
    content: z.string().nullable().optional(),
    reasoning_content: z.string().nullable().optional(),
    role: z.literal("assistant").optional(),
    tool_calls: z.array(WireToolCallSchema).max(128).optional(),
  }),
  finish_reason: z.string().max(128).nullable(),
});

const WireUsageSchema = z.object({
  prompt_tokens: z.int().nonnegative().optional(),
  completion_tokens: z.int().nonnegative().optional(),
  total_tokens: z.int().nonnegative().optional(),
  prompt_cache_hit_tokens: z.int().nonnegative().optional(),
  prompt_cache_miss_tokens: z.int().nonnegative().optional(),
  prompt_tokens_details: z
    .object({ cached_tokens: z.int().nonnegative().optional() })
    .optional(),
  completion_tokens_details: z
    .object({ reasoning_tokens: z.int().nonnegative().optional() })
    .optional(),
});

const WireChunkSchema = z.object({
  id: z.string().max(1_024).optional(),
  choices: z.array(WireChoiceSchema).max(2),
  usage: WireUsageSchema.nullable().optional(),
});

const WireErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.union([z.string().max(128), z.number().int()]).optional(),
    type: z.string().max(128).optional(),
    status: z.union([z.string().max(128), z.number().int()]).optional(),
    message: z.string().max(65_536).optional(),
  }).refine(
    (error) => error.code !== undefined || error.type !== undefined || error.status !== undefined,
    "provider error classifier missing",
  ),
});

interface PendingToolCall {
  index: number;
  providerId: string;
  name: string;
  argumentKind?: "string" | "object";
  argumentString: string;
  argumentObject?: JsonObject;
  argumentBytes: number;
}

export interface AccumulateChatOptions {
  definition: ServerModelProfileDefinition;
  continuationState: InternalContinuationState;
  onTextDelta?: (content: string) => void | Promise<void>;
  onSemanticOutput?: () => void;
}

function normalizedProviderClassifier(value: string | number): string {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function providerEnvelopeError(raw: unknown): ModelLayerError | undefined {
  if (raw !== null && typeof raw === "object" && "choices" in raw) return undefined;
  const parsed = WireErrorEnvelopeSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const classifiers = [
    parsed.data.error.code,
    parsed.data.error.type,
    parsed.data.error.status,
  ].filter((value): value is string | number => value !== undefined)
    .map(normalizedProviderClassifier);
  const has = (...values: string[]) => classifiers.some((item) => values.includes(item));
  let code: Parameters<typeof createModelError>[0] = "MODEL_PROTOCOL_ERROR";
  let message = "模型返回了未知的错误响应";
  let recoverable = false;

  if (has("401", "403", "auth", "authentication", "authentication_error", "invalid_api_key", "unauthorized")) {
    code = "MODEL_AUTH_ERROR";
    message = "模型服务鉴权失败";
  } else if (has("402", "payment", "payment_required", "insufficient_quota")) {
    code = "MODEL_PAYMENT_REQUIRED";
    message = "模型服务额度或付费状态不可用";
  } else if (has("400", "404", "409", "422", "invalid_request", "invalid_request_error", "bad_request")) {
    code = "MODEL_REQUEST_INVALID";
    message = "模型请求无效";
  } else if (has("408", "timeout", "request_timeout")) {
    code = "MODEL_TIMEOUT";
    message = "模型服务请求超时";
    recoverable = true;
  } else if (has("429", "rate_limit", "rate_limited", "rate_limit_exceeded")) {
    code = "MODEL_RATE_LIMITED";
    message = "模型服务触发速率限制";
    recoverable = true;
  } else if (has(
    "500", "502", "503", "504", "overloaded", "service_unavailable",
    "provider_unavailable", "internal_error", "server_error", "upstream_error",
  )) {
    code = "MODEL_PROVIDER_UNAVAILABLE";
    message = "模型服务暂时不可用";
    recoverable = true;
  }

  return createModelError(code, message, recoverable, {
    providerCode: classifiers[0] ?? "unknown",
  });
}

function mergeFragment(current: string, fragment: string): string {
  if (!current) {
    return fragment;
  }
  if (fragment === current || current.endsWith(fragment)) {
    return current;
  }
  if (fragment.startsWith(current)) {
    return fragment;
  }
  return current + fragment;
}

function deterministicUuid(seed: string): string {
  const bytes = Buffer.from(createHash("sha256").update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return UuidSchema.parse(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  );
}

function stableProviderId(
  completionId: string,
  index: number,
  name: string,
): string {
  const hash = createHash("sha256")
    .update(`${completionId}\u0000${index}\u0000${name}`)
    .digest("hex")
    .slice(0, 24);
  return `call_secode_${hash}`;
}

function invalidToolCall(
  internalId: string,
  name: string,
  rawArguments: string,
  reason: string,
  index: number,
): NormalizedModelToolCall {
  const safeName = name
    ? truncateUtf8(redactSecrets(name), 128).value
    : null;
  const error: ErrorInfo = {
    code: "MODEL_INVALID_TOOL_CALL",
    message: "模型生成了无法验证的工具调用",
    recoverable: true,
    details: { index, reason },
  };
  return {
    ok: false,
    id: internalId,
    name: safeName,
    rawArgumentsPreview: truncateUtf8(redactSecrets(rawArguments), 1_024).value,
    error,
  };
}

function finishError(reason: string): never {
  if (reason === "length") {
    throw createModelError(
      "MODEL_OUTPUT_TRUNCATED",
      "模型输出因长度限制而中断",
      true,
      { finishReason: reason },
    );
  }
  if (reason === "content_filter") {
    throw createModelError(
      "MODEL_CONTENT_FILTERED",
      "模型输出被内容策略中止",
      false,
      { finishReason: reason },
    );
  }
  if (reason === "insufficient_system_resource") {
    throw createModelError(
      "MODEL_PROVIDER_UNAVAILABLE",
      "模型服务资源不足",
      true,
      { finishReason: reason },
    );
  }
  throw createModelError(
    "MODEL_PROTOCOL_ERROR",
    "模型返回了不支持的结束原因",
    false,
    { finishReason: reason },
  );
}

export async function accumulateChatCompletion(
  events: AsyncIterable<SseStreamEvent>,
  options: AccumulateChatOptions,
): Promise<ModelCompletion> {
  let completionId = "";
  let content = "";
  let contentBytes = 0;
  let reasoning = "";
  let reasoningBytes = 0;
  let finishReason: string | undefined;
  let usage: ModelUsage | undefined;
  let sawDone = false;
  const pendingCalls = new Map<number, PendingToolCall>();

  for await (const event of events) {
    if (event.type === "done") {
      sawDone = true;
      break;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(event.data);
    } catch (cause) {
      throw createModelError(
        "MODEL_PROTOCOL_ERROR",
        "模型 SSE data 不是有效 JSON",
        false,
        undefined,
        cause,
      );
    }
    const parsed = WireChunkSchema.safeParse(raw);
    if (!parsed.success) {
      const envelopeError = providerEnvelopeError(raw);
      if (envelopeError !== undefined) throw envelopeError;
      throw createModelError(
        "MODEL_PROTOCOL_ERROR",
        "模型 chunk 结构无效",
        false,
        { field: parsed.error.issues[0]?.path.join(".") ?? "chunk" },
      );
    }
    const chunk = parsed.data;

    if (chunk.id) {
      if (completionId && completionId !== chunk.id) {
        throw createModelError(
          "MODEL_PROTOCOL_ERROR",
          "同一模型流的 completion ID 不一致",
          false,
        );
      }
      completionId = chunk.id;
    }

    if (chunk.choices.length > 1 || chunk.choices.some((choice) => choice.index !== 0)) {
      throw createModelError(
        "MODEL_PROTOCOL_ERROR",
        "首版模型层只支持 choice 0",
        false,
      );
    }

    if (chunk.usage) {
      const topLevelCached = chunk.usage.prompt_cache_hit_tokens;
      const detailedCached = chunk.usage.prompt_tokens_details?.cached_tokens;
      if (
        topLevelCached !== undefined &&
        detailedCached !== undefined &&
        topLevelCached !== detailedCached
      ) {
        throw createModelError(
          "MODEL_PROTOCOL_ERROR",
          "模型返回了互相冲突的缓存 Token 用量",
          false,
          { field: "usage.cached_prompt_tokens" },
        );
      }
      const cachedPromptTokens = topLevelCached ?? detailedCached;
      usage = {
        ...(chunk.usage.prompt_tokens === undefined
          ? {}
          : { promptTokens: chunk.usage.prompt_tokens }),
        ...(chunk.usage.completion_tokens === undefined
          ? {}
          : { completionTokens: chunk.usage.completion_tokens }),
        ...(chunk.usage.total_tokens === undefined
          ? {}
          : { totalTokens: chunk.usage.total_tokens }),
        ...(chunk.usage.completion_tokens_details?.reasoning_tokens === undefined
          ? {}
          : {
              reasoningTokens:
                chunk.usage.completion_tokens_details.reasoning_tokens,
            }),
        ...(cachedPromptTokens === undefined
          ? {}
          : { cachedPromptTokens }),
        ...(chunk.usage.prompt_cache_miss_tokens === undefined
          ? {}
          : { cacheMissPromptTokens: chunk.usage.prompt_cache_miss_tokens }),
      };
      options.onSemanticOutput?.();
    }

    const choice = chunk.choices[0];
    if (!choice) {
      continue;
    }

    if (choice.delta.content) {
      options.onSemanticOutput?.();
      contentBytes += utf8ByteLength(choice.delta.content);
      if (contentBytes > MAX_MODEL_CONTENT_BYTES) {
        throw createModelError(
          "MODEL_RESPONSE_TOO_LARGE",
          "模型可见输出超过大小限制",
          false,
          { limitBytes: MAX_MODEL_CONTENT_BYTES },
        );
      }
      content += choice.delta.content;
      await options.onTextDelta?.(choice.delta.content);
    }
    if (choice.delta.reasoning_content) {
      options.onSemanticOutput?.();
      reasoningBytes += utf8ByteLength(choice.delta.reasoning_content);
      if (reasoningBytes > MAX_MODEL_REASONING_BYTES) {
        throw createModelError(
          "MODEL_RESPONSE_TOO_LARGE",
          "模型私有推理超过大小限制",
          false,
          { limitBytes: MAX_MODEL_REASONING_BYTES },
        );
      }
      reasoning += choice.delta.reasoning_content;
    }

    for (const [position, delta] of (choice.delta.tool_calls ?? []).entries()) {
      options.onSemanticOutput?.();
      const index = delta.index ?? position;
      const pending = pendingCalls.get(index) ?? {
        index,
        providerId: "",
        name: "",
        argumentString: "",
        argumentBytes: 0,
      };
      if (delta.id) {
        pending.providerId = mergeFragment(pending.providerId, delta.id);
      }
      if (delta.function?.name) {
        pending.name = mergeFragment(pending.name, delta.function.name);
      }
      const argumentDelta = delta.function?.arguments;
      if (typeof argumentDelta === "string") {
        if (pending.argumentKind === "object") {
          throw createModelError(
            "MODEL_PROTOCOL_ERROR",
            "工具参数不能混用对象和字符串分片",
            false,
          );
        }
        pending.argumentKind = "string";
        pending.argumentBytes += utf8ByteLength(argumentDelta);
        pending.argumentString += argumentDelta;
      } else if (argumentDelta !== undefined) {
        if (pending.argumentKind !== undefined) {
          throw createModelError(
            "MODEL_PROTOCOL_ERROR",
            "工具对象参数只能出现一次",
            false,
          );
        }
        pending.argumentKind = "object";
        pending.argumentObject = argumentDelta;
        pending.argumentBytes = utf8ByteLength(JSON.stringify(argumentDelta));
      }
      if (pending.argumentBytes > MAX_TOOL_ARGUMENT_BYTES) {
        throw createModelError(
          "MODEL_RESPONSE_TOO_LARGE",
          "模型工具参数超过大小限制",
          false,
          { limitBytes: MAX_TOOL_ARGUMENT_BYTES, index },
        );
      }
      pendingCalls.set(index, pending);
    }

    if (choice.finish_reason !== null) {
      options.onSemanticOutput?.();
      if (finishReason && finishReason !== choice.finish_reason) {
        throw createModelError(
          "MODEL_PROTOCOL_ERROR",
          "模型流包含冲突的结束原因",
          false,
        );
      }
      finishReason = choice.finish_reason;
    }
  }

  if (!sawDone) {
    throw createModelError(
      "MODEL_PROTOCOL_ERROR",
      "模型流未收到 [DONE]",
      false,
    );
  }
  if (!finishReason) {
    throw createModelError(
      "MODEL_PROTOCOL_ERROR",
      "模型流缺少最终结束原因",
      false,
    );
  }
  if (finishReason !== "stop" && finishReason !== "tool_calls") {
    finishError(finishReason);
  }

  const normalizedCalls: NormalizedModelToolCall[] = [];
  const providerCalls: ProviderToolCallState[] = [];
  for (const pending of [...pendingCalls.values()].sort(
    (left, right) => left.index - right.index,
  )) {
    const providerId =
      pending.providerId ||
      stableProviderId(completionId || "missing", pending.index, pending.name);
    const internalId = deterministicUuid(
      `${options.definition.adapter}\u0000${completionId}\u0000${providerId}\u0000${pending.index}`,
    );
    const wireArguments: string | JsonObject =
      pending.argumentKind === "object"
        ? (pending.argumentObject ?? {})
        : pending.argumentString;
    const rawArguments =
      typeof wireArguments === "string"
        ? wireArguments
        : JSON.stringify(wireArguments);
    if (!ToolNameSchema.safeParse(pending.name).success) {
      normalizedCalls.push(
        invalidToolCall(
          internalId,
          pending.name,
          rawArguments,
          "invalid_name",
          pending.index,
        ),
      );
      continue;
    }

    let argumentsObject: JsonObject;
    try {
      const candidate =
        typeof wireArguments === "string"
          ? JSON.parse(wireArguments || "{}")
          : wireArguments;
      argumentsObject = JsonObjectSchema.parse(candidate);
    } catch {
      normalizedCalls.push(
        invalidToolCall(
          internalId,
          pending.name,
          rawArguments,
          "invalid_arguments",
          pending.index,
        ),
      );
      continue;
    }

    normalizedCalls.push({
      ok: true,
      call: ToolCallSchema.parse({
        id: internalId,
        name: pending.name,
        arguments: argumentsObject,
      }),
    });
    providerCalls.push({
      internalId,
      providerId,
      name: pending.name,
      wireArguments,
    });
  }

  if (finishReason === "stop") {
    if (!content.trim() || normalizedCalls.length > 0) {
      throw createModelError(
        "MODEL_PROTOCOL_ERROR",
        "stop 结果必须只有非空可见文本",
        false,
      );
    }
  } else if (normalizedCalls.length === 0) {
    throw createModelError(
      "MODEL_PROTOCOL_ERROR",
      "tool_calls 结果没有工具调用",
      false,
    );
  }

  const nextState = cloneContinuationState(options.continuationState);
  if (providerCalls.length > 0) {
    const turn: ProviderAssistantTurn = {
      content: content || null,
      ...(reasoning ? { reasoningContent: reasoning } : {}),
      toolCalls: providerCalls,
    };
    nextState.turns.push(turn);
    for (const call of providerCalls) {
      nextState.toolCalls.set(call.internalId, call);
      nextState.turnByToolCallId.set(call.internalId, turn);
    }
  }

  return {
    content: content || null,
    toolCalls: normalizedCalls,
    finishReason,
    ...(usage === undefined ? {} : { usage }),
    continuation: createContinuationToken(nextState),
  };
}
