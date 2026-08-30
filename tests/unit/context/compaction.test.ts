import { describe, expect, it } from "vitest";

import { LOCAL_TOOL_DEFINITIONS } from "@/lib/tools";
import { selectContextCompaction } from "@/lib/context/compaction";
import { projectContextHistory } from "@/lib/context/history-projector";
import { renderContextMessages } from "@/lib/context/message-renderer";
import {
  calculateInputBudget,
  estimateContextTokens,
} from "@/lib/context/token-estimator";

import { manyCompletedRuns } from "./helpers";

describe("context compaction selection", () => {
  it("compacts a large 1M-profile history at the 64K soft trigger", () => {
    const history = projectContextHistory(manyCompletedRuns(12, 12_000));
    const baseline = estimateContextTokens(renderContextMessages({
      history,
      workspacePath: "/tmp/workspace",
      rounds: history.rounds,
    }), LOCAL_TOOL_DEFINITIONS, 1_000_000);
    expect(baseline.estimatedTokens).toBeGreaterThanOrEqual(64_000);
    expect(baseline.estimatedTokens).toBeLessThan(baseline.inputBudgetTokens);
    expect(selectContextCompaction({
      history,
      workspacePath: "/tmp/workspace",
      contextWindow: 1_000_000,
      tools: LOCAL_TOOL_DEFINITIONS,
    })).toBeDefined();
  });

  it("does not compact below the 75 percent budget", () => {
    const history = projectContextHistory(manyCompletedRuns(9));
    expect(selectContextCompaction({
      history,
      workspacePath: "/tmp/workspace",
      contextWindow: 1_000_000,
      tools: LOCAL_TOOL_DEFINITIONS,
    })).toBeUndefined();
  });

  it("triggers exactly at 75 percent but not one token before", () => {
    const history = projectContextHistory(manyCompletedRuns(20, 500));
    const messages = renderContextMessages({
      history,
      workspacePath: "/tmp/workspace",
      rounds: history.rounds,
    });
    const estimatedTokens = estimateContextTokens(
      messages,
      LOCAL_TOOL_DEFINITIONS,
      1_000_000,
    ).estimatedTokens;
    const exactWindow = Math.ceil(estimatedTokens / 0.75);
    expect(calculateInputBudget(exactWindow)).toBe(estimatedTokens);
    expect(selectContextCompaction({
      history,
      workspacePath: "/tmp/workspace",
      contextWindow: exactWindow,
      tools: LOCAL_TOOL_DEFINITIONS,
    })).toBeDefined();

    let belowThresholdWindow = exactWindow + 1;
    while (calculateInputBudget(belowThresholdWindow) === estimatedTokens) {
      belowThresholdWindow += 1;
    }
    expect(calculateInputBudget(belowThresholdWindow)).toBe(estimatedTokens + 1);
    expect(selectContextCompaction({
      history,
      workspacePath: "/tmp/workspace",
      contextWindow: belowThresholdWindow,
      tools: LOCAL_TOOL_DEFINITIONS,
    })).toBeUndefined();
  });

  it("evicts only an oldest prefix and retains the latest eight rounds", () => {
    const history = projectContextHistory(manyCompletedRuns(12, 2_500));
    const fullMessages = renderContextMessages({
      history,
      workspacePath: "/tmp/workspace",
      rounds: history.rounds,
    });
    // V5 固定提示词与 readiness 工具定义增加了合法开销；窗口仍需同时满足
    // “完整历史触发压缩”和“最近八回合可完整保留”两个夹具前提。
    const full = estimateContextTokens(fullMessages, LOCAL_TOOL_DEFINITIONS, 25_000);
    expect(full.estimatedTokens).toBeGreaterThanOrEqual(full.inputBudgetTokens);
    const selection = selectContextCompaction({
      history,
      workspacePath: "/tmp/workspace",
      contextWindow: 25_000,
      tools: LOCAL_TOOL_DEFINITIONS,
    });
    expect(selection).toBeDefined();
    expect(selection!.retainedRounds.length).toBeGreaterThanOrEqual(8);
    expect(selection!.evictedRounds.length).toBeGreaterThan(0);
    expect(selection!.evictedRounds.at(-1)!.startSeq)
      .toBeLessThan(selection!.retainedRounds[0].startSeq);
    expect(selection!.throughSeq).toBe(selection!.retainedRange.fromSeq - 1);
    expect(selection!.retainedRange.toSeq).toBe(history.lastSeq);
  });

  it("fails rather than splitting a hard-retained set", () => {
    const history = projectContextHistory(manyCompletedRuns(8, 10_000));
    try {
      selectContextCompaction({
        history,
        workspacePath: "/tmp/workspace",
        contextWindow: 10_000,
        tools: LOCAL_TOOL_DEFINITIONS,
      });
      throw new Error("expected context budget failure");
    } catch (cause) {
      expect(cause).toMatchObject({
        error: {
          code: "CONTEXT_BUDGET_EXCEEDED",
          details: { reason: "projected_recent_rounds_over_budget" },
        },
      });
    }
  });
});
