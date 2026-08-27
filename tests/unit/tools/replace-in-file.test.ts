import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { sha256Bytes } from "@/lib/tools/file-content";

import {
  cleanupAllToolFixtures,
  createToolFixture,
  runTool,
} from "./helpers";

afterEach(cleanupAllToolFixtures);

describe("replace_in_file", () => {
  it("replaces exactly one occurrence", async () => {
    const fixture = await createToolFixture();
    const target = path.join(fixture.project, "a.txt");
    await fs.writeFile(target, "hello 世界");
    const result = await runTool(fixture.workspace, "replace_in_file", {
      path: "a.txt",
      oldText: "世界",
      newText: "SEcode",
      expectedSha256: sha256Bytes(Buffer.from("hello 世界")),
    });
    expect(result.ok).toBe(true);
    expect(result.metadata?.replacedOccurrences).toBe(1);
    await expect(fs.readFile(target, "utf8")).resolves.toBe("hello SEcode");
  });

  it("rejects absent and non-unique matches without changing bytes", async () => {
    const fixture = await createToolFixture();
    const target = path.join(fixture.project, "a.txt");
    const original = "aaaa";
    await fs.writeFile(target, original);
    const hash = sha256Bytes(Buffer.from(original));
    const absent = await runTool(fixture.workspace, "replace_in_file", {
      path: "a.txt",
      oldText: "z",
      newText: "x",
      expectedSha256: hash,
    });
    expect(absent.error?.code).toBe("FILE_MATCH_NOT_FOUND");
    const many = await runTool(fixture.workspace, "replace_in_file", {
      path: "a.txt",
      oldText: "aa",
      newText: "x",
      expectedSha256: hash,
    });
    expect(many.error?.code).toBe("FILE_MATCH_NOT_UNIQUE");
    await expect(fs.readFile(target, "utf8")).resolves.toBe(original);
  });
});
