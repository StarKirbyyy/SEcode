import { z } from "zod";

import { ErrorInfoSchema, ToolResultSchema } from "./core";
import {
  IsoDateTimeSchema,
  JsonObjectSchema,
  ProtocolVersionSchema,
  SequenceSchema,
  UuidSchema,
} from "./json";
import { SessionRecordSchema } from "./model";
import { ToolNameSchema } from "./tool";

const nonEmptyText = (maximum = 65_536) => z.string().min(1).max(maximum);

const DurableEnvelopeSchema = z.strictObject({
  protocolVersion: ProtocolVersionSchema,
  durable: z.literal(true),
  id: UuidSchema,
  seq: SequenceSchema,
  sessionId: UuidSchema,
  runId: UuidSchema.optional(),
  type: z.string(),
  createdAt: IsoDateTimeSchema,
  data: JsonObjectSchema,
});

const RunDurableEnvelopeSchema = DurableEnvelopeSchema.required({ runId: true });

const LiveEnvelopeSchema = z.strictObject({
  protocolVersion: ProtocolVersionSchema,
  durable: z.literal(false),
  id: UuidSchema,
  streamSeq: SequenceSchema,
  sessionId: UuidSchema,
  runId: UuidSchema,
  type: z.string(),
  createdAt: IsoDateTimeSchema,
  data: JsonObjectSchema,
});

function durableEvent<T extends string, S extends z.ZodType>(
  type: T,
  data: S,
  runScoped = true,
) {
  const envelope = runScoped ? RunDurableEnvelopeSchema : DurableEnvelopeSchema;
  return envelope.extend({ type: z.literal(type), data });
}

function liveEvent<T extends string, S extends z.ZodType>(type: T, data: S) {
  return LiveEnvelopeSchema.extend({ type: z.literal(type), data });
}

const SessionCreatedEventSchema = durableEvent(
  "session.created",
  z.strictObject({ session: SessionRecordSchema }),
  false,
);

const RunStartedEventSchema = durableEvent(
  "run.started",
  z.strictObject({
    promptPreview: z.string().max(4_096),
    limits: z.strictObject({
      maxIterations: z.int().positive(),
      maxDurationMs: z.int().positive(),
    }),
  }),
);

const UserMessageEventSchema = durableEvent(
  "user.message",
  z.strictObject({ content: nonEmptyText(1_048_576) }),
);

const ModelRequestedEventSchema = durableEvent(
  "model.requested",
  z.strictObject({
    iteration: z.int().positive(),
    modelProfileId: z.string().trim().min(1).max(128),
  }),
);

const UsageSchema = z.strictObject({
  promptTokens: z.int().nonnegative().optional(),
  completionTokens: z.int().nonnegative().optional(),
  totalTokens: z.int().nonnegative().optional(),
});

const ModelCompletedEventSchema = durableEvent(
  "model.completed",
  z.strictObject({
    iteration: z.int().positive(),
    finishReason: z.string().trim().min(1).max(128),
    usage: UsageSchema.optional(),
  }),
);

const AssistantMessageEventSchema = durableEvent(
  "assistant.message",
  z.strictObject({
    content: nonEmptyText(1_048_576),
    kind: z.enum(["intermediate", "final"]),
  }),
);

const ToolRequestedEventSchema = durableEvent(
  "tool.requested",
  z.strictObject({
    toolCallId: UuidSchema,
    toolName: ToolNameSchema,
    publicArguments: JsonObjectSchema,
    argumentsTruncated: z.boolean(),
  }),
);

const ApprovalRequiredEventSchema = durableEvent(
  "approval.required",
  z.strictObject({
    approvalId: UuidSchema,
    toolCallId: UuidSchema,
    reason: nonEmptyText(4_096),
    toolSummary: nonEmptyText(1_024),
  }),
);

const ApprovalResolvedEventSchema = durableEvent(
  "approval.resolved",
  z.strictObject({
    approvalId: UuidSchema,
    approved: z.boolean(),
    reason: z.string().max(4_096).optional(),
  }),
);

const ToolStartedEventSchema = durableEvent(
  "tool.started",
  z.strictObject({
    toolCallId: UuidSchema,
    toolName: ToolNameSchema,
  }),
);

const ToolResultEventSchema = durableEvent(
  "tool.result",
  z.strictObject({
    toolCallId: UuidSchema,
    toolName: ToolNameSchema,
    result: ToolResultSchema,
  }),
);

const ContextCompactedEventSchema = durableEvent(
  "context.compacted",
  z
    .strictObject({
      throughSeq: SequenceSchema,
      summary: nonEmptyText(65_536),
      retainedRange: z.strictObject({
        fromSeq: SequenceSchema,
        toSeq: SequenceSchema,
      }),
    })
    .refine(
      ({ retainedRange }) => retainedRange.fromSeq <= retainedRange.toSeq,
      {
        message: "retained range must be ordered",
        path: ["retainedRange"],
      },
    ),
);

const RunCompletedEventSchema = durableEvent(
  "run.completed",
  z.strictObject({
    iterations: z.int().nonnegative(),
    durationMs: z.int().nonnegative(),
  }),
);

const RunFailedEventSchema = durableEvent(
  "run.failed",
  z.strictObject({
    error: ErrorInfoSchema,
    iterations: z.int().nonnegative(),
  }),
);

const RunCancelledEventSchema = durableEvent(
  "run.cancelled",
  z.strictObject({
    reason: nonEmptyText(4_096),
    iterations: z.int().nonnegative(),
  }),
);

const RunInterruptedEventSchema = durableEvent(
  "run.interrupted",
  z.strictObject({
    reason: nonEmptyText(4_096),
    lastStableSeq: z.int().nonnegative(),
  }),
);

const AssistantDeltaEventSchema = liveEvent(
  "assistant.delta",
  z.strictObject({ content: z.string().min(1) }),
);

export const DurableAgentEventSchema = z.discriminatedUnion("type", [
  SessionCreatedEventSchema,
  RunStartedEventSchema,
  UserMessageEventSchema,
  ModelRequestedEventSchema,
  ModelCompletedEventSchema,
  AssistantMessageEventSchema,
  ToolRequestedEventSchema,
  ApprovalRequiredEventSchema,
  ApprovalResolvedEventSchema,
  ToolStartedEventSchema,
  ToolResultEventSchema,
  ContextCompactedEventSchema,
  RunCompletedEventSchema,
  RunFailedEventSchema,
  RunCancelledEventSchema,
  RunInterruptedEventSchema,
]);

export const LiveAgentEventSchema = z.discriminatedUnion("type", [
  AssistantDeltaEventSchema,
]);

export const AgentEventSchema = z.union([
  DurableAgentEventSchema,
  LiveAgentEventSchema,
]);

export type DurableAgentEvent = z.infer<typeof DurableAgentEventSchema>;
export type LiveAgentEvent = z.infer<typeof LiveAgentEventSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type DurableEventType = DurableAgentEvent["type"];
export type LiveEventType = LiveAgentEvent["type"];
export type AgentEventType = AgentEvent["type"];
export type TerminalRunEvent = Extract<
  DurableAgentEvent,
  { type: "run.completed" | "run.failed" | "run.cancelled" | "run.interrupted" }
>;

const TERMINAL_RUN_EVENT_TYPES = new Set<AgentEventType>([
  "run.completed",
  "run.failed",
  "run.cancelled",
  "run.interrupted",
]);

export function isDurableEvent(event: AgentEvent): event is DurableAgentEvent {
  return event.durable;
}

export function isTerminalRunEvent(event: AgentEvent): event is TerminalRunEvent {
  return TERMINAL_RUN_EVENT_TYPES.has(event.type);
}
