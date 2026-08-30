import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { nativeToolDependencies } from "@/lib/tools/dependencies";
import {
  readTextFileAbsolute,
  selectLineRange,
  sha256Bytes,
} from "@/lib/tools/file-content";

import {
  cleanupAllToolFixtures,
  cleanupToolFixture,
  createToolFixture,
} from "./helpers";

afterEach(cleanupAllToolFixtures);

describe("text file content", () => {
  it("hashes raw bytes and selects inclusive lines", async () => {
    const fixture = await createToolFixture();
    const target = path.join(fixture.project, "a.txt");
    await fs.writeFile(target, "甲\r\n乙\n尾");
    const content = await readTextFileAbsolute(target, nativeToolDependencies);
    expect(content.sha256).toBe(sha256Bytes(Buffer.from("甲\r\n乙\n尾")));
    expect(selectLineRange(content.text, 2, 3).value).toBe("乙\n尾");
    await cleanupToolFixture(fixture.root);
  });

  it("rejects NUL and invalid UTF-8", async () => {
    const fixture = await createToolFixture();
    const target = path.join(fixture.project, "binary");
    await fs.writeFile(target, Buffer.from([0, 1, 2]));
    await expect(
      readTextFileAbsolute(target, nativeToolDependencies),
    ).rejects.toMatchObject({ code: "binary" });
  });

  it("represents an empty file without inventing content", () => {
    expect(selectLineRange("", 1)).toEqual({
      value: "",
      startLine: 1,
      endLine: 0,
      requestedEndLine: 0,
      totalLines: 0,
      hasMore: false,
      pageLimited: false,
      requestedBytes: 0,
    });
  });

  it("selects long files as consecutive pages of at most 200 lines", () => {
    const text = Array.from({ length: 1_658 }, (_, index) => `脱敏行-${index + 1}`)
      .join("\n");
    const first = selectLineRange(text, 1);
    expect(first).toMatchObject({
      startLine: 1,
      endLine: 200,
      requestedEndLine: 1_658,
      totalLines: 1_658,
      hasMore: true,
      nextStartLine: 201,
      pageLimited: true,
    });
    expect(first.value.split("\n")).toHaveLength(200);

    const last = selectLineRange(text, 1_601);
    expect(last).toMatchObject({
      startLine: 1_601,
      endLine: 1_658,
      requestedEndLine: 1_658,
      hasMore: false,
      pageLimited: false,
    });
    expect(last.value.split("\n")).toEqual(
      Array.from({ length: 58 }, (_, index) => `脱敏行-${index + 1_601}`),
    );
  });

  it("limits an explicit large range without skipping its requested boundary", () => {
    const text = Array.from({ length: 300 }, (_, index) => `行-${index + 1}`)
      .join("\n");
    expect(selectLineRange(text, 51, 275)).toMatchObject({
      startLine: 51,
      endLine: 250,
      requestedEndLine: 275,
      nextStartLine: 251,
      hasMore: true,
      pageLimited: true,
    });
  });
});
