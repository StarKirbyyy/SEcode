import { describe, expect, it } from "vitest";

import {
  AgentContextResultSchema,
  AgentRunRequestSchema,
} from "@/lib/agent/schemas";
import { AgentLayerError, createAgentError } from "@/lib/agent/errors";
import {
  AGENT_ERROR_CODES,
  DEFAULT_AGENT_DURATION_MS,
  DEFAULT_MAX_TOOL_CALLS,
} from "@/lib/agent/types";

import { SESSION_ID } from "./helpers";

describe("AgentRunRequestSchema", () => {
  it("applies the approved default limits", () => {
    const parsed = AgentRunRequestSchema.parse({ sessionId: SESSION_ID, prompt: "修复测试" });
    expect(parsed).toMatchObject({
      limits: {
        maxToolCalls: DEFAULT_MAX_TOOL_CALLS,
        maxDurationMs: DEFAULT_AGENT_DURATION_MS,
      },
      planningEnabled: false,
    });
    expect(parsed.limits).not.toHaveProperty("maxModelRequests");
    expect(DEFAULT_MAX_TOOL_CALLS).toBe(300);
    expect(DEFAULT_AGENT_DURATION_MS).toBe(1_800_000);
  });

  it("accepts callers lowering both limits", () => {
    expect(
      AgentRunRequestSchema.parse({
        sessionId: SESSION_ID,
        prompt: "修复测试",
        limits: { maxIterations: 120, maxToolCalls: 300, maxDurationMs: 1_000 },
      }).limits,
    ).toEqual({ maxModelRequests: 120, maxToolCalls: 300, maxDurationMs: 1_000 });
  });

  it.each([
    { sessionId: "bad", prompt: "task" },
    { sessionId: SESSION_ID, prompt: "   " },
    { sessionId: SESSION_ID, prompt: "task", limits: { maxIterations: 121 } },
    { sessionId: SESSION_ID, prompt: "task", limits: { maxModelRequests: 1, maxIterations: 1 } },
    { sessionId: SESSION_ID, prompt: "task", limits: { maxToolCalls: 301 } },
    { sessionId: SESSION_ID, prompt: "task", limits: { maxDurationMs: 999 } },
    { sessionId: SESSION_ID, prompt: "task", limits: { maxDurationMs: 3_600_001 } },
    { sessionId: SESSION_ID, prompt: "task", extra: true },
  ])("rejects invalid public input %#", (value) => {
    expect(AgentRunRequestSchema.safeParse(value).success).toBe(false);
  });

  it("keeps runtime controls outside the JSON request schema", () => {
    expect(
      AgentRunRequestSchema.safeParse({
        sessionId: SESSION_ID,
        prompt: "task",
        signal: new AbortController().signal,
      }).success,
    ).toBe(false);
  });
});

describe("AgentContextResultSchema", () => {
  it("accepts strict messages and an ordered compaction draft", () => {
    expect(
      AgentContextResultSchema.parse({
        messages: [{ role: "user", content: "task" }],
        compaction: {
          throughSeq: 2,
          summary: "summary",
          retainedRange: { fromSeq: 3, toSeq: 4 },
          strategy: "deterministic_fallback",
          fallbackReason: "model_timeout",
          usage: {
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 12,
            reasoningTokens: 1,
            cachedPromptTokens: 8,
            cacheMissPromptTokens: 2,
          },
          usageComplete: true,
        },
      }),
    ).toBeDefined();
  });

  it.each([
    { messages: [] },
    { messages: [{ role: "user", content: "task", extra: true }] },
    {
      messages: [{ role: "user", content: "task" }],
      compaction: {
        throughSeq: 2,
        summary: "summary",
        retainedRange: { fromSeq: 4, toSeq: 3 },
      },
    },
    {
      messages: [{ role: "user", content: "task" }],
      compaction: {
        throughSeq: 2,
        summary: "summary",
        retainedRange: { fromSeq: 3, toSeq: 4 },
        strategy: "model",
        fallbackReason: "model_timeout",
      },
    },
  ])("rejects invalid context output %#", (value) => {
    expect(AgentContextResultSchema.safeParse(value).success).toBe(false);
  });
});

describe("AgentLayerError", () => {
  it("defines all approved error codes", () => {
    expect(AGENT_ERROR_CODES).toHaveLength(24);
    expect(new Set(AGENT_ERROR_CODES).size).toBe(24);
    expect(AGENT_ERROR_CODES).toContain("AGENT_OUTPUT_LANGUAGE_INVALID");
    expect(AGENT_ERROR_CODES).toContain("AGENT_VALIDATION_NO_PROGRESS");
    expect(AGENT_ERROR_CODES).toContain("AGENT_COMPLETION_EVIDENCE_MISSING");
    expect(AGENT_ERROR_CODES).toContain("AGENT_WRITE_DEPENDENCY_UNRESOLVED");
  });

  it("keeps causes non-enumerable and sanitizes details", () => {
    const cause = new Error("private stack");
    const error = createAgentError(
      "AGENT_INTERNAL_ERROR",
      "运行失败",
      { apiKey: "secret", reason: "Bearer token-value" },
      cause,
    );

    expect(error).toBeInstanceOf(AgentLayerError);
    expect(error.cause).toBe(cause);
    expect(Object.keys(error)).not.toContain("cause");
    expect(JSON.stringify(error.error)).not.toContain("token-value");
    expect(JSON.stringify(error.error)).not.toContain("secret");
  });

  it("uses the fixed recoverability table", () => {
    expect(createAgentError("AGENT_SESSION_BUSY", "busy").error.recoverable).toBe(true);
    expect(createAgentError("AGENT_HISTORY_INVALID", "bad").error.recoverable).toBe(false);
  });
});
