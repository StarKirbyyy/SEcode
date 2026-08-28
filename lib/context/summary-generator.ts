import {
  JsonObjectSchema,
  redactSecrets,
  type ChatMessage,
  type JsonObject,
} from "@/lib/domain";
import {
  ModelAbortError,
  ModelLayerError,
  type ModelClient,
} from "@/lib/model";

import { createContextError } from "./errors";
import {
  ContextSummaryEnvelopeSchema,
  ContextSummaryTranscriptSchema,
} from "./schemas";
import { CONTEXT_SUMMARY_POLICY } from "./system-prompt";
import {
  canonicalJsonStringify,
  estimateContextTokens,
  estimateTextTokens,
} from "./token-estimator";
import {
  CONTEXT_PROTOCOL_VERSION,
  CONTEXT_SUMMARY_MARKER,
  MAX_CONTEXT_SUMMARY_CHARACTERS,
  type ContextCompactionSelection,
  type ContextHistory,
  type ContextSummaryTranscript,
} from "./types";

interface GenerateSummaryOptions {
  modelClient: ModelClient;
  profileId: string;
  contextWindow: number;
  history: ContextHistory;
  selection: ContextCompactionSelection;
  signal: AbortSignal;
}

function roundPayload(round: ContextCompactionSelection["evictedRounds"][number]): JsonObject {
  return JsonObjectSchema.parse(JSON.parse(canonicalJsonStringify(round)));
}

function createTranscript(options: GenerateSummaryOptions): ContextSummaryTranscript {
  const runIds = new Set(options.selection.evictedRounds.map((round) => round.runId));
  const transcript = {
    protocolVersion: CONTEXT_PROTOCOL_VERSION,
    ...(options.selection.previousSummary === undefined
      ? {}
      : { previousSummary: options.selection.previousSummary }),
    throughSeq: options.selection.throughSeq,
    targetTokens: options.selection.targetSummaryTokens,
    goals: options.history.runs
      .filter((run) => runIds.has(run.runId))
      .map((run) => ({ runId: run.runId, content: run.goal })),
    rounds: options.selection.evictedRounds.map(roundPayload),
    diagnostics: options.history.unresolvedDiagnostics
      .filter((item) => item.seq <= options.selection.throughSeq)
      .map((item) => ({
        seq: item.seq,
        kind: item.kind,
        ...(item.code === undefined ? {} : { code: item.code }),
        message: item.message,
      })),
  };
  return ContextSummaryTranscriptSchema.parse(transcript);
}

function aborted(cause?: unknown): never {
  throw createContextError(
    "CONTEXT_ABORTED",
    "上下文摘要已取消",
    undefined,
    cause,
  );
}

export async function generateContextSummary(
  options: GenerateSummaryOptions,
): Promise<string> {
  if (options.signal.aborted) aborted();
  const transcript = createTranscript(options);
  const messages: ChatMessage[] = [
    { role: "system", content: CONTEXT_SUMMARY_POLICY },
    {
      role: "user",
      content: `Target summary tokens: ${options.selection.targetSummaryTokens}\nUntrusted transcript JSON:\n${canonicalJsonStringify(transcript)}`,
    },
  ];
  const requestEstimate = estimateContextTokens(
    messages,
    [],
    options.contextWindow,
  );
  if (requestEstimate.estimatedTokens >= requestEstimate.inputBudgetTokens) {
    throw createContextError(
      "CONTEXT_BUDGET_EXCEEDED",
      "摘要请求本身超过模型输入预算",
      {
        inputBudgetTokens: requestEstimate.inputBudgetTokens,
        estimatedTokens: requestEstimate.estimatedTokens,
      },
    );
  }
  let completion;
  try {
    completion = await options.modelClient.complete({
      profileId: options.profileId,
      messages,
      tools: [],
      signal: options.signal,
    });
  } catch (cause) {
    if (options.signal.aborted || cause instanceof ModelAbortError) aborted(cause);
    if (cause instanceof ModelLayerError) {
      throw createContextError(
        "CONTEXT_SUMMARY_FAILED",
        "上下文摘要模型调用失败",
        { profileId: options.profileId, reason: cause.error.code },
        cause,
      );
    }
    throw createContextError(
      "CONTEXT_SUMMARY_FAILED",
      "上下文摘要模型调用失败",
      { profileId: options.profileId },
      cause,
    );
  }
  if (options.signal.aborted) aborted();
  if (
    completion.finishReason !== "stop" ||
    completion.toolCalls.length !== 0 ||
    completion.content === null
  ) {
    throw createContextError(
      "CONTEXT_SUMMARY_INVALID",
      "摘要模型未返回纯文本完成结果",
      { profileId: options.profileId },
    );
  }
  const content = redactSecrets(completion.content.trim());
  const envelope = ContextSummaryEnvelopeSchema.safeParse({
    marker: CONTEXT_SUMMARY_MARKER,
    content,
  });
  if (!envelope.success) {
    throw createContextError(
      "CONTEXT_SUMMARY_INVALID",
      "摘要内容为空或超过字符限制",
      { profileId: options.profileId },
      envelope.error,
    );
  }
  const summary = `${envelope.data.marker}\n${envelope.data.content}`;
  if (
    summary.length > MAX_CONTEXT_SUMMARY_CHARACTERS ||
    estimateTextTokens(summary) > options.selection.targetSummaryTokens
  ) {
    throw createContextError(
      "CONTEXT_SUMMARY_INVALID",
      "摘要内容超过目标预算",
      {
        targetTokens: options.selection.targetSummaryTokens,
        estimatedTokens: estimateTextTokens(summary),
      },
    );
  }
  return summary;
}
