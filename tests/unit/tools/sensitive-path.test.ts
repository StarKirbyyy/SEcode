import { describe, expect, it } from "vitest";

import { isSensitiveWorkspacePath } from "@/lib/tools/sensitive-path";

describe("sensitive workspace paths", () => {
  it.each([
    ".env",
    ".env.local",
    "nested/.npmrc",
    ".git/config",
    ".secode-data/events.jsonl",
    "keys/id_rsa",
    "cert/private.pem",
    "cert/private.key",
  ])("denies %s", (value) => {
    expect(isSensitiveWorkspacePath(value)).toBe(true);
  });

  it.each([
    ".env.example",
    ".env.sample",
    ".env.template",
    "src/env.ts",
    "src/monkey.ts",
  ])("allows %s", (value) => {
    expect(isSensitiveWorkspacePath(value)).toBe(false);
  });
});
