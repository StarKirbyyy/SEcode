import { describe, expect, it } from "vitest";

import {
  JsonValueSchema,
  REDACTED_VALUE,
  createPublicToolArguments,
  redactSecrets,
  sanitizeForEvent,
  truncateUtf8,
  utf8ByteLength,
} from "@/lib/domain";

describe("secret redaction", () => {
  it("redacts bearer tokens, sk-style keys and API key assignments", () => {
    const value = [
      "Authorization: Bearer token.part-value",
      "key=sk-abcdefghijklmnopqrstuvwxyz",
      "DEEPSEEK_API_KEY=super-secret-value",
    ].join("\n");
    const redacted = redactSecrets(value);

    expect(redacted).not.toContain("token.part-value");
    expect(redacted).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(redacted).not.toContain("super-secret-value");
    expect(redacted).toContain(REDACTED_VALUE);
  });

  it("preserves ordinary code, paths and process arguments", () => {
    const value = "pnpm test -- src/tokenizer.test.ts /tmp/secretary/file";
    expect(redactSecrets(value)).toBe(value);
  });
});

describe("event sanitization", () => {
  it("recursively redacts sensitive keys and always returns JSON", () => {
    const cyclic: Record<string, unknown> = {
      path: "src/index.ts",
      apiKey: "should-not-appear",
      nested: {
        authorization: "Bearer should-not-appear",
        count: Number.NaN,
      },
      createdAt: new Date("2026-08-27T00:00:00Z"),
    };
    cyclic.self = cyclic;

    const sanitized = sanitizeForEvent(cyclic);
    expect(JsonValueSchema.safeParse(sanitized).success).toBe(true);
    expect(sanitized).toMatchObject({
      path: "src/index.ts",
      apiKey: REDACTED_VALUE,
      nested: { authorization: REDACTED_VALUE, count: "NaN" },
      createdAt: "2026-08-27T00:00:00.000Z",
      self: "[CIRCULAR]",
    });
  });

  it("limits individual long string previews", () => {
    const sanitized = sanitizeForEvent(
      { content: "中".repeat(10), normal: true },
      { maxStringBytes: 10 },
    );
    expect(utf8ByteLength((sanitized as { content: string }).content)).toBeLessThanOrEqual(
      10,
    );
  });

  it("does not label repeated non-cyclic references as circular", () => {
    const shared = { value: "kept" };
    expect(sanitizeForEvent({ first: shared, second: shared })).toEqual({
      first: shared,
      second: shared,
    });
  });
});

describe("UTF-8 size controls", () => {
  it("truncates without splitting a multi-byte character", () => {
    const result = truncateUtf8("ab中文", 6);
    expect(result).toEqual({
      value: "ab中",
      truncated: true,
      originalBytes: 8,
      returnedBytes: 5,
    });
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(
      new TextEncoder().encode(result.value),
    )).not.toThrow();
  });

  it("returns metadata without changing strings inside the limit", () => {
    expect(truncateUtf8("中文", 6)).toEqual({
      value: "中文",
      truncated: false,
      originalBytes: 6,
      returnedBytes: 6,
    });
  });

  it("creates bounded public arguments with an explicit truncation marker", () => {
    const result = createPublicToolArguments(
      {
        path: "src/index.ts",
        content: "中".repeat(10_000),
        password: "should-not-appear",
      },
      1_024,
    );
    const serialized = JSON.stringify(result.publicArguments);

    expect(result.truncated).toBe(true);
    expect(utf8ByteLength(serialized)).toBeLessThanOrEqual(1_024);
    expect(serialized).not.toContain("should-not-appear");
    expect(result.publicArguments).toMatchObject({ truncated: true });
  });

  it("preserves small public arguments after sanitizing them", () => {
    expect(
      createPublicToolArguments({ path: "src/index.ts", apiKey: "secret" }),
    ).toMatchObject({
      publicArguments: { path: "src/index.ts", apiKey: REDACTED_VALUE },
      truncated: false,
    });
  });

  it("rejects a byte budget too small for the truncation marker", () => {
    expect(() => createPublicToolArguments({ value: "long" }, 10)).toThrow(
      RangeError,
    );
  });
});
