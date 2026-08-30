import type { ToolDefinition } from "@/lib/domain";

import { createContextError } from "./errors";
import { renderContextMessages } from "./message-renderer";
import { estimateContextTokens } from "./token-estimator";
import {
  CONTEXT_RETAIN_RECENT_ROUNDS,
  CONTEXT_SOFT_COMPACTION_TRIGGER_TOKENS,
  CONTEXT_SUMMARY_TARGET_RATIO,
  MAX_CONTEXT_SUMMARY_TARGET_TOKENS,
  type ContextCompactionSelection,
  type ContextHistory,
  type ContextRound,
} from "./types";

interface SelectionOptions {
  history: ContextHistory;
  workspacePath: string;
  contextWindow: number;
  tools: readonly ToolDefinition[];
  rounds?: readonly ContextRound[];
}

function availableRounds(
  history: ContextHistory,
  candidateRounds: readonly ContextRound[],
): ContextRound[] {
  const fromSeq = history.latestCompaction?.retainedRange.fromSeq ?? 1;
  return candidateRounds
    .filter((round) => round.endSeq >= fromSeq)
    .sort((left, right) => left.startSeq - right.startSeq);
}

export function selectContextCompaction(
  options: SelectionOptions,
): ContextCompactionSelection | undefined {
  const rounds = availableRounds(
    options.history,
    options.rounds ?? options.history.rounds,
  );
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
  const softTrigger = Math.min(
    baseline.inputBudgetTokens,
    CONTEXT_SOFT_COMPACTION_TRIGGER_TOKENS,
  );
  if (baseline.estimatedTokens < softTrigger) return undefined;
  if (rounds.length <= CONTEXT_RETAIN_RECENT_ROUNDS) {
    if (baseline.estimatedTokens < baseline.inputBudgetTokens) return undefined;
    throw createContextError(
      "CONTEXT_BUDGET_EXCEEDED",
      "硬保留的最近上下文已超过模型输入预算",
      {
        reason: "projected_recent_rounds_over_budget",
        count: rounds.length,
        inputBudgetTokens: baseline.inputBudgetTokens,
        estimatedTokens: baseline.estimatedTokens,
      },
    );
  }

  const targetSummaryTokens = Math.max(
    1,
    Math.min(
      Math.floor(softTrigger * CONTEXT_SUMMARY_TARGET_RATIO),
      MAX_CONTEXT_SUMMARY_TARGET_TOKENS,
    ),
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
      retainedEstimate.estimatedTokens + targetSummaryTokens < softTrigger
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
  if (baseline.estimatedTokens < baseline.inputBudgetTokens) return undefined;
  throw createContextError(
    "CONTEXT_BUDGET_EXCEEDED",
    "保留完整工具回合后无法满足模型输入预算",
    {
      reason: "projected_recent_rounds_over_budget",
      count: rounds.length,
      inputBudgetTokens: baseline.inputBudgetTokens,
      estimatedTokens: baseline.estimatedTokens,
    },
  );
}
