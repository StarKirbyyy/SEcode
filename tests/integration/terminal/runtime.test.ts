import { mkdir, readFile, writeFile } from "node:fs/promises";

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
  it("shows the uncovered client scope and completes after separate validations", async () => {
    const serverWrite = toolCompletion("write_file", {
      path: "server/server.mjs",
      content: "export const server = true;\n",
    }, "00000000-0000-4000-8000-000000000551");
    const clientWrite = toolCompletion("write_file", {
      path: "client/client.mjs",
      content: "export const client = true;\n",
    }, "00000000-0000-4000-8000-000000000552");
    const model = new QueueFakeModel([
      { ...serverWrite, toolCalls: [serverWrite.toolCalls[0]!, clientWrite.toolCalls[0]!] },
      toolCompletion("run_process", { program: "npm", args: ["test"], cwd: "server" }, "00000000-0000-4000-8000-000000000553"),
      textCompletion("后端验证完成。"),
      toolCompletion("run_process", { program: "npm", args: ["test"], cwd: "client" }, "00000000-0000-4000-8000-000000000554"),
      textCompletion("前后端验证完成。"),
    ]);
    const item = await setup(model);
    for (const scope of ["server", "client"]) {
      await mkdir(`${item.workspace}/${scope}`);
      await writeFile(
        `${item.workspace}/${scope}/package.json`,
        JSON.stringify({ scripts: { test: `node --check ${scope}.mjs` } }),
        "utf8",
      );
    }
    item.io.push("修改并分别验证前后端");
    await vi.waitFor(async () => {
      expect((await item.events()).some((event) => event.type === "run.completed"))
        .toBe(true);
    }, { timeout: 5_000 });
    item.io.push("/exit");
    await item.application;
    expect(item.io.text()).toContain("待验证路径：client/client.mjs");
    expect((await item.events()).filter(
      (event) => event.type === "completion.evidence.rejected",
    )).toHaveLength(1);
  });

  it("hides an English final and displays only the accepted Chinese restatement", async () => {
    const item = await setup(new QueueFakeModel([
      textCompletion("I inspected the repository and the task is complete."),
      textCompletion("已检查仓库，任务已经完成。"),
    ]));
    item.io.push("检查项目");
    await vi.waitFor(async () => {
      expect((await item.events()).some((event) => event.type === "run.completed"))
        .toBe(true);
    }, { timeout: 5_000 });
    item.io.push("/exit");
    await item.application;

    expect(item.io.text()).toContain("正在请求中文重述（1/2）");
    expect(item.io.text()).toContain("已检查仓库，任务已经完成。");
    expect(item.io.text()).not.toContain("inspected the repository");
    expect((await item.events()).filter((event) =>
      event.type === "model.output.rejected"
    )).toHaveLength(1);
  });

  it("suppresses English tool narration and executes the requested tool once", async () => {
    const first = {
      ...toolCompletion("read_file", { path: "hello.txt", startLine: 1 }),
      content: "I will inspect the file before continuing.",
    };
    const model = new QueueFakeModel([
      first,
      textCompletion("已读取 hello.txt，并确认文件内容。"),
    ]);
    const item = await setup(model);
    item.io.push("读取 hello.txt");
    await vi.waitFor(async () => {
      expect((await item.events()).some((event) => event.type === "run.completed"))
        .toBe(true);
    }, { timeout: 5_000 });
    item.io.push("/exit");
    await item.application;

    const events = await item.events();
    expect(events.filter((event) => event.type === "tool.requested"))
      .toHaveLength(1);
    expect(events.filter((event) => event.type === "tool.result"))
      .toHaveLength(1);
    expect(events.find((event) => event.type === "model.output.rejected"))
      .toMatchObject({ data: { action: "content_suppressed" } });
    expect(item.io.text()).toContain("工具将按原请求执行一次");
    expect(item.io.text()).not.toContain("inspect the file");
  });

  it("reports a stable error after three English completions", async () => {
    const item = await setup(new QueueFakeModel([
      textCompletion("The first response remains in English."),
      textCompletion("The second response remains in English."),
      textCompletion("The third response remains in English."),
    ]));
    item.io.push("检查项目");
    await vi.waitFor(async () => {
      expect((await item.events()).some((event) => event.type === "run.failed"))
        .toBe(true);
    }, { timeout: 5_000 });
    item.io.push("/exit");
    await item.application;

    expect(item.io.text()).toContain("AGENT_OUTPUT_LANGUAGE_INVALID");
    expect(item.io.text()).not.toContain("response remains in English");
    expect((await item.events()).filter((event) =>
      event.type === "model.output.rejected"
    )).toHaveLength(3);
  });

  it("cancels while waiting for a Chinese restatement", async () => {
    const model = new QueueFakeModel([
      textCompletion("The response is written in English."),
      (request) => new Promise((_resolve, reject) => {
        const abort = () => reject(new ModelAbortError("fake language retry aborted"));
        if (request.signal.aborted) abort();
        else request.signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
    const item = await setup(model);
    item.io.push("检查项目");
    await vi.waitFor(() => expect(model.requests).toHaveLength(2));
    item.io.push("/cancel 取消中文重述测试");
    await vi.waitFor(async () => {
      expect((await item.events()).some((event) => event.type === "run.cancelled"))
        .toBe(true);
    }, { timeout: 5_000 });
    item.io.push("/exit");
    await item.application;

    expect(item.io.text()).toContain("运行已取消");
    expect((await item.events()).filter((event) => event.type === "run.cancelled"))
      .toHaveLength(1);
  });

  it("toggles Plan Mode, pauses for a plan, and continues the same run after approval", async () => {
    const model = new QueueFakeModel([
      toolCompletion("read_file", { path: "hello.txt", startLine: 1 }),
      textCompletion("目标：创建结果\n事实：hello.txt 已读取\n任务：创建 result.txt\n验证：读取结果\n风险：无\n不执行：不安装依赖"),
      toolCompletion(
        "write_file",
        { path: "result.txt", content: "terminal plan done\n" },
        "00000000-0000-4000-8000-000000000502",
      ),
      textCompletion("计划执行完成"),
    ]);
    const item = await setup(model);
    item.io.push("/plan on");
    item.io.push("创建结果文件");
    await vi.waitFor(async () => {
      expect((await item.events()).some((event) => event.type === "plan.proposed")).toBe(true);
      expect(item.io.text()).toContain("/approve-plan");
    }, { timeout: 5_000 });
    await expect(readFile(`${item.workspace}/result.txt`, "utf8")).rejects.toBeDefined();
    const runId = (await item.events()).find((event) => event.type === "run.started")!.runId!;
    item.io.push("/approve-plan 人工集成批准");
    await vi.waitFor(async () => {
      expect((await item.events()).some((event) => event.type === "run.completed")).toBe(true);
    }, { timeout: 5_000 });
    item.io.push("/status");
    item.io.push("/exit");
    await item.application;

    await expect(readFile(`${item.workspace}/result.txt`, "utf8"))
      .resolves.toBe("terminal plan done\n");
    const events = await item.events();
    expect(new Set(events.filter((event) => event.runId !== undefined).map((event) => event.runId)))
      .toContain(runId);
    expect(model.requests[0]!.tools).toHaveLength(3);
    expect(model.requests[2]!.tools).toHaveLength(6);
    expect(item.io.text()).toContain("Plan Mode on");
  });

  it("rejects a plan and records cancellation without execution", async () => {
    const model = new QueueFakeModel([
      textCompletion("目标：不执行\n事实：已观察\n任务：创建文件\n验证：读取\n风险：无\n不执行：安装"),
    ]);
    const item = await setup(model);
    item.io.push("/plan on");
    item.io.push("请先计划");
    await vi.waitFor(async () => {
      expect((await item.events()).some((event) => event.type === "plan.proposed")).toBe(true);
    }, { timeout: 5_000 });
    item.io.push("/reject-plan 不同意");
    await vi.waitFor(async () => {
      expect((await item.events()).some((event) => event.type === "run.cancelled")).toBe(true);
    }, { timeout: 5_000 });
    item.io.push("/exit");
    await item.application;
    const events = await item.events();
    expect(events.some((event) => event.type === "tool.requested")).toBe(false);
    expect(events.find((event) => event.type === "plan.approval.resolved"))
      .toMatchObject({ data: { approved: false } });
  });

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
