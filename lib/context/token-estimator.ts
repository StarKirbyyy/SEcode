import {
  utf8ByteLength,
  type ChatMessage,
  type JsonValue,
  type ToolDefinition,
} from "@/lib/domain";

import { createContextError } from "./errors";
import {
  CONTEXT_COMPACTION_THRESHOLD_RATIO,
  ESTIMATED_MESSAGE_OVERHEAD_TOKENS,
  ESTIMATED_REQUEST_OVERHEAD_TOKENS,
  ESTIMATED_UTF8_BYTES_PER_TOKEN,
  type ContextTokenEstimate,
} from "./types";

function canonicalize(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite JSON number");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = canonicalize(item);
    }
    return result;
  }
  throw new TypeError("value is not JSON serializable");
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function estimateTextTokens(value: string): number {
  return Math.ceil(utf8ByteLength(value) / ESTIMATED_UTF8_BYTES_PER_TOKEN);
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw createContextError(
      "CONTEXT_INPUT_INVALID",
      "上下文 token 估算发生整数溢出",
    );
  }
  return value;
}

export function calculateInputBudget(contextWindow: number): number {
  if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0) {
    throw createContextError(
      "CONTEXT_INPUT_INVALID",
      "模型上下文窗口必须是正安全整数",
      { contextWindow: Number.isFinite(contextWindow) ? contextWindow : -1 },
    );
  }
  const budget = Math.floor(
    contextWindow * CONTEXT_COMPACTION_THRESHOLD_RATIO,
  );
  if (!Number.isSafeInteger(budget) || budget <= 0) {
    throw createContextError(
      "CONTEXT_BUDGET_EXCEEDED",
      "模型上下文窗口不足以构建请求",
      { contextWindow },
    );
  }
  return budget;
}

export function estimateContextTokens(
  messages: readonly ChatMessage[],
  tools: readonly ToolDefinition[],
  contextWindow: number,
): ContextTokenEstimate {
  let messageTokens = 0;
  for (const message of messages) {
    messageTokens = safeAdd(
      messageTokens,
      safeAdd(
        estimateTextTokens(canonicalJsonStringify(message)),
        ESTIMATED_MESSAGE_OVERHEAD_TOKENS,
      ),
    );
  }
  const toolTokens = estimateTextTokens(canonicalJsonStringify(tools));
  const estimatedTokens = safeAdd(
    safeAdd(messageTokens, toolTokens),
    ESTIMATED_REQUEST_OVERHEAD_TOKENS,
  );
  return Object.freeze({
    inputBudgetTokens: calculateInputBudget(contextWindow),
    estimatedTokens,
    messageTokens,
    toolTokens,
  });
}
