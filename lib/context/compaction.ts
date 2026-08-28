import type { ToolDefinition } from "@/lib/domain";

import { createContextError } from "./errors";
import { renderContextMessages } from "./message-renderer";
import { estimateContextTokens } from "./token-estimator";
import {
  CONTEXT_RETAIN_RECENT_ROUNDS,
  CONTEXT_SUMMARY_TARGET_RATIO,
  type ContextCompactionSelection,
  type ContextHistory,
  type ContextRound,
} from "./types";

interface SelectionOptions {
  history: ContextHistory;
  workspacePath: string;
  contextWindow: number;
  tools: readonly ToolDefinition[];
}

function availableRounds(history: ContextHistory): ContextRound[] {
  const fromSeq = history.latestCompaction?.retainedRange.fromSeq ?? 1;
  return history.rounds
    .filter((round) => round.endSeq >= fromSeq)
    .sort((left, right) => left.startSeq - right.startSeq);
}

export function selectContextCompaction(
  options: SelectionOptions,
): ContextCompactionSelection | undefined {
  const rounds = availableRounds(options.history);
  const baselineMessages = renderContextMessages({
    history: options.history,
    workspacePath: options.workspacePath,
    rounds,
    summary: options.history.latestCompaction?.summary,
  });
  const baseline = estimateContextTokens(
    baselineMessages,
    options.tools,
    options.contextWindow,
  );
  if (baseline.estimatedTokens < baseline.inputBudgetTokens) return undefined;
  if (rounds.length <= CONTEXT_RETAIN_RECENT_ROUNDS) {
    throw createContextError(
      "CONTEXT_BUDGET_EXCEEDED",
      "硬保留的最近上下文已超过模型输入预算",
      {
        count: rounds.length,
        inputBudgetTokens: baseline.inputBudgetTokens,
        estimatedTokens: baseline.estimatedTokens,
      },
    );
  }

  const targetSummaryTokens = Math.max(
    1,
    Math.floor(baseline.inputBudgetTokens * CONTEXT_SUMMARY_TARGET_RATIO),
  );
  const maximumEvicted = rounds.length - CONTEXT_RETAIN_RECENT_ROUNDS;
  for (let evictedCount = 1; evictedCount <= maximumEvicted; evictedCount += 1) {
    const evicted = rounds.slice(0, evictedCount);
    const retained = rounds.slice(evictedCount);
    const firstRetained = retained[0];
    if (firstRetained === undefined) break;
    const throughSeq = firstRetained.startSeq - 1;
    if (
      throughSeq <= 0 ||
      (options.history.latestCompaction !== undefined &&
        throughSeq <= options.history.latestCompaction.throughSeq)
    ) continue;
    const retainedMessages = renderContextMessages({
      history: options.history,
      workspacePath: options.workspacePath,
      rounds: retained,
    });
    const retainedEstimate = estimateContextTokens(
      retainedMessages,
      options.tools,
      options.contextWindow,
    );
    if (
      retainedEstimate.estimatedTokens + targetSummaryTokens <
      retainedEstimate.inputBudgetTokens
    ) {
      return Object.freeze({
        ...(options.history.latestCompaction === undefined
          ? {}
          : { previousSummary: options.history.latestCompaction.summary }),
        evictedRounds: Object.freeze(evicted),
        retainedRounds: Object.freeze(retained),
        throughSeq,
        retainedRange: Object.freeze({
          fromSeq: firstRetained.startSeq,
          toSeq: options.history.lastSeq,
        }),
        targetSummaryTokens,
      });
    }
  }
  throw createContextError(
    "CONTEXT_BUDGET_EXCEEDED",
    "保留完整工具回合后无法满足模型输入预算",
    {
      count: rounds.length,
      inputBudgetTokens: baseline.inputBudgetTokens,
      estimatedTokens: baseline.estimatedTokens,
    },
  );
}
