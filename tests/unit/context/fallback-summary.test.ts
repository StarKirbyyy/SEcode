import { describe, expect, it } from "vitest";

import { generateDeterministicFallbackSummary } from "@/lib/context/fallback-summary";
import { projectContextHistory } from "@/lib/context/history-projector";
import { estimateTextTokens } from "@/lib/context/token-estimator";
import type { ContextCompactionSelection } from "@/lib/context/types";

import { manyCompletedRuns } from "./helpers";

function fixture(targetSummaryTokens = 1_000) {
  const events = manyCompletedRuns(12, 300);
  const history = projectContextHistory(events);
  const selection: ContextCompactionSelection = {
    previousSummary: "SECODE_CONTEXT_SUMMARY_V1\n此前读取 /Users/private/secret.txt，密钥 sk-abcdefghijklmnopqrstuvwxyz",
    evictedRounds: history.rounds.slice(0, 4),
    retainedRounds: history.rounds.slice(4),
    throughSeq: history.rounds[4]!.startSeq - 1,
    retainedRange: {
      fromSeq: history.rounds[4]!.startSeq,
      toSeq: history.lastSeq,
    },
    targetSummaryTokens,
  };
  return { history, selection };
}

describe("deterministic context fallback summary", () => {
  it("is deterministic, bounded, Chinese, and removes secrets and absolute paths", () => {
    const input = fixture();
    const first = generateDeterministicFallbackSummary(input);
    const second = generateDeterministicFallbackSummary(input);

    expect(first).toBe(second);
    expect(first).toMatch(/^SECODE_CONTEXT_SUMMARY_V1\n本地降级摘要/u);
    expect(first).toContain("当前目标");
    expect(first).toContain("省略事实");
    expect(first).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(first).not.toContain("/Users/private");
    expect(estimateTextTokens(first)).toBeLessThanOrEqual(1_000);
  });

  it("fails closed when the target cannot contain the minimum envelope", () => {
    expect(() => generateDeterministicFallbackSummary(fixture(1)))
      .toThrowError(/预算/u);
  });
});
