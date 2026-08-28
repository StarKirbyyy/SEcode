import path from "node:path";

import {
  DurableAgentEventSchema,
  IsoDateTimeSchema,
  JsonObjectSchema,
  UuidSchema,
} from "@/lib/domain";
import { z } from "zod";

import {
  DEFAULT_EVENT_PAGE_LIMIT,
  DEFAULT_RECENT_WORKSPACE_LIMIT,
  MAX_EVENT_PAGE_LIMIT,
  MAX_RECENT_WORKSPACE_LIMIT,
  STORAGE_VERSION,
  type DurableEventDraft,
} from "./types";

const absolutePathSchema = z
  .string()
  .min(1)
  .max(4_096)
  .refine((value) => !value.includes("\0"), "path cannot contain NUL")
  .refine((value) => path.isAbsolute(value), "path must be absolute");

export const JsonlEventStoreOptionsSchema = z.strictObject({
  dataDir: z.string().min(1).max(4_096).optional(),
  cwd: absolutePathSchema.optional(),
});

export const CreateStoredSessionInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(256),
  workspacePath: absolutePathSchema,
  modelProfileId: z.string().trim().min(1).max(128),
});

export const StoredSessionMetadataSchema = z.strictObject({
  storageVersion: z.literal(STORAGE_VERSION),
  id: UuidSchema,
  title: z.string().trim().min(1).max(256),
  workspacePath: absolutePathSchema,
  modelProfileId: z.string().trim().min(1).max(128),
  createdAt: IsoDateTimeSchema,
});

const appendableEventTypes = DurableAgentEventSchema.options
  .map((option) => option.shape.type.value)
  .filter((type) => type !== "session.created");

const AppendableEventTypeSchema = z.enum(
  appendableEventTypes as [
    Exclude<DurableEventDraft["type"], "session.created">,
    ...Exclude<DurableEventDraft["type"], "session.created">[],
  ],
);

export const DurableEventDraftSchema: z.ZodType<DurableEventDraft> = z
  .strictObject({
    type: AppendableEventTypeSchema,
    runId: UuidSchema,
    data: JsonObjectSchema,
  })
  .superRefine((draft, context) => {
    const candidate = {
      ...draft,
      protocolVersion: 1,
      durable: true,
      id: "00000000-0000-4000-8000-000000000001",
      seq: 1,
      sessionId: "00000000-0000-4000-8000-000000000002",
      createdAt: "2026-08-27T00:00:00.000Z",
    };
    const parsed = DurableAgentEventSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const pathWithoutEnvelope = issue.path.filter(
          (segment) =>
            ![
              "protocolVersion",
              "durable",
              "id",
              "seq",
              "sessionId",
              "createdAt",
            ].includes(String(segment)),
        );
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: pathWithoutEnvelope,
        });
      }
    }
  }) as unknown as z.ZodType<DurableEventDraft>;

export const EventPageQuerySchema = z
  .strictObject({
    afterSeq: z.int().nonnegative().default(0),
    limit: z.int().positive().max(MAX_EVENT_PAGE_LIMIT).default(
      DEFAULT_EVENT_PAGE_LIMIT,
    ),
  })
  .default({ afterSeq: 0, limit: DEFAULT_EVENT_PAGE_LIMIT });

export const RecentWorkspaceQuerySchema = z
  .strictObject({
    limit: z.int().positive().max(MAX_RECENT_WORKSPACE_LIMIT).default(
      DEFAULT_RECENT_WORKSPACE_LIMIT,
    ),
  })
  .default({ limit: DEFAULT_RECENT_WORKSPACE_LIMIT });

export type JsonlEventStoreOptions = z.input<
  typeof JsonlEventStoreOptionsSchema
>;
export type CreateStoredSessionInput = z.input<
  typeof CreateStoredSessionInputSchema
>;
export type StoredSessionMetadata = z.infer<
  typeof StoredSessionMetadataSchema
>;
export type EventPageQuery = z.input<typeof EventPageQuerySchema>;
export type ParsedEventPageQuery = z.output<typeof EventPageQuerySchema>;
export type RecentWorkspaceQuery = z.input<
  typeof RecentWorkspaceQuerySchema
>;
