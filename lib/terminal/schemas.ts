import path from "node:path";

import { ErrorInfoSchema, UuidSchema, utf8ByteLength } from "@/lib/domain";
import { MAX_PROMPT_CHARACTERS } from "@/lib/agent";
import { MAX_APPROVAL_REASON_CHARACTERS } from "@/lib/approval";
import { z } from "zod";

import { TERMINAL_EXIT_CODES } from "./types";

export const MAX_TERMINAL_PATH_BYTES = 4_096;
export const MAX_TERMINAL_TITLE_CHARACTERS = 256;
export const MAX_TERMINAL_PROFILE_ID_CHARACTERS = 128;

export const TerminalAbsolutePathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes("\0"), "路径不能包含 NUL")
  .refine(
    (value) => utf8ByteLength(value) <= MAX_TERMINAL_PATH_BYTES,
    `路径不能超过 ${MAX_TERMINAL_PATH_BYTES} UTF-8 字节`,
  )
  .refine((value) => path.isAbsolute(value), "路径必须是绝对路径");

const dataDir = TerminalAbsolutePathSchema.optional();

export const TerminalLaunchSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("help") }),
  z.strictObject({ mode: z.literal("setup"), dataDir }),
  z.strictObject({
    mode: z.literal("create"),
    workspacePath: TerminalAbsolutePathSchema,
    modelProfileId: z.string().trim().min(1).max(MAX_TERMINAL_PROFILE_ID_CHARACTERS),
    title: z.string().trim().min(1).max(MAX_TERMINAL_TITLE_CHARACTERS).optional(),
    dataDir,
  }),
  z.strictObject({ mode: z.literal("resume"), sessionId: UuidSchema, dataDir }),
]);

export const TerminalCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("task"),
    content: z.string().trim().min(1).max(MAX_PROMPT_CHARACTERS),
  }),
  z.strictObject({ kind: z.literal("empty") }),
  z.strictObject({ kind: z.literal("help") }),
  z.strictObject({ kind: z.literal("status") }),
  z.strictObject({
    kind: z.literal("approve"),
    reason: z.string().max(MAX_APPROVAL_REASON_CHARACTERS).optional(),
  }),
  z.strictObject({
    kind: z.literal("reject"),
    reason: z.string().max(MAX_APPROVAL_REASON_CHARACTERS).optional(),
  }),
  z.strictObject({
    kind: z.literal("cancel"),
    reason: z.string().max(MAX_APPROVAL_REASON_CHARACTERS).optional(),
  }),
  z.strictObject({ kind: z.literal("exit") }),
]);

export const TerminalFrameSchema = z.strictObject({
  channel: z.enum(["stdout", "stderr"]),
  mode: z.enum(["line", "append"]),
  text: z.string(),
});

export const TerminalApplicationResultSchema = z.strictObject({
  exitCode: z.union(TERMINAL_EXIT_CODES.map((code) => z.literal(code))),
  reason: z.enum(["normal", "usage", "fatal", "interrupted"]),
});

export const TerminalPublicErrorSchema = ErrorInfoSchema;
