import { resolveExistingWorkspacePath } from "@/lib/workspace";

import { throwIfAborted } from "./abort";
import {
  nativeToolDependencies,
  type ToolDependencies,
} from "./dependencies";
import {
  FileContentError,
  fileContentFailure,
  readTextFileAbsolute,
  selectLineRange,
} from "./file-content";
import { limitToolOutput } from "./output";
import { isSensitiveWorkspacePath } from "./sensitive-path";
import {
  createToolFailure,
  createToolSuccess,
  type LocalToolExecutionContext,
  type ReadFileArguments,
} from "./types";

export async function executeReadFile(
  context: LocalToolExecutionContext,
  arguments_: ReadFileArguments,
  dependencies: ToolDependencies = nativeToolDependencies,
) {
  throwIfAborted(context.signal);
  if (isSensitiveWorkspacePath(arguments_.path)) {
    return createToolFailure(
      "TOOL_SENSITIVE_PATH_DENIED",
      "敏感文件不能通过内容工具访问",
      false,
      {
        toolName: "read_file",
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
      return fileContentFailure(cause, "read_file", arguments_.path);
    }
    throw cause;
  }
  throwIfAborted(context.signal);

  let selection;
  try {
    selection = selectLineRange(
      content.text,
      arguments_.startLine,
      arguments_.endLine,
    );
  } catch {
    return createToolFailure(
      "FILE_CONTENT_INVALID",
      "请求的行范围超出文件",
      true,
      {
        toolName: "read_file",
        relativePath: arguments_.path,
        reason: "line_range_out_of_bounds",
      },
    );
  }
  const limited = limitToolOutput(selection.value);
  return createToolSuccess(
    "文件读取完成",
    limited.value,
    {
      relativePath: arguments_.path,
      startLine: selection.startLine,
      endLine: selection.endLine,
      totalLines: selection.totalLines,
      sha256: content.sha256,
      truncated: limited.truncated,
      originalBytes: limited.originalBytes,
      returnedBytes: limited.returnedBytes,
    },
  );
}
