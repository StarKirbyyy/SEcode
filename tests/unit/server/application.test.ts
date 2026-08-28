import { describe, expect, it, vi } from "vitest";

import type { AgentRunHandle, AgentRuntime } from "@/lib/agent";
import type { ModelClient } from "@/lib/model";
import type { JsonlEventStore } from "@/lib/storage";
import { createServerApplication } from "@/lib/server/application";
import type { WorkspaceHandle } from "@/lib/workspace";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const RUN_ID = "00000000-0000-4000-8000-000000000002";
const CREATED_AT = "2026-08-28T00:00:00.000Z";

function dependencies(configured = true) {
  let resolveCompletion!: () => void;
  const completion = new Promise<never>((resolve) => { resolveCompletion = resolve as () => void; });
  const handle: AgentRunHandle = {
    sessionId: SESSION_ID,
    runId: RUN_ID,
    completion,
    cancel: vi.fn(() => true),
  };
  const metadata = { storageVersion: 1 as const, id: SESSION_ID, title: "A", workspacePath: "/canonical/project", modelProfileId: "test", createdAt: CREATED_AT };
  const session = { id: SESSION_ID, title: "A", workspacePath: metadata.workspacePath, modelProfileId: "test", status: "idle" as const, createdAt: CREATED_AT, updatedAt: CREATED_AT };
  const event = { protocolVersion: 1 as const, durable: true as const, id: "00000000-0000-4000-8000-000000000003", seq: 1, sessionId: SESSION_ID, type: "session.created" as const, createdAt: CREATED_AT, data: { session } };
  const store = {
    createSession: vi.fn(async () => ({ metadata, session, event })),
    listSessions: vi.fn(async () => [metadata]),
    listRecentWorkspaces: vi.fn(async () => [metadata.workspacePath]),
    getSessionMetadata: vi.fn(async () => metadata),
    readEvents: vi.fn(async () => ({ events: [], lastSeq: 0, hasMore: false, recovery: { tailRepaired: false, discardedTailBytes: 0, lastStableSeq: 0, openRunIds: [] } })),
  } as unknown as JsonlEventStore;
  const modelClient = {
    getConfigSnapshot: () => ({
      profiles: [{ id: "test", label: "Test", provider: "generic" as const, baseUrl: "http://localhost:3001", model: "fake", contextWindow: 10_000, supportsThinking: true, configured }],
      issues: [{ profileId: "test", code: "MISSING_API_KEY" as const, message: "SECRET_ENV missing" }],
    }),
  } as ModelClient;
  const runtime = {
    startRun: vi.fn(async () => handle),
    recoverSession: vi.fn(async () => ({ sessionId: SESSION_ID, status: "idle" as const, lastSeq: 0 })),
    resolveApproval: vi.fn(async () => ({ status: "resolved" as const, approved: true })),
  } as unknown as AgentRuntime;
  const createWorkspace = vi.fn(async () => ({ rootPath: "/canonical/project" }) as WorkspaceHandle);
  return { store, modelClient, runtime, createWorkspace, handle, resolveCompletion };
}

describe("server application", () => {
  it("redacts provider configuration and issue environment names", () => {
    const deps = dependencies();
    const config = createServerApplication(deps).getConfig();
    expect(config.models[0]).not.toHaveProperty("baseUrl");
    expect(config.models[0]).not.toHaveProperty("apiKeyEnv");
    expect(JSON.stringify(config)).not.toContain("SECRET_ENV");
    expect(config.agentLimits.maximumIterations).toBe(30);
  });

  it("canonicalizes workspace before committing a session", async () => {
    const deps = dependencies();
    const app = createServerApplication(deps);
    await app.createSession({ workspacePath: "/alias", modelProfileId: "test" });
    expect(deps.createWorkspace).toHaveBeenCalledWith("/alias");
    expect(deps.store.createSession).toHaveBeenCalledWith({ workspacePath: "/canonical/project", modelProfileId: "test", title: "project" });
  });

  it("rejects unavailable profiles without workspace or store effects", async () => {
    const deps = dependencies(false);
    await expect(createServerApplication(deps).createSession({ workspacePath: "/alias", modelProfileId: "test" })).rejects.toMatchObject({ error: { code: "API_MODEL_PROFILE_UNAVAILABLE" } });
    expect(deps.createWorkspace).not.toHaveBeenCalled();
    expect(deps.store.createSession).not.toHaveBeenCalled();
  });

  it("keeps store ordering and forwards recent limits", async () => {
    const deps = dependencies();
    const app = createServerApplication(deps);
    expect(await app.listSessions()).toEqual([{ id: SESSION_ID, title: "A", workspacePath: "/canonical/project", modelProfileId: "test", createdAt: CREATED_AT }]);
    expect((await app.listSessions())[0]).not.toHaveProperty("status");
    await app.listRecentWorkspaces(7);
    expect(deps.store.listRecentWorkspaces).toHaveBeenCalledWith({ limit: 7 });
  });

  it("recovers before reading inactive history", async () => {
    const deps = dependencies();
    await createServerApplication(deps).readEvents(SESSION_ID, { afterSeq: 0, limit: 10 });
    expect(deps.runtime.recoverSession).toHaveBeenCalledWith(SESSION_ID);
    expect(deps.store.readEvents).toHaveBeenCalled();
  });

  it("tracks start, cancellation idempotency and approval forwarding", async () => {
    const deps = dependencies();
    const app = createServerApplication(deps);
    await app.startRun({ sessionId: SESSION_ID, prompt: "go" }, {});
    expect(app.cancelRun(RUN_ID, "stop").status).toBe("cancellation_requested");
    expect(app.cancelRun(RUN_ID, "again").status).toBe("already_requested");
    expect(app.cancelRun("00000000-0000-4000-8000-000000000099", "none").status).toBe("not_found");
    await app.resolveApproval(RUN_ID, "00000000-0000-4000-8000-000000000004", { approved: true, reason: "ok" });
    expect(deps.runtime.resolveApproval).toHaveBeenCalledWith(RUN_ID, "00000000-0000-4000-8000-000000000004", { approved: true, reason: "ok" });
  });
});
