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

    const fallback = renderAgentEvent(agentEvent("context.compacted", {
      throughSeq: 30,
      summary: "绝不能显示的降级摘要正文",
      retainedRange: { fromSeq: 31, toSeq: 40 },
      strategy: "deterministic_fallback",
      fallbackReason: "model_timeout",
    }));
    expect(fallback.frames[0]).toMatchObject({ channel: "stderr" });
    expect(fallback.frames[0]?.text).toContain("本地降级");
    expect(fallback.frames[0]?.text).not.toContain("model_timeout");
    expect(fallback.frames[0]?.text).not.toContain("绝不能显示");

    const failed = renderAgentEvent(agentEvent("run.failed", { iterations: 2, error: { code: "AGENT_INTERNAL_ERROR", message: "失败", recoverable: false } }));
    expect(failed.frames[0]).toMatchObject({ channel: "stderr" });

    const contextFailed = renderAgentEvent(agentEvent("run.failed", {
      iterations: 2,
      error: {
        code: "AGENT_CONTEXT_FAILED",
        message: "模型上下文构建失败",
        recoverable: true,
        details: {
          contextCode: "CONTEXT_BUDGET_EXCEEDED",
          reason: "fallback_over_budget",
          private: "/Users/private/project",
        },
      },
    }));
    expect(contextFailed.frames[0]?.text).toContain("新建 Session 或缩小任务");
    expect(contextFailed.frames[0]?.text).not.toContain("/Users/private");

    const projectedRecentFailure = renderAgentEvent(agentEvent("run.failed", {
      iterations: 0,
      error: {
        code: "AGENT_CONTEXT_FAILED",
        message: "模型上下文构建失败",
        recoverable: true,
        details: {
          contextCode: "CONTEXT_BUDGET_EXCEEDED",
          reason: "projected_recent_rounds_over_budget",
        },
      },
    }));
    expect(projectedRecentFailure.frames[0]?.text).toContain("重复“继续”预计无效");
    expect(projectedRecentFailure.frames[0]?.text).toContain("新建 Session 或缩小任务");
  });

  it("renders creation and model usage without private usage fields", () => {
    const created = renderAgentEvent(agentEvent("session.created", {
      session: { id: SESSION_ID, title: "测试", workspacePath: "/tmp/work", modelProfileId: "deepseek", status: "idle", createdAt: "2026-08-28T00:00:00.000Z", updatedAt: "2026-08-28T00:00:00.000Z" },
    }));
    expect(created.frames[0]?.text).toContain("测试");
    const completed = renderAgentEvent(agentEvent("model.completed", {
      iteration: 1,
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13, reasoningTokens: 2, cachedPromptTokens: 8, cacheMissPromptTokens: 2 },
      contextCache: { status: "warm", reusedEvents: 4, tailEvents: 1, avoidedBytes: 512, buildMilliseconds: 2 },
    }));
    expect(completed.frames[0]?.text).toContain("总计 13");
    expect(completed.frames[0]?.text).toContain("推理 2");
    expect(completed.frames[0]?.text).toContain("命中率 80.0%");
    expect(completed.frames[0]?.text).toContain("本地 Context cache warm");
    expect(RUN_ID).toBeTruthy();
  });

  it("renders an unset model request limit explicitly", () => {
    const started = renderAgentEvent(agentEvent("run.started", {
      promptPreview: "任务",
      limits: { maxToolCalls: 300, maxDurationMs: 600_000 },
    }));
    expect(started.frames[0]?.text).toContain("模型请求上限 未设置");
    expect(started.frames[0]?.text).toContain("工具调用上限 300");
    expect(started.frames[0]?.text).not.toContain("undefined");
  });

  it("renders rejected output as Chinese status without exposing content", () => {
    const retry = renderAgentEvent(agentEvent("model.output.rejected", {
      iteration: 1,
      reason: "language_mismatch",
      action: "retry",
      retryAttempt: 1,
      contentCharacters: 48,
      contentSha256: "d".repeat(64),
    }));
    expect(retry.frames[0]).toMatchObject({ channel: "stderr" });
    expect(retry.frames[0]?.text).toContain("正在请求中文重述（1/2）");
    expect(retry.frames[0]?.text).not.toContain("d".repeat(64));

    const suppressed = renderAgentEvent(agentEvent("model.output.rejected", {
      iteration: 2,
      reason: "language_mismatch",
      action: "content_suppressed",
      retryAttempt: 0,
      contentCharacters: 32,
      contentSha256: "e".repeat(64),
    }));
    expect(suppressed.frames[0]?.text).toContain("工具将按原请求执行一次");
  });

  it("renders plan proposal and resolution as a separate approval flow", () => {
    const planId = "00000000-0000-4000-8000-000000000020";
    const approvalId = "00000000-0000-4000-8000-000000000021";
    const proposed = renderAgentEvent(agentEvent("plan.proposed", {
      planId,
      approvalId,
      content: "1. 检查\n2. 修改\n3. 测试",
    }));
    expect(proposed.frames[0]?.text).toContain("/approve-plan");
    expect(proposed.frames[0]?.text).toContain("1. 检查");
    const resolved = renderAgentEvent(agentEvent("plan.approval.resolved", {
      planId,
      approvalId,
      approved: true,
    }));
    expect(resolved.frames[0]?.text).toContain("继续同一运行");
  });
});
