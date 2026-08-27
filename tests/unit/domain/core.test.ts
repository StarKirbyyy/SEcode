import { describe, expect, it } from "vitest";

import {
  ChatMessageSchema,
  ErrorInfoSchema,
  MAX_TOOL_OUTPUT_BYTES,
  ModelProfileSchema,
  SessionRecordSchema,
  ToolCallSchema,
  ToolDefinitionSchema,
  ToolResultSchema,
  utf8ByteLength,
} from "@/lib/domain";

const TOOL_CALL_ID = "33333333-3333-4333-8333-333333333333";

describe("structured errors and tool results", () => {
  const error = {
    code: "FILE_NOT_FOUND",
    message: "文件不存在",
    recoverable: true,
  };

  it("enforces the ok/error invariant", () => {
    expect(
      ToolResultSchema.safeParse({ ok: true, summary: "读取成功" }).success,
    ).toBe(true);
    expect(
      ToolResultSchema.safeParse({ ok: false, summary: "读取失败", error })
        .success,
    ).toBe(true);
    expect(
      ToolResultSchema.safeParse({ ok: true, summary: "错误组合", error })
        .success,
    ).toBe(false);
    expect(
      ToolResultSchema.safeParse({ ok: false, summary: "缺少错误" }).success,
    ).toBe(false);
  });

  it("measures the output limit in UTF-8 bytes", () => {
    const asciiBoundary = "a".repeat(MAX_TOOL_OUTPUT_BYTES);
    const chineseBoundary = "中".repeat(Math.floor(MAX_TOOL_OUTPUT_BYTES / 3));

    expect(utf8ByteLength(asciiBoundary)).toBe(MAX_TOOL_OUTPUT_BYTES);
    expect(
      ToolResultSchema.safeParse({
        ok: true,
        summary: "边界",
        output: asciiBoundary,
      }).success,
    ).toBe(true);
    expect(
      ToolResultSchema.safeParse({
        ok: true,
        summary: "多字节边界",
        output: chineseBoundary,
      }).success,
    ).toBe(true);
    expect(
      ToolResultSchema.safeParse({
        ok: true,
        summary: "超限",
        output: `${asciiBoundary}a`,
      }).success,
    ).toBe(false);
  });

  it("rejects native Error instances and unknown fields", () => {
    expect(ErrorInfoSchema.safeParse(new Error("boom")).success).toBe(false);
    expect(
      ErrorInfoSchema.safeParse({ ...error, stack: "sensitive" }).success,
    ).toBe(false);
  });
});

describe("model, session and message schemas", () => {
  it("accepts a public model profile and rejects secret or unknown fields", () => {
    const profile = {
      id: "deepseek-default",
      label: "DeepSeek",
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      contextWindow: 64_000,
      supportsThinking: false,
      configured: true,
    };

    expect(ModelProfileSchema.safeParse(profile).success).toBe(true);
    expect(
      ModelProfileSchema.safeParse({ ...profile, apiKey: "sk-secret-value" })
        .success,
    ).toBe(false);
  });

  it("accepts a JSON-serializable session record", () => {
    expect(
      SessionRecordSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        title: "修复测试",
        workspacePath: "/tmp/project",
        modelProfileId: "deepseek-default",
        status: "idle",
        createdAt: "2026-08-27T00:00:00Z",
        updatedAt: "2026-08-27T00:00:00Z",
      }).success,
    ).toBe(true);
  });

  it.each([
    { role: "system", content: "You are a coding agent." },
    { role: "user", content: "修复测试" },
    { role: "assistant", content: "我先读取文件。" },
    {
      role: "assistant",
      content: null,
      toolCalls: [
        {
          id: TOOL_CALL_ID,
          name: "read_file",
          arguments: { path: "src/index.ts" },
        },
      ],
    },
    {
      role: "assistant",
      content: "我会先检查文件。",
      toolCalls: [
        {
          id: TOOL_CALL_ID,
          name: "read_file",
          arguments: { path: "src/index.ts" },
        },
      ],
    },
    {
      role: "tool",
      toolCallId: TOOL_CALL_ID,
      name: "read_file",
      content: "文件内容",
    },
  ])("round-trips a provider-independent message", (message) => {
    const parsed = ChatMessageSchema.parse(message);
    expect(ChatMessageSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(
      message,
    );
  });

  it("rejects an empty assistant message", () => {
    expect(
      ChatMessageSchema.safeParse({ role: "assistant", content: null }).success,
    ).toBe(false);
    expect(
      ChatMessageSchema.safeParse({ role: "assistant", content: "" }).success,
    ).toBe(false);
    expect(
      ChatMessageSchema.safeParse({
        role: "assistant",
        content: null,
        toolCalls: [
          { id: TOOL_CALL_ID, name: "bad tool", arguments: {} },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("tool contracts", () => {
  it("accepts conservative tool calls and definitions", () => {
    expect(
      ToolCallSchema.safeParse({
        id: TOOL_CALL_ID,
        name: "replace_in_file",
        arguments: { path: "src/index.ts", oldText: "a", newText: "b" },
      }).success,
    ).toBe(true);
    expect(
      ToolDefinitionSchema.safeParse({
        type: "function",
        function: {
          name: "read_file",
          description: "Read a text file",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      }).success,
    ).toBe(true);
  });

  it.each([
    { id: TOOL_CALL_ID, name: "", arguments: {} },
    { id: TOOL_CALL_ID, name: "bad tool", arguments: {} },
    { id: TOOL_CALL_ID, name: "1tool", arguments: {} },
    { id: TOOL_CALL_ID, name: "read_file", arguments: [] },
  ])("rejects an invalid tool call", (toolCall) => {
    expect(ToolCallSchema.safeParse(toolCall).success).toBe(false);
  });

  it("rejects non-JSON tool parameters", () => {
    expect(
      ToolDefinitionSchema.safeParse({
        type: "function",
        function: {
          name: "read_file",
          description: "Read a file",
          parameters: { createdAt: new Date() },
        },
      }).success,
    ).toBe(false);
  });
});
