import {
  AgentEventSchema,
  ErrorInfoSchema,
  IsoDateTimeSchema,
  ModelProviderSchema,
  SessionRecordSchema,
  UuidSchema,
} from "@/lib/domain";
import { z } from "zod";

const workspacePath = z.string().min(1).max(4_096);
const segments = z.array(z.string().min(1).max(255)).max(64);

export const ConfigResponseSchema = z.strictObject({
  models: z.array(z.strictObject({
    id: z.string().trim().min(1).max(128),
    label: z.string().trim().min(1).max(256),
    provider: ModelProviderSchema,
    model: z.string().trim().min(1).max(256),
    contextWindow: z.int().positive(),
    supportsThinking: z.boolean(),
    configured: z.boolean(),
  })),
  issues: z.array(z.strictObject({
    profileId: z.string().trim().min(1).max(128),
    code: z.string().min(1).max(128),
    message: z.string().min(1).max(1_024),
  })),
  agentLimits: z.strictObject({
    defaultMaxModelRequests: z.null(),
    maximumModelRequests: z.int().positive(),
    defaultMaxToolCalls: z.int().positive(),
    maximumToolCalls: z.int().positive(),
    defaultMaxIterations: z.null(),
    maximumIterations: z.int().positive(),
    defaultMaxDurationMs: z.int().positive(),
    maximumDurationMs: z.int().positive(),
  }),
  securityBoundary: z.strictObject({
    mode: z.literal("trusted_local_single_user"),
    operatingSystemSandbox: z.literal(false),
  }),
});

export const RecentWorkspacesResponseSchema = z.strictObject({
  workspaces: z.array(workspacePath),
});

export const PublicSessionMetadataSchema = z.strictObject({
  id: UuidSchema,
  title: z.string().trim().min(1).max(256),
  workspacePath,
  modelProfileId: z.string().trim().min(1).max(128),
  createdAt: IsoDateTimeSchema,
});

export const SessionsResponseSchema = z.strictObject({
  sessions: z.array(PublicSessionMetadataSchema),
});

export const ValidateWorkspaceResponseSchema = z.strictObject({
  workspacePath,
});

export const WorkspacePermissionResponseSchema = z.strictObject({
  workspacePath,
  mode: z.enum(["ask", "full"]),
});

export const CreatedSessionResponseSchema = z.strictObject({
  session: SessionRecordSchema,
  event: AgentEventSchema.refine(
    (event) => event.durable && event.type === "session.created",
    "expected session.created event",
  ),
});

export const DeletedSessionResponseSchema = z.strictObject({
  sessionId: UuidSchema,
  status: z.literal("deleted"),
});

export const EventPageResponseSchema = z.strictObject({
  events: z.array(AgentEventSchema.refine((event) => event.durable)),
  lastSeq: z.int().nonnegative(),
  hasMore: z.boolean(),
  recovery: z.strictObject({
    tailRepaired: z.boolean(),
    discardedTailBytes: z.int().nonnegative(),
    lastStableSeq: z.int().nonnegative(),
    openRunIds: z.array(UuidSchema),
  }),
});

const pickerLocation = z.strictObject({
  label: z.string().min(1).max(4_096),
  workspacePath,
});

export const BrowseWorkspaceResponseSchema = z.strictObject({
  root: pickerLocation,
  current: pickerLocation.extend({ segments }),
  parentSegments: segments.nullable(),
  directories: z.array(z.strictObject({
    name: z.string().min(1).max(255),
    segments,
    symbolicLink: z.boolean(),
  })).max(500),
  blockedEntries: z.int().nonnegative(),
  ignoredEntries: z.int().nonnegative(),
  truncated: z.boolean(),
});

export const ApprovalResponseSchema = z.strictObject({
  runId: UuidSchema,
  approvalId: UuidSchema,
  status: z.literal("resolved"),
  approved: z.boolean(),
});

export const PlanApprovalResponseSchema = z.strictObject({
  runId: UuidSchema,
  planId: UuidSchema,
  approvalId: UuidSchema,
  status: z.literal("resolved"),
  approved: z.boolean(),
});

export const CancelResponseSchema = z.strictObject({
  runId: UuidSchema,
  status: z.enum(["cancellation_requested", "already_requested"]),
});

export const ApiErrorEnvelopeSchema = z.strictObject({
  error: ErrorInfoSchema,
});
