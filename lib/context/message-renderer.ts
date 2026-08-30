import {
  ChatMessageSchema,
  redactSecrets,
  type ChatMessage,
  type JsonObject,
  type JsonValue,
} from "@/lib/domain";

import { createContextError } from "./errors";
import {
  renderStableContextMemory,
  renderSystemPolicy,
  renderVolatileContextMemory,
} from "./system-prompt";
import { OUTPUT_LANGUAGE_POLICY } from "./language-policy";
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

const INVALID_TOOL_CALL_NAME = "invalid_tool_call";
const SAFE_INVALID_REASONS = new Set(["invalid_name", "invalid_arguments"]);

function invalidToolCorrection(
  tools: Extract<ContextRound, { kind: "tools" }>["tools"],
): ChatMessage | undefined {
  const invalid = tools.filter((tool) => tool.toolName === INVALID_TOOL_CALL_NAME);
  if (invalid.length === 0) return undefined;
  const reasons = invalid.map((tool) => {
    const value = tool.result.error?.details?.reason;
    return typeof value === "string" && SAFE_INVALID_REASONS.has(value)
      ? value
      : "invalid_arguments";
  });
  const indexes = invalid.map((tool, position) => {
    const value = tool.result.error?.details?.index;
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 127
      ? value
      : position;
  });
  return {
    role: "system",
    content: `上一轮有 ${Math.min(invalid.length, 128)} 个工具调用未通过工具校验，均未执行。请依据当前工具 Schema 重新生成。原因：${reasons.slice(0, 128).join(",")}；索引：${indexes.slice(0, 128).join(",")}。`,
  };
}

function renderRound(round: ContextRound): ChatMessage[] {
  if (round.kind === "final" || round.kind === "plan") {
    return [{ role: "assistant", content: redactSecrets(round.content) }];
  }
  const validTools = round.tools.filter((tool) => tool.toolName !== INVALID_TOOL_CALL_NAME);
  const correction = invalidToolCorrection(round.tools);
  const messages: ChatMessage[] = [];
  if (validTools.length > 0) {
    messages.push({
      role: "assistant",
      content: round.content === null ? null : redactSecrets(round.content),
      toolCalls: validTools.map((tool) => ({
        id: tool.toolCallId,
        name: tool.toolName,
        arguments: tool.publicArguments,
      })),
    });
    messages.push(...validTools.map((tool): ChatMessage => ({
      role: "tool",
      toolCallId: tool.toolCallId,
      name: tool.toolName,
      content: toolContent(round, round.tools.indexOf(tool)),
    })));
  } else if (round.content !== null && round.content.length > 0) {
    messages.push({ role: "assistant", content: redactSecrets(round.content) });
  }
  if (correction !== undefined) messages.push(correction);
  return messages;
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
    {
      role: "system",
      content: renderSystemPolicy(
        activeRun.phase === "executing"
          ? "executing"
          : activeRun.phase === "planning" || activeRun.phase === "awaiting_plan_approval"
            ? "planning"
            : "normal",
      ),
    },
    {
      role: "system",
      content: renderStableContextMemory({
        workspacePath: input.workspacePath,
        initialGoal: input.history.initialGoal,
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
    if (round.kind === "plan" && run.plan?.approved !== undefined) {
      messages.push({
        role: "user",
        content: run.plan.approved
          ? "我批准上述持久化计划提案，请现在执行。这不代表批准任何仍需单独审批的危险工具。"
          : "我拒绝上述持久化计划提案，请勿执行。",
      });
    }
  }
  if (!seenGoals.has(activeRun.runId)) {
    messages.push({ role: "user", content: redactSecrets(activeRun.goal) });
  }
  messages.push({
    role: "system",
    content: renderVolatileContextMemory({
      summary: input.summary,
      diagnostics: input.history.unresolvedDiagnostics,
      plan: activeRun.plan,
    }),
  });
  messages.push({ role: "system", content: OUTPUT_LANGUAGE_POLICY });
  const parsed = ChatMessageSchema.array().min(4).safeParse(messages);
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
