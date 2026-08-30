"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function BottomSheet({
  open,
  title,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = document.querySelector<HTMLElement>(".secode-shell");
    background?.setAttribute("inert", "");
    document.body.classList.add("drawer-open");
    const dialog = dialogRef.current;
    const focusables = () => [...(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const focusFrame = requestAnimationFrame(() => focusables()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0]!;
      const last = items.at(-1)!;
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
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      background?.removeAttribute("inert");
      document.body.classList.remove("drawer-open");
      restoreFocus.current?.focus();
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="bottom-sheet-root">
      <button className="drawer-scrim" type="button" aria-label="关闭弹窗" onClick={onClose} />
      <div
        className="bottom-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy === undefined ? title : undefined}
        aria-labelledby={labelledBy}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
