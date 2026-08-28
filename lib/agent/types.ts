import type { ApprovalDecision, PendingToolApprovalView } from "@/lib/approval";
import type {
  AgentEvent,
  ApprovalId,
  ChatMessage,
  ErrorInfo,
  RunId,
  RunStatus,
  SessionId,
} from "@/lib/domain";
import type {
  ModelClient,
  ModelThinkingOptions,
} from "@/lib/model";
import type { JsonlEventStore } from "@/lib/storage";

export const DEFAULT_MAX_AGENT_ITERATIONS = 30;
export const MAX_AGENT_ITERATIONS = 30;
export const DEFAULT_AGENT_DURATION_MS = 600_000;
export const MAX_AGENT_DURATION_MS = 600_000;
export const MIN_AGENT_DURATION_MS = 1_000;
export const MAX_PROMPT_CHARACTERS = 1_048_576;
export const MAX_PROMPT_PREVIEW_CHARACTERS = 4_096;
export const MAX_CONSECUTIVE_IDENTICAL_TOOL_ERRORS = 3;
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
  "AGENT_ITERATION_LIMIT",
  "AGENT_RUN_TIMEOUT",
  "AGENT_REPEATED_TOOL_ERROR",
  "AGENT_MODEL_OUTPUT_INVALID",
  "AGENT_ASSISTANT_MESSAGE_TOO_LARGE",
  "AGENT_INTERNAL_ERROR",
] as const;

export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[number];

export interface AgentRunLimits {
  maxIterations?: number;
  maxDurationMs?: number;
}

export interface AgentRunRequest {
  sessionId: SessionId;
  prompt: string;
  limits?: AgentRunLimits;
  thinking?: ModelThinkingOptions;
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
}

export interface AgentCompactionDraft {
  throughSeq: number;
  summary: string;
  retainedRange: {
    fromSeq: number;
    toSeq: number;
  };
}

export interface AgentContextResult {
  messages: readonly ChatMessage[];
  compaction?: AgentCompactionDraft;
}

export interface AgentContextProvider {
  buildContext(request: AgentContextRequest): Promise<AgentContextResult>;
}

export type AgentRunOutcome =
  | Readonly<{
      status: "completed";
      runId: RunId;
      iterations: number;
      durationMs: number;
    }>
  | Readonly<{
      status: "failed";
      runId: RunId;
      iterations: number;
      error: ErrorInfo;
    }>
  | Readonly<{
      status: "cancelled";
      runId: RunId;
      iterations: number;
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
  readonly promptPreview: string;
  readonly limits: Readonly<{
    maxIterations: number;
    maxDurationMs: number;
  }>;
  readonly pendingApproval?: PendingToolApprovalView;
  readonly terminalError?: ErrorInfo;
  readonly cancellationReason?: string;
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
  readonly pendingApproval?: PendingToolApprovalView;
}

export type AgentApprovalResolution =
  | Readonly<{ status: "resolved"; approved: boolean }>
  | Readonly<{ status: "invalid"; error: ErrorInfo }>;

export interface AgentRuntime {
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
  getActiveRun(runId: RunId): ActiveAgentRunView | undefined;
}

export interface AgentRuntimeOptions {
  eventStore: JsonlEventStore;
  modelClient: ModelClient;
  contextProvider: AgentContextProvider;
}
