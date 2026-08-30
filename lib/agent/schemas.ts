import {
  ChatMessageSchema,
  UuidSchema,
} from "@/lib/domain";
import { z } from "zod";

import {
  DEFAULT_AGENT_DURATION_MS,
  DEFAULT_MAX_TOOL_CALLS,
  MAX_AGENT_DURATION_MS,
  MAX_AGENT_ITERATIONS,
  MAX_MODEL_REQUESTS,
  MAX_TOOL_CALLS,
  MAX_PROMPT_CHARACTERS,
  MIN_AGENT_DURATION_MS,
} from "./types";

export const AgentRunLimitsSchema = z
  .strictObject({
    maxModelRequests: z.int().min(1).max(MAX_MODEL_REQUESTS).optional(),
    maxToolCalls: z.int().min(1).max(MAX_TOOL_CALLS).optional(),
    maxIterations: z.int().min(1).max(MAX_AGENT_ITERATIONS).optional(),
    maxDurationMs: z
      .int()
      .min(MIN_AGENT_DURATION_MS)
      .max(MAX_AGENT_DURATION_MS)
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.maxModelRequests !== undefined && value.maxIterations !== undefined) {
      context.addIssue({
        code: "custom",
        message: "maxIterations cannot be combined with maxModelRequests",
        path: ["maxIterations"],
      });
    }
  })
  .default({});

export const AgentThinkingOptionsSchema = z.strictObject({
  enabled: z.boolean(),
  effort: z.enum(["low", "high", "max"]).optional(),
});

export const AgentPlanDecisionSchema = z.strictObject({
  planId: UuidSchema,
  approved: z.boolean(),
  reason: z.string().max(4_096).optional(),
});

export const AgentRunRequestSchema = z.strictObject({
  sessionId: UuidSchema,
  prompt: z
    .string()
    .max(MAX_PROMPT_CHARACTERS)
    .refine((value) => value.trim().length > 0, "prompt cannot be empty"),
  limits: AgentRunLimitsSchema.optional().default({}),
  planningEnabled: z.boolean().optional().default(false),
  thinking: AgentThinkingOptionsSchema.optional(),
  permissionMode: z.enum(["ask", "full"]).optional().default("ask"),
}).transform((value) => ({
  ...value,
  limits: {
    ...((value.limits.maxModelRequests ?? value.limits.maxIterations) === undefined
      ? {}
      : { maxModelRequests: value.limits.maxModelRequests ?? value.limits.maxIterations }),
    maxToolCalls: value.limits.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS,
    maxDurationMs: value.limits.maxDurationMs ?? DEFAULT_AGENT_DURATION_MS,
  },
}));

export const AgentCompactionDraftSchema = z
  .strictObject({
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
    strategy: z.enum(["model", "deterministic_fallback"]).optional(),
    fallbackReason: z.enum([
      "model_timeout",
      "model_failed",
      "model_output_invalid",
      "summary_input_over_budget",
    ]).optional(),
    usage: z.strictObject({
      promptTokens: z.int().nonnegative().optional(),
      completionTokens: z.int().nonnegative().optional(),
      totalTokens: z.int().nonnegative().optional(),
      reasoningTokens: z.int().nonnegative().optional(),
      cachedPromptTokens: z.int().nonnegative().optional(),
      cacheMissPromptTokens: z.int().nonnegative().optional(),
    }).optional(),
    usageComplete: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.strategy === "deterministic_fallback" &&
      value.fallbackReason === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "fallback reason is required",
        path: ["fallbackReason"],
      });
    }
    if (
      value.strategy !== "deterministic_fallback" &&
      value.fallbackReason !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "fallback reason requires deterministic fallback",
        path: ["fallbackReason"],
      });
    }
  });

export const AgentContextResultSchema = z.strictObject({
  messages: z.array(ChatMessageSchema).min(1),
  compaction: AgentCompactionDraftSchema.optional(),
  contextCache: z.strictObject({
    status: z.enum(["cold", "warm", "invalidated"]),
    reusedEvents: z.int().nonnegative(),
    tailEvents: z.int().nonnegative(),
    avoidedBytes: z.int().nonnegative(),
    buildMilliseconds: z.int().nonnegative(),
  }).optional(),
});

export type ParsedAgentRunRequest = z.output<
  typeof AgentRunRequestSchema
>;
export type ParsedAgentContextResult = z.output<
  typeof AgentContextResultSchema
>;
