import { utf8ByteLength } from "@/lib/domain";
import { resolveExistingWorkspacePath } from "@/lib/workspace";

import {
  AtomicWriteError,
  atomicWriteWorkspaceFile,
} from "./atomic-write";
import {
  nativeToolDependencies,
  type ToolDependencies,
} from "./dependencies";
import {
  FileContentError,
  fileContentFailure,
  readTextFileAbsolute,
} from "./file-content";
import { isSensitiveWorkspacePath } from "./sensitive-path";
import {
  MAX_REPLACEMENT_TEXT_BYTES,
  createToolFailure,
  createToolSuccess,
  type LocalToolExecutionContext,
  type ReplaceInFileArguments,
} from "./types";

function findUniqueMatch(text: string, needle: string): number | "none" | "many" {
  const first = text.indexOf(needle);
  if (first < 0) return "none";
  const second = text.indexOf(needle, first + 1);
  return second < 0 ? first : "many";
}

export async function executeReplaceInFile(
  context: LocalToolExecutionContext,
  arguments_: ReplaceInFileArguments,
  dependencies: ToolDependencies = nativeToolDependencies,
) {
  if (isSensitiveWorkspacePath(arguments_.path)) {
    return createToolFailure(
      "TOOL_SENSITIVE_PATH_DENIED",
      "敏感文件不能通过替换工具访问",
      false,
      {
        toolName: "replace_in_file",
        relativePath: arguments_.path,
        reason: "sensitive_path",
      },
    );
  }
  const resolved = await resolveExistingWorkspacePath(
    context.workspace,
    arguments_.path,
    { expectedKind: "file" },
  );
  let content;
  try {
    content = await readTextFileAbsolute(resolved.absolutePath, dependencies);
  } catch (cause) {
    if (cause instanceof FileContentError) {
      return fileContentFailure(cause, "replace_in_file", arguments_.path);
    }
    throw cause;
  }
  if (content.sha256 !== arguments_.expectedSha256) {
    return createToolFailure(
      "FILE_STALE",
      "文件内容已发生变化",
      true,
      {
        toolName: "replace_in_file",
        relativePath: arguments_.path,
        reason: "sha256_mismatch",
      },
    );
  }
  const match = findUniqueMatch(content.text, arguments_.oldText);
  if (match === "none") {
    return createToolFailure(
      "FILE_MATCH_NOT_FOUND",
      "目标文本未找到",
      true,
      {
        toolName: "replace_in_file",
        relativePath: arguments_.path,
        reason: "match_not_found",
        matches: 0,
      },
    );
  }
  if (match === "many") {
    return createToolFailure(
      "FILE_MATCH_NOT_UNIQUE",
      "目标文本不是唯一匹配",
      true,
      {
        toolName: "replace_in_file",
        relativePath: arguments_.path,
        reason: "match_not_unique",
        matches: 2,
      },
    );
  }
  const nextText =
    content.text.slice(0, match) +
    arguments_.newText +
    content.text.slice(match + arguments_.oldText.length);
  if (utf8ByteLength(nextText) > MAX_REPLACEMENT_TEXT_BYTES) {
    return createToolFailure(
      "FILE_TOO_LARGE",
      "替换后的文件超过大小限制",
      true,
      {
        toolName: "replace_in_file",
        relativePath: arguments_.path,
        reason: "replacement_result_too_large",
        limit: MAX_REPLACEMENT_TEXT_BYTES,
        actual: utf8ByteLength(nextText),
      },
    );
  }
  try {
    const result = await atomicWriteWorkspaceFile(
      context.workspace,
      arguments_.path,
      Buffer.from(nextText, "utf8"),
      arguments_.expectedSha256,
      context.signal,
      dependencies,
    );
    return createToolSuccess("文件替换完成", undefined, {
      relativePath: arguments_.path,
      beforeSha256: content.sha256,
      afterSha256: result.afterSha256,
      changed: result.changed,
      replacedOccurrences: 1,
      bytes: result.bytes,
    });
  } catch (cause) {
    if (cause instanceof AtomicWriteError) {
      return createToolFailure(
        cause.code === "stale" ? "FILE_STALE" : "FILE_ATOMIC_WRITE_FAILED",
        cause.code === "stale" ? "文件内容已发生变化" : "文件原子替换失败",
        true,
        {
          toolName: "replace_in_file",
          relativePath: arguments_.path,
          reason:
            cause.code === "stale" ? "sha256_mismatch" : "atomic_write_error",
        },
      );
    }
    throw cause;
  }
}
