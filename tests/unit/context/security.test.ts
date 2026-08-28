import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_FILES = [
  "types.ts",
  "schemas.ts",
  "errors.ts",
  "system-prompt.ts",
  "token-estimator.ts",
  "history-projector.ts",
  "message-renderer.ts",
  "compaction.ts",
  "summary-generator.ts",
  "provider.ts",
  "index.ts",
];

describe("context security boundaries", () => {
  it("has no framework, direct I/O, environment, or execution imports", async () => {
    const source = (await Promise.all(SOURCE_FILES.map((file) =>
      readFile(path.join(process.cwd(), "lib/context", file), "utf8"),
    ))).join("\n");
    expect(source).not.toMatch(/from ["'](?:next|react|react-dom|ai|langchain|@ai-sdk|openai)/);
    expect(source).not.toMatch(/node:(?:fs|child_process)|process\.env|\bfetch\s*\(/);
    expect(source).not.toMatch(/\.appendEvent\s*\(|prepareLocalToolCall|requestLocalToolAuthorization/);
    expect(source).not.toMatch(/reasoningContent|reasoningTokens|\.continuation\b/);
  });

  it("contains no credential-shaped production fixture", async () => {
    const source = (await Promise.all(SOURCE_FILES.map((file) =>
      readFile(path.join(process.cwd(), "lib/context", file), "utf8"),
    ))).join("\n");
    expect(source).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/);
    expect(source).not.toMatch(/[A-Z][A-Z0-9_]*_API_KEY\s*=/);
  });
});
