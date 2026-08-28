import { describe, expect, it } from "vitest";

import {
  ApprovalRequestSchema,
  CancelRequestSchema,
  CreateSessionRequestSchema,
  EventPageSearchSchema,
  RecentWorkspaceSearchSchema,
  RouteUuidSchema,
  RunRequestBodySchema,
  WorkspaceValidateRequestSchema,
} from "@/lib/server";
import {
  MAX_API_JSON_BODY_BYTES,
  MAX_NDJSON_LINE_BYTES,
  MAX_NDJSON_QUEUE_BYTES,
} from "@/lib/server/schemas";

const ID = "00000000-0000-4000-8000-000000000001";

describe("server schemas", () => {
  it("fixes transport byte limits", () => {
    expect(MAX_API_JSON_BODY_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_NDJSON_LINE_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_NDJSON_QUEUE_BYTES).toBe(16 * 1024 * 1024);
  });

  it("strictly validates request bodies", () => {
    expect(WorkspaceValidateRequestSchema.parse({ path: "/tmp/project" })).toEqual({ path: "/tmp/project" });
    expect(CreateSessionRequestSchema.parse({ workspacePath: "/tmp/project", modelProfileId: "deepseek" })).toEqual({ workspacePath: "/tmp/project", modelProfileId: "deepseek" });
    expect(ApprovalRequestSchema.parse({ approved: true })).toEqual({ approved: true });
    expect(CancelRequestSchema.parse({})).toEqual({});
    for (const schema of [WorkspaceValidateRequestSchema, CreateSessionRequestSchema, ApprovalRequestSchema, CancelRequestSchema]) {
      expect(schema.safeParse({ unknown: true }).success).toBe(false);
    }
  });

  it("applies core run defaults and maxima", () => {
    expect(RunRequestBodySchema.parse({ prompt: "test" }).limits).toEqual({ maxIterations: 30, maxDurationMs: 600_000 });
    expect(RunRequestBodySchema.safeParse({ prompt: "test", limits: { maxIterations: 31 } }).success).toBe(false);
    expect(RunRequestBodySchema.safeParse({ prompt: "test", limits: { maxDurationMs: 600_001 } }).success).toBe(false);
    expect(RunRequestBodySchema.safeParse({ prompt: " ", unknown: true }).success).toBe(false);
  });

  it("strictly parses query strings and UUIDs", () => {
    expect(RecentWorkspaceSearchSchema.parse({})).toEqual({ limit: 20 });
    expect(EventPageSearchSchema.parse({})).toEqual({ after: 0, limit: 500 });
    expect(EventPageSearchSchema.parse({ after: "4", limit: "20" })).toEqual({ after: 4, limit: 20 });
    expect(RecentWorkspaceSearchSchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(EventPageSearchSchema.safeParse({ after: "-1" }).success).toBe(false);
    expect(EventPageSearchSchema.safeParse({ extra: "1" }).success).toBe(false);
    expect(RouteUuidSchema.parse(ID)).toBe(ID);
    expect(RouteUuidSchema.safeParse("not-a-uuid").success).toBe(false);
  });
});
