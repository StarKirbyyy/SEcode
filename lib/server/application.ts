import path from "node:path";

import type { ApprovalDecision } from "@/lib/approval";
import {
  DEFAULT_AGENT_DURATION_MS,
  DEFAULT_MAX_AGENT_ITERATIONS,
  MAX_AGENT_DURATION_MS,
  MAX_AGENT_ITERATIONS,
  AgentLayerError,
  type AgentRunHandle,
  type AgentRuntime,
} from "@/lib/agent";
import type { ApprovalId, RunId, SessionId } from "@/lib/domain";
import type { ModelClient, ModelConfigIssue } from "@/lib/model";
import type { JsonlEventStore } from "@/lib/storage";
import type { WorkspaceHandle } from "@/lib/workspace";

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
      return { workspacePath: workspace.rootPath };
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
      const created = await dependencies.store.createSession({
        workspacePath: workspace.rootPath,
        modelProfileId: profile.id,
        title: sessionTitle(workspace.rootPath, input.title),
      });
      return { session: created.session, event: created.event };
    },

    async readEvents(sessionId, query) {
      if (!activeBySession.has(sessionId)) {
        try {
          await dependencies.runtime.recoverSession(sessionId);
        } catch (error) {
          const busy =
            error instanceof AgentLayerError &&
            error.error.code === "AGENT_SESSION_BUSY";
          if (!busy) throw error;
        }
      }
      return dependencies.store.readEvents(sessionId, query);
    },

    async startRun(input, controls) {
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
      const handle = await dependencies.runtime.startRun(input, controls);
      register(handle);
      return handle;
    },

    async resolveApproval(runId: RunId, approvalId: ApprovalId, decision: ApprovalDecision) {
      const result = await dependencies.runtime.resolveApproval(runId, approvalId, decision);
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
