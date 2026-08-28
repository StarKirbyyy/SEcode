import type { ModelEnvironment } from "@/lib/model";

import { createTerminalError } from "./errors";
import { TerminalAbsolutePathSchema } from "./schemas";

export const TERMINAL_MODEL_ENVIRONMENT_NAMES = [
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "DEEPSEEK_CONTEXT_WINDOW",
  "LONGCAT_API_KEY",
  "LONGCAT_BASE_URL",
  "LONGCAT_MODEL",
  "LONGCAT_CONTEXT_WINDOW",
  "LONGCAT_SUPPORTS_THINKING",
  "OPENAI_COMPAT_API_KEY",
  "OPENAI_COMPAT_BASE_URL",
  "OPENAI_COMPAT_MODEL",
  "OPENAI_COMPAT_CONTEXT_WINDOW",
  "OPENAI_COMPAT_SUPPORTS_THINKING",
] as const;

export function selectModelEnvironment(source: Readonly<Record<string, string | undefined>>): ModelEnvironment {
  const selected: Record<string, string | undefined> = {};
  for (const name of TERMINAL_MODEL_ENVIRONMENT_NAMES) selected[name] = source[name];
  return Object.freeze(selected);
}

export function selectTerminalDataDirectory(
  flagValue: string | undefined,
  source: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const candidate = flagValue ?? (source.SECODE_DATA_DIR?.trim() || undefined);
  if (candidate === undefined) return undefined;
  const parsed = TerminalAbsolutePathSchema.safeParse(candidate);
  if (!parsed.success) {
    throw createTerminalError("TERMINAL_ARGUMENT_INVALID", "数据目录必须是有效绝对路径", {
      field: flagValue === undefined ? "SECODE_DATA_DIR" : "dataDir",
      reason: "invalid_absolute_path",
    });
  }
  return parsed.data;
}
