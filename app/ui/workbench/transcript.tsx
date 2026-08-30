"use client";

import { useEffect, useRef, useState } from "react";

import type { TranscriptItem } from "@/lib/client";
import type { EventPageResponse } from "@/lib/client/types";

import { MarkdownMessage } from "./markdown-message";
import { PlanApproval } from "./plan-approval";
import { ToolCard } from "./tool-card";
import { TypingText } from "./typing-text";

const STATUS_LABELS: Record<string, string> = {
  "session.created": "会话已创建",
  "run.started": "任务运行已开始",
  "model.output.rejected": "模型输出未通过中文要求",
  "completion.evidence.rejected": "完成声明缺少变更后验证",
  "validation.repair.warning": "验证修复正在重复失败",
  "write.dependency.rejected": "写入父目录依赖尚未解除",
  "context.compacted": "较早上下文已压缩",
  "run.completed": "任务运行完成",
  "run.failed": "任务运行失败",
  "run.cancelled": "任务运行已取消",
  "run.interrupted": "任务运行已中断",
};

function clock(createdAt: string): string {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.valueOf())) return "";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

function roundSummary(item: Extract<TranscriptItem, { type: "round" }>): string {
  if (item.completedAt === undefined) return `模型请求 ${item.iteration} · 正在请求 ${item.modelProfileId ?? "模型"}`;
  const usage = item.usage === undefined
    ? " · 等待供应商用量"
    : ` · 输入 ${item.usage.promptTokens ?? "—"} / 输出 ${item.usage.completionTokens ?? "—"} / 总计 ${item.usage.totalTokens ?? "—"}${item.usage.reasoningTokens === undefined ? "" : ` / 推理 ${item.usage.reasoningTokens}`}${item.usage.cachedPromptTokens === undefined ? "" : ` / 缓存命中 ${item.usage.cachedPromptTokens}`}${item.usage.cacheMissPromptTokens === undefined ? "" : ` / 未命中 ${item.usage.cacheMissPromptTokens}`}${item.usageComplete === false ? "（不完整）" : ""}`;
  const duration = item.durationMs === undefined ? "" : ` · ${item.durationMs}ms`;
  return `模型请求 ${item.iteration} · 响应完成 · ${item.finishReason ?? "unknown"}${usage}${duration}`;
}

function contextFailureGuidance(item: Extract<TranscriptItem, { type: "status" }>): string {
  if (item.event.type !== "run.failed" || item.event.data.error.code !== "AGENT_CONTEXT_FAILED") return "";
  switch (item.event.data.error.details?.reason) {
    case "model_timeout": return "；模型摘要超时且本地降级未能完成，可缩小任务后继续";
    case "model_failed": return "；模型摘要失败且本地降级未能完成，可缩小任务后继续";
    case "model_output_invalid": return "；模型摘要格式无效且本地降级未能完成，可缩小任务后继续";
    case "summary_input_over_budget": return "；摘要输入超过预算且本地降级未能完成，可缩小任务后继续";
    case "fallback_over_budget": return "；本地降级摘要仍超过上下文预算，请新建 Session 或缩小任务";
    case "projected_recent_rounds_over_budget": return "；投影后的最近完整回合仍超过上下文预算，重复“继续”预计无效，请新建 Session 或缩小任务";
    default: return "；上下文无法构建，可缩小任务后重试";
  }
}

function actionFailureGuidance(item: Extract<TranscriptItem, { type: "status" }>): string {
  if (item.event.type !== "run.failed") return "";
  if (item.event.data.error.code === "AGENT_COMPLETION_EVIDENCE_MISSING") {
    const paths = Array.isArray(item.event.data.error.details?.uncoveredPaths)
      ? item.event.data.error.details.uncoveredPaths.filter((value): value is string => typeof value === "string")
      : [];
    return paths.length === 0
      ? "；修改已保留，请补充 lint、typecheck、test 或 build"
      : `；待验证路径：${paths.join("、")}；修改已保留，请补充认可验证`;
  }
  if (item.event.data.error.code === "AGENT_VALIDATION_NO_PROGRESS") {
    return "；相同验证诊断已在修改后重复三次，请集中处理后继续";
  }
  return "";
}

function statusDetail(item: Extract<TranscriptItem, { type: "status" }>): string | undefined {
  if (item.event.type === "model.output.rejected") {
    return item.event.data.action === "retry"
      ? `正在请求中文重述（${item.event.data.retryAttempt}/2）`
      : "已忽略工具调用前的非中文说明，工具将按原请求执行一次";
  }
  if (item.event.type === "completion.evidence.rejected") {
    const pending = item.event.data.uncoveredPaths !== undefined && item.event.data.uncoveredPaths.length > 0
      ? `；待验证路径：${item.event.data.uncoveredPaths.join("、")}${item.event.data.uncoveredPathsTruncated === true ? "（列表已截断）" : ""}`
      : item.event.data.uncoveredScopes === undefined
        ? ""
        : `；待验证 scope：${item.event.data.uncoveredScopes.join("、")}`;
    return `需要补充 lint、typecheck、test 或 build${pending}（${item.event.data.correctionAttempt}/2）`;
  }
  if (item.event.type === "write.dependency.rejected") {
    return `待创建并重新观察：${item.event.data.pendingParents.join("、")}（${item.event.data.correctionAttempt}/2）`;
  }
  if (item.event.type === "validation.repair.warning") {
    const paths = item.event.data.mutatedPaths === undefined || item.event.data.mutatedPaths.length === 0
      ? ""
      : `；期间修改：${item.event.data.mutatedPaths.join("、")}${item.event.data.mutatedPathsTruncated === true ? "（列表已截断）" : ""}`;
    return `${item.event.data.verificationKind} 已失败 ${item.event.data.failedAttempts} 次${item.event.data.repeatedDiagnostic ? "，诊断重复" : ""}${paths}`;
  }
  if (item.event.type === "run.failed") {
    return `${item.event.data.error.code} — ${item.event.data.error.message}${contextFailureGuidance(item)}${actionFailureGuidance(item)}`;
  }
  if (item.event.type === "run.cancelled" || item.event.type === "run.interrupted") return item.event.data.reason;
  if (item.event.type === "run.completed") return `${item.event.data.iterations} 次模型请求 · ${item.event.data.durationMs}ms`;
  if (item.event.type === "context.compacted") {
    return item.event.data.strategy === "deterministic_fallback"
      ? `模型摘要不可用，已使用本地降级压缩至序号 ${item.event.data.throughSeq}`
      : `压缩至序号 ${item.event.data.throughSeq}`;
  }
  return undefined;
}

export function Transcript({
  items,
  recovery,
  running,
  onResolveApproval,
  onEnableFullAccess,
  onResolvePlanApproval,
}: {
  items: readonly TranscriptItem[];
  recovery: EventPageResponse["recovery"];
  running: boolean;
  onResolveApproval: (runId: string, approvalId: string, approved: boolean, reason?: string) => Promise<void>;
  onEnableFullAccess?: (approvalId: string) => Promise<void>;
  onResolvePlanApproval: (runId: string, planId: string, approvalId: string, approved: boolean, reason?: string) => Promise<void>;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [hasNewItems, setHasNewItems] = useState(false);
  const lastKey = items.at(-1)?.key;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const node = scroller.current;
      if (node === null) return;
      if (nearBottom.current) {
        node.scrollTo({ top: node.scrollHeight, behavior: running ? "smooth" : "auto" });
        setHasNewItems(false);
      } else {
        setHasNewItems(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [lastKey, running, items]);

  const jumpToLatest = () => {
    const node = scroller.current;
    node?.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    nearBottom.current = true;
    setHasNewItems(false);
  };

  return (
    <div className="transcript-wrap">
      {recovery.tailRepaired || recovery.discardedTailBytes > 0 || recovery.openRunIds.length > 0 ? (
        <div className="recovery-banner" role="status">
          已恢复至稳定序号 {recovery.lastStableSeq}
          {recovery.tailRepaired ? `；修复尾部 ${recovery.discardedTailBytes} bytes` : ""}
          {recovery.openRunIds.length > 0 ? `；${recovery.openRunIds.length} 个运行曾被中断` : ""}
        </div>
      ) : null}
      <div className="transcript-scroll" ref={scroller} onScroll={(event) => {
        const node = event.currentTarget;
        nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
        if (nearBottom.current) setHasNewItems(false);
      }}>
        <div className="transcript-content" aria-live="polite">
          {items.length === 0 ? (
            <div className="transcript-empty">
              <p>会话已经准备好。</p>
              <span>在下方描述下一步任务，Agent 的模型轮次、工具和结果会连续显示在这里。</span>
            </div>
          ) : items.map((item) => {
            if (item.type === "message") {
              return (
                <article className="transcript-message" data-role={item.role} key={item.key}>
                  <header><strong>{item.role === "user" ? "你" : "SEcode"}</strong><time dateTime={item.createdAt}>{clock(item.createdAt)}</time></header>
                  <MarkdownMessage content={item.content} />
                </article>
              );
            }
            if (item.type === "assistant_draft") {
              return (
                <article className="transcript-message" data-role="assistant" data-live="true" key={item.key}>
                  <header><strong>SEcode</strong><span>正在输入</span></header>
                  <div className="markdown-message"><p><TypingText content={item.content} flush={!running} /></p></div>
                </article>
              );
            }
            if (item.type === "round") {
              return <div className="transcript-round" data-complete={item.completedAt !== undefined} key={item.key}><span aria-hidden="true" /><p>{roundSummary(item)}</p><time dateTime={item.createdAt}>{clock(item.createdAt)}</time></div>;
            }
            if (item.type === "tool") {
              return <ToolCard card={item.card} runId={item.runId} onResolveApproval={onResolveApproval} onEnableFullAccess={onEnableFullAccess} key={item.key} />;
            }
            if (item.type === "plan") {
              return <PlanApproval item={item} running={running} onResolve={onResolvePlanApproval} key={item.key} />;
            }
            const detail = statusDetail(item);
            return (
              <div className="transcript-status" data-tone={item.tone} key={item.key}>
                <span>{STATUS_LABELS[item.eventType] ?? item.eventType}</span>
                {detail === undefined ? null : <small>{detail}</small>}
                <time dateTime={item.createdAt}>{clock(item.createdAt)}</time>
              </div>
            );
          })}
        </div>
      </div>
      {hasNewItems ? <button className="new-events-button" type="button" onClick={jumpToLatest}>有新内容 · 回到底部</button> : null}
    </div>
  );
}
