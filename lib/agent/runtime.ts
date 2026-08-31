import { createHash } from "node:crypto";
import path from "node:path";

import {
  ApprovalDecisionSchema,
  type AuthorizedLocalToolInvocation,
  type PendingToolApprovalView,
} from "@/lib/approval";
import {
  MAX_LANGUAGE_RESTATEMENT_ATTEMPTS,
  OUTPUT_LANGUAGE_RESTATEMENT_POLICY,
  ContextLayerError,
  analyzeAssistantLanguage,
} from "@/lib/context";
import {
  ToolResultSchema,
  UuidSchema,
  createPublicToolArguments,
  redactSecrets,
  type ApprovalId,
  type ErrorInfo,
  type JsonObject,
  type JsonValue,
  type PlanId,
  type RunId,
  type SessionId,
  type ToolResult,
} from "@/lib/domain";
import {
  ModelAbortError,
  ModelLayerError,
  suppressContinuationContent,
  type ModelCompletion,
  type ModelContinuation,
  type NormalizedModelToolCall,
} from "@/lib/model";
import { EventStoreError } from "@/lib/storage";
import {
  DEPENDENCY_RECOVERY_TOOL_DEFINITIONS,
  LOCAL_TOOL_DEFINITIONS,
  PLANNING_TOOL_DEFINITIONS,
  LocalToolExecutionAbortedError,
  type PreparedLocalToolInvocation,
} from "@/lib/tools";
import type { WorkspaceHandle } from "@/lib/workspace";

import {
  AgentApprovalWait,
  AgentApprovalWaitAbortedError,
  type ApprovalWaitResolution,
} from "./approval-wait";
import {
  nativeAgentRuntimeDependencies,
  type AgentRuntimeDependencies,
} from "./dependencies";
import { AgentLayerError, createAgentError } from "./errors";
import {
  appendVerificationWarning,
  classifyVerificationCommand,
  createCompletionEvidenceState,
  getUncoveredCompletionEvidence,
  recordCompletionEvidenceToolResult,
  requestCompletionEvidenceCorrection,
  type CompletionEvidenceState,
} from "./completion-evidence";
import {
  createConvergenceView,
  fingerprintConvergenceView,
  renderConvergenceMessage,
} from "./convergence-view";
import {
  AgentPlanApprovalWait,
  AgentPlanApprovalWaitAbortedError,
} from "./plan-approval-wait";
import {
  createServiceHandoffState,
  decideServiceFinal,
  recordServiceHandoffToolResult,
  type ServiceHandoffState,
} from "./service-handoff";
import { AgentEventPublisher } from "./events";
import {
  createAgentProjection,
  createToolErrorSignature,
  createToolSuccessSignature,
  getSessionAgentSnapshot,
  projectAgentEvent,
  type AgentProjectionState,
} from "./projection";
import {
  AgentContextResultSchema,
  AgentPlanDecisionSchema,
  AgentRunRequestSchema,
  type ParsedAgentRunRequest,
} from "./schemas";
import {
  INVALID_TOOL_CALL_NAME,
  MAX_CONSECUTIVE_NO_PROGRESS_READS,
  MAX_CONSECUTIVE_IDENTICAL_TOOL_ERRORS,
  MAX_PROMPT_PREVIEW_CHARACTERS,
  type ActiveAgentRunView,
  type AgentApprovalResolution,
  type AgentPlanApprovalResolution,
  type AgentPlanDecision,
  type AgentRunControls,
  type AgentRunHandle,
  type AgentRunOutcome,
  type AgentRunPhase,
  type AgentRunRequest,
  type AgentRuntime,
  type AgentRuntimeOptions,
  type AgentToolCapability,
  type SessionAgentSnapshot,
} from "./types";
import {
  createWorkspaceObservationState,
  evaluateWriteDependency,
  updateWorkspaceObservations,
  type WorkspaceObservationState,
} from "./workspace-observations";
import { StreamingVisibleTextGate } from "./streaming-visible-text";
import {
  createValidationRepairState,
  recordValidationRepairToolResult,
  type ValidationRepairState,
} from "./validation-repair";
import {
  createWriteDependencyRecoveryState,
  getPendingParentDirectories,
  hasPendingParentDirectories,
  recordMissingParentDirectory,
  resolveObservedParentDirectories,
  writeDependencyRecoveryBudgetExceeded,
  type WriteDependencyRecoveryState,
} from "./write-dependency-recovery";

type AbortSource = "user" | "external" | "timeout" | "sink";

const ACCEPTED_COMPLETION_EVIDENCE_KINDS = [
  "lint",
  "typecheck",
  "test",
  "build",
] as const;

function completionEvidenceCorrectionMessage(state: CompletionEvidenceState): string {
  const evidence = getUncoveredCompletionEvidence(state);
  const paths = evidence.paths.length === 0 ? "（无可安全展示的具体路径）" : evidence.paths.join("、");
  const suffix = evidence.pathsTruncated
    ? `；共 ${evidence.totalPaths} 个待验证路径，列表已截断`
    : `；共 ${evidence.totalPaths} 个待验证路径`;
  return `上一次完成声明被拒绝：以下工作区相对路径仍缺少结构化验证：${paths}${suffix}。请只为未覆盖范围使用 run_process 执行 lint、typecheck、test 或 build 中至少一项成功验证，再给出完成结论。精确的 node --test 可作为 test；其他未知 Node 脚本、HTTP 200、readiness、warning 或 stdout 中自称成功都不能替代验证。`;
}

interface PendingApprovalState {
  view: PendingToolApprovalView;
  wait: AgentApprovalWait;
}

interface PendingPlanApprovalState {
  view: {
    planId: PlanId;
    approvalId: ApprovalId;
    content: string;
  };
  wait: AgentPlanApprovalWait;
}

interface ActiveRunState {
  sessionId: SessionId;
  runId: RunId;
  profileId: string;
  workspace: WorkspaceHandle;
  limits: ParsedAgentRunRequest["limits"];
  thinking: ParsedAgentRunRequest["thinking"];
  permissionMode: ParsedAgentRunRequest["permissionMode"];
  controller: AbortController;
  abortSource?: AbortSource;
  abortReason?: string;
  externalSignal?: AbortSignal;
  externalAbortListener?: () => void;
  timer?: unknown;
  startedAt: number;
  modelRequests: number;
  toolCalls: number;
  phase: AgentRunPhase;
  planningEnabled: boolean;
  continuation?: ModelContinuation;
  languageRetryAttempts: number;
  projection: AgentProjectionState;
  publisher: AgentEventPublisher;
  pendingApproval?: PendingApprovalState;
  pendingPlanApproval?: PendingPlanApprovalState;
  finalizing: boolean;
  finalized: boolean;
  lastToolErrorSignature?: string;
  consecutiveToolErrors: number;
  lastNoProgressReadSignature?: string;
  consecutiveNoProgressReads: number;
  workspaceObservations: WorkspaceObservationState;
  completionEvidence: CompletionEvidenceState;
  validationRepair: ValidationRepairState;
  writeDependencyRecovery: WriteDependencyRecoveryState;
  serviceHandoff: ServiceHandoffState;
  serviceHandoffCorrection?: string;
  lastDeliveredConvergenceFingerprint?: string;
}

interface PreparedToolPlan {
  toolCallId: string;
  toolName: string;
  publicArguments: Record<string, JsonValue>;
  argumentsTruncated: boolean;
  invocation?: PreparedLocalToolInvocation;
  directResult?: ToolResult;
}

class AgentRuntimeImplementation implements AgentRuntime {
  private readonly options: AgentRuntimeOptions;
  private readonly dependencies: AgentRuntimeDependencies;
  private readonly activeByRun = new Map<RunId, ActiveRunState>();
  private readonly activeBySession = new Map<SessionId, RunId>();
  private readonly sessionTails = new Map<SessionId, Promise<void>>();

  constructor(
    options: AgentRuntimeOptions,
    dependencies: AgentRuntimeDependencies,
  ) {
    this.options = options;
    this.dependencies = dependencies;
  }

  invalidateSessionContext(sessionId: SessionId): void {
    this.options.contextProvider.invalidateSession?.(sessionId);
  }

  async recoverSession(sessionIdValue: SessionId): Promise<SessionAgentSnapshot> {
    const sessionId = this.parseSessionId(sessionIdValue);
    return this.withSessionLock(sessionId, async () => {
      if (this.activeBySession.has(sessionId)) {
        throw createAgentError(
          "AGENT_SESSION_BUSY",
          "当前 Session 已有运行中的任务",
          { sessionId },
        );
      }
      return this.recoverSessionUnlocked(sessionId);
    });
  }

  async startRun(
    requestValue: AgentRunRequest,
    controls: AgentRunControls = {},
  ): Promise<AgentRunHandle> {
    const parsed = this.parseRunRequest(requestValue);
    return this.withSessionLock(parsed.sessionId, async () => {
      if (controls.signal?.aborted) {
        throw createAgentError(
          "AGENT_START_ABORTED",
          "运行在开始前已取消",
        );
      }
      if (this.activeBySession.has(parsed.sessionId)) {
        throw createAgentError(
          "AGENT_SESSION_BUSY",
          "当前 Session 已有运行中的任务",
          { sessionId: parsed.sessionId },
        );
      }

      const projection = await this.recoverProjectionUnlocked(parsed.sessionId);
      const inspection = await this.options.eventStore.inspectSession(parsed.sessionId);
      let workspace: WorkspaceHandle;
      try {
        workspace = await this.dependencies.createWorkspaceHandle(
          inspection.metadata.workspacePath,
        );
      } catch (cause) {
        throw createAgentError(
          "AGENT_WORKSPACE_UNAVAILABLE",
          "Session 工作区当前不可用",
          { sessionId: parsed.sessionId },
          cause,
        );
      }

      let registry;
      try {
        registry = this.options.modelClient.getConfigSnapshot();
      } catch (cause) {
        throw createAgentError(
          "AGENT_MODEL_UNAVAILABLE",
          "模型配置快照无法读取",
          undefined,
          cause,
        );
      }
      const profile = registry.profiles.find(
        (candidate) => candidate.id === inspection.metadata.modelProfileId,
      );
      if (profile === undefined || !profile.configured) {
        throw createAgentError(
          "AGENT_MODEL_UNAVAILABLE",
          "Session 绑定的模型配置不可用",
          { modelProfileId: inspection.metadata.modelProfileId },
        );
      }
      if (parsed.thinking?.enabled && !profile.supportsThinking) {
        throw createAgentError(
          "AGENT_INPUT_INVALID",
          "当前模型不支持 thinking 配置",
          { modelProfileId: profile.id },
        );
      }
      if (
        this.options.contextProvider === undefined ||
        typeof this.options.contextProvider.buildContext !== "function"
      ) {
        throw createAgentError(
          "AGENT_CONTEXT_FAILED",
          "Agent 上下文提供器不可用",
        );
      }

      const prompt = redactSecrets(parsed.prompt);
      const runId = UuidSchema.parse(this.dependencies.randomUUID());
      if (this.activeByRun.has(runId)) {
        throw createAgentError(
          "AGENT_INTERNAL_ERROR",
          "运行标识发生冲突",
        );
      }
      const controller = new AbortController();
      const activeHolder: { current?: ActiveRunState } = {};
      const publisher = new AgentEventPublisher({
        eventStore: this.options.eventStore,
        sessionId: parsed.sessionId,
        runId,
        projection,
        sink: controls.onEvent,
        dependencies: this.dependencies,
        onSinkFailure: () => {
          const current = activeHolder.current;
          if (current !== undefined) {
            this.requestAbort(current, "sink", "事件消费者已断开");
          }
        },
      });
      const active: ActiveRunState = {
        sessionId: parsed.sessionId,
        runId,
        profileId: profile.id,
        workspace,
        limits: parsed.limits,
      thinking: parsed.thinking,
      permissionMode: parsed.permissionMode,
        controller,
        startedAt: this.dependencies.monotonicNow(),
        modelRequests: 0,
        toolCalls: 0,
        planningEnabled: parsed.planningEnabled,
        phase: parsed.planningEnabled ? "planning" : "normal",
        languageRetryAttempts: 0,
        projection,
        publisher,
        finalizing: false,
        finalized: false,
        consecutiveToolErrors: 0,
        consecutiveNoProgressReads: 0,
        workspaceObservations: createWorkspaceObservationState(),
        completionEvidence: createCompletionEvidenceState(),
        validationRepair: createValidationRepairState(),
        writeDependencyRecovery: createWriteDependencyRecoveryState(),
        serviceHandoff: createServiceHandoffState(),
      };
      activeHolder.current = active;

      this.linkExternalSignal(active, controls.signal);
      active.timer = this.dependencies.setTimer(() => {
        this.requestAbort(active, "timeout", "运行超过最大时限");
      }, parsed.limits.maxDurationMs);
      this.activeByRun.set(runId, active);
      this.activeBySession.set(parsed.sessionId, runId);

      try {
        await publisher.append({
          type: "run.started",
          runId,
          data: {
            promptPreview: prompt.slice(0, MAX_PROMPT_PREVIEW_CHARACTERS),
            planningEnabled: parsed.planningEnabled,
            limits: {
              ...(parsed.limits.maxModelRequests === undefined
                ? {}
                : { maxIterations: parsed.limits.maxModelRequests }),
              maxToolCalls: parsed.limits.maxToolCalls,
              maxDurationMs: parsed.limits.maxDurationMs,
            },
          },
        });
      } catch (cause) {
        this.cleanupActiveRun(active);
        throw cause;
      }

      const completion = this.executeRun(active, prompt).finally(() => {
        this.cleanupActiveRun(active);
      });
      return Object.freeze({
        sessionId: parsed.sessionId,
        runId,
        completion,
        cancel: (reason?: string) => this.cancelRun(runId, reason),
      });
    });
  }

  cancelRun(runId: RunId, reason?: string): boolean {
    const active = this.activeByRun.get(runId);
    if (active === undefined || active.finalizing || active.finalized) return false;
    return this.requestAbort(
      active,
      "user",
      this.sanitizeReason(reason, "用户取消运行"),
    );
  }

  async resolveApproval(
    runId: RunId,
    approvalId: ApprovalId,
    decisionValue: unknown,
  ): Promise<AgentApprovalResolution> {
    const active = this.activeByRun.get(runId);
    if (active === undefined || active.finalized) {
      return this.invalidApproval(
        "AGENT_RUN_NOT_FOUND",
        "没有找到当前运行",
      );
    }
    if (active.controller.signal.aborted || active.finalizing) {
      return this.invalidApproval(
        "AGENT_APPROVAL_NOT_PENDING",
        "运行正在终止，不能再处理审批",
      );
    }
    const pending = active.pendingApproval;
    if (pending === undefined) {
      return this.invalidApproval(
        "AGENT_APPROVAL_NOT_PENDING",
        "当前运行没有待审批操作",
      );
    }
    const parsedDecision = ApprovalDecisionSchema.safeParse(decisionValue);
    if (!parsedDecision.success) {
      return this.invalidApproval(
        "AGENT_APPROVAL_INVALID",
        "审批决定格式无效",
      );
    }
    const decision = {
      approved: parsedDecision.data.approved,
      ...(parsedDecision.data.reason === undefined
        ? {}
        : {
            reason: this.sanitizeReason(parsedDecision.data.reason, ""),
          }),
    };
    const resolution = this.dependencies.resolveLocalToolApproval(
      pending.wait.pending,
      approvalId,
      decision,
    );
    if (resolution.status === "invalid") {
      return this.invalidApproval(
        "AGENT_APPROVAL_INVALID",
        resolution.error.message,
      );
    }

    try {
      await active.publisher.append({
        type: "approval.resolved",
        runId,
        data: {
          approvalId,
          approved: decision.approved,
          ...(decision.reason === undefined ? {} : { reason: decision.reason }),
        },
      });
    } catch (cause) {
      active.pendingApproval = undefined;
      pending.wait.reject(cause);
      throw cause;
    }

    active.pendingApproval = undefined;
    const waitResolution: ApprovalWaitResolution = resolution.status === "authorized"
      ? { status: "authorized", authorization: resolution.authorization }
      : { status: "rejected", result: resolution.result };
    pending.wait.resolve(waitResolution);
    return Object.freeze({ status: "resolved", approved: decision.approved });
  }

  async resolvePlanApproval(
    runId: RunId,
    approvalId: ApprovalId,
    decisionValue: AgentPlanDecision,
  ): Promise<AgentPlanApprovalResolution> {
    const active = this.activeByRun.get(runId);
    if (active === undefined || active.finalized) {
      return this.invalidPlanApproval("AGENT_RUN_NOT_FOUND", "没有找到当前运行");
    }
    if (active.controller.signal.aborted || active.finalizing) {
      return this.invalidPlanApproval(
        "AGENT_PLAN_NOT_PENDING",
        "运行正在终止，不能再处理计划审批",
      );
    }
    const pending = active.pendingPlanApproval;
    if (pending === undefined || active.phase !== "awaiting_plan_approval") {
      return this.invalidPlanApproval(
        "AGENT_PLAN_NOT_PENDING",
        "当前运行没有待审批计划",
      );
    }
    const parsed = AgentPlanDecisionSchema.safeParse(decisionValue);
    if (
      !parsed.success ||
      parsed.data.planId !== pending.view.planId ||
      approvalId !== pending.view.approvalId
    ) {
      return this.invalidPlanApproval(
        "AGENT_PLAN_APPROVAL_INVALID",
        "计划审批标识或决定格式无效",
      );
    }
    const reason = parsed.data.reason === undefined
      ? undefined
      : this.sanitizeReason(parsed.data.reason, "");
    await active.publisher.append({
      type: "plan.approval.resolved",
      runId,
      data: {
        planId: pending.view.planId,
        approvalId: pending.view.approvalId,
        approved: parsed.data.approved,
        ...(reason === undefined ? {} : { reason }),
      },
    });

    active.pendingPlanApproval = undefined;
    if (parsed.data.approved) {
      active.phase = "executing";
      active.continuation = undefined;
    }
    pending.wait.resolve({
      approved: parsed.data.approved,
      ...(reason === undefined ? {} : { reason }),
    });
    return Object.freeze({ status: "resolved", approved: parsed.data.approved });
  }

  getActiveRun(runId: RunId): ActiveAgentRunView | undefined {
    const active = this.activeByRun.get(runId);
    if (active === undefined || active.finalized) return undefined;
    const snapshot = getSessionAgentSnapshot(active.projection).activeRun;
    if (snapshot === undefined) return undefined;
    return Object.freeze({
      sessionId: active.sessionId,
      runId: active.runId,
      status: snapshot.status,
      iterations: active.modelRequests,
      modelRequests: active.modelRequests,
      toolCalls: active.toolCalls,
      phase: active.phase,
      planningEnabled: active.planningEnabled,
      limits: snapshot.limits,
      ...(snapshot.pendingApproval === undefined
        ? {}
        : { pendingApproval: snapshot.pendingApproval }),
      ...(snapshot.pendingPlanApproval === undefined
        ? {}
        : { pendingPlanApproval: snapshot.pendingPlanApproval }),
    });
  }

  private parseSessionId(value: SessionId): SessionId {
    const parsed = UuidSchema.safeParse(value);
    if (!parsed.success) {
      throw createAgentError("AGENT_INPUT_INVALID", "Session ID 格式无效");
    }
    return parsed.data;
  }

  private parseRunRequest(value: AgentRunRequest): ParsedAgentRunRequest {
    const parsed = AgentRunRequestSchema.safeParse(value);
    if (!parsed.success) {
      throw createAgentError("AGENT_INPUT_INVALID", "运行请求格式无效", {
        reason: parsed.error.issues[0]?.message ?? "invalid_request",
      });
    }
    return parsed.data;
  }

  private async withSessionLock<T>(
    sessionId: SessionId,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.sessionTails.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.sessionTails.set(sessionId, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.sessionTails.get(sessionId) === tail) {
        this.sessionTails.delete(sessionId);
      }
    }
  }

  private async loadProjection(sessionId: SessionId): Promise<AgentProjectionState> {
    const projection = createAgentProjection();
    let afterSeq = 0;
    while (true) {
      const page = await this.options.eventStore.readEvents(sessionId, {
        afterSeq,
        limit: 1_000,
      });
      for (const event of page.events) {
        projectAgentEvent(projection, event);
        afterSeq = event.seq;
      }
      if (!page.hasMore) break;
      if (page.events.length === 0) {
        throw createAgentError(
          "AGENT_HISTORY_INVALID",
          "事件分页没有取得进展",
          { sessionId, afterSeq },
        );
      }
    }
    return projection;
  }

  private async recoverProjectionUnlocked(
    sessionId: SessionId,
  ): Promise<AgentProjectionState> {
    const inspection = await this.options.eventStore.inspectSession(sessionId);
    const projection = await this.loadProjection(sessionId);
    const projectedOpenRun = projection.currentRun?.runId;
    if (
      inspection.recovery.openRunIds.length > 1 ||
      (inspection.recovery.openRunIds.length === 0 && projectedOpenRun !== undefined) ||
      (inspection.recovery.openRunIds.length === 1 &&
        inspection.recovery.openRunIds[0] !== projectedOpenRun)
    ) {
      throw createAgentError(
        "AGENT_HISTORY_INVALID",
        "Session 未结束运行报告与事件历史不一致",
        { sessionId, reason: "open_run_mismatch" },
      );
    }
    if (projectedOpenRun === undefined) return projection;
    await this.options.eventStore.appendEvent(sessionId, {
      type: "run.interrupted",
      runId: projectedOpenRun,
      data: {
        reason: "进程重启后运行能力已失效",
        lastStableSeq: inspection.recovery.lastStableSeq,
      },
    });
    return this.loadProjection(sessionId);
  }

  private async recoverSessionUnlocked(
    sessionId: SessionId,
  ): Promise<SessionAgentSnapshot> {
    return getSessionAgentSnapshot(
      await this.recoverProjectionUnlocked(sessionId),
    );
  }

  private linkExternalSignal(
    active: ActiveRunState,
    signal: AbortSignal | undefined,
  ) {
    if (signal === undefined) return;
    const listener = () => {
      this.requestAbort(active, "external", "调用方取消运行");
    };
    active.externalSignal = signal;
    active.externalAbortListener = listener;
    signal.addEventListener("abort", listener, { once: true });
  }

  private requestAbort(
    active: ActiveRunState,
    source: AbortSource,
    reason: string,
  ): boolean {
    if (
      active.abortSource !== undefined ||
      active.finalizing ||
      active.finalized
    ) return false;
    active.abortSource = source;
    active.abortReason = this.sanitizeReason(reason, "运行已取消");
    active.pendingApproval?.wait.abort();
    active.pendingPlanApproval?.wait.abort();
    active.controller.abort();
    return true;
  }

  private throwIfAborted(active: ActiveRunState): void {
    if (active.controller.signal.aborted) {
      throw new ModelAbortError("Agent 运行已取消");
    }
  }

  private async executeRun(
    active: ActiveRunState,
    prompt: string,
  ): Promise<AgentRunOutcome> {
    try {
      this.throwIfAborted(active);
      await active.publisher.append({
        type: "user.message",
        runId: active.runId,
        data: { content: prompt },
      });

      while (true) {
        this.throwIfAborted(active);
        if (writeDependencyRecoveryBudgetExceeded(
          active.writeDependencyRecovery,
          active.modelRequests,
          active.toolCalls,
        )) {
          throw createAgentError(
            "AGENT_WRITE_DEPENDENCY_UNRESOLVED",
            "写入父目录依赖未在局部预算内解除",
            { pendingParents: getPendingParentDirectories(active.writeDependencyRecovery) },
          );
        }
        const maxModelRequests = active.limits.maxModelRequests;
        if (
          maxModelRequests !== undefined &&
          active.modelRequests >= maxModelRequests
        ) {
          throw createAgentError(
            "AGENT_ITERATION_LIMIT",
            "Agent 已达到最大模型请求数",
            { maxModelRequests },
          );
        }

        const nextIteration = active.modelRequests + 1;
        const toolCapability = this.toolCapability(active);
        let context;
        try {
          const rawContext = await this.options.contextProvider.buildContext({
            sessionId: active.sessionId,
            runId: active.runId,
            iteration: nextIteration,
            signal: active.controller.signal,
            toolCapability,
          });
          context = AgentContextResultSchema.parse(rawContext);
        } catch (cause) {
          if (active.controller.signal.aborted) throw cause;
          let contextDetails: JsonObject | undefined;
          if (cause instanceof ContextLayerError) {
            contextDetails = { contextCode: cause.error.code };
            const reason = cause.error.details?.reason;
            if (
              reason === "model_timeout" ||
              reason === "model_failed" ||
              reason === "model_output_invalid" ||
              reason === "summary_input_over_budget" ||
              reason === "fallback_over_budget" ||
              reason === "projected_recent_rounds_over_budget"
            ) contextDetails.reason = reason;
            else if (reason === "MODEL_TIMEOUT") {
              contextDetails.reason = "model_timeout";
            }
          }
          throw createAgentError(
            "AGENT_CONTEXT_FAILED",
            "模型上下文构建失败",
            contextDetails,
            cause,
          );
        }
        this.throwIfAborted(active);

        if (context.compaction !== undefined) {
          await active.publisher.append({
            type: "context.compacted",
            runId: active.runId,
            data: {
              ...context.compaction,
              strategy: context.compaction.strategy ?? "model",
            },
          });
          this.throwIfAborted(active);
        }
        await active.publisher.append({
          type: "model.requested",
          runId: active.runId,
          data: { iteration: nextIteration, modelProfileId: active.profileId },
        });
        active.modelRequests = nextIteration;

        let completion: ModelCompletion;
        const convergenceView = createConvergenceView(
          active.completionEvidence,
          active.serviceHandoff,
          { closing: active.modelRequests >= 20 },
        );
        const convergenceMessage = renderConvergenceMessage(convergenceView);
        const convergenceFingerprint = convergenceMessage === undefined
          ? undefined
          : fingerprintConvergenceView(convergenceView);
        const convergenceUpdate =
          convergenceMessage !== undefined &&
          convergenceFingerprint !== active.lastDeliveredConvergenceFingerprint
            ? convergenceMessage
            : undefined;
        if (convergenceUpdate !== undefined) {
          active.lastDeliveredConvergenceFingerprint = convergenceFingerprint;
        }
        const visibleGate = new StreamingVisibleTextGate(async (content) => {
          await active.publisher.publishLive(content, nextIteration);
          this.throwIfAborted(active);
        });
        let publishedCharacters = 0;
        try {
          completion = await this.options.modelClient.complete({
            profileId: active.profileId,
            messages: [
              ...context.messages,
              ...(active.languageRetryAttempts === 0
                ? []
                : [{
                    role: "system" as const,
                    content: OUTPUT_LANGUAGE_RESTATEMENT_POLICY,
                  }]),
              ...(active.completionEvidence.correctionAttempts === 0
                ? []
                : [{
                    role: "system" as const,
                    content: completionEvidenceCorrectionMessage(active.completionEvidence),
                  }]),
              ...(active.serviceHandoffCorrection === undefined
                ? []
                : [{
                    role: "system" as const,
                    content: active.serviceHandoffCorrection,
                  }]),
              ...(convergenceUpdate === undefined
                ? []
                : [{
                    role: "system" as const,
                    content: convergenceUpdate,
                  }]),
              ...(!hasPendingParentDirectories(active.writeDependencyRecovery)
                ? []
                : [{
                    role: "system" as const,
                    content: `写入依赖恢复：以下工作区相对父目录已知缺失：${getPendingParentDirectories(active.writeDependencyRecovery).join("、")}。请先用 run_process 显式创建目录，再用完整 list_directory 重新观察。恢复前不可写入或替换文件。`,
                  }]),
            ],
            tools: [...this.toolDefinitions(toolCapability)],
            signal: active.controller.signal,
            ...(active.continuation === undefined
              ? {}
              : { continuation: active.continuation }),
            ...(active.thinking === undefined ? {} : { thinking: active.thinking }),
            onTextDelta: (content) => visibleGate.push(content),
          });
          publishedCharacters = (await visibleGate.finish()).publishedCharacters;
        } catch (cause) {
          visibleGate.abort();
          throw cause;
        }

        this.throwIfAborted(active);
        active.continuation = completion.continuation;
        await active.publisher.append({
          type: "model.completed",
          runId: active.runId,
          data: {
            iteration: nextIteration,
            finishReason: completion.finishReason,
            ...(completion.usage === undefined
              ? {}
              : {
                  usage: {
                    ...(completion.usage.promptTokens === undefined
                      ? {}
                      : { promptTokens: completion.usage.promptTokens }),
                    ...(completion.usage.completionTokens === undefined
                      ? {}
                      : { completionTokens: completion.usage.completionTokens }),
                    ...(completion.usage.totalTokens === undefined
                      ? {}
                      : { totalTokens: completion.usage.totalTokens }),
                    ...(completion.usage.reasoningTokens === undefined
                      ? {}
                      : { reasoningTokens: completion.usage.reasoningTokens }),
                    ...(completion.usage.cachedPromptTokens === undefined
                      ? {}
                      : { cachedPromptTokens: completion.usage.cachedPromptTokens }),
                    ...(completion.usage.cacheMissPromptTokens === undefined
                      ? {}
                      : { cacheMissPromptTokens: completion.usage.cacheMissPromptTokens }),
                  },
                }),
            ...(completion.usageComplete === undefined
              ? {}
              : { usageComplete: completion.usageComplete }),
            ...(context.contextCache === undefined
              ? {}
              : { contextCache: context.contextCache }),
          },
        });

        if (completion.finishReason === "stop") {
          let content = this.visibleContent(completion.content);
          this.assertVisibleContentSize(content);
          if (!analyzeAssistantLanguage(content).ok) {
            await this.rejectStopContent(active, nextIteration, content);
            continue;
          }
          active.languageRetryAttempts = 0;
          if (active.phase === "planning") {
            const approved = await this.proposeAndAwaitPlan(active, content);
            if (!approved) {
              return await this.finishCancelled(active, "用户拒绝执行计划");
            }
            continue;
          }
          if (hasPendingParentDirectories(active.writeDependencyRecovery)) {
            active.writeDependencyRecovery.stopAttempts += 1;
            active.continuation = undefined;
            if (active.writeDependencyRecovery.stopAttempts >= 2) {
              throw createAgentError(
                "AGENT_WRITE_DEPENDENCY_UNRESOLVED",
                "写入父目录依赖仍未解除",
                { pendingParents: getPendingParentDirectories(active.writeDependencyRecovery) },
              );
            }
            await active.publisher.append({
              type: "write.dependency.rejected",
              runId: active.runId,
              data: {
                iteration: nextIteration,
                pendingParents: getPendingParentDirectories(active.writeDependencyRecovery),
                correctionAttempt: active.writeDependencyRecovery.stopAttempts,
              },
            });
            continue;
          }
          if (active.completionEvidence.pendingValidation) {
            const correctionAttempt = requestCompletionEvidenceCorrection(
              active.completionEvidence,
            );
            const uncovered = getUncoveredCompletionEvidence(active.completionEvidence);
            if (correctionAttempt !== undefined) {
              active.continuation = undefined;
              await active.publisher.append({
                type: "completion.evidence.rejected",
                runId: active.runId,
                data: {
                  iteration: nextIteration,
                  missing: ["post_change_verification"],
                  correctionAttempt,
                  uncoveredScopes: uncovered.scopes,
                  uncoveredPaths: uncovered.paths,
                  uncoveredPathCount: uncovered.totalPaths,
                  uncoveredPathsTruncated: uncovered.pathsTruncated,
                  acceptedKinds: [...ACCEPTED_COMPLETION_EVIDENCE_KINDS],
                },
              });
              continue;
            }
            content = appendVerificationWarning(content, uncovered);
          }
          const serviceFinal = decideServiceFinal(
            active.serviceHandoff,
            content,
          );
          if (serviceFinal.kind === "retry") {
            active.continuation = undefined;
            active.serviceHandoffCorrection = serviceFinal.message;
            continue;
          }
          if (serviceFinal.appendix !== undefined && !content.includes(serviceFinal.appendix)) {
            content = `${content}\n\n${serviceFinal.appendix}`;
          }
          active.serviceHandoffCorrection = undefined;
          this.assertVisibleContentSize(content);
          return await this.completeTextRun(
            active,
            content,
            publishedCharacters === 0,
          );
        }
        if (active.languageRetryAttempts > 0) {
          throw createAgentError(
            "AGENT_OUTPUT_LANGUAGE_INVALID",
            "中文重述请求返回了新的工具调用",
          );
        }
        const toolCompletion = await this.applyToolNarrativePolicy(
          active,
          nextIteration,
          completion,
        );
        active.languageRetryAttempts = 0;
        await this.processToolCalls(
          active,
          toolCompletion,
          publishedCharacters === 0,
        );
      }
    } catch (cause) {
      if (cause instanceof EventStoreError) {
        active.publisher.disableSink();
        throw cause;
      }
      return this.finishFromError(active, cause);
    }
  }

  private async completeTextRun(
    active: ActiveRunState,
    content: string | null,
    publishFallback: boolean,
  ): Promise<AgentRunOutcome> {
    const sanitized = this.visibleContent(content);
    if (sanitized.length === 0) {
      throw createAgentError(
        "AGENT_MODEL_OUTPUT_INVALID",
        "模型完成响应缺少可见文本",
      );
    }
    if (sanitized.length > 1_048_576) {
      throw createAgentError(
        "AGENT_ASSISTANT_MESSAGE_TOO_LARGE",
        "模型可见消息超过事件上限",
      );
    }
    if (publishFallback) {
      await active.publisher.publishLive(sanitized, active.modelRequests);
    }
    this.throwIfAborted(active);
    await active.publisher.append({
      type: "assistant.message",
      runId: active.runId,
      data: { content: sanitized, kind: "final" },
    });
    this.throwIfAborted(active);
    const durationMs = this.duration(active);
    active.finalizing = true;
    await active.publisher.append({
      type: "run.completed",
      runId: active.runId,
      data: { iterations: active.modelRequests, durationMs },
    });
    active.finalized = true;
    return Object.freeze({
      status: "completed",
      runId: active.runId,
      iterations: active.modelRequests,
      modelRequests: active.modelRequests,
      toolCalls: active.toolCalls,
      durationMs,
    });
  }

  private visibleContent(content: string | null): string {
    return content === null ? "" : redactSecrets(content).trim();
  }

  private assertVisibleContentSize(content: string): void {
    if (content.length > 1_048_576) {
      throw createAgentError(
        "AGENT_ASSISTANT_MESSAGE_TOO_LARGE",
        "模型可见消息超过事件上限",
      );
    }
  }

  private async appendLanguageRejection(
    active: ActiveRunState,
    iteration: number,
    content: string,
    action: "retry" | "content_suppressed",
    retryAttempt: number,
  ): Promise<void> {
    await active.publisher.append({
      type: "model.output.rejected",
      runId: active.runId,
      data: {
        iteration,
        reason: "language_mismatch",
        action,
        retryAttempt,
        contentCharacters: content.length,
        contentSha256: createHash("sha256").update(content).digest("hex"),
      },
    });
  }

  private async rejectStopContent(
    active: ActiveRunState,
    iteration: number,
    content: string,
  ): Promise<void> {
    const rejectionNumber = active.languageRetryAttempts + 1;
    active.languageRetryAttempts = rejectionNumber;
    active.continuation = undefined;
    await this.appendLanguageRejection(
      active,
      iteration,
      content,
      "retry",
      Math.min(rejectionNumber, MAX_LANGUAGE_RESTATEMENT_ATTEMPTS),
    );
    if (rejectionNumber > MAX_LANGUAGE_RESTATEMENT_ATTEMPTS) {
      throw createAgentError(
        "AGENT_OUTPUT_LANGUAGE_INVALID",
        "模型连续三次返回不符合简体中文要求的内容",
        { attempts: rejectionNumber },
      );
    }
  }

  private async applyToolNarrativePolicy(
    active: ActiveRunState,
    iteration: number,
    completion: ModelCompletion,
  ): Promise<ModelCompletion> {
    const content = this.visibleContent(completion.content);
    this.assertVisibleContentSize(content);
    if (content.length === 0 || analyzeAssistantLanguage(content).ok) {
      return content === completion.content
        ? completion
        : { ...completion, content: content || null };
    }
    await this.appendLanguageRejection(
      active,
      iteration,
      content,
      "content_suppressed",
      0,
    );
    const continuation = suppressContinuationContent(completion.continuation);
    active.continuation = continuation;
    return { ...completion, content: null, continuation };
  }

  private async proposeAndAwaitPlan(
    active: ActiveRunState,
    content: string | null,
  ): Promise<boolean> {
    const sanitized = content === null ? "" : redactSecrets(content).trim();
    if (sanitized.length === 0) {
      throw createAgentError(
        "AGENT_MODEL_OUTPUT_INVALID",
        "规划阶段未返回完整计划",
      );
    }
    if (sanitized.length > 1_048_576) {
      throw createAgentError(
        "AGENT_ASSISTANT_MESSAGE_TOO_LARGE",
        "计划正文超过事件上限",
      );
    }
    const planId = UuidSchema.parse(this.dependencies.randomUUID());
    const approvalId = UuidSchema.parse(this.dependencies.randomUUID());
    if (planId === approvalId || planId === active.runId || approvalId === active.runId) {
      throw createAgentError("AGENT_INTERNAL_ERROR", "计划标识发生冲突");
    }
    const wait = new AgentPlanApprovalWait();
    const view = Object.freeze({ planId, approvalId, content: sanitized });
    active.pendingPlanApproval = { view, wait };
    try {
      await active.publisher.append({
        type: "plan.proposed",
        runId: active.runId,
        data: view,
      });
    } catch (cause) {
      active.pendingPlanApproval = undefined;
      wait.reject(cause);
      throw cause;
    }
    active.phase = "awaiting_plan_approval";
    if (active.controller.signal.aborted) wait.abort();
    const resolution = await wait.promise;
    return resolution.approved;
  }

  private async processToolCalls(
    active: ActiveRunState,
    completion: ModelCompletion,
    publishFallback: boolean,
  ): Promise<void> {
    if (completion.toolCalls.length === 0) {
      throw createAgentError(
        "AGENT_MODEL_OUTPUT_INVALID",
        "tool_calls 完成原因未包含工具调用",
      );
    }
    if (active.toolCalls + completion.toolCalls.length > active.limits.maxToolCalls) {
      throw createAgentError(
        "AGENT_TOOL_CALL_LIMIT",
        "Agent 工具调用批次超过最大限制",
        {
          toolCalls: active.toolCalls,
          requestedBatch: completion.toolCalls.length,
          maxToolCalls: active.limits.maxToolCalls,
        },
      );
    }
    if (completion.content !== null) {
      const content = redactSecrets(completion.content);
      if (content.length > 1_048_576) {
        throw createAgentError(
          "AGENT_ASSISTANT_MESSAGE_TOO_LARGE",
          "模型可见消息超过事件上限",
        );
      }
      if (content.length > 0) {
        if (publishFallback) {
          await active.publisher.publishLive(content, active.modelRequests);
        }
        this.throwIfAborted(active);
        await active.publisher.append({
          type: "assistant.message",
          runId: active.runId,
          data: { content, kind: "intermediate" },
        });
      }
    }

    const plans = completion.toolCalls.map((call) => this.createToolPlan(active, call));
    const seen = new Set(active.projection.currentRun?.toolCallIds ?? []);
    for (const plan of plans) {
      if (seen.has(plan.toolCallId)) {
        throw createAgentError(
          "AGENT_MODEL_OUTPUT_INVALID",
          "模型重复使用工具调用标识",
          { toolCallId: plan.toolCallId },
        );
      }
      seen.add(plan.toolCallId);
    }
    for (const plan of plans) {
      await active.publisher.append({
        type: "tool.requested",
        runId: active.runId,
        data: {
          toolCallId: UuidSchema.parse(plan.toolCallId),
          toolName: plan.toolName,
          publicArguments: plan.publicArguments,
          argumentsTruncated: plan.argumentsTruncated,
        },
      });
      active.toolCalls += 1;
    }
    const preflightParents = new Set<string>();
    const failedValidatorByCwd = new Map<string, string>();
    for (const plan of plans) {
      this.throwIfAborted(active);
      let result: ToolResult;
      let batchSkipped = false;
      const validatorCwd = plan.invocation?.name === "run_process" &&
        (plan.invocation.arguments.lifecycle ?? "oneshot") === "oneshot" &&
        classifyVerificationCommand(
          plan.invocation.arguments.program,
          plan.invocation.arguments.args,
        ) !== undefined
        ? path.posix.normalize(plan.invocation.arguments.cwd.replaceAll("\\", "/"))
        : undefined;
      const blockedByToolCallId = validatorCwd === undefined
        ? undefined
        : failedValidatorByCwd.get(validatorCwd);
      if (blockedByToolCallId !== undefined) {
        batchSkipped = true;
        result = ToolResultSchema.parse({
          ok: false,
          summary: "同批后续验证已跳过",
          metadata: {
            skipped: true,
            reason: "prior_validator_failed",
          },
          error: {
            code: "VALIDATION_BATCH_SKIPPED",
            message: "同一目录的前置验证失败",
            recoverable: true,
            details: {
              cwd: validatorCwd,
              blockedByToolCallId,
            },
          },
        });
      } else if (plan.directResult !== undefined) {
        result = plan.directResult;
      } else if (plan.invocation !== undefined) {
        const dependency = evaluateWriteDependency(
          active.workspaceObservations,
          plan.invocation,
        );
        if (dependency.kind === "known_missing_parent") {
          const suppressed = preflightParents.has(dependency.parent);
          preflightParents.add(dependency.parent);
          recordMissingParentDirectory(
            active.writeDependencyRecovery,
            dependency.parent,
            active.modelRequests,
            active.toolCalls,
          );
          result = this.createMissingParentPreflightResult(
            dependency.parent,
            plan.invocation,
            suppressed,
          );
        } else {
          result = await this.authorizeAndExecute(active, plan);
        }
        updateWorkspaceObservations(
          active.workspaceObservations,
          plan.invocation,
          result,
        );
        resolveObservedParentDirectories(
          active.writeDependencyRecovery,
          active.workspaceObservations,
        );
      } else {
        throw createAgentError(
          "AGENT_INTERNAL_ERROR",
          "工具计划缺少执行或结果",
        );
      }
      const resultEvent = await active.publisher.append({
        type: "tool.result",
        runId: active.runId,
        data: {
          toolCallId: UuidSchema.parse(plan.toolCallId),
          toolName: plan.toolName,
          result,
        },
      });
      if (plan.invocation !== undefined && !batchSkipped) {
        recordServiceHandoffToolResult(
          active.serviceHandoff,
          resultEvent.seq,
          plan.invocation,
          result,
        );
        recordCompletionEvidenceToolResult(
          active.completionEvidence,
          resultEvent.seq,
          plan.invocation,
          result,
        );
        const repair = recordValidationRepairToolResult(
          active.validationRepair,
          plan.invocation,
          result,
        );
        if (repair.kind === "validator_failure" && repair.warning) {
          await active.publisher.append({
            type: "validation.repair.warning",
            runId: active.runId,
            data: {
              iteration: active.modelRequests,
              verificationKind: repair.verificationKind,
              cwd: repair.cwd,
              failedAttempts: repair.failedAttempts,
              repeatedDiagnostic: repair.repeatedDiagnostic,
              mutatedPaths: repair.mutatedPaths,
              mutatedPathCount: repair.mutatedPathCount,
              mutatedPathsTruncated: repair.mutatedPathsTruncated,
            },
          });
          if (repair.shouldFail) {
            throw createAgentError(
              "AGENT_VALIDATION_NO_PROGRESS",
              "同一验证诊断在修改后重复出现三次，运行已停止以避免继续无效修复",
              {
                verificationKind: repair.verificationKind,
                cwd: repair.cwd,
                failedAttempts: repair.failedAttempts,
                repeatedDiagnostic: repair.repeatedDiagnostic,
                mutatedPaths: repair.mutatedPaths,
                mutatedPathCount: repair.mutatedPathCount,
                mutatedPathsTruncated: repair.mutatedPathsTruncated,
              },
            );
          }
        }
      }
      if (!batchSkipped) {
        this.updateToolErrorStreak(active, plan, result);
        this.updateNoProgressReadStreak(active, plan, result);
      }
      if (
        !batchSkipped &&
        validatorCwd !== undefined &&
        !result.ok
      ) {
        failedValidatorByCwd.set(validatorCwd, plan.toolCallId);
      }
    }
  }

  private createMissingParentPreflightResult(
    parent: string,
    invocation: PreparedLocalToolInvocation,
    suppressed: boolean,
  ): ToolResult {
    const target = invocation.name === "write_file"
      ? invocation.arguments.path
      : parent;
    const summary = suppressed
      ? `同批写入已抑制：父目录 ${parent} 已知缺失`
      : `父目录 ${parent} 已由本 run 的完整目录列表证明缺失`;
    return ToolResultSchema.parse({
      ok: false,
      summary,
      metadata: {
        preflightSuppressed: suppressed,
        parent,
      },
      error: {
        code: "WORKSPACE_PARENT_NOT_FOUND",
        message: suppressed
          ? `同批写入未执行：父目录 ${parent} 已知缺失`
          : `写入 ${target} 前发现父目录 ${parent} 已知缺失；请先创建目录并重新观察`,
        recoverable: true,
        details: {
          relativePath: target,
          parent,
          reason: suppressed
            ? "known_missing_parent_batch_suppressed"
            : "known_missing_parent_preflight",
        },
      },
    });
  }

  private createToolPlan(
    active: ActiveRunState,
    call: NormalizedModelToolCall,
  ): PreparedToolPlan {
    if (!call.ok) {
      const projection = createPublicToolArguments({
        name: call.name,
        rawArgumentsPreview: call.rawArgumentsPreview,
        errorCode: call.error.code,
      });
      return {
        toolCallId: call.id,
        toolName: INVALID_TOOL_CALL_NAME,
        publicArguments: projection.publicArguments,
        argumentsTruncated: true,
        directResult: ToolResultSchema.parse({
          ok: false,
          summary: call.error.message.slice(0, 1_024),
          error: call.error,
        }),
      };
    }
    if (
      active.phase === "planning" &&
      call.call.name !== "list_directory" &&
      call.call.name !== "read_file" &&
      call.call.name !== "search_text"
    ) {
      const projection = createPublicToolArguments(call.call.arguments);
      return {
        toolCallId: call.call.id,
        toolName: call.call.name,
        publicArguments: projection.publicArguments,
        argumentsTruncated: projection.truncated,
        directResult: ToolResultSchema.parse({
          ok: false,
          summary: "规划阶段禁止使用此工具",
          error: {
            code: "TOOL_PHASE_DENIED",
            message: "规划阶段仅允许使用目录列表、文件读取和文本搜索工具",
            recoverable: true,
          },
        }),
      };
    }
    if (
      hasPendingParentDirectories(active.writeDependencyRecovery) &&
      (call.call.name === "write_file" || call.call.name === "replace_in_file")
    ) {
      const projection = createPublicToolArguments(call.call.arguments);
      return {
        toolCallId: call.call.id,
        toolName: call.call.name,
        publicArguments: projection.publicArguments,
        argumentsTruncated: projection.truncated,
        directResult: ToolResultSchema.parse({
          ok: false,
          summary: "写入依赖恢复期间禁止使用写工具",
          error: {
            code: "TOOL_PHASE_DENIED",
            message: "请先创建缺失父目录并用完整目录列表重新观察",
            recoverable: true,
          },
        }),
      };
    }
    const prepared = this.dependencies.prepareLocalToolCall(call.call);
    return {
      toolCallId: call.call.id,
      toolName: call.call.name,
      publicArguments: prepared.publicArguments,
      argumentsTruncated: prepared.argumentsTruncated,
      ...(prepared.ok
        ? { invocation: prepared.invocation }
        : { directResult: prepared.result }),
    };
  }

  private toolCapability(active: ActiveRunState): AgentToolCapability {
    if (active.phase === "planning") return "planning";
    if (hasPendingParentDirectories(active.writeDependencyRecovery)) {
      return "dependency_recovery";
    }
    return "normal";
  }

  private toolDefinitions(capability: AgentToolCapability) {
    switch (capability) {
      case "planning": return PLANNING_TOOL_DEFINITIONS;
      case "dependency_recovery": return DEPENDENCY_RECOVERY_TOOL_DEFINITIONS;
      case "normal": return LOCAL_TOOL_DEFINITIONS;
    }
  }

  private async authorizeAndExecute(
    active: ActiveRunState,
    plan: PreparedToolPlan & { invocation?: PreparedLocalToolInvocation },
  ): Promise<ToolResult> {
    const invocation = plan.invocation;
    if (invocation === undefined) {
      throw createAgentError("AGENT_INTERNAL_ERROR", "工具 invocation 缺失");
    }
    const authorization = this.dependencies.requestLocalToolAuthorization(
      UuidSchema.parse(plan.toolCallId),
      invocation,
    );
    if (authorization.status === "denied") return authorization.result;
    let capability: AuthorizedLocalToolInvocation;
    if (authorization.status === "authorized") {
      capability = authorization.authorization;
    } else {
      const view = this.dependencies.getPendingToolApprovalView(
        authorization.pending,
      );
      if ("code" in view) {
        throw createAgentError(
          "AGENT_APPROVAL_INVALID",
          view.message,
        );
      }
      await active.publisher.append({
        type: "approval.required",
        runId: active.runId,
        data: view,
      });
      if (active.permissionMode === "full") {
        const resolution = this.dependencies.resolveLocalToolApproval(
          authorization.pending,
          view.approvalId,
          { approved: true, reason: "工作区已启用完全访问权限" },
        );
        if (resolution.status !== "authorized") {
          throw createAgentError("AGENT_APPROVAL_INVALID", "工作区权限无法解析当前审批");
        }
        await active.publisher.append({
          type: "approval.resolved",
          runId: active.runId,
          data: {
            approvalId: view.approvalId,
            approved: true,
            reason: "工作区已启用完全访问权限",
          },
        });
        capability = resolution.authorization;
      } else {
      const wait = new AgentApprovalWait(authorization.pending);
      active.pendingApproval = { view, wait };
      if (active.controller.signal.aborted) wait.abort();
      const resolution = await wait.promise;
      active.pendingApproval = undefined;
      if (resolution.status === "rejected") return resolution.result;
      capability = resolution.authorization;
      }
    }

    this.throwIfAborted(active);
    await active.publisher.append({
      type: "tool.started",
      runId: active.runId,
      data: {
        toolCallId: UuidSchema.parse(plan.toolCallId),
        toolName: plan.toolName,
      },
    });
    return this.dependencies.executeAuthorizedLocalTool(
      { workspace: active.workspace, signal: active.controller.signal },
      capability,
    );
  }

  private updateToolErrorStreak(
    active: ActiveRunState,
    plan: PreparedToolPlan,
    result: ToolResult,
  ): void {
    if (result.ok) {
      active.lastToolErrorSignature = undefined;
      active.consecutiveToolErrors = 0;
      return;
    }
    const signature = createToolErrorSignature(
      plan.toolName,
      plan.publicArguments,
      result,
    );
    if (signature === undefined) return;
    if (signature === active.lastToolErrorSignature) {
      active.consecutiveToolErrors += 1;
    } else {
      active.lastToolErrorSignature = signature;
      active.consecutiveToolErrors = 1;
    }
    if (
      active.consecutiveToolErrors >= MAX_CONSECUTIVE_IDENTICAL_TOOL_ERRORS
    ) {
      throw createAgentError(
        "AGENT_REPEATED_TOOL_ERROR",
        "同一工具调用连续三次失败，运行已停止",
        { toolName: plan.toolName, errorCode: result.error?.code ?? "UNKNOWN" },
      );
    }
  }

  private updateNoProgressReadStreak(
    active: ActiveRunState,
    plan: PreparedToolPlan,
    result: ToolResult,
  ): void {
    const readOnly = plan.toolName === "list_directory" ||
      plan.toolName === "read_file" ||
      plan.toolName === "search_text";
    if (!readOnly || !result.ok) {
      active.lastNoProgressReadSignature = undefined;
      active.consecutiveNoProgressReads = 0;
      return;
    }
    const signature = createToolSuccessSignature(
      plan.toolName,
      plan.publicArguments,
      result,
    );
    if (signature === active.lastNoProgressReadSignature) {
      active.consecutiveNoProgressReads += 1;
    } else {
      active.lastNoProgressReadSignature = signature;
      active.consecutiveNoProgressReads = 1;
    }
    if (active.consecutiveNoProgressReads >= MAX_CONSECUTIVE_NO_PROGRESS_READS) {
      throw createAgentError(
        "AGENT_NO_PROGRESS_LIMIT",
        "同一只读事实连续三次没有进展，运行已停止",
        { toolName: plan.toolName },
      );
    }
  }

  private async finishFromError(
    active: ActiveRunState,
    cause: unknown,
  ): Promise<AgentRunOutcome> {
    if (active.abortSource === "timeout") {
      return this.finishFailed(
        active,
        createAgentError(
          "AGENT_RUN_TIMEOUT",
          "Agent 运行超过最大时限",
        ).error,
      );
    }
    if (
      active.abortSource === "user" ||
      active.abortSource === "external" ||
      active.abortSource === "sink"
    ) {
      return this.finishCancelled(
        active,
        active.abortReason ?? "运行已取消",
      );
    }
    if (cause instanceof ModelLayerError) {
      return this.finishFailed(active, cause.error);
    }
    if (cause instanceof AgentLayerError) {
      return this.finishFailed(active, cause.error);
    }
    if (
      cause instanceof ModelAbortError ||
      cause instanceof LocalToolExecutionAbortedError ||
      cause instanceof AgentApprovalWaitAbortedError ||
      cause instanceof AgentPlanApprovalWaitAbortedError
    ) {
      return this.finishFailed(
        active,
        createAgentError(
          "AGENT_INTERNAL_ERROR",
          "运行收到无法归类的取消信号",
        ).error,
      );
    }
    return this.finishFailed(
      active,
      createAgentError(
        "AGENT_INTERNAL_ERROR",
        "Agent 运行发生未分类错误",
        undefined,
        cause,
      ).error,
    );
  }

  private async finishFailed(
    active: ActiveRunState,
    error: ErrorInfo,
  ): Promise<AgentRunOutcome> {
    if (active.finalizing || active.finalized) {
      throw createAgentError(
        "AGENT_INTERNAL_ERROR",
        "运行终态已经确定",
      );
    }
    if (!active.controller.signal.aborted) {
      active.controller.abort("run_failed");
    }
    active.finalizing = true;
    await active.publisher.append({
      type: "run.failed",
      runId: active.runId,
      data: { error, iterations: active.modelRequests },
    });
    active.finalized = true;
    return Object.freeze({
      status: "failed",
      runId: active.runId,
      iterations: active.modelRequests,
      modelRequests: active.modelRequests,
      toolCalls: active.toolCalls,
      error,
    });
  }

  private async finishCancelled(
    active: ActiveRunState,
    reason: string,
  ): Promise<AgentRunOutcome> {
    if (active.finalizing || active.finalized) {
      throw createAgentError(
        "AGENT_INTERNAL_ERROR",
        "运行终态已经确定",
      );
    }
    if (!active.controller.signal.aborted) {
      active.controller.abort("run_cancelled");
    }
    active.finalizing = true;
    await active.publisher.append({
      type: "run.cancelled",
      runId: active.runId,
      data: { reason, iterations: active.modelRequests },
    });
    active.finalized = true;
    return Object.freeze({
      status: "cancelled",
      runId: active.runId,
      iterations: active.modelRequests,
      modelRequests: active.modelRequests,
      toolCalls: active.toolCalls,
      reason,
    });
  }

  private duration(active: ActiveRunState): number {
    return Math.max(
      0,
      Math.floor(this.dependencies.monotonicNow() - active.startedAt),
    );
  }

  private sanitizeReason(value: string | undefined, fallback: string): string {
    const sanitized = redactSecrets(value ?? fallback).slice(0, 4_096);
    return sanitized.length === 0 ? fallback : sanitized;
  }

  private invalidApproval(
    code: "AGENT_RUN_NOT_FOUND" | "AGENT_APPROVAL_NOT_PENDING" | "AGENT_APPROVAL_INVALID",
    message: string,
  ): AgentApprovalResolution {
    return Object.freeze({
      status: "invalid",
      error: createAgentError(code, message).error,
    });
  }

  private invalidPlanApproval(
    code: "AGENT_RUN_NOT_FOUND" | "AGENT_PLAN_NOT_PENDING" | "AGENT_PLAN_APPROVAL_INVALID",
    message: string,
  ): AgentPlanApprovalResolution {
    return Object.freeze({
      status: "invalid",
      error: createAgentError(code, message).error,
    });
  }

  private cleanupActiveRun(active: ActiveRunState): void {
    if (active.timer !== undefined) {
      this.dependencies.clearTimer(active.timer);
      active.timer = undefined;
    }
    if (
      active.externalSignal !== undefined &&
      active.externalAbortListener !== undefined
    ) {
      active.externalSignal.removeEventListener(
        "abort",
        active.externalAbortListener,
      );
    }
    active.pendingApproval?.wait.abort();
    active.pendingApproval = undefined;
    active.pendingPlanApproval?.wait.abort();
    active.pendingPlanApproval = undefined;
    active.continuation = undefined;
    active.publisher.disableSink();
    this.activeByRun.delete(active.runId);
    if (this.activeBySession.get(active.sessionId) === active.runId) {
      this.activeBySession.delete(active.sessionId);
    }
  }
}

export function createAgentRuntime(options: AgentRuntimeOptions): AgentRuntime {
  return new AgentRuntimeImplementation(options, nativeAgentRuntimeDependencies);
}

export function createAgentRuntimeWithDependencies(
  options: AgentRuntimeOptions,
  dependencies: AgentRuntimeDependencies,
): AgentRuntime {
  return new AgentRuntimeImplementation(options, dependencies);
}
