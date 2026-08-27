import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAX_WORKSPACE_PATH_BYTES,
  normalizeWorkspaceRelativePath,
  WorkspaceLayerError,
} from "@/lib/workspace";
import {
  validateWorkspaceRootInput,
  workspaceRelativeSegments,
} from "@/lib/workspace/path-input";

function workspaceError(work: () => unknown): WorkspaceLayerError {
  try {
    work();
    throw new Error("expected workspace error");
  } catch (error) {
    expect(error).toBeInstanceOf(WorkspaceLayerError);
    return error as WorkspaceLayerError;
  }
}

describe("workspace relative path normalization", () => {
  it.each([
    [".", "."],
    ["./", "."],
    ["src/file.ts", "src/file.ts"],
    ["./src//nested/./file.ts", "src/nested/file.ts"],
    ["包含 空格/文件.ts", "包含 空格/文件.ts"],
    [".../file", ".../file"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeWorkspaceRelativePath(input)).toBe(expected);
  });

  it.each([
    ["", "WORKSPACE_PATH_INVALID"],
    ["/etc/passwd", "WORKSPACE_PATH_ESCAPE"],
    ["//server/share", "WORKSPACE_PATH_ESCAPE"],
    ["C:/Windows", "WORKSPACE_PATH_ESCAPE"],
    ["C:\\Windows", "WORKSPACE_PATH_INVALID"],
    ["file://outside", "WORKSPACE_PATH_ESCAPE"],
    ["~/project", "WORKSPACE_PATH_ESCAPE"],
    ["../outside", "WORKSPACE_PATH_ESCAPE"],
    ["src/../outside", "WORKSPACE_PATH_ESCAPE"],
    ["src\\file.ts", "WORKSPACE_PATH_INVALID"],
    ["src\nfile.ts", "WORKSPACE_PATH_INVALID"],
    ["src\u007ffile.ts", "WORKSPACE_PATH_INVALID"],
  ])("rejects unsafe path %j", (input, expectedCode) => {
    expect(workspaceError(() => normalizeWorkspaceRelativePath(input)).error.code).toBe(
      expectedCode,
    );
  });

  it("validates path length by UTF-8 bytes", () => {
    const exactly = `${"界".repeat(1_365)}a`;
    expect(new TextEncoder().encode(exactly)).toHaveLength(
      MAX_WORKSPACE_PATH_BYTES,
    );
    expect(normalizeWorkspaceRelativePath(exactly)).toBe(exactly);

    const oversized = `${exactly}界`;
    const error = workspaceError(() =>
      normalizeWorkspaceRelativePath(oversized),
    );
    expect(error.error).toMatchObject({
      code: "WORKSPACE_PATH_INVALID",
      details: { reason: "too_long" },
    });
  });

  it("rejects non-string runtime input without echoing it", () => {
    const error = workspaceError(() =>
      normalizeWorkspaceRelativePath({ secret: "Bearer fake-token" }),
    );
    expect(error.error.code).toBe("WORKSPACE_PATH_INVALID");
    expect(JSON.stringify(error.error)).not.toContain("fake-token");
  });

  it("splits only already-normalized portable paths", () => {
    expect(workspaceRelativeSegments(".")).toEqual([]);
    expect(workspaceRelativeSegments("src/文件.ts")).toEqual([
      "src",
      "文件.ts",
    ]);
  });
});

describe("workspace root lexical validation", () => {
  it("accepts an absolute path without trimming it", () => {
    const absolute = path.resolve(path.parse(process.cwd()).root, "tmp", " project ");
    expect(validateWorkspaceRootInput(absolute)).toBe(absolute);
  });

  it.each([".", "project", "~/project", "file://project"])(
    "rejects non-absolute root %s",
    (input) => {
      expect(workspaceError(() => validateWorkspaceRootInput(input)).error.code).toBe(
        "WORKSPACE_ROOT_NOT_ABSOLUTE",
      );
    },
  );

  it("rejects invalid root input before platform path parsing", () => {
    expect(workspaceError(() => validateWorkspaceRootInput("")).error.code).toBe(
      "WORKSPACE_INPUT_INVALID",
    );
    expect(
      workspaceError(() => validateWorkspaceRootInput("/tmp/line\nbreak")).error
        .code,
    ).toBe("WORKSPACE_INPUT_INVALID");
  });
});
