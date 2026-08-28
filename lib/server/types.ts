import type { ApprovalDecision } from "@/lib/approval";
import type {
  AgentApprovalResolution,
  AgentRunControls,
  AgentRunHandle,
  AgentRunRequest,
} from "@/lib/agent";
import type {
  AgentEvent,
  ApprovalId,
  ErrorInfo,
  ModelProvider,
  RunId,
  SessionId,
  SessionRecord,
} from "@/lib/domain";
import type {
  EventPage,
  EventPageQuery,
} from "@/lib/storage";

export interface PublicModelProfile {
  id: string;
  label: string;
  provider: ModelProvider;
  model: string;
  contextWindow: number;
  supportsThinking: boolean;
  configured: boolean;
}

export interface PublicModelIssue {
  profileId: string;
  code: string;
  message: string;
}

export interface PublicConfig {
  models: PublicModelProfile[];
  issues: PublicModelIssue[];
  agentLimits: {
    defaultMaxIterations: number;
    maximumIterations: number;
    defaultMaxDurationMs: number;
    maximumDurationMs: number;
  };
  securityBoundary: {
    mode: "trusted_local_single_user";
    operatingSystemSandbox: false;
  };
}

export interface PublicSessionMetadata {
  id: string;
  title: string;
  workspacePath: string;
  modelProfileId: string;
  createdAt: string;
}

export interface CreateSessionInput {
  workspacePath: string;
  modelProfileId: string;
  title?: string;
}

export interface CreatedSessionResponse {
  session: SessionRecord;
  event: Extract<AgentEvent, { type: "session.created" }>;
}

export interface ApiErrorEnvelope {
  error: ErrorInfo;
}

export type CancelRunResult =
  | Readonly<{
      runId: RunId;
      status: "cancellation_requested" | "already_requested";
    }>
  | Readonly<{ runId: RunId; status: "not_found" }>;

export interface ServerApplication {
  getConfig(): PublicConfig;
  listRecentWorkspaces(limit?: number): Promise<readonly string[]>;
  validateWorkspace(rootPath: string): Promise<{ workspacePath: string }>;
  listSessions(): Promise<readonly PublicSessionMetadata[]>;
  createSession(input: CreateSessionInput): Promise<CreatedSessionResponse>;
  readEvents(sessionId: SessionId, query: EventPageQuery): Promise<EventPage>;
  startRun(
    input: AgentRunRequest,
    controls: AgentRunControls,
  ): Promise<AgentRunHandle>;
  resolveApproval(
    runId: RunId,
    approvalId: ApprovalId,
    decision: ApprovalDecision,
  ): Promise<AgentApprovalResolution>;
  cancelRun(runId: RunId, reason?: string): CancelRunResult;
}

export interface RouteContext<TParams extends Record<string, string>> {
  params: Promise<TParams>;
}
