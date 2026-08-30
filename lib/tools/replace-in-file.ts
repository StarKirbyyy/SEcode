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
  const replacements = "replacements" in arguments_
    ? arguments_.replacements
    : [{ oldText: arguments_.oldText, newText: arguments_.newText }];
  const matches = replacements.map((replacement) => ({
    ...replacement,
    match: findUniqueMatch(content.text, replacement.oldText),
  }));
  const missing = matches.find((item) => item.match === "none");
  if (missing !== undefined) {
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
  const nonUnique = matches.find((item) => item.match === "many");
  if (nonUnique !== undefined) {
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
  const positioned = matches
    .map((item) => ({ ...item, match: item.match as number }))
    .sort((left, right) => left.match - right.match);
  for (let index = 1; index < positioned.length; index += 1) {
    const previous = positioned[index - 1];
    const current = positioned[index];
    if (previous === undefined || current === undefined) continue;
    if (current.match < previous.match + previous.oldText.length) {
      return createToolFailure(
        "FILE_MATCH_NOT_UNIQUE",
        "批量替换目标相互重叠",
        true,
        {
          toolName: "replace_in_file",
          relativePath: arguments_.path,
          reason: "replacement_overlap",
          matches: 2,
        },
      );
    }
  }
  let cursor = 0;
  let nextText = "";
  for (const item of positioned) {
    nextText += content.text.slice(cursor, item.match) + item.newText;
    cursor = item.match + item.oldText.length;
  }
  nextText += content.text.slice(cursor);
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
      replacementCount: replacements.length,
      replacedOccurrences: replacements.length,
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
