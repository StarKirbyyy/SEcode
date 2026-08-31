import type { ApprovalDecision, PendingToolApprovalView, WorkspacePermissionMode } from "@/lib/approval";
import type {
  AgentEvent,
  ApprovalId,
  ChatMessage,
  ErrorInfo,
  PlanId,
  RunId,
  RunStatus,
  SessionId,
} from "@/lib/domain";
import type {
  ModelClient,
  ModelThinkingOptions,
} from "@/lib/model";
import type { JsonlEventStore } from "@/lib/storage";

export const MAX_MODEL_REQUESTS = 120;
/** @deprecated Legacy HTTP input boundary; use maxModelRequests. */
export const DEFAULT_MAX_AGENT_ITERATIONS = null;
/** @deprecated Legacy HTTP input boundary; use maxModelRequests. */
export const MAX_AGENT_ITERATIONS = MAX_MODEL_REQUESTS;
export const DEFAULT_MAX_TOOL_CALLS = 300;
export const MAX_TOOL_CALLS = 300;
export const DEFAULT_AGENT_DURATION_MS = 1_800_000;
export const MAX_AGENT_DURATION_MS = 3_600_000;
export const MIN_AGENT_DURATION_MS = 1_000;
export const MAX_PROMPT_CHARACTERS = 1_048_576;
export const MAX_PROMPT_PREVIEW_CHARACTERS = 4_096;
export const MAX_CONSECUTIVE_IDENTICAL_TOOL_ERRORS = 3;
export const MAX_CONSECUTIVE_NO_PROGRESS_READS = 3;
export const INVALID_TOOL_CALL_NAME = "invalid_tool_call";
export const MAX_STREAM_REDACTION_PREFIX = 256;

export const AGENT_ERROR_CODES = [
  "AGENT_INPUT_INVALID",
  "AGENT_START_ABORTED",
  "AGENT_SESSION_BUSY",
  "AGENT_HISTORY_INVALID",
  "AGENT_WORKSPACE_UNAVAILABLE",
  "AGENT_MODEL_UNAVAILABLE",
  "AGENT_CONTEXT_FAILED",
  "AGENT_RUN_NOT_FOUND",
  "AGENT_APPROVAL_NOT_PENDING",
  "AGENT_APPROVAL_INVALID",
  "AGENT_PLAN_NOT_PENDING",
  "AGENT_PLAN_APPROVAL_INVALID",
  "AGENT_ITERATION_LIMIT",
  "AGENT_TOOL_CALL_LIMIT",
  "AGENT_NO_PROGRESS_LIMIT",
  "AGENT_RUN_TIMEOUT",
  "AGENT_REPEATED_TOOL_ERROR",
  "AGENT_MODEL_OUTPUT_INVALID",
  "AGENT_OUTPUT_LANGUAGE_INVALID",
  "AGENT_WRITE_DEPENDENCY_UNRESOLVED",
  "AGENT_COMPLETION_EVIDENCE_MISSING",
  "AGENT_FINAL_HANDOFF_INCOMPLETE",
  "AGENT_VALIDATION_NO_PROGRESS",
  "AGENT_ASSISTANT_MESSAGE_TOO_LARGE",
  "AGENT_INTERNAL_ERROR",
] as const;

export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[number];

export interface AgentRunLimits {
  maxModelRequests?: number;
  maxToolCalls?: number;
  /** @deprecated Use maxModelRequests. */
  maxIterations?: number;
  maxDurationMs?: number;
}

export interface AgentRunRequest {
  sessionId: SessionId;
  prompt: string;
  planningEnabled?: boolean;
  limits?: AgentRunLimits;
  thinking?: ModelThinkingOptions;
  permissionMode?: WorkspacePermissionMode;
}

export type AgentEventSink = (
  event: AgentEvent,
) => void | Promise<void>;

export interface AgentRunControls {
  signal?: AbortSignal;
  onEvent?: AgentEventSink;
}

export interface AgentContextRequest {
  sessionId: SessionId;
  runId: RunId;
  iteration: number;
  signal: AbortSignal;
  toolCapability: AgentToolCapability;
}

export type AgentToolCapability = "normal" | "planning" | "dependency_recovery";

export type AgentRunPhase =
  | "normal"
  | "planning"
  | "awaiting_plan_approval"
  | "executing";

export type AgentPromptPhase = Exclude<AgentRunPhase, "awaiting_plan_approval">;

export interface PendingPlanApprovalView {
  readonly planId: PlanId;
  readonly approvalId: ApprovalId;
  readonly content: string;
}

export interface AgentPlanDecision {
  readonly planId: PlanId;
  readonly approved: boolean;
  readonly reason?: string;
}

export type AgentPlanApprovalResolution =
  | Readonly<{ status: "resolved"; approved: boolean }>
  | Readonly<{ status: "invalid"; error: ErrorInfo }>;

export interface AgentCompactionDraft {
  throughSeq: number;
  summary: string;
  retainedRange: {
    fromSeq: number;
    toSeq: number;
  };
  strategy?: "model" | "deterministic_fallback";
  fallbackReason?:
    | "model_timeout"
    | "model_failed"
    | "model_output_invalid"
    | "summary_input_over_budget";
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cachedPromptTokens?: number;
    cacheMissPromptTokens?: number;
  };
  usageComplete?: boolean;
}

export interface AgentContextResult {
  messages: readonly ChatMessage[];
  compaction?: AgentCompactionDraft;
  contextCache?: ContextCacheDiagnostic;
}

export interface ContextCacheDiagnostic {
  status: "cold" | "warm" | "invalidated";
  reusedEvents: number;
  tailEvents: number;
  avoidedBytes: number;
  buildMilliseconds: number;
}

export interface AgentContextProvider {
  buildContext(request: AgentContextRequest): Promise<AgentContextResult>;
  invalidateSession?(sessionId: SessionId): void;
}

export type AgentRunOutcome =
  | Readonly<{
      status: "completed";
      runId: RunId;
      iterations: number;
      modelRequests: number;
      toolCalls: number;
      durationMs: number;
    }>
  | Readonly<{
      status: "failed";
      runId: RunId;
      iterations: number;
      modelRequests: number;
      toolCalls: number;
      error: ErrorInfo;
    }>
  | Readonly<{
      status: "cancelled";
      runId: RunId;
      iterations: number;
      modelRequests: number;
      toolCalls: number;
      reason: string;
    }>;

export interface AgentRunHandle {
  readonly sessionId: SessionId;
  readonly runId: RunId;
  readonly completion: Promise<AgentRunOutcome>;
  cancel(reason?: string): boolean;
}

export interface RunSnapshot {
  readonly runId: RunId;
  readonly status: RunStatus;
  readonly iterations: number;
  readonly modelRequests: number;
  readonly toolCalls: number;
  readonly phase: AgentRunPhase;
  readonly planningEnabled: boolean;
  readonly promptPreview: string;
  readonly limits: Readonly<{
    maxIterations?: number;
    maxModelRequests?: number;
    maxToolCalls: number;
    maxDurationMs: number;
  }>;
  readonly pendingApproval?: PendingToolApprovalView;
  readonly pendingPlanApproval?: PendingPlanApprovalView;
  readonly terminalError?: ErrorInfo;
  readonly cancellationReason?: string;
  readonly contextCompaction?: Readonly<{
    throughSeq: number;
    strategy: "model" | "deterministic_fallback";
    fallbackReason?:
      | "model_timeout"
      | "model_failed"
      | "model_output_invalid"
      | "summary_input_over_budget";
  }>;
}

export interface SessionAgentSnapshot {
  readonly sessionId: SessionId;
  readonly status: "idle" | RunStatus;
  readonly lastSeq: number;
  readonly activeRun?: RunSnapshot;
  readonly lastRun?: RunSnapshot;
}

export interface ActiveAgentRunView {
  readonly sessionId: SessionId;
  readonly runId: RunId;
  readonly status: RunStatus;
  readonly iterations: number;
  readonly modelRequests: number;
  readonly toolCalls: number;
  readonly phase: AgentRunPhase;
  readonly planningEnabled: boolean;
  readonly limits: RunSnapshot["limits"];
  readonly pendingApproval?: PendingToolApprovalView;
  readonly pendingPlanApproval?: PendingPlanApprovalView;
}

export type AgentApprovalResolution =
  | Readonly<{ status: "resolved"; approved: boolean }>
  | Readonly<{ status: "invalid"; error: ErrorInfo }>;

export interface AgentRuntime {
  invalidateSessionContext?(sessionId: SessionId): void;
  recoverSession(sessionId: SessionId): Promise<SessionAgentSnapshot>;
  startRun(
    request: AgentRunRequest,
    controls?: AgentRunControls,
  ): Promise<AgentRunHandle>;
  cancelRun(runId: RunId, reason?: string): boolean;
  resolveApproval(
    runId: RunId,
    approvalId: ApprovalId,
    decision: ApprovalDecision,
  ): Promise<AgentApprovalResolution>;
  resolvePlanApproval(
    runId: RunId,
    approvalId: ApprovalId,
    decision: AgentPlanDecision,
  ): Promise<AgentPlanApprovalResolution>;
  getActiveRun(runId: RunId): ActiveAgentRunView | undefined;
}

export interface AgentRuntimeOptions {
  eventStore: JsonlEventStore;
  modelClient: ModelClient;
  contextProvider: AgentContextProvider;
}
