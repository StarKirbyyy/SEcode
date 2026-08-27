import { describe, expect, it } from "vitest";

import { ToolDefinitionSchema } from "@/lib/domain";
import {
  LOCAL_TOOL_DEFINITIONS,
  LOCAL_TOOL_NAMES,
  prepareLocalToolCall,
} from "@/lib/tools";

import { toolCall } from "./helpers";

describe("local tool schemas", () => {
  it("exposes six stable valid model definitions", () => {
    expect(LOCAL_TOOL_DEFINITIONS.map((item) => item.function.name)).toEqual(
      LOCAL_TOOL_NAMES,
    );
    for (const definition of LOCAL_TOOL_DEFINITIONS) {
      expect(ToolDefinitionSchema.parse(definition)).toEqual(definition);
      expect(definition.function.parameters.additionalProperties).toBe(false);
    }
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
});
