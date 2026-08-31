import { utf8ByteLength } from "@/lib/domain";

import {
  AtomicWriteError,
  atomicWriteWorkspaceFile,
} from "./atomic-write";
import {
  nativeToolDependencies,
  type ToolDependencies,
} from "./dependencies";
import { isSensitiveWorkspacePath } from "./sensitive-path";
import {
  MAX_WRITE_CONTENT_BYTES,
  createToolFailure,
  createToolSuccess,
  type LocalToolExecutionContext,
  type WriteFileArguments,
} from "./types";

function atomicFailure(error: AtomicWriteError, relativePath: string) {
  if (error.code === "stale") {
    return createToolFailure(
      "FILE_STALE",
      "文件内容已发生变化",
      true,
      { toolName: "write_file", relativePath, reason: "sha256_mismatch" },
    );
  }
  if (error.code === "content") {
    return createToolFailure(
      "FILE_CONTENT_INVALID",
      "现有文件不是受支持的 UTF-8 文本",
      true,
      { toolName: "write_file", relativePath, reason: "existing_content_invalid" },
    );
  }
  return createToolFailure(
    "FILE_ATOMIC_WRITE_FAILED",
    "文件原子写入失败",
    true,
    { toolName: "write_file", relativePath, reason: "atomic_write_error" },
  );
}

export async function executeWriteFile(
  context: LocalToolExecutionContext,
  arguments_: WriteFileArguments,
  dependencies: ToolDependencies = nativeToolDependencies,
) {
  if (isSensitiveWorkspacePath(arguments_.path)) {
    return createToolFailure(
      "TOOL_SENSITIVE_PATH_DENIED",
      "敏感文件不能通过写入工具访问",
      false,
      {
        toolName: "write_file",
        relativePath: arguments_.path,
        reason: "sensitive_path",
      },
    );
  }
  const bytes = Buffer.from(arguments_.content, "utf8");
  if (utf8ByteLength(arguments_.content) > MAX_WRITE_CONTENT_BYTES) {
    return createToolFailure(
      "FILE_TOO_LARGE",
      "写入内容超过大小限制",
      true,
      {
        toolName: "write_file",
        relativePath: arguments_.path,
        reason: "write_content_too_large",
        limit: MAX_WRITE_CONTENT_BYTES,
        actual: bytes.byteLength,
      },
    );
  }
  try {
    const result = await atomicWriteWorkspaceFile(
      context.workspace,
      arguments_.path,
      bytes,
      context.signal,
      dependencies,
    );
    return createToolSuccess(
      result.changed ? "文件写入完成" : "文件内容未变化",
      undefined,
      {
        relativePath: arguments_.path,
        operation: result.operation,
        changed: result.changed,
        ...(result.beforeSha256 === undefined
          ? {}
          : { beforeSha256: result.beforeSha256 }),
        afterSha256: result.afterSha256,
        bytes: result.bytes,
      },
    );
  } catch (cause) {
    if (cause instanceof AtomicWriteError) {
      return atomicFailure(cause, arguments_.path);
    }
    throw cause;
  }
}
