import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";

import {
  createWorkspaceHandle,
  resolveExistingWorkspacePath,
  WorkspaceLayerError,
  type ExistingWorkspacePath,
  type WorkspaceHandle,
} from "@/lib/workspace";

import { createServerError, ServerLayerError } from "./errors";
import {
  BrowseWorkspaceRequestSchema,
  MAX_WORKSPACE_PICKER_DIRECTORIES,
} from "./schemas";
import type {
  BrowseWorkspaceDirectory,
  BrowseWorkspaceRequest,
  BrowseWorkspaceResponse,
} from "./types";

const IGNORED_NAMES = new Set([".git", "node_modules", ".next", ".secode-data"]);

export interface WorkspacePickerFileSystem {
  readdir(targetPath: string): Promise<Dirent[]>;
}

export interface WorkspacePickerService {
  browse(input: BrowseWorkspaceRequest): Promise<BrowseWorkspaceResponse>;
  assertSelection(workspacePath: string): Promise<string>;
}

interface WorkspacePickerDependencies {
  env?: Readonly<Record<string, string | undefined>>;
  fileSystem?: WorkspacePickerFileSystem;
  createWorkspace?: (rootPath: string) => Promise<WorkspaceHandle>;
  resolveExisting?: (
    workspace: WorkspaceHandle,
    relativePath: string,
    options: { expectedKind: "directory" },
  ) => Promise<ExistingWorkspacePath>;
}

interface PickerRoot {
  handle: WorkspaceHandle;
  label: string;
}

const nativeFileSystem: WorkspacePickerFileSystem = {
  readdir: (targetPath) => fs.readdir(targetPath, { withFileTypes: true }),
};

function finiteError(
  code:
    | "API_WORKSPACE_PICKER_UNAVAILABLE"
    | "API_WORKSPACE_PICKER_CONFIG_INVALID"
    | "API_WORKSPACE_PICKER_PATH_INVALID"
    | "API_WORKSPACE_PICKER_PATH_FORBIDDEN"
    | "API_WORKSPACE_PICKER_IO_ERROR",
  message: string,
  recoverable = true,
): ServerLayerError {
  return createServerError(code, message, recoverable);
}

function configuredRootError(): ServerLayerError {
  return finiteError(
    "API_WORKSPACE_PICKER_CONFIG_INVALID",
    "工作区目录选择器配置无效",
    true,
  );
}

function currentPathError(error: unknown): ServerLayerError {
  if (error instanceof WorkspaceLayerError) {
    if (
      error.error.code === "WORKSPACE_PATH_ESCAPE" ||
      error.error.code === "WORKSPACE_SYMLINK_ESCAPE"
    ) {
      return finiteError(
        "API_WORKSPACE_PICKER_PATH_FORBIDDEN",
        "请求的目录位于允许范围之外",
      );
    }
    if (error.error.code === "WORKSPACE_CHANGED") {
      return finiteError(
        "API_WORKSPACE_PICKER_UNAVAILABLE",
        "工作区目录选择器根目录已失效，请重启服务",
      );
    }
    if (
      error.error.code === "WORKSPACE_PATH_INVALID" ||
      error.error.code === "WORKSPACE_PATH_NOT_FOUND" ||
      error.error.code === "WORKSPACE_PATH_TYPE_MISMATCH"
    ) {
      return finiteError(
        "API_WORKSPACE_PICKER_PATH_INVALID",
        "请求的目录不存在或已发生变化",
      );
    }
  }
  return finiteError(
    "API_WORKSPACE_PICKER_IO_ERROR",
    "无法读取工作区目录",
    false,
  );
}

function compareNames(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function createWorkspacePickerService(
  dependencies: WorkspacePickerDependencies = {},
): WorkspacePickerService {
  const env = dependencies.env ?? process.env;
  const fileSystem = dependencies.fileSystem ?? nativeFileSystem;
  const createWorkspace = dependencies.createWorkspace ?? createWorkspaceHandle;
  const resolveExisting = dependencies.resolveExisting ?? resolveExistingWorkspacePath;
  let rootPromise: Promise<PickerRoot> | undefined;

  const loadRoot = (): Promise<PickerRoot> => {
    if (rootPromise !== undefined) return rootPromise;
    rootPromise = (async () => {
      const configured = env.SECODE_WORKSPACE_PICKER_ROOT;
      if (configured === undefined || configured.trim().length === 0) {
        throw finiteError(
          "API_WORKSPACE_PICKER_UNAVAILABLE",
          "工作区目录选择器未配置，请设置 SECODE_WORKSPACE_PICKER_ROOT",
        );
      }
      try {
        const handle = await createWorkspace(configured);
        return Object.freeze({
          handle,
          label: path.basename(handle.rootPath) || handle.rootPath,
        });
      } catch {
        throw configuredRootError();
      }
    })();
    return rootPromise;
  };

  return {
    async assertSelection(workspacePath) {
      const root = await loadRoot();
      if (typeof workspacePath !== "string" || !path.isAbsolute(workspacePath)) {
        throw finiteError(
          "API_WORKSPACE_PICKER_PATH_INVALID",
          "选择的工作区路径无效",
        );
      }
      const relative = path.relative(root.handle.rootPath, workspacePath);
      if (
        path.isAbsolute(relative) ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`)
      ) {
        throw finiteError(
          "API_WORKSPACE_PICKER_PATH_FORBIDDEN",
          "选择的工作区位于允许范围之外",
        );
      }
      try {
        const resolved = await resolveExisting(
          root.handle,
          relative === "" ? "." : relative.split(path.sep).join("/"),
          { expectedKind: "directory" },
        );
        if (path.normalize(resolved.absolutePath) !== path.normalize(workspacePath)) {
          throw finiteError(
            "API_WORKSPACE_PICKER_PATH_INVALID",
            "选择的工作区已发生变化",
          );
        }
        return resolved.absolutePath;
      } catch (error) {
        if (error instanceof ServerLayerError) throw error;
        throw currentPathError(error);
      }
    },

    async browse(input) {
      const parsed = BrowseWorkspaceRequestSchema.safeParse(input);
      if (!parsed.success) {
        throw finiteError(
          "API_WORKSPACE_PICKER_PATH_INVALID",
          "工作区目录选择请求无效",
        );
      }

      const root = await loadRoot();
      const segments = [...parsed.data.segments];
      const relativePath = segments.length === 0 ? "." : segments.join("/");
      let current: ExistingWorkspacePath;
      try {
        current = await resolveExisting(root.handle, relativePath, {
          expectedKind: "directory",
        });
      } catch (error) {
        throw currentPathError(error);
      }

      let entries: Dirent[];
      try {
        entries = await fileSystem.readdir(current.absolutePath);
      } catch {
        throw finiteError(
          "API_WORKSPACE_PICKER_IO_ERROR",
          "无法读取工作区目录",
          false,
        );
      }

      let blockedEntries = 0;
      let ignoredEntries = 0;
      const directories: BrowseWorkspaceDirectory[] = [];
      for (const entry of entries) {
        if (IGNORED_NAMES.has(entry.name)) {
          ignoredEntries += 1;
          continue;
        }
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          ignoredEntries += 1;
          continue;
        }
        const entrySegments = [...segments, entry.name];
        try {
          const resolved = await resolveExisting(
            root.handle,
            entrySegments.join("/"),
            { expectedKind: "directory" },
          );
          directories.push({
            name: entry.name,
            segments: entrySegments,
            symbolicLink: resolved.followedSymbolicLink,
          });
        } catch {
          blockedEntries += 1;
        }
      }

      try {
        const after = await resolveExisting(root.handle, relativePath, {
          expectedKind: "directory",
        });
        if (after.absolutePath !== current.absolutePath) {
          throw finiteError(
            "API_WORKSPACE_PICKER_PATH_INVALID",
            "请求的目录已发生变化",
          );
        }
      } catch (error) {
        if (error instanceof ServerLayerError) throw error;
        throw currentPathError(error);
      }

      directories.sort((left, right) => compareNames(left.name, right.name));
      const truncated = directories.length > MAX_WORKSPACE_PICKER_DIRECTORIES;
      const visibleDirectories = truncated
        ? directories.slice(0, MAX_WORKSPACE_PICKER_DIRECTORIES)
        : directories;

      return {
        root: {
          label: root.label,
          workspacePath: root.handle.rootPath,
        },
        current: {
          label: segments.at(-1) ?? root.label,
          segments,
          workspacePath: current.absolutePath,
        },
        parentSegments: segments.length === 0 ? null : segments.slice(0, -1),
        directories: visibleDirectories,
        blockedEntries,
        ignoredEntries,
        truncated,
      };
    },
  };
}
