import { describe, expect, it } from "vitest";

import {
  ApprovalRequestSchema,
  BrowseWorkspaceRequestSchema,
  CancelRequestSchema,
  CreateSessionRequestSchema,
  EventPageSearchSchema,
  PlanApprovalRequestSchema,
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
    expect(PlanApprovalRequestSchema.parse({ planId: ID, approved: true })).toEqual({ planId: ID, approved: true });
    expect(CancelRequestSchema.parse({})).toEqual({});
    for (const schema of [WorkspaceValidateRequestSchema, CreateSessionRequestSchema, ApprovalRequestSchema, PlanApprovalRequestSchema, CancelRequestSchema]) {
      expect(schema.safeParse({ unknown: true }).success).toBe(false);
    }
  });

  it("strictly validates workspace picker segments and limits", () => {
    expect(BrowseWorkspaceRequestSchema.parse({ segments: [] })).toEqual({ segments: [] });
    expect(BrowseWorkspaceRequestSchema.parse({ segments: ["项目", ".hidden"] })).toEqual({ segments: ["项目", ".hidden"] });
    expect(BrowseWorkspaceRequestSchema.parse({ segments: Array.from({ length: 64 }, () => "a") }).segments).toHaveLength(64);
    expect(BrowseWorkspaceRequestSchema.safeParse({ segments: Array.from({ length: 65 }, () => "a") }).success).toBe(false);
    expect(BrowseWorkspaceRequestSchema.safeParse({ segments: ["a".repeat(255)] }).success).toBe(true);
    expect(BrowseWorkspaceRequestSchema.safeParse({ segments: ["a".repeat(256)] }).success).toBe(false);

    for (const segment of ["", ".", "..", "a/b", "a\\b", "\0", "line\nfeed", "~", "~/code", "file:code", "https:example", "C:drive"]) {
      expect(BrowseWorkspaceRequestSchema.safeParse({ segments: [segment] }).success, segment).toBe(false);
    }

    expect(BrowseWorkspaceRequestSchema.safeParse({ segments: ["a".repeat(4096)] }).success).toBe(false);
    expect(BrowseWorkspaceRequestSchema.safeParse({ segments: ["a".repeat(255)], unknown: true }).success).toBe(false);
    expect(BrowseWorkspaceRequestSchema.safeParse({ segments: "code" }).success).toBe(false);
  });

  it("applies core run defaults and maxima", () => {
    const defaults = RunRequestBodySchema.parse({ prompt: "test" });
    expect(defaults).toMatchObject({
      planningEnabled: false,
      limits: { maxToolCalls: 300, maxDurationMs: 1_800_000 },
    });
    expect(defaults.limits).not.toHaveProperty("maxModelRequests");
    expect(RunRequestBodySchema.parse({ prompt: "test", planningEnabled: true, limits: { maxModelRequests: 120, maxToolCalls: 300 } })).toMatchObject({
      planningEnabled: true,
      limits: { maxModelRequests: 120, maxToolCalls: 300, maxDurationMs: 1_800_000 },
    });
    expect(RunRequestBodySchema.parse({ prompt: "test", limits: { maxIterations: 120 } }).limits.maxModelRequests).toBe(120);
    expect(RunRequestBodySchema.safeParse({ prompt: "test", limits: { maxIterations: 20, maxModelRequests: 20 } }).success).toBe(false);
    expect(RunRequestBodySchema.safeParse({ prompt: "test", limits: { maxModelRequests: 121 } }).success).toBe(false);
    expect(RunRequestBodySchema.safeParse({ prompt: "test", limits: { maxIterations: 121 } }).success).toBe(false);
    expect(RunRequestBodySchema.safeParse({ prompt: "test", limits: { maxToolCalls: 301 } }).success).toBe(false);
    expect(RunRequestBodySchema.safeParse({ prompt: "test", limits: { maxDurationMs: 3_600_000 } }).success).toBe(true);
    expect(RunRequestBodySchema.safeParse({ prompt: "test", limits: { maxDurationMs: 3_600_001 } }).success).toBe(false);
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
