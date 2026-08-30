"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { foldWorkspacePath, workspaceBasename } from "@/lib/client/catalog";
import type { SessionDeletionState } from "@/lib/client/session-deletion";

const FOCUSABLE =
  "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

export function SessionDeleteDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: SessionDeletionState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const deletingRef = useRef(false);
  const open = state.status !== "closed";
  const deleting = state.status === "deleting";

  useEffect(() => {
    deletingRef.current = deleting;
  }, [deleting]);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const backgrounds = [
      document.querySelector<HTMLElement>(".secode-shell"),
      document.querySelector<HTMLElement>(".mobile-navigation-root"),
    ].filter((element): element is HTMLElement => element !== null);
    const previouslyInert = backgrounds.map((element) =>
      element.hasAttribute("inert"),
    );
    backgrounds.forEach((element) => element.setAttribute("inert", ""));
    const hadScrollLock = document.body.classList.contains("drawer-open");
    document.body.classList.add("drawer-open");
    const frame = requestAnimationFrame(() => cancelRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!deletingRef.current) {
          event.preventDefault();
          onCancel();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = [
        ...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
      ];
      if (focusables.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      backgrounds.forEach((element, index) => {
        if (!previouslyInert[index]) element.removeAttribute("inert");
      });
      if (!hadScrollLock) document.body.classList.remove("drawer-open");
      if (restoreFocus.current?.isConnected) restoreFocus.current.focus();
      else {
        document
          .querySelector<HTMLElement>('button[aria-label="打开会话导航"]')
          ?.focus();
      }
    };
  }, [onCancel, open]);

  if (!open || typeof document === "undefined") return null;
  const session = state.session;
  return createPortal(
    <div className="session-delete-root">
      <button
        className="drawer-scrim"
        type="button"
        aria-label="取消删除对话"
        disabled={deleting}
        onClick={onCancel}
      />
      <div
        className="session-delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-delete-title"
        aria-describedby="session-delete-description"
        ref={panelRef}
        tabIndex={-1}
      >
        <p className="eyebrow">删除 Session</p>
        <h2 id="session-delete-title">删除这个对话？</h2>
        <div className="session-delete-target">
          <strong>{session.title}</strong>
          <span>{workspaceBasename(session.workspacePath)}</span>
          <small title={session.workspacePath}>
            {foldWorkspacePath(session.workspacePath)}
          </small>
        </div>
        <p id="session-delete-description">
          只会删除 SEcode 的会话和执行记录，不会删除工作区中的项目文件。此操作无法撤销。
        </p>
        {state.status === "error" ? (
          <p className="session-delete-error" role="alert">
            {state.error.message}
          </p>
        ) : null}
        <div className="session-delete-actions">
          <button
            type="button"
            ref={cancelRef}
            disabled={deleting}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? "正在删除…" : "删除对话"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
