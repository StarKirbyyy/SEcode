import { writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { nativeAgentRuntimeDependencies } from "@/lib/agent/dependencies";
import { createAgentRuntimeWithDependencies } from "@/lib/agent/runtime";

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

const FIRST_CALL_ID = "00000000-0000-4000-8000-000000000201";
const SECOND_CALL_ID = "00000000-0000-4000-8000-000000000202";

function validReadCall(id: string, file: string) {
  return {
    ok: true as const,
    call: {
      id,
      name: "read_file",
      arguments: { path: file, startLine: 1 },
    },
  };
}

describe("Agent tool planning and execution", () => {
  it("runs a tool, feeds its result back, then completes", async () => {
    const fixture = await createAgentFixture();
    await writeFile(`${fixture.workspace}/one.txt`, "hello\n", "utf8");
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([
      createToolCompletion([validReadCall(FIRST_CALL_ID, "one.txt")]),
      createTextCompletion("读取完成"),
    ]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );

    const handle = await runtime.startRun({ sessionId, prompt: "读取文件" });
    await expect(handle.completion).resolves.toMatchObject({
      status: "completed",
      iterations: 2,
    });
    expect((await fixture.store.readEvents(sessionId)).events.map((event) => event.type))
      .toEqual([
        "session.created",
        "run.started",
        "user.message",
        "model.requested",
        "model.completed",
        "tool.requested",
        "tool.started",
        "tool.result",
        "model.requested",
        "model.completed",
        "assistant.message",
        "run.completed",
      ]);
  });

  it("persists every requested tool before executing them serially", async () => {
    const fixture = await createAgentFixture();
    await writeFile(`${fixture.workspace}/one.txt`, "one\n", "utf8");
    await writeFile(`${fixture.workspace}/two.txt`, "two\n", "utf8");
    const sessionId = (await fixture.store.listSessions())[0].id;
    const executionOrder: string[] = [];
    const execute = vi.fn(async (context, authorization) => {
      const events = (await fixture.store.readEvents(sessionId)).events;
      executionOrder.push(events.at(-1)?.type ?? "missing");
      return nativeAgentRuntimeDependencies.executeAuthorizedLocalTool(
        context,
        authorization,
      );
    });
    const model = new QueueModelClient([
      createToolCompletion(
        [
          validReadCall(FIRST_CALL_ID, "one.txt"),
          validReadCall(SECOND_CALL_ID, "two.txt"),
        ],
        "读取两个文件",
      ),
      createTextCompletion(),
    ]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        executeAuthorizedLocalTool: execute,
      },
    );

    const handle = await runtime.startRun({ sessionId, prompt: "读取" });
    await handle.completion;
    const types = (await fixture.store.readEvents(sessionId)).events.map(
      (event) => event.type,
    );
    const requested = types
      .map((type, index) => ({ type, index }))
      .filter(({ type }) => type === "tool.requested")
      .map(({ index }) => index);
    const started = types.indexOf("tool.started");

    expect(requested).toHaveLength(2);
    expect(Math.max(...requested)).toBeLessThan(started);
    expect(executionOrder).toEqual(["tool.started", "tool.started"]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("turns invalid, unknown and malformed calls into direct results", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const invalid = {
      ok: false as const,
      id: FIRST_CALL_ID,
      name: null,
      rawArgumentsPreview: "{bad",
      error: {
        code: "MODEL_INVALID_TOOL_CALL",
        message: "工具参数 JSON 无效",
        recoverable: true,
      },
    };
    const unknown = {
      ok: true as const,
      call: { id: SECOND_CALL_ID, name: "unknown_tool", arguments: {} },
    };
    const malformed = {
      ok: true as const,
      call: {
        id: "00000000-0000-4000-8000-000000000203",
        name: "read_file",
        arguments: { path: 42 },
      },
    };
    const model = new QueueModelClient([
      createToolCompletion([invalid, unknown, malformed]),
      createTextCompletion(),
    ]);
    const execute = vi.fn();
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        executeAuthorizedLocalTool: execute,
      },
    );

    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await handle.completion;
    const events = (await fixture.store.readEvents(sessionId)).events;
    const requests = events.filter((event) => event.type === "tool.requested");
    const results = events.filter((event) => event.type === "tool.result");

    expect(requests).toHaveLength(3);
    expect(requests[0]).toMatchObject({
      data: { toolName: "invalid_tool_call", argumentsTruncated: true },
    });
    expect(results).toHaveLength(3);
    expect(events.some((event) => event.type === "tool.started")).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("records policy denial without starting the process", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([
      createToolCompletion([
        {
          ok: true,
          call: {
            id: FIRST_CALL_ID,
            name: "run_process",
            arguments: {
              program: "sudo",
              args: ["echo", "bad"],
              cwd: ".",
              timeoutMs: 1_000,
            },
          },
        },
      ]),
      createTextCompletion(),
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
    await handle.completion;
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.some((event) => event.type === "tool.started")).toBe(false);
    expect(events.find((event) => event.type === "tool.result")).toMatchObject({
      data: { result: { error: { code: "TOOL_POLICY_DENIED" } } },
    });
  });

  it("fails duplicate tool IDs before persisting or executing the plan", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const duplicate = validReadCall(FIRST_CALL_ID, "missing.txt");
    const execute = vi.fn();
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([
          createToolCompletion([duplicate, duplicate]),
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
    await expect(handle.completion).resolves.toMatchObject({
      status: "failed",
      error: { code: "AGENT_MODEL_OUTPUT_INVALID" },
    });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.some((event) => event.type === "tool.requested")).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("feeds ordinary tool failures back instead of failing the run", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([
          createToolCompletion([validReadCall(FIRST_CALL_ID, "missing.txt")]),
          createTextCompletion(),
        ]),
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );

    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await expect(handle.completion).resolves.toMatchObject({ status: "completed" });
    expect((await fixture.store.readEvents(sessionId)).events.find(
      (event) => event.type === "tool.result",
    )).toMatchObject({ data: { result: { ok: false } } });
  });
});
