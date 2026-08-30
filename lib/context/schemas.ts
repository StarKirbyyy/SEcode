import {
  ChatMessageSchema,
  JsonObjectSchema,
  UuidSchema,
} from "@/lib/domain";
import { z } from "zod";

import {
  CONTEXT_PROTOCOL_VERSION,
  CONTEXT_SUMMARY_MARKER,
  MAX_CONTEXT_SUMMARY_CHARACTERS,
} from "./types";

const SummaryDiagnosticSchema = z.strictObject({
  seq: z.int().positive(),
  kind: z.enum(["tool_error", "run_terminal", "completion_evidence", "validation_repair"]),
  code: z.string().trim().min(1).max(128).optional(),
  message: z.string().min(1).max(8_192),
});

export const ContextSummaryTranscriptSchema = z.strictObject({
  protocolVersion: z.literal(CONTEXT_PROTOCOL_VERSION),
  previousSummary: z
    .string()
    .min(1)
    .max(MAX_CONTEXT_SUMMARY_CHARACTERS)
    .optional(),
  throughSeq: z.int().positive(),
  targetTokens: z.int().positive(),
  goals: z.array(z.strictObject({
    runId: UuidSchema,
    content: z.string().min(1).max(1_048_576),
  })),
  rounds: z.array(JsonObjectSchema).min(1),
  diagnostics: z.array(SummaryDiagnosticSchema),
});

export const ContextSummaryEnvelopeSchema = z.strictObject({
  marker: z.literal(CONTEXT_SUMMARY_MARKER),
  content: z.string().trim().min(1).max(MAX_CONTEXT_SUMMARY_CHARACTERS),
});

export const ContextMessagesSchema = z.array(ChatMessageSchema).min(2);
