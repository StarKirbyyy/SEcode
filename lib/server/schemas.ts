import { ApprovalDecisionSchema, MAX_APPROVAL_REASON_CHARACTERS } from "@/lib/approval";
import {
  AgentPlanDecisionSchema,
  AgentRunLimitsSchema,
  AgentThinkingOptionsSchema,
  DEFAULT_AGENT_DURATION_MS,
  DEFAULT_MAX_AGENT_ITERATIONS,
  DEFAULT_MAX_TOOL_CALLS,
  MAX_AGENT_DURATION_MS,
  MAX_AGENT_ITERATIONS,
  MAX_MODEL_REQUESTS,
  MAX_PROMPT_CHARACTERS,
  MAX_TOOL_CALLS,
} from "@/lib/agent";
import { UuidSchema } from "@/lib/domain";
import {
  DEFAULT_EVENT_PAGE_LIMIT,
  DEFAULT_RECENT_WORKSPACE_LIMIT,
  MAX_EVENT_PAGE_LIMIT,
  MAX_RECENT_WORKSPACE_LIMIT,
} from "@/lib/storage";
import { MAX_WORKSPACE_PATH_BYTES } from "@/lib/workspace";
import { WORKSPACE_PERMISSION_MODES } from "@/lib/approval";
import { z } from "zod";

export const MAX_API_JSON_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_NDJSON_LINE_BYTES = 8 * 1024 * 1024;
export const MAX_NDJSON_QUEUE_BYTES = 16 * 1024 * 1024;
export const MAX_WORKSPACE_PICKER_SEGMENTS = 64;
export const MAX_WORKSPACE_PICKER_SEGMENT_CHARACTERS = 255;
export const MAX_WORKSPACE_PICKER_PATH_BYTES = MAX_WORKSPACE_PATH_BYTES;
export const MAX_WORKSPACE_PICKER_DIRECTORIES = 500;

const pickerSchemePattern = /^[A-Za-z][A-Za-z\d+.-]*:/;
const pickerControlPattern = /[\u0000-\u001f\u007f]/;

const workspacePickerSegmentSchema = z
  .string()
  .refine(
    (value) =>
      Array.from(value).length >= 1 &&
      Array.from(value).length <= MAX_WORKSPACE_PICKER_SEGMENT_CHARACTERS,
    "workspace picker segment length is invalid",
  )
  .refine((value) => value !== "." && value !== "..", "workspace picker traversal is forbidden")
  .refine((value) => !value.includes("/") && !value.includes("\\"), "workspace picker separators are forbidden")
  .refine((value) => !pickerControlPattern.test(value), "workspace picker control characters are forbidden")
  .refine((value) => !value.startsWith("~"), "workspace picker home semantics are forbidden")
  .refine((value) => !pickerSchemePattern.test(value), "workspace picker URL or drive semantics are forbidden");

export const BrowseWorkspaceRequestSchema = z
  .strictObject({
    segments: z.array(workspacePickerSegmentSchema).max(MAX_WORKSPACE_PICKER_SEGMENTS),
  })
  .refine(
    ({ segments }) =>
      new TextEncoder().encode(segments.join("/")).byteLength <=
      MAX_WORKSPACE_PICKER_PATH_BYTES,
    { message: "workspace picker path is too large", path: ["segments"] },
  );

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

export const WorkspacePermissionRequestSchema = z.strictObject({
  path: workspacePathSchema,
  mode: z.enum(WORKSPACE_PERMISSION_MODES),
});
export const WorkspacePermissionQuerySchema = z.strictObject({ path: workspacePathSchema });

export const CreateSessionRequestSchema = z.strictObject({
  workspacePath: workspacePathSchema,
  modelProfileId: modelProfileIdSchema,
  title: titleSchema.optional(),
});

export const RunRequestBodySchema = z
  .strictObject({
    prompt: z
      .string()
      .max(MAX_PROMPT_CHARACTERS)
      .refine((value) => value.trim().length > 0, "prompt cannot be empty"),
    planningEnabled: z.boolean().optional().default(false),
    limits: AgentRunLimitsSchema.optional(),
    thinking: AgentThinkingOptionsSchema.optional(),
  })
  .transform((value) => ({
    ...value,
    limits: {
      ...((value.limits?.maxModelRequests ?? value.limits?.maxIterations) === undefined
        ? {}
        : { maxModelRequests: value.limits?.maxModelRequests ?? value.limits?.maxIterations }),
      maxToolCalls: value.limits?.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS,
      maxDurationMs: value.limits?.maxDurationMs ?? DEFAULT_AGENT_DURATION_MS,
    },
  }));

export const ApprovalRequestSchema = ApprovalDecisionSchema;
export const PlanApprovalRequestSchema = AgentPlanDecisionSchema;

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
  DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_RECENT_WORKSPACE_LIMIT,
  MAX_AGENT_DURATION_MS,
  MAX_AGENT_ITERATIONS,
  MAX_MODEL_REQUESTS,
  MAX_EVENT_PAGE_LIMIT,
  MAX_RECENT_WORKSPACE_LIMIT,
  MAX_TOOL_CALLS,
};
