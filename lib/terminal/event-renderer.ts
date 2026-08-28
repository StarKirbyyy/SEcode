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

function usageText(usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined): string {
  if (!usage) return "";
  const values = [
    usage.promptTokens === undefined ? undefined : `输入 ${usage.promptTokens}`,
    usage.completionTokens === undefined ? undefined : `输出 ${usage.completionTokens}`,
    usage.totalTokens === undefined ? undefined : `总计 ${usage.totalTokens}`,
  ].filter(Boolean);
  return values.length === 0 ? "" : `；Token ${values.join(" / ")}`;
}

function resultDetails(value: JsonObject | undefined): string {
  return value === undefined ? "" : `；元数据 ${stableJson(value)}`;
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
      frames.push(line(`运行 ${shortUuid(event.runId!)} 已开始；最多 ${event.data.limits.maxIterations} 轮`));
      break;
    case "user.message":
      frames.push(line(`你：${event.data.content}`));
      break;
    case "model.requested":
      frames.push(line(`正在请求模型（第 ${event.data.iteration} 轮，${event.data.modelProfileId}）`));
      break;
    case "model.completed":
      frames.push(line(`模型响应完成（第 ${event.data.iteration} 轮，${event.data.finishReason}${usageText(event.data.usage)}）`));
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
    case "tool.started":
      frames.push(line(`工具执行：${event.data.toolName}`));
      break;
    case "tool.result": {
      const result = event.data.result;
      frames.push(line(`工具结果：${event.data.toolName} — ${result.ok ? "成功" : "失败"}；${result.summary}${result.output === undefined ? "" : `\n${result.output}`}${resultDetails(result.metadata)}${result.error === undefined ? "" : `；${result.error.code}: ${result.error.message}`}`, result.ok ? "stdout" : "stderr"));
      break;
    }
    case "context.compacted":
      frames.push(line(`上下文已压缩至序号 ${event.data.throughSeq}；保留 ${event.data.retainedRange.fromSeq}–${event.data.retainedRange.toSeq}`));
      break;
    case "run.completed":
      frames.push(line(`运行完成：${event.data.iterations} 轮，${event.data.durationMs}ms`));
      break;
    case "run.failed":
      frames.push(line(`运行失败：${event.data.error.code} — ${event.data.error.message}`, "stderr"));
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
