import {
  redactSecrets,
  type DurableAgentEvent,
  type JsonObject,
  type RunId,
  type SessionId,
  type ToolCallId,
  type ToolResult,
} from "@/lib/domain";
import type { AgentRunPhase } from "@/lib/agent/types";

import { createContextError } from "./errors";
import { canonicalJsonStringify } from "./token-estimator";
import type {
  ContextApprovalAnnotation,
  ContextCompactionFact,
  ContextDiagnostic,
  ContextHistory,
  ContextPlanFact,
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
  rejectionAction?: "retry" | "content_suppressed";
  completionEvidenceRejected?: number;
  writeDependencyRejected?: number;
  tools: MutableTool[];
  committed: boolean;
}

interface MutableRun {
  runId: RunId;
  planningEnabled: boolean;
  phase: AgentRunPhase;
  goal?: string;
  goalSeq?: number;
  modelRequests: number;
  pendingIteration?: number;
  currentRound?: MutableRound;
  rounds: ContextRound[];
  plan?: ContextPlanFact;
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
    if (
      round.rejectionAction === "retry" ||
      round.completionEvidenceRejected !== undefined ||
      round.writeDependencyRejected !== undefined
    ) {
      round.committed = true;
      return;
    }
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
    planningEnabled: run.planningEnabled,
    phase: run.phase,
    goal: run.goal,
    goalSeq: run.goalSeq,
    rounds: Object.freeze([...run.rounds]),
    ...(run.plan === undefined ? {} : { plan: Object.freeze({ ...run.plan }) }),
    ...(run.terminal === undefined
      ? {}
      : { terminal: Object.freeze({ ...run.terminal }) }),
  });
}

export interface ContextHistoryProjection {
  expectedSessionId?: SessionId;
  sessionId?: SessionId;
  lastSeq: number;
  currentRun?: MutableRun;
  runs: MutableRun[];
  unresolved: Map<string, ContextDiagnostic>;
  latestCompaction?: ContextCompactionFact;
}

export function createContextHistoryProjection(
  expectedSessionId?: SessionId,
): ContextHistoryProjection {
  return {
    ...(expectedSessionId === undefined ? {} : { expectedSessionId }),
    lastSeq: 0,
    runs: [],
    unresolved: new Map<string, ContextDiagnostic>(),
  };
}

export function appendContextHistoryEvents(
  projection: ContextHistoryProjection,
  events: readonly DurableAgentEvent[],
): void {
  for (const event of events) {
    if (event.seq !== projection.lastSeq + 1) historyError(event, "seq_not_continuous");
    if (projection.sessionId !== undefined && event.sessionId !== projection.sessionId) {
      historyError(event, "session_mismatch");
    }
    if (
      projection.expectedSessionId !== undefined &&
      event.sessionId !== projection.expectedSessionId
    ) {
      historyError(event, "unexpected_session");
    }
    if (event.type === "session.created") {
      if (
        event.seq !== 1 ||
        projection.sessionId !== undefined ||
        event.runId !== undefined
      ) {
        historyError(event, "session_created_position");
      }
      projection.sessionId = event.sessionId;
      projection.lastSeq = event.seq;
      continue;
    }
    if (projection.sessionId === undefined) {
      historyError(event, "session_created_missing");
    }

    if (event.type === "run.started") {
      if (projection.currentRun !== undefined) historyError(event, "run_overlap");
      if (event.runId === undefined) historyError(event, "run_id_missing");
      const startedRun: MutableRun = {
        runId: event.runId,
        planningEnabled: event.data.planningEnabled ?? false,
        phase: event.data.planningEnabled === true ? "planning" : "normal",
        modelRequests: 0,
        rounds: [],
      };
      projection.currentRun = startedRun;
      projection.runs.push(startedRun);
      projection.lastSeq = event.seq;
      continue;
    }
    const run = requireRun(projection.currentRun, event);

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
        if (event.data.iteration !== run.modelRequests + 1) {
          historyError(event, "iteration_not_continuous");
        }
        run.modelRequests = event.data.iteration;
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
      case "model.output.rejected": {
        const round = run.currentRound;
        if (
          round === undefined ||
          run.pendingIteration !== undefined ||
          round.iteration !== event.data.iteration ||
          round.rejectionAction !== undefined ||
          (event.data.action === "retry" && round.finishReason !== "stop") ||
          (event.data.action === "content_suppressed" &&
            round.finishReason !== "tool_calls")
        ) historyError(event, "model_output_rejection_position");
        round.rejectionAction = event.data.action;
        break;
      }
      case "completion.evidence.rejected": {
        const round = run.currentRound;
        if (
          round === undefined ||
          run.pendingIteration !== undefined ||
          round.finishReason !== "stop" ||
          round.iteration !== event.data.iteration ||
          round.rejectionAction !== undefined ||
          round.completionEvidenceRejected !== undefined
        ) historyError(event, "completion_evidence_rejection_position");
        round.completionEvidenceRejected = event.data.correctionAttempt;
        const key = `completion-evidence:${run.runId}`;
        projection.unresolved.set(key, Object.freeze({
          key,
          seq: event.seq,
          runId: run.runId,
          kind: "completion_evidence",
          code: "POST_CHANGE_VERIFICATION_MISSING",
          message: event.data.uncoveredPaths !== undefined && event.data.uncoveredPaths.length > 0
            ? `以下相对路径仍缺少结构化验证：${event.data.uncoveredPaths.join("、")}${event.data.uncoveredPathsTruncated === true ? "（列表已截断）" : ""}`
            : event.data.uncoveredScopes === undefined
              ? "代码或配置变更后仍缺少成功的 lint、typecheck、test 或 build 验证"
              : `以下相对范围仍缺少结构化验证：${event.data.uncoveredScopes.join("、")}`,
        }));
        break;
      }
      case "validation.repair.warning": {
        const round = run.currentRound;
        if (round === undefined || run.pendingIteration !== undefined || round.finishReason !== "tool_calls") {
          historyError(event, "validation_repair_warning_position");
        }
        const key = `validation-repair:${run.runId}:${event.data.verificationKind}:${event.data.cwd}`;
        projection.unresolved.set(key, Object.freeze({
          key,
          seq: event.seq,
          runId: run.runId,
          kind: "validation_repair",
          code: "VALIDATION_REPAIR_WARNING",
          message: `${event.data.verificationKind} 已失败 ${event.data.failedAttempts} 次${event.data.repeatedDiagnostic ? "，诊断重复" : ""}${event.data.mutatedPaths === undefined || event.data.mutatedPaths.length === 0 ? "" : `；期间修改：${event.data.mutatedPaths.join("、")}`}`,
        }));
        break;
      }
      case "write.dependency.rejected": {
        const round = run.currentRound;
        if (
          round === undefined ||
          run.pendingIteration !== undefined ||
          round.finishReason !== "stop" ||
          round.iteration !== event.data.iteration ||
          round.rejectionAction !== undefined ||
          round.writeDependencyRejected !== undefined
        ) historyError(event, "write_dependency_rejection_position");
        round.writeDependencyRejected = event.data.correctionAttempt;
        const key = `write-dependency:${run.runId}`;
        projection.unresolved.set(key, Object.freeze({
          key,
          seq: event.seq,
          runId: run.runId,
          kind: "tool_error",
          code: "WRITE_DEPENDENCY_UNRESOLVED",
          message: `仍需创建并重新观察相对父目录：${event.data.pendingParents.join("、")}`,
        }));
        break;
      }
      case "plan.proposed": {
        const round = run.currentRound;
        if (
          !run.planningEnabled ||
          run.phase !== "planning" ||
          run.plan !== undefined ||
          round?.finishReason !== "stop" ||
          round.rejectionAction !== undefined ||
          round.committed
        ) historyError(event, "plan_proposal_position");
        run.plan = {
          planId: event.data.planId,
          approvalId: event.data.approvalId,
          content: event.data.content,
          proposedSeq: event.seq,
        };
        run.rounds.push(Object.freeze({
          kind: "plan",
          runId: run.runId,
          iteration: round.iteration,
          startSeq: round.startSeq,
          endSeq: event.seq,
          content: event.data.content,
        }));
        round.committed = true;
        run.phase = "awaiting_plan_approval";
        break;
      }
      case "plan.approval.resolved": {
        const plan = run.plan;
        if (
          run.phase !== "awaiting_plan_approval" ||
          plan === undefined ||
          plan.approved !== undefined ||
          plan.planId !== event.data.planId ||
          plan.approvalId !== event.data.approvalId
        ) historyError(event, "plan_resolution_invalid");
        plan.approved = event.data.approved;
        plan.resolvedSeq = event.seq;
        if (event.data.reason !== undefined) plan.reason = event.data.reason;
        if (event.data.approved) {
          run.phase = "executing";
          run.currentRound = undefined;
        }
        break;
      }
      case "assistant.message": {
        const round = run.currentRound;
        if (round?.finishReason === undefined) {
          historyError(event, "assistant_without_completion");
        }
        if (event.data.kind === "final") {
          if (
            round.finishReason !== "stop" ||
            round.rejectionAction !== undefined ||
            round.finalContent !== undefined
          ) {
            historyError(event, "final_position");
          }
          round.finalContent = event.data.content;
          round.finalSeq = event.seq;
        } else {
          if (
            round.finishReason !== "tool_calls" ||
            round.rejectionAction !== undefined ||
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
          for (const key of projection.unresolved.keys()) {
            if (key.startsWith(prefix)) projection.unresolved.delete(key);
          }
        } else {
          const error = event.data.result.error;
          if (error === undefined) historyError(event, "failed_result_without_error");
          const key = `${prefix}${error.code}`;
          projection.unresolved.set(key, Object.freeze({
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
        const previous = projection.latestCompaction;
        if (
          event.data.retainedRange.fromSeq <= event.data.throughSeq ||
          event.data.retainedRange.toSeq >= event.seq ||
          event.data.retainedRange.toSeq > projection.lastSeq ||
          (previous !== undefined &&
            (event.data.throughSeq <= previous.throughSeq ||
              event.data.retainedRange.fromSeq < previous.retainedRange.fromSeq))
        ) historyError(event, "compaction_range_invalid");
        projection.latestCompaction = Object.freeze({
          seq: event.seq,
          runId: run.runId,
          throughSeq: event.data.throughSeq,
          summary: event.data.summary,
          retainedRange: Object.freeze({ ...event.data.retainedRange }),
          ...(event.data.strategy === undefined
            ? {}
            : { strategy: event.data.strategy }),
          ...(event.data.fallbackReason === undefined
            ? {}
            : { fallbackReason: event.data.fallbackReason }),
          ...(event.data.usage === undefined ? {} : { usage: event.data.usage }),
          ...(event.data.usageComplete === undefined
            ? {}
            : { usageComplete: event.data.usageComplete }),
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
        if (event.type === "run.completed") {
          projection.unresolved.delete(`completion-evidence:${run.runId}`);
        }
        projection.currentRun = undefined;
        break;
      }
    }
    projection.lastSeq = event.seq;
  }
}

export function snapshotContextHistory(
  projection: ContextHistoryProjection,
): ContextHistory {
  if (projection.sessionId === undefined || projection.runs.length === 0) {
    throw createContextError(
      "CONTEXT_HISTORY_INVALID",
      "上下文历史缺少运行事实",
      { count: projection.lastSeq },
    );
  }
  if (projection.currentRun !== undefined) {
    commitRound(projection.currentRun, false);
  }
  const frozenRuns = projection.runs.map(freezeRun);
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
  const unresolved = new Map(projection.unresolved);
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
    sessionId: projection.sessionId,
    lastSeq: projection.lastSeq,
    initialGoal,
    ...(projection.currentRun === undefined
      ? {}
      : { activeRunId: projection.currentRun.runId }),
    ...(projection.currentRun === undefined
      ? {}
      : { activePhase: projection.currentRun.phase }),
    runs: Object.freeze(frozenRuns),
    rounds: Object.freeze(rounds),
    unresolvedDiagnostics: Object.freeze(diagnostics),
    ...(projection.latestCompaction === undefined
      ? {}
      : { latestCompaction: projection.latestCompaction }),
  });
}

export function projectContextHistory(
  events: readonly DurableAgentEvent[],
  expectedSessionId?: SessionId,
): ContextHistory {
  const projection = createContextHistoryProjection(expectedSessionId);
  appendContextHistoryEvents(projection, events);
  return snapshotContextHistory(projection);
}
