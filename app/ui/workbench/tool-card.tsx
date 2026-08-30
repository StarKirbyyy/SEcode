"use client";

import { useState } from "react";

import { UiClientError } from "@/lib/client";
import { formatProcessDetails, formatReplaceComparison, type ToolCardView } from "@/lib/client/view-model";

import { AlertIcon, CheckIcon, ToolIcon } from "./icons";

const STATUS_LABEL = { requested: "已请求", approval_required: "等待审批", rejected: "已拒绝", running: "执行中", succeeded: "成功", failed: "失败" } as const;

export function ToolCard({ card, runId, onResolveApproval, onEnableFullAccess }: { card: ToolCardView; runId?: string; onResolveApproval?: (runId: string, approvalId: string, approved: boolean, reason?: string) => Promise<void>; onEnableFullAccess?: (approvalId: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>();
  const resolve = async (approved: boolean) => {
    if (card.approval === undefined || runId === undefined || onResolveApproval === undefined || submitting || submitted) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onResolveApproval(runId, card.approval.approvalId, approved, reason);
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof UiClientError ? `${cause.code} — ${cause.message}` : "审批提交失败");
    } finally {
      setSubmitting(false);
    }
  };
  const enableFullAccess = async () => {
    if (card.approval === undefined || onEnableFullAccess === undefined || submitting || submitted) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onEnableFullAccess(card.approval.approvalId);
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof UiClientError ? `${cause.code} — ${cause.message}` : "工作区权限设置失败");
    } finally {
      setSubmitting(false);
    }
  };
  const replace = card.toolName === "replace_in_file" && card.publicArguments !== undefined ? formatReplaceComparison(card.publicArguments) : undefined;
  const process = card.toolName === "run_process" && card.publicArguments !== undefined && card.result !== undefined ? formatProcessDetails(card.publicArguments, card.result) : undefined;

  return (
    <div className="tool-entry">
      <details className="tool-card">
        <summary><span className="tool-card-icon">{card.status === "failed" || card.status === "rejected" ? <AlertIcon /> : card.status === "succeeded" ? <CheckIcon /> : <ToolIcon />}</span><strong>{card.toolName}</strong><span>{STATUS_LABEL[card.status]}</span>{card.durationMs === undefined ? null : <small>{card.durationMs}ms</small>}</summary>
        <div className="tool-card-body">
        {card.incomplete ? <p className="tool-warning">生命周期尚未完整，以下仅展示已收到的事件事实。</p> : null}
        {card.publicArguments === undefined ? null : <section><h4>公开参数{card.argumentsTruncated ? "（已截断）" : ""}</h4><pre>{JSON.stringify(card.publicArguments, null, 2)}</pre></section>}
        {replace === undefined ? null : <section className="replace-comparison"><h4>局部替换对照 · {replace.path}</h4><div><pre data-label={`修改前 · ${replace.beforeBytes ?? "?"} bytes`}>{replace.before ?? "无公开预览"}</pre><pre data-label={`修改后 · ${replace.afterBytes ?? "?"} bytes`}>{replace.after ?? "无公开预览"}</pre></div></section>}
        {process === undefined ? null : <section><h4>进程事实</h4><p className="mono-line">argv: {JSON.stringify(process.argv)} · cwd: {process.cwd ?? "?"} · exit: {process.exitCode ?? "?"}{process.truncated ? " · 输出已截断" : ""}</p>{process.output === undefined ? null : <pre>{process.output}</pre>}</section>}
        {card.result === undefined ? null : <section><h4>工具结果</h4><p>{card.result.summary}</p>{card.result.output === undefined || process !== undefined ? null : <pre>{card.result.output}</pre>}{card.result.metadata === undefined ? null : <pre>{JSON.stringify(card.result.metadata, null, 2)}</pre>}{card.result.error === undefined ? null : <p className="form-error">{card.result.error.code} — {card.result.error.message}</p>}</section>}
        </div>
      </details>
      {card.status === "approval_required" && card.approval !== undefined ? <section className="approval-box"><h4>需要人工审批</h4><p><strong>{card.approval.toolSummary}</strong></p><p>{card.approval.reason}</p><label htmlFor={`approval-${card.approval.approvalId}`}>审批理由（可选）</label><input id={`approval-${card.approval.approvalId}`} value={reason} maxLength={4096} disabled={submitting || submitted} onChange={(event) => setReason(event.target.value)} /><div><button type="button" disabled={submitting || submitted} onClick={() => void resolve(false)}>拒绝</button><button type="button" disabled={submitting || submitted} onClick={() => void resolve(true)}>批准本次</button>{onEnableFullAccess === undefined ? null : <button className="primary-button" type="button" disabled={submitting || submitted} onClick={() => void enableFullAccess()}>完全访问权限</button>}</div>{submitted ? <p className="form-note">审批已提交，等待服务端事件确认。</p> : null}{error === undefined ? null : <p className="form-error" role="alert">{error}</p>}</section> : null}
    </div>
  );
}
