import { describe, expect, it } from "vitest";

import { parseTerminalArguments, parseTerminalCommand, TERMINAL_HELP_TEXT } from "@/lib/terminal/arguments";
import { TerminalLayerError } from "@/lib/terminal/errors";

const uuid = "00000000-0000-4000-8000-000000000001";

function codeOf(action: () => unknown): string | undefined {
  try { action(); } catch (error) { return error instanceof TerminalLayerError ? error.error.code : undefined; }
  return undefined;
}

describe("terminal argument parser", () => {
  it("parses help, setup, create and resume", () => {
    expect(parseTerminalArguments(["--help"])).toEqual({ mode: "help" });
    expect(parseTerminalArguments(["--", "--help"])).toEqual({ mode: "help" });
    expect(parseTerminalArguments([])).toEqual({ mode: "setup" });
    expect(parseTerminalArguments(["--data-dir", "/tmp/data"])).toEqual({ mode: "setup", dataDir: "/tmp/data" });
    expect(parseTerminalArguments(["--workspace", "/tmp/work", "--model", "deepseek", "--title", "测试"])).toEqual({ mode: "create", workspacePath: "/tmp/work", modelProfileId: "deepseek", title: "测试" });
    expect(parseTerminalArguments(["--session", uuid])).toEqual({ mode: "resume", sessionId: uuid });
  });

  it.each([
    ["unknown", ["--wat", "x"]],
    ["duplicate", ["--model", "a", "--model", "b"]],
    ["pair", ["--workspace", "/tmp/work"]],
    ["relative", ["--workspace", "relative", "--model", "deepseek"]],
    ["mutual", ["--session", uuid, "--model", "deepseek"]],
    ["help-extra", ["--help", "x"]],
    ["api-key", ["--api-key", "secret"]],
  ])("rejects %s argv", (_name, argv) => {
    expect(codeOf(() => parseTerminalArguments(argv))).toBe("TERMINAL_ARGUMENT_INVALID");
  });

  it("does not expose input values in argument errors or help", () => {
    const secret = "sk-example-secret-123456";
    let output = "";
    try { parseTerminalArguments(["--api-key", secret]); } catch (error) { output = JSON.stringify(error); }
    expect(output).not.toContain(secret);
    expect(TERMINAL_HELP_TEXT).not.toContain(secret);
  });
});

describe("terminal command parser", () => {
  it("parses tasks, empty, Plan Mode and approval commands", () => {
    expect(parseTerminalCommand("  修复错误  ")).toEqual({ kind: "task", content: "修复错误" });
    expect(parseTerminalCommand("  ")).toEqual({ kind: "empty" });
    for (const kind of ["help", "status", "exit"] as const) expect(parseTerminalCommand(`/${kind}`)).toEqual({ kind });
    expect(parseTerminalCommand("/approve 因为安全")).toEqual({ kind: "approve", reason: "因为安全" });
    expect(parseTerminalCommand("/reject   ")).toEqual({ kind: "reject" });
    expect(parseTerminalCommand("/cancel 用户请求")).toEqual({ kind: "cancel", reason: "用户请求" });
    expect(parseTerminalCommand("/plan on")).toEqual({ kind: "plan", enabled: true });
    expect(parseTerminalCommand("/plan off")).toEqual({ kind: "plan", enabled: false });
    expect(parseTerminalCommand("/approve-plan 同意")).toEqual({ kind: "approve-plan", reason: "同意" });
    expect(parseTerminalCommand("/reject-plan")).toEqual({ kind: "reject-plan" });
  });

  it.each(["/HELP", "/unknown", "/help extra", "/status extra", "/exit extra", "/plan", "/plan yes", "/plan on extra"])("rejects invalid command %s", (line) => {
    expect(codeOf(() => parseTerminalCommand(line))).toBe("TERMINAL_COMMAND_INVALID");
  });

  it("enforces reason and task limits", () => {
    expect(parseTerminalCommand(`/approve ${"a".repeat(4096)}`).kind).toBe("approve");
    expect(codeOf(() => parseTerminalCommand(`/approve ${"a".repeat(4097)}`))).toBe("TERMINAL_COMMAND_INVALID");
    expect(codeOf(() => parseTerminalCommand("a".repeat(1_048_577)))).toBe("TERMINAL_COMMAND_INVALID");
  });
});
