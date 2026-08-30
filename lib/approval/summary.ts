import { redactSecrets } from "@/lib/domain";
import type { PreparedLocalToolInvocation } from "@/lib/tools";

import { MAX_TOOL_SUMMARY_CHARACTERS } from "./types";

const TOKEN_PREVIEW_CHARACTERS = 192;
const SENSITIVE_ARGUMENT_KEY =
  /(?:token|secret|password|authorization|api[_-]?key)/i;
const ASSIGNMENT =
  /\b([A-Za-z_][A-Za-z0-9_.-]*)(\s*=\s*)[^\s,"']+/g;

function bounded(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  if (maximum <= 1) return value.slice(0, maximum);
  return `${value.slice(0, maximum - 1)}…`;
}

function safeValue(value: string, maximum = TOKEN_PREVIEW_CHARACTERS): string {
  return bounded(
    redactSecrets(value).replace(
      ASSIGNMENT,
      (match, key: string, separator: string) =>
        SENSITIVE_ARGUMENT_KEY.test(key)
          ? `${key}${separator}[REDACTED]`
          : match,
    ),
    maximum,
  );
}

function processSummary(
  invocation: Extract<PreparedLocalToolInvocation, { name: "run_process" }>,
): string {
  const program = JSON.stringify(safeValue(invocation.arguments.program));
  const cwd = JSON.stringify(safeValue(invocation.arguments.cwd));
  const readiness = invocation.arguments.readiness === undefined
    ? ""
    : ` readiness=${JSON.stringify(invocation.arguments.readiness.url)} expectedStatus=${invocation.arguments.readiness.expectedStatus}`;
  let redactNext = false;
  const args = invocation.arguments.args.map((argument) => {
    if (redactNext) {
      redactNext = false;
      return JSON.stringify("[REDACTED]");
    }
    const separator = argument.indexOf("=");
    if (separator > 0 && SENSITIVE_ARGUMENT_KEY.test(argument.slice(0, separator))) {
      return JSON.stringify(
        `${safeValue(argument.slice(0, separator + 1))}[REDACTED]`,
      );
    }
    if (separator === -1 && SENSITIVE_ARGUMENT_KEY.test(argument)) {
      redactNext = true;
    }
    return JSON.stringify(safeValue(argument));
  });
  return bounded(
    `执行程序 program=${program} cwd=${cwd}${readiness} argv=[${args.join(", ")}]`,
    MAX_TOOL_SUMMARY_CHARACTERS,
  );
}

export function createToolSummary(
  invocation: PreparedLocalToolInvocation,
): string {
  switch (invocation.name) {
    case "list_directory":
      return bounded(
        `列出目录 path=${JSON.stringify(safeValue(invocation.arguments.path))}`,
        MAX_TOOL_SUMMARY_CHARACTERS,
      );
    case "read_file":
      return bounded(
        `读取文件 path=${JSON.stringify(safeValue(invocation.arguments.path))}`,
        MAX_TOOL_SUMMARY_CHARACTERS,
      );
    case "search_text":
      return bounded(
        `搜索文本 path=${JSON.stringify(safeValue(invocation.arguments.path))} query=${JSON.stringify(safeValue(invocation.arguments.query))}`,
        MAX_TOOL_SUMMARY_CHARACTERS,
      );
    case "write_file":
      return bounded(
        `写入文件 path=${JSON.stringify(safeValue(invocation.arguments.path))}`,
        MAX_TOOL_SUMMARY_CHARACTERS,
      );
    case "replace_in_file":
      return bounded(
        `替换文件内容 path=${JSON.stringify(safeValue(invocation.arguments.path))} count=${"replacements" in invocation.arguments ? invocation.arguments.replacements.length : 1}`,
        MAX_TOOL_SUMMARY_CHARACTERS,
      );
    case "run_process":
      return processSummary(invocation);
  }
}
