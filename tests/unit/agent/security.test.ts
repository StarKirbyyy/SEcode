import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { StreamingSecretRedactor } from "@/lib/agent/redaction";
import { REDACTED_VALUE, redactSecrets } from "@/lib/domain";

function redactChunks(chunks: readonly string[]): string {
  const redactor = new StreamingSecretRedactor();
  return chunks.map((chunk) => redactor.push(chunk)).join("") + redactor.finish();
}

describe("StreamingSecretRedactor", () => {
  const samples = [
    "Authorization: Bearer token.part-value done",
    "key=sk-abcdefghijklmnopqrstuvwxyz done",
    "DEEPSEEK_API_KEY = super-secret-value done",
    "key=sk-abcdefgh.rest",
  ];

  it.each(samples)("matches complete redaction across every split: %s", (sample) => {
    const expected = redactSecrets(sample);
    for (let split = 0; split <= sample.length; split += 1) {
      const actual = redactChunks([sample.slice(0, split), sample.slice(split)]);
      expect(actual).toBe(expected);
      expect(actual).toContain(REDACTED_VALUE);
      expect(actual).not.toContain("token.part-value");
      expect(actual).not.toContain("abcdefghijklmnopqrstuvwxyz");
      expect(actual).not.toContain("super-secret-value");
    }
  });

  it("preserves ordinary code and Chinese text across single-character chunks", () => {
    const value = "const tokenizer = '中文内容'; pnpm test -- tokenizer.test.ts";
    expect(redactChunks([...value])).toBe(value);
  });

  it("conservatively redacts an overlong pending identifier", () => {
    const value = `A${"B".repeat(300)}`;
    expect(redactChunks([value])).toBe(REDACTED_VALUE);
  });

  it("drops unresolved buffered content when aborted", () => {
    const redactor = new StreamingSecretRedactor();
    expect(redactor.push("DEEPSEEK_API_KEY=")).toBe("");
    redactor.abort();
    expect(redactor.finish()).toBe("");
  });
});

describe("Agent source boundaries", () => {
  const productionFiles = [
    "types.ts",
    "schemas.ts",
    "errors.ts",
    "dependencies.ts",
    "projection.ts",
    "redaction.ts",
    "events.ts",
    "approval-wait.ts",
    "runtime.ts",
    "index.ts",
  ];

  it("does not import framework, browser or Agent framework code", async () => {
    const source = (
      await Promise.all(
        productionFiles.map((file) =>
          readFile(path.join(process.cwd(), "lib/agent", file), "utf8"),
        ),
      )
    ).join("\n");

    expect(source).not.toMatch(/from ["'](?:next|react|react-dom)(?:\/|["'])/);
    expect(source).not.toMatch(/\b(?:window|document|localStorage|sessionStorage)\b/);
    expect(source).not.toMatch(/\b(?:langchain|llamaindex|autogen|crewai)\b/i);
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/node:(?:fs|child_process)/);
  });

  it("does not expose raw executor or capability constructors from the barrel", async () => {
    const barrel = await readFile(
      path.join(process.cwd(), "lib/agent/index.ts"),
      "utf8",
    );
    expect(barrel).not.toMatch(/createAgentRuntimeWithDependencies/);
    expect(barrel).not.toMatch(/PreparedLocalToolInvocation/);
    expect(barrel).not.toMatch(/PendingToolApproval/);
    expect(barrel).not.toMatch(/AuthorizedLocalToolInvocation/);
    expect(barrel).not.toMatch(/executeAuthorizedLocalTool/);
    expect(barrel).not.toMatch(/projection|redaction|approval-wait|dependencies/);
  });
});
