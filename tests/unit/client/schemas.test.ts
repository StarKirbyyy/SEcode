import { describe, expect, it } from "vitest";

import {
  ApprovalResponseSchema,
  BrowseWorkspaceResponseSchema,
  CancelResponseSchema,
  ConfigResponseSchema,
  CreatedSessionResponseSchema,
  DeletedSessionResponseSchema,
  EventPageResponseSchema,
  PlanApprovalResponseSchema,
  RecentWorkspacesResponseSchema,
  SessionsResponseSchema,
  ValidateWorkspaceResponseSchema,
} from "@/lib/client/schemas";

const ID = "00000000-0000-4000-8000-000000000001";
const ID2 = "00000000-0000-4000-8000-000000000002";
const NOW = "2026-08-28T00:00:00.000Z";
const session = { id: ID, title: "A", workspacePath: "/code/a", modelProfileId: "test", status: "idle", createdAt: NOW, updatedAt: NOW };
const event = { protocolVersion: 1, durable: true, id: ID2, seq: 1, sessionId: ID, type: "session.created", createdAt: NOW, data: { session } };

describe("client response schemas", () => {
  it("validates every JSON API response shape", () => {
    expect(ConfigResponseSchema.parse({ models: [{ id: "test", label: "Test", provider: "generic", model: "fake", contextWindow: 1000, supportsThinking: true, configured: true }], issues: [], agentLimits: { defaultMaxModelRequests: null, maximumModelRequests: 120, defaultMaxToolCalls: 300, maximumToolCalls: 300, defaultMaxIterations: null, maximumIterations: 120, defaultMaxDurationMs: 600000, maximumDurationMs: 600000 }, securityBoundary: { mode: "trusted_local_single_user", operatingSystemSandbox: false } }).models).toHaveLength(1);
    expect(RecentWorkspacesResponseSchema.parse({ workspaces: ["/code/a"] }).workspaces).toEqual(["/code/a"]);
    expect(SessionsResponseSchema.parse({ sessions: [{ id: ID, title: "A", workspacePath: "/code/a", modelProfileId: "test", createdAt: NOW }] }).sessions).toHaveLength(1);
    expect(ValidateWorkspaceResponseSchema.parse({ workspacePath: "/code/a" }).workspacePath).toBe("/code/a");
    expect(CreatedSessionResponseSchema.parse({ session, event }).event.type).toBe("session.created");
    expect(DeletedSessionResponseSchema.parse({ sessionId: ID, status: "deleted" })).toEqual({ sessionId: ID, status: "deleted" });
    expect(EventPageResponseSchema.parse({ events: [event], lastSeq: 1, hasMore: false, recovery: { tailRepaired: false, discardedTailBytes: 0, lastStableSeq: 1, openRunIds: [] } }).events).toHaveLength(1);
    expect(BrowseWorkspaceResponseSchema.parse({ root: { label: "code", workspacePath: "/code" }, current: { label: "code", segments: [], workspacePath: "/code" }, parentSegments: null, directories: [{ name: "a", segments: ["a"], symbolicLink: false }], blockedEntries: 0, ignoredEntries: 0, truncated: false }).directories).toHaveLength(1);
    expect(ApprovalResponseSchema.parse({ runId: ID, approvalId: ID2, status: "resolved", approved: true }).approved).toBe(true);
    expect(PlanApprovalResponseSchema.parse({ runId: ID, planId: ID2, approvalId: ID, status: "resolved", approved: false }).approved).toBe(false);
    expect(CancelResponseSchema.parse({ runId: ID, status: "cancellation_requested" }).status).toBe("cancellation_requested");
  });

  it("rejects unknown keys and malformed nested events", () => {
    expect(BrowseWorkspaceResponseSchema.safeParse({ root: { label: "code", workspacePath: "/code", leaked: true }, current: {}, directories: [], blockedEntries: 0, ignoredEntries: 0, truncated: false, parentSegments: null }).success).toBe(false);
    expect(EventPageResponseSchema.safeParse({ events: [{ ...event, sessionId: "bad" }], lastSeq: 1, hasMore: false, recovery: {} }).success).toBe(false);
    expect(ConfigResponseSchema.safeParse({ models: [], issues: [], agentLimits: {}, securityBoundary: {}, apiKey: "secret" }).success).toBe(false);
    expect(DeletedSessionResponseSchema.safeParse({ sessionId: ID, status: "deleted", path: "/secret" }).success).toBe(false);
  });
});
