import { z } from "zod";

import {
  IsoDateTimeSchema,
  JsonObjectSchema,
  UuidSchema,
} from "./json";

export const TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const ToolNameSchema = z.string().regex(TOOL_NAME_PATTERN);

export const ModelProviderSchema = z.enum([
  "deepseek",
  "longcat",
  "generic",
]);

export const ModelProfileSchema = z.strictObject({
  id: z.string().trim().min(1).max(128),
  label: z.string().trim().min(1).max(256),
  provider: ModelProviderSchema,
  baseUrl: z.url(),
  model: z.string().trim().min(1).max(256),
  contextWindow: z.int().positive(),
  supportsThinking: z.boolean(),
  configured: z.boolean(),
});

export const RunStatusSchema = z.enum([
  "queued",
  "requesting_model",
  "awaiting_approval",
  "executing_tool",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

export const TerminalRunStatusSchema = z.enum([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

export const SessionRecordSchema = z.strictObject({
  id: UuidSchema,
  title: z.string().trim().min(1).max(256),
  workspacePath: z.string().min(1).max(4_096),
  modelProfileId: z.string().trim().min(1).max(128),
  status: z.union([z.literal("idle"), RunStatusSchema]),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const ChatToolCallSchema = z.strictObject({
  id: UuidSchema,
  name: ToolNameSchema,
  arguments: JsonObjectSchema,
});

const SystemOrUserMessageSchema = z.strictObject({
  role: z.enum(["system", "user"]),
  content: z.string(),
});

const AssistantMessageSchema = z
  .strictObject({
    role: z.literal("assistant"),
    content: z.string().nullable(),
    toolCalls: z.array(ChatToolCallSchema).min(1).optional(),
  })
  .refine(
    (message) =>
      (message.content !== null && message.content.length > 0) ||
      message.toolCalls !== undefined,
    "assistant message must contain text or at least one tool call",
  );

const ToolMessageSchema = z.strictObject({
  role: z.literal("tool"),
  toolCallId: UuidSchema,
  name: ToolNameSchema,
  content: z.string(),
});

export const ChatMessageSchema = z.union([
  SystemOrUserMessageSchema,
  AssistantMessageSchema,
  ToolMessageSchema,
]);

export type ModelProvider = z.infer<typeof ModelProviderSchema>;
export type ModelProfile = z.infer<typeof ModelProfileSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type TerminalRunStatus = z.infer<typeof TerminalRunStatusSchema>;
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
export type ChatToolCall = z.infer<typeof ChatToolCallSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
