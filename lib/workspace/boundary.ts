import type { Stats } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { redactSecrets, truncateUtf8 } from "@/lib/domain";

import {
  normalizeWorkspaceRelativePath,
  validateWorkspaceRootInput,
  workspaceRelativeSegments,
} from "./path-input";
import {
  WorkspaceLayerError,
  createWorkspaceError,
  type ExistingWorkspacePath,
  type ExpectedWorkspaceEntryKind,
  type ResolveExistingOptions,
  type ResolveWritableOptions,
  type WorkspaceEntryKind,
  type WorkspaceHandle,
  type WritableWorkspacePath,
} from "./types";

export interface WorkspaceFileSystem {
  realpath(targetPath: string): Promise<string>;
  stat(targetPath: string): Promise<Stats>;
  lstat(targetPath: string): Promise<Stats>;
}

export interface WorkspaceBoundaryOperations {
  createWorkspaceHandle(input: string): Promise<WorkspaceHandle>;
  resolveExistingWorkspacePath(
    workspace: WorkspaceHandle,
    input: string,
    options?: ResolveExistingOptions,
  ): Promise<ExistingWorkspacePath>;
  resolveWritableWorkspacePath(
    workspace: WorkspaceHandle,
    input: string,
    options?: ResolveWritableOptions,
  ): Promise<WritableWorkspacePath>;
  revalidateWritableWorkspacePath(
    workspace: WorkspaceHandle,
    previous: WritableWorkspacePath,
  ): Promise<WritableWorkspacePath>;
}

interface WorkspaceIdentity {
  rootPath: string;
  dev: number;
  ino: number;
}

interface WritableSnapshot {
  workspace: WorkspaceHandle;
  relativePath: string;
  absolutePath: string;
  parentPath: string;
  parentDev: number;
  parentIno: number;
  existed: boolean;
  targetDev?: number;
  targetIno?: number;
  targetKind?: WorkspaceEntryKind;
}

type FsContext = "root" | "root_identity" | "path" | "parent";

const ExistingOptionsSchema = z
  .strictObject({
    expectedKind: z.enum(["file", "directory", "any"]).optional(),
  })
  .optional();

const WritableOptionsSchema = z
  .strictObject({ allowExisting: z.boolean().optional() })
  .optional();

const nativeFileSystem: WorkspaceFileSystem = {
  realpath: fs.realpath,
  stat: fs.stat,
  lstat: fs.lstat,
};

function errnoCode(cause: unknown): string | undefined {
  if (cause === null || typeof cause !== "object" || !("code" in cause)) {
    return undefined;
  }
  return typeof cause.code === "string" ? cause.code : undefined;
}

function fsError(context: FsContext, cause: unknown): WorkspaceLayerError {
  const code = errnoCode(cause);
  if (code === "EACCES" || code === "EPERM") {
    return createWorkspaceError(
      "WORKSPACE_ACCESS_DENIED",
      "工作区路径不可访问",
      true,
      { reason: "access_denied" },
      cause,
    );
  }
  if (context === "root_identity") {
    return createWorkspaceError(
      "WORKSPACE_CHANGED",
      "工作区根目录已发生变化",
      true,
      { reason: code === undefined ? "identity_io_error" : "identity_changed" },
      cause,
    );
  }
  if (code === "ENOENT") {
    if (context === "root") {
      return createWorkspaceError(
        "WORKSPACE_ROOT_NOT_FOUND",
        "工作区根目录不存在",
        true,
        { field: "rootPath", reason: "not_found" },
        cause,
      );
    }
    if (context === "parent") {
      return createWorkspaceError(
        "WORKSPACE_PARENT_NOT_FOUND",
        "可写目标的父目录不存在",
        true,
        { reason: "parent_not_found" },
        cause,
      );
    }
    return createWorkspaceError(
      "WORKSPACE_PATH_NOT_FOUND",
      "工作区目标不存在",
      true,
      { reason: "path_not_found" },
      cause,
    );
  }
  if (code === "ENOTDIR") {
    if (context === "root") {
      return createWorkspaceError(
        "WORKSPACE_ROOT_NOT_DIRECTORY",
        "工作区根路径不是目录",
        true,
        { field: "rootPath", reason: "not_directory" },
        cause,
      );
    }
    if (context === "parent") {
      return createWorkspaceError(
        "WORKSPACE_PARENT_NOT_FOUND",
        "可写目标的父路径不是目录",
        true,
        { reason: "parent_not_directory" },
        cause,
      );
    }
    return createWorkspaceError(
      "WORKSPACE_PATH_NOT_FOUND",
      "工作区目标的父路径不是目录",
      true,
      { reason: "parent_not_directory" },
      cause,
    );
  }
  if (code === "ENAMETOOLONG" || code === "ELOOP") {
    return createWorkspaceError(
      context === "root" ? "WORKSPACE_INPUT_INVALID" : "WORKSPACE_PATH_INVALID",
      "工作区路径无法解析",
      true,
      { reason: code === "ELOOP" ? "symbolic_link_loop" : "path_too_long" },
      cause,
    );
  }
  return createWorkspaceError(
    "WORKSPACE_IO_ERROR",
    "工作区文件系统操作失败",
    false,
    { reason: "unexpected_io_error" },
    cause,
  );
}

function entryKind(stats: Stats): WorkspaceEntryKind {
  if (stats.isFile()) return "file";
  if (stats.isDirectory()) return "directory";
  return "other";
}

function publicRelativePath(relativePath: string): string {
  return truncateUtf8(redactSecrets(relativePath), 1_024).value;
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

function samePath(left: string, right: string): boolean {
  return path.normalize(left) === path.normalize(right);
}

function buildCandidate(rootPath: string, relativePath: string): string {
  let candidate = rootPath;
  for (const segment of workspaceRelativeSegments(relativePath)) {
    candidate = path.join(candidate, segment);
  }
  if (!isPathInside(rootPath, candidate)) {
    throw createWorkspaceError(
      "WORKSPACE_PATH_ESCAPE",
      "工具路径越过了当前工作区",
      true,
      {
        relativePath: publicRelativePath(relativePath),
        reason: "lexical_escape",
      },
    );
  }
  return candidate;
}

function parseExistingOptions(
  options: ResolveExistingOptions | undefined,
): ExpectedWorkspaceEntryKind {
  const parsed = ExistingOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw createWorkspaceError(
      "WORKSPACE_INPUT_INVALID",
      "现存路径解析选项无效",
      true,
      { field: "options", reason: "invalid_existing_options" },
    );
  }
  return parsed.data?.expectedKind ?? "any";
}

function parseWritableOptions(
  options: ResolveWritableOptions | undefined,
): boolean {
  const parsed = WritableOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw createWorkspaceError(
      "WORKSPACE_INPUT_INVALID",
      "可写路径解析选项无效",
      true,
      { field: "options", reason: "invalid_writable_options" },
    );
  }
  return parsed.data?.allowExisting ?? true;
}

export function createWorkspaceBoundaryForTesting(
  fileSystem: WorkspaceFileSystem,
): WorkspaceBoundaryOperations {
  const workspaceIdentities = new WeakMap<WorkspaceHandle, WorkspaceIdentity>();
  const writableSnapshots = new WeakMap<
    WritableWorkspacePath,
    WritableSnapshot
  >();

  async function createWorkspaceHandle(input: string): Promise<WorkspaceHandle> {
    const rootInput = validateWorkspaceRootInput(input);
    let rootPath: string;
    let rootStats: Stats;
    try {
      rootPath = await fileSystem.realpath(rootInput);
      rootStats = await fileSystem.stat(rootPath);
    } catch (cause) {
      throw fsError("root", cause);
    }
    if (!rootStats.isDirectory()) {
      throw createWorkspaceError(
        "WORKSPACE_ROOT_NOT_DIRECTORY",
        "工作区根路径不是目录",
        true,
        { field: "rootPath", reason: "not_directory" },
      );
    }
    if (samePath(rootPath, path.parse(rootPath).root)) {
      throw createWorkspaceError(
        "WORKSPACE_ROOT_TOO_BROAD",
        "文件系统根目录不能作为工作区",
        true,
        { field: "rootPath", reason: "filesystem_root" },
      );
    }

    const handle = Object.freeze({ rootPath }) as WorkspaceHandle;
    workspaceIdentities.set(handle, {
      rootPath,
      dev: rootStats.dev,
      ino: rootStats.ino,
    });
    return handle;
  }

  async function assertWorkspaceIdentity(
    workspace: WorkspaceHandle,
  ): Promise<WorkspaceIdentity> {
    if (
      workspace === null ||
      typeof workspace !== "object" ||
      !workspaceIdentities.has(workspace)
    ) {
      throw createWorkspaceError(
        "WORKSPACE_INPUT_INVALID",
        "工作区句柄无效",
        false,
        { field: "workspace", reason: "invalid_handle" },
      );
    }
    const identity = workspaceIdentities.get(workspace)!;
    let currentPath: string;
    let currentStats: Stats;
    try {
      currentPath = await fileSystem.realpath(identity.rootPath);
      currentStats = await fileSystem.stat(identity.rootPath);
    } catch (cause) {
      throw fsError("root_identity", cause);
    }
    if (
      !samePath(currentPath, identity.rootPath) ||
      !currentStats.isDirectory() ||
      currentStats.dev !== identity.dev ||
      currentStats.ino !== identity.ino
    ) {
      throw createWorkspaceError(
        "WORKSPACE_CHANGED",
        "工作区根目录已发生变化",
        true,
        { reason: "identity_changed" },
      );
    }
    return identity;
  }

  async function resolveExistingWorkspacePath(
    workspace: WorkspaceHandle,
    input: string,
    options?: ResolveExistingOptions,
  ): Promise<ExistingWorkspacePath> {
    const expectedKind = parseExistingOptions(options);
    const relativePath = normalizeWorkspaceRelativePath(input);
    const identity = await assertWorkspaceIdentity(workspace);
    const candidate = buildCandidate(identity.rootPath, relativePath);
    let logicalStats: Stats;
    let absolutePath: string;
    let targetStats: Stats;
    try {
      logicalStats = await fileSystem.lstat(candidate);
      absolutePath = await fileSystem.realpath(candidate);
      targetStats = await fileSystem.stat(absolutePath);
    } catch (cause) {
      throw fsError("path", cause);
    }
    if (!isPathInside(identity.rootPath, absolutePath)) {
      throw createWorkspaceError(
        "WORKSPACE_SYMLINK_ESCAPE",
        "符号链接目标位于工作区之外",
        true,
        {
          relativePath: publicRelativePath(relativePath),
          reason: "realpath_escape",
        },
      );
    }
    const kind = entryKind(targetStats);
    if (expectedKind !== "any" && expectedKind !== kind) {
      throw createWorkspaceError(
        "WORKSPACE_PATH_TYPE_MISMATCH",
        "工作区目标类型不符合要求",
        true,
        {
          relativePath: publicRelativePath(relativePath),
          expectedKind,
          actualKind: kind,
          reason: "entry_kind_mismatch",
        },
      );
    }
    return Object.freeze({
      relativePath,
      absolutePath,
      kind,
      followedSymbolicLink:
        logicalStats.isSymbolicLink() || !samePath(candidate, absolutePath),
    });
  }

  async function resolveWritableWorkspacePath(
    workspace: WorkspaceHandle,
    input: string,
    options?: ResolveWritableOptions,
  ): Promise<WritableWorkspacePath> {
    const allowExisting = parseWritableOptions(options);
    const relativePath = normalizeWorkspaceRelativePath(input);
    if (relativePath === ".") {
      throw createWorkspaceError(
        "WORKSPACE_PATH_INVALID",
        "工作区根目录不能作为可写文件目标",
        true,
        { relativePath: ".", reason: "root_write_target" },
      );
    }
    const identity = await assertWorkspaceIdentity(workspace);
    const logicalParentRelative = path.posix.dirname(relativePath);
    const parentCandidate = buildCandidate(
      identity.rootPath,
      logicalParentRelative,
    );
    let parentPath: string;
    let parentStats: Stats;
    try {
      parentPath = await fileSystem.realpath(parentCandidate);
      parentStats = await fileSystem.stat(parentPath);
    } catch (cause) {
      throw fsError("parent", cause);
    }
    if (!isPathInside(identity.rootPath, parentPath)) {
      throw createWorkspaceError(
        "WORKSPACE_SYMLINK_ESCAPE",
        "可写目标的父目录位于工作区之外",
        true,
        {
          relativePath: publicRelativePath(relativePath),
          reason: "parent_realpath_escape",
        },
      );
    }
    if (!parentStats.isDirectory()) {
      throw createWorkspaceError(
        "WORKSPACE_PARENT_NOT_FOUND",
        "可写目标的父路径不是目录",
        true,
        {
          relativePath: publicRelativePath(relativePath),
          reason: "parent_not_directory",
        },
      );
    }

    const absolutePath = path.join(parentPath, path.posix.basename(relativePath));
    if (!isPathInside(identity.rootPath, absolutePath)) {
      throw createWorkspaceError(
        "WORKSPACE_PATH_ESCAPE",
        "可写目标越过了当前工作区",
        true,
        {
          relativePath: publicRelativePath(relativePath),
          reason: "writable_escape",
        },
      );
    }

    let targetStats: Stats | undefined;
    try {
      targetStats = await fileSystem.lstat(absolutePath);
    } catch (cause) {
      if (errnoCode(cause) !== "ENOENT") {
        throw fsError("path", cause);
      }
    }

    let kind: WorkspaceEntryKind | undefined;
    if (targetStats) {
      if (targetStats.isSymbolicLink()) {
        throw createWorkspaceError(
          "WORKSPACE_FINAL_SYMLINK_WRITE_DENIED",
          "不能通过最终符号链接修改文件",
          true,
          {
            relativePath: publicRelativePath(relativePath),
            reason: "final_symbolic_link",
          },
        );
      }
      let targetRealPath: string;
      try {
        targetRealPath = await fileSystem.realpath(absolutePath);
      } catch (cause) {
        throw fsError("path", cause);
      }
      if (!isPathInside(identity.rootPath, targetRealPath)) {
        throw createWorkspaceError(
          "WORKSPACE_SYMLINK_ESCAPE",
          "可写目标位于工作区之外",
          true,
          {
            relativePath: publicRelativePath(relativePath),
            reason: "target_realpath_escape",
          },
        );
      }
      kind = entryKind(targetStats);
      if (kind !== "file") {
        throw createWorkspaceError(
          "WORKSPACE_PATH_TYPE_MISMATCH",
          "可写目标必须是普通文件或不存在的文件",
          true,
          {
            relativePath: publicRelativePath(relativePath),
            expectedKind: "file",
            actualKind: kind,
            reason: "writable_kind_mismatch",
          },
        );
      }
      if (!allowExisting) {
        throw createWorkspaceError(
          "WORKSPACE_EXISTING_TARGET_DENIED",
          "可写目标已经存在",
          true,
          {
            relativePath: publicRelativePath(relativePath),
            reason: "existing_target",
          },
        );
      }
    }

    const result = Object.freeze({
      relativePath,
      absolutePath,
      parentPath,
      existed: targetStats !== undefined,
      ...(kind === undefined ? {} : { kind }),
    }) as WritableWorkspacePath;
    writableSnapshots.set(result, {
      workspace,
      relativePath,
      absolutePath,
      parentPath,
      parentDev: parentStats.dev,
      parentIno: parentStats.ino,
      existed: targetStats !== undefined,
      ...(targetStats === undefined
        ? {}
        : {
            targetDev: targetStats.dev,
            targetIno: targetStats.ino,
            targetKind: kind,
          }),
    });
    return result;
  }

  async function revalidateWritableWorkspacePath(
    workspace: WorkspaceHandle,
    previous: WritableWorkspacePath,
  ): Promise<WritableWorkspacePath> {
    const previousSnapshot =
      previous !== null && typeof previous === "object"
        ? writableSnapshots.get(previous)
        : undefined;
    if (!previousSnapshot || previousSnapshot.workspace !== workspace) {
      throw createWorkspaceError(
        "WORKSPACE_INPUT_INVALID",
        "可写路径快照无效或不属于当前工作区",
        false,
        { field: "previous", reason: "invalid_writable_snapshot" },
      );
    }

    let current: WritableWorkspacePath;
    try {
      current = await resolveWritableWorkspacePath(
        workspace,
        previousSnapshot.relativePath,
        { allowExisting: true },
      );
    } catch (cause) {
      if (
        cause instanceof WorkspaceLayerError &&
        cause.error.code === "WORKSPACE_PATH_TYPE_MISMATCH"
      ) {
        throw createWorkspaceError(
          "WORKSPACE_PATH_CHANGED",
          "可写目标在执行前发生变化",
          true,
          {
            relativePath: publicRelativePath(previousSnapshot.relativePath),
            reason: "target_kind_changed",
          },
          cause,
        );
      }
      throw cause;
    }
    const currentSnapshot = writableSnapshots.get(current)!;
    if (
      currentSnapshot.relativePath !== previousSnapshot.relativePath ||
      !samePath(currentSnapshot.absolutePath, previousSnapshot.absolutePath) ||
      !samePath(currentSnapshot.parentPath, previousSnapshot.parentPath) ||
      currentSnapshot.parentDev !== previousSnapshot.parentDev ||
      currentSnapshot.parentIno !== previousSnapshot.parentIno ||
      currentSnapshot.existed !== previousSnapshot.existed ||
      currentSnapshot.targetDev !== previousSnapshot.targetDev ||
      currentSnapshot.targetIno !== previousSnapshot.targetIno ||
      currentSnapshot.targetKind !== previousSnapshot.targetKind
    ) {
      throw createWorkspaceError(
        "WORKSPACE_PATH_CHANGED",
        "可写目标在执行前发生变化",
        true,
        {
          relativePath: publicRelativePath(previousSnapshot.relativePath),
          reason: "writable_snapshot_changed",
        },
      );
    }
    return current;
  }

  return {
    createWorkspaceHandle,
    resolveExistingWorkspacePath,
    resolveWritableWorkspacePath,
    revalidateWritableWorkspacePath,
  };
}

const defaultBoundary = createWorkspaceBoundaryForTesting(nativeFileSystem);

export const createWorkspaceHandle = defaultBoundary.createWorkspaceHandle;
export const resolveExistingWorkspacePath =
  defaultBoundary.resolveExistingWorkspacePath;
export const resolveWritableWorkspacePath =
  defaultBoundary.resolveWritableWorkspacePath;
export const revalidateWritableWorkspacePath =
  defaultBoundary.revalidateWritableWorkspacePath;
