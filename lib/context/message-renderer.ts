import {
  ChatMessageSchema,
  redactSecrets,
  type ChatMessage,
  type JsonObject,
  type JsonValue,
} from "@/lib/domain";

import { createContextError } from "./errors";
import {
  renderContextMemory,
  renderSystemPolicy,
} from "./system-prompt";
import { canonicalJsonStringify } from "./token-estimator";
import type {
  ContextRenderInput,
  ContextRound,
} from "./types";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

function toolContent(round: Extract<ContextRound, { kind: "tools" }>, index: number): string {
  const tool = round.tools[index];
  const payload: JsonObject = {
    result: tool.result as unknown as JsonValue,
    argumentsTruncated: tool.argumentsTruncated,
    ...(tool.approval === undefined
      ? {}
      : { approval: tool.approval as unknown as JsonValue }),
  };
  return redactSecrets(canonicalJsonStringify(payload));
}

function renderRound(round: ContextRound): ChatMessage[] {
  if (round.kind === "final") {
    return [{ role: "assistant", content: redactSecrets(round.content) }];
  }
  const assistant: ChatMessage = {
    role: "assistant",
    content: round.content === null ? null : redactSecrets(round.content),
    toolCalls: round.tools.map((tool) => ({
      id: tool.toolCallId,
      name: tool.toolName,
      arguments: tool.publicArguments,
    })),
  };
  return [
    assistant,
    ...round.tools.map((tool, index): ChatMessage => ({
      role: "tool",
      toolCallId: tool.toolCallId,
      name: tool.toolName,
      content: toolContent(round, index),
    })),
  ];
}

export function roundsForCurrentProjection(input: ContextRenderInput): readonly ContextRound[] {
  const minimumSeq = input.history.latestCompaction?.retainedRange.fromSeq ?? 1;
  return input.rounds
    .filter((round) => round.endSeq >= minimumSeq)
    .sort((left, right) => left.startSeq - right.startSeq);
}

export function renderContextMessages(input: ContextRenderInput): readonly ChatMessage[] {
  const activeRun = input.history.runs.find(
    (run) => run.runId === input.history.activeRunId,
  );
  if (activeRun === undefined) {
    throw createContextError(
      "CONTEXT_HISTORY_INVALID",
      "上下文历史缺少当前活动运行",
    );
  }
  const messages: ChatMessage[] = [
    { role: "system", content: renderSystemPolicy() },
    {
      role: "system",
      content: renderContextMemory({
        workspacePath: input.workspacePath,
        initialGoal: input.history.initialGoal,
        currentGoal: activeRun.goal,
        summary: input.summary,
        diagnostics: input.history.unresolvedDiagnostics,
      }),
    },
  ];
  const seenGoals = new Set<string>();
  for (const round of [...input.rounds].sort((a, b) => a.startSeq - b.startSeq)) {
    const run = input.history.runs.find((item) => item.runId === round.runId);
    if (run === undefined) {
      throw createContextError(
        "CONTEXT_HISTORY_INVALID",
        "上下文回合引用未知运行",
        { runId: round.runId, seq: round.startSeq },
      );
    }
    if (!seenGoals.has(run.runId)) {
      messages.push({ role: "user", content: redactSecrets(run.goal) });
      seenGoals.add(run.runId);
    }
    messages.push(...renderRound(round));
  }
  if (!seenGoals.has(activeRun.runId)) {
    messages.push({ role: "user", content: redactSecrets(activeRun.goal) });
  }
  const parsed = ChatMessageSchema.array().min(3).safeParse(messages);
  if (!parsed.success) {
    throw createContextError(
      "CONTEXT_HISTORY_INVALID",
      "投影后的模型消息不满足协议",
      { count: messages.length },
      parsed.error,
    );
  }
  return deepFreeze(parsed.data);
}
