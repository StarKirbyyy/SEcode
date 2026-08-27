import { z } from "zod";

import {
  ToolResultSchema,
  type JsonObject,
  type ToolDefinition,
  type ToolResult,
} from "@/lib/domain";
import type { WorkspaceHandle } from "@/lib/workspace";

export const LOCAL_TOOL_NAMES = [
  "list_directory",
  "read_file",
  "search_text",
  "write_file",
  "replace_in_file",
  "run_process",
] as const;

export type LocalToolName = (typeof LOCAL_TOOL_NAMES)[number];

export const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_WRITE_CONTENT_BYTES = 1024 * 1024;
export const MAX_REPLACEMENT_TEXT_BYTES = 1024 * 1024;
export const MAX_SEARCH_QUERY_BYTES = 4 * 1024;
export const DEFAULT_DIRECTORY_DEPTH = 1;
export const MAX_DIRECTORY_DEPTH = 4;
export const DEFAULT_DIRECTORY_ENTRIES = 200;
export const MAX_DIRECTORY_ENTRIES = 1_000;
export const DEFAULT_SEARCH_RESULTS = 100;
export const MAX_SEARCH_RESULTS = 500;
export const MAX_FALLBACK_SEARCH_FILES = 10_000;
export const DEFAULT_PROCESS_TIMEOUT_MS = 120_000;
export const MAX_PROCESS_TIMEOUT_MS = 600_000;
export const MAX_PROCESS_ARGUMENTS = 128;
export const MAX_PROCESS_ARGUMENT_BYTES = 32 * 1024;
export const MAX_PUBLIC_PREVIEW_BYTES = 256;
export const PROCESS_KILL_GRACE_MS = 2_000;

export const LOCAL_TOOL_ERROR_CODES = [
  "TOOL_UNKNOWN",
  "TOOL_ARGUMENTS_INVALID",
  "TOOL_INTERNAL_ERROR",
  "TOOL_SENSITIVE_PATH_DENIED",
  "FILE_TOO_LARGE",
  "FILE_BINARY_UNSUPPORTED",
  "FILE_CONTENT_INVALID",
  "FILE_STALE",
  "FILE_MATCH_NOT_FOUND",
  "FILE_MATCH_NOT_UNIQUE",
  "FILE_ATOMIC_WRITE_FAILED",
  "FILE_IO_ERROR",
  "SEARCH_FAILED",
  "PROCESS_SPAWN_FAILED",
  "PROCESS_EXIT_NONZERO",
  "PROCESS_TIMEOUT",
] as const;

export type LocalToolErrorCode = (typeof LOCAL_TOOL_ERROR_CODES)[number];

export interface ListDirectoryArguments {
  path: string;
  depth: number;
  limit: number;
}
export interface ReadFileArguments {
  path: string;
  startLine: number;
  endLine?: number;
}
export interface SearchTextArguments {
  query: string;
  path: string;
  caseSensitive: boolean;
  limit: number;
}
export interface WriteFileArguments {
  path: string;
  content: string;
  expectedSha256?: string;
}
export interface ReplaceInFileArguments {
  path: string;
  oldText: string;
  newText: string;
  expectedSha256: string;
}
export interface RunProcessArguments {
  program: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}

declare const preparedInvocationBrand: unique symbol;

export type PreparedLocalToolInvocation =
  | Readonly<{ name: "list_directory"; arguments: Readonly<ListDirectoryArguments>; [preparedInvocationBrand]: true }>
  | Readonly<{ name: "read_file"; arguments: Readonly<ReadFileArguments>; [preparedInvocationBrand]: true }>
  | Readonly<{ name: "search_text"; arguments: Readonly<SearchTextArguments>; [preparedInvocationBrand]: true }>
  | Readonly<{ name: "write_file"; arguments: Readonly<WriteFileArguments>; [preparedInvocationBrand]: true }>
  | Readonly<{ name: "replace_in_file"; arguments: Readonly<ReplaceInFileArguments>; [preparedInvocationBrand]: true }>
  | Readonly<{ name: "run_process"; arguments: Readonly<RunProcessArguments>; [preparedInvocationBrand]: true }>;

export interface LocalToolExecutionContext {
  workspace: WorkspaceHandle;
  signal: AbortSignal;
}

export type PrepareLocalToolCallResult =
  | {
      ok: true;
      invocation: PreparedLocalToolInvocation;
      publicArguments: JsonObject;
      argumentsTruncated: boolean;
    }
  | {
      ok: false;
      result: ToolResult;
      publicArguments: JsonObject;
      argumentsTruncated: boolean;
    };

const ToolErrorDetailsSchema = z.strictObject({
  toolName: z.string().optional(),
  relativePath: z.string().optional(),
  reason: z.string().optional(),
  limit: z.number().finite().optional(),
  actual: z.number().finite().optional(),
  matches: z.number().int().nonnegative().optional(),
  exitCode: z.number().int().nullable().optional(),
  signal: z.string().nullable().optional(),
  timeoutMs: z.number().int().positive().optional(),
  truncated: z.boolean().optional(),
});

export type ToolErrorDetails = z.infer<typeof ToolErrorDetailsSchema>;

export class LocalToolExecutionAbortedError extends Error {
  declare readonly cause: unknown;

  constructor(cause?: unknown) {
    super("本地工具执行已取消");
    this.name = "LocalToolExecutionAbortedError";
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

export function createToolFailure(
  code: LocalToolErrorCode,
  message: string,
  recoverable: boolean,
  details?: ToolErrorDetails,
  output?: string,
  metadata?: JsonObject,
): ToolResult {
  const parsedDetails =
    details === undefined ? undefined : ToolErrorDetailsSchema.parse(details);
  return ToolResultSchema.parse({
    ok: false,
    summary: message,
    ...(output === undefined ? {} : { output }),
    ...(metadata === undefined ? {} : { metadata }),
    error: {
      code,
      message,
      recoverable,
      ...(parsedDetails === undefined ? {} : { details: parsedDetails }),
    },
  });
}

export function createToolSuccess(
  summary: string,
  output?: string,
  metadata?: JsonObject,
): ToolResult {
  return ToolResultSchema.parse({
    ok: true,
    summary,
    ...(output === undefined ? {} : { output }),
    ...(metadata === undefined ? {} : { metadata }),
  });
}

export interface LocalToolDefinitionEntry {
  definition: ToolDefinition;
}
