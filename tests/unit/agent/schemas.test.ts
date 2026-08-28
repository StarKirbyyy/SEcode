import { describe, expect, it } from "vitest";

import {
  AgentContextResultSchema,
  AgentRunRequestSchema,
} from "@/lib/agent/schemas";
import { AgentLayerError, createAgentError } from "@/lib/agent/errors";
import {
  AGENT_ERROR_CODES,
  DEFAULT_AGENT_DURATION_MS,
  DEFAULT_MAX_AGENT_ITERATIONS,
} from "@/lib/agent/types";

import { SESSION_ID } from "./helpers";

describe("AgentRunRequestSchema", () => {
  it("applies the approved default limits", () => {
    expect(
      AgentRunRequestSchema.parse({ sessionId: SESSION_ID, prompt: "修复测试" }),
    ).toMatchObject({
      limits: {
        maxIterations: DEFAULT_MAX_AGENT_ITERATIONS,
        maxDurationMs: DEFAULT_AGENT_DURATION_MS,
      },
    });
  });

  it("accepts callers lowering both limits", () => {
    expect(
      AgentRunRequestSchema.parse({
        sessionId: SESSION_ID,
        prompt: "修复测试",
        limits: { maxIterations: 1, maxDurationMs: 1_000 },
      }).limits,
    ).toEqual({ maxIterations: 1, maxDurationMs: 1_000 });
  });

  it.each([
    { sessionId: "bad", prompt: "task" },
    { sessionId: SESSION_ID, prompt: "   " },
    { sessionId: SESSION_ID, prompt: "task", limits: { maxIterations: 31 } },
    { sessionId: SESSION_ID, prompt: "task", limits: { maxDurationMs: 999 } },
    { sessionId: SESSION_ID, prompt: "task", limits: { maxDurationMs: 600_001 } },
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
  ])("rejects invalid context output %#", (value) => {
    expect(AgentContextResultSchema.safeParse(value).success).toBe(false);
  });
});

describe("AgentLayerError", () => {
  it("defines all sixteen approved error codes", () => {
    expect(AGENT_ERROR_CODES).toHaveLength(16);
    expect(new Set(AGENT_ERROR_CODES).size).toBe(16);
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
