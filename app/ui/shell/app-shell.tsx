"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { MenuIcon } from "../workbench/icons";
import { WorkspacePicker } from "../workbench/workspace-picker";
import { useAppShell } from "./app-shell-provider";
import { SessionDeleteDialog } from "./session-delete-dialog";
import { SessionNavigation } from "./session-navigation";

function sessionIdFromPath(pathname: string): string | undefined {
  const match = /^\/sessions\/([^/]+)\/?$/u.exec(pathname);
  if (match?.[1] === undefined) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function MobileNavigationDrawer({ open, currentSessionId, onClose }: { open: boolean; currentSessionId?: string; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = document.querySelector<HTMLElement>(".secode-shell");
    background?.setAttribute("inert", "");
    document.body.classList.add("drawer-open");
    const items = () => [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const frame = requestAnimationFrame(() => items()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const focusables = items();
      if (focusables.length === 0) { event.preventDefault(); panelRef.current?.focus(); return; }
      const first = focusables[0]!;
      const last = focusables.at(-1)!;
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
  return createPortal(
    <div className="mobile-navigation-root">
      <button className="drawer-scrim" type="button" aria-label="关闭会话导航" onClick={onClose} />
      <div className="mobile-navigation-panel" role="dialog" aria-modal="true" aria-labelledby="mobile-navigation-title" ref={panelRef} tabIndex={-1}>
        <div className="mobile-navigation-head"><h2 id="mobile-navigation-title">会话与任务</h2><button type="button" aria-label="关闭会话导航" onClick={onClose}>×</button></div>
        <SessionNavigation currentSessionId={currentSessionId} onNavigate={onClose} />
      </div>
    </div>,
    document.body,
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shell = useAppShell();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const currentSessionId = sessionIdFromPath(pathname);
  const setPickerOpen = shell.setPickerOpen;
  const closePicker = useCallback(() => setPickerOpen(false), [setPickerOpen]);
  const closeNavigation = useCallback(() => setMobileNavigationOpen(false), []);

  return (
    <>
      <div className="secode-shell">
        <div className="desktop-navigation">
          <SessionNavigation currentSessionId={currentSessionId} />
        </div>
        <div className="application-column">
          <header className="mobile-header">
            <button type="button" aria-label="打开会话导航" onClick={() => setMobileNavigationOpen(true)}><MenuIcon /></button>
            <span className="mobile-brand"><b>S</b> SEcode</span>
            <span className="local-status"><i aria-hidden="true" /> 本地</span>
          </header>
          {shell.navigationNotice === undefined ? null : <div className="navigation-notice" role="status">{shell.navigationNotice}</div>}
          {children}
        </div>
      </div>
      <WorkspacePicker
        open={shell.pickerOpen}
        api={shell.api}
        recentWorkspaces={shell.recent.status === "ready" ? shell.recent.data.workspaces : []}
        validation={shell.workspaceValidation}
        validationError={shell.workspaceError?.message}
        onClose={closePicker}
        onSelectPath={shell.selectWorkspacePath}
      />
      <SessionDeleteDialog
        state={shell.sessionDeletion}
        onCancel={shell.closeSessionDeletion}
        onConfirm={() => void shell.confirmSessionDeletion(currentSessionId)}
      />
      <MobileNavigationDrawer open={mobileNavigationOpen} currentSessionId={currentSessionId} onClose={closeNavigation} />
    </>
  );
}
