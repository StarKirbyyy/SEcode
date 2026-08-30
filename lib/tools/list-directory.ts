import path from "node:path";

import {
  resolveExistingWorkspacePath,
  WorkspaceLayerError,
} from "@/lib/workspace";

import { throwIfAborted } from "./abort";
import {
  nativeToolDependencies,
  type ToolDependencies,
} from "./dependencies";
import { limitToolOutput } from "./output";
import { isIgnoredDirectoryName } from "./sensitive-path";
import {
  createToolFailure,
  createToolSuccess,
  type ListDirectoryArguments,
  type LocalToolExecutionContext,
} from "./types";

interface QueueEntry {
  relativePath: string;
  level: number;
}

function childRelativePath(parent: string, name: string): string {
  return parent === "." ? name : path.posix.join(parent, name);
}

export async function executeListDirectory(
  context: LocalToolExecutionContext,
  arguments_: ListDirectoryArguments,
  dependencies: ToolDependencies = nativeToolDependencies,
) {
  throwIfAborted(context.signal);
  const root = await resolveExistingWorkspacePath(
    context.workspace,
    arguments_.path,
    { expectedKind: "directory" },
  );
  const queue: QueueEntry[] = [{ relativePath: root.relativePath, level: 0 }];
  const lines: string[] = [];
  let ignoredEntries = 0;
  let blockedEntries = 0;
  let unsupportedEntries = 0;
  let truncated = false;

  while (queue.length > 0 && !truncated) {
    throwIfAborted(context.signal);
    const current = queue.shift()!;
    const resolvedDirectory = await resolveExistingWorkspacePath(
      context.workspace,
      current.relativePath,
      { expectedKind: "directory" },
    );
    let entries;
    try {
      entries = await dependencies.fileSystem.readdir(
        resolvedDirectory.absolutePath,
      );
    } catch {
      return createToolFailure(
        "FILE_IO_ERROR",
        "目录读取失败",
        true,
        {
          toolName: "list_directory",
          relativePath: current.relativePath,
          reason: "directory_io_error",
        },
      );
    }
    entries.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );

    for (const entry of entries) {
      throwIfAborted(context.signal);
      if (
        isIgnoredDirectoryName(entry.name) &&
        (entry.isDirectory() || entry.isSymbolicLink())
      ) {
        ignoredEntries += 1;
        continue;
      }
      let relativePath: string;
      try {
        relativePath = childRelativePath(current.relativePath, entry.name);
        if (
          /[\u0000-\u001f\u007f\\]/.test(entry.name) ||
          relativePath.includes("\\")
        ) {
          unsupportedEntries += 1;
          continue;
        }
      } catch {
        unsupportedEntries += 1;
        continue;
      }

      try {
        const resolved = await resolveExistingWorkspacePath(
          context.workspace,
          relativePath,
        );
        const isLink = entry.isSymbolicLink() || resolved.followedSymbolicLink;
        const label = isLink
          ? "符号链接"
          : resolved.kind === "directory"
            ? "目录"
            : "文件";
        lines.push(label.padEnd(10) + relativePath);
        if (
          !isLink &&
          resolved.kind === "directory" &&
          current.level + 1 < arguments_.depth
        ) {
          queue.push({ relativePath, level: current.level + 1 });
        }
      } catch (cause) {
        if (cause instanceof WorkspaceLayerError) {
          lines.push("已阻止".padEnd(10) + relativePath);
          blockedEntries += 1;
        } else {
          throw cause;
        }
      }
      if (lines.length >= arguments_.limit) {
        truncated = true;
        break;
      }
    }
  }

  const limited = limitToolOutput(lines.join("\n"));
  truncated ||= limited.truncated || queue.length > 0;
  return createToolSuccess(
    "目录读取完成",
    limited.value,
    {
      path: arguments_.path,
      depth: arguments_.depth,
      returnedEntries: lines.length,
      truncated,
      ignoredEntries,
      blockedEntries,
      unsupportedEntries,
      originalBytes: limited.originalBytes,
      returnedBytes: limited.returnedBytes,
    },
  );
}
