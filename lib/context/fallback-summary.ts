import { createHash } from "node:crypto";

import { redactSecrets } from "@/lib/domain";

import { createContextError } from "./errors";
import { ContextSummaryEnvelopeSchema } from "./schemas";
import {
  canonicalJsonStringify,
  estimateTextTokens,
} from "./token-estimator";
import {
  CONTEXT_SUMMARY_MARKER,
  MAX_CONTEXT_SUMMARY_CHARACTERS,
  type ContextCompactionSelection,
  type ContextHistory,
  type ContextRound,
} from "./types";

interface FallbackSummaryOptions {
  history: ContextHistory;
  selection: ContextCompactionSelection;
}

const ABSOLUTE_PATH = /(?:[A-Za-z]:\\|\/(?:Users|home|tmp|private|var|etc|opt)\/)[^\s"'`,，；;)}\]]+/gu;

function safeText(value: string, maximum = 4_096): string {
  return redactSecrets(value)
    .replace(ABSOLUTE_PATH, "[绝对路径已省略]")
    .replaceAll("\u0000", "")
    .slice(0, maximum)
    .trim();
}

function digest(lines: readonly string[]): string {
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

function toolFacts(round: Extract<ContextRound, { kind: "tools" }>): string[] {
  return round.tools.map((tool) => {
    const arguments_ = safeText(canonicalJsonStringify(tool.publicArguments), 2_048);
    const result = tool.result;
    const status = result.ok ? "成功" : `失败:${result.error?.code ?? "UNKNOWN"}`;
    return `工具事实 seq=${tool.resultSeq}：${tool.toolName}；参数=${arguments_}；结果=${status}；摘要=${safeText(result.summary, 1_024)}`;
  });
}

function roundFacts(round: ContextRound): string[] {
  if (round.kind === "tools") return toolFacts(round);
  if (round.kind === "plan") {
    return [`计划事实 seq=${round.endSeq}：${safeText(round.content, 2_048)}`];
  }
  return [`完成叙述 seq=${round.endSeq}：${safeText(round.content, 2_048)}`];
}

function candidateFacts(options: FallbackSummaryOptions): string[] {
  const active = options.history.runs.find(
    (run) => run.runId === options.history.activeRunId,
  );
  const facts: string[] = [];
  if (options.selection.previousSummary !== undefined) {
    const previous = options.selection.previousSummary
      .replace(new RegExp(`^${CONTEXT_SUMMARY_MARKER}\\s*`, "u"), "");
    facts.push(`此前摘要：${safeText(previous, 8_192)}`);
  }
  for (const diagnostic of [...options.history.unresolvedDiagnostics]
    .filter((item) => item.seq <= options.selection.throughSeq)
    .sort((left, right) => right.seq - left.seq)) {
    facts.push(
      `未解决错误 seq=${diagnostic.seq}：${diagnostic.code ?? diagnostic.kind}；${safeText(diagnostic.message, 1_024)}`,
    );
  }
  const relevantRunIds = new Set(
    options.selection.evictedRounds.map((round) => round.runId),
  );
  for (const run of options.history.runs) {
    if (!relevantRunIds.has(run.runId) || run.plan === undefined) continue;
    const decision = run.plan.approved === true
      ? "已批准"
      : run.plan.approved === false
        ? "已拒绝"
        : "等待批准";
    facts.push(`计划决定：${decision}；${safeText(run.plan.content, 2_048)}`);
  }
  for (const round of [...options.selection.evictedRounds].reverse()) {
    facts.push(...roundFacts(round));
  }
  if (active?.goal !== undefined) {
    facts.unshift(`当前目标：${safeText(active.goal, 4_096)}`);
  }
  return facts.filter((fact) => fact.length > 0);
}

export function generateDeterministicFallbackSummary(
  options: FallbackSummaryOptions,
): string {
  const required = [
    CONTEXT_SUMMARY_MARKER,
    "本地降级摘要：模型摘要不可用；以下仅为结构化事件事实，不代表任务已完成。",
    `初始目标：${safeText(options.history.initialGoal, 4_096)}`,
  ];
  const candidates = candidateFacts(options);
  const included: string[] = [];
  const omitted: string[] = [];
  const targetTokens = options.selection.targetSummaryTokens;
  const placeholder = `省略事实：${candidates.length}；SHA-256=${"0".repeat(64)}`;
  if (estimateTextTokens([...required, placeholder].join("\n")) > targetTokens) {
    throw createContextError(
      "CONTEXT_BUDGET_EXCEEDED",
      "本地降级摘要的最小事实超过目标预算",
      { targetTokens, reason: "fallback_over_budget" },
    );
  }

  for (const fact of candidates) {
    const trial = [...required, ...included, fact, placeholder].join("\n");
    if (estimateTextTokens(trial) <= targetTokens) included.push(fact);
    else omitted.push(fact);
  }
  const omission = omitted.length === 0
    ? "省略事实：0"
    : `省略事实：${omitted.length}；SHA-256=${digest(omitted)}`;
  const content = [...required.slice(1), ...included, omission].join("\n");
  const envelope = ContextSummaryEnvelopeSchema.safeParse({
    marker: CONTEXT_SUMMARY_MARKER,
    content,
  });
  if (!envelope.success) {
    throw createContextError(
      "CONTEXT_BUDGET_EXCEEDED",
      "本地降级摘要不满足摘要协议",
      { targetTokens, reason: "fallback_over_budget" },
      envelope.error,
    );
  }
  const summary = `${envelope.data.marker}\n${envelope.data.content}`;
  if (
    summary.length > MAX_CONTEXT_SUMMARY_CHARACTERS ||
    estimateTextTokens(summary) > targetTokens
  ) {
    throw createContextError(
      "CONTEXT_BUDGET_EXCEEDED",
      "本地降级摘要超过目标预算",
      { targetTokens, reason: "fallback_over_budget" },
    );
  }
  return summary;
}
