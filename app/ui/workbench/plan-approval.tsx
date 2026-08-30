"use client";

import { useState } from "react";

import type { TranscriptItem } from "@/lib/client";

import { MarkdownMessage } from "./markdown-message";

type PlanItem = Extract<TranscriptItem, { type: "plan" }>;

export function PlanApproval({
  item,
  running,
  onResolve,
}: {
  item: PlanItem;
  running: boolean;
  onResolve: (
    runId: string,
    planId: string,
    approvalId: string,
    approved: boolean,
    reason?: string,
  ) => Promise<void>;
}) {
  const [pending, setPending] = useState<"approve" | "reject">();
  const [error, setError] = useState<string>();

  const resolve = async (approved: boolean) => {
    if (pending !== undefined || item.approved !== undefined) return;
    setPending(approved ? "approve" : "reject");
    setError(undefined);
    try {
      await onResolve(
        item.runId,
        item.planId,
        item.approvalId,
        approved,
        approved ? "用户同意执行计划" : "用户拒绝执行计划",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "计划审批失败，请重试");
      setPending(undefined);
    }
  };

  return (
    <section className="transcript-plan" aria-labelledby={`plan-title-${item.planId}`}>
      <header>
        <strong id={`plan-title-${item.planId}`}>实施计划</strong>
        <span>{item.approved === undefined ? (running ? "等待你的决定" : "计划未决，运行已结束") : item.approved ? "已同意，正在继续执行" : "已拒绝"}</span>
      </header>
      <MarkdownMessage content={item.content} />
      {item.approved === undefined && running ? (
        <div className="plan-actions" aria-busy={pending !== undefined}>
          <button type="button" disabled={pending !== undefined} onClick={() => void resolve(false)}>
            {pending === "reject" ? "正在拒绝…" : "拒绝计划"}
          </button>
          <button className="primary-button" type="button" disabled={pending !== undefined} onClick={() => void resolve(true)}>
            {pending === "approve" ? "正在开始…" : "同意计划并开始执行"}
          </button>
        </div>
      ) : null}
      {error === undefined ? null : <p className="plan-error" role="alert">{error}；计划仍保留，可再次操作。</p>}
    </section>
  );
}
