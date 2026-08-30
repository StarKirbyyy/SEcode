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
      const request = complete.mock.calls[0][0];
      expect(request.messages.map((message) => message.role))
        .toEqual(["system", "system", "user", "system", "system"]);
      expect(request.messages[0]!.content).toContain("当前阶段：正常执行");
      expect(request.messages[2]).toMatchObject({
        role: "user",
        content: "检查项目",
      });
      expect(request.tools).toHaveLength(6);
      expect(request.tools.every((tool) => /[\u3400-\u9fff]/u.test(
        tool.function.description,
      ))).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it("captures Chinese planning and approved-execution requests in one run", async () => {
    const fixture = await createTempContextStore();
    try {
      const created = await fixture.store.createSession({
        title: "中文请求捕获",
        workspacePath: fixture.workspacePath,
        modelProfileId: "deepseek",
      });
      let requestCount = 0;
      const complete = vi.fn<ModelClient["complete"]>(async () => {
        requestCount += 1;
        return requestCount === 1
          ? modelCompletion("目标：Keep APIName\n事实：无需修改\n任务：核对\n验证：检查结果\n风险：无\n不执行：写入")
          : modelCompletion("已完成核对");
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
        prompt: "保留 APIName 和 src/English.ts",
        planningEnabled: true,
      });
      await vi.waitFor(() => {
        expect(runtime.getActiveRun(handle.runId)?.pendingPlanApproval)
          .toBeDefined();
      });
      const pending = runtime.getActiveRun(handle.runId)!.pendingPlanApproval!;
      await expect(runtime.resolvePlanApproval(
        handle.runId,
        pending.approvalId,
        { planId: pending.planId, approved: true },
      )).resolves.toMatchObject({ status: "resolved", approved: true });
      await expect(handle.completion).resolves.toMatchObject({
        status: "completed",
        modelRequests: 2,
      });

      expect(complete).toHaveBeenCalledTimes(2);
      const planning = complete.mock.calls[0][0];
      const executing = complete.mock.calls[1][0];
      expect(planning.messages[0]!.content).toContain("当前阶段：规划");
      expect(planning.messages.some((message) =>
        message.role === "user" &&
        message.content === "保留 APIName 和 src/English.ts"
      )).toBe(true);
      expect(planning.tools.map((tool) => tool.function.name)).toEqual([
        "list_directory",
        "read_file",
        "search_text",
      ]);
      expect(executing.messages[0]!.content).toContain("当前阶段：已批准执行");
      expect(executing.messages.some((message) =>
        message.role === "assistant" &&
        message.content?.includes("Keep APIName")
      )).toBe(true);
      expect(executing.messages.some((message) =>
        message.role === "user" &&
        message.content.includes("我批准上述持久化计划提案")
      )).toBe(true);
      expect(executing.tools).toHaveLength(6);
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

  it("continues the same Session after legacy large outputs without repeating old tools", async () => {
    const fixture = await createTempContextStore();
    try {
      await writeFile(`${fixture.workspacePath}/next.txt`, "继续\n", "utf8");
      const created = await fixture.store.createSession({
        title: "旧大输出恢复",
        workspacePath: fixture.workspacePath,
        modelProfileId: "deepseek",
      });
      const oldToolCallIds: string[] = [];
      for (let index = 1; index <= 9; index += 1) {
        const runId = numberedRunId(index);
        const toolCallId = `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
        oldToolCallIds.push(toolCallId);
        await fixture.store.appendEvent(created.metadata.id, {
          type: "run.started",
          runId,
          data: {
            promptPreview: `脱敏历史 ${index}`,
            limits: { maxToolCalls: 300, maxDurationMs: 600_000 },
          },
        });
        await fixture.store.appendEvent(created.metadata.id, {
          type: "user.message",
          runId,
          data: { content: `脱敏历史 ${index}` },
        });
        await fixture.store.appendEvent(created.metadata.id, {
          type: "model.requested",
          runId,
          data: { iteration: 1, modelProfileId: "deepseek" },
        });
        await fixture.store.appendEvent(created.metadata.id, {
          type: "model.completed",
          runId,
          data: { iteration: 1, finishReason: "tool_calls" },
        });
        await fixture.store.appendEvent(created.metadata.id, {
          type: "tool.requested",
          runId,
          data: {
            toolCallId,
            toolName: "read_file",
            publicArguments: { path: `legacy-${index}.txt` },
            argumentsTruncated: false,
          },
        });
        await fixture.store.appendEvent(created.metadata.id, {
          type: "tool.started",
          runId,
          data: { toolCallId, toolName: "read_file" },
        });
        await fixture.store.appendEvent(created.metadata.id, {
          type: "tool.result",
          runId,
          data: {
            toolCallId,
            toolName: "read_file",
            result: {
              ok: true,
              summary: "旧读取完成",
              output: `legacy-${index}:`.padEnd(55_785, "x"),
            },
          },
        });
        await fixture.store.appendEvent(created.metadata.id, {
          type: "run.failed",
          runId,
          data: {
            iterations: 1,
            error: {
              code: "AGENT_CONTEXT_FAILED",
              message: "模型上下文构建失败",
              recoverable: true,
            },
          },
        });
      }

      const newToolCallId = "30000000-0000-4000-8000-000000000999";
      const complete = vi.fn<ModelClient["complete"]>(async () => {
        if (complete.mock.calls.length === 1) {
          return {
            ...modelCompletion("继续读取新文件"),
            finishReason: "tool_calls",
            toolCalls: [{
              ok: true,
              call: {
                id: newToolCallId,
                name: "read_file",
                arguments: { path: "next.txt", startLine: 1 },
              },
            }],
          };
        }
        return modelCompletion("恢复任务已完成");
      });
      const model = createFakeModelClient(64_000, complete);
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
        prompt: "继续",
      });
      await expect(handle.completion).resolves.toMatchObject({
        status: "completed",
        modelRequests: 2,
      });

      const events = (await fixture.store.readEvents(created.metadata.id, {
        limit: 1_000,
      })).events;
      const requestedIds = events
        .filter((event) => event.type === "tool.requested")
        .map((event) => event.data.toolCallId);
      for (const oldId of oldToolCallIds) {
        expect(requestedIds.filter((id) => id === oldId)).toHaveLength(1);
      }
      expect(requestedIds.filter((id) => id === newToolCallId)).toHaveLength(1);
      expect(events.filter((event) => event.type === "model.requested")).toHaveLength(11);
      expect(JSON.stringify(complete.mock.calls[0][0].messages))
        .not.toContain("x".repeat(20_000));
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
      // readiness 扩展增加了工具定义 Token；保留“需要压缩且最近 8 回合可保留”的夹具语义。
      const model = createFakeModelClient(25_000, complete);
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
