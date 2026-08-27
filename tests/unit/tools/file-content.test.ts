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
      totalLines: 0,
    });
  });
});
