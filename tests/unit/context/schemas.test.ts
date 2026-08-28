import { describe, expect, it } from "vitest";

import { ErrorInfoSchema } from "@/lib/domain";
import { ContextLayerError } from "@/lib/context/errors";
import { createContextError } from "@/lib/context/errors";
import {
  ContextSummaryEnvelopeSchema,
  ContextSummaryTranscriptSchema,
} from "@/lib/context/schemas";
import {
  CONTEXT_COMPACTION_THRESHOLD_RATIO,
  CONTEXT_ERROR_CODES,
  CONTEXT_EVENT_PAGE_LIMIT,
  CONTEXT_PROTOCOL_VERSION,
  CONTEXT_RETAIN_RECENT_ROUNDS,
  CONTEXT_SUMMARY_MARKER,
  CONTEXT_SUMMARY_TARGET_RATIO,
  ESTIMATED_MESSAGE_OVERHEAD_TOKENS,
  ESTIMATED_REQUEST_OVERHEAD_TOKENS,
  ESTIMATED_UTF8_BYTES_PER_TOKEN,
  MAX_CONTEXT_SUMMARY_CHARACTERS,
  MAX_PINNED_UNRESOLVED_ERRORS,
} from "@/lib/context/types";

const RUN_ID = "11111111-1111-4111-8111-111111111111";

describe("context contracts", () => {
  it("locks the approved constants and error codes", () => {
    expect({
      CONTEXT_PROTOCOL_VERSION,
      CONTEXT_COMPACTION_THRESHOLD_RATIO,
      CONTEXT_RETAIN_RECENT_ROUNDS,
      CONTEXT_EVENT_PAGE_LIMIT,
      ESTIMATED_UTF8_BYTES_PER_TOKEN,
      ESTIMATED_MESSAGE_OVERHEAD_TOKENS,
      ESTIMATED_REQUEST_OVERHEAD_TOKENS,
      CONTEXT_SUMMARY_TARGET_RATIO,
      MAX_CONTEXT_SUMMARY_CHARACTERS,
      MAX_PINNED_UNRESOLVED_ERRORS,
    }).toEqual({
      CONTEXT_PROTOCOL_VERSION: 1,
      CONTEXT_COMPACTION_THRESHOLD_RATIO: 0.75,
      CONTEXT_RETAIN_RECENT_ROUNDS: 8,
      CONTEXT_EVENT_PAGE_LIMIT: 1_000,
      ESTIMATED_UTF8_BYTES_PER_TOKEN: 2,
      ESTIMATED_MESSAGE_OVERHEAD_TOKENS: 8,
      ESTIMATED_REQUEST_OVERHEAD_TOKENS: 32,
      CONTEXT_SUMMARY_TARGET_RATIO: 0.125,
      MAX_CONTEXT_SUMMARY_CHARACTERS: 65_536,
      MAX_PINNED_UNRESOLVED_ERRORS: 16,
    });
    expect(CONTEXT_ERROR_CODES).toHaveLength(9);
  });

  it("strictly validates summary transcripts and envelopes", () => {
    const transcript = {
      protocolVersion: 1,
      throughSeq: 4,
      targetTokens: 100,
      goals: [{ runId: RUN_ID, content: "修复测试" }],
      rounds: [{ kind: "final", content: "完成" }],
      diagnostics: [],
    };
    expect(ContextSummaryTranscriptSchema.parse(transcript)).toEqual(transcript);
    expect(ContextSummaryTranscriptSchema.safeParse({ ...transcript, extra: true }).success)
      .toBe(false);
    expect(ContextSummaryTranscriptSchema.safeParse({ ...transcript, rounds: [] }).success)
      .toBe(false);
    expect(ContextSummaryEnvelopeSchema.parse({
      marker: CONTEXT_SUMMARY_MARKER,
      content: "摘要",
    })).toEqual({ marker: CONTEXT_SUMMARY_MARKER, content: "摘要" });
    expect(ContextSummaryEnvelopeSchema.safeParse({
      marker: "V2",
      content: "摘要",
    }).success).toBe(false);
  });

  it("creates finite validated errors with a hidden cause", () => {
    const cause = new Error("secret cause");
    const error = createContextError(
      "CONTEXT_BUDGET_EXCEEDED",
      "上下文超出预算",
      { inputBudgetTokens: 10, secret: "sk-abcdefghijklmnopqrstuvwxyz" },
      cause,
    );
    expect(error).toBeInstanceOf(ContextLayerError);
    expect(ErrorInfoSchema.parse(error.error)).toMatchObject({
      code: "CONTEXT_BUDGET_EXCEEDED",
      recoverable: true,
      details: { inputBudgetTokens: 10 },
    });
    expect(JSON.stringify(error)).not.toContain("secret cause");
    expect(JSON.stringify(error.error)).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(Object.keys(error)).not.toContain("cause");
    expect(error.cause).toBe(cause);
  });
});
