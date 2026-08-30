import { describe, expect, it } from "vitest";

import {
  AgentEventSchema,
  DurableAgentEventSchema,
  LiveAgentEventSchema,
  isDurableEvent,
  isTerminalRunEvent,
  type JsonObject,
} from "@/lib/domain";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const TOOL_CALL_ID = "33333333-3333-4333-8333-333333333333";
const APPROVAL_ID = "44444444-4444-4444-8444-444444444444";
const PLAN_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_APPROVAL_ID = "66666666-6666-4666-8666-666666666666";
const CREATED_AT = "2026-08-27T00:00:00Z";

function durable(type: string, data: JsonObject, seq: number) {
  return {
    protocolVersion: 1,
    durable: true,
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    seq,
    sessionId: SESSION_ID,
    runId: RUN_ID,
    type,
    createdAt: CREATED_AT,
    data,
  };
}

const session = {
  id: SESSION_ID,
  title: "修复测试",
  workspacePath: "/tmp/project",
  modelProfileId: "deepseek-default",
  status: "idle",
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

const durableFixtures = [
  {
    ...durable("session.created", { session }, 1),
    runId: undefined,
  },
  durable(
    "run.started",
    {
      promptPreview: "修复测试",
      limits: { maxIterations: 30, maxDurationMs: 600_000 },
    },
    2,
  ),
  durable("user.message", { content: "修复测试" }, 3),
  durable(
    "model.requested",
    { iteration: 1, modelProfileId: "deepseek-default" },
    4,
  ),
  durable(
    "model.completed",
    {
      iteration: 1,
      finishReason: "tool_calls",
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        reasoningTokens: 2,
        cachedPromptTokens: 8,
        cacheMissPromptTokens: 2,
      },
      contextCache: {
        status: "warm",
        reusedEvents: 4,
        tailEvents: 1,
        avoidedBytes: 512,
        buildMilliseconds: 3,
      },
    },
    5,
  ),
  durable(
    "assistant.message",
    { content: "我先检查文件。", kind: "intermediate" },
    6,
  ),
  durable(
    "tool.requested",
    {
      toolCallId: TOOL_CALL_ID,
      toolName: "read_file",
      publicArguments: { path: "src/index.ts" },
      argumentsTruncated: false,
    },
    7,
  ),
  durable(
    "approval.required",
    {
      approvalId: APPROVAL_ID,
      toolCallId: TOOL_CALL_ID,
      reason: "需要用户确认",
      toolSummary: "安装依赖",
    },
    8,
  ),
  durable(
    "approval.resolved",
    { approvalId: APPROVAL_ID, approved: true },
    9,
  ),
  durable(
    "tool.started",
    { toolCallId: TOOL_CALL_ID, toolName: "read_file" },
    10,
  ),
  durable(
    "tool.result",
    {
      toolCallId: TOOL_CALL_ID,
      toolName: "read_file",
      result: { ok: true, summary: "读取成功", output: "const value = 1;" },
    },
    11,
  ),
  durable(
    "context.compacted",
    {
      throughSeq: 6,
      summary: "已检查入口文件",
      retainedRange: { fromSeq: 7, toSeq: 11 },
      strategy: "model",
    },
    12,
  ),
  durable(
    "completion.evidence.rejected",
    {
      iteration: 2,
      missing: ["post_change_verification"],
      correctionAttempt: 1,
      uncoveredScopes: ["client", "server"],
      acceptedKinds: ["lint", "typecheck", "test", "build"],
    },
    13,
  ),
  durable("run.completed", { iterations: 2, durationMs: 1_500 }, 14),
  durable(
    "run.failed",
    {
      error: { code: "MODEL_ERROR", message: "模型失败", recoverable: false },
      iterations: 2,
    },
    14,
  ),
  durable("run.cancelled", { reason: "用户取消", iterations: 1 }, 15),
  durable(
    "run.interrupted",
    { reason: "进程退出", lastStableSeq: 15 },
    16,
  ),
  durable(
    "plan.proposed",
    { planId: PLAN_ID, approvalId: PLAN_APPROVAL_ID, content: "完整计划" },
    17,
  ),
  durable(
    "plan.approval.resolved",
    { planId: PLAN_ID, approvalId: PLAN_APPROVAL_ID, approved: true },
    18,
  ),
  durable(
    "model.output.rejected",
    {
      iteration: 2,
      reason: "language_mismatch",
      action: "retry",
      retryAttempt: 1,
      contentCharacters: 58,
      contentSha256: "a".repeat(64),
    },
    19,
  ),
];

const liveFixture = {
  protocolVersion: 1,
  durable: false,
  id: "99999999-9999-4999-8999-999999999999",
  streamSeq: 1,
  sessionId: SESSION_ID,
  runId: RUN_ID,
  type: "assistant.delta",
  createdAt: CREATED_AT,
  data: { content: "正在" },
};

describe("durable agent events", () => {
  it.each(durableFixtures)("accepts durable event $type", (fixture) => {
    const parsed = DurableAgentEventSchema.parse(fixture);
    expect(
      DurableAgentEventSchema.parse(JSON.parse(JSON.stringify(parsed))),
    ).toEqual(parsed);
  });

  it("accepts legacy/model/fallback compactions and rejects invalid strategy combinations", () => {
    const base = {
      throughSeq: 6,
      summary: "SECODE_CONTEXT_SUMMARY_V1\n已检查入口文件",
      retainedRange: { fromSeq: 7, toSeq: 11 },
    };
    expect(DurableAgentEventSchema.safeParse(durable("context.compacted", base, 20)).success)
      .toBe(true);
    expect(DurableAgentEventSchema.safeParse(durable("context.compacted", {
      ...base,
      strategy: "model",
    }, 20)).success).toBe(true);
    expect(DurableAgentEventSchema.safeParse(durable("context.compacted", {
      ...base,
      strategy: "deterministic_fallback",
      fallbackReason: "model_timeout",
    }, 20)).success).toBe(true);
    expect(DurableAgentEventSchema.safeParse(durable("context.compacted", {
      ...base,
      strategy: "model",
      fallbackReason: "model_timeout",
    }, 20)).success).toBe(false);
    expect(DurableAgentEventSchema.safeParse(durable("context.compacted", {
      ...base,
      strategy: "deterministic_fallback",
      fallbackReason: "private_provider_error",
    }, 20)).success).toBe(false);
  });

  it("requires seq and a run ID for run-scoped events", () => {
    const event = durableFixtures[1];
    expect(
      DurableAgentEventSchema.safeParse({ ...event, seq: undefined }).success,
    ).toBe(false);
    expect(
      DurableAgentEventSchema.safeParse({ ...event, runId: undefined }).success,
    ).toBe(false);
  });

  it("keeps the frozen pre-stage-17 run.started shape readable", () => {
    const legacy = DurableAgentEventSchema.parse(durable(
      "run.started",
      {
        promptPreview: "旧任务",
        limits: { maxIterations: 30, maxDurationMs: 600_000 },
      },
      2,
    ));
    expect(legacy).toMatchObject({
      type: "run.started",
      data: {
        limits: { maxIterations: 30, maxDurationMs: 600_000 },
      },
    });
    if (legacy.type === "run.started") {
      expect(legacy.data.planningEnabled).toBeUndefined();
      expect(legacy.data.limits.maxToolCalls).toBeUndefined();
    }
  });

  it("accepts a new run.started event without a model request limit", () => {
    const current = DurableAgentEventSchema.parse(durable(
      "run.started",
      {
        promptPreview: "新任务",
        limits: { maxToolCalls: 300, maxDurationMs: 600_000 },
      },
      20,
    ));
    expect(current).toMatchObject({
      type: "run.started",
      data: { limits: { maxToolCalls: 300, maxDurationMs: 600_000 } },
    });
    if (current.type === "run.started") {
      expect(current.data.limits.maxIterations).toBeUndefined();
    }
  });

  it("keeps plan events strict and bounded", () => {
    expect(DurableAgentEventSchema.safeParse(durable(
      "plan.proposed",
      { planId: PLAN_ID, approvalId: PLAN_APPROVAL_ID, content: "" },
      20,
    )).success).toBe(false);
    expect(DurableAgentEventSchema.safeParse(durable(
      "plan.approval.resolved",
      { planId: PLAN_ID, approvalId: PLAN_APPROVAL_ID, approved: true, toolCallId: TOOL_CALL_ID },
      21,
    )).success).toBe(false);
  });

  it("keeps rejected model output metadata strict and excludes raw content", () => {
    const valid = durable(
      "model.output.rejected",
      {
        iteration: 1,
        reason: "language_mismatch",
        action: "content_suppressed",
        retryAttempt: 0,
        contentCharacters: 42,
        contentSha256: "b".repeat(64),
      },
      22,
    );
    expect(DurableAgentEventSchema.safeParse(valid).success).toBe(true);
    expect(DurableAgentEventSchema.safeParse({
      ...valid,
      data: { ...valid.data, content: "private rejected text" },
    }).success).toBe(false);
    expect(DurableAgentEventSchema.safeParse({
      ...valid,
      data: { ...valid.data, contentSha256: "short" },
    }).success).toBe(false);
  });

  it("keeps completion evidence fields optional and rejects absolute scopes", () => {
    const legacy = durable("completion.evidence.rejected", {
      iteration: 1,
      missing: ["post_change_verification"],
      correctionAttempt: 1,
    }, 23);
    expect(DurableAgentEventSchema.safeParse(legacy).success).toBe(true);
    expect(DurableAgentEventSchema.safeParse({
      ...legacy,
      data: { ...legacy.data, uncoveredScopes: ["/Users/private/project"] },
    }).success).toBe(false);
    expect(DurableAgentEventSchema.safeParse(durable("write.dependency.rejected", {
      iteration: 1,
      pendingParents: ["/tmp/secret"],
      correctionAttempt: 1,
    }, 24)).success).toBe(false);
  });

  it("rejects live deltas, unknown events, wrong versions and extra fields", () => {
    expect(DurableAgentEventSchema.safeParse(liveFixture).success).toBe(false);
    expect(
      DurableAgentEventSchema.safeParse(durable("unknown.event", {}, 20))
        .success,
    ).toBe(false);
    expect(
      DurableAgentEventSchema.safeParse({
        ...durableFixtures[1],
        protocolVersion: 2,
      }).success,
    ).toBe(false);
    expect(
      DurableAgentEventSchema.safeParse({
        ...durableFixtures[1],
        apiKey: "sk-secret-value",
      }).success,
    ).toBe(false);
  });
});

describe("live and combined agent events", () => {
  it("accepts a delta only as a live event with stream ordering", () => {
    expect(LiveAgentEventSchema.safeParse(liveFixture).success).toBe(true);
    expect(AgentEventSchema.safeParse(liveFixture).success).toBe(true);
    expect(
      LiveAgentEventSchema.safeParse({ ...liveFixture, streamSeq: undefined })
        .success,
    ).toBe(false);
    expect(
      LiveAgentEventSchema.safeParse({ ...liveFixture, runId: undefined }).success,
    ).toBe(false);
  });

  it("provides durable and terminal type guards", () => {
    const durableEvent = AgentEventSchema.parse(
      durableFixtures.find((event) => event.type === "run.completed"),
    );
    const liveEvent = AgentEventSchema.parse(liveFixture);

    expect(isDurableEvent(durableEvent)).toBe(true);
    expect(isDurableEvent(liveEvent)).toBe(false);
    expect(isTerminalRunEvent(durableEvent)).toBe(true);
    expect(isTerminalRunEvent(liveEvent)).toBe(false);
  });
});
