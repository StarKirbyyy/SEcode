import { describe, expect, it } from "vitest";

import {
  IsoDateTimeSchema,
  JsonObjectSchema,
  JsonValueSchema,
  ProtocolVersionSchema,
  SequenceSchema,
  UuidSchema,
} from "@/lib/domain";

describe("JSON domain values", () => {
  it("round-trips nested JSON values", () => {
    const value = {
      text: "代码",
      count: 2,
      active: true,
      empty: null,
      nested: [{ path: "src/index.ts" }],
    };

    const parsed = JsonObjectSchema.parse(value);
    expect(JsonValueSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(
      value,
    );
  });

  it.each([
    ["undefined", undefined],
    ["function", () => undefined],
    ["bigint", BigInt(1)],
    ["symbol", Symbol("secret")],
    ["Date", new Date("2026-08-27T00:00:00Z")],
    ["Map", new Map([["key", "value"]])],
    ["Set", new Set(["value"])],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("rejects non-JSON value %s", (_name, value) => {
    expect(JsonValueSchema.safeParse(value).success).toBe(false);
  });

  it("rejects cyclic objects", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(JsonValueSchema.safeParse(cyclic).success).toBe(false);
  });
});

describe("protocol primitives", () => {
  it("accepts UUIDs, zoned timestamps, positive sequences and version 1", () => {
    expect(UuidSchema.parse("11111111-1111-4111-8111-111111111111")).toBeTruthy();
    expect(IsoDateTimeSchema.parse("2026-08-27T08:00:00+08:00")).toBeTruthy();
    expect(SequenceSchema.parse(1)).toBe(1);
    expect(ProtocolVersionSchema.parse(1)).toBe(1);
  });

  it.each([
    [UuidSchema, "not-a-uuid"],
    [IsoDateTimeSchema, "2026-08-27T08:00:00"],
    [SequenceSchema, 0],
    [SequenceSchema, 1.5],
    [ProtocolVersionSchema, 2],
  ])("rejects an invalid protocol primitive", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});
