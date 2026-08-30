import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentRuntime } from "@/lib/agent";
import { createAgentContextProvider } from "@/lib/context";
import type { DurableAgentEvent, JsonObject } from "@/lib/domain";
import type { ModelCompletion, ModelRequest } from "@/lib/model";
import { createJsonlEventStore } from "@/lib/storage";
import { runTerminalApplication } from "@/lib/terminal/application";
import { createTerminalWriter } from "@/lib/terminal/writer";
import { createWorkspaceHandle } from "@/lib/workspace";

import {
  ControlledTerminalIO,
  QueueFakeModel,
  createTerminalFixture,
  textCompletion,
  toolCompletion,
} from "./helpers";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const callId = (index: number) =>
  `18000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function assertExecutionPolicy(request: ModelRequest): void {
  const system = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");
  expect(system).toContain("SEcode 系统策略 v10");
  expect(system).toContain("ToolResult.ok");
  expect(system).toContain("stderr 只是输出通道");
  expect(system).toContain("expectedSha256");
  expect(system).toContain("3000 是 SEcode 默认保留端口");
  expect(system).toContain("SERVER_PORT");
  expect(system).toContain("监听、代理、README、API 检查和 readiness 使用同一端口");
  expect(system).toContain("不解释管道、连接符、重定向、$VAR 或命令替换");
}

function policyStep(completion: ModelCompletion) {
  return async (): Promise<ModelCompletion> => completion;
}

function expectPolicyRequests(model: QueueFakeModel): void {
  expect(model.requests.length).toBeGreaterThan(0);
  for (const request of model.requests) assertExecutionPolicy(request);
}

function multipleToolCompletion(
  calls: Array<{ id: string; name: string; arguments: JsonObject }>,
): ModelCompletion {
  return {
    content: null,
    toolCalls: calls.map((call) => ({ ok: true as const, call })),
    finishReason: "tool_calls",
    continuation: Object.freeze({}),
  } as ModelCompletion;
}

async function setup(
  model: QueueFakeModel,
  options: { emptyWorkspace?: boolean } = {},
) {
  const fixture = await createTerminalFixture();
  cleanups.push(fixture.cleanup);
  if (options.emptyWorkspace) {
    await unlink(path.join(fixture.workspace, "hello.txt"));
  } else {
  await mkdir(path.join(fixture.workspace, "scripts"));
  await mkdir(path.join(fixture.workspace, "src"));
  await mkdir(path.join(fixture.workspace, "fixtures"));
  await writeFile(
    path.join(fixture.workspace, "package.json"),
    JSON.stringify({
      private: true,
      scripts: {
        test: "node scripts/verify.mjs warning",
        build: "node scripts/verify.mjs build",
      },
    }),
  );
  await writeFile(
    path.join(fixture.workspace, "scripts/verify.mjs"),
    `import { readFile } from "node:fs/promises";
process.stderr.write("NON_BLOCKING_WARNING\\n");
if (process.argv[2] === "build") {
  const blocker = await readFile(new URL("../src/blocker.ts", import.meta.url), "utf8");
  if (!blocker.includes("fixed")) {
    process.stderr.write("DIRECT_BLOCKER\\n");
    process.exitCode = 1;
  }
}
`,
  );
  await writeFile(
    path.join(fixture.workspace, "src/blocker.ts"),
    "export const blocker = \"broken\";\n",
  );
  await writeFile(
    path.join(fixture.workspace, "src/existing.ts"),
    "export const existing = 1;\n",
  );
  await writeFile(
    path.join(fixture.workspace, "fixtures/non-blocking-warning.txt"),
    "warning fixture must remain unchanged\n",
  );
  }

  const store = createJsonlEventStore({ dataDir: fixture.dataDir });
  await store.initialize();
  const created = await store.createSession({
    title: "Stage 18 deterministic trajectory",
    workspacePath: fixture.workspace,
    modelProfileId: "test-model",
  });
  const contextProvider = createAgentContextProvider({
    eventSource: store,
    modelClient: model,
  });
  const runtime = createAgentRuntime({
    eventStore: store,
    modelClient: model,
    contextProvider,
  });
  const snapshot = await runtime.recoverSession(created.metadata.id);
  const io = new ControlledTerminalIO();
  const application = runTerminalApplication({
    session: {
      metadata: created.metadata,
      profile: model.snapshot.profiles[0]!,
      workspace: await createWorkspaceHandle(fixture.workspace),
      snapshot,
    },
    runtime,
    input: io.input[Symbol.asyncIterator](),
    writer: createTerminalWriter(io),
    onInterrupt: io.onInterrupt.bind(io),
  });
  const events = async (): Promise<readonly DurableAgentEvent[]> =>
    (await store.readEvents(created.metadata.id, { afterSeq: 0, limit: 1_000 })).events;
  return { ...fixture, runtime, io, application, events };
}

async function waitForCompletion(item: Awaited<ReturnType<typeof setup>>) {
  await vi.waitFor(async () => {
    expect((await item.events()).some((event) => event.type === "run.completed"))
      .toBe(true);
  }, { timeout: 10_000 });
  item.io.push("/exit");
  await item.application;
}

async function approveRequiredTool(
  item: Awaited<ReturnType<typeof setup>>,
  expectedCount: number,
) {
  await vi.waitFor(async () => {
    expect((await item.events()).filter((event) => event.type === "approval.required"))
      .toHaveLength(expectedCount);
  }, { timeout: 10_000 });
  item.io.push(`/approve 阶段19临时工作区工具审批 ${expectedCount}`);
  await vi.waitFor(async () => {
    expect((await item.events()).filter((event) => event.type === "approval.resolved"))
      .toHaveLength(expectedCount);
  }, { timeout: 10_000 });
}

function requestedTools(events: readonly DurableAgentEvent[]): string[] {
  return events
    .filter((event) => event.type === "tool.requested")
    .map((event) => event.data.toolName);
}

function isToolRequestedEvent(
  event: DurableAgentEvent,
): event is Extract<DurableAgentEvent, { type: "tool.requested" }> {
  return event.type === "tool.requested";
}

function isToolResultEvent(
  event: DurableAgentEvent,
): event is Extract<DurableAgentEvent, { type: "tool.result" }> {
  return event.type === "tool.result";
}

describe("stage 18 deterministic execution precision", () => {
  it("treats exit 0 with stderr warning as success without writes", async () => {
    const model = new QueueFakeModel([
      policyStep(toolCompletion("run_process", {
        program: "npm",
        args: ["test"],
        cwd: ".",
      }, callId(1))),
      policyStep(textCompletion("命令已成功，保留并报告非阻塞 warning。")),
    ]);
    const item = await setup(model);
    item.io.push("运行 warning-only 验证");
    await waitForCompletion(item);

    const events = await item.events();
    expectPolicyRequests(model);
    expect(requestedTools(events)).toEqual(["run_process"]);
    expect(JSON.stringify(events)).toContain("NON_BLOCKING_WARNING");
    expect(requestedTools(events)).not.toContain("write_file");
    expect(await readFile(
      path.join(item.workspace, "fixtures/non-blocking-warning.txt"),
      "utf8",
    )).toBe("warning fixture must remain unchanged\n");
  });

  it("fixes only the blocker in mixed failure and stops after green rerun", async () => {
    const before = "export const blocker = \"broken\";\n";
    const after = "export const blocker = \"fixed\";\n";
    const model = new QueueFakeModel([
      policyStep(toolCompletion("run_process", {
        program: "npm",
        args: ["run", "build"],
        cwd: ".",
      }, callId(11))),
      policyStep(toolCompletion("read_file", {
        path: "src/blocker.ts",
        startLine: 1,
      }, callId(12))),
      policyStep(toolCompletion("write_file", {
        path: "src/blocker.ts",
        content: after,
        expectedSha256: sha256(before),
      }, callId(13))),
      policyStep(toolCompletion("run_process", {
        program: "npm",
        args: ["run", "build"],
        cwd: ".",
      }, callId(14))),
      policyStep(textCompletion("只修复了直接阻塞；重跑成功后停止。")),
    ]);
    const item = await setup(model);
    item.io.push("修复混合构建失败");
    await waitForCompletion(item);

    const events = await item.events();
    expectPolicyRequests(model);
    expect(requestedTools(events)).toEqual([
      "run_process",
      "read_file",
      "write_file",
      "run_process",
    ]);
    expect(JSON.stringify(events)).toContain("DIRECT_BLOCKER");
    expect(JSON.stringify(events)).toContain("NON_BLOCKING_WARNING");
    expect(await readFile(path.join(item.workspace, "src/blocker.ts"), "utf8"))
      .toBe(after);
    expect(await readFile(
      path.join(item.workspace, "fixtures/non-blocking-warning.txt"),
      "utf8",
    )).toBe("warning fixture must remain unchanged\n");
  });

  it("observes parent and target before create, overwrite and batch writes", async () => {
    const existing = "export const existing = 1;\n";
    const model = new QueueFakeModel([
      policyStep(toolCompletion("list_directory", {
        path: "src",
        depth: 1,
      }, callId(21))),
      policyStep(toolCompletion("run_process", {
        program: "mkdir",
        args: ["-p", "src/generated"],
        cwd: ".",
      }, callId(22))),
      policyStep(multipleToolCompletion([
        {
          id: callId(23),
          name: "write_file",
          arguments: { path: "src/generated/a.ts", content: "export const a = 1;\n" },
        },
        {
          id: callId(24),
          name: "write_file",
          arguments: { path: "src/generated/b.ts", content: "export const b = 2;\n" },
        },
      ])),
      policyStep(toolCompletion("read_file", {
        path: "src/existing.ts",
        startLine: 1,
      }, callId(25))),
      policyStep(toolCompletion("write_file", {
        path: "src/existing.ts",
        content: "export const existing = 2;\n",
        expectedSha256: sha256(existing),
      }, callId(26))),
      policyStep(toolCompletion("run_process", {
        program: "npm",
        args: ["test"],
        cwd: ".",
      }, callId(27))),
      policyStep(textCompletion("已按父目录和目标事实完成创建与覆盖。")),
    ]);
    const item = await setup(model);
    item.io.push("创建 generated 文件并覆盖 existing");
    await vi.waitFor(async () => {
      expect((await item.events()).some((event) => event.type === "approval.required"))
        .toBe(true);
    }, { timeout: 10_000 });
    item.io.push("/approve 阶段18确定性夹具仅创建工作区子目录");
    await waitForCompletion(item);

    const events = await item.events();
    expectPolicyRequests(model);
    expect(requestedTools(events)).toEqual([
      "list_directory",
      "run_process",
      "write_file",
      "write_file",
      "read_file",
      "write_file",
      "run_process",
    ]);
    expect(requestedTools(events).filter((name) => name === "list_directory"))
      .toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("parent_not_found");
    expect(JSON.stringify(events)).not.toContain("invalid_expected_hash_semantics");
    await expect(readFile(path.join(item.workspace, "src/generated/a.ts"), "utf8"))
      .resolves.toBe("export const a = 1;\n");
    await expect(readFile(path.join(item.workspace, "src/generated/b.ts"), "utf8"))
      .resolves.toBe("export const b = 2;\n");
    await expect(readFile(path.join(item.workspace, "src/existing.ts"), "utf8"))
      .resolves.toBe("export const existing = 2;\n");
  });

  it("re-observes after a stale hash instead of bypassing protection", async () => {
    const original = "export const existing = 1;\n";
    const concurrent = "export const existing = 7;\n";
    const final = "export const existing = 8;\n";
    let workspacePath = "";
    const model = new QueueFakeModel([
      policyStep(toolCompletion("list_directory", {
        path: "src",
        depth: 1,
      }, callId(31))),
      policyStep(toolCompletion("read_file", {
        path: "src/existing.ts",
        startLine: 1,
      }, callId(32))),
      async () => {
        await writeFile(path.join(workspacePath, "src/existing.ts"), concurrent);
        return toolCompletion("write_file", {
          path: "src/existing.ts",
          content: final,
          expectedSha256: sha256(original),
        }, callId(33));
      },
      policyStep(toolCompletion("list_directory", {
        path: "src",
        depth: 1,
      }, callId(34))),
      policyStep(toolCompletion("read_file", {
        path: "src/existing.ts",
        startLine: 1,
      }, callId(35))),
      policyStep(toolCompletion("write_file", {
        path: "src/existing.ts",
        content: final,
        expectedSha256: sha256(concurrent),
      }, callId(36))),
      policyStep(toolCompletion("run_process", {
        program: "npm",
        args: ["test"],
        cwd: ".",
      }, callId(37))),
      policyStep(textCompletion("并发变化后已重新观察并安全覆盖。")),
    ]);
    const item = await setup(model);
    workspacePath = item.workspace;
    item.io.push("安全覆盖可能并发变化的文件");
    await waitForCompletion(item);

    const events = await item.events();
    expectPolicyRequests(model);
    expect(requestedTools(events)).toEqual([
      "list_directory",
      "read_file",
      "write_file",
      "list_directory",
      "read_file",
      "write_file",
      "run_process",
    ]);
    expect(JSON.stringify(events)).toContain("FILE_STALE");
    await expect(readFile(path.join(item.workspace, "src/existing.ts"), "utf8"))
      .resolves.toBe(final);
  });

  it("keeps generated server, proxy, documentation and readiness on port 3001 without Shell arguments", async () => {
    const server = `import { createServer } from "node:http";
const serverPort = Number(process.env.SERVER_PORT || 3001);
createServer((_request, response) => response.end("ok")).listen(serverPort, "127.0.0.1");
`;
    const proxy = `export const apiTarget = "http://127.0.0.1:3001";
`;
    const readme = "后端默认地址：http://127.0.0.1:3001\n";
    const model = new QueueFakeModel([
      policyStep(toolCompletion("list_directory", {
        path: ".",
        depth: 1,
      }, callId(41))),
      policyStep(toolCompletion("list_directory", {
        path: "src",
        depth: 1,
      }, callId(42))),
      policyStep(multipleToolCompletion([
        {
          id: callId(43),
          name: "write_file",
          arguments: { path: "src/server.mjs", content: server },
        },
        {
          id: callId(44),
          name: "write_file",
          arguments: { path: "src/proxy.ts", content: proxy },
        },
        {
          id: callId(45),
          name: "write_file",
          arguments: { path: "README.md", content: readme },
        },
      ])),
      policyStep(toolCompletion("run_process", {
        program: "node",
        args: ["src/server.mjs"],
        cwd: ".",
        timeoutMs: 10_000,
        lifecycle: "service",
        readiness: { url: "http://127.0.0.1:3001", expectedStatus: 200 },
      }, callId(46))),
      policyStep(toolCompletion("run_process", {
        program: "npm",
        args: ["test"],
        cwd: ".",
      }, callId(47))),
      policyStep(textCompletion("服务、代理、文档和就绪探测均使用 3001，验收完成。")),
    ]);
    const item = await setup(model);
    item.io.push("创建避开 SEcode 3000 端口的本地服务并验收");
    await vi.waitFor(async () => {
      expect((await item.events()).some((event) => event.type === "approval.required"))
        .toBe(true);
    }, { timeout: 10_000 });
    item.io.push("/approve 仅启动临时工作区内的 3001 测试服务");
    await waitForCompletion(item);

    const events = await item.events();
    expectPolicyRequests(model);
    expect(requestedTools(events)).toEqual([
      "list_directory",
      "list_directory",
      "write_file",
      "write_file",
      "write_file",
      "run_process",
      "run_process",
    ]);
    const processArguments = events
      .filter(isToolRequestedEvent)
      .filter((event) => event.data.toolName === "run_process")
      .flatMap((event) => Array.isArray(event.data.publicArguments.args)
        ? event.data.publicArguments.args
        : []);
    expect(processArguments).toEqual(["src/server.mjs", "test"]);
    expect(processArguments).not.toEqual(expect.arrayContaining(["|", "&&", "$PORT", ">", "$()"]));
    await expect(readFile(path.join(item.workspace, "src/server.mjs"), "utf8"))
      .resolves.toContain("process.env.SERVER_PORT || 3001");
    await expect(readFile(path.join(item.workspace, "src/proxy.ts"), "utf8"))
      .resolves.toContain("127.0.0.1:3001");
    await expect(readFile(path.join(item.workspace, "README.md"), "utf8"))
      .resolves.toContain("127.0.0.1:3001");
    expect(JSON.stringify(events)).toContain("http://127.0.0.1:3001");
  });

  it("builds an empty-workspace project after Plan approval with ordered directories and port isolation", async () => {
    const packageJson = `${JSON.stringify({
      private: true,
      scripts: {
        build: "node --check server/server.mjs",
        test: "node scripts/check.mjs",
      },
    }, null, 2)}\n`;
    const server = `import { createServer } from "node:http";
const serverPort = Number(process.env.SERVER_PORT || 3001);
createServer((request, response) => {
  response.setHeader("content-type", request.url === "/" ? "text/html; charset=utf-8" : "application/json");
  response.end(request.url === "/" ? "<main>Stage 19 ready</main>" : JSON.stringify({ ok: true, port: serverPort }));
}).listen(serverPort, "127.0.0.1");
`;
    const check = `const api = await fetch("http://127.0.0.1:3001/api/health");
if (!api.ok || (await api.json()).port !== 3001) process.exit(1);
const page = await fetch("http://127.0.0.1:3001/");
if (!page.ok || !(await page.text()).includes("Stage 19 ready")) process.exit(1);
`;
    const model = new QueueFakeModel([
      policyStep(toolCompletion("list_directory", { path: ".", depth: 1 }, callId(51))),
      policyStep(textCompletion("目标：创建本地 Web 项目\n事实：根目录为空\n任务：先创建目录，再写入并启动\n验证：安装、构建、readiness、API 和页面\n风险：端口冲突\n不执行：不使用 3000")),
      policyStep(toolCompletion("run_process", {
        program: "mkdir",
        args: ["-p", "server", "client", "scripts"],
        cwd: ".",
      }, callId(52))),
      policyStep(toolCompletion("list_directory", { path: ".", depth: 2 }, callId(53))),
      policyStep(multipleToolCompletion([
        { id: callId(54), name: "write_file", arguments: { path: "package.json", content: packageJson } },
        { id: callId(55), name: "write_file", arguments: { path: "server/server.mjs", content: server } },
        { id: callId(56), name: "write_file", arguments: { path: "client/proxy.ts", content: "export const apiTarget = \"http://127.0.0.1:3001\";\n" } },
        { id: callId(57), name: "write_file", arguments: { path: "scripts/check.mjs", content: check } },
        { id: callId(58), name: "write_file", arguments: { path: "README.md", content: "后端：http://127.0.0.1:3001\n" } },
      ])),
      policyStep(toolCompletion("run_process", {
        program: "npm",
        args: ["install", "--ignore-scripts"],
        cwd: ".",
      }, callId(59))),
      policyStep(toolCompletion("run_process", {
        program: "npm",
        args: ["run", "build"],
        cwd: ".",
      }, callId(60))),
      policyStep(toolCompletion("run_process", {
        program: "node",
        args: ["server/server.mjs"],
        cwd: ".",
        lifecycle: "service",
        readiness: { url: "http://127.0.0.1:3001/api/health", expectedStatus: 200 },
      }, callId(61))),
      policyStep(toolCompletion("run_process", {
        program: "npm",
        args: ["test"],
        cwd: ".",
      }, callId(62))),
      policyStep(textCompletion("目录、安装、构建、3001 readiness、API 与页面检查均已完成。")),
    ]);
    const previousPort = process.env.PORT;
    process.env.PORT = "3000";
    try {
      const item = await setup(model, { emptyWorkspace: true });
      item.io.push("/plan on");
      item.io.push("在空工作区创建并验收本地 Web 项目");
      await vi.waitFor(async () => {
        expect((await item.events()).some((event) => event.type === "plan.proposed"))
          .toBe(true);
      }, { timeout: 10_000 });
      item.io.push("/approve-plan 阶段19确定性计划批准");
      await approveRequiredTool(item, 1);
      await approveRequiredTool(item, 2);
      await approveRequiredTool(item, 3);
      await waitForCompletion(item);

      const events = await item.events();
      expectPolicyRequests(model);
      expect(events.filter((event) => event.type === "run.started")).toHaveLength(1);
      expect(JSON.stringify(events)).not.toContain("WORKSPACE_PARENT_NOT_FOUND");
      const requests = events.filter((event) => event.type === "tool.requested");
      const firstWrite = requests.findIndex((event) => event.data.toolName === "write_file");
      const mkdirRequest = requests.findIndex((event) =>
        event.data.toolName === "run_process" && event.data.publicArguments.program === "mkdir"
      );
      const refreshedListing = requests.findIndex((event, index) =>
        index > mkdirRequest && event.data.toolName === "list_directory"
      );
      expect(mkdirRequest).toBeGreaterThanOrEqual(0);
      expect(refreshedListing).toBeGreaterThan(mkdirRequest);
      expect(firstWrite).toBeGreaterThan(refreshedListing);
      const processArgs = requests
        .filter((event) => event.data.toolName === "run_process")
        .flatMap((event) => Array.isArray(event.data.publicArguments.args)
          ? event.data.publicArguments.args
          : []);
      expect(processArgs).not.toEqual(expect.arrayContaining(["|", "&&", "$PORT", ">", "$()"]));
      await expect(readFile(path.join(item.workspace, "server/server.mjs"), "utf8"))
        .resolves.toContain("process.env.SERVER_PORT || 3001");
      await expect(readFile(path.join(item.workspace, "client/proxy.ts"), "utf8"))
        .resolves.toContain("127.0.0.1:3001");
      await expect(readFile(path.join(item.workspace, "README.md"), "utf8"))
        .resolves.toContain("127.0.0.1:3001");
      expect(JSON.stringify(events)).toContain("http://127.0.0.1:3001/api/health");
    } finally {
      if (previousPort === undefined) delete process.env.PORT;
      else process.env.PORT = previousPort;
    }
  }, 10_000);

  it("bounds a wrong empty-workspace write batch and recovers in the same run", async () => {
    const initialWrites = Array.from({ length: 6 }, (_, index) => ({
      id: callId(70 + index),
      name: "write_file",
      arguments: { path: `server/file-${index + 1}.txt`, content: `value-${index + 1}\n` },
    }));
    const recoveredWrites = initialWrites.map((call, index) => ({
      ...call,
      id: callId(80 + index),
    }));
    const model = new QueueFakeModel([
      policyStep(toolCompletion("list_directory", { path: ".", depth: 1 }, callId(69))),
      policyStep(multipleToolCompletion(initialWrites)),
      policyStep(toolCompletion("run_process", {
        program: "mkdir",
        args: ["-p", "server"],
        cwd: ".",
      }, callId(76))),
      policyStep(toolCompletion("list_directory", { path: ".", depth: 2 }, callId(77))),
      policyStep(multipleToolCompletion(recoveredWrites)),
      policyStep(textCompletion("同一 run 已创建目录并完成有限恢复。")),
    ]);
    const item = await setup(model, { emptyWorkspace: true });
    item.io.push("错误轨迹后在同一 run 恢复");
    await approveRequiredTool(item, 1);
    await waitForCompletion(item);

    const events = await item.events();
    expect(events.filter((event) => event.type === "run.started")).toHaveLength(1);
    const writeResults = events
      .filter(isToolResultEvent)
      .filter((event) => event.data.toolName === "write_file");
    expect(writeResults).toHaveLength(12);
    expect(writeResults.slice(0, 6).every((event) =>
      event.data.result.error?.code === "WORKSPACE_PARENT_NOT_FOUND"
    )).toBe(true);
    expect(writeResults.slice(1, 6).every((event) =>
      event.data.result.metadata?.preflightSuppressed === true
    )).toBe(true);
    expect(writeResults.slice(6).every((event) => event.data.result.ok)).toBe(true);
    for (let index = 1; index <= 6; index += 1) {
      await expect(readFile(path.join(item.workspace, `server/file-${index}.txt`), "utf8"))
        .resolves.toBe(`value-${index}\n`);
    }
  });
});
