import { describe, expect, it } from "vitest";

import { ChatMessageSchema } from "@/lib/domain";
import { projectContextHistory } from "@/lib/context/history-projector";
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
      "system", "system", "user", "assistant", "user",
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

  it("is deterministic and returns frozen projections", () => {
    const first = projectContextHistory(toolHistory());
    const second = projectContextHistory(toolHistory());
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.runs)).toBe(true);
    expect(first.activeRunId).toBe(RUN_ID);
  });
});
