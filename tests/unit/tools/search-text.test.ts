import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { nativeToolDependencies } from "@/lib/tools/dependencies";
import { executeSearchText } from "@/lib/tools/search-text";
import {
  cleanupAllToolFixtures,
  createToolFixture,
  runTool,
} from "./helpers";

afterEach(cleanupAllToolFixtures);

describe("search_text", () => {
  it("finds fixed strings with workspace-relative locations", async () => {
    const fixture = await createToolFixture();
    await fs.mkdir(path.join(fixture.project, "src"));
    await fs.writeFile(
      path.join(fixture.project, "src", "a.ts"),
      "first\nconst needle = true;\n",
    );
    const result = await runTool(fixture.workspace, "search_text", {
      query: "needle",
      path: ".",
    });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("src/a.ts:2:");
    expect(JSON.stringify(result)).not.toContain(fixture.project);
  });

  it("treats shell metacharacters as literal query text", async () => {
    const fixture = await createToolFixture();
    const query = "needle; touch hacked";
    await fs.writeFile(path.join(fixture.project, "a.txt"), query);
    const result = await runTool(fixture.workspace, "search_text", {
      query,
    });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("a.txt:1:1");
    await expect(
      fs.stat(path.join(fixture.project, "hacked")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("skips sensitive content", async () => {
    const fixture = await createToolFixture();
    await fs.writeFile(path.join(fixture.project, ".env"), "needle");
    const result = await runTool(fixture.workspace, "search_text", {
      query: "needle",
    });
    expect(result.output).not.toContain(".env");
  });

  it("falls back to Node only when rg is unavailable and skips unsafe links", async () => {
    const fixture = await createToolFixture();
    await fs.writeFile(path.join(fixture.project, "a.txt"), "needle needle");
    await fs.writeFile(path.join(fixture.outside, "secret.txt"), "needle");
    await fs.symlink(
      path.join(fixture.outside, "secret.txt"),
      path.join(fixture.project, "outside-link"),
    );
    const result = await executeSearchText(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      { query: "needle", path: ".", caseSensitive: true, limit: 10 },
      {
        ...nativeToolDependencies,
        spawnProcess: () =>
          spawn("__secode_missing_rg__", [], {
            stdio: ["ignore", "pipe", "pipe"],
          }),
      },
    );
    expect(result.ok).toBe(true);
    expect(result.metadata?.engine).toBe("node");
    expect(result.metadata?.returnedMatches).toBe(2);
    expect(result.output).not.toContain("outside-link");
  });
});
