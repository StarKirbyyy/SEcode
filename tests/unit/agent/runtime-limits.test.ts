import { writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { nativeAgentRuntimeDependencies } from "@/lib/agent/dependencies";
import {
  canonicalJsonValue,
  createToolErrorSignature,
} from "@/lib/agent/projection";
import { createAgentRuntimeWithDependencies } from "@/lib/agent/runtime";
import { createToolFailure } from "@/lib/tools/types";
import type { JsonObject } from "@/lib/domain";

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

function toolId(index: number): string {
  return `00000000-0000-4000-8000-${String(500 + index).padStart(12, "0")}`;
}

function unknownFailure(index: number, arguments_: JsonObject) {
  return createToolCompletion([
    {
      ok: true,
      call: {
        id: toolId(index),
        name: "unknown_tool",
        arguments: arguments_,
      },
    },
  ]);
}

function successfulRead(index: number) {
  return createToolCompletion([
    {
      ok: true,
      call: {
        id: toolId(index),
        name: "read_file",
        arguments: { path: "one.txt", startLine: 1 },
      },
    },
  ]);
}

describe("Agent iteration limits", () => {
  it("allows progress beyond the legacy default when no limit is configured", async () => {
    const fixture = await createAgentFixture();
    await writeFile(`${fixture.workspace}/one.txt`, "one\n", "utf8");
    const sessionId = (await fixture.store.listSessions())[0].id;
    const completions = [
      ...Array.from({ length: 61 }, (_, index) => unknownFailure(index, { index })),
      createTextCompletion(),
    ];
    const model = new QueueModelClient(completions);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );

    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await expect(handle.completion).resolves.toMatchObject({
      status: "completed",
      iterations: 62,
      modelRequests: 62,
      toolCalls: 61,
    });
    expect(model.requests).toHaveLength(62);
    const events = (await fixture.store.readEvents(sessionId)).events;
    const started = events.find((event) => event.type === "run.started");
    expect(started).toMatchObject({
      type: "run.started",
      data: { limits: { maxToolCalls: 300, maxDurationMs: 1_800_000 } },
    });
    if (started?.type === "run.started") {
      expect(started.data.limits.maxIterations).toBeUndefined();
    }
  }, 10_000);

  it("does not issue a request beyond a lowered limit", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([unknownFailure(1, { value: "once" })]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );

    const handle = await runtime.startRun({
      sessionId,
      prompt: "task",
      limits: { maxIterations: 1 },
    });
    await expect(handle.completion).resolves.toMatchObject({
      status: "failed",
      iterations: 1,
      error: { code: "AGENT_ITERATION_LIMIT" },
    });
    expect(model.requests).toHaveLength(1);
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.find((event) => event.type === "run.started")).toMatchObject({
      type: "run.started",
      data: { limits: { maxIterations: 1, maxToolCalls: 300 } },
    });
  });
});

describe("Agent repeated tool error limit", () => {
  it("persists the third identical result before failing", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([
      unknownFailure(1, { a: 1, b: 2 }),
      unknownFailure(2, { b: 2, a: 1 }),
      unknownFailure(3, { a: 1, b: 2 }),
      createTextCompletion("must not run"),
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
    await expect(handle.completion).resolves.toMatchObject({
      status: "failed",
      iterations: 3,
      error: { code: "AGENT_REPEATED_TOOL_ERROR" },
    });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.at(-2)?.type).toBe("tool.result");
    expect(events.at(-1)?.type).toBe("run.failed");
    expect(model.requests).toHaveLength(3);
  });

  it("treats array order as significant and different errors as a reset", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([
      unknownFailure(1, { list: [1, 2] }),
      unknownFailure(2, { list: [2, 1] }),
      unknownFailure(3, { list: [1, 2] }),
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
    await expect(handle.completion).resolves.toMatchObject({ status: "completed" });
  });

  it("uses sorted object keys in the shared projection signature", () => {
    expect(canonicalJsonValue({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    const result = createToolFailure(
      "TOOL_UNKNOWN",
      "unknown",
      true,
      { reason: "unknown_tool" },
    );
    expect(createToolErrorSignature("unknown_tool", { a: 1, b: 2 }, result))
      .toBe(createToolErrorSignature("unknown_tool", { b: 2, a: 1 }, result));
    expect(createToolErrorSignature("unknown_tool", { list: [1, 2] }, result))
      .not.toBe(createToolErrorSignature("unknown_tool", { list: [2, 1] }, result));
  });
});

describe("Agent tool and no-progress limits", () => {
  it("rejects an over-limit batch atomically", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([
      createToolCompletion([
        successfulRead(1).toolCalls[0]!,
        successfulRead(2).toolCalls[0]!,
      ]),
    ]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );
    const handle = await runtime.startRun({
      sessionId,
      prompt: "task",
      limits: { maxToolCalls: 1 },
    });
    await expect(handle.completion).resolves.toMatchObject({
      status: "failed",
      error: { code: "AGENT_TOOL_CALL_LIMIT" },
      toolCalls: 0,
    });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.some((event) => event.type === "tool.requested")).toBe(false);
  });

  it("stops after the third identical successful read fact", async () => {
    const fixture = await createAgentFixture();
    await writeFile(`${fixture.workspace}/one.txt`, "one\n", "utf8");
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([
      successfulRead(1),
      successfulRead(2),
      successfulRead(3),
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
    await expect(handle.completion).resolves.toMatchObject({
      status: "failed",
      error: { code: "AGENT_NO_PROGRESS_LIMIT" },
      modelRequests: 3,
      toolCalls: 3,
    });
  });
});
