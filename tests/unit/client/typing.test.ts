import { describe, expect, it } from "vitest";

import { advanceTyping, segmentGraphemes } from "@/lib/client/typing";

describe("typing progression", () => {
  it("segments Chinese, combining characters and emoji as graphemes", () => {
    const value = "你e\u0301👩🏽‍💻🇨🇳";
    expect(segmentGraphemes(value)).toEqual(["你", "e\u0301", "👩🏽‍💻", "🇨🇳"]);
    expect(segmentGraphemes(value, { forceFallback: true })).toEqual(["你", "e\u0301", "👩🏽‍💻", "🇨🇳"]);
  });

  it("advances at a bounded base rate and catches up a large backlog", () => {
    expect(advanceTyping({ visible: 0, total: 10, elapsedMs: 100, rate: 40 })).toEqual({
      visible: 4,
      remainderMs: 0,
    });
    expect(advanceTyping({ visible: 4, total: 10, elapsedMs: 0, rate: 40 })).toEqual({
      visible: 4,
      remainderMs: 0,
    });
    expect(advanceTyping({ visible: 0, total: 100, elapsedMs: 16, rate: 40, maximumLagMs: 250 })).toEqual({
      visible: 90,
      remainderMs: 16,
    });
  });

  it("accumulates sub-character frames until the final grapheme becomes visible", () => {
    let progress = { visible: 0, remainderMs: 0 };
    for (let frame = 0; frame < 120; frame += 1) {
      progress = advanceTyping({
        visible: progress.visible,
        remainderMs: progress.remainderMs,
        total: 24,
        elapsedMs: 16,
        rate: 45,
        maximumLagMs: 250,
      });
    }
    expect(progress).toEqual({ visible: 24, remainderMs: 0 });
  });

  it("continues after backlog catch-up instead of permanently retaining its tail", () => {
    let progress = advanceTyping({
      visible: 0,
      total: 1_948,
      elapsedMs: 16,
      rate: 45,
      maximumLagMs: 250,
    });
    expect(progress.visible).toBe(1_936);
    for (let frame = 0; frame < 20; frame += 1) {
      progress = advanceTyping({
        visible: progress.visible,
        remainderMs: progress.remainderMs,
        total: 1_948,
        elapsedMs: 16,
        rate: 45,
        maximumLagMs: 250,
      });
    }
    expect(progress.visible).toBeGreaterThan(1_936);
  });

  it("flushes for terminal facts, reduced motion, hidden documents and disabled animation", () => {
    for (const input of [
      { flush: true },
      { reducedMotion: true },
      { hidden: true },
      { disabled: true },
    ]) {
      expect(advanceTyping({
        visible: 2,
        total: 20,
        elapsedMs: 0,
        remainderMs: 21,
        ...input,
      })).toEqual({ visible: 20, remainderMs: 0 });
    }
  });

  it("never regresses or exceeds a shorter authoritative buffer", () => {
    expect(advanceTyping({ visible: 8, total: 5, elapsedMs: 16, remainderMs: 10 })).toEqual({
      visible: 5,
      remainderMs: 0,
    });
    expect(advanceTyping({ visible: 5, total: 5, elapsedMs: 1000, remainderMs: 10 })).toEqual({
      visible: 5,
      remainderMs: 0,
    });
  });
});
