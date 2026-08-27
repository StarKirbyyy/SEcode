import { z } from "zod";

import {
  JsonObjectSchema,
  ToolDefinitionSchema,
  utf8ByteLength,
  type JsonObject,
  type ToolDefinition,
} from "@/lib/domain";
import { normalizeWorkspaceRelativePath } from "@/lib/workspace";

import {
  DEFAULT_DIRECTORY_DEPTH,
  DEFAULT_DIRECTORY_ENTRIES,
  DEFAULT_PROCESS_TIMEOUT_MS,
  DEFAULT_SEARCH_RESULTS,
  LOCAL_TOOL_NAMES,
  MAX_DIRECTORY_DEPTH,
  MAX_DIRECTORY_ENTRIES,
  MAX_PROCESS_ARGUMENT_BYTES,
  MAX_PROCESS_ARGUMENTS,
  MAX_PROCESS_TIMEOUT_MS,
  MAX_REPLACEMENT_TEXT_BYTES,
  MAX_SEARCH_QUERY_BYTES,
  MAX_SEARCH_RESULTS,
  MAX_WRITE_CONTENT_BYTES,
  type ListDirectoryArguments,
  type LocalToolName,
  type ReadFileArguments,
  type ReplaceInFileArguments,
  type RunProcessArguments,
  type SearchTextArguments,
  type WriteFileArguments,
} from "./types";

const utf8Limited = (maxBytes: number, allowEmpty = false) =>
  z
    .string()
    .refine((value) => allowEmpty || value.length > 0, "must not be empty")
    .refine(
      (value) => utf8ByteLength(value) <= maxBytes,
      "exceeds UTF-8 byte limit",
    );

const WorkspacePathInputSchema = utf8Limited(4_096);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const ListDirectoryArgumentsSchema = z.strictObject({
  path: WorkspacePathInputSchema.optional(),
  depth: z.int().min(1).max(MAX_DIRECTORY_DEPTH).optional(),
  limit: z.int().min(1).max(MAX_DIRECTORY_ENTRIES).optional(),
});

export const ReadFileArgumentsSchema = z
  .strictObject({
    path: WorkspacePathInputSchema,
    startLine: z.int().positive().optional(),
    endLine: z.int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.endLine !== undefined &&
      value.endLine < (value.startLine ?? 1)
    ) {
      context.addIssue({
        code: "custom",
        message: "endLine must be greater than or equal to startLine",
        path: ["endLine"],
      });
    }
  });

export const SearchTextArgumentsSchema = z.strictObject({
  query: utf8Limited(MAX_SEARCH_QUERY_BYTES),
  path: WorkspacePathInputSchema.optional(),
  caseSensitive: z.boolean().optional(),
  limit: z.int().min(1).max(MAX_SEARCH_RESULTS).optional(),
});

export const WriteFileArgumentsSchema = z.strictObject({
  path: WorkspacePathInputSchema,
  content: utf8Limited(MAX_WRITE_CONTENT_BYTES, true),
  expectedSha256: Sha256Schema.optional(),
});

export const ReplaceInFileArgumentsSchema = z
  .strictObject({
    path: WorkspacePathInputSchema,
    oldText: utf8Limited(MAX_REPLACEMENT_TEXT_BYTES),
    newText: utf8Limited(MAX_REPLACEMENT_TEXT_BYTES, true),
    expectedSha256: Sha256Schema,
  })
  .superRefine((value, context) => {
    if (value.oldText === value.newText) {
      context.addIssue({
        code: "custom",
        message: "oldText and newText must differ",
        path: ["newText"],
      });
    }
  });

export const RunProcessArgumentsSchema = z
  .strictObject({
    program: utf8Limited(4_096).refine(
      (value) => !/[\u0000-\u001f\u007f]/.test(value),
      "program contains control characters",
    ),
    args: z.array(utf8Limited(4_096, true)).max(MAX_PROCESS_ARGUMENTS).optional(),
    cwd: WorkspacePathInputSchema.optional(),
    timeoutMs: z
      .int()
      .min(1_000)
      .max(MAX_PROCESS_TIMEOUT_MS)
      .optional(),
  })
  .superRefine((value, context) => {
    const bytes = (value.args ?? []).reduce(
      (sum, argument) => sum + utf8ByteLength(argument),
      0,
    );
    if (bytes > MAX_PROCESS_ARGUMENT_BYTES) {
      context.addIssue({
        code: "custom",
        message: "process arguments exceed total UTF-8 byte limit",
        path: ["args"],
      });
    }
  });

export type RawListDirectoryArguments = z.infer<
  typeof ListDirectoryArgumentsSchema
>;
export type RawReadFileArguments = z.infer<typeof ReadFileArgumentsSchema>;
export type RawSearchTextArguments = z.infer<typeof SearchTextArgumentsSchema>;
export type RawWriteFileArguments = z.infer<typeof WriteFileArgumentsSchema>;
export type RawReplaceInFileArguments = z.infer<
  typeof ReplaceInFileArgumentsSchema
>;
export type RawRunProcessArguments = z.infer<typeof RunProcessArgumentsSchema>;

const schemas = {
  list_directory: ListDirectoryArgumentsSchema,
  read_file: ReadFileArgumentsSchema,
  search_text: SearchTextArgumentsSchema,
  write_file: WriteFileArgumentsSchema,
  replace_in_file: ReplaceInFileArgumentsSchema,
  run_process: RunProcessArgumentsSchema,
} as const;

const descriptions: Record<LocalToolName, string> = {
  list_directory:
    "List entries under a workspace-relative directory with bounded depth and count.",
  read_file:
    "Read a bounded line range from a UTF-8 workspace file and return its full SHA-256.",
  search_text:
    "Search a fixed string in bounded UTF-8 workspace files without regular expressions.",
  write_file:
    "Create or atomically replace a UTF-8 workspace file; overwrites require expectedSha256.",
  replace_in_file:
    "Atomically replace exactly one text occurrence in a workspace file using expectedSha256.",
  run_process:
    "Spawn one program with separate argv in a workspace-relative cwd; no shell, env, or stdin.",
};

function modelParameters(schema: z.ZodType): JsonObject {
  const generated = z.toJSONSchema(schema, { target: "draft-7" });
  const parameters = { ...generated };
  delete parameters.$schema;
  return JsonObjectSchema.parse(parameters);
}

export const LOCAL_TOOL_DEFINITIONS: readonly ToolDefinition[] = Object.freeze(
  LOCAL_TOOL_NAMES.map((name) =>
    ToolDefinitionSchema.parse({
      type: "function",
      function: {
        name,
        description: descriptions[name],
        parameters: modelParameters(schemas[name]),
      },
    }),
  ),
);

export function parseLocalToolArguments(
  name: "list_directory",
  value: unknown,
): ListDirectoryArguments;
export function parseLocalToolArguments(
  name: "read_file",
  value: unknown,
): ReadFileArguments;
export function parseLocalToolArguments(
  name: "search_text",
  value: unknown,
): SearchTextArguments;
export function parseLocalToolArguments(
  name: "write_file",
  value: unknown,
): WriteFileArguments;
export function parseLocalToolArguments(
  name: "replace_in_file",
  value: unknown,
): ReplaceInFileArguments;
export function parseLocalToolArguments(
  name: "run_process",
  value: unknown,
): RunProcessArguments;
export function parseLocalToolArguments(
  name: LocalToolName,
  value: unknown,
):
  | ListDirectoryArguments
  | ReadFileArguments
  | SearchTextArguments
  | WriteFileArguments
  | ReplaceInFileArguments
  | RunProcessArguments {
  switch (name) {
    case "list_directory": {
      const parsed = ListDirectoryArgumentsSchema.parse(value);
      return {
        path: normalizeWorkspaceRelativePath(parsed.path ?? "."),
        depth: parsed.depth ?? DEFAULT_DIRECTORY_DEPTH,
        limit: parsed.limit ?? DEFAULT_DIRECTORY_ENTRIES,
      };
    }
    case "read_file": {
      const parsed = ReadFileArgumentsSchema.parse(value);
      return {
        path: normalizeWorkspaceRelativePath(parsed.path),
        startLine: parsed.startLine ?? 1,
        ...(parsed.endLine === undefined ? {} : { endLine: parsed.endLine }),
      };
    }
    case "search_text": {
      const parsed = SearchTextArgumentsSchema.parse(value);
      return {
        query: parsed.query,
        path: normalizeWorkspaceRelativePath(parsed.path ?? "."),
        caseSensitive: parsed.caseSensitive ?? true,
        limit: parsed.limit ?? DEFAULT_SEARCH_RESULTS,
      };
    }
    case "write_file": {
      const parsed = WriteFileArgumentsSchema.parse(value);
      return {
        path: normalizeWorkspaceRelativePath(parsed.path),
        content: parsed.content,
        ...(parsed.expectedSha256 === undefined
          ? {}
          : { expectedSha256: parsed.expectedSha256 }),
      };
    }
    case "replace_in_file": {
      const parsed = ReplaceInFileArgumentsSchema.parse(value);
      return {
        path: normalizeWorkspaceRelativePath(parsed.path),
        oldText: parsed.oldText,
        newText: parsed.newText,
        expectedSha256: parsed.expectedSha256,
      };
    }
    case "run_process": {
      const parsed = RunProcessArgumentsSchema.parse(value);
      return {
        program: parsed.program,
        args: parsed.args ?? [],
        cwd: normalizeWorkspaceRelativePath(parsed.cwd ?? "."),
        timeoutMs: parsed.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS,
      };
    }
  }
}
