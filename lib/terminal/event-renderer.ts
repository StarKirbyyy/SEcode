import type { AgentEvent, JsonObject } from "@/lib/domain";

import { stableJson, shortUuid } from "./text-safety";
import type { TerminalFrame } from "./types";

export interface TerminalRenderState {
  readonly streamingRunId?: string;
  readonly streamedContent?: string;
  readonly lineOpen: boolean;
}

export interface TerminalRenderResult {
  readonly frames: readonly TerminalFrame[];
  readonly state: TerminalRenderState;
}

export const INITIAL_TERMINAL_RENDER_STATE: TerminalRenderState = Object.freeze({ lineOpen: false });

const line = (text: string, channel: TerminalFrame["channel"] = "stdout"): TerminalFrame => ({ channel, mode: "line", text });
const append = (text: string): TerminalFrame => ({ channel: "stdout", mode: "append", text });

function closeOpen(state: TerminalRenderState): TerminalFrame[] {
  return state.lineOpen ? [line("")] : [];
}

function usageText(usage: {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedPromptTokens?: number;
  cacheMissPromptTokens?: number;
} | undefined, complete?: boolean): string {
  if (!usage) return "";
  const values = [
    usage.promptTokens === undefined ? undefined : `输入 ${usage.promptTokens}`,
    usage.completionTokens === undefined ? undefined : `输出 ${usage.completionTokens}`,
    usage.totalTokens === undefined ? undefined : `总计 ${usage.totalTokens}`,
    usage.reasoningTokens === undefined ? undefined : `推理 ${usage.reasoningTokens}`,
    usage.cachedPromptTokens === undefined ? undefined : `供应商缓存命中 ${usage.cachedPromptTokens}`,
    usage.cacheMissPromptTokens === undefined ? undefined : `供应商缓存未命中 ${usage.cacheMissPromptTokens}`,
  ].filter(Boolean);
  const denominator = (usage.cachedPromptTokens ?? 0) + (usage.cacheMissPromptTokens ?? 0);
  const hitRate = usage.cachedPromptTokens !== undefined &&
      usage.cacheMissPromptTokens !== undefined && denominator > 0
    ? ` / 命中率 ${((usage.cachedPromptTokens / denominator) * 100).toFixed(1)}%`
    : "";
  return values.length === 0 ? "" : `；Token ${values.join(" / ")}${hitRate}${complete === false ? "（不完整）" : ""}`;
}

function resultDetails(value: JsonObject | undefined): string {
  return value === undefined ? "" : `；元数据 ${stableJson(value)}`;
}

function contextFailureGuidance(error: { code: string; details?: JsonObject }): string {
  if (error.code !== "AGENT_CONTEXT_FAILED") return "";
  switch (error.details?.reason) {
    case "model_timeout":
      return "；模型摘要超时且本地降级未能完成，可缩小任务后继续";
    case "model_failed":
      return "；模型摘要失败且本地降级未能完成，可缩小任务后继续";
    case "model_output_invalid":
      return "；模型摘要格式无效且本地降级未能完成，可缩小任务后继续";
    case "summary_input_over_budget":
      return "；摘要输入超过预算且本地降级未能完成，可缩小任务后继续";
    case "fallback_over_budget":
      return "；本地降级摘要仍超过上下文预算，请新建 Session 或缩小任务";
    case "projected_recent_rounds_over_budget":
      return "；投影后的最近完整回合仍超过上下文预算，重复“继续”预计无效，请新建 Session 或缩小任务";
    default:
      return "；上下文无法构建，可缩小任务后重试";
  }
}

function actionFailureGuidance(error: { code: string; details?: JsonObject }): string {
  if (error.code === "AGENT_COMPLETION_EVIDENCE_MISSING") {
    const paths = Array.isArray(error.details?.uncoveredPaths)
      ? error.details.uncoveredPaths.filter((value): value is string => typeof value === "string")
      : [];
    return paths.length === 0
      ? "；运行未完成，修改已保留，请补充 lint、typecheck、test 或 build"
      : `；待验证路径：${paths.join("、")}；修改已保留，请补充 lint、typecheck、test 或 build`;
  }
  if (error.code === "AGENT_VALIDATION_NO_PROGRESS") {
    return "；相同验证诊断已在修改后重复三次，请集中处理该诊断后继续";
  }
  return "";
}

export function renderAgentEvent(event: AgentEvent, previous: TerminalRenderState = INITIAL_TERMINAL_RENDER_STATE): TerminalRenderResult {
  if (event.type === "assistant.delta") {
    const prefix = previous.lineOpen && previous.streamingRunId === event.runId ? [] : [...closeOpen(previous), append("智能体：")];
    return {
      frames: [...prefix, append(event.data.content)],
      state: { lineOpen: true, streamingRunId: event.runId, streamedContent: `${previous.streamingRunId === event.runId ? previous.streamedContent ?? "" : ""}${event.data.content}` },
    };
  }

  const frames = closeOpen(previous);
  const clean: TerminalRenderState = { lineOpen: false };
  switch (event.type) {
    case "session.created":
      frames.push(line(`Session 已创建：${shortUuid(event.sessionId)}（${event.data.session.title}）`));
      break;
    case "run.started":
      frames.push(line(`运行 ${shortUuid(event.runId!)} 已开始；Plan Mode ${event.data.planningEnabled === true ? "on" : "off"}；模型请求上限 ${event.data.limits.maxIterations ?? "未设置"}；工具调用上限 ${event.data.limits.maxToolCalls ?? 120}`));
      break;
    case "user.message":
      frames.push(line(`你：${event.data.content}`));
      break;
    case "model.requested":
      frames.push(line(`正在请求模型（第 ${event.data.iteration} 次，${event.data.modelProfileId}）`));
      break;
    case "model.completed":
      frames.push(line(`模型响应完成（第 ${event.data.iteration} 次，${event.data.finishReason}${usageText(event.data.usage, event.data.usageComplete)}${event.data.contextCache === undefined ? "" : `；本地 Context cache ${event.data.contextCache.status}，复用事件 ${event.data.contextCache.reusedEvents}，尾部事件 ${event.data.contextCache.tailEvents}，避免读取 ${event.data.contextCache.avoidedBytes} 字节，构建 ${event.data.contextCache.buildMilliseconds}ms`}）`));
      break;
    case "model.output.rejected":
      frames.push(line(
        event.data.action === "retry"
          ? `模型输出语言不符合要求，正在请求中文重述（${event.data.retryAttempt}/2）`
          : "已忽略工具调用前的非中文说明，工具将按原请求执行一次",
        "stderr",
      ));
      break;
    case "completion.evidence.rejected":
      {
        const pending = event.data.uncoveredPaths !== undefined && event.data.uncoveredPaths.length > 0
          ? `；待验证路径：${event.data.uncoveredPaths.join("、")}${event.data.uncoveredPathsTruncated === true ? "（列表已截断）" : ""}`
          : event.data.uncoveredScopes === undefined
            ? ""
            : `；待验证 scope：${event.data.uncoveredScopes.join("、")}`;
      frames.push(line(
        `完成声明被拒绝：代码或配置变更后缺少验证${pending}，正在请求补充 lint、typecheck、test 或 build（${event.data.correctionAttempt}/2）`,
        "stderr",
      ));
      break;
      }
    case "write.dependency.rejected":
      frames.push(line(
        `完成声明被拒绝：仍需创建并重新观察父目录 ${event.data.pendingParents.join("、")}（${event.data.correctionAttempt}/2）`,
        "stderr",
      ));
      break;
    case "validation.repair.warning":
      frames.push(line(
        `验证修复警告：${event.data.verificationKind} 已失败 ${event.data.failedAttempts} 次${event.data.repeatedDiagnostic ? "，诊断重复" : ""}${event.data.mutatedPaths === undefined || event.data.mutatedPaths.length === 0 ? "" : `；期间修改：${event.data.mutatedPaths.join("、")}`}`,
        "stderr",
      ));
      break;
    case "assistant.message": {
      const alreadyStreamed = previous.streamingRunId === event.runId && previous.streamedContent === event.data.content;
      if (!alreadyStreamed) frames.push(line(`智能体：${event.data.content}`));
      break;
    }
    case "tool.requested":
      frames.push(line(`工具请求：${event.data.toolName} ${stableJson(event.data.publicArguments)}${event.data.argumentsTruncated ? "（参数已截断）" : ""}`));
      break;
    case "approval.required":
      frames.push(line(`需要审批 ${shortUuid(event.data.approvalId)}：${event.data.toolSummary}；${event.data.reason}`, "stderr"));
      break;
    case "approval.resolved":
      frames.push(line(`审批 ${shortUuid(event.data.approvalId)}：${event.data.approved ? "已批准" : "已拒绝"}${event.data.reason ? `；${event.data.reason}` : ""}`));
      break;
    case "plan.proposed":
      frames.push(line(`执行计划：\n${event.data.content}\n计划审批 ${shortUuid(event.data.approvalId)}；使用 /approve-plan 或 /reject-plan。`));
      break;
    case "plan.approval.resolved":
      frames.push(line(`计划 ${shortUuid(event.data.planId)}：${event.data.approved ? "已批准，继续同一运行" : "已拒绝"}${event.data.reason ? `；${event.data.reason}` : ""}`));
      break;
    case "tool.started":
      frames.push(line(`工具执行：${event.data.toolName}`));
      break;
    case "tool.result": {
      const result = event.data.result;
      frames.push(line(`工具结果：${event.data.toolName} — ${result.ok ? "成功" : "失败"}；${result.summary}${result.output === undefined ? "" : `\n${result.output}`}${resultDetails(result.metadata)}${result.error === undefined ? "" : `；${result.error.code}: ${result.error.message}`}`, result.ok ? "stdout" : "stderr"));
      break;
    }
    case "context.compacted":
      frames.push(line(
        event.data.strategy === "deterministic_fallback"
          ? `上下文模型摘要不可用，已使用本地降级压缩至序号 ${event.data.throughSeq}；保留 ${event.data.retainedRange.fromSeq}–${event.data.retainedRange.toSeq}${usageText(event.data.usage, event.data.usageComplete)}`
          : `上下文已压缩至序号 ${event.data.throughSeq}；保留 ${event.data.retainedRange.fromSeq}–${event.data.retainedRange.toSeq}${usageText(event.data.usage, event.data.usageComplete)}`,
        event.data.strategy === "deterministic_fallback" ? "stderr" : "stdout",
      ));
      break;
    case "run.completed":
      frames.push(line(`运行完成：模型请求 ${event.data.iterations} 次，${event.data.durationMs}ms`));
      break;
    case "run.failed":
      frames.push(line(
        `运行失败：${event.data.error.code} — ${event.data.error.message}${contextFailureGuidance(event.data.error)}${actionFailureGuidance(event.data.error)}`,
        "stderr",
      ));
      break;
    case "run.cancelled":
      frames.push(line(`运行已取消：${event.data.reason}`, "stderr"));
      break;
    case "run.interrupted":
      frames.push(line(`上次运行已中断：${event.data.reason}（稳定序号 ${event.data.lastStableSeq}）`, "stderr"));
      break;
    default: {
      const exhaustive: never = event;
      throw new TypeError(`未知 AgentEvent: ${String((exhaustive as { type?: unknown }).type)}`);
    }
  }
  return { frames, state: clean };
}
