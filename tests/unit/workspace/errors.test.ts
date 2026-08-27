import path from "node:path";

import { describe, expect, it } from "vitest";

import { ErrorInfoSchema } from "@/lib/domain";
import {
  WORKSPACE_ERROR_CODES,
  WorkspaceLayerError,
} from "@/lib/workspace";
import {
  createWorkspaceBoundaryForTesting,
  type WorkspaceFileSystem,
} from "@/lib/workspace/boundary";
import { createWorkspaceError } from "@/lib/workspace/types";

import { errno } from "./helpers";

describe("workspace error boundary", () => {
  it("keeps a unique stable error vocabulary", () => {
    expect(WORKSPACE_ERROR_CODES).toHaveLength(17);
    expect(new Set(WORKSPACE_ERROR_CODES).size).toBe(
      WORKSPACE_ERROR_CODES.length,
    );
  });

  it("validates the public error and keeps cause private", () => {
    const cause = Object.assign(new Error("private stack"), {
      code: "EACCES",
      path: "/outside/private",
      syscall: "realpath",
    });
    const error = createWorkspaceError(
      "WORKSPACE_ACCESS_DENIED",
      "工作区不可访问",
      true,
      { field: "rootPath", reason: "access_denied" },
      cause,
    );

    expect(error).toBeInstanceOf(WorkspaceLayerError);
    expect(ErrorInfoSchema.parse(error.error)).toEqual(error.error);
    expect(Object.keys(error)).toEqual(["name", "error"]);
    expect(JSON.stringify(error)).not.toContain("/outside/private");
    expect(JSON.stringify(error)).not.toContain("private stack");
    expect(error.cause).toBe(cause);
  });

  it.each([
    ["ENOENT", "WORKSPACE_ROOT_NOT_FOUND"],
    ["ENOTDIR", "WORKSPACE_ROOT_NOT_DIRECTORY"],
    ["EACCES", "WORKSPACE_ACCESS_DENIED"],
    ["EPERM", "WORKSPACE_ACCESS_DENIED"],
    ["ENAMETOOLONG", "WORKSPACE_INPUT_INVALID"],
    ["ELOOP", "WORKSPACE_INPUT_INVALID"],
    ["EIO", "WORKSPACE_IO_ERROR"],
  ])("maps root errno %s to %s without leaking its path", async (code, expected) => {
    const privatePath = `/private/${code}/outside`;
    const fileSystem: WorkspaceFileSystem = {
      realpath: async () => {
        throw errno(code, privatePath);
      },
      stat: async () => {
        throw errno(code, privatePath);
      },
      lstat: async () => {
        throw errno(code, privatePath);
      },
    };
    const operations = createWorkspaceBoundaryForTesting(fileSystem);
    let captured: unknown;
    try {
      await operations.createWorkspaceHandle(path.resolve("synthetic-root"));
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(WorkspaceLayerError);
    const workspaceError = captured as WorkspaceLayerError;
    expect(workspaceError.error.code).toBe(expected);
    expect(JSON.stringify(workspaceError.error)).not.toContain(privatePath);
    expect(JSON.stringify(workspaceError.error)).not.toContain("realpath");
  });

  it("rejects unapproved public detail fields", () => {
    expect(() =>
      createWorkspaceError(
        "WORKSPACE_IO_ERROR",
        "error",
        false,
        { absolutePath: "/outside/private" } as never,
      ),
    ).toThrow();
  });
});
