import type { AgentContextProvider } from "@/lib/agent";
import type { AgentRunPhase } from "@/lib/agent/types";
import type {
  ChatMessage,
  ErrorInfo,
  JsonObject,
  RunId,
  SessionId,
  ToolCallId,
  ToolResult,
} from "@/lib/domain";
import type { ModelClient } from "@/lib/model";
import type {
  EventPage,
  EventPageQuery,
  StoredSessionMetadata,
} from "@/lib/storage";

export const CONTEXT_PROTOCOL_VERSION = 1 as const;
export const CONTEXT_CACHE_PROTOCOL_VERSION = 2 as const;
export const MAX_CONTEXT_CACHE_SESSIONS = 16;
export const MAX_CONTEXT_CACHE_TOTAL_BYTES = 64 * 1024 * 1024;
export const MAX_CONTEXT_CACHE_ENTRY_BYTES = 16 * 1024 * 1024;
export const CONTEXT_COMPACTION_THRESHOLD_RATIO = 0.75;
export const CONTEXT_SOFT_COMPACTION_TRIGGER_TOKENS = 64_000;
export const MAX_CONTEXT_SUMMARY_TARGET_TOKENS = 8_000;
export const CONTEXT_RETAIN_RECENT_ROUNDS = 8;
export const CONTEXT_EVENT_PAGE_LIMIT = 1_000;
export const ESTIMATED_UTF8_BYTES_PER_TOKEN = 2;
export const ESTIMATED_MESSAGE_OVERHEAD_TOKENS = 8;
export const ESTIMATED_REQUEST_OVERHEAD_TOKENS = 32;
export const CONTEXT_SUMMARY_TARGET_RATIO = 0.125;
export const CONTEXT_SUMMARY_TIMEOUT_MS = 60_000;
export const MAX_CONTEXT_TOOL_OUTPUT_BYTES = 8_192;
export const MAX_CONTEXT_TOOL_OUTPUT_TOTAL_BYTES = 32_768;
export const CONTEXT_TOOL_OUTPUT_BUDGET_RATIO = 0.25;
export const MAX_CONTEXT_SUMMARY_CHARACTERS = 65_536;
export const MAX_PINNED_UNRESOLVED_ERRORS = 16;
export const CONTEXT_SUMMARY_MARKER = "SECODE_CONTEXT_SUMMARY_V1";

export const CONTEXT_COMPACTION_STRATEGIES = [
  "model",
  "deterministic_fallback",
] as const;
export type ContextCompactionStrategy =
  (typeof CONTEXT_COMPACTION_STRATEGIES)[number];

export const CONTEXT_FALLBACK_REASONS = [
  "model_timeout",
  "model_failed",
  "model_output_invalid",
  "summary_input_over_budget",
] as const;
export type ContextFallbackReason = (typeof CONTEXT_FALLBACK_REASONS)[number];

export const CONTEXT_ERROR_CODES = [
  "CONTEXT_INPUT_INVALID",
  "CONTEXT_SESSION_UNAVAILABLE",
  "CONTEXT_MODEL_UNAVAILABLE",
  "CONTEXT_HISTORY_INVALID",
  "CONTEXT_BUDGET_EXCEEDED",
  "CONTEXT_SUMMARY_FAILED",
  "CONTEXT_SUMMARY_INVALID",
  "CONTEXT_ABORTED",
  "CONTEXT_INTERNAL_ERROR",
] as const;

export type ContextErrorCode = (typeof CONTEXT_ERROR_CODES)[number];

export interface ContextEventSource {
  getSessionMetadata(
    sessionId: SessionId,
  ): Promise<StoredSessionMetadata>;
  readEvents(
    sessionId: SessionId,
    query?: EventPageQuery,
  ): Promise<EventPage>;
}

export interface AgentContextProviderOptions {
  eventSource: ContextEventSource;
  modelClient: ModelClient;
}

export interface ContextApprovalAnnotation {
  approved: boolean;
  reason?: string;
}

export interface ContextToolExchange {
  toolCallId: ToolCallId;
  toolName: string;
  publicArguments: JsonObject;
  argumentsTruncated: boolean;
  requestedSeq: number;
  resultSeq: number;
  result: ToolResult;
  approval?: ContextApprovalAnnotation;
}

export interface ContextPlanFact {
  planId: string;
  approvalId: string;
  content: string;
  proposedSeq: number;
  approved?: boolean;
  reason?: string;
  resolvedSeq?: number;
}

export type ContextRound =
  | Readonly<{
      kind: "final";
      runId: RunId;
      iteration: number;
      startSeq: number;
      endSeq: number;
      content: string;
    }>
  | Readonly<{
      kind: "plan";
      runId: RunId;
      iteration: number;
      startSeq: number;
      endSeq: number;
      content: string;
    }>
  | Readonly<{
      kind: "tools";
      runId: RunId;
      iteration: number;
      startSeq: number;
      endSeq: number;
      content: string | null;
      tools: readonly ContextToolExchange[];
    }>;

export interface ContextRunHistory {
  runId: RunId;
  planningEnabled: boolean;
  phase: AgentRunPhase;
  goal: string;
  goalSeq: number;
  rounds: readonly ContextRound[];
  plan?: Readonly<ContextPlanFact>;
  terminal?: Readonly<{
    status: "completed" | "failed" | "cancelled" | "interrupted";
    seq: number;
    error?: ErrorInfo;
    reason?: string;
  }>;
}

export interface ContextDiagnostic {
  key: string;
  seq: number;
  runId: RunId;
  kind: "tool_error" | "run_terminal" | "completion_evidence" | "validation_repair";
  message: string;
  code?: string;
}

export interface ContextCompactionFact {
  seq: number;
  runId: RunId;
  throughSeq: number;
  summary: string;
  retainedRange: { fromSeq: number; toSeq: number };
  strategy?: ContextCompactionStrategy;
  fallbackReason?: ContextFallbackReason;
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

export interface ContextHistory {
  sessionId: SessionId;
  lastSeq: number;
  initialGoal: string;
  activeRunId?: RunId;
  activePhase?: AgentRunPhase;
  runs: readonly ContextRunHistory[];
  rounds: readonly ContextRound[];
  unresolvedDiagnostics: readonly ContextDiagnostic[];
  latestCompaction?: ContextCompactionFact;
}

export interface ContextRenderInput {
  history: ContextHistory;
  workspacePath: string;
  rounds: readonly ContextRound[];
  summary?: string;
}

export interface ContextTokenEstimate {
  inputBudgetTokens: number;
  estimatedTokens: number;
  messageTokens: number;
  toolTokens: number;
}

export interface ContextCompactionSelection {
  previousSummary?: string;
  evictedRounds: readonly ContextRound[];
  retainedRounds: readonly ContextRound[];
  throughSeq: number;
  retainedRange: { fromSeq: number; toSeq: number };
  targetSummaryTokens: number;
}

export interface ContextSummaryTranscript {
  protocolVersion: 1;
  previousSummary?: string;
  throughSeq: number;
  targetTokens: number;
  goals: readonly Readonly<{ runId: RunId; content: string }>[];
  rounds: readonly JsonObject[];
  diagnostics: readonly Readonly<{
    seq: number;
    kind: "tool_error" | "run_terminal" | "completion_evidence" | "validation_repair";
    code?: string;
    message: string;
  }>[];
}

export interface ContextSummaryResult {
  summary: string;
}

export type ContextProviderFactory = (
  options: AgentContextProviderOptions,
) => AgentContextProvider;

export type ContextError = ErrorInfo;

export interface RenderedContext {
  messages: readonly ChatMessage[];
}
