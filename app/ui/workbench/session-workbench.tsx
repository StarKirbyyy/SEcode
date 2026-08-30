"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { buildTranscriptItems, foldWorkspacePath, workspaceBasename } from "@/lib/client";
import { projectRun, projectSession } from "@/lib/client/event-state";

import { useAppShell } from "../shell/app-shell-provider";
import { Composer } from "./composer";
import { DetailsDrawer } from "./details-drawer";
import { DetailsIcon } from "./icons";
import { Transcript } from "./transcript";

const STATUS_LABEL: Record<string, string> = {
  idle: "空闲",
  running: "运行中",
  requesting_model: "正在请求模型",
  restating_output: "正在请求中文重述",
  awaiting_plan_approval: "等待计划审批",
  awaiting_approval: "等待审批",
  executing_tool: "正在执行工具",
  completed: "已完成",
  failed: "运行失败",
  cancelled: "已取消",
  interrupted: "已中断",
};

export function SessionWorkbench({ sessionId }: { sessionId: string }) {
  const shell = useAppShell();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const session = shell.sessions.status === "ready"
    ? shell.sessions.data.find((candidate) => candidate.id === sessionId)
    : undefined;
  const readyHistory = shell.history.status === "ready" && shell.history.sessionId === sessionId ? shell.history : undefined;
  const historyReady = readyHistory !== undefined;
  const ledger = readyHistory?.ledger;
  const runningHere = shell.runActive && shell.activeSessionId === sessionId;
  const projection = ledger === undefined ? undefined : projectRun(ledger, runningHere ? shell.activeRunId : undefined);
  const sessionProjection = ledger === undefined ? undefined : projectSession(ledger);
  const events = useMemo(() => ledger === undefined ? [] : [...ledger.durable, ...ledger.live], [ledger]);
  const items = useMemo(() => buildTranscriptItems(events), [events]);
  const closeDetails = useCallback(() => setDetailsOpen(false), []);
  const loadWorkspacePermission = shell.loadWorkspacePermission;
  const setWorkspacePermission = shell.setWorkspacePermission;
  const resolveApproval = shell.resolveApproval;
  const sessionWorkspacePath = session?.workspacePath;
  const activeProjectionRunId = projection?.runId;
  useEffect(() => {
    if (sessionWorkspacePath === undefined) return;
    void loadWorkspacePermission(sessionWorkspacePath);
  }, [loadWorkspacePermission, sessionWorkspacePath]);
  const enableFullAccess = async (approvalId: string) => {
    if (sessionWorkspacePath === undefined || activeProjectionRunId === undefined) return;
    await setWorkspacePermission(sessionWorkspacePath, "full");
    await resolveApproval(activeProjectionRunId, approvalId, true, "工作区已启用完全访问权限");
  };

  const loadHistory = shell.loadHistory;
  useEffect(() => {
    if (session === undefined || historyReady || runningHere) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => loadHistory(sessionId, controller.signal));
    return () => controller.abort();
  }, [historyReady, loadHistory, runningHere, session, sessionId]);

  if (shell.sessions.status === "loading") {
    return <main className="session-page session-page--loading" aria-busy="true"><p role="status">正在定位会话…</p></main>;
  }

  if (shell.sessions.status === "error") {
    return (
      <main className="session-page session-page--error">
        <h1>无法加载会话</h1>
        <p>{shell.sessions.error.message}</p>
        <button type="button" onClick={() => void shell.loadSessions()}>重试</button>
      </main>
    );
  }

  if (session === undefined) {
    return (
      <main className="session-page session-page--error">
        <h1>会话不存在</h1>
        <p>这个会话无法在本地目录中找到。它可能已被移除，或 URL 不完整。</p>
      </main>
    );
  }

  const historyError = shell.history.status === "error" && shell.history.sessionId === sessionId
    ? shell.history.error
    : undefined;
  const historyLoading = shell.history.status === "loading" && shell.history.sessionId === sessionId;
  const status = shell.runTransport === "starting" && shell.activeSessionId === sessionId
    ? "正在启动"
    : shell.runTransport === "stopping" && shell.activeSessionId === sessionId
      ? "正在停止"
      : STATUS_LABEL[projection?.status ?? "idle"];

  return (
    <main className="session-page">
      <header className="session-header">
        <div className="session-heading">
          <div className="session-workspace" title={session.workspacePath}><span>{workspaceBasename(session.workspacePath)}</span><small>{foldWorkspacePath(session.workspacePath)}</small></div>
          <h1>{session.title}</h1>
        </div>
        <div className="session-header-actions">
          <span className="run-status" data-active={runningHere} aria-live="polite"><i aria-hidden="true" />{status}</span>
          <button type="button" className="details-button" onClick={() => setDetailsOpen(true)}><DetailsIcon />详情</button>
        </div>
      </header>
      <section className="session-transcript" aria-label="Agent 执行记录">
        {historyLoading || (!historyReady && historyError === undefined) ? <p className="history-state" role="status">正在从本地事件恢复历史…</p> : null}
        {historyError === undefined ? null : <div className="history-state form-error" role="alert"><span>{historyError.message}</span><button type="button" onClick={() => void shell.loadHistory(sessionId)}>重试</button></div>}
        {readyHistory === undefined ? null : <Transcript items={items} recovery={readyHistory.recovery} running={runningHere} onResolveApproval={shell.resolveApproval} onEnableFullAccess={enableFullAccess} onResolvePlanApproval={shell.resolvePlanApproval} />}
      </section>
      <div className="session-composer">
        <Composer
          value={shell.draft}
          onChange={shell.setDraft}
          onSubmit={() => void shell.submitRun(sessionId)}
          onStop={() => void shell.stopRun()}
          onContinue={shell.fillContinueDraft}
          disabled={!historyReady || shell.runActive}
          running={shell.runActive}
          canContinue={projection?.canContinue ?? false}
          error={shell.runError?.message}
          notice={shell.cancelNotice}
          planningEnabled={shell.planningEnabled}
          onPlanningChange={shell.setPlanningEnabled}
        />
      </div>
      <DetailsDrawer open={detailsOpen} session={session} projection={projection} sessionProjection={sessionProjection} permissionMode={shell.workspacePermissionMode} onSetPermission={(mode) => shell.setWorkspacePermission(session.workspacePath, mode)} onClose={closeDetails} />
    </main>
  );
}
