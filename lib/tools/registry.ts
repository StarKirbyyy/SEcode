import {
  ToolResultSchema,
  createPublicToolArguments,
  redactSecrets,
  truncateUtf8,
  utf8ByteLength,
  type ToolCall,
} from "@/lib/domain";
import { WorkspaceLayerError } from "@/lib/workspace";

import { executeListDirectory } from "./list-directory";
import { executeReadFile } from "./read-file";
import { executeReplaceInFile } from "./replace-in-file";
import { executeRunProcess } from "./run-process";
import {
  LOCAL_TOOL_DEFINITIONS,
  parseLocalToolArguments,
} from "./schemas";
import { executeSearchText } from "./search-text";
import { isSensitiveWorkspacePath } from "./sensitive-path";
import {
  LOCAL_TOOL_NAMES,
  LocalToolExecutionAbortedError,
  MAX_PUBLIC_PREVIEW_BYTES,
  createToolFailure,
  type LocalToolExecutionContext,
  type LocalToolName,
  type PrepareLocalToolCallResult,
  type PreparedLocalToolInvocation,
} from "./types";
import { executeWriteFile } from "./write-file";
import { sha256Bytes } from "./file-content";

const localToolNameSet = new Set<string>(LOCAL_TOOL_NAMES);
const preparedInvocations = new WeakSet<object>();

export function isPreparedLocalToolInvocation(
  value: unknown,
): value is PreparedLocalToolInvocation {
  return (
    value !== null &&
    typeof value === "object" &&
    preparedInvocations.has(value)
  );
}

function isLocalToolName(value: string): value is LocalToolName {
  return localToolNameSet.has(value);
}

function deepFreezeInvocation(
  name: LocalToolName,
  arguments_: Record<string, unknown>,
): PreparedLocalToolInvocation {
  const frozenArguments = Object.freeze({
    ...arguments_,
    ...(Array.isArray(arguments_.args)
      ? { args: Object.freeze([...arguments_.args]) }
      : {}),
    ...(Array.isArray(arguments_.replacements)
      ? { replacements: Object.freeze(arguments_.replacements.map((item) =>
          Object.freeze({ ...(item as Record<string, unknown>) })
        )) }
      : {}),
    ...(arguments_.readiness !== undefined &&
      arguments_.readiness !== null &&
      typeof arguments_.readiness === "object"
      ? { readiness: Object.freeze({ ...arguments_.readiness }) }
      : {}),
  });
  const invocation = Object.freeze({
    name,
    arguments: frozenArguments,
  }) as unknown as PreparedLocalToolInvocation;
  preparedInvocations.add(invocation);
  return invocation;
}

function projectArguments(
  name: LocalToolName,
  arguments_: Record<string, unknown>,
) {
  if (name === "write_file") {
    const content = arguments_.content as string;
    return createPublicToolArguments({
      path: arguments_.path,
      contentBytes: utf8ByteLength(content),
      contentSha256: sha256Bytes(Buffer.from(content, "utf8")),
      preview: truncateUtf8(
        redactSecrets(content),
        MAX_PUBLIC_PREVIEW_BYTES,
      ).value,
    });
  }
  if (name === "replace_in_file") {
    const replacements = Array.isArray(arguments_.replacements)
      ? arguments_.replacements as Array<{ oldText: string; newText: string }>
      : [{ oldText: arguments_.oldText as string, newText: arguments_.newText as string }];
    return createPublicToolArguments({
      path: arguments_.path,
      replacementCount: replacements.length,
      replacements: replacements.map(({ oldText, newText }) => ({
        oldTextBytes: utf8ByteLength(oldText),
        oldTextSha256: sha256Bytes(Buffer.from(oldText, "utf8")),
        oldTextPreview: truncateUtf8(redactSecrets(oldText), MAX_PUBLIC_PREVIEW_BYTES).value,
        newTextBytes: utf8ByteLength(newText),
        newTextSha256: sha256Bytes(Buffer.from(newText, "utf8")),
        newTextPreview: truncateUtf8(redactSecrets(newText), MAX_PUBLIC_PREVIEW_BYTES).value,
      })),
    });
  }
  return createPublicToolArguments(arguments_);
}

function sensitiveInvocation(
  name: LocalToolName,
  arguments_: Record<string, unknown>,
): boolean {
  return (
    (name === "read_file" ||
      name === "search_text" ||
      name === "write_file" ||
      name === "replace_in_file") &&
    typeof arguments_.path === "string" &&
    isSensitiveWorkspacePath(arguments_.path)
  );
}

function parseByName(name: LocalToolName, value: unknown) {
  switch (name) {
    case "list_directory":
      return parseLocalToolArguments(name, value);
    case "read_file":
      return parseLocalToolArguments(name, value);
    case "search_text":
      return parseLocalToolArguments(name, value);
    case "write_file":
      return parseLocalToolArguments(name, value);
    case "replace_in_file":
      return parseLocalToolArguments(name, value);
    case "run_process":
      return parseLocalToolArguments(name, value);
  }
}

export function prepareLocalToolCall(
  call: ToolCall,
): PrepareLocalToolCallResult {
  const fallbackProjection = createPublicToolArguments(call.arguments);
  if (!isLocalToolName(call.name)) {
    return {
      ok: false,
      result: createToolFailure(
        "TOOL_UNKNOWN",
        "未知本地工具",
        true,
        { toolName: call.name, reason: "unknown_tool" },
      ),
      publicArguments: fallbackProjection.publicArguments,
      argumentsTruncated: fallbackProjection.truncated,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseByName(call.name, call.arguments) as unknown as Record<
      string,
      unknown
    >;
  } catch {
    return {
      ok: false,
      result: createToolFailure(
        "TOOL_ARGUMENTS_INVALID",
        "工具参数校验失败",
        true,
        { toolName: call.name, reason: "invalid_arguments" },
      ),
      publicArguments: fallbackProjection.publicArguments,
      argumentsTruncated: fallbackProjection.truncated,
    };
  }
  const projection = projectArguments(call.name, parsed);
  if (sensitiveInvocation(call.name, parsed)) {
    return {
      ok: false,
      result: createToolFailure(
        "TOOL_SENSITIVE_PATH_DENIED",
        "敏感路径不能通过内容工具访问",
        false,
        {
          toolName: call.name,
          relativePath: parsed.path as string,
          reason: "sensitive_path",
        },
      ),
      publicArguments: projection.publicArguments,
      argumentsTruncated: projection.truncated,
    };
  }

  return {
    ok: true,
    invocation: deepFreezeInvocation(call.name, parsed),
    publicArguments: projection.publicArguments,
    argumentsTruncated: projection.truncated,
  };
}

function workspaceFailure(cause: WorkspaceLayerError) {
  return ToolResultSchema.parse({
    ok: false,
    summary: cause.error.message,
    error: cause.error,
  });
}

export async function executePreparedLocalTool(
  context: LocalToolExecutionContext,
  invocation: PreparedLocalToolInvocation,
) {
  if (
    invocation === null ||
    typeof invocation !== "object" ||
    !isPreparedLocalToolInvocation(invocation)
  ) {
    return createToolFailure(
      "TOOL_ARGUMENTS_INVALID",
      "工具调用对象无效",
      false,
      { reason: "invalid_prepared_invocation" },
    );
  }
  try {
    let result;
    switch (invocation.name) {
      case "list_directory":
        result = await executeListDirectory(
          context,
          invocation.arguments,
        );
        break;
      case "read_file":
        result = await executeReadFile(context, invocation.arguments);
        break;
      case "search_text":
        result = await executeSearchText(context, invocation.arguments);
        break;
      case "write_file":
        result = await executeWriteFile(context, invocation.arguments);
        break;
      case "replace_in_file":
        result = await executeReplaceInFile(context, invocation.arguments);
        break;
      case "run_process":
        result = await executeRunProcess(context, invocation.arguments);
        break;
    }
    return ToolResultSchema.parse(result);
  } catch (cause) {
    if (cause instanceof LocalToolExecutionAbortedError) throw cause;
    if (cause instanceof WorkspaceLayerError) return workspaceFailure(cause);
    return createToolFailure(
      "TOOL_INTERNAL_ERROR",
      "本地工具内部执行失败",
      false,
      {
        toolName: invocation.name,
        reason: "unexpected_internal_error",
      },
    );
  }
}

export { LOCAL_TOOL_DEFINITIONS };
