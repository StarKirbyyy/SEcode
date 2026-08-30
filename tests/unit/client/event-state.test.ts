import { describe, expect, it } from "vitest";

import { AgentEventSchema, type AgentEvent } from "@/lib/domain";
import {
  createEventLedger,
  mergeAgentEvent,
  mergeAgentEvents,
  projectRun,
  projectSession,
} from "@/lib/client/event-state";

const SESSION = "00000000-0000-4000-8000-000000000001";
const OTHER_SESSION = "00000000-0000-4000-8000-000000000002";
const RUN = "00000000-0000-4000-8000-000000000010";
const NOW = "2026-08-28T00:00:00.000Z";

function id(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function durable(seq: number, type: string, data: object, overrides: object = {}): AgentEvent {
  return AgentEventSchema.parse({ protocolVersion: 1, durable: true, id: id(seq + 100), seq, sessionId: SESSION, runId: RUN, type, createdAt: NOW, data, ...overrides });
}

function live(streamSeq: number, content: string, overrides: object = {}): AgentEvent {
  return AgentEventSchema.parse({ protocolVersion: 1, durable: false, id: id(streamSeq + 200), streamSeq, sessionId: SESSION, runId: RUN, type: "assistant.delta", createdAt: NOW, data: { content }, ...overrides });
}

describe("client event ledger", () => {
  it("deduplicates repeated durable pages and rejects conflicts, rollback and wrong sessions", () => {
    const first = durable(1, "run.started", { promptPreview: "go", limits: { maxIterations: 30, maxDurationMs: 600000 } });
    let state = mergeAgentEvent(createEventLedger(SESSION), first);
    expect(mergeAgentEvent(state, first)).toBe(state);
    expect(() => mergeAgentEvent(state, durable(1, "user.message", { content: "different" }))).toThrowError(/事件/);
    state = mergeAgentEvent(state, durable(3, "user.message", { content: "go" }));
    expect(() => mergeAgentEvent(state, durable(2, "user.message", { content: "late" }))).toThrowError(/事件/);
    expect(() => mergeAgentEvent(state, durable(4, "user.message", { content: "wrong" }, { sessionId: OTHER_SESSION }))).toThrowError(/会话/);
  });

  it("orders live deltas, deduplicates them and lets durable messages replace the buffer", () => {
    let state = createEventLedger(SESSION);
    const one = live(1, "你");
    state = mergeAgentEvent(state, one);
    expect(mergeAgentEvent(state, one)).toBe(state);
    state = mergeAgentEvent(state, live(2, "好"));
    expect(projectRun(state, RUN).assistantDraft).toBe("你好");
    expect(() => mergeAgentEvent(state, live(2, "冲突", { id: id(999) }))).toThrowError(/事件/);
    state = mergeAgentEvent(state, durable(1, "assistant.message", { content: "你好", kind: "intermediate" }));
    expect(projectRun(state, RUN).assistantDraft).toBe("");
    state = mergeAgentEvent(state, live(3, "继续"));
    expect(projectRun(state, RUN).assistantDraft).toBe("继续");
  });

  it("clears the matching live draft on rejection and terminal events", () => {
    let state = createEventLedger(SESSION);
    state = mergeAgentEvent(state, live(1, "未验证完成。", { data: { content: "未验证完成。", iteration: 2 } }));
    state = mergeAgentEvent(state, durable(1, "completion.evidence.rejected", {
      iteration: 2,
      missing: ["post_change_verification"],
      correctionAttempt: 1,
    }));
    expect(projectRun(state, RUN).assistantDraft).toBe("");
    state = mergeAgentEvent(state, live(2, "目录已处理。", { data: { content: "目录已处理。", iteration: 3 } }));
    state = mergeAgentEvent(state, durable(2, "write.dependency.rejected", {
      iteration: 3,
      pendingParents: ["server"],
      correctionAttempt: 1,
    }));
    expect(projectRun(state, RUN).assistantDraft).toBe("");
    state = mergeAgentEvent(state, live(3, "继续处理。", { data: { content: "继续处理。", iteration: 4 } }));
    state = mergeAgentEvent(state, durable(3, "run.cancelled", { reason: "取消", iterations: 4 }));
    expect(projectRun(state, RUN).assistantDraft).toBe("");
  });

  it("projects status, iteration, usage, compaction, terminal and reconciliation cursor", () => {
    let state = createEventLedger(SESSION);
    const events = [
      durable(1, "run.started", { promptPreview: "go", limits: { maxIterations: 30, maxDurationMs: 600000 } }),
      durable(2, "model.requested", { iteration: 2, modelProfileId: "test" }),
      durable(3, "model.completed", { iteration: 2, finishReason: "tool_calls", usage: { totalTokens: 42 } }),
      durable(4, "context.compacted", { throughSeq: 2, summary: "summary", retainedRange: { fromSeq: 3, toSeq: 4 }, strategy: "deterministic_fallback", fallbackReason: "model_timeout" }),
      durable(5, "run.failed", { error: { code: "TEST", message: "failed", recoverable: true }, iterations: 2 }),
    ];
    for (const event of events) state = mergeAgentEvent(state, event);
    expect(projectRun(state, RUN)).toMatchObject({ status: "failed", iteration: 2, modelRequests: 1, toolCalls: 0, usage: { totalTokens: 42 }, contextCompactedThroughSeq: 2, contextCompactionStrategy: "deterministic_fallback", contextFallbackReason: "model_timeout", terminalType: "run.failed", canContinue: true, reconciliationAfter: 5 });
  });

  it("accumulates usage across every completed model round", () => {
    let state = createEventLedger(SESSION);
    const events = [
      durable(1, "run.started", { promptPreview: "go", limits: { maxDurationMs: 600000 } }),
      durable(2, "model.requested", { iteration: 1, modelProfileId: "test" }),
      durable(3, "model.completed", { iteration: 1, finishReason: "tool_calls", usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 } }),
      durable(4, "model.requested", { iteration: 2, modelProfileId: "test" }),
      durable(5, "model.completed", { iteration: 2, finishReason: "stop", usage: { promptTokens: 20, completionTokens: 6, totalTokens: 26 } }),
    ];
    for (const event of events) state = mergeAgentEvent(state, event);
    expect(projectRun(state, RUN).usage).toEqual({ promptTokens: 30, completionTokens: 10, totalTokens: 40 });
  });

  it("includes compaction usage and marks missing provider usage as incomplete", () => {
    const state = mergeAgentEvents(createEventLedger(SESSION), [
      durable(1, "run.started", { promptPreview: "x", limits: { maxDurationMs: 10_000 } }),
      durable(2, "model.requested", { iteration: 1, modelProfileId: "deepseek" }),
      durable(3, "model.completed", { iteration: 1, finishReason: "tool_calls" }),
      durable(4, "context.compacted", {
        throughSeq: 3,
        summary: "summary",
        retainedRange: { fromSeq: 4, toSeq: 4 },
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        usageComplete: true,
      }),
    ]);
    expect(projectRun(state, RUN)).toMatchObject({
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      usageComplete: false,
      unreportedUsageRequests: 1,
    });
  });

  it("marks a model request without a completion event as unreported usage", () => {
    const state = mergeAgentEvents(createEventLedger(SESSION), [
      durable(1, "run.started", { promptPreview: "x", limits: { maxDurationMs: 10_000 } }),
      durable(2, "model.requested", { iteration: 1, modelProfileId: "deepseek" }),
    ]);
    expect(projectRun(state, RUN)).toMatchObject({ usageComplete: false, unreportedUsageRequests: 1 });
  });

  it("aggregates business, context-summary and combined usage across all session runs", () => {
    const run2 = id(20);
    const run3 = id(30);
    const state = mergeAgentEvents(createEventLedger(SESSION), [
      durable(1, "run.started", { promptPreview: "a", limits: { maxDurationMs: 10_000 } }),
      durable(2, "model.requested", { iteration: 1, modelProfileId: "deepseek" }),
      durable(3, "model.completed", {
        iteration: 1,
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14, reasoningTokens: 2, cachedPromptTokens: 8, cacheMissPromptTokens: 2 },
        usageComplete: true,
        contextCache: { status: "cold", reusedEvents: 0, tailEvents: 3, avoidedBytes: 0, buildMilliseconds: 8 },
      }),
      durable(4, "run.failed", { error: { code: "X", message: "x", recoverable: false }, iterations: 1 }),
      durable(5, "run.started", { promptPreview: "b", limits: { maxDurationMs: 10_000 } }, { runId: run2 }),
      durable(6, "model.requested", { iteration: 1, modelProfileId: "deepseek" }, { runId: run2 }),
      durable(7, "model.completed", {
        iteration: 1,
        finishReason: "tool_calls",
        usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25, cachedPromptTokens: 20, cacheMissPromptTokens: 0 },
        usageComplete: true,
        contextCache: { status: "warm", reusedEvents: 4, tailEvents: 1, avoidedBytes: 512, buildMilliseconds: 2 },
      }, { runId: run2 }),
      durable(8, "context.compacted", {
        throughSeq: 5,
        summary: "摘要",
        retainedRange: { fromSeq: 6, toSeq: 7 },
        strategy: "model",
        usage: { promptTokens: 6, completionTokens: 2, totalTokens: 8 },
        usageComplete: true,
      }, { runId: run2 }),
      durable(9, "run.completed", { iterations: 1, durationMs: 5 }, { runId: run2 }),
      durable(10, "run.started", { promptPreview: "c", limits: { maxDurationMs: 10_000 } }, { runId: run3 }),
      durable(11, "model.requested", { iteration: 1, modelProfileId: "longcat" }, { runId: run3 }),
      durable(12, "run.cancelled", { reason: "取消", iterations: 1 }, { runId: run3 }),
    ]);
    const session = projectSession(state);
    expect(session.usage.business.values).toMatchObject({
      promptTokens: 30,
      completionTokens: 9,
      totalTokens: 39,
      reasoningTokens: 2,
      cachedPromptTokens: 28,
      cacheMissPromptTokens: 2,
    });
    expect(session.usage.contextSummary.values).toMatchObject({ totalTokens: 8 });
    expect(session.usage.combined.values).toMatchObject({ totalTokens: 47 });
    expect(session.usage.business.unknownRequests.totalTokens).toBe(1);
    expect(session.providerCache).toMatchObject({ status: "partial", cachedPromptTokens: 28, cacheMissPromptTokens: 2 });
    expect(session.localContextCache).toMatchObject({
      cold: 1,
      warm: 1,
      invalidated: 0,
      hitRate: 0.5,
      reusedEvents: 4,
      tailEvents: 4,
      avoidedBytes: 512,
      buildMilliseconds: 10,
    });
    expect(session.contextCompaction).toMatchObject({
      count: 1,
      model: 1,
      fallback: 0,
      latestThroughSeq: 5,
      latestRetainedRange: { fromSeq: 6, toSeq: 7 },
    });
  });

  it("computes provider cache rates only with a reliable hit and miss denominator", () => {
    const zero = projectSession(mergeAgentEvents(createEventLedger(SESSION), [
      durable(1, "model.completed", { iteration: 1, finishReason: "stop", usage: { cachedPromptTokens: 0, cacheMissPromptTokens: 10 } }),
    ])).providerCache;
    expect(zero).toMatchObject({ status: "reported", hitRate: 0 });

    const full = projectSession(mergeAgentEvents(createEventLedger(SESSION), [
      durable(1, "model.completed", { iteration: 1, finishReason: "stop", usage: { cachedPromptTokens: 10, cacheMissPromptTokens: 0 } }),
    ])).providerCache;
    expect(full).toMatchObject({ status: "reported", hitRate: 1 });

    const partial = projectSession(mergeAgentEvents(createEventLedger(SESSION), [
      durable(1, "model.completed", { iteration: 1, finishReason: "stop", usage: { promptTokens: 10, cachedPromptTokens: 8 } }),
    ])).providerCache;
    expect(partial).toMatchObject({ status: "partial", cachedPromptTokens: 8 });
    expect(partial).not.toHaveProperty("hitRate");

    const unreported = projectSession(mergeAgentEvents(createEventLedger(SESSION), [
      durable(1, "model.completed", { iteration: 1, finishReason: "stop", usage: { totalTokens: 10 } }),
    ])).providerCache;
    expect(unreported).toEqual({ status: "unreported" });
  });

  it("projects current limits without inventing a model request budget", () => {
    let state = createEventLedger(SESSION);
    state = mergeAgentEvent(state, durable(1, "run.started", {
      promptPreview: "go",
      limits: { maxToolCalls: 300, maxDurationMs: 600000 },
    }));

    const projection = projectRun(state, RUN);
    expect(projection.maxModelRequests).toBeUndefined();
    expect(projection.maxToolCalls).toBe(300);
  });

  it("projects Plan Mode phases, proposal identity and independent budgets", () => {
    const planId = id(401);
    const approvalId = id(402);
    let state = createEventLedger(SESSION);
    state = mergeAgentEvent(state, durable(1, "run.started", {
      promptPreview: "go",
      planningEnabled: true,
      limits: { maxIterations: 60, maxToolCalls: 120, maxDurationMs: 600000 },
    }));
    state = mergeAgentEvent(state, live(1, "计划草稿"));
    state = mergeAgentEvent(state, durable(2, "model.requested", { iteration: 1, modelProfileId: "test" }));
    state = mergeAgentEvent(state, durable(3, "model.completed", { iteration: 1, finishReason: "stop" }));
    state = mergeAgentEvent(state, durable(4, "plan.proposed", { planId, approvalId, content: "1. 检查\n2. 修改" }));
    expect(projectRun(state, RUN)).toMatchObject({
      planningEnabled: true,
      phase: "awaiting_plan_approval",
      status: "awaiting_plan_approval",
      modelRequests: 1,
      toolCalls: 0,
      maxModelRequests: 60,
      maxToolCalls: 120,
      pendingPlan: { planId, approvalId, content: "1. 检查\n2. 修改" },
      pendingApprovalIds: [],
    });
    expect(projectRun(state, RUN).assistantDraft).toBe("");
    state = mergeAgentEvent(state, durable(5, "plan.approval.resolved", { planId, approvalId, approved: true }));
    state = mergeAgentEvent(state, durable(6, "tool.requested", { toolCallId: id(403), toolName: "read_file", publicArguments: { path: "a" }, argumentsTruncated: false }));
    const executing = projectRun(state, RUN);
    expect(executing).toMatchObject({ phase: "executing", status: "running", toolCalls: 1 });
    expect(executing).not.toHaveProperty("pendingPlan");
  });

  it("projects unresolved approvals until they are resolved", () => {
    const approvalId = id(301);
    const callId = id(302);
    let state = createEventLedger(SESSION);
    state = mergeAgentEvent(state, durable(1, "approval.required", { approvalId, toolCallId: callId, reason: "install", toolSummary: "pnpm install" }));
    expect(projectRun(state, RUN).status).toBe("awaiting_approval");
    expect(projectRun(state, RUN).pendingApprovalIds).toEqual([approvalId]);
    state = mergeAgentEvent(state, durable(2, "approval.resolved", { approvalId, approved: false }));
    expect(projectRun(state, RUN).pendingApprovalIds).toEqual([]);
  });

  it("projects a rejected final response as a bounded Chinese restatement", () => {
    let state = createEventLedger(SESSION);
    state = mergeAgentEvent(state, durable(1, "run.started", {
      promptPreview: "go",
      limits: { maxIterations: 60, maxToolCalls: 120, maxDurationMs: 600000 },
    }));
    state = mergeAgentEvent(state, durable(2, "model.requested", {
      iteration: 1,
      modelProfileId: "deepseek",
    }));
    state = mergeAgentEvent(state, durable(3, "model.completed", {
      iteration: 1,
      finishReason: "stop",
    }));
    state = mergeAgentEvent(state, durable(4, "model.output.rejected", {
      iteration: 1,
      reason: "language_mismatch",
      action: "retry",
      retryAttempt: 1,
      contentCharacters: 36,
      contentSha256: "a".repeat(64),
    }));

    expect(projectRun(state, RUN)).toMatchObject({
      status: "restating_output",
      modelRequests: 1,
      iteration: 1,
      assistantDraft: "",
    });
  });
});
