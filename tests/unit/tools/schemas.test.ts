import { describe, expect, it } from "vitest";

import { ToolDefinitionSchema } from "@/lib/domain";
import {
  DEPENDENCY_RECOVERY_TOOL_DEFINITIONS,
  LOCAL_TOOL_DEFINITIONS,
  LOCAL_TOOL_NAMES,
  prepareLocalToolCall,
} from "@/lib/tools";

import { toolCall } from "./helpers";

describe("local tool schemas", () => {
  function description(name: string): string {
    const value = LOCAL_TOOL_DEFINITIONS.find(
      (definition) => definition.function.name === name,
    )?.function.description;
    expect(value).toEqual(expect.any(String));
    return value ?? "";
  }

  it("exposes six stable valid model definitions", () => {
    expect(LOCAL_TOOL_DEFINITIONS.map((item) => item.function.name)).toEqual(
      LOCAL_TOOL_NAMES,
    );
    for (const definition of LOCAL_TOOL_DEFINITIONS) {
      expect(ToolDefinitionSchema.parse(definition)).toEqual(definition);
      expect(definition.function.parameters.additionalProperties).toBe(false);
    }
  });

  it("exposes a frozen dependency-recovery capability without write tools", () => {
    expect(Object.isFrozen(DEPENDENCY_RECOVERY_TOOL_DEFINITIONS)).toBe(true);
    expect(DEPENDENCY_RECOVERY_TOOL_DEFINITIONS.map((item) => item.function.name)).toEqual([
      "list_directory",
      "read_file",
      "search_text",
      "run_process",
    ]);
  });

  it("exposes Chinese function and property descriptions to the model", () => {
    const expectedProperties: Record<string, string[]> = {
      list_directory: ["path", "depth", "limit"],
      read_file: ["path", "startLine", "endLine"],
      search_text: ["query", "path", "caseSensitive", "limit"],
      write_file: ["path", "content", "expectedSha256"],
      replace_in_file: ["path", "expectedSha256", "oldText", "newText", "replacements"],
      run_process: ["program", "args", "cwd", "timeoutMs", "lifecycle", "readiness"],
    };
    for (const definition of LOCAL_TOOL_DEFINITIONS) {
      expect(definition.function.description).toMatch(/[\u3400-\u9fff]/u);
      expect(definition.function.description).not.toMatch(
        /List entries|Read a bounded|Search a fixed|Create or atomically|Spawn one program/,
      );
      const properties = definition.function.parameters.properties as Record<
        string,
        { description?: unknown }
      >;
      expect(Object.keys(properties)).toEqual(
        expectedProperties[definition.function.name],
      );
      for (const property of Object.values(properties)) {
        expect(property.description).toEqual(expect.any(String));
        expect(property.description).toMatch(/[\u3400-\u9fff]/u);
      }
    }
    const readFile = LOCAL_TOOL_DEFINITIONS.find(
      (definition) => definition.function.name === "read_file",
    );
    expect(readFile?.function.description).toContain("每页最多 200 行");
    expect(readFile?.function.description).toContain("nextStartLine");
    expect(readFile?.function.description).not.toContain("读取到文件末尾");
    expect(description("run_process")).toContain("结构化结果");
    expect(description("run_process")).toContain("stderr");
    expect(description("run_process")).toContain("普通参数");
    expect(description("run_process")).toContain("|");
    expect(description("run_process")).toContain("&&");
    expect(description("run_process")).toContain("重定向");
    expect(description("run_process")).toContain("$VAR");
    expect(description("run_process")).toContain("$()");
    const runProcessProperties = LOCAL_TOOL_DEFINITIONS.find(
      (definition) => definition.function.name === "run_process",
    )?.function.parameters.properties as Record<string, { description?: string }>;
    expect(runProcessProperties.args?.description).toContain("普通参数");
    expect(runProcessProperties.args?.description).toContain("Shell");
    expect(description("list_directory")).toContain("写入前");
    expect(description("read_file")).toContain("目标存在");
    expect(description("write_file")).toContain("父目录");
    expect(description("write_file")).toContain("expectedSha256");
  });

  it("applies defaults and normalizes workspace paths", () => {
    const prepared = prepareLocalToolCall(
      toolCall("list_directory", { path: "./src//nested" }),
    );
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.invocation.arguments).toEqual({
        path: "src/nested",
        depth: 1,
        limit: 200,
      });
    }
  });

  it("accepts only explicit loopback readiness probes on high ports", () => {
    const prepared = prepareLocalToolCall(toolCall("run_process", {
      program: "pnpm",
      args: ["dev"],
      readiness: { url: "http://127.0.0.1:43123/health", expectedStatus: 204 },
    }));
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.invocation.arguments).toMatchObject({
        readiness: { url: "http://127.0.0.1:43123/health", expectedStatus: 204 },
      });
    }

    for (const url of [
      "https://127.0.0.1:43123/",
      "http://127.0.0.1:80/",
      "http://127.0.0.2:43123/",
      "http://user@127.0.0.1:43123/",
      "http://127.0.0.1:43123/#fragment",
      " http://127.0.0.1:43123/",
      "http://127.0.0.1:43123/a b",
    ]) {
      expect(prepareLocalToolCall(toolCall("run_process", {
        program: "pnpm",
        args: ["dev"],
        readiness: { url },
      })).ok).toBe(false);
    }

    expect(prepareLocalToolCall(toolCall("run_process", {
      program: "pnpm",
      args: ["dev"],
      lifecycle: "service",
      readiness: { url: "http://localhost:43123/", timeoutMs: 30_000 },
    })).ok).toBe(true);
  });

  it.each([
    ["read_file", { path: "a", startLine: 3, endLine: 2 }],
    ["write_file", { path: "a", content: "x", extra: true }],
    ["replace_in_file", { path: "a", oldText: "x", newText: "x", expectedSha256: "0".repeat(64) }],
    ["run_process", { program: "node", args: Array.from({ length: 129 }, () => "x") }],
  ])("rejects invalid %s arguments", (name, arguments_) => {
    const prepared = prepareLocalToolCall(toolCall(name, arguments_));
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.result.error?.code).toBe("TOOL_ARGUMENTS_INVALID");
    }
  });

  it("rejects mixed, empty, and oversized replacement batches", () => {
    const base = { path: "a", expectedSha256: "0".repeat(64) };
    for (const arguments_ of [
      { ...base, oldText: "a", newText: "b", replacements: [{ oldText: "c", newText: "d" }] },
      { ...base, replacements: [] },
      { ...base, replacements: Array.from({ length: 17 }, (_, index) => ({ oldText: `a${index}`, newText: `b${index}` })) },
    ]) {
      const prepared = prepareLocalToolCall(toolCall("replace_in_file", arguments_));
      expect(prepared.ok).toBe(false);
    }
  });
});
