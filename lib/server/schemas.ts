import { ApprovalDecisionSchema, MAX_APPROVAL_REASON_CHARACTERS } from "@/lib/approval";
import {
  AgentRunLimitsSchema,
  AgentThinkingOptionsSchema,
  DEFAULT_AGENT_DURATION_MS,
  DEFAULT_MAX_AGENT_ITERATIONS,
  MAX_AGENT_DURATION_MS,
  MAX_AGENT_ITERATIONS,
  MAX_PROMPT_CHARACTERS,
} from "@/lib/agent";
import { UuidSchema } from "@/lib/domain";
import {
  DEFAULT_EVENT_PAGE_LIMIT,
  DEFAULT_RECENT_WORKSPACE_LIMIT,
  MAX_EVENT_PAGE_LIMIT,
  MAX_RECENT_WORKSPACE_LIMIT,
} from "@/lib/storage";
import { MAX_WORKSPACE_PATH_BYTES } from "@/lib/workspace";
import { z } from "zod";

export const MAX_API_JSON_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_NDJSON_LINE_BYTES = 8 * 1024 * 1024;
export const MAX_NDJSON_QUEUE_BYTES = 16 * 1024 * 1024;

const workspacePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => new TextEncoder().encode(value).byteLength <= MAX_WORKSPACE_PATH_BYTES,
    "workspace path is too large",
  );

const modelProfileIdSchema = z.string().trim().min(1).max(128);
const titleSchema = z.string().trim().min(1).max(256);

export const WorkspaceValidateRequestSchema = z.strictObject({
  path: workspacePathSchema,
});

export const CreateSessionRequestSchema = z.strictObject({
  workspacePath: workspacePathSchema,
  modelProfileId: modelProfileIdSchema,
  title: titleSchema.optional(),
});

export const RunRequestBodySchema = z.strictObject({
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

export const ApprovalRequestSchema = ApprovalDecisionSchema;

export const CancelRequestSchema = z.strictObject({
  reason: z.string().max(MAX_APPROVAL_REASON_CHARACTERS).optional(),
});

const integerQuery = (maximum: number, fallback: number, allowZero = false) =>
  z
    .string()
    .regex(allowZero ? /^\d+$/ : /^[1-9]\d*$/)
    .transform(Number)
    .pipe(
      allowZero
        ? z.int().nonnegative().max(maximum)
        : z.int().positive().max(maximum),
    )
    .default(fallback);

export const RecentWorkspaceSearchSchema = z.strictObject({
  limit: integerQuery(
    MAX_RECENT_WORKSPACE_LIMIT,
    DEFAULT_RECENT_WORKSPACE_LIMIT,
  ),
});

export const EventPageSearchSchema = z.strictObject({
  after: integerQuery(Number.MAX_SAFE_INTEGER, 0, true),
  limit: integerQuery(MAX_EVENT_PAGE_LIMIT, DEFAULT_EVENT_PAGE_LIMIT),
});

export const RouteUuidSchema = UuidSchema;

export {
  DEFAULT_AGENT_DURATION_MS,
  DEFAULT_EVENT_PAGE_LIMIT,
  DEFAULT_MAX_AGENT_ITERATIONS,
  DEFAULT_RECENT_WORKSPACE_LIMIT,
  MAX_AGENT_DURATION_MS,
  MAX_AGENT_ITERATIONS,
  MAX_EVENT_PAGE_LIMIT,
  MAX_RECENT_WORKSPACE_LIMIT,
};
