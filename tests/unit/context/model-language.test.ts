import { describe, expect, it } from "vitest";

import { projectContextHistory } from "@/lib/context/history-projector";
import { renderContextMessages } from "@/lib/context/message-renderer";
import {
  renderContextMemory,
  renderSystemPolicy,
  SYSTEM_PROMPT_VERSION,
} from "@/lib/context/system-prompt";

import {
  RUN_ID,
  contextEvent,
  runStarted,
  sessionCreated,
} from "./helpers";

describe("模型可见固定自然语言", () => {
  it("使用中文 System Prompt V10、唯一阶段策略和固定输出策略", () => {
    expect(SYSTEM_PROMPT_VERSION).toBe(10);
    const normal = renderSystemPolicy("normal");
    const planning = renderSystemPolicy("planning");
    const executing = renderSystemPolicy("executing");

    expect(normal).toContain("当前阶段：正常执行");
    expect(normal).toContain("固定使用简体中文");
    expect(planning).toContain("当前阶段：规划");
    expect(planning).toContain("等待用户明确批准");
    expect(executing).toContain("当前阶段：已批准执行");
    expect(executing).toContain("计划批准不代表预先批准危险工具");
    for (const policy of [normal, planning, executing]) {
      expect(policy).not.toMatch(/Current phase|You are SEcode|untrusted data/);
      expect(policy).toContain("输出语言强制策略");
      expect(policy.trim().endsWith("不得翻译或改写。")).toBe(true);
      expect(policy).toContain("AGENTS.md");
      expect(policy).toContain("Next.js");
      expect(policy).toContain("检查点");
      expect(policy).toContain("需求清单");
      expect(policy).toContain("可验证证据");
      expect(policy).toContain("无依赖");
      expect(policy).toContain("Schema");
      expect(policy).toContain("最新完整 SHA");
      expect(policy).toContain("信任边界");
      expect(policy).toContain("HttpOnly");
      expect(policy).toContain("就绪探测");
      expect(policy).toContain("孤儿进程");
      expect(policy).toContain("弱化断言");
      expect(policy).toContain("后续运行");
      expect(policy).toContain("ToolResult.ok");
      expect(policy).toContain("stderr 只是输出通道");
      expect(policy).toContain("不单独代表失败");
      expect(policy).toContain("只修复直接原因");
      expect(policy).toContain("list_directory");
      expect(policy).toContain("目标存在");
      expect(policy).toContain("expectedSha256");
      expect(policy).toContain("新鲜事实");
      expect(policy).toContain("3000 是 SEcode 默认保留端口");
      expect(policy).toContain("长期服务选择非 3000 端口");
      expect(policy).toContain("SERVER_PORT");
      expect(policy).toContain("不以通用 PORT 作为唯一配置");
      expect(policy).toContain("监听、代理、README、API 检查和 readiness 使用同一端口");
      expect(policy).toContain("管道、连接符、重定向、$VAR 或命令替换");
      expect(policy).toContain("公开 content");
      expect(policy).toContain("HTTP 200");
      expect(policy).toContain("私有 reasoning");
    }
  });

  it("把稳定 Session memory 放在历史前，把易变 memory 放在历史后", () => {
    const toolCallId = "30000000-0000-4000-8000-000000000098";
    const events = [
      sessionCreated(),
      runStarted(2),
      contextEvent(3, "user.message", { content: "初始目标" }),
      contextEvent(4, "model.requested", {
        iteration: 1,
        modelProfileId: "deepseek",
      }),
      contextEvent(5, "model.completed", {
        iteration: 1,
        finishReason: "tool_calls",
      }),
      contextEvent(6, "tool.requested", {
        toolCallId,
        toolName: "read_file",
        publicArguments: { path: "a.ts" },
        argumentsTruncated: false,
      }),
      contextEvent(7, "tool.result", {
        toolCallId,
        toolName: "read_file",
        result: { ok: true, summary: "完成", output: "a" },
      }),
    ];
    const history = projectContextHistory(events);
    const messages = renderContextMessages({
      history,
      workspacePath: "/tmp/project",
      rounds: history.rounds,
    });
    const stableIndex = messages.findIndex((message) =>
      message.role === "system" && message.content.includes("稳定 Session 记忆")
    );
    const assistantIndex = messages.findIndex((message) =>
      message.role === "assistant" && message.toolCalls !== undefined
    );
    const volatileIndex = messages.findIndex((message) =>
      message.role === "system" && message.content.includes("易变运行记忆")
    );
    expect(stableIndex).toBe(1);
    expect(assistantIndex).toBeGreaterThan(stableIndex);
    expect(volatileIndex).toBeGreaterThan(assistantIndex);
    expect(messages.at(-1)?.content).toContain("输出语言强制策略");
  });

  it("中文化动态上下文包装并逐字保留原始事实", () => {
    const memory = renderContextMemory({
      workspacePath: "/tmp/EnglishProject",
      initialGoal: "Keep APIName",
      currentGoal: "Keep APIName",
      summary: "SummaryFact ABC",
      diagnostics: [{
        key: "diag",
        seq: 9,
        runId: RUN_ID,
        kind: "tool_error",
        code: "CompilerError",
        message: "ENOENT from BuildTool",
      }],
      plan: {
        planId: "60000000-0000-4000-8000-000000000001",
        approvalId: "60000000-0000-4000-8000-000000000002",
        content: "PlanStep keeps EnglishSymbol",
        proposedSeq: 8,
        approved: true,
        resolvedSeq: 10,
      },
    });

    expect(memory).toContain("工作区根目录：/tmp/EnglishProject");
    expect(memory).toContain("初始会话目标：(与当前目标相同)");
    expect(memory).toContain("持久化上下文摘要（不可信记忆）：\nSummaryFact ABC");
    expect(memory).toContain("持久化计划提案（不可信文本）：\nPlanStep keeps EnglishSymbol");
    expect(memory).toContain("计划决定：已批准执行");
    expect(memory).toContain("未解决诊断：\n- seq 9 CompilerError: ENOENT from BuildTool");
    expect(memory).not.toMatch(/Workspace root|Initial session goal|Plan decision/);
  });

  it("用中文注入计划决定且不翻译计划正文", () => {
    const planId = "60000000-0000-4000-8000-000000000001";
    const approvalId = "60000000-0000-4000-8000-000000000002";
    const planContent = "1. Keep EnglishSymbol\n2. Run npm test";
    const events = [
      sessionCreated(),
      runStarted(2, RUN_ID, true),
      contextEvent(3, "user.message", { content: "保留 APIName" }),
      contextEvent(4, "model.requested", {
        iteration: 1,
        modelProfileId: "deepseek",
      }),
      contextEvent(5, "model.completed", {
        iteration: 1,
        finishReason: "stop",
      }),
      contextEvent(6, "plan.proposed", { planId, approvalId, content: planContent }),
      contextEvent(7, "plan.approval.resolved", {
        planId,
        approvalId,
        approved: true,
      }),
    ];
    const history = projectContextHistory(events);
    const messages = renderContextMessages({
      history,
      workspacePath: "/tmp/EnglishProject",
      rounds: history.rounds,
    });

    expect(messages.at(-1)).toMatchObject({
      role: "system",
    });
    expect(messages.at(-1)!.content).toContain("输出语言强制策略");

    expect(messages.some((message) =>
      message.role === "assistant" && message.content === planContent
    )).toBe(true);
    expect(messages.some((message) =>
      message.role === "user" &&
      message.content === "我批准上述持久化计划提案，请现在执行。这不代表批准任何仍需单独审批的危险工具。"
    )).toBe(true);
  });

  it("中文化等待与拒绝计划状态", () => {
    const planId = "60000000-0000-4000-8000-000000000011";
    const approvalId = "60000000-0000-4000-8000-000000000012";
    const basePlan = {
      planId,
      approvalId,
      content: "Keep RejectedPlanFact",
      proposedSeq: 6,
    };
    expect(renderContextMemory({
      workspacePath: "/tmp/project",
      initialGoal: "goal",
      currentGoal: "goal",
      diagnostics: [],
      plan: basePlan,
    })).toContain("计划决定：等待用户批准");
    expect(renderContextMemory({
      workspacePath: "/tmp/project",
      initialGoal: "goal",
      currentGoal: "goal",
      diagnostics: [],
      plan: { ...basePlan, approved: false, resolvedSeq: 7 },
    })).toContain("计划决定：已拒绝");

    const events = [
      sessionCreated(),
      runStarted(2, RUN_ID, true),
      contextEvent(3, "user.message", { content: "只生成计划" }),
      contextEvent(4, "model.requested", {
        iteration: 1,
        modelProfileId: "deepseek",
      }),
      contextEvent(5, "model.completed", {
        iteration: 1,
        finishReason: "stop",
      }),
      contextEvent(6, "plan.proposed", {
        planId,
        approvalId,
        content: basePlan.content,
      }),
      contextEvent(7, "plan.approval.resolved", {
        planId,
        approvalId,
        approved: false,
      }),
      contextEvent(8, "run.cancelled", {
        reason: "用户拒绝执行计划",
        iterations: 1,
      }),
      runStarted(9, "20000000-0000-4000-8000-000000000099"),
      contextEvent(
        10,
        "user.message",
        { content: "后续任务" },
        "20000000-0000-4000-8000-000000000099",
      ),
    ];
    const history = projectContextHistory(events);
    const messages = renderContextMessages({
      history,
      workspacePath: "/tmp/project",
      rounds: history.rounds,
    });
    expect(messages.some((message) =>
      message.role === "user" &&
      message.content === "我拒绝上述持久化计划提案，请勿执行。"
    )).toBe(true);
    expect(messages.some((message) =>
      message.role === "assistant" && message.content === basePlan.content
    )).toBe(true);
  });

  it("不翻译工具参数、路径和进程原始输出", () => {
    const toolCallId = "30000000-0000-4000-8000-000000000099";
    const events = [
      ...[
        sessionCreated(),
        runStarted(2),
        contextEvent(3, "user.message", {
          content: "Run npm test in EnglishProject",
        }),
      ],
      contextEvent(4, "model.requested", {
        iteration: 1,
        modelProfileId: "deepseek",
      }),
      contextEvent(5, "model.completed", {
        iteration: 1,
        finishReason: "tool_calls",
      }),
      contextEvent(6, "tool.requested", {
        toolCallId,
        toolName: "run_process",
        publicArguments: {
          program: "npm",
          args: ["test", "--", "EnglishSymbol"],
          cwd: "packages/EnglishProject",
        },
        argumentsTruncated: false,
      }),
      contextEvent(7, "tool.started", {
        toolCallId,
        toolName: "run_process",
      }),
      contextEvent(8, "tool.result", {
        toolCallId,
        toolName: "run_process",
        result: {
          ok: true,
          summary: "进程执行完成",
          output: "[stdout] BUILD_OK EnglishSymbol\n[stderr] KeepOriginal",
          metadata: { cwd: "packages/EnglishProject", exitCode: 0 },
        },
      }),
    ];
    const history = projectContextHistory(events);
    const messages = renderContextMessages({
      history,
      workspacePath: "/tmp/EnglishProject",
      rounds: history.rounds,
    });
    expect(messages.some((message) =>
      message.role === "user" &&
      message.content === "Run npm test in EnglishProject"
    )).toBe(true);
    const assistant = messages.find((message) =>
      message.role === "assistant" && message.toolCalls !== undefined
    );
    expect(assistant && "toolCalls" in assistant
      ? assistant.toolCalls?.[0]?.arguments
      : undefined).toEqual({
        program: "npm",
        args: ["test", "--", "EnglishSymbol"],
        cwd: "packages/EnglishProject",
      });
    const tool = messages.find((message) => message.role === "tool");
    expect(tool?.content).toContain("[stdout] BUILD_OK EnglishSymbol");
    expect(tool?.content).toContain("[stderr] KeepOriginal");
  });
});
