import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { executeListDirectory } from "@/lib/tools/list-directory";

import {
  cleanupAllToolFixtures,
  createToolFixture,
} from "./helpers";

afterEach(cleanupAllToolFixtures);

describe("list_directory", () => {
  it("lists stable bounded entries and ignores generated directories", async () => {
    const fixture = await createToolFixture();
    await fs.mkdir(path.join(fixture.project, "src", "nested"), {
      recursive: true,
    });
    await fs.writeFile(path.join(fixture.project, "src", "z.ts"), "");
    await fs.writeFile(path.join(fixture.project, "src", "a.ts"), "");
    await fs.mkdir(path.join(fixture.project, "node_modules"));
    const result = await executeListDirectory(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      { path: ".", depth: 2, limit: 100 },
    );
    expect(result.ok).toBe(true);
    expect(result.output).toMatch(/^目录\s+src$/m);
    expect(result.output).toContain("src/a.ts");
    expect(result.output?.indexOf("src/a.ts")).toBeLessThan(
      result.output?.indexOf("src/z.ts") ?? 0,
    );
    expect(result.output).not.toContain("node_modules");
    expect(result.metadata?.ignoredEntries).toBe(1);
  });

  it("shows an external symlink as blocked without leaking its target", async () => {
    const fixture = await createToolFixture();
    await fs.writeFile(path.join(fixture.outside, "secret.txt"), "secret");
    await fs.symlink(
      path.join(fixture.outside, "secret.txt"),
      path.join(fixture.project, "outside-link"),
    );
    const result = await executeListDirectory(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      { path: ".", depth: 1, limit: 100 },
    );
    expect(result.output).toMatch(/^已阻止\s+outside-link$/m);
    expect(JSON.stringify(result)).not.toContain(fixture.outside);
  });

  it("honors the entry limit", async () => {
    const fixture = await createToolFixture();
    await fs.writeFile(path.join(fixture.project, "a"), "");
    await fs.writeFile(path.join(fixture.project, "b"), "");
    const result = await executeListDirectory(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      { path: ".", depth: 1, limit: 1 },
    );
    expect(result.metadata?.truncated).toBe(true);
    expect(result.metadata?.returnedEntries).toBe(1);
  });
});
