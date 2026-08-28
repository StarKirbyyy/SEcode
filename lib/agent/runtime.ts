import {
  ApprovalDecisionSchema,
  type AuthorizedLocalToolInvocation,
  type PendingToolApprovalView,
} from "@/lib/approval";
import {
  ToolResultSchema,
  UuidSchema,
  createPublicToolArguments,
  redactSecrets,
  type ApprovalId,
  type ErrorInfo,
  type JsonValue,
  type RunId,
  type SessionId,
  type ToolResult,
} from "@/lib/domain";
import {
  ModelAbortError,
  ModelLayerError,
  type ModelCompletion,
  type ModelContinuation,
  type NormalizedModelToolCall,
} from "@/lib/model";
import { EventStoreError } from "@/lib/storage";
import {
  LOCAL_TOOL_DEFINITIONS,
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
import { AgentEventPublisher } from "./events";
import {
  createAgentProjection,
  createToolErrorSignature,
  getSessionAgentSnapshot,
  projectAgentEvent,
  type AgentProjectionState,
} from "./projection";
import { StreamingSecretRedactor } from "./redaction";
import {
  AgentContextResultSchema,
  AgentRunRequestSchema,
  type ParsedAgentRunRequest,
} from "./schemas";
import {
  INVALID_TOOL_CALL_NAME,
  MAX_CONSECUTIVE_IDENTICAL_TOOL_ERRORS,
  MAX_PROMPT_PREVIEW_CHARACTERS,
  type ActiveAgentRunView,
  type AgentApprovalResolution,
  type AgentRunControls,
  type AgentRunHandle,
  type AgentRunOutcome,
  type AgentRunRequest,
  type AgentRuntime,
  type AgentRuntimeOptions,
  type SessionAgentSnapshot,
} from "./types";

type AbortSource = "user" | "external" | "timeout" | "sink";

interface PendingApprovalState {
  view: PendingToolApprovalView;
  wait: AgentApprovalWait;
}

interface ActiveRunState {
  sessionId: SessionId;
  runId: RunId;
  profileId: string;
  workspace: WorkspaceHandle;
  limits: ParsedAgentRunRequest["limits"];
  thinking: ParsedAgentRunRequest["thinking"];
  controller: AbortController;
  abortSource?: AbortSource;
  abortReason?: string;
  externalSignal?: AbortSignal;
  externalAbortListener?: () => void;
  timer?: unknown;
  startedAt: number;
  iterations: number;
  continuation?: ModelContinuation;
  projection: AgentProjectionState;
  publisher: AgentEventPublisher;
  pendingApproval?: PendingApprovalState;
  finalizing: boolean;
  finalized: boolean;
  lastToolErrorSignature?: string;
  consecutiveToolErrors: number;
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
        controller,
        startedAt: this.dependencies.monotonicNow(),
        iterations: 0,
        projection,
        publisher,
        finalizing: false,
        finalized: false,
        consecutiveToolErrors: 0,
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
            limits: parsed.limits,
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

  getActiveRun(runId: RunId): ActiveAgentRunView | undefined {
    const active = this.activeByRun.get(runId);
    if (active === undefined || active.finalized) return undefined;
    const snapshot = getSessionAgentSnapshot(active.projection).activeRun;
    if (snapshot === undefined) return undefined;
    return Object.freeze({
      sessionId: active.sessionId,
      runId: active.runId,
      status: snapshot.status,
      iterations: active.iterations,
      ...(snapshot.pendingApproval === undefined
        ? {}
        : { pendingApproval: snapshot.pendingApproval }),
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
        if (active.iterations >= active.limits.maxIterations) {
          throw createAgentError(
            "AGENT_ITERATION_LIMIT",
            "Agent 已达到最大模型迭代次数",
            { maxIterations: active.limits.maxIterations },
          );
        }

        const nextIteration = active.iterations + 1;
        let context;
        try {
          const rawContext = await this.options.contextProvider.buildContext({
            sessionId: active.sessionId,
            runId: active.runId,
            iteration: nextIteration,
            signal: active.controller.signal,
          });
          context = AgentContextResultSchema.parse(rawContext);
        } catch (cause) {
          if (active.controller.signal.aborted) throw cause;
          throw createAgentError(
            "AGENT_CONTEXT_FAILED",
            "模型上下文构建失败",
            undefined,
            cause,
          );
        }
        this.throwIfAborted(active);

        if (context.compaction !== undefined) {
          await active.publisher.append({
            type: "context.compacted",
            runId: active.runId,
            data: context.compaction,
          });
          this.throwIfAborted(active);
        }
        await active.publisher.append({
          type: "model.requested",
          runId: active.runId,
          data: { iteration: nextIteration, modelProfileId: active.profileId },
        });
        active.iterations = nextIteration;

        const redactor = new StreamingSecretRedactor();
        let completion: ModelCompletion;
        try {
          completion = await this.options.modelClient.complete({
            profileId: active.profileId,
            messages: [...context.messages],
            tools: [...LOCAL_TOOL_DEFINITIONS],
            signal: active.controller.signal,
            ...(active.continuation === undefined
              ? {}
              : { continuation: active.continuation }),
            ...(active.thinking === undefined ? {} : { thinking: active.thinking }),
            onTextDelta: async (content) => {
              const sanitized = redactor.push(content);
              if (sanitized.length > 0) {
                await active.publisher.publishLive(sanitized);
              }
            },
          });
          const tail = redactor.finish();
          if (tail.length > 0) await active.publisher.publishLive(tail);
        } catch (cause) {
          redactor.abort();
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
                  },
                }),
          },
        });

        if (completion.finishReason === "stop") {
          return await this.completeTextRun(active, completion.content);
        }
        await this.processToolCalls(active, completion);
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
  ): Promise<AgentRunOutcome> {
    const sanitized = content === null ? "" : redactSecrets(content);
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
      data: { iterations: active.iterations, durationMs },
    });
    active.finalized = true;
    return Object.freeze({
      status: "completed",
      runId: active.runId,
      iterations: active.iterations,
      durationMs,
    });
  }

  private async processToolCalls(
    active: ActiveRunState,
    completion: ModelCompletion,
  ): Promise<void> {
    if (completion.content !== null) {
      const content = redactSecrets(completion.content);
      if (content.length > 1_048_576) {
        throw createAgentError(
          "AGENT_ASSISTANT_MESSAGE_TOO_LARGE",
          "模型可见消息超过事件上限",
        );
      }
      if (content.length > 0) {
        await active.publisher.append({
          type: "assistant.message",
          runId: active.runId,
          data: { content, kind: "intermediate" },
        });
      }
    }

    const plans = completion.toolCalls.map((call) => this.createToolPlan(call));
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
    }
    for (const plan of plans) {
      this.throwIfAborted(active);
      let result: ToolResult;
      if (plan.directResult !== undefined) {
        result = plan.directResult;
      } else if (plan.invocation !== undefined) {
        result = await this.authorizeAndExecute(active, plan);
      } else {
        throw createAgentError(
          "AGENT_INTERNAL_ERROR",
          "工具计划缺少执行或结果",
        );
      }
      await active.publisher.append({
        type: "tool.result",
        runId: active.runId,
        data: {
          toolCallId: UuidSchema.parse(plan.toolCallId),
          toolName: plan.toolName,
          result,
        },
      });
      this.updateToolErrorStreak(active, plan, result);
    }
  }

  private createToolPlan(call: NormalizedModelToolCall): PreparedToolPlan {
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
      const wait = new AgentApprovalWait(authorization.pending);
      active.pendingApproval = { view, wait };
      if (active.controller.signal.aborted) wait.abort();
      const resolution = await wait.promise;
      active.pendingApproval = undefined;
      if (resolution.status === "rejected") return resolution.result;
      capability = resolution.authorization;
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
      cause instanceof AgentApprovalWaitAbortedError
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
    active.finalizing = true;
    await active.publisher.append({
      type: "run.failed",
      runId: active.runId,
      data: { error, iterations: active.iterations },
    });
    active.finalized = true;
    return Object.freeze({
      status: "failed",
      runId: active.runId,
      iterations: active.iterations,
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
    active.finalizing = true;
    await active.publisher.append({
      type: "run.cancelled",
      runId: active.runId,
      data: { reason, iterations: active.iterations },
    });
    active.finalized = true;
    return Object.freeze({
      status: "cancelled",
      runId: active.runId,
      iterations: active.iterations,
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
