import { describe, expect, it } from "vitest";

import { AgentEventSchema, type AgentEvent } from "@/lib/domain";
import { buildTranscriptItems } from "@/lib/client/transcript";

const SESSION = "00000000-0000-4000-8000-000000000001";
const RUN = "00000000-0000-4000-8000-000000000010";
const OTHER_RUN = "00000000-0000-4000-8000-000000000011";
const CALL = "00000000-0000-4000-8000-000000000020";
const APPROVAL = "00000000-0000-4000-8000-000000000021";

function uuid(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function durable(seq: number, type: string, data: object, runId = RUN): AgentEvent {
  return AgentEventSchema.parse({
    protocolVersion: 1,
    durable: true,
    id: uuid(100 + seq),
    seq,
    sessionId: SESSION,
    runId,
    type,
    createdAt: `2026-08-28T00:00:${String(seq).padStart(2, "0")}.000Z`,
    data,
  });
}

function live(
  streamSeq: number,
  content: string,
  runId = RUN,
  iteration?: number,
): AgentEvent {
  return AgentEventSchema.parse({
    protocolVersion: 1,
    durable: false,
    id: uuid(500 + streamSeq),
    streamSeq,
    sessionId: SESSION,
    runId,
    type: "assistant.delta",
    createdAt: "2026-08-28T00:00:20.000Z",
    data: { content, ...(iteration === undefined ? {} : { iteration }) },
  });
}

describe("transcript projection", () => {
  it("pairs a model request and completion into one round item", () => {
    const items = buildTranscriptItems([
      durable(1, "model.requested", { iteration: 1, modelProfileId: "deepseek" }),
      durable(3, "model.completed", { iteration: 1, finishReason: "tool_calls", usage: { totalTokens: 42 } }),
    ]);
    expect(items).toEqual([
      expect.objectContaining({
        type: "round",
        iteration: 1,
        modelProfileId: "deepseek",
        finishReason: "tool_calls",
        durationMs: 2000,
        usage: { totalTokens: 42 },
      }),
    ]);
  });

  it("keeps an incomplete model round visible", () => {
    expect(buildTranscriptItems([
      durable(1, "model.requested", { iteration: 2, modelProfileId: "generic" }),
    ])).toEqual([expect.objectContaining({ type: "round", iteration: 2, completedAt: undefined })]);
  });

  it("groups a tool lifecycle at its first event and preserves approval facts", () => {
    const items = buildTranscriptItems([
      durable(1, "tool.requested", { toolCallId: CALL, toolName: "run_process", publicArguments: { program: "pnpm" }, argumentsTruncated: false }),
      durable(2, "approval.required", { approvalId: APPROVAL, toolCallId: CALL, reason: "unknown", toolSummary: "pnpm run slow" }),
      durable(3, "approval.resolved", { approvalId: APPROVAL, approved: false, reason: "拒绝" }),
      durable(4, "tool.result", { toolCallId: CALL, toolName: "run_process", result: { ok: false, summary: "用户拒绝", error: { code: "TOOL_APPROVAL_REJECTED", message: "用户拒绝", recoverable: true } } }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "tool", card: { toolCallId: CALL, status: "rejected", approval: { approved: false, resolvedReason: "拒绝" } } });
  });

  it("projects messages and one ordered live draft per run", () => {
    const items = buildTranscriptItems([
      durable(1, "user.message", { content: "开始" }),
      durable(2, "assistant.message", { content: "先检查", kind: "intermediate" }),
      live(2, "好"),
      live(1, "你"),
      live(1, "另一个", OTHER_RUN),
    ]);
    expect(items.map((item) => item.type)).toEqual(["message", "message", "assistant_draft", "assistant_draft"]);
    expect(items[2]).toMatchObject({ type: "assistant_draft", runId: RUN, content: "你好" });
    expect(items[3]).toMatchObject({ type: "assistant_draft", runId: OTHER_RUN, content: "另一个" });
  });

  it("lets a durable assistant message replace a stale live draft", () => {
    const items = buildTranscriptItems([
      live(1, "完成"),
      durable(1, "assistant.message", { content: "完成", kind: "final" }),
    ]);
    expect(items).toEqual([expect.objectContaining({ type: "message", role: "assistant", content: "完成", kind: "final" })]);
  });

  it("keeps run and context terminal facts as compact statuses", () => {
    const items = buildTranscriptItems([
      durable(1, "run.started", { promptPreview: "开始", limits: { maxIterations: 30, maxDurationMs: 600000 } }),
      durable(2, "context.compacted", { throughSeq: 1, summary: "摘要", retainedRange: { fromSeq: 2, toSeq: 2 } }),
      durable(3, "run.failed", { error: { code: "TEST", message: "失败", recoverable: true }, iterations: 1 }),
    ]);
    expect(items.map((item) => item.type)).toEqual(["status", "status", "status"]);
    expect(items[2]).toMatchObject({ type: "status", eventType: "run.failed", tone: "error" });
  });

  it("projects fallback compaction as a warning without inventing another event", () => {
    const items = buildTranscriptItems([
      durable(1, "context.compacted", {
        throughSeq: 1,
        summary: "绝不能在界面显示的摘要",
        retainedRange: { fromSeq: 2, toSeq: 2 },
        strategy: "deterministic_fallback",
        fallbackReason: "model_timeout",
      }),
    ]);
    expect(items).toEqual([
      expect.objectContaining({
        type: "status",
        eventType: "context.compacted",
        tone: "warning",
      }),
    ]);
  });

  it("projects a durable plan and folds its independent resolution into one text item", () => {
    const planId = uuid(601);
    const approvalId = uuid(602);
    const items = buildTranscriptItems([
      durable(1, "plan.proposed", { planId, approvalId, content: "## 计划\n\n1. 检查\n2. 测试" }),
      durable(2, "plan.approval.resolved", { planId, approvalId, approved: true, reason: "开始" }),
    ]);
    expect(items).toEqual([expect.objectContaining({
      type: "plan",
      planId,
      approvalId,
      approved: true,
      resolvedReason: "开始",
    })]);
  });

  it("projects language rejection as a warning without rejected content", () => {
    const items = buildTranscriptItems([
      durable(1, "model.output.rejected", {
        iteration: 1,
        reason: "language_mismatch",
        action: "retry",
        retryAttempt: 1,
        contentCharacters: 43,
        contentSha256: "b".repeat(64),
      }),
      durable(2, "model.output.rejected", {
        iteration: 2,
        reason: "language_mismatch",
        action: "content_suppressed",
        retryAttempt: 0,
        contentCharacters: 29,
        contentSha256: "c".repeat(64),
      }),
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        type: "status",
        eventType: "model.output.rejected",
        tone: "warning",
      }),
      expect.objectContaining({
        type: "status",
        eventType: "model.output.rejected",
        tone: "warning",
      }),
    ]);
    expect(JSON.stringify(items)).not.toContain("rejected content");
  });

  it("projects completion-evidence rejection as a warning and removes its live draft", () => {
    const items = buildTranscriptItems([
      live(1, "尚未验证完成。", RUN, 2),
      durable(1, "completion.evidence.rejected", {
        iteration: 2,
        missing: ["post_change_verification"],
        correctionAttempt: 1,
      }),
    ]);
    expect(items).toEqual([
      expect.objectContaining({
        type: "status",
        eventType: "completion.evidence.rejected",
        tone: "warning",
      }),
    ]);
  });

  it("projects write-dependency rejection as a warning and removes its live draft", () => {
    const items = buildTranscriptItems([
      live(1, "目录已经处理。", RUN, 2),
      durable(1, "write.dependency.rejected", {
        iteration: 2,
        pendingParents: ["server"],
        correctionAttempt: 1,
      }),
    ]);
    expect(items).toEqual([
      expect.objectContaining({
        type: "status",
        eventType: "write.dependency.rejected",
        tone: "warning",
      }),
    ]);
  });
});
