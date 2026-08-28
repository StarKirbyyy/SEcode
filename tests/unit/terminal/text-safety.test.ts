import { describe, expect, it } from "vitest";

import { shortUuid, stableJson, terminalSafeText } from "@/lib/terminal/text-safety";

describe("terminal text safety", () => {
  it("keeps Unicode, newline and tab while normalizing CR", () => {
    expect(terminalSafeText("中文🙂\r\nline\rnext\tend")).toBe("中文🙂\nline\\u000Dnext\tend");
  });

  it("visibly escapes C0, C1, ESC, BEL, NUL and backspace", () => {
    const safe = terminalSafeText("a\x1b[31m\x07\0\b\x7fb\u009b");
    expect(safe).toBe("a\\u001B[31m\\u0007\\u0000\\u0008\\u007Fb\\u009B");
    expect([...safe].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && character !== "\n" && character !== "\t";
    })).toBe(false);
  });

  it("redacts secrets before control escaping", () => {
    const safe = terminalSafeText("Bearer token-value\x1b sk-abcdefgh1234");
    expect(safe).not.toContain("token-value");
    expect(safe).not.toContain("sk-abcdefgh1234");
    expect(safe).toContain("\\u001B");
  });

  it("serializes JSON with recursively sorted keys and stable arrays", () => {
    expect(stableJson({ z: 1, a: { y: 2, b: 3 }, list: [{ d: 4, c: 5 }, 1] })).toBe('{"a":{"b":3,"y":2},"list":[{"c":5,"d":4},1],"z":1}');
    expect(() => stableJson({ value: undefined })).toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => stableJson(cyclic)).toThrow();
  });

  it("shortens only valid UUIDs", () => {
    expect(shortUuid("00000000-0000-4000-8000-000000000001")).toBe("00000000");
    expect(() => shortUuid("not-an-id")).toThrow();
  });
});
