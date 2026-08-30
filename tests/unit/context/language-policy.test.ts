import { describe, expect, it } from "vitest";

import { analyzeAssistantLanguage } from "@/lib/context/language-policy";

describe("assistant language policy", () => {
  it.each([
    ["已完成 Next.js API 修复，并通过 4 项测试。", true, "compliant"],
    ["结果如下：\n```ts\nconst message = \"hello world\";\n```", true, "compliant"],
    ["已检查 `src/app.ts` 和 https://example.com/docs。", true, "compliant"],
    ["I will inspect the repository before making changes.", false, "english_prose"],
    ["I will inspect first.\n随后我会修改并验证。", false, "english_prose"],
    ["```ts\nconst value = 1;\n```", false, "missing_chinese_prose"],
    ["{\"status\":\"passed\",\"path\":\"src/app.ts\"}", false, "missing_chinese_prose"],
    ["https://example.com/docs", false, "missing_chinese_prose"],
    ["   ", false, "missing_chinese_prose"],
  ])("analyzes protected technical text in %j", (content, ok, reason) => {
    expect(analyzeAssistantLanguage(content)).toMatchObject({ ok, reason });
  });

  it("reports deterministic prose statistics without returning source text", () => {
    const analysis = analyzeAssistantLanguage(
      "I will inspect the repository before making changes.",
    );

    expect(analysis).toMatchObject({
      ok: false,
      reason: "english_prose",
      hanCharacters: 0,
      englishWordCount: 8,
    });
    expect(analysis.englishLetterCount).toBeGreaterThanOrEqual(12);
    expect(JSON.stringify(analysis)).not.toContain("repository");
  });

  it("does not count commands, paths, JSON or raw output as prose", () => {
    const analysis = analyzeAssistantLanguage([
      "pnpm test",
      "/Users/demo/project/src/index.ts",
      '{"status":"passed"}',
      "[标准输出] tests passed",
    ].join("\n"));

    expect(analysis).toMatchObject({
      ok: false,
      reason: "missing_chinese_prose",
      hanCharacters: 0,
      englishWordCount: 0,
      englishLetterCount: 0,
    });
  });
});
