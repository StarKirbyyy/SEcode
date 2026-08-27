import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { REDACTED_VALUE, type JsonObject } from "@/lib/domain";
import { createToolSummary } from "@/lib/approval/summary";
import { MAX_TOOL_SUMMARY_CHARACTERS } from "@/lib/approval/types";
import {
  prepareLocalToolCall,
  type PreparedLocalToolInvocation,
} from "@/lib/tools";

function prepared(
  name: string,
  arguments_: JsonObject,
): PreparedLocalToolInvocation {
  const result = prepareLocalToolCall({
    id: randomUUID(),
    name,
    arguments: arguments_,
  });
  if (!result.ok) throw new Error(result.result.summary);
  return result.invocation;
}

describe("approval tool summaries", () => {
  it("creates bounded summaries for all six tools", () => {
    const invocations = [
      prepared("list_directory", { path: "src" }),
      prepared("read_file", { path: "src/a.ts" }),
      prepared("search_text", { path: "src", query: "needle" }),
      prepared("write_file", { path: "new.ts", content: "value" }),
      prepared("replace_in_file", {
        path: "src/a.ts",
        oldText: "old",
        newText: "new",
        expectedSha256: "0".repeat(64),
      }),
      prepared("run_process", { program: "pnpm", args: ["test"] }),
    ];

    for (const invocation of invocations) {
      const summary = createToolSummary(invocation);
      expect(summary.length).toBeGreaterThan(0);
      expect(summary.length).toBeLessThanOrEqual(MAX_TOOL_SUMMARY_CHARACTERS);
    }
  });

  it("never includes write or replacement content", () => {
    const secret = "unique-write-body-that-must-not-appear";
    const write = createToolSummary(
      prepared("write_file", { path: "new.ts", content: secret }),
    );
    const replace = createToolSummary(
      prepared("replace_in_file", {
        path: "src/a.ts",
        oldText: secret,
        newText: `${secret}-new`,
        expectedSha256: "a".repeat(64),
      }),
    );
    expect(write).not.toContain(secret);
    expect(replace).not.toContain(secret);
  });

  it("redacts argv secrets, escapes tokens and truncates large summaries", () => {
    const metacharacter = '"; $(touch nope) | > file';
    const invocation = prepared("run_process", {
      program: "custom",
      args: [
        "Authorization: Bearer token.part-value",
        "--password=visible-password",
        "--api-key",
        "second-visible-secret",
        metacharacter,
        ...Array.from({ length: 120 }, (_, index) => `argument-${index}-${"中".repeat(20)}`),
      ],
    });
    const summary = createToolSummary(invocation);
    expect(summary).toContain(REDACTED_VALUE);
    expect(summary).not.toContain("token.part-value");
    expect(summary).not.toContain("visible-password");
    expect(summary).not.toContain("second-visible-secret");
    expect(summary).toContain("\\\"");
    expect(summary.length).toBeLessThanOrEqual(MAX_TOOL_SUMMARY_CHARACTERS);
  });

  it("redacts generic sensitive assignments in search previews", () => {
    const summary = createToolSummary(
      prepared("search_text", {
        path: "src",
        query: "password=plain-visible-value",
      }),
    );
    expect(summary).toContain(REDACTED_VALUE);
    expect(summary).not.toContain("plain-visible-value");
  });
});
