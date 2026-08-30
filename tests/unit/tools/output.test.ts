import { describe, expect, it } from "vitest";

import { MAX_TOOL_OUTPUT_BYTES, utf8ByteLength } from "@/lib/domain";
import { limitToolOutput } from "@/lib/tools/output";

describe("tool output limiting", () => {
  it("preserves output at the exact byte boundary", () => {
    const value = "a".repeat(MAX_TOOL_OUTPUT_BYTES);
    const result = limitToolOutput(value);
    expect(result.truncated).toBe(false);
    expect(result.value).toBe(value);
  });

  it("keeps UTF-8 head and tail within the limit", () => {
    const result = limitToolOutput("头".repeat(30_000) + "TAIL");
    expect(result.truncated).toBe(true);
    expect(result.value).toContain("已截断");
    expect(result.value).not.toContain("TRUNCATED");
    expect(result.value.endsWith("TAIL")).toBe(true);
    expect(result.value).not.toContain("�");
    expect(utf8ByteLength(result.value)).toBeLessThanOrEqual(
      MAX_TOOL_OUTPUT_BYTES,
    );
  });

  it("redacts common secret forms", () => {
    const result = limitToolOutput("Authorization: Bearer abcdefgh");
    expect(result.value).not.toContain("abcdefgh");
  });
});
