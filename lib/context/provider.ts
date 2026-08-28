import {
  UuidSchema,
  type DurableAgentEvent,
  type SessionId,
} from "@/lib/domain";
import { LOCAL_TOOL_DEFINITIONS } from "@/lib/tools";
import type { AgentContextProvider, AgentContextRequest } from "@/lib/agent";

import { selectContextCompaction } from "./compaction";
import { ContextLayerError, createContextError } from "./errors";
import { projectContextHistory } from "./history-projector";
import {
  renderContextMessages,
  roundsForCurrentProjection,
} from "./message-renderer";
import { AgentContextResultSchema } from "@/lib/agent";
import { generateContextSummary } from "./summary-generator";
import { estimateContextTokens } from "./token-estimator";
import {
  CONTEXT_EVENT_PAGE_LIMIT,
  type AgentContextProviderOptions,
  type ContextEventSource,
} from "./types";

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

async function readAllEvents(
  source: ContextEventSource,
  sessionId: SessionId,
  signal: AbortSignal,
): Promise<readonly DurableAgentEvent[]> {
  const events: DurableAgentEvent[] = [];
  let afterSeq = 0;
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
    events.push(...page.events);
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
  if (stableLastSeq !== events.at(-1)?.seq) {
    throw createContextError(
      "CONTEXT_HISTORY_INVALID",
      "分页末尾与 Session 最终序号不一致",
      { count: events.length, seq: stableLastSeq ?? 0 },
    );
  }
  return Object.freeze(events);
}

class EventBackedAgentContextProvider implements AgentContextProvider {
  constructor(private readonly options: AgentContextProviderOptions) {}

  async buildContext(request: AgentContextRequest) {
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
      const events = await readAllEvents(
        this.options.eventSource,
        sessionId,
        request.signal,
      );
      const history = projectContextHistory(events, sessionId);
      if (history.activeRunId !== runId) {
        throw createContextError(
          "CONTEXT_HISTORY_INVALID",
          "上下文请求不属于当前活动运行",
          { runId },
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
      throwIfAborted(request.signal);
      const projectedRounds = roundsForCurrentProjection({
        history,
        workspacePath: metadata.workspacePath,
        rounds: history.rounds,
      });
      const baselineMessages = renderContextMessages({
        history,
        workspacePath: metadata.workspacePath,
        rounds: projectedRounds,
        summary: history.latestCompaction?.summary,
      });
      const baseline = estimateContextTokens(
        baselineMessages,
        LOCAL_TOOL_DEFINITIONS,
        profile.contextWindow,
      );
      if (baseline.estimatedTokens < baseline.inputBudgetTokens) {
        return AgentContextResultSchema.parse({ messages: baselineMessages });
      }
      const selection = selectContextCompaction({
        history,
        workspacePath: metadata.workspacePath,
        contextWindow: profile.contextWindow,
        tools: LOCAL_TOOL_DEFINITIONS,
      });
      if (selection === undefined) {
        return AgentContextResultSchema.parse({ messages: baselineMessages });
      }
      const summary = await generateContextSummary({
        modelClient: this.options.modelClient,
        profileId: profile.id,
        contextWindow: profile.contextWindow,
        history,
        selection,
        signal: request.signal,
      });
      throwIfAborted(request.signal);
      const messages = renderContextMessages({
        history,
        workspacePath: metadata.workspacePath,
        rounds: selection.retainedRounds,
        summary,
      });
      const finalEstimate = estimateContextTokens(
        messages,
        LOCAL_TOOL_DEFINITIONS,
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
      return AgentContextResultSchema.parse({
        messages,
        compaction: {
          throughSeq: selection.throughSeq,
          summary,
          retainedRange: selection.retainedRange,
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
