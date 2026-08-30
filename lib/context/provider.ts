import { createHash } from "node:crypto";

import {
  UuidSchema,
  type SessionId,
} from "@/lib/domain";
import {
  DEPENDENCY_RECOVERY_TOOL_DEFINITIONS,
  LOCAL_TOOL_DEFINITIONS,
  PLANNING_TOOL_DEFINITIONS,
} from "@/lib/tools";
import type { AgentContextProvider, AgentContextRequest } from "@/lib/agent";

import { selectContextCompaction } from "./compaction";
import { ContextLayerError, createContextError } from "./errors";
import {
  appendContextHistoryEvents,
  createContextHistoryProjection,
  snapshotContextHistory,
  type ContextHistoryProjection,
} from "./history-projector";
import {
  renderContextMessages,
  roundsForCurrentProjection,
} from "./message-renderer";
import { AgentContextResultSchema } from "@/lib/agent";
import { generateContextSummary } from "./summary-generator";
import { generateDeterministicFallbackSummary } from "./fallback-summary";
import {
  calculateInputBudget,
  estimateContextTokens,
} from "./token-estimator";
import { projectContextToolOutputs } from "./tool-output-projection";
import {
  CONTEXT_CACHE_PROTOCOL_VERSION,
  CONTEXT_EVENT_PAGE_LIMIT,
  CONTEXT_PROTOCOL_VERSION,
  CONTEXT_SUMMARY_TIMEOUT_MS,
  MAX_CONTEXT_CACHE_ENTRY_BYTES,
  MAX_CONTEXT_CACHE_SESSIONS,
  MAX_CONTEXT_CACHE_TOTAL_BYTES,
  type ContextFallbackReason,
  type AgentContextProviderOptions,
  type ContextEventSource,
} from "./types";
import { SYSTEM_PROMPT_VERSION } from "./system-prompt";

interface ContextCacheEntry {
  fingerprint: string;
  projection: ContextHistoryProjection;
  lastSeq: number;
  estimatedBytes: number;
  sourceBytes: number;
  lastUsed: number;
}

interface LoadedProjection {
  projection: ContextHistoryProjection;
  sourceBytes: number;
  diagnostic: {
    status: "cold" | "warm" | "invalidated";
    reusedEvents: number;
    tailEvents: number;
    avoidedBytes: number;
    buildMilliseconds: number;
  };
}

class ContextSummaryDeadlineError extends Error {
  constructor() {
    super("上下文摘要超过专用时限");
    this.name = "ContextSummaryDeadlineError";
  }
}

function toolDefinitionsForCapability(
  capability: AgentContextRequest["toolCapability"],
) {
  switch (capability) {
    case "planning": return PLANNING_TOOL_DEFINITIONS;
    case "dependency_recovery": return DEPENDENCY_RECOVERY_TOOL_DEFINITIONS;
    case "normal": return LOCAL_TOOL_DEFINITIONS;
  }
}

async function generateSummaryWithDeadline(
  options: Parameters<typeof generateContextSummary>[0],
): Promise<string> {
  if (options.signal.aborted) {
    throw createContextError("CONTEXT_ABORTED", "上下文摘要已取消");
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectParent!: (cause: unknown) => void;
  const parentAborted = new Promise<never>((_resolve, reject) => {
    rejectParent = reject;
  });
  const onParentAbort = () => {
    controller.abort(options.signal.reason);
    rejectParent(createContextError("CONTEXT_ABORTED", "上下文摘要已取消"));
  };
  options.signal.addEventListener("abort", onParentAbort, { once: true });
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort("summary_timeout");
      reject(new ContextSummaryDeadlineError());
    }, CONTEXT_SUMMARY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      generateContextSummary({ ...options, signal: controller.signal }),
      deadline,
      parentAborted,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options.signal.removeEventListener("abort", onParentAbort);
  }
}

function fallbackReason(cause: unknown): ContextFallbackReason | undefined {
  if (cause instanceof ContextSummaryDeadlineError) return "model_timeout";
  if (!(cause instanceof ContextLayerError)) return undefined;
  if (cause.error.code === "CONTEXT_SUMMARY_INVALID") {
    return "model_output_invalid";
  }
  if (cause.error.code === "CONTEXT_BUDGET_EXCEEDED") {
    return "summary_input_over_budget";
  }
  if (cause.error.code !== "CONTEXT_SUMMARY_FAILED") return undefined;
  return cause.error.details?.reason === "MODEL_TIMEOUT"
    ? "model_timeout"
    : "model_failed";
}

function validateOptions(options: AgentContextProviderOptions): void {
  if (
    options === null ||
    typeof options !== "object" ||
    options.eventSource === null ||
    typeof options.eventSource !== "object" ||
    typeof options.eventSource.getSessionMetadata !== "function" ||
    typeof options.eventSource.readEvents !== "function" ||
    options.modelClient === null ||
    typeof options.modelClient !== "object" ||
    typeof options.modelClient.getConfigSnapshot !== "function" ||
    typeof options.modelClient.complete !== "function"
  ) {
    throw createContextError(
      "CONTEXT_INPUT_INVALID",
      "上下文 provider 依赖不完整",
    );
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createContextError("CONTEXT_ABORTED", "上下文构建已取消");
  }
}

async function appendEventPages(
  source: ContextEventSource,
  sessionId: SessionId,
  signal: AbortSignal,
  projection: ContextHistoryProjection,
  rejectRecoveredTail: boolean,
): Promise<{ count: number; bytes: number }> {
  let appended = 0;
  let appendedBytes = 0;
  let afterSeq = projection.lastSeq;
  let stableLastSeq: number | undefined;
  while (true) {
    throwIfAborted(signal);
    let page;
    try {
      page = await source.readEvents(sessionId, {
        afterSeq,
        limit: CONTEXT_EVENT_PAGE_LIMIT,
      });
    } catch (cause) {
      if (signal.aborted) throwIfAborted(signal);
      throw createContextError(
        "CONTEXT_SESSION_UNAVAILABLE",
        "无法读取 Session 事件",
        { afterSeq },
        cause,
      );
    }
    throwIfAborted(signal);
    if (
      rejectRecoveredTail &&
      (page.recovery.tailRepaired || page.recovery.discardedTailBytes > 0)
    ) {
      throw createContextError(
        "CONTEXT_HISTORY_INVALID",
        "Session 事件尾部已恢复，缓存投影不可复用",
        { afterSeq, reason: "tail_repaired" },
      );
    }
    if (page.recovery.lastStableSeq !== page.lastSeq) {
      throw createContextError(
        "CONTEXT_HISTORY_INVALID",
        "Session 恢复序号与事件尾部不一致",
        { afterSeq, reason: "recovery_seq_mismatch" },
      );
    }
    if (stableLastSeq === undefined) stableLastSeq = page.lastSeq;
    else if (page.lastSeq !== stableLastSeq) {
      throw createContextError(
        "CONTEXT_HISTORY_INVALID",
        "分页读取期间 Session 历史发生变化",
        { afterSeq, seq: page.lastSeq },
      );
    }
    if (page.events.some((event, index) => event.seq !== afterSeq + index + 1)) {
      throw createContextError(
        "CONTEXT_HISTORY_INVALID",
        "分页事件序号不连续",
        { afterSeq },
      );
    }
    appendContextHistoryEvents(projection, page.events);
    appended += page.events.length;
    appendedBytes += page.events.reduce(
      (sum, event) => sum + Buffer.byteLength(JSON.stringify(event), "utf8") + 1,
      0,
    );
    if (!page.hasMore) break;
    const last = page.events.at(-1);
    if (last === undefined || last.seq <= afterSeq) {
      throw createContextError(
        "CONTEXT_HISTORY_INVALID",
        "分页读取未取得进展",
        { afterSeq },
      );
    }
    afterSeq = last.seq;
  }
  if (stableLastSeq !== projection.lastSeq) {
    throw createContextError(
      "CONTEXT_HISTORY_INVALID",
      "分页末尾与 Session 最终序号不一致",
      { count: appended, seq: stableLastSeq ?? 0 },
    );
  }
  return { count: appended, bytes: appendedBytes };
}

class EventBackedAgentContextProvider implements AgentContextProvider {
  private readonly cache = new Map<SessionId, ContextCacheEntry>();
  private readonly queues = new Map<SessionId, Promise<void>>();
  private usageClock = 0;

  constructor(private readonly options: AgentContextProviderOptions) {}

  invalidateSession(sessionId: SessionId): void {
    this.cache.delete(sessionId);
  }

  private fingerprint(
    profileId: string,
    contextWindow: number,
    toolCapability: AgentContextRequest["toolCapability"],
  ): string {
    return createHash("sha256").update(JSON.stringify([
      CONTEXT_CACHE_PROTOCOL_VERSION,
      CONTEXT_PROTOCOL_VERSION,
      SYSTEM_PROMPT_VERSION,
      profileId,
      contextWindow,
      toolCapability,
      toolDefinitionsForCapability(toolCapability),
    ])).digest("hex");
  }

  private estimateProjectionBytes(projection: ContextHistoryProjection): number {
    return Buffer.byteLength(JSON.stringify(snapshotContextHistory(projection)), "utf8");
  }

  private publishCache(
    sessionId: SessionId,
    fingerprint: string,
    projection: ContextHistoryProjection,
    sourceBytes: number,
  ): void {
    const estimatedBytes = this.estimateProjectionBytes(projection);
    if (estimatedBytes > MAX_CONTEXT_CACHE_ENTRY_BYTES) {
      this.cache.delete(sessionId);
      return;
    }
    this.usageClock += 1;
    this.cache.set(sessionId, {
      fingerprint,
      projection,
      lastSeq: projection.lastSeq,
      estimatedBytes,
      sourceBytes,
      lastUsed: this.usageClock,
    });
    const totalBytes = () => [...this.cache.values()]
      .reduce((sum, entry) => sum + entry.estimatedBytes, 0);
    while (
      this.cache.size > MAX_CONTEXT_CACHE_SESSIONS ||
      totalBytes() > MAX_CONTEXT_CACHE_TOTAL_BYTES
    ) {
      const oldest = [...this.cache.entries()].sort(
        ([leftId, left], [rightId, right]) =>
          left.lastUsed - right.lastUsed || leftId.localeCompare(rightId),
      )[0];
      if (oldest === undefined) break;
      this.cache.delete(oldest[0]);
    }
  }

  private async loadProjection(
    sessionId: SessionId,
    fingerprint: string,
    signal: AbortSignal,
  ): Promise<LoadedProjection> {
    const startedAt = performance.now();
    const cached = this.cache.get(sessionId);
    let status: LoadedProjection["diagnostic"]["status"] =
      cached === undefined ? "cold" : "warm";
    let reusedEvents = 0;
    let projection: ContextHistoryProjection;
    if (cached !== undefined && cached.fingerprint === fingerprint) {
      projection = structuredClone(cached.projection);
      reusedEvents = cached.lastSeq;
      try {
        const tail = await appendEventPages(
          this.options.eventSource,
          sessionId,
          signal,
          projection,
          true,
        );
        return {
          projection,
          sourceBytes: cached.sourceBytes + tail.bytes,
          diagnostic: {
            status,
            reusedEvents,
            tailEvents: tail.count,
            avoidedBytes: cached.sourceBytes,
            buildMilliseconds: Math.max(0, Math.round(performance.now() - startedAt)),
          },
        };
      } catch (cause) {
        if (signal.aborted) throwIfAborted(signal);
        if (!(cause instanceof ContextLayerError)) throw cause;
        status = "invalidated";
        this.cache.delete(sessionId);
      }
    } else if (cached !== undefined) {
      status = "invalidated";
      this.cache.delete(sessionId);
    }

    projection = createContextHistoryProjection(sessionId);
    const tail = await appendEventPages(
      this.options.eventSource,
      sessionId,
      signal,
      projection,
      false,
    );
    return {
      projection,
      sourceBytes: tail.bytes,
      diagnostic: {
        status,
        reusedEvents: 0,
        tailEvents: tail.count,
        avoidedBytes: 0,
        buildMilliseconds: Math.max(0, Math.round(performance.now() - startedAt)),
      },
    };
  }

  async buildContext(request: AgentContextRequest) {
    const sessionId = UuidSchema.parse(request.sessionId);
    const previous = this.queues.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.catch(() => undefined).then(() => current);
    this.queues.set(sessionId, queued);
    await previous.catch(() => undefined);
    try {
      throwIfAborted(request.signal);
      return await this.buildContextUnlocked(request);
    } finally {
      release();
      if (this.queues.get(sessionId) === queued) this.queues.delete(sessionId);
    }
  }

  private async buildContextUnlocked(request: AgentContextRequest) {
    try {
      const sessionId = UuidSchema.parse(request.sessionId);
      const runId = UuidSchema.parse(request.runId);
      if (!Number.isSafeInteger(request.iteration) || request.iteration <= 0) {
        throw createContextError(
          "CONTEXT_INPUT_INVALID",
          "上下文 iteration 必须是正安全整数",
          { iteration: request.iteration },
        );
      }
      throwIfAborted(request.signal);
      let metadata;
      try {
        metadata = await this.options.eventSource.getSessionMetadata(sessionId);
      } catch (cause) {
        if (request.signal.aborted) throwIfAborted(request.signal);
        throw createContextError(
          "CONTEXT_SESSION_UNAVAILABLE",
          "无法读取 Session 元数据",
          undefined,
          cause,
        );
      }
      const profile = this.options.modelClient.getConfigSnapshot().profiles
        .find((item) => item.id === metadata.modelProfileId);
      if (profile === undefined || !profile.configured) {
        throw createContextError(
          "CONTEXT_MODEL_UNAVAILABLE",
          "Session 固定模型配置不可用",
          { profileId: metadata.modelProfileId },
        );
      }
      const fingerprint = this.fingerprint(
        profile.id,
        profile.contextWindow,
        request.toolCapability,
      );
      const loaded = await this.loadProjection(
        sessionId,
        fingerprint,
        request.signal,
      );
      const history = snapshotContextHistory(loaded.projection);
      if (history.activeRunId !== runId) {
        throw createContextError(
          "CONTEXT_HISTORY_INVALID",
          "上下文请求不属于当前活动运行",
          { runId },
        );
      }
      if (
        (history.activePhase === "planning") !==
        (request.toolCapability === "planning")
      ) {
        throw createContextError(
          "CONTEXT_HISTORY_INVALID",
          "上下文工具能力与当前运行阶段不一致",
          { reason: "tool_capability_phase_mismatch" },
        );
      }
      const finishContext = (value: Record<string, unknown>) => {
        const result = AgentContextResultSchema.parse({
          ...value,
          contextCache: loaded.diagnostic,
        });
        this.publishCache(
          sessionId,
          fingerprint,
          loaded.projection,
          loaded.sourceBytes,
        );
        return result;
      };
      throwIfAborted(request.signal);
      const toolDefinitions = toolDefinitionsForCapability(request.toolCapability);
      const currentRounds = roundsForCurrentProjection({
        history,
        workspacePath: metadata.workspacePath,
        rounds: history.rounds,
      });
      const projectedRounds = projectContextToolOutputs(
        currentRounds,
        calculateInputBudget(profile.contextWindow),
      );
      const baselineMessages = renderContextMessages({
        history,
        workspacePath: metadata.workspacePath,
        rounds: projectedRounds,
        summary: history.latestCompaction?.summary,
      });
      const selection = selectContextCompaction({
        history,
        workspacePath: metadata.workspacePath,
        contextWindow: profile.contextWindow,
        tools: toolDefinitions,
        rounds: projectedRounds,
      });
      if (selection === undefined) {
        return finishContext({ messages: baselineMessages });
      }
      let summary: string;
      let strategy: "model" | "deterministic_fallback" = "model";
      let selectedFallbackReason: ContextFallbackReason | undefined;
      const summaryUsage: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        reasoningTokens?: number;
        cachedPromptTokens?: number;
        cacheMissPromptTokens?: number;
      } = {};
      let summaryUsageCalls = 0;
      let summaryUsageComplete = true;
      try {
        summary = await generateSummaryWithDeadline({
          modelClient: this.options.modelClient,
          profileId: profile.id,
          contextWindow: profile.contextWindow,
          history,
          selection,
          signal: request.signal,
          onUsage: (usage, complete) => {
            summaryUsageCalls += 1;
            if (complete === false) summaryUsageComplete = false;
            if (usage === undefined) {
              summaryUsageComplete = false;
              return;
            }
            if (usage.promptTokens === undefined) summaryUsageComplete = false;
            else summaryUsage.promptTokens = (summaryUsage.promptTokens ?? 0) + usage.promptTokens;
            if (usage.completionTokens === undefined) summaryUsageComplete = false;
            else summaryUsage.completionTokens = (summaryUsage.completionTokens ?? 0) + usage.completionTokens;
            if (usage.totalTokens === undefined) summaryUsageComplete = false;
            else summaryUsage.totalTokens = (summaryUsage.totalTokens ?? 0) + usage.totalTokens;
            if (usage.reasoningTokens !== undefined) {
              summaryUsage.reasoningTokens =
                (summaryUsage.reasoningTokens ?? 0) + usage.reasoningTokens;
            }
            if (usage.cachedPromptTokens !== undefined) {
              summaryUsage.cachedPromptTokens =
                (summaryUsage.cachedPromptTokens ?? 0) + usage.cachedPromptTokens;
            }
            if (usage.cacheMissPromptTokens !== undefined) {
              summaryUsage.cacheMissPromptTokens =
                (summaryUsage.cacheMissPromptTokens ?? 0) +
                usage.cacheMissPromptTokens;
            }
          },
        });
      } catch (cause) {
        if (request.signal.aborted) throwIfAborted(request.signal);
        selectedFallbackReason = fallbackReason(cause);
        if (selectedFallbackReason === undefined) throw cause;
        summary = generateDeterministicFallbackSummary({ history, selection });
        strategy = "deterministic_fallback";
      }
      throwIfAborted(request.signal);
      const messages = renderContextMessages({
        history,
        workspacePath: metadata.workspacePath,
        rounds: selection.retainedRounds,
        summary,
      });
      const finalEstimate = estimateContextTokens(
        messages,
        toolDefinitions,
        profile.contextWindow,
      );
      if (finalEstimate.estimatedTokens >= finalEstimate.inputBudgetTokens) {
        throw createContextError(
          "CONTEXT_BUDGET_EXCEEDED",
          "摘要后上下文仍超过模型输入预算",
          {
            inputBudgetTokens: finalEstimate.inputBudgetTokens,
            estimatedTokens: finalEstimate.estimatedTokens,
          },
        );
      }
      return finishContext({
        messages,
        compaction: {
          throughSeq: selection.throughSeq,
          summary,
          retainedRange: selection.retainedRange,
          strategy,
          ...(selectedFallbackReason === undefined
            ? {}
            : { fallbackReason: selectedFallbackReason }),
          ...(Object.keys(summaryUsage).length === 0 ? {} : { usage: summaryUsage }),
          usageComplete: summaryUsageCalls > 0 && summaryUsageComplete,
        },
      });
    } catch (cause) {
      if (cause instanceof ContextLayerError) throw cause;
      if (request.signal.aborted) throwIfAborted(request.signal);
      throw createContextError(
        "CONTEXT_INTERNAL_ERROR",
        "上下文构建发生未分类错误",
        undefined,
        cause,
      );
    }
  }
}

export function createAgentContextProvider(
  options: AgentContextProviderOptions,
): AgentContextProvider {
  validateOptions(options);
  return new EventBackedAgentContextProvider(options);
}
