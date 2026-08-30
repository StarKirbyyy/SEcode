"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { advanceTyping, segmentGraphemes } from "@/lib/client";

export function TypingText({ content, flush = false, disabled = false }: { content: string; flush?: boolean; disabled?: boolean }) {
  const graphemes = useMemo(() => segmentGraphemes(content), [content]);
  const [visible, setVisible] = useState(0);
  const visibleRef = useRef(0);
  const remainderMsRef = useRef(0);
  const frameRef = useRef<number | undefined>(undefined);
  const previousTime = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (time: number) => {
      const elapsedMs = previousTime.current === undefined ? 16 : time - previousTime.current;
      previousTime.current = time;
      const next = advanceTyping({
        visible: visibleRef.current,
        remainderMs: remainderMsRef.current,
        total: graphemes.length,
        elapsedMs,
        rate: 45,
        maximumLagMs: 250,
        flush,
        disabled,
        reducedMotion,
        hidden: document.hidden,
      });
      visibleRef.current = next.visible;
      remainderMsRef.current = next.remainderMs;
      setVisible(next.visible);
      if (next.visible < graphemes.length) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
      previousTime.current = undefined;
      remainderMsRef.current = 0;
    };
  }, [disabled, flush, graphemes]);

  return <span className="typing-text">{graphemes.slice(0, visible).join("")}<span className="typing-caret" aria-hidden="true" /></span>;
}
