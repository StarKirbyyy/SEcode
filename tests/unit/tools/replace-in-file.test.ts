import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { nativeToolDependencies } from "@/lib/tools/dependencies";
import { executeReplaceInFile } from "@/lib/tools/replace-in-file";

import {
  cleanupAllToolFixtures,
  createToolFixture,
  runTool,
} from "./helpers";

afterEach(cleanupAllToolFixtures);

describe("replace_in_file", () => {
  it("applies multiple unique non-overlapping replacements atomically", async () => {
    const fixture = await createToolFixture();
    const target = path.join(fixture.project, "README.md");
    const original = "alpha=old\nbeta=old\n";
    await fs.writeFile(target, original);
    const result = await runTool(fixture.workspace, "replace_in_file", {
      path: "README.md",
      replacements: [
        { oldText: "alpha=old", newText: "alpha=new" },
        { oldText: "beta=old", newText: "beta=new" },
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      metadata: { replacementCount: 2, replacedOccurrences: 2 },
    });
    await expect(fs.readFile(target, "utf8"))
      .resolves.toBe("alpha=new\nbeta=new\n");
  });

  it("replaces exactly one occurrence", async () => {
    const fixture = await createToolFixture();
    const target = path.join(fixture.project, "a.txt");
    await fs.writeFile(target, "hello 世界");
    const result = await runTool(fixture.workspace, "replace_in_file", {
      path: "a.txt",
      oldText: "世界",
      newText: "SEcode",
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
    const absent = await runTool(fixture.workspace, "replace_in_file", {
      path: "a.txt",
      oldText: "z",
      newText: "x",
    });
    expect(absent.error?.code).toBe("FILE_MATCH_NOT_FOUND");
    const many = await runTool(fixture.workspace, "replace_in_file", {
      path: "a.txt",
      oldText: "aa",
      newText: "x",
    });
    expect(many.error?.code).toBe("FILE_MATCH_NOT_UNIQUE");
    await expect(fs.readFile(target, "utf8")).resolves.toBe(original);
  });

  it("rejects an overlapping batch without changing bytes", async () => {
    const fixture = await createToolFixture();
    const target = path.join(fixture.project, "a.txt");
    const original = "abc";
    await fs.writeFile(target, original);
    const result = await runTool(fixture.workspace, "replace_in_file", {
      path: "a.txt",
      replacements: [
        { oldText: "ab", newText: "x" },
        { oldText: "bc", newText: "y" },
      ],
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "FILE_MATCH_NOT_UNIQUE", details: { reason: "replacement_overlap" } },
    });
    await expect(fs.readFile(target, "utf8")).resolves.toBe(original);
  });

  it("does not overwrite a concurrent edit made before atomic rename", async () => {
    const fixture = await createToolFixture();
    const target = path.join(fixture.project, "a.txt");
    await fs.writeFile(target, "before");
    let changed = false;
    const result = await executeReplaceInFile(
      {
        workspace: fixture.workspace,
        signal: new AbortController().signal,
      },
      { path: "a.txt", oldText: "before", newText: "after" },
      {
        ...nativeToolDependencies,
        fileSystem: {
          ...nativeToolDependencies.fileSystem,
          open: async (...arguments_) => {
            const handle = await nativeToolDependencies.fileSystem.open(...arguments_);
            if (!changed) {
              changed = true;
              await fs.writeFile(target, "concurrent");
            }
            return handle;
          },
        },
      },
    );
    expect(result.error?.code).toBe("FILE_STALE");
    await expect(fs.readFile(target, "utf8")).resolves.toBe("concurrent");
  });
});
