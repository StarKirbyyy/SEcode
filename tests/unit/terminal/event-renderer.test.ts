import { describe, expect, it } from "vitest";

import { INITIAL_TERMINAL_RENDER_STATE, renderAgentEvent } from "@/lib/terminal/event-renderer";
import { agentEvent, RUN_ID, SESSION_ID } from "./helpers";

describe("agent event renderer", () => {
  it("renders live deltas as one stream and deduplicates durable assistant content", () => {
    const first = renderAgentEvent(agentEvent("assistant.delta", { content: "你" }), INITIAL_TERMINAL_RENDER_STATE);
    expect(first.frames.map((frame) => [frame.mode, frame.text])).toEqual([["append", "智能体："], ["append", "你"]]);
    const second = renderAgentEvent(agentEvent("assistant.delta", { content: "好" }, { streamSeq: 2 }), first.state);
    expect(second.frames).toEqual([{ channel: "stdout", mode: "append", text: "好" }]);
    const durable = renderAgentEvent(agentEvent("assistant.message", { content: "你好", kind: "final" }), second.state);
    expect(durable.frames).toEqual([{ channel: "stdout", mode: "line", text: "" }]);
    expect(durable.state.lineOpen).toBe(false);
  });

  it("closes a stream before a tool event and prints public arguments only", () => {
    const live = renderAgentEvent(agentEvent("assistant.delta", { content: "查找" }));
    const tool = renderAgentEvent(agentEvent("tool.requested", {
      toolCallId: "00000000-0000-4000-8000-000000000004",
      toolName: "read_file",
      publicArguments: { path: "src/a.ts" },
      argumentsTruncated: false,
    }), live.state);
    expect(tool.frames[0]).toMatchObject({ mode: "line", text: "" });
    expect(tool.frames[1]?.text).toContain('read_file {"path":"src/a.ts"}');
  });

  it("renders result, approval, compaction and terminal events safely without summary body", () => {
    const approval = renderAgentEvent(agentEvent("approval.required", {
      approvalId: "00000000-0000-4000-8000-000000000005",
      toolCallId: "00000000-0000-4000-8000-000000000004",
      reason: "需要确认",
      toolSummary: "运行安装",
    }));
    expect(approval.frames[0]).toMatchObject({ channel: "stderr" });

    const result = renderAgentEvent(agentEvent("tool.result", {
      toolCallId: "00000000-0000-4000-8000-000000000004",
      toolName: "read_file",
      result: { ok: true, summary: "读取完成", output: "内容", metadata: { lines: 1 } },
    }));
    expect(result.frames[0]?.text).toContain("内容");
    expect(result.frames[0]?.text).toContain('{"lines":1}');

    const compacted = renderAgentEvent(agentEvent("context.compacted", {
      throughSeq: 20,
      summary: "绝不能显示的摘要正文",
      retainedRange: { fromSeq: 21, toSeq: 30 },
    }));
    expect(compacted.frames[0]?.text).not.toContain("绝不能显示");
    expect(compacted.frames[0]?.text).toContain("21–30");

    const failed = renderAgentEvent(agentEvent("run.failed", { iterations: 2, error: { code: "AGENT_INTERNAL_ERROR", message: "失败", recoverable: false } }));
    expect(failed.frames[0]).toMatchObject({ channel: "stderr" });
  });

  it("renders creation and model usage without private usage fields", () => {
    const created = renderAgentEvent(agentEvent("session.created", {
      session: { id: SESSION_ID, title: "测试", workspacePath: "/tmp/work", modelProfileId: "deepseek", status: "idle", createdAt: "2026-08-28T00:00:00.000Z", updatedAt: "2026-08-28T00:00:00.000Z" },
    }));
    expect(created.frames[0]?.text).toContain("测试");
    const completed = renderAgentEvent(agentEvent("model.completed", {
      iteration: 1, finishReason: "stop", usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
    }));
    expect(completed.frames[0]?.text).toContain("总计 5");
    expect(completed.frames[0]?.text).not.toContain("reasoning");
    expect(RUN_ID).toBeTruthy();
  });
});
