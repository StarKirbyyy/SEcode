import { afterEach, describe, expect, it } from "vitest";

import { nativeAgentRuntimeDependencies } from "@/lib/agent/dependencies";
import { createAgentRuntimeWithDependencies } from "@/lib/agent/runtime";
import { ModelLayerError } from "@/lib/model";
import { createContextError } from "@/lib/context/errors";
import type { JsonObject } from "@/lib/domain";

import {
  RUN_ID,
  QueueModelClient,
  createAgentFixture,
  createModelContinuation,
  createStaticContextProvider,
  createTextCompletion,
  createToolCompletion,
  removeAgentTemporaryDirectories,
} from "./helpers";

afterEach(removeAgentTemporaryDirectories);

describe("Agent text completion runtime", () => {
  it("skips only later validators in the same cwd after a batch failure", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const call = (id: number, cwd: string, script: string) => ({
      ok: true as const,
      call: {
        id: `26100000-0000-4000-8000-${String(id).padStart(12, "0")}`,
        name: "run_process",
        arguments: {
          program: "npm",
          args: ["run", script],
          cwd,
          lifecycle: "oneshot",
        },
      },
    });
    const model = new QueueModelClient([
      createToolCompletion([
        call(1, "server", "typecheck"),
        call(2, "server", "test"),
        call(3, "client", "typecheck"),
        {
          ok: true,
          call: {
            id: "26100000-0000-4000-8000-000000000004",
            name: "run_process",
            arguments: {
              program: "node",
              args: ["-e", "console.log('not a validator')"],
              cwd: "server",
              lifecycle: "oneshot",
            },
          },
        },
      ]),
      createTextCompletion("验证批次已按依赖处理。"),
    ]);
    let uuid = 2_300;
    let executions = 0;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () =>
          `23000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
        executeAuthorizedLocalTool: async () => {
          executions += 1;
          return executions === 1
            ? {
                ok: false,
                summary: "类型检查失败",
                error: {
                  code: "PROCESS_EXIT_NONZERO",
                  message: "退出非零",
                  recoverable: true,
                },
              }
            : { ok: true, summary: "客户端类型检查通过" };
        },
      },
    );

    const outcome = await (await runtime.startRun({
      sessionId,
      prompt: "批量验证前后端",
      permissionMode: "full",
    })).completion;
    expect(outcome).toMatchObject({ status: "completed", modelRequests: 2, toolCalls: 4 });
    expect(executions).toBe(3);
    const events = (await fixture.store.readEvents(sessionId)).events;
    const results = events.filter((event) => event.type === "tool.result");
    expect(results).toHaveLength(4);
    expect(results[1]).toMatchObject({
      data: {
        toolCallId: "26100000-0000-4000-8000-000000000002",
        result: {
          ok: false,
          metadata: { skipped: true, reason: "prior_validator_failed" },
          error: {
            code: "VALIDATION_BATCH_SKIPPED",
            details: {
              cwd: "server",
              blockedByToolCallId: "26100000-0000-4000-8000-000000000001",
            },
          },
        },
      },
    });
    expect(events.some((event) =>
      event.type === "tool.started" &&
      event.data.toolCallId === "26100000-0000-4000-8000-000000000002"
    )).toBe(false);
    expect(results[2]).toMatchObject({ data: { result: { ok: true } } });
    expect(results[3]).toMatchObject({ data: { result: { ok: true } } });
  });

  it("injects convergence only when facts change and finishes immediately after readiness", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const url = "http://127.0.0.1:43120/";
    const call = (id: number, name: string, arguments_: JsonObject) => ({
      ok: true as const,
      call: {
        id: `26000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
        name,
        arguments: arguments_,
      },
    });
    const model = new QueueModelClient([
      createToolCompletion([call(1, "write_file", {
        path: "server/a.ts",
        content: "export {};",
      })]),
      async (request) => {
        const visible = request.messages.map((message) => message.content).join("\n");
        expect(visible).toContain("收敛状态更新");
        expect(visible).toContain("server/a.ts");
        return createToolCompletion([call(2, "read_file", { path: "server/a.ts" })]);
      },
      async (request) => {
        const visible = request.messages.map((message) => message.content).join("\n");
        expect(visible).not.toContain("收敛状态更新");
        return createToolCompletion([call(3, "run_process", {
          program: "npm",
          args: ["test"],
          cwd: "server",
          lifecycle: "oneshot",
        })]);
      },
      async (request) => {
        const visible = request.messages.map((message) => message.content).join("\n");
        expect(visible).toContain("当前有效验证：test@server");
        return createToolCompletion([call(4, "run_process", {
          program: "node",
          args: ["server.mjs"],
          cwd: "server",
          lifecycle: "service",
          readiness: { url },
        })]);
      },
      async (request) => {
        const visible = request.messages.map((message) => message.content).join("\n");
        expect(visible).toContain("直接给出最终回答");
        expect(visible).toContain(url);
        return createTextCompletion(`测试通过。启动：node server.mjs；访问：${url}`);
      },
    ]);
    let uuid = 2_400;
    let executions = 0;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () =>
          `24000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
        executeAuthorizedLocalTool: async () => {
          executions += 1;
          return executions === 4
            ? { ok: true, summary: "服务已就绪", metadata: { ready: true } }
            : { ok: true, summary: "工具完成" };
        },
      },
    );

    const outcome = await (await runtime.startRun({
      sessionId,
      prompt: "修改、验证并启动服务",
      permissionMode: "full",
    })).completion;
    expect(outcome).toMatchObject({ status: "completed", modelRequests: 5, toolCalls: 4 });
  });

  it("requests one final correction when a ready service URL is missing", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const url = "http://127.0.0.1:43121/";
    const model = new QueueModelClient([
      createToolCompletion([{
        ok: true,
        call: {
          id: "25000000-0000-4000-8000-000000000101",
          name: "run_process",
          arguments: {
            program: "node",
            args: ["server.mjs", "--token", "private-token"],
            cwd: ".",
            lifecycle: "service",
            readiness: { url },
          },
        },
      }]),
      createTextCompletion("服务已经启动。"),
      async (request) => {
        const visible = request.messages.map((message) => message.content).join("\n");
        expect(visible).toContain(url);
        expect(visible).not.toContain("private-token");
        return createTextCompletion(`启动：node server.mjs；访问：${url}`);
      },
    ]);
    let uuid = 2_500;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () =>
          `25000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
        executeAuthorizedLocalTool: async () => ({
          ok: true,
          summary: "服务已就绪",
          metadata: { ready: true },
        }),
      },
    );

    const outcome = await (await runtime.startRun({
      sessionId,
      prompt: "启动服务并给出链接",
      permissionMode: "full",
    })).completion;
    expect(outcome).toMatchObject({ status: "completed", modelRequests: 3 });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.filter((event) =>
      event.type === "assistant.message" && event.data.kind === "final"
    )).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ content: expect.stringContaining(url) }) }),
    ]);
  });

  it("completes with a warning after one correction when the latest service attempt failed", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([
      createToolCompletion([{
        ok: true,
        call: {
          id: "25000000-0000-4000-8000-000000000111",
          name: "run_process",
          arguments: {
            program: "node",
            args: ["server.mjs"],
            cwd: ".",
            lifecycle: "service",
            readiness: { url: "http://127.0.0.1:43122/" },
          },
        },
      }]),
      createTextCompletion("服务已经完成。"),
      createTextCompletion("再次确认服务已经完成。"),
    ]);
    let uuid = 2_600;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () =>
          `26000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
        executeAuthorizedLocalTool: async () => ({
          ok: false,
          summary: "服务启动失败",
          error: {
            code: "PROCESS_EXIT_NONZERO",
            message: "进程退出非零",
            recoverable: true,
          },
        }),
      },
    );

    const outcome = await (await runtime.startRun({
      sessionId,
      prompt: "启动服务",
      permissionMode: "full",
    })).completion;
    expect(outcome).toMatchObject({ status: "completed", modelRequests: 3 });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.some((event) => event.type === "run.completed")).toBe(true);
    expect(events.find((event) =>
      event.type === "assistant.message" && event.data.kind === "final"
    )).toMatchObject({
      data: { content: expect.stringMatching(/服务未成功启动.*PROCESS_EXIT_NONZERO/u) },
    });
  });

  it("checks completion evidence before requesting the service URL", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const url = "http://127.0.0.1:43123/";
    const call = (id: number, name: string, arguments_: JsonObject) => ({
      ok: true as const,
      call: {
        id: `25000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
        name,
        arguments: arguments_,
      },
    });
    const model = new QueueModelClient([
      createToolCompletion([
        call(121, "write_file", { path: "src/a.ts", content: "export {};" }),
        call(122, "run_process", {
          program: "node",
          args: ["server.mjs"],
          cwd: ".",
          lifecycle: "service",
          readiness: { url },
        }),
      ]),
      createTextCompletion("任务完成。"),
      async (request) => {
        const visible = request.messages.map((message) => message.content).join("\n");
        expect(visible).toContain("仍缺少结构化验证");
        expect(visible).not.toContain("最终回答缺少已验证的访问链接");
        return createToolCompletion([call(123, "run_process", {
          program: "pnpm",
          args: ["test"],
          cwd: ".",
        })]);
      },
      createTextCompletion("代码已经验证，服务也已启动。"),
      async (request) => {
        const visible = request.messages.map((message) => message.content).join("\n");
        expect(visible).toContain("最终回答缺少已验证的访问链接");
        expect(visible).toContain(url);
        return createTextCompletion(`启动：node server.mjs；访问：${url}`);
      },
    ]);
    let uuid = 2_700;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () =>
          `27000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
        executeAuthorizedLocalTool: async () => ({
          ok: true,
          summary: "工具完成",
          metadata: { ready: true },
        }),
      },
    );

    await expect((await runtime.startRun({
      sessionId,
      prompt: "修改、验证并启动服务",
      permissionMode: "full",
    })).completion).resolves.toMatchObject({ status: "completed", modelRequests: 5 });
  });

  it("accepts a directly executed pending verification script as exact client evidence", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const call = (id: number, name: string, arguments_: JsonObject) => ({
      ok: true as const,
      call: {
        id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
        name,
        arguments: arguments_,
      },
    });
    const model = new QueueModelClient([
      createToolCompletion([call(801, "write_file", { path: "client/app.ts", content: "export {};" })]),
      createToolCompletion([call(802, "run_process", { program: "pnpm", args: ["build"], cwd: "client" })]),
      createToolCompletion([call(803, "write_file", { path: "client/verify-integration.mjs", content: "export {};" })]),
      createToolCompletion([call(804, "run_process", { program: "node", args: ["verify-integration.mjs"], cwd: "client" })]),
      createTextCompletion("集成验证已经完成。"),
    ]);
    let uuid = 1_200;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => `00000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
        executeAuthorizedLocalTool: async () => ({ ok: true, summary: "工具完成" }),
      },
    );

    const outcome = await (await runtime.startRun({
      sessionId,
      prompt: "构建客户端并增加集成验证脚本",
      permissionMode: "full",
    })).completion;
    expect(outcome).toMatchObject({ status: "completed", modelRequests: 5, toolCalls: 4 });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.some((event) => event.type === "completion.evidence.rejected")).toBe(false);
  });

  it("combines server and client validation scopes before accepting completion", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const call = (id: number, name: string, arguments_: JsonObject) => ({
      ok: true as const,
      call: {
        id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
        name,
        arguments: arguments_,
      },
    });
    const model = new QueueModelClient([
      createToolCompletion([
        call(481, "write_file", { path: "server/a.ts", content: "export {};" }),
        call(482, "write_file", { path: "client/b.ts", content: "export {};" }),
      ]),
      createToolCompletion([call(483, "run_process", {
        program: "pnpm", args: ["test"], cwd: "server", lifecycle: "oneshot",
      })]),
      createToolCompletion([call(484, "run_process", {
        program: "pnpm", args: ["build"], cwd: "client", lifecycle: "oneshot",
      })]),
      createTextCompletion("前后端验证均已完成。"),
    ]);
    let uuid = 980;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => `00000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
        executeAuthorizedLocalTool: async () => ({ ok: true, summary: "工具完成" }),
      },
    );

    const outcome = await (await runtime.startRun({
      sessionId,
      prompt: "修改前后端",
      permissionMode: "full",
    })).completion;
    expect(outcome).toMatchObject({ status: "completed", modelRequests: 4 });
    const rejections = (await fixture.store.readEvents(sessionId)).events.filter(
      (event) => event.type === "completion.evidence.rejected",
    );
    expect(rejections).toHaveLength(0);
  });

  it("persists the full text completion trajectory", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([
      {
        ...createTextCompletion("已完成修复"),
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          reasoningTokens: 99,
        },
      },
    ]);
    const events: unknown[] = [];
    let now = 100;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        monotonicNow: () => {
          const value = now;
          now += 50;
          return value;
        },
      },
    );

    const handle = await runtime.startRun(
      { sessionId, prompt: "修复 sk-abcdefghijklmnopqrstuvwxyz" },
      { onEvent: (event) => { events.push(event); } },
    );
    const outcome = await handle.completion;
    const stored = (await fixture.store.readEvents(sessionId)).events;

    expect(outcome).toMatchObject({
      status: "completed",
      iterations: 1,
      durationMs: 50,
    });
    expect(stored.map((event) => event.type)).toEqual([
      "session.created",
      "run.started",
      "user.message",
      "model.requested",
      "model.completed",
      "assistant.message",
      "run.completed",
    ]);
    expect(JSON.stringify(stored)).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(stored[4]).toMatchObject({
      data: {
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          reasoningTokens: 99,
        },
      },
    });
    expect(JSON.stringify(stored[4])).not.toContain("PRIVATE_REASONING");
    expect(events.some((event) =>
      (event as { type?: string }).type === "assistant.delta"
    )).toBe(true);
    expect(runtime.getActiveRun(handle.runId)).toBeUndefined();
  });

  it("publishes safe redacted deltas before model completion", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const secret = "sk-abcdefghijklmnopqrstuvwxyz";
    const model = new QueueModelClient([
      async (request) => {
        await request.onTextDelta?.("正在检查 sk-");
        await request.onTextDelta?.("abcdefghijklmnopqrstuvwxyz");
        await request.onTextDelta?.("，请稍候。");
        return createTextCompletion(`正在检查 ${secret}，请稍候。`);
      },
    ]);
    const delivered: unknown[] = [];
    let uuid = 700;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () =>
          `00000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
      },
    );

    const handle = await runtime.startRun(
      { sessionId, prompt: "检查项目" },
      { onEvent: (event) => { delivered.push(event); } },
    );
    await expect(handle.completion).resolves.toMatchObject({ status: "completed" });

    const deltaIndex = delivered.findIndex((event) =>
      (event as { type?: string }).type === "assistant.delta"
    );
    const completedIndex = delivered.findIndex((event) =>
      (event as { type?: string }).type === "model.completed"
    );
    expect(deltaIndex).toBeGreaterThanOrEqual(0);
    expect(deltaIndex).toBeLessThan(completedIndex);
    const visible = delivered
      .filter((event) =>
        (event as { type?: string }).type === "assistant.delta"
      )
      .map((event) =>
        (event as { data?: { content?: string } }).data?.content ?? ""
      )
      .join("");
    expect(visible).toContain("[REDACTED]");
    expect(JSON.stringify(delivered)).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("requires successful post-change validation before completing", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([
      createToolCompletion([{
        ok: true,
        call: {
          id: "00000000-0000-4000-8000-000000000451",
          name: "write_file",
          arguments: { path: "src/a.ts", content: "export const a = 1;" },
        },
      }]),
      createTextCompletion("修改已经完成。"),
      createToolCompletion([{
        ok: true,
        call: {
          id: "00000000-0000-4000-8000-000000000452",
          name: "run_process",
          arguments: { program: "pnpm", args: ["test"], cwd: ".", timeoutMs: 1_000 },
        },
      }]),
      createTextCompletion("修改和验证均已完成。"),
    ]);
    let uuid = 800;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () =>
          `00000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
        executeAuthorizedLocalTool: async () => ({ ok: true, summary: "工具完成" }),
      },
    );

    const outcome = await (await runtime.startRun({
      sessionId,
      prompt: "修改代码",
      permissionMode: "full",
    })).completion;
    expect(outcome).toMatchObject({ status: "completed", modelRequests: 4 });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.filter((event) => event.type === "completion.evidence.rejected"))
      .toHaveLength(1);
    expect(events.find((event) => event.type === "completion.evidence.rejected")?.data)
      .toMatchObject({
        correctionAttempt: 1,
        missing: ["post_change_verification"],
        uncoveredScopes: ["src"],
        uncoveredPaths: ["src/a.ts"],
        uncoveredPathCount: 1,
        uncoveredPathsTruncated: false,
      });
  });

  it("completes with a verification warning after one bounded correction", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([
      createToolCompletion([{
        ok: true,
        call: {
          id: "00000000-0000-4000-8000-000000000461",
          name: "write_file",
          arguments: { path: "src/a.ts", content: "export const a = 1;" },
        },
      }]),
      createTextCompletion("修改完成。"),
      createTextCompletion("已经完成。"),
    ]);
    let uuid = 900;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () =>
          `00000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
        executeAuthorizedLocalTool: async () => ({ ok: true, summary: "工具完成" }),
      },
    );

    const outcome = await (await runtime.startRun({
      sessionId,
      prompt: "修改代码",
      permissionMode: "full",
    })).completion;
    expect(outcome).toMatchObject({ status: "completed", modelRequests: 3 });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.filter((event) => event.type === "completion.evidence.rejected"))
      .toHaveLength(1);
    expect(events.find((event) => event.type === "assistant.message" && event.data.kind === "final"))
      .toMatchObject({
        data: { content: expect.stringMatching(/验证未完整.*src\/a\.ts/u) },
      });
  });

  it("replays the latest post-test mutation and completes after four diagnostic requests", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const search = (id: number, query: string) => createToolCompletion([{
      ok: true as const,
      call: {
        id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
        name: "search_text",
        arguments: { query, path: "." },
      },
    }]);
    const model = new QueueModelClient([
      createToolCompletion([{
        ok: true,
        call: {
          id: "00000000-0000-4000-8000-000000000491",
          name: "write_file",
          arguments: { path: "server/server.js", content: "export const version = 1;" },
        },
      }]),
      createToolCompletion([{
        ok: true,
        call: {
          id: "00000000-0000-4000-8000-000000000496",
          name: "run_process",
          arguments: { program: "npm", args: ["test"], cwd: "." },
        },
      }]),
      createToolCompletion([{
        ok: true,
        call: {
          id: "00000000-0000-4000-8000-000000000497",
          name: "write_file",
          arguments: { path: "server/server.js", content: "export const version = 2;" },
        },
      }]),
      createTextCompletion("六项测试此前通过，修改完成。"),
      search(492, "one"),
      search(493, "two"),
      search(494, "three"),
      search(495, "four"),
      createTextCompletion("搜索结束，交付当前修改。"),
    ]);
    let uuid = 990;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => `00000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
        executeAuthorizedLocalTool: async () => ({ ok: true, summary: "工具完成" }),
      },
    );

    const outcome = await (await runtime.startRun({
      sessionId,
      prompt: "修改代码后只搜索",
      permissionMode: "full",
    })).completion;
    expect(outcome).toMatchObject({ status: "completed", modelRequests: 9 });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.filter((event) => event.type === "completion.evidence.rejected"))
      .toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("AGENT_COMPLETION_EVIDENCE_MISSING");
  });

  it("stops after the third identical validator failure across successful mutations", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const tool = (id: number, name: string, arguments_: JsonObject) =>
      createToolCompletion([{
        ok: true as const,
        call: {
          id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
          name,
          arguments: arguments_,
        },
      }]);
    const typecheck = (id: number) => tool(id, "run_process", {
      program: "pnpm",
      args: ["typecheck"],
      cwd: ".",
      lifecycle: "oneshot",
    });
    const model = new QueueModelClient([
      typecheck(701),
      tool(702, "write_file", { path: "src/a.ts", content: "export const a = 1;" }),
      typecheck(703),
      tool(704, "write_file", { path: "src/a.ts", content: "export const a = 2;" }),
      typecheck(705),
    ]);
    let uuid = 1_100;
    let executionIndex = 0;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => `00000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
        executeAuthorizedLocalTool: async () => {
          executionIndex += 1;
          return executionIndex % 2 === 1
            ? {
                ok: false,
                summary: "进程退出码非零",
                output: "src/a.ts(1,1): error TS2322",
                error: {
                  code: "PROCESS_EXIT_NONZERO",
                  message: "进程退出码非零",
                  recoverable: true,
                },
              }
            : { ok: true, summary: "工具完成" };
        },
      },
    );

    const outcome = await (await runtime.startRun({
      sessionId,
      prompt: "修复类型错误",
      permissionMode: "full",
    })).completion;
    expect(outcome).toMatchObject({
      status: "failed",
      modelRequests: 5,
      toolCalls: 5,
      error: {
        code: "AGENT_VALIDATION_NO_PROGRESS",
        details: { verificationKind: "typecheck", failedAttempts: 3 },
      },
    });
    const warnings = (await fixture.store.readEvents(sessionId)).events.filter(
      (event) => event.type === "validation.repair.warning",
    );
    expect(warnings).toHaveLength(2);
    expect(warnings.at(-1)?.data).toMatchObject({
      repeatedDiagnostic: true,
      mutatedPaths: ["src/a.ts"],
    });
  });

  it("auto-resolves high-risk tools when the workspace has full permission", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([
      createToolCompletion([{
        ok: true,
        call: {
          id: "00000000-0000-4000-8000-000000000401",
          name: "run_process",
          arguments: { program: "custom-tool", args: ["check"] },
        },
      }]),
      createTextCompletion("已完成"),
    ]);
    const runtime = createAgentRuntimeWithDependencies(
      { eventStore: fixture.store, modelClient: model, contextProvider: createStaticContextProvider() },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => RUN_ID,
        executeAuthorizedLocalTool: async () => ({ ok: true, summary: "工具完成" }),
      },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task", permissionMode: "full" });
    await expect(handle.completion).resolves.toMatchObject({ status: "completed" });
    const types = (await fixture.store.readEvents(sessionId)).events.map((event) => event.type);
    expect(types).toContain("approval.required");
    expect(types).toContain("approval.resolved");
    expect(runtime.getActiveRun(RUN_ID)).toBeUndefined();
  });

  it("commits a context compaction before requesting the model", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([createTextCompletion()]),
        contextProvider: {
          async buildContext() {
            return {
              messages: [{ role: "user", content: "task" }],
              compaction: {
                throughSeq: 1,
                summary: "已知目标",
                retainedRange: { fromSeq: 2, toSeq: 3 },
              },
            };
          },
        },
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );

    const handle = await runtime.startRun({ sessionId, prompt: "task" });
    await handle.completion;
    expect((await fixture.store.readEvents(sessionId)).events.map((event) => event.type))
      .toEqual([
        "session.created",
        "run.started",
        "user.message",
        "context.compacted",
        "model.requested",
        "model.completed",
        "assistant.message",
        "run.completed",
      ]);
    expect((await fixture.store.readEvents(sessionId)).events.find(
      (event) => event.type === "context.compacted",
    )?.data).toMatchObject({ strategy: "model" });
  });

  it("maps context, model and oversized output failures", async () => {
    const cases = [
      {
        provider: { async buildContext() { throw new Error("context private"); } },
        model: new QueueModelClient([]),
        code: "AGENT_CONTEXT_FAILED",
      },
      {
        provider: createStaticContextProvider(),
        model: new QueueModelClient([
          new ModelLayerError({
            code: "MODEL_TIMEOUT",
            message: "模型请求超时",
            recoverable: true,
          }),
        ]),
        code: "MODEL_TIMEOUT",
      },
      {
        provider: createStaticContextProvider(),
        model: new QueueModelClient([createTextCompletion("x".repeat(1_048_577))]),
        code: "AGENT_ASSISTANT_MESSAGE_TOO_LARGE",
      },
    ];

    for (const testCase of cases) {
      const fixture = await createAgentFixture();
      const sessionId = (await fixture.store.listSessions())[0].id;
      const runtime = createAgentRuntimeWithDependencies(
        {
          eventStore: fixture.store,
          modelClient: testCase.model,
          contextProvider: testCase.provider,
        },
        { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
      );
      const handle = await runtime.startRun({ sessionId, prompt: "task" });
      await expect(handle.completion).resolves.toMatchObject({
        status: "failed",
        error: { code: testCase.code },
      });
    }
  });

  it("preserves only finite safe context failure details", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([]),
        contextProvider: {
          async buildContext() {
            throw createContextError(
              "CONTEXT_BUDGET_EXCEEDED",
              "private /Users/secret/path",
              { reason: "fallback_over_budget", profileId: "secret-profile" },
            );
          },
        },
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );

    const outcome = await (await runtime.startRun({ sessionId, prompt: "继续" })).completion;
    expect(outcome).toMatchObject({
      status: "failed",
      error: {
        code: "AGENT_CONTEXT_FAILED",
        details: {
          contextCode: "CONTEXT_BUDGET_EXCEEDED",
          reason: "fallback_over_budget",
        },
      },
    });
    expect(JSON.stringify(outcome)).not.toContain("secret-profile");
    expect(JSON.stringify(outcome)).not.toContain("/Users/secret");
  });

  it("preserves the finite projected recent-rounds budget reason", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([]),
        contextProvider: {
          async buildContext() {
            throw createContextError(
              "CONTEXT_BUDGET_EXCEEDED",
              "private oversized history",
              {
                reason: "projected_recent_rounds_over_budget",
                estimatedTokens: 999_999,
              },
            );
          },
        },
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: () => RUN_ID },
    );

    const outcome = await (await runtime.startRun({ sessionId, prompt: "继续" })).completion;
    expect(outcome).toMatchObject({
      status: "failed",
      error: {
        code: "AGENT_CONTEXT_FAILED",
        details: {
          contextCode: "CONTEXT_BUDGET_EXCEEDED",
          reason: "projected_recent_rounds_over_budget",
        },
      },
    });
    expect(JSON.stringify(outcome)).not.toContain("999999");
    expect(JSON.stringify(outcome)).not.toContain("private oversized");
  });

  it("passes only in-memory continuation to a later request", async () => {
    const continuation = createModelContinuation();
    const first = {
      content: null,
      toolCalls: [
        {
          ok: false as const,
          id: "00000000-0000-4000-8000-000000000155",
          name: null,
          rawArgumentsPreview: "{bad",
          error: {
            code: "MODEL_INVALID_TOOL_CALL",
            message: "invalid",
            recoverable: true,
          },
        },
      ],
      finishReason: "tool_calls" as const,
      continuation,
    };
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0].id;
    const model = new QueueModelClient([first, createTextCompletion()]);
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

    expect(model.requests[0].continuation).toBeUndefined();
    expect(model.requests[1].continuation).toBe(continuation);
    expect(JSON.stringify((await fixture.store.readEvents(sessionId)).events))
      .not.toContain("continuation");
  });
});
