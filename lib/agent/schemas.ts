import {
  ChatMessageSchema,
  UuidSchema,
} from "@/lib/domain";
import { z } from "zod";

import {
  DEFAULT_AGENT_DURATION_MS,
  DEFAULT_MAX_AGENT_ITERATIONS,
  MAX_AGENT_DURATION_MS,
  MAX_AGENT_ITERATIONS,
  MAX_PROMPT_CHARACTERS,
  MIN_AGENT_DURATION_MS,
} from "./types";

export const AgentRunLimitsSchema = z
  .strictObject({
    maxIterations: z
      .int()
      .min(1)
      .max(MAX_AGENT_ITERATIONS)
      .default(DEFAULT_MAX_AGENT_ITERATIONS),
    maxDurationMs: z
      .int()
      .min(MIN_AGENT_DURATION_MS)
      .max(MAX_AGENT_DURATION_MS)
      .default(DEFAULT_AGENT_DURATION_MS),
  })
  .default({
    maxIterations: DEFAULT_MAX_AGENT_ITERATIONS,
    maxDurationMs: DEFAULT_AGENT_DURATION_MS,
  });

export const AgentThinkingOptionsSchema = z.strictObject({
  enabled: z.boolean(),
  effort: z.enum(["low", "high", "max"]).optional(),
});

export const AgentRunRequestSchema = z.strictObject({
  sessionId: UuidSchema,
  prompt: z
    .string()
    .max(MAX_PROMPT_CHARACTERS)
    .refine((value) => value.trim().length > 0, "prompt cannot be empty"),
  limits: AgentRunLimitsSchema.optional().default({
    maxIterations: DEFAULT_MAX_AGENT_ITERATIONS,
    maxDurationMs: DEFAULT_AGENT_DURATION_MS,
  }),
  thinking: AgentThinkingOptionsSchema.optional(),
});

export const AgentCompactionDraftSchema = z.strictObject({
  throughSeq: z.int().positive(),
  summary: z.string().min(1).max(65_536),
  retainedRange: z
    .strictObject({
      fromSeq: z.int().positive(),
      toSeq: z.int().positive(),
    })
    .refine(
      ({ fromSeq, toSeq }) => fromSeq <= toSeq,
      "retained range must be ordered",
    ),
});

export const AgentContextResultSchema = z.strictObject({
  messages: z.array(ChatMessageSchema).min(1),
  compaction: AgentCompactionDraftSchema.optional(),
});

export type ParsedAgentRunRequest = z.output<
  typeof AgentRunRequestSchema
>;
export type ParsedAgentContextResult = z.output<
  typeof AgentContextResultSchema
>;
