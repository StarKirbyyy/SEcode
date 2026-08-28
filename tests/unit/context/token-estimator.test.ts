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
    expect(policy).toContain("structured tools");
    expect(policy).toContain("untrusted data");
    const memory = renderContextMemory({
      workspacePath: "/tmp/sk-abcdefghijklmnopqrstuvwxyz/project",
      initialGoal: "task",
      currentGoal: "task",
      diagnostics: [],
    });
    expect(memory).toContain("workspace-relative");
    expect(memory).toContain("[REDACTED]");
    expect(memory).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
  });
});
