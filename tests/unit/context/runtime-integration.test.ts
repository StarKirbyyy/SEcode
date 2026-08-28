import { writeFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { createAgentRuntime } from "@/lib/agent";
import {
  createAgentContextProvider,
  type ContextEventSource,
} from "@/lib/context";
import type { ModelClient } from "@/lib/model";

import {
  createFakeModelClient,
  createTempContextStore,
  modelCompletion,
  numberedRunId,
} from "./helpers";

async function appendCompletedRun(
  store: Awaited<ReturnType<typeof createTempContextStore>>["store"],
  sessionId: string,
  index: number,
  contentCharacters: number,
) {
  const runId = numberedRunId(index);
  await store.appendEvent(sessionId, {
    type: "run.started",
    runId,
    data: {
      promptPreview: `任务 ${index}`,
      limits: { maxIterations: 30, maxDurationMs: 600_000 },
    },
  });
  await store.appendEvent(sessionId, {
    type: "user.message",
    runId,
    data: { content: `任务 ${index}` },
  });
  await store.appendEvent(sessionId, {
    type: "model.requested",
    runId,
    data: { iteration: 1, modelProfileId: "deepseek" },
  });
  await store.appendEvent(sessionId, {
    type: "model.completed",
    runId,
    data: { iteration: 1, finishReason: "stop" },
  });
  await store.appendEvent(sessionId, {
    type: "assistant.message",
    runId,
    data: { kind: "final", content: `${index}:`.padEnd(contentCharacters, "x") },
  });
  await store.appendEvent(sessionId, {
    type: "run.completed",
    runId,
    data: { iterations: 1, durationMs: 1 },
  });
}

describe("context provider and AgentRuntime integration", () => {
  it("completes a first run using only public factories", async () => {
    const fixture = await createTempContextStore();
    try {
      const created = await fixture.store.createSession({
        title: "集成测试",
        workspacePath: fixture.workspacePath,
        modelProfileId: "deepseek",
      });
      const complete = vi.fn<ModelClient["complete"]>(
        async () => modelCompletion("任务完成"),
      );
      const model = createFakeModelClient(1_000_000, complete);
      const contextProvider = createAgentContextProvider({
        eventSource: fixture.store,
        modelClient: model,
      });
      const runtime = createAgentRuntime({
        eventStore: fixture.store,
        modelClient: model,
        contextProvider,
      });
      const handle = await runtime.startRun({
        sessionId: created.metadata.id,
        prompt: "检查项目",
      });
      await expect(handle.completion).resolves.toMatchObject({ status: "completed" });
      const events = (await fixture.store.readEvents(created.metadata.id)).events;
      expect(events.map((event) => event.type)).toEqual([
        "session.created",
        "run.started",
        "user.message",
        "model.requested",
        "model.completed",
        "assistant.message",
        "run.completed",
      ]);
      expect(complete).toHaveBeenCalledTimes(1);
      expect(complete.mock.calls[0][0].messages.map((message) => message.role))
        .toEqual(["system", "system", "user"]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rebuilds a complete tool round before the next model request", async () => {
    const fixture = await createTempContextStore();
    try {
      await writeFile(`${fixture.workspacePath}/one.txt`, "hello\n", "utf8");
      const created = await fixture.store.createSession({
        title: "工具集成",
        workspacePath: fixture.workspacePath,
        modelProfileId: "deepseek",
      });
      const complete = vi.fn<ModelClient["complete"]>(async () => {
        if (complete.mock.calls.length === 1) {
          return {
            ...modelCompletion("先读取文件"),
            finishReason: "tool_calls",
            toolCalls: [{
              ok: true,
              call: {
                id: "30000000-0000-4000-8000-000000000099",
                name: "read_file",
                arguments: { path: "one.txt", startLine: 1 },
              },
            }],
          };
        }
        return modelCompletion("读取完成");
      });
      const model = createFakeModelClient(1_000_000, complete);
      const runtime = createAgentRuntime({
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createAgentContextProvider({
          eventSource: fixture.store,
          modelClient: model,
        }),
      });
      const handle = await runtime.startRun({
        sessionId: created.metadata.id,
        prompt: "读取 one.txt",
      });
      await expect(handle.completion).resolves.toMatchObject({
        status: "completed",
        iterations: 2,
      });
      expect(complete).toHaveBeenCalledTimes(2);
      const secondMessages = complete.mock.calls[1][0].messages;
      const toolAssistant = secondMessages.find(
        (message) => message.role === "assistant" &&
          "toolCalls" in message &&
          message.toolCalls !== undefined,
      );
      expect(toolAssistant && "toolCalls" in toolAssistant
        ? toolAssistant.toolCalls
        : undefined).toMatchObject([{
        id: "30000000-0000-4000-8000-000000000099",
        name: "read_file",
      }]);
      expect(secondMessages.find((message) => message.role === "tool"))
        .toMatchObject({
          toolCallId: "30000000-0000-4000-8000-000000000099",
          name: "read_file",
        });
    } finally {
      await fixture.cleanup();
    }
  });

  it("persists compaction before the next agent model request", async () => {
    const fixture = await createTempContextStore();
    try {
      const created = await fixture.store.createSession({
        title: "压缩集成",
        workspacePath: fixture.workspacePath,
        modelProfileId: "deepseek",
      });
      for (let index = 1; index <= 12; index += 1) {
        await appendCompletedRun(fixture.store, created.metadata.id, index, 2_500);
      }
      const complete = vi.fn<ModelClient["complete"]>(async (request) =>
        request.tools.length === 0
          ? modelCompletion("早期任务已完成并验证")
          : modelCompletion("当前任务完成"),
      );
      const model = createFakeModelClient(22_000, complete);
      const runtime = createAgentRuntime({
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createAgentContextProvider({
          eventSource: fixture.store,
          modelClient: model,
        }),
      });
      const handle = await runtime.startRun({
        sessionId: created.metadata.id,
        prompt: "当前任务",
      });
      await expect(handle.completion).resolves.toMatchObject({ status: "completed" });
      const events = (await fixture.store.readEvents(created.metadata.id, { limit: 1_000 })).events;
      const compactedIndex = events.findIndex((event) => event.type === "context.compacted");
      const nextRequestedIndex = events.findIndex(
        (event, index) => index > compactedIndex && event.type === "model.requested",
      );
      expect(compactedIndex).toBeGreaterThan(0);
      expect(nextRequestedIndex).toBeGreaterThan(compactedIndex);
      expect(complete).toHaveBeenCalledTimes(2);
      expect(complete.mock.calls[0][0].tools).toEqual([]);
      expect(complete.mock.calls[1][0].tools.length).toBeGreaterThan(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it("classifies cancellation while context history is being read", async () => {
    const fixture = await createTempContextStore();
    let releaseRead!: () => void;
    let markReadStarted!: () => void;
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    const readStarted = new Promise<void>((resolve) => { markReadStarted = resolve; });
    try {
      const created = await fixture.store.createSession({
        title: "取消集成",
        workspacePath: fixture.workspacePath,
        modelProfileId: "deepseek",
      });
      const source: ContextEventSource = {
        getSessionMetadata: (sessionId) => fixture.store.getSessionMetadata(sessionId),
        readEvents: async (sessionId, query) => {
          markReadStarted();
          await readGate;
          return fixture.store.readEvents(sessionId, query);
        },
      };
      const model = createFakeModelClient(1_000_000);
      const runtime = createAgentRuntime({
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createAgentContextProvider({ eventSource: source, modelClient: model }),
      });
      const handle = await runtime.startRun({
        sessionId: created.metadata.id,
        prompt: "取消任务",
      });
      await readStarted;
      expect(handle.cancel("用户停止")).toBe(true);
      releaseRead();
      await expect(handle.completion).resolves.toMatchObject({
        status: "cancelled",
        reason: "用户停止",
      });
      const terminal = (await fixture.store.readEvents(created.metadata.id)).events.filter(
        (event) => event.type === "run.cancelled",
      );
      expect(terminal).toHaveLength(1);
      expect(vi.mocked(model.complete)).not.toHaveBeenCalled();
    } finally {
      releaseRead();
      await fixture.cleanup();
    }
  });

  it("maps an ordinary production context failure to one agent failure", async () => {
    const fixture = await createTempContextStore();
    try {
      const created = await fixture.store.createSession({
        title: "错误集成",
        workspacePath: fixture.workspacePath,
        modelProfileId: "deepseek",
      });
      const source: ContextEventSource = {
        async getSessionMetadata() {
          throw new Error("private store detail");
        },
        readEvents: (sessionId, query) => fixture.store.readEvents(sessionId, query),
      };
      const model = createFakeModelClient(1_000_000);
      const runtime = createAgentRuntime({
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createAgentContextProvider({ eventSource: source, modelClient: model }),
      });
      const handle = await runtime.startRun({
        sessionId: created.metadata.id,
        prompt: "触发错误",
      });
      await expect(handle.completion).resolves.toMatchObject({
        status: "failed",
        error: { code: "AGENT_CONTEXT_FAILED" },
      });
      const events = (await fixture.store.readEvents(created.metadata.id)).events;
      expect(events.filter((event) => event.type === "run.failed")).toHaveLength(1);
      expect(JSON.stringify(events)).not.toContain("private store detail");
      expect(vi.mocked(model.complete)).not.toHaveBeenCalled();
    } finally {
      await fixture.cleanup();
    }
  });
});
