import type { ApprovalDecision } from "@/lib/approval";
import type {
  AgentApprovalResolution,
  AgentPlanApprovalResolution,
  AgentPlanDecision,
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
import type { WorkspacePermissionMode } from "@/lib/approval";

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
    defaultMaxModelRequests: null;
    maximumModelRequests: number;
    defaultMaxToolCalls: number;
    maximumToolCalls: number;
    /** @deprecated Use defaultMaxModelRequests. */
    defaultMaxIterations: null;
    /** @deprecated Use maximumModelRequests. */
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

export interface BrowseWorkspaceRequest {
  segments: string[];
}

export interface BrowseWorkspaceLocation {
  label: string;
  workspacePath: string;
}

export interface BrowseWorkspaceCurrent extends BrowseWorkspaceLocation {
  segments: string[];
}

export interface BrowseWorkspaceDirectory {
  name: string;
  segments: string[];
  symbolicLink: boolean;
}

export interface BrowseWorkspaceResponse {
  root: BrowseWorkspaceLocation;
  current: BrowseWorkspaceCurrent;
  parentSegments: string[] | null;
  directories: BrowseWorkspaceDirectory[];
  blockedEntries: number;
  ignoredEntries: number;
  truncated: boolean;
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

export interface DeletedSessionResponse {
  sessionId: SessionId;
  status: "deleted";
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
  getWorkspacePermission(workspacePath: string): Promise<{ workspacePath: string; mode: WorkspacePermissionMode }>;
  setWorkspacePermission(workspacePath: string, mode: WorkspacePermissionMode): Promise<{ workspacePath: string; mode: WorkspacePermissionMode }>;
  browseWorkspaces(input: BrowseWorkspaceRequest): Promise<BrowseWorkspaceResponse>;
  listSessions(): Promise<readonly PublicSessionMetadata[]>;
  createSession(input: CreateSessionInput): Promise<CreatedSessionResponse>;
  deleteSession(sessionId: SessionId): Promise<DeletedSessionResponse>;
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
  resolvePlanApproval(
    runId: RunId,
    approvalId: ApprovalId,
    decision: AgentPlanDecision,
  ): Promise<AgentPlanApprovalResolution>;
  cancelRun(runId: RunId, reason?: string): CancelRunResult;
}

export interface RouteContext<TParams extends Record<string, string>> {
  params: Promise<TParams>;
}
