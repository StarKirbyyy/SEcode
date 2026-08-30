import { writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { nativeAgentRuntimeDependencies } from "@/lib/agent/dependencies";
import { createAgentRuntimeWithDependencies } from "@/lib/agent/runtime";
import { ModelAbortError } from "@/lib/model";
import { LocalToolExecutionAbortedError } from "@/lib/tools";
import { EventStoreError, type JsonlEventStore } from "@/lib/storage";

import {
  RUN_ID,
  QueueModelClient,
  createAgentFixture,
  createStaticContextProvider,
  createTextCompletion,
  createToolCompletion,
  removeAgentTemporaryDirectories,
} from "./helpers";

afterEach(removeAgentTemporaryDirectories);

const READ_CALL_ID = "00000000-0000-4000-8000-000000000401";

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  message: string,
) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(message);
}

function blockingModel() {
  return new QueueModelClient([
    async (request) => new Promise((_, reject) => {
      const abort = () => reject(new ModelAbortError("cancelled"));
      if (request.signal.aborted) abort();
      else request.signal.addEventListener("abort", abort, { once: true });
    }),
  ]);
}

function approvalCompletion() {
  return createToolCompletion([
    {
      ok: true,
      call: {
        id: READ_CALL_ID,
        name: "run_process",
        arguments: {
          program: "pnpm",
          args: ["install"],
          cwd: ".",
          timeoutMs: 1_000,
        },
      },
    },
  ]);
}

describe("Agent cancellation", () => {
  it("cancels an in-flight model request exactly once", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = blockingModel();
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await waitFor(() => model.requests.length === 1, "model did not start");

    expect(handle.cancel("停止任务")).toBe(true);
    expect(runtime.cancelRun(RUN_ID)).toBe(false);
    await expect(handle.completion).resolves.toMatchObject({
      status: "cancelled",
      iterations: 1,
      reason: "停止任务",
    });
    const terminal = (await fixture.store.readEvents(sessionId)).events.filter(
      (event) => event.type === "run.cancelled",
    );
    expect(terminal).toHaveLength(1);
  });

  it("links an external AbortSignal", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = blockingModel();
    const controller = new AbortController();
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );
    const handle = await runtime.startRun(
      { sessionId, prompt: "task" },
      { signal: controller.signal },
    );
    await waitFor(() => model.requests.length === 1, "model did not start");
    controller.abort();

    await expect(handle.completion).resolves.toMatchObject({
      status: "cancelled",
      reason: "调用方取消运行",
    });
  });

  it("cancels an executing tool without feeding an abort result", async () => {
    const fixture = await createAgentFixture();
    await writeFile(`${fixture.workspace}/one.txt`, "one\n", "utf8");
    const sessionId = (await fixture.store.listSessions())[0].id;
    let executionStarted = false;
    const execute = vi.fn(async (context) => {
      executionStarted = true;
      return new Promise<never>((_, reject) => {
        const abort = () => reject(new LocalToolExecutionAbortedError());
        if (context.signal.aborted) abort();
        else context.signal.addEventListener("abort", abort, { once: true });
      });
    });
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([
          createToolCompletion([
            {
              ok: true,
              call: {
                id: READ_CALL_ID,
                name: "read_file",
                arguments: { path: "one.txt", startLine: 1 },
              },
            },
          ]),
        ]),
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        executeAuthorizedLocalTool: execute,
      },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await waitFor(() => executionStarted, "tool did not start");
    handle.cancel();
    await expect(handle.completion).resolves.toMatchObject({ status: "cancelled" });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.some((event) => event.type === "tool.started")).toBe(true);
    expect(events.some((event) => event.type === "tool.result")).toBe(false);
  });

  it("cancels an approval wait without resolving or creating a result", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([approvalCompletion()]),
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await waitFor(
      () => runtime.getActiveRun(RUN_ID)?.status === "awaiting_approval",
      "approval did not start",
    );
    handle.cancel();
    const pending = runtime.getActiveRun(RUN_ID)?.pendingApproval;
    if (pending !== undefined) {
      await expect(
        runtime.resolveApproval(RUN_ID, pending.approvalId, { approved: true }),
      ).resolves.toMatchObject({ status: "invalid" });
    }
    await expect(handle.completion).resolves.toMatchObject({ status: "cancelled" });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.some((event) => event.type === "approval.required")).toBe(true);
    expect(events.some((event) => event.type === "approval.resolved")).toBe(false);
    expect(events.some((event) => event.type === "tool.result")).toBe(false);
  });

  it("cancels when the event sink disconnects and never calls it again", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const sink = vi.fn(async (event: { type: string }) => {
      if (event.type === "assistant.delta") throw new Error("disconnected");
    });
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([createTextCompletion("流式内容")]),
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );
    const handle = await runtime.startRun(
      { sessionId, prompt: "task" },
      { onEvent: sink },
    );

    await expect(handle.completion).resolves.toMatchObject({
      status: "cancelled",
      reason: "事件消费者已断开",
    });
    const callsAfterFailure = sink.mock.calls.length;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(sink).toHaveBeenCalledTimes(callsAfterFailure);
    expect((await fixture.store.readEvents(sessionId)).events.at(-1)?.type).toBe(
      "run.cancelled",
    );
  });

  it("classifies the total deadline separately from model timeout", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: blockingModel(),
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        setTimer: (callback) => {
          queueMicrotask(callback);
          return 1;
        },
        clearTimer: vi.fn(),
      },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await expect(handle.completion).resolves.toMatchObject({
      status: "failed",
      iterations: 0,
      error: { code: "AGENT_RUN_TIMEOUT" },
    });
  });

  it("treats an unlinked abort exception as an internal error", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([new ModelAbortError("unexpected")]),
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await expect(handle.completion).resolves.toMatchObject({
      status: "failed",
      error: { code: "AGENT_INTERNAL_ERROR" },
    });
  });
});

describe("Agent durable commit failures", () => {
  function wrapStore(
    store: JsonlEventStore,
    failType: string,
    afterCommit: boolean,
  ): JsonlEventStore {
    const append = store.appendEvent.bind(store);
    return {
      initialize: store.initialize.bind(store),
      createSession: store.createSession.bind(store),
      deleteSession: store.deleteSession.bind(store),
      getSessionMetadata: store.getSessionMetadata.bind(store),
      listSessions: store.listSessions.bind(store),
      listRecentWorkspaces: store.listRecentWorkspaces.bind(store),
      readEvents: store.readEvents.bind(store),
      inspectSession: store.inspectSession.bind(store),
      async appendEvent(sessionId, draft) {
        if (draft.type !== failType) return append(sessionId, draft);
        if (afterCommit) await append(sessionId, draft);
        throw new EventStoreError({
          code: "EVENT_COMMIT_UNCERTAIN",
          message: "事件提交状态不确定",
          recoverable: false,
        });
      },
    };
  }

  it("does not execute when tool.started commit is uncertain", async () => {
    const fixture = await createAgentFixture();
    await writeFile(`${fixture.workspace}/one.txt`, "one\n", "utf8");
    const sessionId = (await fixture.store.listSessions())[0].id;
    const execute = vi.fn();
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: wrapStore(fixture.store, "tool.started", true),
        modelClient: new QueueModelClient([
          createToolCompletion([
            {
              ok: true,
              call: {
                id: READ_CALL_ID,
                name: "read_file",
                arguments: { path: "one.txt", startLine: 1 },
              },
            },
          ]),
        ]),
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        executeAuthorizedLocalTool: execute,
      },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });

    await expect(handle.completion).rejects.toMatchObject({
      error: { code: "EVENT_COMMIT_UNCERTAIN" },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(runtime.getActiveRun(RUN_ID)).toBeUndefined();
    expect((await fixture.store.readEvents(sessionId)).events.at(-1)?.type).toBe(
      "tool.started",
    );

    const recovery = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([]),
        contextProvider: createStaticContextProvider(),
      },
      nativeAgentRuntimeDependencies,
    );
    await expect(recovery.recoverSession(sessionId)).resolves.toMatchObject({
      status: "interrupted",
    });
  });

  it("does not replay a tool whose result commit is uncertain", async () => {
    const fixture = await createAgentFixture();
    await writeFile(`${fixture.workspace}/one.txt`, "one\n", "utf8");
    const sessionId = (await fixture.store.listSessions())[0].id;
    const execute = vi.fn(async () => ({ ok: true, summary: "executed once" }));
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: wrapStore(fixture.store, "tool.result", true),
        modelClient: new QueueModelClient([
          createToolCompletion([
            {
              ok: true,
              call: {
                id: READ_CALL_ID,
                name: "read_file",
                arguments: { path: "one.txt", startLine: 1 },
              },
            },
          ]),
        ]),
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        executeAuthorizedLocalTool: execute,
      },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await expect(handle.completion).rejects.toMatchObject({
      error: { code: "EVENT_COMMIT_UNCERTAIN" },
    });
    expect(execute).toHaveBeenCalledTimes(1);

    const recovery = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([]),
        contextProvider: createStaticContextProvider(),
      },
      nativeAgentRuntimeDependencies,
    );
    await recovery.recoverSession(sessionId);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects uncertain terminal completion even when the event committed", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: wrapStore(fixture.store, "run.completed", true),
        modelClient: new QueueModelClient([createTextCompletion()]),
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });

    await expect(handle.completion).rejects.toMatchObject({
      error: { code: "EVENT_COMMIT_UNCERTAIN" },
    });
    const before = (await fixture.store.readEvents(sessionId)).events;
    expect(before.at(-1)?.type).toBe("run.completed");

    const recovery = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([]),
        contextProvider: createStaticContextProvider(),
      },
      nativeAgentRuntimeDependencies,
    );
    await expect(recovery.recoverSession(sessionId)).resolves.toMatchObject({
      status: "completed",
    });
    expect((await fixture.store.readEvents(sessionId)).events).toHaveLength(
      before.length,
    );
  });

  it("leaves an uncommitted terminal failure open for interruption", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: wrapStore(fixture.store, "run.failed", false),
        modelClient: new QueueModelClient([new ModelAbortError("unexpected")]),
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await expect(handle.completion).rejects.toMatchObject({
      error: { code: "EVENT_COMMIT_UNCERTAIN" },
    });
    expect((await fixture.store.readEvents(sessionId)).events.at(-1)?.type).toBe(
      "model.requested",
    );
  });
});
