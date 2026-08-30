import { describe, expect, it, vi } from "vitest";

import type { AgentRunHandle, AgentRuntime } from "@/lib/agent";
import type { ModelClient } from "@/lib/model";
import type { JsonlEventStore } from "@/lib/storage";
import { createServerApplication } from "@/lib/server/application";
import type { WorkspaceHandle } from "@/lib/workspace";
import type { WorkspacePickerService } from "@/lib/server/workspace-picker";

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
    deleteSession: vi.fn(async () => ({ sessionId: SESSION_ID, status: "deleted" as const })),
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
    invalidateSessionContext: vi.fn(),
    startRun: vi.fn(async () => handle),
    recoverSession: vi.fn(async () => ({ sessionId: SESSION_ID, status: "idle" as const, lastSeq: 0 })),
    resolveApproval: vi.fn(async () => ({ status: "resolved" as const, approved: true })),
    resolvePlanApproval: vi.fn(async () => ({ status: "resolved" as const, approved: true })),
  } as unknown as AgentRuntime;
  const createWorkspace = vi.fn(async () => ({ rootPath: "/canonical/project" }) as WorkspaceHandle);
  const workspacePicker = {
    browse: vi.fn(async () => ({
      root: { label: "code", workspacePath: "/canonical" },
      current: { label: "project", segments: ["project"], workspacePath: "/canonical/project" },
      parentSegments: [],
      directories: [],
      blockedEntries: 0,
      ignoredEntries: 0,
      truncated: false,
    })),
    assertSelection: vi.fn(async (workspacePath: string) => workspacePath),
  } satisfies WorkspacePickerService;
  return { store, modelClient, runtime, createWorkspace, workspacePicker, handle, resolveCompletion };
}

describe("server application", () => {
  it("redacts provider configuration and issue environment names", () => {
    const deps = dependencies();
    const config = createServerApplication(deps).getConfig();
    expect(config.models[0]).not.toHaveProperty("baseUrl");
    expect(config.models[0]).not.toHaveProperty("apiKeyEnv");
    expect(JSON.stringify(config)).not.toContain("SECRET_ENV");
    expect(config.agentLimits).toMatchObject({
      defaultMaxModelRequests: null,
      maximumModelRequests: 120,
      defaultMaxToolCalls: 300,
      maximumToolCalls: 300,
      defaultMaxIterations: null,
      maximumIterations: 120,
      defaultMaxDurationMs: 1_800_000,
      maximumDurationMs: 3_600_000,
    });
  });

  it("canonicalizes workspace before committing a session", async () => {
    const deps = dependencies();
    const app = createServerApplication(deps);
    await app.createSession({ workspacePath: "/alias", modelProfileId: "test" });
    expect(deps.createWorkspace).toHaveBeenCalledWith("/alias");
    expect(deps.workspacePicker.assertSelection).toHaveBeenCalledWith("/canonical/project");
    expect(deps.store.createSession).toHaveBeenCalledWith({ workspacePath: "/canonical/project", modelProfileId: "test", title: "project" });
  });

  it("delegates browse and constrains workspace validation to the picker", async () => {
    const deps = dependencies();
    const app = createServerApplication(deps);
    await expect(app.browseWorkspaces({ segments: ["project"] })).resolves.toMatchObject({ current: { segments: ["project"] } });
    expect(deps.workspacePicker.browse).toHaveBeenCalledWith({ segments: ["project"] });
    await expect(app.validateWorkspace("/alias")).resolves.toEqual({ workspacePath: "/canonical/project" });
    expect(deps.workspacePicker.assertSelection).toHaveBeenCalledWith("/canonical/project");
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
    await app.resolvePlanApproval(
      RUN_ID,
      "00000000-0000-4000-8000-000000000005",
      { planId: "00000000-0000-4000-8000-000000000006", approved: false, reason: "revise" },
    );
    expect(deps.runtime.resolvePlanApproval).toHaveBeenCalledWith(
      RUN_ID,
      "00000000-0000-4000-8000-000000000005",
      { planId: "00000000-0000-4000-8000-000000000006", approved: false, reason: "revise" },
    );
  });

  it("passes the workspace permission mode into every run", async () => {
    const deps = dependencies();
    const app = createServerApplication(deps);
    await app.setWorkspacePermission("/canonical/project", "full");
    await app.startRun({ sessionId: SESSION_ID, prompt: "go" }, {});
    expect(deps.runtime.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ permissionMode: "full" }),
      {},
    );
  });

  it("keeps tool and plan approval failures on independent methods", async () => {
    const deps = dependencies();
    deps.runtime.resolvePlanApproval = vi.fn(async () => ({
      status: "invalid" as const,
      error: { code: "AGENT_PLAN_NOT_PENDING", message: "none", recoverable: true },
    }));
    const app = createServerApplication(deps);
    await expect(app.resolvePlanApproval(
      RUN_ID,
      "00000000-0000-4000-8000-000000000005",
      { planId: "00000000-0000-4000-8000-000000000006", approved: true },
    )).rejects.toMatchObject({ error: { code: "AGENT_PLAN_NOT_PENDING" } });
    expect(deps.runtime.resolveApproval).not.toHaveBeenCalled();
  });

  it("deletes an idle session without touching the workspace factory", async () => {
    const deps = dependencies();
    const result = await createServerApplication(deps).deleteSession(SESSION_ID);
    expect(result).toEqual({ sessionId: SESSION_ID, status: "deleted" });
    expect(deps.store.deleteSession).toHaveBeenCalledWith(SESSION_ID);
    expect(deps.runtime.invalidateSessionContext).toHaveBeenCalledWith(SESSION_ID);
    expect(deps.createWorkspace).not.toHaveBeenCalled();
  });

  it("rejects deletion while a run is starting and releases the claim on failure", async () => {
    const deps = dependencies();
    let rejectStart!: (error: Error) => void;
    const starting = new Promise<AgentRunHandle>((_resolve, reject) => { rejectStart = reject; });
    deps.runtime.startRun = vi.fn(() => starting);
    const app = createServerApplication(deps);
    const run = app.startRun({ sessionId: SESSION_ID, prompt: "go" }, {});

    await expect(app.deleteSession(SESSION_ID)).rejects.toMatchObject({
      error: { code: "API_SESSION_BUSY", recoverable: true },
    });
    expect(deps.store.deleteSession).not.toHaveBeenCalled();
    rejectStart(new Error("start failed"));
    await expect(run).rejects.toThrow("start failed");
    await expect(app.deleteSession(SESSION_ID)).resolves.toMatchObject({ status: "deleted" });
  });

  it("rejects deletion until an active run completion settles", async () => {
    const deps = dependencies();
    const app = createServerApplication(deps);
    await app.startRun({ sessionId: SESSION_ID, prompt: "go" }, {});
    await expect(app.deleteSession(SESSION_ID)).rejects.toMatchObject({
      error: { code: "API_SESSION_BUSY" },
    });
    deps.resolveCompletion();
    await Promise.resolve();
    await Promise.resolve();
    await expect(app.deleteSession(SESSION_ID)).resolves.toMatchObject({ status: "deleted" });
  });

  it("reserves deletion before awaiting storage and blocks start and recovery", async () => {
    const deps = dependencies();
    type Deleted = Awaited<ReturnType<JsonlEventStore["deleteSession"]>>;
    let finishDelete!: () => void;
    const pendingDelete = new Promise<Deleted>((resolve) => {
      finishDelete = () => resolve({ sessionId: SESSION_ID, status: "deleted" });
    });
    deps.store.deleteSession = vi.fn(async () => pendingDelete);
    const app = createServerApplication(deps);
    const deletion = app.deleteSession(SESSION_ID);

    await expect(app.startRun({ sessionId: SESSION_ID, prompt: "go" }, {})).rejects.toMatchObject({
      error: { code: "API_SESSION_BUSY" },
    });
    await expect(app.readEvents(SESSION_ID, { afterSeq: 0, limit: 10 })).rejects.toMatchObject({
      error: { code: "API_SESSION_BUSY" },
    });
    expect(deps.runtime.startRun).not.toHaveBeenCalled();
    expect(deps.runtime.recoverSession).not.toHaveBeenCalled();
    finishDelete();
    await expect(deletion).resolves.toMatchObject({ status: "deleted" });
  });

  it("releases a failed deletion reservation", async () => {
    const deps = dependencies();
    deps.store.deleteSession = vi.fn()
      .mockRejectedValueOnce(new Error("delete failed"))
      .mockResolvedValueOnce({ sessionId: SESSION_ID, status: "deleted" as const });
    const app = createServerApplication(deps);
    await expect(app.deleteSession(SESSION_ID)).rejects.toThrow("delete failed");
    expect(deps.runtime.invalidateSessionContext).toHaveBeenCalledWith(SESSION_ID);
    await expect(app.deleteSession(SESSION_ID)).resolves.toMatchObject({ status: "deleted" });
    expect(deps.runtime.invalidateSessionContext).toHaveBeenCalledTimes(2);
  });
});
