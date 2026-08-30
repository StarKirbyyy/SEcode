import { describe, expect, it, vi } from "vitest";

import { StreamingVisibleTextGate } from "@/lib/agent/streaming-visible-text";

describe("StreamingVisibleTextGate", () => {
  it("waits for a safe Chinese boundary and redacts a split secret", async () => {
    const chunks: string[] = [];
    const gate = new StreamingVisibleTextGate((content) => { chunks.push(content); });

    await gate.push("正在检查 sk-");
    expect(chunks).toEqual([]);
    await gate.push("abcdefghijklmnopqrstuvwxyz");
    expect(chunks).toEqual([]);
    await gate.push("，请稍候。");
    const result = await gate.finish();

    expect(chunks.join("")).toBe("正在检查 [REDACTED]，请稍候。");
    expect(chunks.join("")).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(result.publishedCharacters).toBeGreaterThan(0);
  });

  it("suppresses English prose while preserving technical-only lines", async () => {
    const publish = vi.fn();
    const gate = new StreamingVisibleTextGate(publish);
    await gate.push("I am inspecting the repository now.\n");
    await gate.push("pnpm test\n");
    const result = await gate.finish();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith("pnpm test\n");
    expect(result.suppressedCharacters).toBeGreaterThan(0);
  });

  it("publishes a completed fenced code block and stops after abort", async () => {
    const chunks: string[] = [];
    const gate = new StreamingVisibleTextGate((content) => { chunks.push(content); });
    await gate.push("```ts\nconst value = 1;\n```\n");
    await gate.finish();
    expect(chunks.join("")).toContain("const value = 1");

    const aborted = new StreamingVisibleTextGate((content) => { chunks.push(content); });
    await aborted.push("正在等待");
    aborted.abort();
    await aborted.push("。不应显示");
    expect((await aborted.finish()).publishedCharacters).toBe(0);
    expect(chunks.join("")).not.toContain("不应显示");
  });
});
