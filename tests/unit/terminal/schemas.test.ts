import { describe, expect, it } from "vitest";

import {
  TerminalApplicationResultSchema,
  TerminalCommandSchema,
  TerminalFrameSchema,
  TerminalLaunchSchema,
} from "@/lib/terminal/schemas";
import {
  TERMINAL_ERROR_CODES,
  TERMINAL_ERROR_RECOVERABLE,
  createTerminalError,
} from "@/lib/terminal/errors";

const uuid = "00000000-0000-4000-8000-000000000001";

describe("terminal schemas and errors", () => {
  it("locks the ten error codes and recoverability", () => {
    expect(TERMINAL_ERROR_CODES).toHaveLength(10);
    expect(Object.keys(TERMINAL_ERROR_RECOVERABLE)).toEqual([...TERMINAL_ERROR_CODES]);
    expect(TERMINAL_ERROR_RECOVERABLE.TERMINAL_ARGUMENT_INVALID).toBe(false);
    expect(TERMINAL_ERROR_RECOVERABLE.TERMINAL_COMMAND_INVALID).toBe(true);
    expect(TERMINAL_ERROR_RECOVERABLE.TERMINAL_IO_ERROR).toBe(false);
  });

  it("accepts all launch branches and rejects extra keys", () => {
    expect(TerminalLaunchSchema.parse({ mode: "help" })).toEqual({ mode: "help" });
    expect(TerminalLaunchSchema.parse({ mode: "setup", dataDir: "/tmp/data" }).mode).toBe("setup");
    expect(TerminalLaunchSchema.parse({ mode: "create", workspacePath: "/tmp/work", modelProfileId: "deepseek" }).mode).toBe("create");
    expect(TerminalLaunchSchema.parse({ mode: "resume", sessionId: uuid }).mode).toBe("resume");
    expect(() => TerminalLaunchSchema.parse({ mode: "help", extra: true })).toThrow();
    expect(() => TerminalLaunchSchema.parse({ mode: "setup", dataDir: "relative" })).toThrow();
  });

  it("keeps command, frame and result strict", () => {
    expect(TerminalCommandSchema.parse({ kind: "task", content: "修复测试" }).kind).toBe("task");
    expect(() => TerminalCommandSchema.parse({ kind: "help", extra: true })).toThrow();
    expect(TerminalFrameSchema.parse({ channel: "stdout", mode: "line", text: "ok" }).text).toBe("ok");
    expect(() => TerminalFrameSchema.parse({ channel: "stdout", mode: "line", text: "ok", extra: 1 })).toThrow();
    expect(TerminalApplicationResultSchema.parse({ exitCode: 130, reason: "interrupted" })).toEqual({ exitCode: 130, reason: "interrupted" });
    expect(() => TerminalApplicationResultSchema.parse({ exitCode: 3, reason: "fatal" })).toThrow();
  });

  it("serializes a finite public error without cause or unsafe details", () => {
    const error = createTerminalError(
      "TERMINAL_INTERNAL_ERROR",
      "失败 sk-secret-value",
      { field: "model", path: "/private/path", prompt: "secret", count: 2 },
      new Error("private cause"),
    );
    const json = JSON.stringify(error);
    expect(json).toContain("TERMINAL_INTERNAL_ERROR");
    expect(json).toContain("[REDACTED]");
    expect(json).toContain('"count":2');
    expect(json).not.toContain("private cause");
    expect(json).not.toContain("/private/path");
    expect(json).not.toContain("prompt");
    expect(Object.keys(error)).not.toContain("cause");
  });
});
