import { describe, expect, it } from "vitest";

import { ChatMessageSchema } from "@/lib/domain";
import {
  appendContextHistoryEvents,
  createContextHistoryProjection,
  projectContextHistory,
  snapshotContextHistory,
} from "@/lib/context/history-projector";
import { renderContextMessages } from "@/lib/context/message-renderer";

import {
  APPROVAL_ID,
  RUN_ID,
  SECOND_RUN_ID,
  SECOND_TOOL_CALL_ID,
  SESSION_ID,
  TOOL_CALL_ID,
  activeRunPrefix,
  contextEvent,
  runStarted,
  sessionCreated,
} from "./helpers";

function toolHistory() {
  return [
    ...activeRunPrefix("读取并修改文件"),
    contextEvent(4, "model.requested", {
      iteration: 1,
      modelProfileId: "deepseek",
    }),
    contextEvent(5, "model.completed", {
      iteration: 1,
      finishReason: "tool_calls",
    }),
    contextEvent(6, "assistant.message", {
      kind: "intermediate",
      content: "先读取文件",
    }),
    contextEvent(7, "tool.requested", {
      toolCallId: TOOL_CALL_ID,
      toolName: "read_file",
      publicArguments: { path: "src/a.ts" },
      argumentsTruncated: false,
    }),
    contextEvent(8, "tool.requested", {
      toolCallId: SECOND_TOOL_CALL_ID,
      toolName: "search_text",
      publicArguments: { query: "TODO" },
      argumentsTruncated: false,
    }),
    contextEvent(9, "approval.required", {
      approvalId: APPROVAL_ID,
      toolCallId: TOOL_CALL_ID,
      reason: "需要确认",
      toolSummary: "读取文件",
    }),
    contextEvent(10, "approval.resolved", {
      approvalId: APPROVAL_ID,
      approved: true,
      reason: "允许",
    }),
    contextEvent(11, "tool.started", {
      toolCallId: TOOL_CALL_ID,
      toolName: "read_file",
    }),
    contextEvent(12, "tool.result", {
      toolCallId: TOOL_CALL_ID,
      toolName: "read_file",
      result: { ok: true, summary: "读取成功", output: "export const a = 1;" },
    }),
    contextEvent(13, "tool.result", {
      toolCallId: SECOND_TOOL_CALL_ID,
      toolName: "search_text",
      result: {
        ok: false,
        summary: "未找到",
        error: { code: "NO_MATCH", message: "没有匹配", recoverable: true },
      },
    }),
  ];
}

describe("context history projection", () => {
  it("renders invalid tool history as one bounded correction instead of tool protocol", () => {
    const events = [
      ...activeRunPrefix("修复无效调用"),
      contextEvent(4, "model.requested", { iteration: 1, modelProfileId: "longcat" }),
      contextEvent(5, "model.completed", { iteration: 1, finishReason: "tool_calls" }),
      contextEvent(6, "tool.requested", {
        toolCallId: TOOL_CALL_ID,
        toolName: "invalid_tool_call",
        publicArguments: {
          name: "run_process",
          rawArgumentsPreview: "SECRET_ABSOLUTE_/private/tmp/x",
          errorCode: "MODEL_INVALID_TOOL_CALL",
        },
        argumentsTruncated: true,
      }),
      contextEvent(7, "tool.result", {
        toolCallId: TOOL_CALL_ID,
        toolName: "invalid_tool_call",
        result: {
          ok: false,
          summary: "模型生成了无法验证的工具调用",
          error: {
            code: "MODEL_INVALID_TOOL_CALL",
            message: "模型生成了无法验证的工具调用",
            recoverable: true,
            details: { index: 0, reason: "invalid_arguments" },
          },
        },
      }),
    ];

    const history = projectContextHistory(events);
    const messages = renderContextMessages({
      history,
      workspacePath: "/tmp/project",
      rounds: history.rounds,
    });
    const serialized = JSON.stringify(messages);
    expect(messages.filter((message) => message.role === "tool")).toHaveLength(0);
    expect(serialized).not.toContain("invalid_tool_call");
    expect(serialized).not.toContain("SECRET_ABSOLUTE_");
    expect(messages.filter((message) =>
      message.role === "system" && message.content.includes("未通过工具校验")
    )).toHaveLength(1);
    expect(serialized).toContain("invalid_arguments");
  });

  it("omits rejected stop content while preserving model request numbering", () => {
    const events = [
      ...activeRunPrefix("检查项目"),
      contextEvent(4, "model.requested", { iteration: 1, modelProfileId: "deepseek" }),
      contextEvent(5, "model.completed", { iteration: 1, finishReason: "stop" }),
      contextEvent(6, "model.output.rejected", {
        iteration: 1,
        reason: "language_mismatch",
        action: "retry",
        retryAttempt: 1,
        contentCharacters: 40,
        contentSha256: "a".repeat(64),
      }),
      contextEvent(7, "model.requested", { iteration: 2, modelProfileId: "deepseek" }),
      contextEvent(8, "model.completed", { iteration: 2, finishReason: "stop" }),
      contextEvent(9, "assistant.message", { kind: "final", content: "已完成检查" }),
    ];

    const history = projectContextHistory(events);
    expect(history.rounds).toMatchObject([
      { kind: "final", iteration: 2, content: "已完成检查" },
    ]);
    const messages = renderContextMessages({
      history,
      workspacePath: "/tmp/project",
      rounds: history.rounds,
    });
    expect(JSON.stringify(messages)).not.toContain("language_mismatch");
    expect(JSON.stringify(messages)).not.toContain("a".repeat(64));
  });

  it("projects completion-evidence rejection as a finite same-run diagnostic", () => {
    const events = [
      ...activeRunPrefix("修改项目"),
      contextEvent(4, "model.requested", { iteration: 1, modelProfileId: "deepseek" }),
      contextEvent(5, "model.completed", { iteration: 1, finishReason: "stop" }),
      contextEvent(6, "completion.evidence.rejected", {
        iteration: 1,
        missing: ["post_change_verification"],
        correctionAttempt: 1,
      }),
      contextEvent(7, "model.requested", { iteration: 2, modelProfileId: "deepseek" }),
    ];
    const history = projectContextHistory(events);
    expect(history.rounds).toEqual([]);
    expect(history.unresolvedDiagnostics).toMatchObject([{
      kind: "completion_evidence",
      code: "POST_CHANGE_VERIFICATION_MISSING",
      seq: 6,
    }]);
  });

  it("projects write-dependency rejection with relative parents only", () => {
    const events = [
      ...activeRunPrefix("修改项目"),
      contextEvent(4, "model.requested", { iteration: 1, modelProfileId: "deepseek" }),
      contextEvent(5, "model.completed", { iteration: 1, finishReason: "stop" }),
      contextEvent(6, "write.dependency.rejected", {
        iteration: 1,
        pendingParents: ["client", "server"],
        correctionAttempt: 1,
      }),
      contextEvent(7, "model.requested", { iteration: 2, modelProfileId: "deepseek" }),
    ];
    const history = projectContextHistory(events);
    expect(history.unresolvedDiagnostics).toMatchObject([{
      kind: "tool_error",
      code: "WRITE_DEPENDENCY_UNRESOLVED",
      seq: 6,
    }]);
    expect(JSON.stringify(history)).toContain("client、server");
    expect(JSON.stringify(history)).not.toContain("/Users/");
  });

  it("maps a durable approved plan as a proposal and finite user decision", () => {
    const planId = "60000000-0000-4000-8000-000000000001";
    const planApprovalId = "60000000-0000-4000-8000-000000000002";
    const events = [
      sessionCreated(),
      runStarted(2, RUN_ID, true),
      contextEvent(3, "user.message", { content: "先计划" }),
      contextEvent(4, "model.requested", { iteration: 1, modelProfileId: "deepseek" }),
      contextEvent(5, "model.completed", { iteration: 1, finishReason: "stop" }),
      contextEvent(6, "plan.proposed", {
        planId,
        approvalId: planApprovalId,
        content: "1. 修改文件\n2. 运行测试",
      }),
      contextEvent(7, "plan.approval.resolved", {
        planId,
        approvalId: planApprovalId,
        approved: true,
      }),
    ];
    const history = projectContextHistory(events);
    expect(history.activePhase).toBe("executing");
    expect(history.runs[0]).toMatchObject({
      planningEnabled: true,
      phase: "executing",
      plan: { planId, approvalId: planApprovalId, approved: true },
      rounds: [{ kind: "plan", content: "1. 修改文件\n2. 运行测试" }],
    });
    const messages = renderContextMessages({
      history,
      workspacePath: "/tmp/project",
      rounds: history.rounds,
    });
    expect(messages[0]).toMatchObject({ role: "system" });
    expect(messages[0]!.content).toContain("当前阶段：已批准执行");
    expect(messages.some((message) =>
      message.role === "assistant" && message.content?.includes("修改文件")
    )).toBe(true);
    expect(messages.some((message) =>
      message.role === "user" && message.content.includes("我批准上述持久化计划提案")
    )).toBe(true);
  });

  it("projects a final round and a following active goal", () => {
    const events = [
      sessionCreated(),
      runStarted(2),
      contextEvent(3, "user.message", { content: "第一个任务" }),
      contextEvent(4, "model.requested", { iteration: 1, modelProfileId: "deepseek" }),
      contextEvent(5, "model.completed", { iteration: 1, finishReason: "stop" }),
      contextEvent(6, "assistant.message", { kind: "final", content: "已完成" }),
      contextEvent(7, "run.completed", { iterations: 1, durationMs: 10 }),
      runStarted(8, SECOND_RUN_ID),
      contextEvent(9, "user.message", { content: "继续检查" }, SECOND_RUN_ID),
    ];
    const history = projectContextHistory(events, SESSION_ID);
    expect(history.initialGoal).toBe("第一个任务");
    expect(history.activeRunId).toBe(SECOND_RUN_ID);
    expect(history.rounds).toMatchObject([
      { kind: "final", iteration: 1, content: "已完成", startSeq: 4, endSeq: 6 },
    ]);
    const messages = renderContextMessages({
      history,
      workspacePath: "/tmp/project",
      rounds: history.rounds,
    });
    expect(ChatMessageSchema.array().safeParse(messages).success).toBe(true);
    expect(messages.map((message) => message.role)).toEqual([
      "system", "system", "user", "assistant", "user", "system", "system",
    ]);
  });

  it("keeps a multi-tool round atomic and annotates approval", () => {
    const history = projectContextHistory(toolHistory(), SESSION_ID);
    expect(history.rounds).toHaveLength(1);
    expect(history.rounds[0]).toMatchObject({
      kind: "tools",
      startSeq: 4,
      endSeq: 13,
      tools: [
        { toolCallId: TOOL_CALL_ID, approval: { approved: true, reason: "允许" } },
        { toolCallId: SECOND_TOOL_CALL_ID },
      ],
    });
    expect(history.unresolvedDiagnostics).toMatchObject([
      { kind: "tool_error", code: "NO_MATCH", seq: 13 },
    ]);
    const messages = renderContextMessages({
      history,
      workspacePath: "/tmp/project",
      rounds: history.rounds,
    });
    const assistant = messages.find(
      (message) => message.role === "assistant" && message.toolCalls !== undefined,
    );
    expect(assistant).toMatchObject({ toolCalls: [{ id: TOOL_CALL_ID }, { id: SECOND_TOOL_CALL_ID }] });
    const toolMessages = messages.filter((message) => message.role === "tool");
    expect(toolMessages).toHaveLength(2);
    expect(JSON.parse(toolMessages[0].content)).toMatchObject({
      approval: { approved: true, reason: "允许" },
    });
  });

  it("clears a matching unresolved tool error after success", () => {
    const events = [
      ...toolHistory(),
      contextEvent(14, "model.requested", { iteration: 2, modelProfileId: "deepseek" }),
      contextEvent(15, "model.completed", { iteration: 2, finishReason: "tool_calls" }),
      contextEvent(16, "tool.requested", {
        toolCallId: "30000000-0000-4000-8000-000000000003",
        toolName: "search_text",
        publicArguments: { query: "TODO" },
        argumentsTruncated: false,
      }),
      contextEvent(17, "tool.result", {
        toolCallId: "30000000-0000-4000-8000-000000000003",
        toolName: "search_text",
        result: { ok: true, summary: "找到匹配", output: "src/a.ts:1" },
      }),
    ];
    expect(projectContextHistory(events).unresolvedDiagnostics).toHaveLength(0);
  });

  it("does not fabricate an incomplete interrupted tool round", () => {
    const events = [
      ...activeRunPrefix(),
      contextEvent(4, "model.requested", { iteration: 1, modelProfileId: "deepseek" }),
      contextEvent(5, "model.completed", { iteration: 1, finishReason: "tool_calls" }),
      contextEvent(6, "tool.requested", {
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
        publicArguments: { path: "a.ts" },
        argumentsTruncated: false,
      }),
      contextEvent(7, "run.interrupted", {
        reason: "进程退出",
        lastStableSeq: 6,
      }),
      runStarted(8, SECOND_RUN_ID),
      contextEvent(9, "user.message", { content: "继续" }, SECOND_RUN_ID),
    ];
    const history = projectContextHistory(events);
    expect(history.rounds).toHaveLength(0);
    expect(history.unresolvedDiagnostics).toMatchObject([
      { kind: "run_terminal", message: "进程退出" },
    ]);
  });

  it("rejects orphan results and regressing compactions", () => {
    expect(() => projectContextHistory([
      ...activeRunPrefix(),
      contextEvent(4, "tool.result", {
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
        result: { ok: true, summary: "ok" },
      }),
    ])).toThrow("消息回合约束");

    const valid = [
      ...activeRunPrefix(),
      contextEvent(4, "context.compacted", {
        throughSeq: 1,
        summary: "old",
        retainedRange: { fromSeq: 2, toSeq: 3 },
      }),
    ];
    expect(() => projectContextHistory([
      ...valid,
      contextEvent(5, "context.compacted", {
        throughSeq: 1,
        summary: "new",
        retainedRange: { fromSeq: 2, toSeq: 4 },
      }),
    ])).toThrow("消息回合约束");
  });

  it("preserves a fallback compaction strategy without exposing another summary source", () => {
    const history = projectContextHistory([
      ...activeRunPrefix(),
      contextEvent(4, "context.compacted", {
        throughSeq: 1,
        summary: "SECODE_CONTEXT_SUMMARY_V1\n本地降级摘要",
        retainedRange: { fromSeq: 2, toSeq: 3 },
        strategy: "deterministic_fallback",
        fallbackReason: "model_timeout",
      }),
    ]);
    expect(history.latestCompaction).toMatchObject({
      strategy: "deterministic_fallback",
      fallbackReason: "model_timeout",
    });
  });

  it("is deterministic and returns frozen projections", () => {
    const first = projectContextHistory(toolHistory());
    const second = projectContextHistory(toolHistory());
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.runs)).toBe(true);
    expect(first.activeRunId).toBe(RUN_ID);
  });

  it("projects only appended tails with the same snapshot as a cold build", () => {
    const events = toolHistory();
    const projection = createContextHistoryProjection(SESSION_ID);
    appendContextHistoryEvents(projection, events.slice(0, 8));
    appendContextHistoryEvents(projection, events.slice(8));

    expect(snapshotContextHistory(projection)).toEqual(
      projectContextHistory(events, SESSION_ID),
    );
    expect(() => appendContextHistoryEvents(projection, [events.at(-1)!]))
      .toThrow("消息回合约束");
  });
});
