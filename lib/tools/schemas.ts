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
  PROCESS_LIFECYCLES,
} from "./types";

const utf8Limited = (maxBytes: number, allowEmpty = false) =>
  z
    .string()
    .refine((value) => allowEmpty || value.length > 0, "不能为空")
    .refine(
      (value) => utf8ByteLength(value) <= maxBytes,
      "超过 UTF-8 字节上限",
    );

const WorkspacePathInputSchema = utf8Limited(4_096);

const ReadinessUrlSchema = z.string().superRefine((value, context) => {
  if (/[\u0000-\u0020\u007f]/.test(value)) {
    context.addIssue({ code: "custom", message: "readiness URL 不能包含空白或控制字符" });
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    context.addIssue({ code: "custom", message: "readiness URL 无效" });
    return;
  }
  const port = Number(parsed.port);
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== "" ||
    !Number.isInteger(port) ||
    port < 1_024 ||
    port > 65_535
  ) {
    context.addIssue({
      code: "custom",
      message: "readiness URL 必须是带高位端口的 loopback HTTP 地址",
    });
  }
});

const RunProcessReadinessSchema = z.strictObject({
  url: ReadinessUrlSchema.describe("仅允许高位端口的 loopback HTTP 就绪探测地址。"),
  expectedStatus: z
    .int()
    .min(100)
    .max(599)
    .describe("判定服务已就绪的 HTTP 状态码；省略时为 200。")
    .optional(),
  timeoutMs: z
    .int()
    .min(1_000)
    .max(MAX_PROCESS_TIMEOUT_MS)
    .describe("服务启动就绪的独立等待窗口；省略时使用进程 timeoutMs。")
    .optional(),
});

export const ListDirectoryArgumentsSchema = z.strictObject({
  path: WorkspacePathInputSchema
    .describe("要列出的工作区相对目录；可在写入前确认父目录和目标条目，省略时使用工作区根目录。")
    .optional(),
  depth: z
    .int()
    .min(1)
    .max(MAX_DIRECTORY_DEPTH)
    .describe(`递归列出深度；省略时为 ${DEFAULT_DIRECTORY_DEPTH}，最大为 ${MAX_DIRECTORY_DEPTH}。`)
    .optional(),
  limit: z
    .int()
    .min(1)
    .max(MAX_DIRECTORY_ENTRIES)
    .describe(`最多返回的目录条目数；省略时为 ${DEFAULT_DIRECTORY_ENTRIES}，最大为 ${MAX_DIRECTORY_ENTRIES}。`)
    .optional(),
});

export const ReadFileArgumentsSchema = z
  .strictObject({
    path: WorkspacePathInputSchema.describe("要读取的已存在 UTF-8 文本文件的工作区相对路径；结果可包含审计用 SHA，但写工具不需要模型传递该值。"),
    startLine: z
      .int()
      .positive()
      .describe("开始行号，从 1 计数；省略时从第 1 行开始。")
      .optional(),
    endLine: z
      .int()
      .positive()
      .describe("期望结束行号，包含该行；每次最多返回 200 行。若结果 hasMore 为 true，请用 nextStartLine 继续读取。")
      .optional(),
  })
  .superRefine((value, context) => {
    if (
      value.endLine !== undefined &&
      value.endLine < (value.startLine ?? 1)
    ) {
      context.addIssue({
        code: "custom",
        message: "endLine 必须大于或等于 startLine",
        path: ["endLine"],
      });
    }
  });

export const SearchTextArgumentsSchema = z.strictObject({
  query: utf8Limited(MAX_SEARCH_QUERY_BYTES).describe("要搜索的固定字符串，不按正则表达式解析。"),
  path: WorkspacePathInputSchema
    .describe("搜索范围的工作区相对文件或目录；省略时搜索整个工作区。")
    .optional(),
  caseSensitive: z
    .boolean()
    .describe("是否区分大小写；省略时不区分大小写。")
    .optional(),
  limit: z
    .int()
    .min(1)
    .max(MAX_SEARCH_RESULTS)
    .describe(`最多返回的匹配数；省略时为 ${DEFAULT_SEARCH_RESULTS}，最大为 ${MAX_SEARCH_RESULTS}。`)
    .optional(),
});

export const WriteFileArgumentsSchema = z.strictObject({
  path: WorkspacePathInputSchema.describe("要创建或覆盖的 UTF-8 文件的工作区相对路径；父目录必须已存在。"),
  content: utf8Limited(MAX_WRITE_CONTENT_BYTES, true).describe("要写入的完整 UTF-8 文件内容，可以为空字符串。"),
});

const TextReplacementSchema = z.strictObject({
  oldText: utf8Limited(MAX_REPLACEMENT_TEXT_BYTES).describe("必须在原始文件中恰好出现一次的原文本。"),
  newText: utf8Limited(MAX_REPLACEMENT_TEXT_BYTES, true).describe("替换后的新文本，可以为空字符串。"),
});

export const ReplaceInFileArgumentsSchema = z
  .strictObject({
    path: WorkspacePathInputSchema.describe("要修改的 UTF-8 文件的工作区相对路径。"),
    oldText: TextReplacementSchema.shape.oldText.optional(),
    newText: TextReplacementSchema.shape.newText.optional(),
    replacements: z.array(TextReplacementSchema).min(1).max(16)
      .describe("同一原始文件快照中要原子应用的 1～16 项替换；所有目标必须唯一且互不重叠。")
      .optional(),
  })
  .superRefine((value, context) => {
    const hasSingle = value.oldText !== undefined || value.newText !== undefined;
    const hasBatch = value.replacements !== undefined;
    if (hasSingle === hasBatch || (hasSingle && (value.oldText === undefined || value.newText === undefined))) {
      context.addIssue({
        code: "custom",
        message: "必须且只能提供 oldText/newText 或 replacements",
      });
      return;
    }
    if (value.oldText !== undefined && value.oldText === value.newText) {
      context.addIssue({ code: "custom", message: "oldText 和 newText 必须不同", path: ["newText"] });
    }
    for (const [index, replacement] of (value.replacements ?? []).entries()) {
      if (replacement.oldText === replacement.newText) {
        context.addIssue({
          code: "custom",
          message: "oldText 和 newText 必须不同",
          path: ["replacements", index, "newText"],
        });
      }
    }
  });

export const RunProcessArgumentsSchema = z
  .strictObject({
  program: utf8Limited(4_096)
      .refine(
        (value) => !/[\u0000-\u001f\u007f]/.test(value),
        "program 不能包含控制字符",
      )
      .describe("要直接启动的程序名；不会通过 Shell 解释，命令成败以结构化结果而非输出通道判断。"),
    args: z
      .array(utf8Limited(4_096, true))
      .max(MAX_PROCESS_ARGUMENTS)
      .describe("传给程序的独立普通参数数组；省略时不传参数，不会拼接为 Shell 命令，也不会解释管道、连接符、重定向、$VAR 或命令替换。")
      .optional(),
    cwd: WorkspacePathInputSchema
      .describe("进程工作目录的工作区相对路径；省略时使用工作区根目录。")
      .optional(),
    timeoutMs: z
      .int()
      .min(1_000)
      .max(MAX_PROCESS_TIMEOUT_MS)
      .describe(`进程超时毫秒数；省略时为 ${DEFAULT_PROCESS_TIMEOUT_MS}，最大为 ${MAX_PROCESS_TIMEOUT_MS}。进程不提供 stdin 或自定义环境变量。`)
      .optional(),
    lifecycle: z
      .enum(PROCESS_LIFECYCLES)
      .describe("进程生命周期；oneshot 等待退出，service 在 readiness 成功后保持运行。")
      .optional(),
    readiness: RunProcessReadinessSchema
      .describe("可选的本机 HTTP 就绪探测；oneshot 就绪后停止并清理，service 就绪后保持运行直到所属 run 失败或取消。")
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.lifecycle === "service" && value.readiness === undefined) {
      context.addIssue({ code: "custom", message: "service 生命周期必须提供 readiness", path: ["readiness"] });
    }
    const bytes = (value.args ?? []).reduce(
      (sum, argument) => sum + utf8ByteLength(argument),
      0,
    );
    if (bytes > MAX_PROCESS_ARGUMENT_BYTES) {
      context.addIssue({
        code: "custom",
        message: "进程参数超过 UTF-8 总字节上限",
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
    "列出工作区相对目录中的条目，并限制递归深度和返回数量；可在写入前确认父目录和目标条目，但须注意 depth/limit 与被安全边界阻止的条目。",
  read_file:
    "分页读取工作区内已存在 UTF-8 文本文件的连续行，并返回审计用的完整文件 SHA-256；写工具不要求模型传递该值；每页最多 200 行，hasMore 为 true 时使用 nextStartLine 继续。",
  search_text:
    "在工作区内受限的 UTF-8 文本文件中搜索固定字符串，不使用正则表达式，并限制返回数量。",
  write_file:
    "创建或原子覆盖工作区内的 UTF-8 文件；父目录必须已存在，工具在执行时验证目标和工作区边界。",
  replace_in_file:
    "在工作区文件中原子替换一处文本，或通过 replacements 一次替换同一原始文件中的 1～16 处文本；所有原文本必须在执行快照中唯一且互不重叠，任一失败则整批零写入。",
  run_process:
    "在工作区相对目录中直接启动程序；包管理器脚本参数必须通过 -- 透传。以结构化结果 ok/error/exitCode/readiness 判断成败，stdout/stderr 只是原始输出通道，stderr 不自动等于失败；不启用 Shell，不提供自定义环境变量或标准输入，|、&&、重定向、$VAR、$() 只会作为普通参数而不会被解释。service 生命周期须显式绑定 127.0.0.1，并使用受限 loopback HTTP readiness；监听、启动参数与 readiness 使用同一端口。轻量服务优先使用 10～15 秒 readiness，仅在命令或配置有实际变化后重试。成功后保持服务运行；oneshot 才在成功后清理进程。",
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

const PLANNING_TOOL_NAMES = new Set<LocalToolName>([
  "list_directory",
  "read_file",
  "search_text",
]);

export const PLANNING_TOOL_DEFINITIONS: readonly ToolDefinition[] = Object.freeze(
  LOCAL_TOOL_DEFINITIONS.filter((definition) =>
    PLANNING_TOOL_NAMES.has(definition.function.name as LocalToolName),
  ),
);

const DEPENDENCY_RECOVERY_TOOL_NAMES = new Set<LocalToolName>([
  "list_directory",
  "read_file",
  "search_text",
  "run_process",
]);

export const DEPENDENCY_RECOVERY_TOOL_DEFINITIONS: readonly ToolDefinition[] =
  Object.freeze(
    LOCAL_TOOL_DEFINITIONS.filter((definition) =>
      DEPENDENCY_RECOVERY_TOOL_NAMES.has(definition.function.name as LocalToolName),
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
      };
    }
    case "replace_in_file": {
      const parsed = ReplaceInFileArgumentsSchema.parse(value);
      return {
        path: normalizeWorkspaceRelativePath(parsed.path),
        ...(parsed.replacements !== undefined
          ? { replacements: parsed.replacements.map((item) => ({ ...item })) }
          : { oldText: parsed.oldText!, newText: parsed.newText! }),
      };
    }
    case "run_process": {
      const parsed = RunProcessArgumentsSchema.parse(value);
      return {
        program: parsed.program,
        args: parsed.args ?? [],
        cwd: normalizeWorkspaceRelativePath(parsed.cwd ?? "."),
        timeoutMs: parsed.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS,
        lifecycle: parsed.lifecycle ?? "oneshot",
        ...(parsed.readiness === undefined
          ? {}
          : {
              readiness: {
                url: parsed.readiness.url,
                expectedStatus: parsed.readiness.expectedStatus ?? 200,
                timeoutMs: parsed.readiness.timeoutMs ?? parsed.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS,
              },
            }),
      };
    }
  }
}
