import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("client protocol security", () => {
  it("does not import server or Node capabilities", async () => {
    const files = [
      "lib/client/api-client.ts",
      "lib/client/catalog.ts",
      "lib/client/index.ts",
      "lib/client/schemas.ts",
      "lib/client/transcript.ts",
      "lib/client/types.ts",
      "lib/client/typing.ts",
    ];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source).not.toMatch(/@\/lib\/server|node:|process\.env|Authorization|apiKey/i);
      expect(source).not.toContain("console.");
    }
  });
});
