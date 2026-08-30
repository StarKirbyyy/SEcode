import path from "node:path";

import type { ApprovalDecision } from "@/lib/approval";
import { createWorkspacePermissionStore, type WorkspacePermissionMode } from "./workspace-permissions";
import {
  DEFAULT_AGENT_DURATION_MS,
  DEFAULT_MAX_AGENT_ITERATIONS,
  DEFAULT_MAX_TOOL_CALLS,
  MAX_AGENT_DURATION_MS,
  MAX_AGENT_ITERATIONS,
  MAX_MODEL_REQUESTS,
  MAX_TOOL_CALLS,
  AgentLayerError,
  type AgentRunHandle,
  type AgentRuntime,
} from "@/lib/agent";
import type { ApprovalId, PlanId, RunId, SessionId } from "@/lib/domain";
import type { ModelClient, ModelConfigIssue } from "@/lib/model";
import type { JsonlEventStore } from "@/lib/storage";
import type { WorkspaceHandle } from "@/lib/workspace";
import type { WorkspacePickerService } from "./workspace-picker";

import { createServerError } from "./errors";
import type {
  CancelRunResult,
  CreateSessionInput,
  PublicConfig,
  PublicSessionMetadata,
  ServerApplication,
} from "./types";

export interface ServerApplicationDependencies {
  store: JsonlEventStore;
  modelClient: ModelClient;
  runtime: AgentRuntime;
  createWorkspace(rootPath: string): Promise<WorkspaceHandle>;
  workspacePicker: WorkspacePickerService;
}

const ISSUE_MESSAGES: Record<ModelConfigIssue["code"], string> = {
  MISSING_API_KEY: "模型配置缺少服务端凭据",
  MISSING_BASE_URL: "模型配置缺少服务地址",
  MISSING_MODEL: "模型配置缺少模型标识",
  INVALID_VALUE: "模型配置包含无效值",
};

function publicConfig(modelClient: ModelClient): PublicConfig {
  const snapshot = modelClient.getConfigSnapshot();
  return {
    models: snapshot.profiles.map((profile) => ({
      id: profile.id,
      label: profile.label,
      provider: profile.provider,
      model: profile.model,
      contextWindow: profile.contextWindow,
      supportsThinking: profile.supportsThinking,
      configured: profile.configured,
    })),
    issues: snapshot.issues.map((issue) => ({
      profileId: issue.profileId,
      code: issue.code,
      message: ISSUE_MESSAGES[issue.code],
    })),
    agentLimits: {
      defaultMaxModelRequests: null,
      maximumModelRequests: MAX_MODEL_REQUESTS,
      defaultMaxToolCalls: DEFAULT_MAX_TOOL_CALLS,
      maximumToolCalls: MAX_TOOL_CALLS,
      defaultMaxIterations: DEFAULT_MAX_AGENT_ITERATIONS,
      maximumIterations: MAX_AGENT_ITERATIONS,
      defaultMaxDurationMs: DEFAULT_AGENT_DURATION_MS,
      maximumDurationMs: MAX_AGENT_DURATION_MS,
    },
    securityBoundary: {
      mode: "trusted_local_single_user",
      operatingSystemSandbox: false,
    },
  };
}

function sessionMetadata(metadata: Awaited<ReturnType<JsonlEventStore["listSessions"]>>[number]): PublicSessionMetadata {
  return {
    id: metadata.id,
    title: metadata.title,
    workspacePath: metadata.workspacePath,
    modelProfileId: metadata.modelProfileId,
    createdAt: metadata.createdAt,
  };
}

function sessionTitle(rootPath: string, requested?: string): string {
  if (requested !== undefined) return requested.trim().slice(0, 256);
  const basename = path.basename(rootPath).trim();
  return (basename || "SEcode Session").slice(0, 256);
}

export function createServerApplication(
  dependencies: ServerApplicationDependencies,
): ServerApplication {
  const activeByRun = new Map<RunId, AgentRunHandle>();
  const activeBySession = new Map<SessionId, AgentRunHandle>();
  const cancellationRequested = new Set<RunId>();
  const sessionOperations = new Map<
    SessionId,
    "starting" | "recovering" | "deleting"
  >();
  const workspacePermissions = createWorkspacePermissionStore();

  const busy = (
    sessionId: SessionId,
    operation: "starting" | "recovering" | "deleting" | "running",
  ) => createServerError(
    "API_SESSION_BUSY",
    "会话当前正忙，请等待任务结束后重试",
    true,
    { sessionId, operation },
  );

  const reserve = (
    sessionId: SessionId,
    operation: "starting" | "recovering" | "deleting",
  ) => {
    const active = activeBySession.has(sessionId);
    const current = sessionOperations.get(sessionId);
    if (active || current !== undefined) {
      if (active && operation === "starting") {
        throw new AgentLayerError({
          code: "AGENT_SESSION_BUSY",
          message: "当前 Session 已有运行中的任务",
          recoverable: true,
          details: { sessionId },
        });
      }
      throw busy(sessionId, active ? "running" : current!);
    }
    sessionOperations.set(sessionId, operation);
    return () => {
      if (sessionOperations.get(sessionId) === operation) {
        sessionOperations.delete(sessionId);
      }
    };
  };

  const register = (handle: AgentRunHandle) => {
    activeByRun.set(handle.runId, handle);
    activeBySession.set(handle.sessionId, handle);
    const cleanup = () => {
      if (activeByRun.get(handle.runId) === handle) activeByRun.delete(handle.runId);
      if (activeBySession.get(handle.sessionId) === handle) activeBySession.delete(handle.sessionId);
      cancellationRequested.delete(handle.runId);
    };
    void handle.completion.then(cleanup, cleanup);
  };

  return {
    getConfig() {
      return publicConfig(dependencies.modelClient);
    },

    listRecentWorkspaces(limit) {
      return dependencies.store.listRecentWorkspaces(
        limit === undefined ? undefined : { limit },
      );
    },

    async validateWorkspace(rootPath) {
      const workspace = await dependencies.createWorkspace(rootPath);
      const workspacePath = await dependencies.workspacePicker.assertSelection(
        workspace.rootPath,
      );
      return { workspacePath };
    },

    async getWorkspacePermission(rootPath) {
      const workspace = await dependencies.createWorkspace(rootPath);
      const workspacePath = await dependencies.workspacePicker.assertSelection(workspace.rootPath);
      return { workspacePath, mode: workspacePermissions.get(workspacePath) };
    },

    async setWorkspacePermission(rootPath, mode: WorkspacePermissionMode) {
      const workspace = await dependencies.createWorkspace(rootPath);
      const workspacePath = await dependencies.workspacePicker.assertSelection(workspace.rootPath);
      return { workspacePath, mode: workspacePermissions.set(workspacePath, mode) };
    },

    browseWorkspaces(input) {
      return dependencies.workspacePicker.browse(input);
    },

    async listSessions() {
      return (await dependencies.store.listSessions()).map(sessionMetadata);
    },

    async createSession(input: CreateSessionInput) {
      const profile = dependencies.modelClient
        .getConfigSnapshot()
        .profiles.find((candidate) => candidate.id === input.modelProfileId);
      if (profile === undefined || !profile.configured) {
        throw createServerError(
          "API_MODEL_PROFILE_UNAVAILABLE",
          "所选模型配置当前不可用",
          true,
          { profileId: input.modelProfileId },
        );
      }
      const workspace = await dependencies.createWorkspace(input.workspacePath);
      const workspacePath = await dependencies.workspacePicker.assertSelection(
        workspace.rootPath,
      );
      const created = await dependencies.store.createSession({
        workspacePath,
        modelProfileId: profile.id,
        title: sessionTitle(workspacePath, input.title),
      });
      return { session: created.session, event: created.event };
    },

    async deleteSession(sessionId) {
      const release = reserve(sessionId, "deleting");
      try {
        return await dependencies.store.deleteSession(sessionId);
      } finally {
        dependencies.runtime.invalidateSessionContext?.(sessionId);
        release();
      }
    },

    async readEvents(sessionId, query) {
      if (activeBySession.has(sessionId)) {
        return dependencies.store.readEvents(sessionId, query);
      }
      const release = reserve(sessionId, "recovering");
      try {
        try {
          await dependencies.runtime.recoverSession(sessionId);
        } catch (error) {
          const busy =
            error instanceof AgentLayerError &&
            error.error.code === "AGENT_SESSION_BUSY";
          if (!busy) throw error;
        }
        return await dependencies.store.readEvents(sessionId, query);
      } finally {
        release();
      }
    },

    async startRun(input, controls) {
      const release = reserve(input.sessionId, "starting");
      try {
        const metadata = await dependencies.store.getSessionMetadata(input.sessionId);
        const profile = dependencies.modelClient
          .getConfigSnapshot()
          .profiles.find((candidate) => candidate.id === metadata.modelProfileId);
        if (profile === undefined || !profile.configured) {
          throw createServerError(
            "API_MODEL_PROFILE_UNAVAILABLE",
            "会话绑定的模型配置当前不可用",
            true,
            { profileId: metadata.modelProfileId },
          );
        }
        if (input.thinking?.enabled && !profile.supportsThinking) {
          throw createServerError(
            "API_MODEL_PROFILE_UNAVAILABLE",
            "所选模型配置不支持思考选项",
            true,
            { profileId: metadata.modelProfileId, reason: "thinking_unsupported" },
          );
        }
        const permissionMode = workspacePermissions.get(metadata.workspacePath);
        const handle = await dependencies.runtime.startRun({ ...input, permissionMode }, controls);
        register(handle);
        return handle;
      } finally {
        release();
      }
    },

    async resolveApproval(runId: RunId, approvalId: ApprovalId, decision: ApprovalDecision) {
      const result = await dependencies.runtime.resolveApproval(runId, approvalId, decision);
      if (result.status === "invalid") throw new AgentLayerError(result.error);
      return result;
    },

    async resolvePlanApproval(
      runId: RunId,
      approvalId: ApprovalId,
      decision: { planId: PlanId; approved: boolean; reason?: string },
    ) {
      const result = await dependencies.runtime.resolvePlanApproval(
        runId,
        approvalId,
        decision,
      );
      if (result.status === "invalid") throw new AgentLayerError(result.error);
      return result;
    },

    cancelRun(runId, reason): CancelRunResult {
      const handle = activeByRun.get(runId);
      if (handle === undefined) return { runId, status: "not_found" };
      if (cancellationRequested.has(runId)) {
        return { runId, status: "already_requested" };
      }
      const accepted = handle.cancel(reason);
      cancellationRequested.add(runId);
      return {
        runId,
        status: accepted ? "cancellation_requested" : "already_requested",
      };
    },
  };
}
