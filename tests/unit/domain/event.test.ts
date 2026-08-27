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
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
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
    },
    12,
  ),
  durable("run.completed", { iterations: 2, durationMs: 1_500 }, 13),
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

  it("requires seq and a run ID for run-scoped events", () => {
    const event = durableFixtures[1];
    expect(
      DurableAgentEventSchema.safeParse({ ...event, seq: undefined }).success,
    ).toBe(false);
    expect(
      DurableAgentEventSchema.safeParse({ ...event, runId: undefined }).success,
    ).toBe(false);
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
    const durableEvent = AgentEventSchema.parse(durableFixtures[12]);
    const liveEvent = AgentEventSchema.parse(liveFixture);

    expect(isDurableEvent(durableEvent)).toBe(true);
    expect(isDurableEvent(liveEvent)).toBe(false);
    expect(isTerminalRunEvent(durableEvent)).toBe(true);
    expect(isTerminalRunEvent(liveEvent)).toBe(false);
  });
});
