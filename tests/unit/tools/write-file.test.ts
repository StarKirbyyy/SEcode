import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupAllToolFixtures,
  createToolFixture,
  runTool,
} from "./helpers";

afterEach(cleanupAllToolFixtures);

describe("write_file", () => {
  it("creates a new file atomically", async () => {
    const fixture = await createToolFixture();
    const result = await runTool(fixture.workspace, "write_file", {
      path: "created.txt",
      content: "新内容",
    });
    expect(result.ok).toBe(true);
    expect(result.metadata?.operation).toBe("create");
    await expect(
      fs.readFile(path.join(fixture.project, "created.txt"), "utf8"),
    ).resolves.toBe("新内容");
    expect((await fs.readdir(fixture.project)).join("\n")).not.toContain(
      ".secode-write-",
    );
  });

  it("overwrites an existing text file without a model-provided hash", async () => {
    const fixture = await createToolFixture();
    const target = path.join(fixture.project, "a.txt");
    await fs.writeFile(target, "before");
    const result = await runTool(fixture.workspace, "write_file", {
      path: "a.txt",
      content: "after",
    });
    expect(result.ok).toBe(true);
    await expect(fs.readFile(target, "utf8")).resolves.toBe("after");
  });

  it("does not persist complete content in public arguments", async () => {
    const fixture = await createToolFixture();
    const secretContent = "unique-private-content-for-test";
    const { prepareLocalToolCall } = await import("@/lib/tools");
    const { toolCall } = await import("./helpers");
    const prepared = prepareLocalToolCall(
      toolCall("write_file", { path: "a.txt", content: secretContent }),
    );
    expect(prepared.publicArguments).not.toHaveProperty("content");
    expect(prepared.publicArguments).toHaveProperty("contentSha256");
    expect(prepared.publicArguments).toHaveProperty("contentBytes");
    expect(fixture.workspace).toBeDefined();
  });
});
