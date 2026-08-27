import * as fs from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  createWorkspaceHandle,
  resolveExistingWorkspacePath,
  resolveWritableWorkspacePath,
  revalidateWritableWorkspacePath,
  WorkspaceLayerError,
  type WorkspaceHandle,
  type WritableWorkspacePath,
} from "@/lib/workspace";
import {
  createWorkspaceBoundaryForTesting,
  type WorkspaceBoundaryOperations,
  type WorkspaceFileSystem,
} from "@/lib/workspace/boundary";

import {
  cleanupAllWorkspaceFixtures,
  createWorkspaceFixture,
  type WorkspaceFixture,
} from "./helpers";

const nativeFileSystem: WorkspaceFileSystem = {
  realpath: fs.realpath,
  stat: fs.stat,
  lstat: fs.lstat,
};

function boundary(): WorkspaceBoundaryOperations {
  return createWorkspaceBoundaryForTesting(nativeFileSystem);
}

async function captureWorkspaceError(
  work: Promise<unknown>,
): Promise<WorkspaceLayerError> {
  try {
    await work;
    throw new Error("expected workspace error");
  } catch (error) {
    expect(error).toBeInstanceOf(WorkspaceLayerError);
    return error as WorkspaceLayerError;
  }
}

async function withFixture(): Promise<WorkspaceFixture> {
  return createWorkspaceFixture();
}

afterEach(async () => {
  await cleanupAllWorkspaceFixtures();
});

afterAll(async () => {
  await cleanupAllWorkspaceFixtures();
});

describe("workspace root boundary", () => {
  it("supports the complete public barrel workflow", async () => {
    const fixture = await withFixture();
    const handle = await createWorkspaceHandle(fixture.workspace);
    await expect(
      resolveExistingWorkspacePath(handle, ".", {
        expectedKind: "directory",
      }),
    ).resolves.toMatchObject({ kind: "directory" });
    const writable = await resolveWritableWorkspacePath(handle, "new.ts");
    const revalidated = await revalidateWritableWorkspacePath(handle, writable);

    expect(revalidated).toEqual(writable);
    const serialized = JSON.stringify(revalidated);
    expect(serialized).not.toMatch(/dev|ino|snapshot/i);
  });

  it("creates an immutable handle bound to the canonical directory", async () => {
    const fixture = await withFixture();
    const handle = await createWorkspaceHandle(fixture.workspace);

    expect(handle.rootPath).toBe(await fs.realpath(fixture.workspace));
    expect(Object.isFrozen(handle)).toBe(true);
    expect(JSON.parse(JSON.stringify(handle))).toEqual({
      rootPath: handle.rootPath,
    });
  });

  it("binds a root symlink to its real directory", async () => {
    const fixture = await withFixture();
    const alias = path.join(fixture.root, "project-alias");
    await fs.symlink(fixture.workspace, alias, "dir");

    const handle = await boundary().createWorkspaceHandle(alias);
    expect(handle.rootPath).toBe(await fs.realpath(fixture.workspace));
  });

  it("rejects missing roots, regular files and the filesystem root", async () => {
    const fixture = await withFixture();
    const file = path.join(fixture.root, "file.txt");
    await fs.writeFile(file, "fixed fixture", "utf8");
    const operations = boundary();

    await expect(
      captureWorkspaceError(
        operations.createWorkspaceHandle(path.join(fixture.root, "missing")),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_ROOT_NOT_FOUND" } });
    await expect(
      captureWorkspaceError(operations.createWorkspaceHandle(file)),
    ).resolves.toMatchObject({
      error: { code: "WORKSPACE_ROOT_NOT_DIRECTORY" },
    });
    await expect(
      captureWorkspaceError(
        operations.createWorkspaceHandle(path.parse(fixture.root).root),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_ROOT_TOO_BROAD" } });
  });

  it("rejects forged and cross-boundary handles", async () => {
    const fixture = await withFixture();
    const first = boundary();
    const second = boundary();
    const handle = await first.createWorkspaceHandle(fixture.workspace);
    const forged = { rootPath: fixture.workspace } as WorkspaceHandle;

    await expect(
      captureWorkspaceError(first.resolveExistingWorkspacePath(forged, ".")),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_INPUT_INVALID" } });
    await expect(
      captureWorkspaceError(second.resolveExistingWorkspacePath(handle, ".")),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_INPUT_INVALID" } });
  });

  it("invalidates a handle after the root is deleted and recreated", async () => {
    const fixture = await withFixture();
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);
    await fs.rmdir(fixture.workspace);
    await fs.mkdir(fixture.workspace);

    await expect(
      captureWorkspaceError(operations.resolveExistingWorkspacePath(handle, ".")),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_CHANGED" } });
  });

  it("invalidates a handle after the root becomes an external symlink", async () => {
    const fixture = await withFixture();
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);
    await fs.rename(fixture.workspace, path.join(fixture.root, "project-old"));
    await fs.symlink(fixture.outside, fixture.workspace, "dir");

    const error = await captureWorkspaceError(
      operations.resolveExistingWorkspacePath(handle, "."),
    );
    expect(error.error.code).toBe("WORKSPACE_CHANGED");
    expect(JSON.stringify(error.error)).not.toContain(fixture.outside);
  });
});

describe("existing workspace path resolution", () => {
  it("resolves root, files, directories and Unicode paths", async () => {
    const fixture = await withFixture();
    const directory = path.join(fixture.workspace, "源 代码");
    const file = path.join(directory, "入口.ts");
    await fs.mkdir(directory);
    await fs.writeFile(file, "export {};", "utf8");
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);

    await expect(
      operations.resolveExistingWorkspacePath(handle, ".", {
        expectedKind: "directory",
      }),
    ).resolves.toMatchObject({
      relativePath: ".",
      absolutePath: handle.rootPath,
      kind: "directory",
      followedSymbolicLink: false,
    });
    await expect(
      operations.resolveExistingWorkspacePath(handle, "源 代码/入口.ts", {
        expectedKind: "file",
      }),
    ).resolves.toMatchObject({
      relativePath: "源 代码/入口.ts",
      absolutePath: await fs.realpath(file),
      kind: "file",
    });
  });

  it("rejects kind mismatches and malformed runtime options", async () => {
    const fixture = await withFixture();
    const file = path.join(fixture.workspace, "file.ts");
    await fs.writeFile(file, "text", "utf8");
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);

    const mismatch = await captureWorkspaceError(
      operations.resolveExistingWorkspacePath(handle, "file.ts", {
        expectedKind: "directory",
      }),
    );
    expect(mismatch.error).toMatchObject({
      code: "WORKSPACE_PATH_TYPE_MISMATCH",
      details: { expectedKind: "directory", actualKind: "file" },
    });
    await expect(
      captureWorkspaceError(
        operations.resolveExistingWorkspacePath(handle, "file.ts", {
          expectedKind: "file",
          extra: true,
        } as never),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_INPUT_INVALID" } });
  });

  it("redacts secret-shaped relative paths in public errors", async () => {
    const fixture = await withFixture();
    const secretName = "Bearer secret-token";
    await fs.mkdir(path.join(fixture.workspace, secretName));
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);
    const error = await captureWorkspaceError(
      operations.resolveExistingWorkspacePath(handle, secretName, {
        expectedKind: "file",
      }),
    );

    expect(error.error.code).toBe("WORKSPACE_PATH_TYPE_MISMATCH");
    expect(JSON.stringify(error.error)).not.toContain("secret-token");
    expect(JSON.stringify(error.error)).toContain("[REDACTED]");
  });

  it("allows internal file and directory symlinks", async () => {
    const fixture = await withFixture();
    const directory = path.join(fixture.workspace, "real-dir");
    const file = path.join(directory, "real.ts");
    await fs.mkdir(directory);
    await fs.writeFile(file, "text", "utf8");
    await fs.symlink(file, path.join(fixture.workspace, "file-link"), "file");
    await fs.symlink(directory, path.join(fixture.workspace, "dir-link"), "dir");
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);

    await expect(
      operations.resolveExistingWorkspacePath(handle, "file-link", {
        expectedKind: "file",
      }),
    ).resolves.toMatchObject({
      absolutePath: await fs.realpath(file),
      followedSymbolicLink: true,
    });
    await expect(
      operations.resolveExistingWorkspacePath(handle, "dir-link/real.ts", {
        expectedKind: "file",
      }),
    ).resolves.toMatchObject({
      absolutePath: await fs.realpath(file),
      followedSymbolicLink: true,
    });
  });

  it("rejects sibling-prefix, final and parent symlink escapes", async () => {
    const fixture = await withFixture();
    const outsideFile = path.join(fixture.outside, "secret.txt");
    await fs.writeFile(outsideFile, "outside", "utf8");
    await fs.symlink(
      outsideFile,
      path.join(fixture.workspace, "outside-file"),
      "file",
    );
    await fs.symlink(
      fixture.outside,
      path.join(fixture.workspace, "outside-dir"),
      "dir",
    );
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);

    for (const relativePath of ["outside-file", "outside-dir/secret.txt"]) {
      const error = await captureWorkspaceError(
        operations.resolveExistingWorkspacePath(handle, relativePath),
      );
      expect(error.error.code).toBe("WORKSPACE_SYMLINK_ESCAPE");
      expect(JSON.stringify(error.error)).not.toContain(fixture.outside);
    }
  });

  it("maps dangling and looping symlinks to finite path errors", async () => {
    const fixture = await withFixture();
    await fs.symlink(
      path.join(fixture.workspace, "missing"),
      path.join(fixture.workspace, "dangling"),
      "file",
    );
    await fs.symlink("loop-b", path.join(fixture.workspace, "loop-a"), "file");
    await fs.symlink("loop-a", path.join(fixture.workspace, "loop-b"), "file");
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);

    await expect(
      captureWorkspaceError(
        operations.resolveExistingWorkspacePath(handle, "dangling"),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_PATH_NOT_FOUND" } });
    await expect(
      captureWorkspaceError(
        operations.resolveExistingWorkspacePath(handle, "loop-a"),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_PATH_INVALID" } });
  });

  it.runIf(process.platform !== "win32")(
    "classifies a Unix socket as other without reading it",
    async () => {
      const fixture = await withFixture();
      const socketPath = path.join(fixture.workspace, "agent.sock");
      const server = createServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
      });
      try {
        const operations = boundary();
        const handle = await operations.createWorkspaceHandle(fixture.workspace);
        await expect(
          operations.resolveExistingWorkspacePath(handle, "agent.sock"),
        ).resolves.toMatchObject({ kind: "other" });
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
});

describe("writable workspace path resolution", () => {
  it("resolves existing files and missing leaves under a real parent", async () => {
    const fixture = await withFixture();
    const directory = path.join(fixture.workspace, "src");
    const file = path.join(directory, "existing.ts");
    await fs.mkdir(directory);
    await fs.writeFile(file, "text", "utf8");
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);

    const existing = await operations.resolveWritableWorkspacePath(
      handle,
      "src/existing.ts",
    );
    expect(existing).toMatchObject({
      relativePath: "src/existing.ts",
      absolutePath: await fs.realpath(file),
      parentPath: await fs.realpath(directory),
      existed: true,
      kind: "file",
    });
    expect(Object.isFrozen(existing)).toBe(true);

    await expect(
      operations.resolveWritableWorkspacePath(handle, "src/new.ts"),
    ).resolves.toMatchObject({
      relativePath: "src/new.ts",
      absolutePath: path.join(await fs.realpath(directory), "new.ts"),
      existed: false,
    });
  });

  it("rejects missing parents, directories, root and existing conflicts", async () => {
    const fixture = await withFixture();
    const file = path.join(fixture.workspace, "existing.ts");
    await fs.writeFile(file, "text", "utf8");
    await fs.mkdir(path.join(fixture.workspace, "directory"));
    await fs.writeFile(path.join(fixture.workspace, "parent-file"), "text", "utf8");
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);

    await expect(
      captureWorkspaceError(
        operations.resolveWritableWorkspacePath(handle, "missing/new.ts"),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_PARENT_NOT_FOUND" } });
    await expect(
      captureWorkspaceError(
        operations.resolveWritableWorkspacePath(handle, "parent-file/new.ts"),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_PARENT_NOT_FOUND" } });
    await expect(
      captureWorkspaceError(
        operations.resolveWritableWorkspacePath(handle, "directory"),
      ),
    ).resolves.toMatchObject({
      error: { code: "WORKSPACE_PATH_TYPE_MISMATCH" },
    });
    await expect(
      captureWorkspaceError(
        operations.resolveWritableWorkspacePath(handle, "."),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_PATH_INVALID" } });
    await expect(
      captureWorkspaceError(
        operations.resolveWritableWorkspacePath(handle, "existing.ts", {
          allowExisting: false,
        }),
      ),
    ).resolves.toMatchObject({
      error: { code: "WORKSPACE_EXISTING_TARGET_DENIED" },
    });
  });

  it("denies both internal and external final symlinks", async () => {
    const fixture = await withFixture();
    const internal = path.join(fixture.workspace, "internal.ts");
    const external = path.join(fixture.outside, "external.ts");
    await Promise.all([
      fs.writeFile(internal, "internal", "utf8"),
      fs.writeFile(external, "external", "utf8"),
    ]);
    await fs.symlink(internal, path.join(fixture.workspace, "internal-link"), "file");
    await fs.symlink(external, path.join(fixture.workspace, "external-link"), "file");
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);

    for (const target of ["internal-link", "external-link"]) {
      await expect(
        captureWorkspaceError(
          operations.resolveWritableWorkspacePath(handle, target),
        ),
      ).resolves.toMatchObject({
        error: { code: "WORKSPACE_FINAL_SYMLINK_WRITE_DENIED" },
      });
    }
  });

  it("canonicalizes an internal parent symlink and rejects an external one", async () => {
    const fixture = await withFixture();
    const internal = path.join(fixture.workspace, "real-parent");
    await fs.mkdir(internal);
    await fs.symlink(internal, path.join(fixture.workspace, "parent-link"), "dir");
    await fs.symlink(
      fixture.outside,
      path.join(fixture.workspace, "outside-parent"),
      "dir",
    );
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);

    await expect(
      operations.resolveWritableWorkspacePath(handle, "parent-link/new.ts"),
    ).resolves.toMatchObject({
      parentPath: await fs.realpath(internal),
      absolutePath: path.join(await fs.realpath(internal), "new.ts"),
    });
    await expect(
      captureWorkspaceError(
        operations.resolveWritableWorkspacePath(
          handle,
          "outside-parent/new.ts",
        ),
      ),
    ).resolves.toMatchObject({
      error: { code: "WORKSPACE_SYMLINK_ESCAPE" },
    });
  });

  it("rejects malformed writable options", async () => {
    const fixture = await withFixture();
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);
    await expect(
      captureWorkspaceError(
        operations.resolveWritableWorkspacePath(handle, "new.ts", {
          allowExisting: true,
          extra: true,
        } as never),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_INPUT_INVALID" } });
  });
});

describe("writable path revalidation", () => {
  it("returns a new immutable result when nothing changed", async () => {
    const fixture = await withFixture();
    const file = path.join(fixture.workspace, "file.ts");
    await fs.writeFile(file, "text", "utf8");
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);
    const previous = await operations.resolveWritableWorkspacePath(
      handle,
      "file.ts",
    );
    const current = await operations.revalidateWritableWorkspacePath(
      handle,
      previous,
    );

    expect(current).not.toBe(previous);
    expect(current).toEqual(previous);
    expect(Object.isFrozen(current)).toBe(true);
  });

  it("detects a missing target being created", async () => {
    const fixture = await withFixture();
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);
    const previous = await operations.resolveWritableWorkspacePath(
      handle,
      "new.ts",
    );
    await fs.writeFile(path.join(fixture.workspace, "new.ts"), "new", "utf8");

    await expect(
      captureWorkspaceError(
        operations.revalidateWritableWorkspacePath(handle, previous),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_PATH_CHANGED" } });
  });

  it("detects deletion and atomic replacement of an existing target", async () => {
    const fixture = await withFixture();
    const file = path.join(fixture.workspace, "file.ts");
    await fs.writeFile(file, "old", "utf8");
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);
    const deleted = await operations.resolveWritableWorkspacePath(
      handle,
      "file.ts",
    );
    await fs.unlink(file);
    await expect(
      captureWorkspaceError(
        operations.revalidateWritableWorkspacePath(handle, deleted),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_PATH_CHANGED" } });

    await fs.writeFile(file, "old again", "utf8");
    const replaced = await operations.resolveWritableWorkspacePath(
      handle,
      "file.ts",
    );
    const replacement = path.join(fixture.workspace, "replacement.tmp");
    await fs.writeFile(replacement, "replacement", "utf8");
    await fs.rename(replacement, file);
    await expect(
      captureWorkspaceError(
        operations.revalidateWritableWorkspacePath(handle, replaced),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_PATH_CHANGED" } });
  });

  it("detects target kind and parent identity changes", async () => {
    const fixture = await withFixture();
    const parent = path.join(fixture.workspace, "src");
    const file = path.join(parent, "file.ts");
    await fs.mkdir(parent);
    await fs.writeFile(file, "text", "utf8");
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);
    const previous = await operations.resolveWritableWorkspacePath(
      handle,
      "src/file.ts",
    );
    await fs.unlink(file);
    await fs.mkdir(file);
    await expect(
      captureWorkspaceError(
        operations.revalidateWritableWorkspacePath(handle, previous),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_PATH_CHANGED" } });

    await fs.rmdir(file);
    await fs.writeFile(file, "text", "utf8");
    const parentPrevious = await operations.resolveWritableWorkspacePath(
      handle,
      "src/file.ts",
    );
    const oldParent = path.join(fixture.workspace, "src-old");
    await fs.rename(parent, oldParent);
    await fs.mkdir(parent);
    await fs.writeFile(path.join(parent, "file.ts"), "replacement", "utf8");
    await expect(
      captureWorkspaceError(
        operations.revalidateWritableWorkspacePath(handle, parentPrevious),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_PATH_CHANGED" } });
  });

  it("rejects a parent replaced by an external symlink", async () => {
    const fixture = await withFixture();
    const parent = path.join(fixture.workspace, "src");
    await fs.mkdir(parent);
    const operations = boundary();
    const handle = await operations.createWorkspaceHandle(fixture.workspace);
    const previous = await operations.resolveWritableWorkspacePath(
      handle,
      "src/new.ts",
    );
    await fs.rename(parent, path.join(fixture.workspace, "src-old"));
    await fs.symlink(fixture.outside, parent, "dir");

    await expect(
      captureWorkspaceError(
        operations.revalidateWritableWorkspacePath(handle, previous),
      ),
    ).resolves.toMatchObject({
      error: { code: "WORKSPACE_SYMLINK_ESCAPE" },
    });
  });

  it("rejects forged, cross-workspace and cross-boundary snapshots", async () => {
    const fixture = await withFixture();
    const first = boundary();
    const second = boundary();
    const firstHandle = await first.createWorkspaceHandle(fixture.workspace);
    const outsideHandle = await first.createWorkspaceHandle(fixture.outside);
    const previous = await first.resolveWritableWorkspacePath(
      firstHandle,
      "new.ts",
    );
    const forged = {
      relativePath: "new.ts",
      absolutePath: path.join(fixture.workspace, "new.ts"),
      parentPath: fixture.workspace,
      existed: false,
    } as WritableWorkspacePath;

    await expect(
      captureWorkspaceError(
        first.revalidateWritableWorkspacePath(firstHandle, forged),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_INPUT_INVALID" } });
    await expect(
      captureWorkspaceError(
        first.revalidateWritableWorkspacePath(outsideHandle, previous),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_INPUT_INVALID" } });
    await expect(
      captureWorkspaceError(
        second.revalidateWritableWorkspacePath(firstHandle, previous),
      ),
    ).resolves.toMatchObject({ error: { code: "WORKSPACE_INPUT_INVALID" } });
  });
});
