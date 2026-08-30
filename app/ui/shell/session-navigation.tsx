"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { foldWorkspacePath, groupSessionsByWorkspace } from "@/lib/client";

import { DeleteIcon, FolderIcon, PlusIcon } from "../workbench/icons";
import { useAppShell } from "./app-shell-provider";

export function SessionNavigation({
  currentSessionId,
  onNavigate,
}: {
  currentSessionId?: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const shell = useAppShell();
  const groups = shell.sessions.status === "ready"
    ? groupSessionsByWorkspace(shell.sessions.data)
    : [];

  const openNewTask = () => {
    if (!shell.startNewTask()) return;
    onNavigate?.();
    router.push("/");
  };
  const openWorkspace = () => {
    if (!shell.startNewTask()) return;
    onNavigate?.();
    shell.setPickerOpen(true);
    router.push("/");
  };

  return (
    <aside className="session-navigation" aria-label="会话导航">
      <div className="brand-row">
        <Link href="/" className="brand" onClick={(event) => {
          event.preventDefault();
          openNewTask();
        }}>
          <span className="brand-mark" aria-hidden="true">S</span>
          <span><strong>SEcode</strong><small>local coding agent</small></span>
        </Link>
      </div>
      <button className="new-task-button" type="button" onClick={openNewTask}>
        <PlusIcon />
        <span>新任务</span>
        <kbd>⌘ N</kbd>
      </button>
      <button className="workspace-nav-button" type="button" onClick={openWorkspace}>
        <FolderIcon />
        <span>工作区</span>
      </button>
      <div className="navigation-scroll">
        <div className="navigation-section-title">
          <span>会话</span>
          {shell.sessions.status === "error" ? <button type="button" onClick={() => void shell.loadSessions()}>重试</button> : null}
        </div>
        {shell.sessions.status === "loading" ? <p className="navigation-empty">正在恢复会话…</p> : null}
        {shell.sessions.status === "ready" && groups.length === 0 ? <p className="navigation-empty">还没有任务记录</p> : null}
        {groups.map((group) => (
          <section className="workspace-session-group" key={group.workspacePath}>
            <div className="workspace-group-label" title={group.workspacePath}>
              <FolderIcon />
              <span>{group.label}</span>
              <small>{foldWorkspacePath(group.workspacePath)}</small>
              <button type="button" className="workspace-new-session" aria-label={`在${group.label}中新建对话`} title="在此工作区新建对话" onClick={() => { void shell.startNewTaskInWorkspace(group.workspacePath); onNavigate?.(); }}>+</button>
            </div>
            <div className="session-links">
              {group.sessions.map((session) => {
                const active = session.id === currentSessionId;
                const running = shell.activeSessionId === session.id && shell.runActive;
                return (
                  <div className="session-row" data-active={active} key={session.id}>
                    <Link
                      href={`/sessions/${encodeURIComponent(session.id)}`}
                      className="session-link"
                      aria-current={active ? "page" : undefined}
                      onClick={(event) => {
                        if (!shell.requestNavigation(session.id)) {
                          event.preventDefault();
                          return;
                        }
                        onNavigate?.();
                      }}
                    >
                      <span className="session-status-dot" data-running={running} aria-hidden="true" />
                      <span>{session.title}</span>
                      {running ? <small>运行中</small> : null}
                    </Link>
                    <button
                      type="button"
                      className="session-delete-button"
                      aria-label={`删除会话：${session.title}`}
                      title={running ? "请先停止任务，再删除对话" : "删除对话"}
                      disabled={running}
                      onClick={() => {
                        shell.openSessionDeletion(session);
                        onNavigate?.();
                      }}
                    >
                      <DeleteIcon />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="navigation-footer">
        <span className="local-status"><i aria-hidden="true" /> 本地服务</span>
        <span>可信单用户模式</span>
      </div>
    </aside>
  );
}
