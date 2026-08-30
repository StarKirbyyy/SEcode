"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type {
  RunProjection,
  SessionProjection,
  UsageAggregate,
} from "@/lib/client/event-state";
import type { PublicSessionMetadata } from "@/lib/client/types";
import type { WorkspacePermissionMode } from "@/lib/approval";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function DetailsDrawer({
  open,
  session,
  projection,
  sessionProjection,
  onClose,
  permissionMode = "ask",
  onSetPermission,
}: {
  open: boolean;
  session: PublicSessionMetadata;
  projection?: RunProjection;
  sessionProjection?: SessionProjection;
  onClose: () => void;
  permissionMode?: WorkspacePermissionMode;
  onSetPermission?: (mode: WorkspacePermissionMode) => Promise<void>;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = document.querySelector<HTMLElement>(".secode-shell");
    background?.setAttribute("inert", "");
    document.body.classList.add("drawer-open");
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (items.length === 0) { event.preventDefault(); panelRef.current?.focus(); return; }
      const first = items[0]!;
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      background?.removeAttribute("inert");
      document.body.classList.remove("drawer-open");
      restoreFocus.current?.focus();
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;
  const pending = projection?.pendingApprovalIds.length ?? 0;
  const usageText = (usage: UsageAggregate | undefined) => {
    if (usage === undefined) return "未上报";
    const values = usage.values;
    const unknown = usage.unknownRequests.totalTokens;
    return `${unknown > 0 ? "至少 " : ""}输入 ${values.promptTokens ?? "—"} · 输出 ${values.completionTokens ?? "—"} · 总计 ${values.totalTokens ?? "—"} · 推理 ${values.reasoningTokens ?? "—"}${unknown > 0 ? `（${unknown} 次请求用量未知）` : ""}`;
  };
  const percent = (value: number | undefined) =>
    value === undefined ? "不可计算" : `${(value * 100).toFixed(1)}%`;
  const runUsage = projection?.usageBuckets;
  const sessionUsage = sessionProjection?.usage;
  return createPortal(
    <div className="details-drawer-root">
      <button className="drawer-scrim" type="button" aria-label="关闭运行详情" onClick={onClose} />
      <aside className="details-drawer" role="dialog" aria-modal="true" aria-labelledby="details-title" ref={panelRef} tabIndex={-1}>
        <header><div><p className="eyebrow">SESSION FACTS</p><h2 id="details-title">运行详情</h2></div><button type="button" aria-label="关闭运行详情" onClick={onClose}>×</button></header>
        <dl className="details-facts">
          <div><dt>状态</dt><dd>{projection?.status ?? "idle"}</dd></div>
          <div><dt>Plan Mode</dt><dd>{projection?.planningEnabled ? "开启" : "关闭"}</dd></div>
          <div><dt>阶段</dt><dd>{projection?.phase ?? "normal"}</dd></div>
          <div><dt>模型请求</dt><dd>{projection?.modelRequests ?? 0} / {projection?.maxModelRequests ?? "—"}</dd></div>
          <div><dt>当前 run Token</dt><dd>{usageText(runUsage?.combined)}</dd></div>
          <div><dt>上下文</dt><dd>{projection?.contextCompactedThroughSeq === undefined ? "尚未压缩" : `已压缩至 ${projection.contextCompactedThroughSeq}`}</dd></div>
          <div><dt>工具调用</dt><dd>{projection?.toolCalls ?? 0} / {projection?.maxToolCalls ?? "—"}</dd></div>
          <div><dt>待工具审批</dt><dd>{pending}</dd></div>
          <div><dt>待计划审批</dt><dd>{projection?.pendingPlan === undefined ? 0 : 1}</dd></div>
        </dl>
        <section className="details-metrics" aria-label="模型用量">
          <h3>当前 run 用量</h3>
          <p><b>业务模型</b>{usageText(runUsage?.business)}</p>
          <p><b>Context 摘要</b>{usageText(runUsage?.contextSummary)}</p>
          <p><b>合计</b>{usageText(runUsage?.combined)}</p>
          <h3>整个 Session 用量</h3>
          <p><b>业务模型</b>{usageText(sessionUsage?.business)}</p>
          <p><b>Context 摘要</b>{usageText(sessionUsage?.contextSummary)}</p>
          <p><b>合计</b>{usageText(sessionUsage?.combined)}</p>
        </section>
        <section className="details-metrics" aria-label="供应商缓存">
          <h3>供应商 Prompt Cache</h3>
          <p><b>状态</b>{sessionProjection?.providerCache.status ?? "未上报"}</p>
          <p><b>命中 / 未命中</b>{sessionProjection?.providerCache.cachedPromptTokens ?? "—"} / {sessionProjection?.providerCache.cacheMissPromptTokens ?? "—"} Token</p>
          <p><b>命中率</b>{percent(sessionProjection?.providerCache.hitRate)}</p>
        </section>
        <section className="details-metrics" aria-label="本地上下文缓存">
          <h3>本地 Context Cache</h3>
          <p><b>cold / warm / invalidated</b>{sessionProjection === undefined ? "—" : `${sessionProjection.localContextCache.cold} / ${sessionProjection.localContextCache.warm} / ${sessionProjection.localContextCache.invalidated}`}</p>
          <p><b>本地命中率</b>{percent(sessionProjection?.localContextCache.hitRate)}</p>
          <p><b>复用 / 尾部事件</b>{sessionProjection === undefined ? "—" : `${sessionProjection.localContextCache.reusedEvents} / ${sessionProjection.localContextCache.tailEvents}`}</p>
          <p><b>避免读取 / 构建耗时</b>{sessionProjection === undefined ? "—" : `${sessionProjection.localContextCache.avoidedBytes} B / ${sessionProjection.localContextCache.buildMilliseconds} ms`}</p>
        </section>
        <section className="details-metrics" aria-label="上下文压缩">
          <h3>上下文压缩</h3>
          <p><b>总数 / 模型 / 降级</b>{sessionProjection === undefined ? "—" : `${sessionProjection.contextCompaction.count} / ${sessionProjection.contextCompaction.model} / ${sessionProjection.contextCompaction.fallback}`}</p>
          <p><b>最新范围</b>{sessionProjection?.contextCompaction.latestThroughSeq === undefined ? "尚未压缩" : `through ${sessionProjection.contextCompaction.latestThroughSeq}；retained ${sessionProjection.contextCompaction.latestRetainedRange?.fromSeq ?? "?"}–${sessionProjection.contextCompaction.latestRetainedRange?.toSeq ?? "?"}`}</p>
          <p><b>摘要用量不完整</b>{sessionProjection?.contextCompaction.incompleteUsageCount ?? 0} 次</p>
        </section>
        <section><h3>工作区权限</h3><p>当前工作区：{permissionMode === "full" ? "完全访问权限" : "每次询问"}</p>{onSetPermission === undefined ? null : <button type="button" className="details-button" onClick={() => void onSetPermission(permissionMode === "full" ? "ask" : "full")}>{permissionMode === "full" ? "恢复每次询问" : "启用完全访问权限"}</button>}</section>
        <section><h3>会话</h3><p>{session.title}</p><code>{session.workspacePath}</code><p className="details-muted">模型：{session.modelProfileId}</p></section>
        <section><h3>安全边界</h3><p>文件操作限制在当前工作区；明显破坏性操作直接拒绝；未识别命令需要人工审批。</p></section>
      </aside>
    </div>,
    document.body,
  );
}
