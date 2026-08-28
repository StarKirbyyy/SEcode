import { describe, expect, it, vi } from "vitest";

import type { ModelClient } from "@/lib/model";
import { ModelLayerError } from "@/lib/model";
import { generateContextSummary } from "@/lib/context/summary-generator";
import { projectContextHistory } from "@/lib/context/history-projector";
import type { ContextCompactionSelection } from "@/lib/context/types";

import {
  createFakeModelClient,
  manyCompletedRuns,
  modelCompletion,
} from "./helpers";

function fixture() {
  const history = projectContextHistory(manyCompletedRuns(10, 100));
  const selection: ContextCompactionSelection = {
    evictedRounds: history.rounds.slice(0, 2),
    retainedRounds: history.rounds.slice(2),
    throughSeq: history.rounds[2].startSeq - 1,
    retainedRange: {
      fromSeq: history.rounds[2].startSeq,
      toSeq: history.lastSeq,
    },
    targetSummaryTokens: 1_000,
  };
  return { history, selection };
}

describe("context summary generator", () => {
  it("uses the fixed session profile with no tools or continuation", async () => {
    const { history, selection } = fixture();
    const complete = vi.fn<ModelClient["complete"]>(
      async () => modelCompletion("已完成早期检查"),
    );
    const model = createFakeModelClient(100_000, complete);
    const summary = await generateContextSummary({
      modelClient: model,
      profileId: "deepseek",
      contextWindow: 100_000,
      history,
      selection,
      signal: new AbortController().signal,
    });
    expect(summary).toBe("SECODE_CONTEXT_SUMMARY_V1\n已完成早期检查");
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0]).toMatchObject({
      profileId: "deepseek",
      tools: [],
    });
    expect(complete.mock.calls[0][0]).not.toHaveProperty("continuation");
    expect(complete.mock.calls[0][0]).not.toHaveProperty("thinking");
    expect(complete.mock.calls[0][0]).not.toHaveProperty("onTextDelta");
  });

  it("rejects tool calls, empty output, secrets over budget, and cancellation", async () => {
    const { history, selection } = fixture();
    const toolModel = createFakeModelClient(100_000, vi.fn(async () => ({
      ...modelCompletion("bad"),
      finishReason: "tool_calls" as const,
    })));
    await expect(generateContextSummary({
      modelClient: toolModel,
      profileId: "deepseek",
      contextWindow: 100_000,
      history,
      selection,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ error: { code: "CONTEXT_SUMMARY_INVALID" } });

    const secretModel = createFakeModelClient(
      100_000,
      vi.fn(async () => modelCompletion("sk-abcdefghijklmnopqrstuvwxyz done")),
    );
    await expect(generateContextSummary({
      modelClient: secretModel,
      profileId: "deepseek",
      contextWindow: 100_000,
      history,
      selection: { ...selection, targetSummaryTokens: 1 },
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ error: { code: "CONTEXT_SUMMARY_INVALID" } });

    const controller = new AbortController();
    controller.abort();
    await expect(generateContextSummary({
      modelClient: secretModel,
      profileId: "deepseek",
      contextWindow: 100_000,
      history,
      selection,
      signal: controller.signal,
    })).rejects.toMatchObject({ error: { code: "CONTEXT_ABORTED" } });
  });

  it("redacts a valid summary and maps model and empty-output failures", async () => {
    const { history, selection } = fixture();
    const secretModel = createFakeModelClient(
      100_000,
      vi.fn(async () => modelCompletion("密钥 sk-abcdefghijklmnopqrstuvwxyz 已移除")),
    );
    const summary = await generateContextSummary({
      modelClient: secretModel,
      profileId: "deepseek",
      contextWindow: 100_000,
      history,
      selection,
      signal: new AbortController().signal,
    });
    expect(summary).toContain("[REDACTED]");
    expect(summary).not.toContain("abcdefghijklmnopqrstuvwxyz");

    const emptyModel = createFakeModelClient(
      100_000,
      vi.fn(async () => modelCompletion("   ")),
    );
    await expect(generateContextSummary({
      modelClient: emptyModel,
      profileId: "deepseek",
      contextWindow: 100_000,
      history,
      selection,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ error: { code: "CONTEXT_SUMMARY_INVALID" } });

    const failedModel = createFakeModelClient(
      100_000,
      vi.fn(async () => {
        throw new ModelLayerError({
          code: "MODEL_RATE_LIMITED",
          message: "rate limited",
          recoverable: true,
        });
      }),
    );
    await expect(generateContextSummary({
      modelClient: failedModel,
      profileId: "deepseek",
      contextWindow: 100_000,
      history,
      selection,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      error: {
        code: "CONTEXT_SUMMARY_FAILED",
        details: { profileId: "deepseek", reason: "MODEL_RATE_LIMITED" },
      },
    });
  });
});
