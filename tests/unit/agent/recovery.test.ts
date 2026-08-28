import { afterEach, describe, expect, it } from "vitest";

import { nativeAgentRuntimeDependencies } from "@/lib/agent/dependencies";
import { AgentLayerError } from "@/lib/agent/errors";
import { createAgentRuntimeWithDependencies } from "@/lib/agent/runtime";

import {
  RUN_ID,
  QueueModelClient,
  createAgentFixture,
  createStaticContextProvider,
  createTextCompletion,
  removeAgentTemporaryDirectories,
} from "./helpers";

afterEach(removeAgentTemporaryDirectories);

describe("Agent session recovery", () => {
  it("is idempotent when no run is open", async () => {
    const fixture = await createAgentFixture();
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([]),
        contextProvider: createStaticContextProvider(),
      },
      nativeAgentRuntimeDependencies,
    );

    const first = await runtime.recoverSession(
      (await fixture.store.listSessions())[0].id,
    );
    const second = await runtime.recoverSession(first.sessionId);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ status: "idle", lastSeq: 1 });
  });

  it("interrupts one open run exactly once", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    await fixture.store.appendEvent(sessionId, {
      type: "run.started",
      runId: RUN_ID,
      data: {
        promptPreview: "task",
        limits: { maxIterations: 30, maxDurationMs: 600_000 },
      },
    });
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([]),
        contextProvider: createStaticContextProvider(),
      },
      nativeAgentRuntimeDependencies,
    );

    const recovered = await runtime.recoverSession(sessionId);
    const again = await runtime.recoverSession(sessionId);
    const events = (await fixture.store.readEvents(sessionId)).events;

    expect(recovered.status).toBe("interrupted");
    expect(again.lastSeq).toBe(3);
    expect(events.filter((event) => event.type === "run.interrupted")).toHaveLength(1);
    expect(events[2]).toMatchObject({
      type: "run.interrupted",
      data: { lastStableSeq: 2 },
    });
  });

  it("fails closed for overlapping open runs", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    await fixture.store.appendEvent(sessionId, {
      type: "run.started",
      runId: RUN_ID,
      data: {
        promptPreview: "one",
        limits: { maxIterations: 30, maxDurationMs: 600_000 },
      },
    });
    await fixture.store.appendEvent(sessionId, {
      type: "run.started",
      runId: "00000000-0000-4000-8000-000000000199",
      data: {
        promptPreview: "two",
        limits: { maxIterations: 30, maxDurationMs: 600_000 },
      },
    });
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([]),
        contextProvider: createStaticContextProvider(),
      },
      nativeAgentRuntimeDependencies,
    );

    await expect(runtime.recoverSession(sessionId)).rejects.toMatchObject({
      error: { code: "AGENT_HISTORY_INVALID" },
    });
  });
});

describe("Agent preflight", () => {
  it("rejects an already-aborted start without a run event", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const controller = new AbortController();
    controller.abort();
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([createTextCompletion()]),
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );

    await expect(
      runtime.startRun(
        { sessionId, prompt: "task" },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ error: { code: "AGENT_START_ABORTED" } });
    expect((await fixture.store.readEvents(sessionId)).events).toHaveLength(1);
  });

  it("rejects unavailable model and workspace before run.started", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const unavailableModel = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([], false),
        contextProvider: createStaticContextProvider(),
      },
      nativeAgentRuntimeDependencies,
    );
    await expect(
      unavailableModel.startRun({ sessionId, prompt: "task" }),
    ).rejects.toMatchObject({ error: { code: "AGENT_MODEL_UNAVAILABLE" } });

    const unavailableWorkspace = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([]),
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        createWorkspaceHandle: async () => {
          throw new Error("workspace missing");
        },
      },
    );
    await expect(
      unavailableWorkspace.startRun({ sessionId, prompt: "task" }),
    ).rejects.toMatchObject({ error: { code: "AGENT_WORKSPACE_UNAVAILABLE" } });
    expect((await fixture.store.readEvents(sessionId)).events).toHaveLength(1);
  });

  it("prevents two active runs in the same session", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const model = new QueueModelClient([
      async () => {
        await blocked;
        return createTextCompletion();
      },
    ]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await expect(
      runtime.startRun({ sessionId, prompt: "second" }),
    ).rejects.toMatchObject({ error: { code: "AGENT_SESSION_BUSY" } });
    expect(runtime.getActiveRun(handle.runId)).toMatchObject({ runId: RUN_ID });
    release();
    await handle.completion;
  });

  it("wraps invalid public input as an Agent error", async () => {
    const fixture = await createAgentFixture();
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([]),
        contextProvider: createStaticContextProvider(),
      },
      nativeAgentRuntimeDependencies,
    );
    await expect(
      runtime.startRun({ sessionId: "bad" as never, prompt: "task" }),
    ).rejects.toBeInstanceOf(AgentLayerError);
  });
});
