import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentRuntime } from "@/lib/agent";
import { createAgentContextProvider } from "@/lib/context";
import { ModelAbortError } from "@/lib/model";
import { createJsonlEventStore } from "@/lib/storage";
import { createWorkspaceHandle } from "@/lib/workspace";
import { runTerminalApplication } from "@/lib/terminal/application";
import { createTerminalWriter } from "@/lib/terminal/writer";

import {
  ControlledTerminalIO,
  QueueFakeModel,
  createTerminalFixture,
  textCompletion,
  toolCompletion,
} from "./helpers";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map((cleanup) => cleanup())); });

async function setup(model: QueueFakeModel) {
  const fixture = await createTerminalFixture();
  cleanups.push(fixture.cleanup);
  const store = createJsonlEventStore({ dataDir: fixture.dataDir });
  await store.initialize();
  const created = await store.createSession({ title: "Terminal integration", workspacePath: fixture.workspace, modelProfileId: "test-model" });
  const contextProvider = createAgentContextProvider({ eventSource: store, modelClient: model });
  const runtime = createAgentRuntime({ eventStore: store, modelClient: model, contextProvider });
  const snapshot = await runtime.recoverSession(created.metadata.id);
  const io = new ControlledTerminalIO();
  const application = runTerminalApplication({
    session: { metadata: created.metadata, profile: model.snapshot.profiles[0]!, workspace: await createWorkspaceHandle(fixture.workspace), snapshot },
    runtime,
    input: io.input[Symbol.asyncIterator](),
    writer: createTerminalWriter(io),
    onInterrupt: io.onInterrupt.bind(io),
  });
  const events = async () => (await store.readEvents(created.metadata.id, { afterSeq: 0, limit: 1000 })).events;
  return { ...fixture, store, runtime, io, application, sessionId: created.metadata.id, events };
}

describe("terminal with production runtime and context", () => {
  it("runs two sequential tasks in one fixed session and returns idle", async () => {
    const item = await setup(new QueueFakeModel([textCompletion("第一次完成"), textCompletion("第二次完成")]));
    item.io.push("任务一");
    await vi.waitFor(async () => expect((await item.events()).filter((event) => event.type === "run.completed")).toHaveLength(1), { timeout: 5_000 });
    item.io.push("任务二");
    await vi.waitFor(async () => expect((await item.events()).filter((event) => event.type === "run.completed")).toHaveLength(2), { timeout: 5_000 });
    item.io.push("/exit");
    await expect(item.application).resolves.toEqual({ exitCode: 0, reason: "normal" });
    expect(item.io.text()).toContain("第一次完成");
    expect(item.io.text()).toContain("第二次完成");
    expect(new Set((await item.events()).map((event) => event.sessionId))).toEqual(new Set([item.sessionId]));
  });

  it("observes read_file request, result and final answer", async () => {
    const model = new QueueFakeModel([
      toolCompletion("read_file", { path: "hello.txt", startLine: 1 }),
      textCompletion("已读取文件"),
    ]);
    const item = await setup(model);
    item.io.push("读取 hello.txt");
    await vi.waitFor(
      async () => expect((await item.events()).some((event) => event.type === "run.completed")).toBe(true),
      { timeout: 5_000 },
    );
    item.io.push("/exit");
    await item.application;
    const types = (await item.events()).map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(["tool.requested", "tool.started", "tool.result", "assistant.message", "run.completed"]));
    expect(item.io.text()).toContain("hello terminal");
    expect(item.io.text()).toContain("已读取文件");
    expect(model.requests[1]?.messages.some((message) => message.role === "tool")).toBe(true);
  });

  it("rejects an approval through the terminal without executing the process", async () => {
    const item = await setup(new QueueFakeModel([
      toolCompletion("run_process", { program: "pnpm", args: ["install"], cwd: ".", timeoutMs: 1000 }),
      textCompletion("已按拒绝结果继续"),
    ]));
    item.io.push("安装依赖");
    await vi.waitFor(async () => {
      const required = (await item.events()).find((event) => event.type === "approval.required");
      expect(item.io.text()).toContain("需要审批");
      expect(required?.runId).toBeDefined();
      expect(item.runtime.getActiveRun(required!.runId!)?.pendingApproval).toBeDefined();
    }, { timeout: 5_000 });
    item.io.push("/reject 测试中拒绝");
    await vi.waitFor(
      async () => expect((await item.events()).some((event) => event.type === "run.completed")).toBe(true),
      { timeout: 5_000 },
    );
    item.io.push("/exit");
    await item.application;
    const events = await item.events();
    expect(events.some((event) => event.type === "approval.resolved" && event.data.approved === false)).toBe(true);
    expect(events.some((event) => event.type === "tool.started")).toBe(false);
  }, 10_000);

  it("cancels a deferred model from the interactive input and records one terminal", async () => {
    const model = new QueueFakeModel([
      (request) => new Promise((_resolve, reject) => {
        const abort = () => reject(new ModelAbortError("fake aborted"));
        if (request.signal.aborted) abort();
        else request.signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
    const item = await setup(model);
    item.io.push("等待模型");
    await vi.waitFor(() => expect(model.requests).toHaveLength(1));
    item.io.push("/cancel 用户测试取消");
    await vi.waitFor(async () => expect((await item.events()).filter((event) => event.type === "run.cancelled")).toHaveLength(1), { timeout: 5_000 });
    item.io.push("/exit");
    await item.application;
    expect((await item.events()).filter((event) => event.type === "run.cancelled")).toHaveLength(1);
    expect(item.io.text()).toContain("已请求取消");
  });

  it("maps active Ctrl+C to one cancellation and keeps the application available", async () => {
    const model = new QueueFakeModel([
      (request) => new Promise((_resolve, reject) => {
        const abort = () => reject(new ModelAbortError("fake ctrl-c abort"));
        if (request.signal.aborted) abort();
        else request.signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
    const item = await setup(model);
    item.io.push("等待 Ctrl+C");
    await vi.waitFor(() => expect(model.requests).toHaveLength(1));
    item.io.interrupt();
    await vi.waitFor(async () => expect((await item.events()).filter((event) => event.type === "run.cancelled")).toHaveLength(1), { timeout: 5_000 });
    item.io.push("/status");
    await vi.waitFor(() => expect(item.io.text()).toContain("最近运行"));
    item.io.push("/exit");
    await expect(item.application).resolves.toEqual({ exitCode: 0, reason: "normal" });
  });

  it("returns 130 when Ctrl+C arrives while idle", async () => {
    const item = await setup(new QueueFakeModel([]));
    item.io.interrupt();
    await expect(item.application).resolves.toEqual({ exitCode: 130, reason: "interrupted" });
  });
});
