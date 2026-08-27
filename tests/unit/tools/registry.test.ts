import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  prepareLocalToolCall,
  type PreparedLocalToolInvocation,
} from "@/lib/tools";
import * as publicTools from "@/lib/tools";
import { executePreparedLocalTool } from "@/lib/tools/registry";

import {
  cleanupAllToolFixtures,
  createToolFixture,
  toolCall,
} from "./helpers";

afterEach(cleanupAllToolFixtures);

describe("local tool registry", () => {
  it("keeps handlers, adapters, atomic helpers, and path internals private", () => {
    expect(publicTools).not.toHaveProperty("executeReadFile");
    expect(publicTools).not.toHaveProperty("nativeToolDependencies");
    expect(publicTools).not.toHaveProperty("atomicWriteWorkspaceFile");
    expect(publicTools).not.toHaveProperty("isSensitiveWorkspacePath");
    expect(publicTools).not.toHaveProperty("executePreparedLocalTool");
    expect(publicTools).not.toHaveProperty("isPreparedLocalToolInvocation");
  });

  it("returns structured failures for unknown and invalid tools", () => {
    const unknown = prepareLocalToolCall(toolCall("missing_tool", {}));
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.result.error?.code).toBe("TOOL_UNKNOWN");

    const invalid = prepareLocalToolCall(
      toolCall("read_file", { path: "../escape" }),
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.result.error?.code).toBe("TOOL_ARGUMENTS_INVALID");
    }
  });

  it("rejects a forged prepared invocation", async () => {
    const fixture = await createToolFixture();
    const forged = {
      name: "read_file",
      arguments: { path: "a", startLine: 1 },
    } as unknown as PreparedLocalToolInvocation;
    const result = await executePreparedLocalTool(
      {
        workspace: fixture.workspace,
        signal: new AbortController().signal,
      },
      forged,
    );
    expect(result.error?.code).toBe("TOOL_ARGUMENTS_INVALID");
  });

  it("executes an internal list-read-create-replace regression flow", async () => {
    const fixture = await createToolFixture();
    await fs.writeFile(path.join(fixture.project, "a.txt"), "before");
    const read = prepareLocalToolCall(toolCall("read_file", { path: "a.txt" }));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(Object.isFrozen(read.invocation)).toBe(true);
    expect(Object.isFrozen(read.invocation.arguments)).toBe(true);
    const readResult = await executePreparedLocalTool(
      {
        workspace: fixture.workspace,
        signal: new AbortController().signal,
      },
      read.invocation,
    );
    const hash = readResult.metadata?.sha256;
    expect(typeof hash).toBe("string");

    const replace = prepareLocalToolCall(
      toolCall("replace_in_file", {
        path: "a.txt",
        oldText: "before",
        newText: "after",
        expectedSha256: hash as string,
      }),
    );
    expect(replace.ok).toBe(true);
    if (!replace.ok) return;
    const replaceResult = await executePreparedLocalTool(
      {
        workspace: fixture.workspace,
        signal: new AbortController().signal,
      },
      replace.invocation,
    );
    expect(replaceResult.ok).toBe(true);
    await expect(
      fs.readFile(path.join(fixture.project, "a.txt"), "utf8"),
    ).resolves.toBe("after");
  });
});
