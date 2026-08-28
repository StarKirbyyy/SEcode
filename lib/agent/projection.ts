import { createHash } from "node:crypto";

import {
  type ApprovalId,
  type DurableAgentEvent,
  type ErrorInfo,
  type JsonObject,
  type JsonValue,
  type RunId,
  type RunStatus,
  type SessionId,
  type ToolCallId,
  type ToolResult,
} from "@/lib/domain";

import { createAgentError } from "./errors";
import type {
  RunSnapshot,
  SessionAgentSnapshot,
} from "./types";

interface ProjectedApproval {
  approvalId: ApprovalId;
  reason: string;
  toolSummary: string;
  resolved?: boolean;
  approved?: boolean;
}

interface ProjectedTool {
  toolCallId: ToolCallId;
  toolName: string;
  publicArguments: JsonObject;
  requestedSeq: number;
  approval?: ProjectedApproval;
  started: boolean;
  result?: ToolResult;
}

interface ProjectedModelRound {
  iteration: number;
  finishReason: string;
  intermediateSeen: boolean;
  toolCollectionLocked: boolean;
  tools: ProjectedTool[];
}

export interface ProjectedRunState {
  runId: RunId;
  promptPreview: string;
  limits: {
    maxIterations: number;
    maxDurationMs: number;
  };
  userMessageSeen: boolean;
  iterations: number;
  pendingModelIteration?: number;
  currentRound?: ProjectedModelRound;
  toolCallIds: Set<ToolCallId>;
  approvalIds: Set<ApprovalId>;
  finalSeen: boolean;
  lastToolErrorSignature?: string;
  consecutiveToolErrors: number;
  terminalStatus?: Extract<
    RunStatus,
    "completed" | "failed" | "cancelled" | "interrupted"
  >;
  terminalError?: ErrorInfo;
  cancellationReason?: string;
}

export interface AgentProjectionState {
  sessionId?: SessionId;
  lastSeq: number;
  currentRun?: ProjectedRunState;
  lastRun?: ProjectedRunState;
}

export function createAgentProjection(): AgentProjectionState {
  return { lastSeq: 0 };
}

export function canonicalJsonValue(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonValue(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJsonValue(item)}`)
    .join(",")}}`;
}

export function createToolErrorSignature(
  toolName: string,
  publicArguments: JsonObject,
  result: ToolResult,
): string | undefined {
  if (result.ok) return undefined;
  const digest = createHash("sha256")
    .update(canonicalJsonValue(publicArguments))
    .digest("hex");
  return `${toolName}\n${result.error?.code ?? "UNKNOWN"}\n${digest}`;
}

function historyError(event: DurableAgentEvent, reason: string): never {
  throw createAgentError("AGENT_HISTORY_INVALID", "Agent 事件历史无效", {
    eventType: event.type,
    seq: event.seq,
    reason,
    ...(event.runId === undefined ? {} : { runId: event.runId }),
  });
}

function requireRun(
  state: AgentProjectionState,
  event: DurableAgentEvent,
): ProjectedRunState {
  const run = state.currentRun;
  if (run === undefined || event.runId === undefined) {
    return historyError(event, "run_event_without_active_run");
  }
  if (event.runId !== run.runId) {
    return historyError(event, "run_id_mismatch");
  }
  return run;
}

function firstUnresolvedTool(
  round: ProjectedModelRound,
): ProjectedTool | undefined {
  return round.tools.find((tool) => tool.result === undefined);
}

function requireToolRound(
  run: ProjectedRunState,
  event: DurableAgentEvent,
): ProjectedModelRound {
  const round = run.currentRound;
  if (round === undefined || round.finishReason !== "tool_calls") {
    return historyError(event, "tool_event_without_tool_calls_completion");
  }
  return round;
}

function assertCurrentTool(
  round: ProjectedModelRound,
  event: DurableAgentEvent,
  toolCallId: ToolCallId,
): ProjectedTool {
  const tool = firstUnresolvedTool(round);
  if (tool === undefined || tool.toolCallId !== toolCallId) {
    return historyError(event, "tool_execution_order_invalid");
  }
  return tool;
}

function deriveRunStatus(run: ProjectedRunState): RunStatus {
  if (run.terminalStatus !== undefined) return run.terminalStatus;
  if (run.pendingModelIteration !== undefined) return "requesting_model";
  const round = run.currentRound;
  if (round !== undefined) {
    const tool = firstUnresolvedTool(round);
    if (tool?.approval !== undefined && tool.approval.resolved === undefined) {
      return "awaiting_approval";
    }
    if (tool?.started === true) return "executing_tool";
  }
  return "queued";
}

function snapshotRun(run: ProjectedRunState): RunSnapshot {
  const pendingTool = run.currentRound === undefined
    ? undefined
    : firstUnresolvedTool(run.currentRound);
  const pendingApproval = pendingTool?.approval;
  const pendingApprovalView =
    pendingTool !== undefined &&
    pendingApproval !== undefined &&
    pendingApproval.resolved === undefined
      ? Object.freeze({
          approvalId: pendingApproval.approvalId,
          toolCallId: pendingTool.toolCallId,
          reason: pendingApproval.reason,
          toolSummary: pendingApproval.toolSummary,
        })
      : undefined;
  return Object.freeze({
    runId: run.runId,
    status: deriveRunStatus(run),
    iterations: run.iterations,
    promptPreview: run.promptPreview,
    limits: Object.freeze({ ...run.limits }),
    ...(pendingApprovalView === undefined
      ? {}
      : { pendingApproval: pendingApprovalView }),
    ...(run.terminalError === undefined
      ? {}
      : { terminalError: Object.freeze({ ...run.terminalError }) }),
    ...(run.cancellationReason === undefined
      ? {}
      : { cancellationReason: run.cancellationReason }),
  });
}

export function getSessionAgentSnapshot(
  state: AgentProjectionState,
): SessionAgentSnapshot {
  if (state.sessionId === undefined) {
    throw createAgentError(
      "AGENT_HISTORY_INVALID",
      "Session 历史缺少 session.created",
      { reason: "session_not_created" },
    );
  }
  const activeRun = state.currentRun === undefined
    ? undefined
    : snapshotRun(state.currentRun);
  const lastRun = state.lastRun === undefined
    ? undefined
    : snapshotRun(state.lastRun);
  return Object.freeze({
    sessionId: state.sessionId,
    status: activeRun?.status ?? lastRun?.status ?? "idle",
    lastSeq: state.lastSeq,
    ...(activeRun === undefined ? {} : { activeRun }),
    ...(lastRun === undefined ? {} : { lastRun }),
  });
}

function assertStableForCompaction(
  run: ProjectedRunState,
  event: Extract<DurableAgentEvent, { type: "context.compacted" }>,
) {
  if (!run.userMessageSeen || run.pendingModelIteration !== undefined || run.finalSeen) {
    historyError(event, "compaction_not_at_stable_boundary");
  }
  if (run.consecutiveToolErrors >= 3) {
    historyError(event, "model_request_after_repeated_tool_error");
  }
  const round = run.currentRound;
  if (round?.finishReason === "stop") {
    historyError(event, "compaction_after_stop");
  }
  if (
    round?.finishReason === "tool_calls" &&
    (round.tools.length === 0 || round.tools.some((tool) => tool.result === undefined))
  ) {
    historyError(event, "compaction_before_tool_round_completed");
  }
  if (
    event.data.throughSeq >= event.seq ||
    event.data.retainedRange.toSeq >= event.seq
  ) {
    historyError(event, "compaction_references_future_event");
  }
}

function startModelRound(
  run: ProjectedRunState,
  event: Extract<DurableAgentEvent, { type: "model.requested" }>,
) {
  if (!run.userMessageSeen || run.pendingModelIteration !== undefined || run.finalSeen) {
    historyError(event, "model_request_not_at_stable_boundary");
  }
  const previous = run.currentRound;
  if (previous?.finishReason === "stop") {
    historyError(event, "model_request_after_stop");
  }
  if (
    previous?.finishReason === "tool_calls" &&
    (previous.tools.length === 0 ||
      previous.tools.some((tool) => tool.result === undefined))
  ) {
    historyError(event, "model_request_before_tool_results");
  }
  if (event.data.iteration !== run.iterations + 1) {
    historyError(event, "model_iteration_not_continuous");
  }
  run.iterations = event.data.iteration;
  run.pendingModelIteration = event.data.iteration;
  run.currentRound = undefined;
}

function finishRun(
  state: AgentProjectionState,
  run: ProjectedRunState,
  status: ProjectedRunState["terminalStatus"],
) {
  run.terminalStatus = status;
  state.lastRun = run;
  state.currentRun = undefined;
}

export function projectAgentEvent(
  state: AgentProjectionState,
  event: DurableAgentEvent,
): AgentProjectionState {
  if (event.seq !== state.lastSeq + 1) {
    return historyError(event, "event_sequence_not_continuous");
  }
  if (state.sessionId !== undefined && event.sessionId !== state.sessionId) {
    return historyError(event, "session_id_mismatch");
  }

  if (event.type === "session.created") {
    if (state.sessionId !== undefined || state.lastSeq !== 0 || event.runId !== undefined) {
      return historyError(event, "duplicate_or_scoped_session_created");
    }
    state.sessionId = event.sessionId;
    state.lastSeq = event.seq;
    return state;
  }

  if (state.sessionId === undefined) {
    return historyError(event, "event_before_session_created");
  }

  if (event.type === "run.started") {
    if (state.currentRun !== undefined || event.runId === undefined) {
      return historyError(event, "run_started_while_session_busy");
    }
    state.currentRun = {
      runId: event.runId,
      promptPreview: event.data.promptPreview,
      limits: { ...event.data.limits },
      userMessageSeen: false,
      iterations: 0,
      toolCallIds: new Set(),
      approvalIds: new Set(),
      finalSeen: false,
      consecutiveToolErrors: 0,
    };
    state.lastSeq = event.seq;
    return state;
  }

  const run = requireRun(state, event);

  switch (event.type) {
    case "user.message":
      if (
        run.userMessageSeen ||
        run.iterations !== 0 ||
        run.pendingModelIteration !== undefined ||
        run.currentRound !== undefined
      ) {
        historyError(event, "user_message_position_invalid");
      }
      run.userMessageSeen = true;
      break;

    case "context.compacted":
      assertStableForCompaction(run, event);
      break;

    case "model.requested":
      startModelRound(run, event);
      break;

    case "model.completed":
      if (
        run.pendingModelIteration === undefined ||
        event.data.iteration !== run.pendingModelIteration
      ) {
        historyError(event, "model_completion_without_matching_request");
      }
      if (
        event.data.finishReason !== "stop" &&
        event.data.finishReason !== "tool_calls"
      ) {
        historyError(event, "model_finish_reason_invalid");
      }
      run.pendingModelIteration = undefined;
      run.currentRound = {
        iteration: event.data.iteration,
        finishReason: event.data.finishReason,
        intermediateSeen: false,
        toolCollectionLocked: false,
        tools: [],
      };
      break;

    case "assistant.message": {
      if (run.pendingModelIteration !== undefined || run.currentRound === undefined) {
        historyError(event, "assistant_message_without_completion");
      }
      const round = run.currentRound;
      if (event.data.kind === "final") {
        if (round.finishReason !== "stop" || run.finalSeen) {
          historyError(event, "final_message_position_invalid");
        }
        run.finalSeen = true;
      } else {
        if (
          round.finishReason !== "tool_calls" ||
          round.intermediateSeen ||
          round.tools.length > 0 ||
          round.toolCollectionLocked
        ) {
          historyError(event, "intermediate_message_position_invalid");
        }
        round.intermediateSeen = true;
      }
      break;
    }

    case "tool.requested": {
      const round = requireToolRound(run, event);
      if (round.toolCollectionLocked || run.toolCallIds.has(event.data.toolCallId)) {
        historyError(event, "tool_request_duplicate_or_late");
      }
      run.toolCallIds.add(event.data.toolCallId);
      round.tools.push({
        toolCallId: event.data.toolCallId,
        toolName: event.data.toolName,
        publicArguments: event.data.publicArguments,
        requestedSeq: event.seq,
        started: false,
      });
      break;
    }

    case "approval.required": {
      const round = requireToolRound(run, event);
      round.toolCollectionLocked = true;
      const tool = assertCurrentTool(round, event, event.data.toolCallId);
      if (
        tool.approval !== undefined ||
        tool.started ||
        run.approvalIds.has(event.data.approvalId)
      ) {
        historyError(event, "approval_required_duplicate_or_late");
      }
      run.approvalIds.add(event.data.approvalId);
      tool.approval = {
        approvalId: event.data.approvalId,
        reason: event.data.reason,
        toolSummary: event.data.toolSummary,
      };
      break;
    }

    case "approval.resolved": {
      const round = requireToolRound(run, event);
      round.toolCollectionLocked = true;
      const tool = firstUnresolvedTool(round);
      if (
        tool?.approval === undefined ||
        tool.approval.approvalId !== event.data.approvalId ||
        tool.approval.resolved !== undefined ||
        tool.started
      ) {
        historyError(event, "approval_resolution_invalid");
      }
      tool.approval.resolved = true;
      tool.approval.approved = event.data.approved;
      break;
    }

    case "tool.started": {
      const round = requireToolRound(run, event);
      round.toolCollectionLocked = true;
      const tool = assertCurrentTool(round, event, event.data.toolCallId);
      if (tool.toolName !== event.data.toolName || tool.started) {
        historyError(event, "tool_started_duplicate_or_name_mismatch");
      }
      if (
        tool.approval !== undefined &&
        (tool.approval.resolved !== true || tool.approval.approved !== true)
      ) {
        historyError(event, "tool_started_without_approval");
      }
      tool.started = true;
      break;
    }

    case "tool.result": {
      const round = requireToolRound(run, event);
      round.toolCollectionLocked = true;
      const tool = assertCurrentTool(round, event, event.data.toolCallId);
      if (tool.toolName !== event.data.toolName || tool.result !== undefined) {
        historyError(event, "tool_result_duplicate_or_name_mismatch");
      }
      if (tool.approval !== undefined) {
        if (tool.approval.resolved !== true) {
          historyError(event, "tool_result_before_approval_resolution");
        }
        if (tool.approval.approved === true && !tool.started) {
          historyError(event, "approved_tool_result_without_started");
        }
        if (
          tool.approval.approved === false &&
          (tool.started || event.data.result.error?.code !== "TOOL_APPROVAL_REJECTED")
        ) {
          historyError(event, "rejected_tool_result_invalid");
        }
      }
      tool.result = event.data.result;
      {
        const signature = createToolErrorSignature(
          tool.toolName,
          tool.publicArguments,
          tool.result,
        );
        if (signature === undefined) {
          run.lastToolErrorSignature = undefined;
          run.consecutiveToolErrors = 0;
        } else if (signature === run.lastToolErrorSignature) {
          run.consecutiveToolErrors += 1;
        } else {
          run.lastToolErrorSignature = signature;
          run.consecutiveToolErrors = 1;
        }
      }
      break;
    }

    case "run.completed":
      if (
        !run.finalSeen ||
        run.pendingModelIteration !== undefined ||
        run.currentRound?.finishReason !== "stop" ||
        event.data.iterations !== run.iterations
      ) {
        historyError(event, "run_completed_without_final_stable_state");
      }
      finishRun(state, run, "completed");
      break;

    case "run.failed":
      if (event.data.iterations !== run.iterations) {
        historyError(event, "run_failed_iteration_mismatch");
      }
      run.terminalError = event.data.error;
      finishRun(state, run, "failed");
      break;

    case "run.cancelled":
      if (event.data.iterations !== run.iterations) {
        historyError(event, "run_cancelled_iteration_mismatch");
      }
      run.cancellationReason = event.data.reason;
      finishRun(state, run, "cancelled");
      break;

    case "run.interrupted":
      if (event.data.lastStableSeq !== event.seq - 1) {
        historyError(event, "run_interrupted_last_stable_seq_mismatch");
      }
      finishRun(state, run, "interrupted");
      break;

  }

  state.lastSeq = event.seq;
  return state;
}

export function projectAgentEvents(
  events: readonly DurableAgentEvent[],
): AgentProjectionState {
  const state = createAgentProjection();
  for (const event of events) projectAgentEvent(state, event);
  return state;
}
