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

  it("returns a 200-line page with lossless continuation metadata", async () => {
    const fixture = await createToolFixture();
    const text = Array.from({ length: 1_658 }, (_, index) => `脱敏内容-${index + 1}`)
      .join("\n");
    const bytes = Buffer.from(text);
    await fs.writeFile(path.join(fixture.project, "long.txt"), bytes);

    const first = await executeReadFile(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      { path: "long.txt", startLine: 1 },
    );
    expect(first.ok).toBe(true);
    expect(first.output?.split("\n")).toHaveLength(200);
    expect(first.metadata).toMatchObject({
      startLine: 1,
      endLine: 200,
      totalLines: 1_658,
      sha256: sha256Bytes(bytes),
      hasMore: true,
      nextStartLine: 201,
      pageLimited: true,
      pageByteTruncated: false,
      truncated: true,
      originalBytes: bytes.byteLength,
    });

    const second = await executeReadFile(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      { path: "long.txt", startLine: 201, endLine: 1_658 },
    );
    expect(second.output?.split("\n")[0]).toBe("脱敏内容-201");
    expect(second.metadata).toMatchObject({
      startLine: 201,
      endLine: 400,
      nextStartLine: 401,
      hasMore: true,
      pageLimited: true,
    });

    const reconstructed: string[] = [];
    let nextStartLine = 1;
    while (nextStartLine <= 1_658) {
      const page = await executeReadFile(
        { workspace: fixture.workspace, signal: new AbortController().signal },
        { path: "long.txt", startLine: nextStartLine },
      );
      reconstructed.push(...(page.output?.split("\n") ?? []));
      const next = page.metadata?.nextStartLine;
      if (typeof next !== "number") break;
      expect(next).toBeGreaterThan(nextStartLine);
      nextStartLine = next;
    }
    expect(reconstructed).toEqual(text.split("\n"));
  });

  it("distinguishes a byte-truncated oversized line from line pagination", async () => {
    const fixture = await createToolFixture();
    const oversized = "界".repeat(30_000);
    await fs.writeFile(path.join(fixture.project, "wide.txt"), oversized);
    const result = await executeReadFile(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      { path: "wide.txt", startLine: 1 },
    );
    expect(result.metadata).toMatchObject({
      hasMore: false,
      pageLimited: false,
      pageByteTruncated: true,
      truncated: true,
      originalBytes: Buffer.byteLength(oversized),
    });
  });

  it("honors cancellation before resolving or reading a path", async () => {
    const fixture = await createToolFixture();
    const controller = new AbortController();
    controller.abort("用户停止");
    await expect(executeReadFile(
      { workspace: fixture.workspace, signal: controller.signal },
      { path: "missing.txt", startLine: 1 },
    )).rejects.toMatchObject({ name: "LocalToolExecutionAbortedError" });
  });
});
