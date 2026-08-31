import { describe, expect, it } from "vitest";

import { LOCAL_TOOL_DEFINITIONS } from "@/lib/tools";
import {
  calculateInputBudget,
  canonicalJsonStringify,
  estimateContextTokens,
  estimateTextTokens,
} from "@/lib/context/token-estimator";
import {
  renderContextMemory,
  renderSystemPolicy,
  SYSTEM_PROMPT_VERSION,
} from "@/lib/context/system-prompt";

describe("context token estimation and system prompt", () => {
  it.each([
    ["", 0],
    ["abcd", 2],
    ["你", 2],
    ["😀", 2],
  ])("estimates %j conservatively", (value, expected) => {
    expect(estimateTextTokens(value)).toBe(expected);
  });

  it("canonicalizes object keys while preserving array order", () => {
    expect(canonicalJsonStringify({ z: 1, a: { y: 2, x: [3, 1] } }))
      .toBe('{"a":{"x":[3,1],"y":2},"z":1}');
  });

  it("calculates the exact 75 percent input budget", () => {
    expect(calculateInputBudget(100)).toBe(75);
    expect(calculateInputBudget(3)).toBe(2);
    expect(() => calculateInputBudget(0)).toThrow("正安全整数");
    expect(() => calculateInputBudget(Number.MAX_VALUE)).toThrow("正安全整数");
  });

  it("includes message, tool, and request overhead deterministically", () => {
    const messages = [
      { role: "system" as const, content: "policy" },
      { role: "user" as const, content: "task" },
    ];
    const first = estimateContextTokens(messages, LOCAL_TOOL_DEFINITIONS, 100_000);
    const second = estimateContextTokens(messages, LOCAL_TOOL_DEFINITIONS, 100_000);
    expect(first).toEqual(second);
    expect(first.inputBudgetTokens).toBe(75_000);
    expect(first.messageTokens).toBeGreaterThan(16);
    expect(first.toolTokens).toBeGreaterThan(0);
    expect(first.estimatedTokens).toBe(
      first.messageTokens + first.toolTokens + 32,
    );
  });

  it("renders immutable policy and sanitized workspace memory", () => {
    const policy = renderSystemPolicy();
    expect(policy).toContain("结构化工具");
    expect(policy).toContain("不可信数据");
    const memory = renderContextMemory({
      workspacePath: "/tmp/sk-abcdefghijklmnopqrstuvwxyz/project",
      initialGoal: "task",
      currentGoal: "task",
      diagnostics: [],
    });
    expect(memory).toContain("工作区相对路径");
    expect(memory).toContain("[REDACTED]");
    expect(memory).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
  });

  it("renders exactly one bounded phase overlay for System Prompt V13", () => {
    expect(SYSTEM_PROMPT_VERSION).toBe(13);
    const normal = renderSystemPolicy("normal");
    const planning = renderSystemPolicy("planning");
    const executing = renderSystemPolicy("executing");
    expect(normal).toContain("当前阶段：正常执行");
    expect(normal).not.toContain("当前阶段：规划");
    expect(planning).toContain("list_directory、read_file 和 search_text");
    expect(planning).toContain("等待用户明确批准");
    expect(planning).toContain("与风险相称的最小反馈环");
    expect(executing).toContain("计划批准不代表预先批准危险工具");
    expect(executing).toContain("尽快建立最小可执行反馈环");
    expect(executing).toContain("最相关的可用验证");
    for (const prompt of [normal, planning, executing]) {
      expect(estimateTextTokens(prompt)).toBeLessThan(1_700);
      expect(prompt).not.toContain("/tmp/project");
      expect(prompt).toContain("ToolResult.ok");
      expect(prompt).not.toContain("expectedSha256");
      expect(prompt).toContain("因目标行为缺失而失败的最小测试");
      expect(prompt).toContain("最终监听端口不得为 3000");
      expect(prompt).toContain("最终回答给出启动命令和实际 URL");
      expect(prompt.match(/3000 是 SEcode 默认保留端口/gu)).toHaveLength(1);
      expect(prompt.match(/不解释管道、连接符、重定向、\$VAR 或命令替换/gu)).toHaveLength(1);
    }
  });
});
