import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CreateStoredSessionInputSchema,
  DurableEventDraftSchema,
  EventPageQuerySchema,
  JsonlEventStoreOptionsSchema,
  RecentWorkspaceQuerySchema,
  StoredSessionMetadataSchema,
} from "@/lib/storage/schemas";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("storage schemas", () => {
  it("accepts approved options and applies query defaults", () => {
    expect(JsonlEventStoreOptionsSchema.parse({})).toEqual({});
    expect(EventPageQuerySchema.parse(undefined)).toEqual({
      afterSeq: 0,
      limit: 500,
    });
    expect(RecentWorkspaceQuerySchema.parse(undefined)).toEqual({ limit: 20 });
  });

  it("rejects extra keys and invalid query bounds", () => {
    expect(() => JsonlEventStoreOptionsSchema.parse({ extra: true })).toThrow();
    expect(() => EventPageQuerySchema.parse({ afterSeq: -1 })).toThrow();
    expect(() => EventPageQuerySchema.parse({ limit: 1_001 })).toThrow();
    expect(() => RecentWorkspaceQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("requires absolute workspace paths and strict metadata", () => {
    const input = {
      title: "Session",
      workspacePath: path.resolve("/tmp/project"),
      modelProfileId: "deepseek",
    };
    expect(CreateStoredSessionInputSchema.parse(input)).toEqual(input);
    expect(() =>
      CreateStoredSessionInputSchema.parse({
        ...input,
        workspacePath: "relative/project",
      }),
    ).toThrow();
    expect(() =>
      StoredSessionMetadataSchema.parse({
        storageVersion: 1,
        id: uuid,
        createdAt: "2026-08-27T00:00:00.000Z",
        ...input,
        status: "idle",
      }),
    ).toThrow();
  });

  it("accepts a valid run event draft", () => {
    expect(
      DurableEventDraftSchema.parse({
        type: "run.started",
        runId: uuid,
        data: {
          promptPreview: "Fix tests",
          limits: { maxIterations: 30, maxDurationMs: 600_000 },
        },
      }),
    ).toMatchObject({ type: "run.started", runId: uuid });
  });

  it("rejects session.created, live events, envelope fields and invalid data", () => {
    expect(() =>
      DurableEventDraftSchema.parse({
        type: "session.created",
        data: {},
      }),
    ).toThrow();
    expect(() =>
      DurableEventDraftSchema.parse({
        type: "assistant.delta",
        runId: uuid,
        data: { content: "delta" },
      }),
    ).toThrow();
    expect(() =>
      DurableEventDraftSchema.parse({
        type: "user.message",
        runId: uuid,
        data: { content: "task" },
        seq: 2,
      }),
    ).toThrow();
    expect(() =>
      DurableEventDraftSchema.parse({
        type: "user.message",
        runId: uuid,
        data: { content: "" },
      }),
    ).toThrow();
  });
});
