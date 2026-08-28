import { MAX_APPROVAL_REASON_CHARACTERS } from "@/lib/approval";

import { createTerminalError } from "./errors";
import { TerminalCommandSchema, TerminalLaunchSchema } from "./schemas";
import type { TerminalCommand, TerminalLaunch } from "./types";

export const TERMINAL_HELP_TEXT = `SEcode 本地编程智能体

用法：
  pnpm agent
  pnpm agent -- --workspace <绝对路径> --model <profile> [--title <标题>] [--data-dir <绝对路径>]
  pnpm agent -- --session <UUID> [--data-dir <绝对路径>]
  pnpm agent -- --help

命令：
  /help                 显示帮助
  /status               显示当前运行状态
  /approve [原因]       批准待审批操作
  /reject [原因]        拒绝待审批操作
  /cancel [原因]        取消当前运行
  /exit                 安全退出

模型环境变量：
  DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, DEEPSEEK_CONTEXT_WINDOW
  LONGCAT_API_KEY, LONGCAT_BASE_URL, LONGCAT_MODEL, LONGCAT_CONTEXT_WINDOW, LONGCAT_SUPPORTS_THINKING
  OPENAI_COMPAT_API_KEY, OPENAI_COMPAT_BASE_URL, OPENAI_COMPAT_MODEL,
  OPENAI_COMPAT_CONTEXT_WINDOW, OPENAI_COMPAT_SUPPORTS_THINKING

安全边界：仅面向可信本地单用户；文件操作受工作区边界限制，危险操作需要审批。不会自动读取 .env 文件。`;

export const TERMINAL_COMMAND_HELP_TEXT = `可用命令：/help /status /approve [原因] /reject [原因] /cancel [原因] /exit`;

function invalid(field: string, reason: string): never {
  throw createTerminalError("TERMINAL_ARGUMENT_INVALID", "命令行参数无效", { field, reason });
}

export function parseTerminalArguments(argv: readonly string[]): TerminalLaunch {
  const tokens = argv[0] === "--" ? argv.slice(1) : argv;
  if (tokens.length === 1 && tokens[0] === "--help") return { mode: "help" };
  if (tokens.includes("--help")) invalid("argv", "help_must_be_only_flag");

  const allowed = new Set(["--workspace", "--model", "--title", "--session", "--data-dir"]);
  const values = new Map<string, string>();
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (flag === undefined || !allowed.has(flag)) invalid("argv", "unknown_or_positional");
    if (value === undefined || value.startsWith("--")) invalid(flag.slice(2), "missing_value");
    if (values.has(flag)) invalid(flag.slice(2), "duplicate");
    values.set(flag, value);
  }

  const dataDir = values.get("--data-dir");
  const workspacePath = values.get("--workspace");
  const modelProfileId = values.get("--model");
  const title = values.get("--title");
  const sessionId = values.get("--session");

  let candidate: unknown;
  if (sessionId !== undefined) {
    if (workspacePath !== undefined || modelProfileId !== undefined || title !== undefined) {
      invalid("session", "mutually_exclusive");
    }
    candidate = { mode: "resume", sessionId, ...(dataDir ? { dataDir } : {}) };
  } else if (workspacePath !== undefined || modelProfileId !== undefined || title !== undefined) {
    if (workspacePath === undefined || modelProfileId === undefined) invalid("workspace", "workspace_model_pair_required");
    candidate = {
      mode: "create",
      workspacePath,
      modelProfileId,
      ...(title === undefined ? {} : { title }),
      ...(dataDir === undefined ? {} : { dataDir }),
    };
  } else {
    candidate = { mode: "setup", ...(dataDir === undefined ? {} : { dataDir }) };
  }
  const parsed = TerminalLaunchSchema.safeParse(candidate);
  if (!parsed.success) invalid(String(parsed.error.issues[0]?.path[0] ?? "argv"), "schema_invalid");
  return parsed.data;
}

function commandInvalid(command: string, reason: string): never {
  throw createTerminalError("TERMINAL_COMMAND_INVALID", "交互命令无效", { command: command.slice(0, 64), reason });
}

export function parseTerminalCommand(line: string): TerminalCommand {
  const trimmed = line.trim();
  if (trimmed.length === 0) return { kind: "empty" };
  if (!trimmed.startsWith("/")) {
    const parsed = TerminalCommandSchema.safeParse({ kind: "task", content: trimmed });
    if (!parsed.success) commandInvalid("task", "task_length_invalid");
    return parsed.data;
  }

  const firstSpace = trimmed.search(/\s/);
  const token = firstSpace < 0 ? trimmed : trimmed.slice(0, firstSpace);
  const reason = firstSpace < 0 ? undefined : trimmed.slice(firstSpace).trim() || undefined;
  const simple = new Map([["/help", "help"], ["/status", "status"], ["/exit", "exit"]] as const);
  const simpleKind = simple.get(token as "/help" | "/status" | "/exit");
  if (simpleKind !== undefined) {
    if (reason !== undefined) commandInvalid(token, "extra_argument");
    return { kind: simpleKind };
  }
  const reasoned = new Map([["/approve", "approve"], ["/reject", "reject"], ["/cancel", "cancel"]] as const);
  const kind = reasoned.get(token as "/approve" | "/reject" | "/cancel");
  if (kind === undefined) commandInvalid(token, "unknown_command");
  if (reason !== undefined && reason.length > MAX_APPROVAL_REASON_CHARACTERS) commandInvalid(token, "reason_too_long");
  return { kind, ...(reason === undefined ? {} : { reason }) };
}
