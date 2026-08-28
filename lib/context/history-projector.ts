import {
  redactSecrets,
  type DurableAgentEvent,
  type JsonObject,
  type RunId,
  type SessionId,
  type ToolCallId,
  type ToolResult,
} from "@/lib/domain";

import { createContextError } from "./errors";
import { canonicalJsonStringify } from "./token-estimator";
import type {
  ContextApprovalAnnotation,
  ContextCompactionFact,
  ContextDiagnostic,
  ContextHistory,
  ContextRound,
  ContextRunHistory,
  ContextToolExchange,
} from "./types";

interface MutableTool {
  toolCallId: ToolCallId;
  toolName: string;
  publicArguments: JsonObject;
  argumentsTruncated: boolean;
  requestedSeq: number;
  approvalId?: string;
  approval?: ContextApprovalAnnotation;
  resultSeq?: number;
  result?: ToolResult;
}

interface MutableRound {
  iteration: number;
  startSeq: number;
  finishReason?: "stop" | "tool_calls";
  content?: string;
  finalContent?: string;
  finalSeq?: number;
  tools: MutableTool[];
  committed: boolean;
}

interface MutableRun {
  runId: RunId;
  goal?: string;
  goalSeq?: number;
  pendingIteration?: number;
  currentRound?: MutableRound;
  rounds: ContextRound[];
  terminal?: ContextRunHistory["terminal"];
}

function historyError(event: DurableAgentEvent, reason: string): never {
  throw createContextError(
    "CONTEXT_HISTORY_INVALID",
    "上下文事件历史不满足消息回合约束",
    { seq: event.seq, reason },
  );
}

function toolPrefix(tool: MutableTool): string {
  return `${tool.toolName}:${canonicalJsonStringify(tool.publicArguments)}:`;
}

function snapshotTool(tool: MutableTool): ContextToolExchange {
  if (tool.result === undefined || tool.resultSeq === undefined) {
    throw createContextError(
      "CONTEXT_HISTORY_INVALID",
      "工具回合缺少结果",
      { seq: tool.requestedSeq },
    );
  }
  return Object.freeze({
    toolCallId: tool.toolCallId,
    toolName: tool.toolName,
    publicArguments: Object.freeze({ ...tool.publicArguments }),
    argumentsTruncated: tool.argumentsTruncated,
    requestedSeq: tool.requestedSeq,
    resultSeq: tool.resultSeq,
    result: Object.freeze({ ...tool.result }),
    ...(tool.approval === undefined
      ? {}
      : { approval: Object.freeze({ ...tool.approval }) }),
  }) as ContextToolExchange;
}

function commitRound(run: MutableRun, requireComplete: boolean): void {
  const round = run.currentRound;
  if (round === undefined || round.committed || round.finishReason === undefined) return;
  if (round.finishReason === "stop") {
    if (round.finalContent === undefined) {
      if (requireComplete) {
        throw createContextError(
          "CONTEXT_HISTORY_INVALID",
          "文本回合缺少 final assistant 消息",
          { iteration: round.iteration, seq: round.startSeq },
        );
      }
      return;
    }
    if (round.finalSeq === undefined) {
      throw createContextError(
        "CONTEXT_HISTORY_INVALID",
        "文本回合缺少 final 序号",
        { iteration: round.iteration },
      );
    }
    run.rounds.push(Object.freeze({
      kind: "final",
      runId: run.runId,
      iteration: round.iteration,
      startSeq: round.startSeq,
      endSeq: round.finalSeq,
      content: round.finalContent,
    }));
    round.committed = true;
    return;
  }
  if (
    round.tools.length === 0 ||
    round.tools.some((tool) => tool.result === undefined)
  ) {
    if (requireComplete) {
      throw createContextError(
        "CONTEXT_HISTORY_INVALID",
        "工具回合尚未完整结束",
        { iteration: round.iteration, seq: round.startSeq },
      );
    }
    return;
  }
  const tools = round.tools.map(snapshotTool);
  run.rounds.push(Object.freeze({
    kind: "tools",
    runId: run.runId,
    iteration: round.iteration,
    startSeq: round.startSeq,
    endSeq: Math.max(...tools.map((tool) => tool.resultSeq)),
    content: round.content ?? null,
    tools: Object.freeze(tools),
  }));
  round.committed = true;
}

function requireRun(
  run: MutableRun | undefined,
  event: DurableAgentEvent,
): MutableRun {
  if (run === undefined || event.runId !== run.runId) {
    return historyError(event, "run_not_active");
  }
  return run;
}

function requireToolRound(run: MutableRun, event: DurableAgentEvent): MutableRound {
  const round = run.currentRound;
  if (round === undefined || round.finishReason !== "tool_calls") {
    return historyError(event, "tool_event_without_tool_round");
  }
  return round;
}

function findTool(round: MutableRound, event: DurableAgentEvent, id: ToolCallId): MutableTool {
  const tool = round.tools.find((item) => item.toolCallId === id);
  if (tool === undefined) return historyError(event, "tool_call_not_found");
  return tool;
}

function freezeRun(run: MutableRun): ContextRunHistory {
  if (run.goal === undefined || run.goalSeq === undefined) {
    throw createContextError(
      "CONTEXT_HISTORY_INVALID",
      "运行缺少用户目标",
      { runId: run.runId },
    );
  }
  return Object.freeze({
    runId: run.runId,
    goal: run.goal,
    goalSeq: run.goalSeq,
    rounds: Object.freeze([...run.rounds]),
    ...(run.terminal === undefined
      ? {}
      : { terminal: Object.freeze({ ...run.terminal }) }),
  });
}

export function projectContextHistory(
  events: readonly DurableAgentEvent[],
  expectedSessionId?: SessionId,
): ContextHistory {
  let sessionId: SessionId | undefined;
  let lastSeq = 0;
  let currentRun: MutableRun | undefined;
  const runs: MutableRun[] = [];
  const unresolved = new Map<string, ContextDiagnostic>();
  let latestCompaction: ContextCompactionFact | undefined;

  for (const event of events) {
    if (event.seq !== lastSeq + 1) historyError(event, "seq_not_continuous");
    if (sessionId !== undefined && event.sessionId !== sessionId) {
      historyError(event, "session_mismatch");
    }
    if (expectedSessionId !== undefined && event.sessionId !== expectedSessionId) {
      historyError(event, "unexpected_session");
    }
    if (event.type === "session.created") {
      if (event.seq !== 1 || sessionId !== undefined || event.runId !== undefined) {
        historyError(event, "session_created_position");
      }
      sessionId = event.sessionId;
      lastSeq = event.seq;
      continue;
    }
    if (sessionId === undefined) historyError(event, "session_created_missing");

    if (event.type === "run.started") {
      if (currentRun !== undefined) historyError(event, "run_overlap");
      if (event.runId === undefined) historyError(event, "run_id_missing");
      const startedRun: MutableRun = { runId: event.runId, rounds: [] };
      currentRun = startedRun;
      runs.push(startedRun);
      lastSeq = event.seq;
      continue;
    }
    const run = requireRun(currentRun, event);

    switch (event.type) {
      case "user.message":
        if (run.goal !== undefined || run.pendingIteration !== undefined) {
          historyError(event, "goal_position");
        }
        run.goal = event.data.content;
        run.goalSeq = event.seq;
        break;
      case "model.requested":
        commitRound(run, true);
        if (run.goal === undefined || run.pendingIteration !== undefined) {
          historyError(event, "model_request_position");
        }
        if (event.data.iteration !== run.rounds.length + 1) {
          historyError(event, "iteration_not_continuous");
        }
        run.pendingIteration = event.data.iteration;
        run.currentRound = {
          iteration: event.data.iteration,
          startSeq: event.seq,
          tools: [],
          committed: false,
        };
        break;
      case "model.completed": {
        const round = run.currentRound;
        if (
          round === undefined ||
          run.pendingIteration !== event.data.iteration ||
          round.iteration !== event.data.iteration
        ) historyError(event, "model_completion_without_request");
        if (
          event.data.finishReason !== "stop" &&
          event.data.finishReason !== "tool_calls"
        ) historyError(event, "finish_reason_invalid");
        round.finishReason = event.data.finishReason;
        run.pendingIteration = undefined;
        break;
      }
      case "assistant.message": {
        const round = run.currentRound;
        if (round?.finishReason === undefined) {
          historyError(event, "assistant_without_completion");
        }
        if (event.data.kind === "final") {
          if (round.finishReason !== "stop" || round.finalContent !== undefined) {
            historyError(event, "final_position");
          }
          round.finalContent = event.data.content;
          round.finalSeq = event.seq;
        } else {
          if (
            round.finishReason !== "tool_calls" ||
            round.content !== undefined ||
            round.tools.length > 0
          ) historyError(event, "intermediate_position");
          round.content = event.data.content;
        }
        break;
      }
      case "tool.requested": {
        const round = requireToolRound(run, event);
        if (
          round.tools.some((tool) => tool.toolCallId === event.data.toolCallId) ||
          round.tools.some((tool) => tool.result !== undefined)
        ) historyError(event, "tool_request_duplicate_or_late");
        round.tools.push({
          toolCallId: event.data.toolCallId,
          toolName: event.data.toolName,
          publicArguments: event.data.publicArguments,
          argumentsTruncated: event.data.argumentsTruncated,
          requestedSeq: event.seq,
        });
        break;
      }
      case "approval.required": {
        const round = requireToolRound(run, event);
        const tool = findTool(round, event, event.data.toolCallId);
        if (tool.approvalId !== undefined) historyError(event, "approval_duplicate");
        tool.approvalId = event.data.approvalId;
        break;
      }
      case "approval.resolved": {
        const round = requireToolRound(run, event);
        const tool = round.tools.find((item) => item.approvalId === event.data.approvalId);
        if (tool === undefined || tool.approval !== undefined) {
          historyError(event, "approval_resolution_invalid");
        }
        tool.approval = {
          approved: event.data.approved,
          ...(event.data.reason === undefined ? {} : { reason: event.data.reason }),
        };
        break;
      }
      case "tool.started": {
        const round = requireToolRound(run, event);
        findTool(round, event, event.data.toolCallId);
        break;
      }
      case "tool.result": {
        const round = requireToolRound(run, event);
        const tool = findTool(round, event, event.data.toolCallId);
        if (tool.result !== undefined || tool.toolName !== event.data.toolName) {
          historyError(event, "tool_result_invalid");
        }
        tool.result = event.data.result;
        tool.resultSeq = event.seq;
        const prefix = toolPrefix(tool);
        if (event.data.result.ok) {
          for (const key of unresolved.keys()) {
            if (key.startsWith(prefix)) unresolved.delete(key);
          }
        } else {
          const error = event.data.result.error;
          if (error === undefined) historyError(event, "failed_result_without_error");
          const key = `${prefix}${error.code}`;
          unresolved.set(key, Object.freeze({
            key,
            seq: event.seq,
            runId: run.runId,
            kind: "tool_error",
            code: error.code,
            message: redactSecrets(error.message),
          }));
        }
        break;
      }
      case "context.compacted": {
        const previous = latestCompaction;
        if (
          event.data.retainedRange.fromSeq <= event.data.throughSeq ||
          event.data.retainedRange.toSeq >= event.seq ||
          event.data.retainedRange.toSeq > lastSeq ||
          (previous !== undefined &&
            (event.data.throughSeq <= previous.throughSeq ||
              event.data.retainedRange.fromSeq < previous.retainedRange.fromSeq))
        ) historyError(event, "compaction_range_invalid");
        latestCompaction = Object.freeze({
          seq: event.seq,
          runId: run.runId,
          throughSeq: event.data.throughSeq,
          summary: event.data.summary,
          retainedRange: Object.freeze({ ...event.data.retainedRange }),
        });
        break;
      }
      case "run.completed":
      case "run.failed":
      case "run.cancelled":
      case "run.interrupted": {
        commitRound(run, false);
        const status = event.type.slice(4) as "completed" | "failed" | "cancelled" | "interrupted";
        run.terminal = {
          status,
          seq: event.seq,
          ...(event.type === "run.failed" ? { error: event.data.error } : {}),
          ...(event.type === "run.cancelled" || event.type === "run.interrupted"
            ? { reason: event.data.reason }
            : {}),
        };
        currentRun = undefined;
        break;
      }
    }
    lastSeq = event.seq;
  }

  if (sessionId === undefined || runs.length === 0) {
    throw createContextError(
      "CONTEXT_HISTORY_INVALID",
      "上下文历史缺少运行事实",
      { count: events.length },
    );
  }
  if (currentRun !== undefined) commitRound(currentRun, false);
  const frozenRuns = runs.map(freezeRun);
  const initialGoal = frozenRuns.find((run) => run.goal.length > 0)?.goal;
  if (initialGoal === undefined) {
    throw createContextError("CONTEXT_HISTORY_INVALID", "上下文历史缺少初始目标");
  }
  const lastCompletedIndex = frozenRuns.reduce(
    (value, run, index) => run.terminal?.status === "completed" ? index : value,
    -1,
  );
  let latestTerminalIndex = -1;
  for (let index = frozenRuns.length - 1; index >= 0; index -= 1) {
    if (frozenRuns[index].terminal !== undefined) {
      latestTerminalIndex = index;
      break;
    }
  }
  const latestTerminal = latestTerminalIndex < 0
    ? undefined
    : frozenRuns[latestTerminalIndex].terminal;
  if (
    latestTerminal !== undefined &&
    latestTerminal.status !== "completed" &&
    latestTerminalIndex > lastCompletedIndex
  ) {
    const run = frozenRuns[latestTerminalIndex];
    const code = latestTerminal.error?.code;
    const message = latestTerminal.error?.message
      ?? latestTerminal.reason
      ?? `运行以 ${latestTerminal.status} 结束`;
    unresolved.set(`terminal:${run.runId}`, Object.freeze({
      key: `terminal:${run.runId}`,
      seq: latestTerminal.seq,
      runId: run.runId,
      kind: "run_terminal",
      ...(code === undefined ? {} : { code }),
      message: redactSecrets(message),
    }));
  }
  const rounds = frozenRuns.flatMap((run) => run.rounds)
    .sort((left, right) => left.startSeq - right.startSeq);
  const diagnostics = [...unresolved.values()].sort((a, b) => a.seq - b.seq);
  return Object.freeze({
    sessionId,
    lastSeq,
    initialGoal,
    ...(currentRun === undefined ? {} : { activeRunId: currentRun.runId }),
    runs: Object.freeze(frozenRuns),
    rounds: Object.freeze(rounds),
    unresolvedDiagnostics: Object.freeze(diagnostics),
    ...(latestCompaction === undefined ? {} : { latestCompaction }),
  });
}
