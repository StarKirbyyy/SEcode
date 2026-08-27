import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { sha256Bytes } from "@/lib/tools/file-content";
import { executeReadFile } from "@/lib/tools/read-file";

import {
  cleanupAllToolFixtures,
  createToolFixture,
} from "./helpers";

afterEach(cleanupAllToolFixtures);

describe("read_file", () => {
  it("returns a line range and the full raw hash", async () => {
    const fixture = await createToolFixture();
    const bytes = Buffer.from("一\n二\n三");
    await fs.writeFile(path.join(fixture.project, "a.txt"), bytes);
    const result = await executeReadFile(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      { path: "a.txt", startLine: 2, endLine: 2 },
    );
    expect(result.ok).toBe(true);
    expect(result.output).toBe("二");
    expect(result.metadata?.sha256).toBe(sha256Bytes(bytes));
    expect(JSON.stringify(result)).not.toContain(fixture.project);
  });

  it("denies sensitive files", async () => {
    const fixture = await createToolFixture();
    await fs.writeFile(path.join(fixture.project, ".env"), "TOKEN=hidden");
    const result = await executeReadFile(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      { path: ".env", startLine: 1 },
    );
    expect(result.error?.code).toBe("TOOL_SENSITIVE_PATH_DENIED");
    expect(JSON.stringify(result)).not.toContain("hidden");
  });

  it("rejects a line range outside the file", async () => {
    const fixture = await createToolFixture();
    await fs.writeFile(path.join(fixture.project, "a.txt"), "one");
    const result = await executeReadFile(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      { path: "a.txt", startLine: 2 },
    );
    expect(result.error?.code).toBe("FILE_CONTENT_INVALID");
  });
});
