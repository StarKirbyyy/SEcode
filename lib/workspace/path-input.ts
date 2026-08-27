import path from "node:path";

import { utf8ByteLength } from "@/lib/domain";

import { createWorkspaceError } from "./types";

export const MAX_WORKSPACE_PATH_BYTES = 4_096;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]:(?:$|\/)/;
const URL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;

function requirePathString(
  input: unknown,
  field: "rootPath" | "relativePath",
): string {
  if (typeof input !== "string" || input.length === 0) {
    throw createWorkspaceError(
      field === "rootPath"
        ? "WORKSPACE_INPUT_INVALID"
        : "WORKSPACE_PATH_INVALID",
      "工作区路径必须是非空字符串",
      true,
      { field, reason: "empty_or_non_string" },
    );
  }
  if (utf8ByteLength(input) > MAX_WORKSPACE_PATH_BYTES) {
    throw createWorkspaceError(
      field === "rootPath"
        ? "WORKSPACE_INPUT_INVALID"
        : "WORKSPACE_PATH_INVALID",
      "工作区路径超过长度限制",
      true,
      { field, reason: "too_long" },
    );
  }
  if (CONTROL_CHARACTER_PATTERN.test(input)) {
    throw createWorkspaceError(
      field === "rootPath"
        ? "WORKSPACE_INPUT_INVALID"
        : "WORKSPACE_PATH_INVALID",
      "工作区路径包含不允许的控制字符",
      true,
      { field, reason: "control_character" },
    );
  }
  return input;
}

export function validateWorkspaceRootInput(input: unknown): string {
  const value = requirePathString(input, "rootPath");
  if (!path.isAbsolute(value)) {
    throw createWorkspaceError(
      "WORKSPACE_ROOT_NOT_ABSOLUTE",
      "工作区根路径必须是绝对路径",
      true,
      { field: "rootPath", reason: "not_absolute" },
    );
  }
  return value;
}

export function normalizeWorkspaceRelativePath(input: unknown): string {
  const value = requirePathString(input, "relativePath");
  if (value.includes("\\")) {
    throw createWorkspaceError(
      "WORKSPACE_PATH_INVALID",
      "工具路径只能使用正斜线",
      true,
      { field: "relativePath", reason: "backslash" },
    );
  }
  if (
    path.posix.isAbsolute(value) ||
    WINDOWS_DRIVE_PATTERN.test(value) ||
    URL_PATTERN.test(value) ||
    value === "~" ||
    value.startsWith("~/")
  ) {
    throw createWorkspaceError(
      "WORKSPACE_PATH_ESCAPE",
      "工具路径必须位于当前工作区内",
      true,
      { field: "relativePath", reason: "absolute_or_expanded_path" },
    );
  }

  const sourceSegments = value.split("/");
  if (sourceSegments.includes("..")) {
    throw createWorkspaceError(
      "WORKSPACE_PATH_ESCAPE",
      "工具路径不能包含上级目录段",
      true,
      { field: "relativePath", reason: "parent_segment" },
    );
  }

  const normalized = path.posix.normalize(value).replace(/\/+$/, "") || ".";
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw createWorkspaceError(
      "WORKSPACE_PATH_ESCAPE",
      "工具路径不能越过当前工作区",
      true,
      { field: "relativePath", reason: "normalized_escape" },
    );
  }
  return normalized;
}

export function workspaceRelativeSegments(normalizedPath: string): string[] {
  return normalizedPath === "." ? [] : normalizedPath.split("/");
}
