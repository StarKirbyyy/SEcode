import { readFile, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { nativeAgentRuntimeDependencies } from "@/lib/agent/dependencies";
import { createAgentRuntimeWithDependencies } from "@/lib/agent/runtime";

import {
  QueueModelClient,
  createAgentFixture,
  createStaticContextProvider,
  createTextCompletion,
  createToolCompletion,
  removeAgentTemporaryDirectories,
} from "./helpers";

afterEach(removeAgentTemporaryDirectories);

function uuidSequence() {
  let value = 700;
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

const readCall = {
  ok: true as const,
  call: {
    id: "00000000-0000-4000-8000-000000000701",
    name: "read_file",
    arguments: { path: "task.txt", startLine: 1 },
  },
};

const writeCall = {
  ok: true as const,
  call: {
    id: "00000000-0000-4000-8000-000000000702",
    name: "write_file",
    arguments: { path: "result.txt", content: "done\n" },
  },
};

describe("Agent optional Plan Mode", () => {
  it("plans read-only, pauses, then executes in the same run after approval", async () => {
    const fixture = await createAgentFixture();
    await writeFile(`${fixture.workspace}/task.txt`, "inspect me\n", "utf8");
    const sessionId = (await fixture.store.listSessions())[0]!.id;
    const model = new QueueModelClient([
      createToolCompletion([readCall]),
      createTextCompletion("目标：完成结果文件\n事实：已读取 task.txt\n任务：写 result.txt\n验证：重新读取结果\n风险：无\n不执行：不安装依赖"),
      createToolCompletion([writeCall]),
      createTextCompletion("计划已执行并验证。"),
    ]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: uuidSequence() },
    );

    const handle = await runtime.startRun({
      sessionId,
      prompt: "创建结果文件",
      planningEnabled: true,
    });
    await vi.waitFor(() => {
      expect(runtime.getActiveRun(handle.runId)?.status).toBe("awaiting_plan_approval");
    });
    const pending = runtime.getActiveRun(handle.runId)?.pendingPlanApproval;
    expect(pending?.content).toContain("任务：写 result.txt");
    await expect(readFile(`${fixture.workspace}/result.txt`, "utf8")).rejects.toBeDefined();

    await expect(runtime.resolvePlanApproval(
      handle.runId,
      pending!.approvalId,
      { planId: pending!.planId, approved: true },
    )).resolves.toEqual({ status: "resolved", approved: true });
    await expect(handle.completion).resolves.toMatchObject({
      status: "completed",
      runId: handle.runId,
      modelRequests: 4,
      toolCalls: 2,
    });
    await expect(readFile(`${fixture.workspace}/result.txt`, "utf8")).resolves.toBe("done\n");

    expect(model.requests[0]!.tools.map((item) => item.function.name)).toEqual([
      "list_directory",
      "read_file",
      "search_text",
    ]);
    expect(model.requests[2]!.tools).toHaveLength(6);
    expect(model.requests[2]!.continuation).toBeUndefined();
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "plan.proposed",
      "plan.approval.resolved",
      "tool.started",
      "run.completed",
    ]));
    expect(events.findIndex((event) => event.type === "plan.approval.resolved"))
      .toBeLessThan(events.findIndex((event) => event.type === "tool.started" && event.data.toolName === "write_file"));
  });

  it("reuses a complete planning listing for write preflight after plan approval", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0]!.id;
    const authorize = vi.fn(nativeAgentRuntimeDependencies.requestLocalToolAuthorization);
    const execute = vi.fn(nativeAgentRuntimeDependencies.executeAuthorizedLocalTool);
    const model = new QueueModelClient([
      createToolCompletion([{
        ok: true,
        call: {
          id: "00000000-0000-4000-8000-000000000711",
          name: "list_directory",
          arguments: { path: ".", depth: 1 },
        },
      }]),
      createTextCompletion("目标：创建 server 文件\n事实：根目录为空\n任务：先创建目录再写入\n验证：读取结果\n风险：父目录缺失\n不执行：不安装依赖"),
      createToolCompletion([{
        ok: true,
        call: {
          id: "00000000-0000-4000-8000-000000000712",
          name: "write_file",
          arguments: { path: "server/index.ts", content: "export {};\n" },
        },
      }]),
      createToolCompletion([{
        ok: true,
        call: {
          id: "00000000-0000-4000-8000-000000000713",
          name: "run_process",
          arguments: { program: "mkdir", args: ["server"], cwd: "." },
        },
      }]),
      createTextCompletion("已收到父目录缺失诊断。"),
      createTextCompletion("父目录仍未创建。"),
    ]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: uuidSequence(),
        requestLocalToolAuthorization: authorize,
        executeAuthorizedLocalTool: execute,
      },
    );
    const handle = await runtime.startRun({
      sessionId,
      prompt: "先规划再创建 server 文件",
      planningEnabled: true,
      permissionMode: "full",
    });
    await vi.waitFor(() => expect(runtime.getActiveRun(handle.runId)?.pendingPlanApproval).toBeDefined());
    const pending = runtime.getActiveRun(handle.runId)!.pendingPlanApproval!;
    await runtime.resolvePlanApproval(handle.runId, pending.approvalId, {
      planId: pending.planId,
      approved: true,
    });
    await expect(handle.completion).resolves.toMatchObject({
      status: "failed",
      error: { code: "AGENT_WRITE_DEPENDENCY_UNRESOLVED" },
    });

    expect(authorize).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.find(
      (event) => event.type === "tool.result" && event.data.toolName === "write_file",
    )).toMatchObject({
      data: { result: { error: { code: "WORKSPACE_PARENT_NOT_FOUND" } } },
    });
    await expect(readFile(`${fixture.workspace}/server/index.ts`, "utf8"))
      .rejects.toBeDefined();
  });

  it("rejects a proposed plan with zero execution", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0]!.id;
    const model = new QueueModelClient([createTextCompletion("目标：创建文件\n任务：写 result.txt\n验证：读取\n风险：无\n不执行：安装")]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: uuidSequence() },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task", planningEnabled: true });
    await vi.waitFor(() => expect(runtime.getActiveRun(handle.runId)?.pendingPlanApproval).toBeDefined());
    const pending = runtime.getActiveRun(handle.runId)!.pendingPlanApproval!;
    await runtime.resolvePlanApproval(handle.runId, pending.approvalId, {
      planId: pending.planId,
      approved: false,
      reason: "不执行",
    });
    await expect(handle.completion).resolves.toMatchObject({
      status: "cancelled",
      reason: "用户拒绝执行计划",
      modelRequests: 1,
      toolCalls: 0,
    });
    expect(model.requests).toHaveLength(1);
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.at(-2)).toMatchObject({ type: "plan.approval.resolved", data: { approved: false } });
    expect(events.at(-1)).toMatchObject({ type: "run.cancelled" });
    expect(events.some((event) => event.type === "tool.requested")).toBe(false);
  });

  it("denies a forged write during planning before prepare or authorization", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0]!.id;
    const prepare = vi.fn(nativeAgentRuntimeDependencies.prepareLocalToolCall);
    const execute = vi.fn(nativeAgentRuntimeDependencies.executeAuthorizedLocalTool);
    const model = new QueueModelClient([
      createToolCompletion([writeCall]),
      createTextCompletion("目标：写文件\n事实：写工具被规划能力门拒绝\n任务：批准后写入\n验证：读取\n风险：无\n不执行：安装"),
    ]);
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: model,
        contextProvider: createStaticContextProvider(),
      },
      {
        ...nativeAgentRuntimeDependencies,
        randomUUID: uuidSequence(),
        prepareLocalToolCall: prepare,
        executeAuthorizedLocalTool: execute,
      },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task", planningEnabled: true });
    await vi.waitFor(() => expect(runtime.getActiveRun(handle.runId)?.pendingPlanApproval).toBeDefined());
    expect(prepare).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    await expect(readFile(`${fixture.workspace}/result.txt`, "utf8")).rejects.toBeDefined();
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.find((event) => event.type === "tool.result")).toMatchObject({
      data: {
        result: {
          summary: "规划阶段禁止使用此工具",
          error: {
            code: "TOOL_PHASE_DENIED",
            message: "规划阶段仅允许使用目录列表、文件读取和文本搜索工具",
          },
        },
      },
    });
    handle.cancel("结束测试");
    await handle.completion;
  });

  it("cancels while waiting for plan approval with one terminal event", async () => {
    const fixture = await createAgentFixture();
    const sessionId = (await fixture.store.listSessions())[0]!.id;
    const runtime = createAgentRuntimeWithDependencies(
      {
        eventStore: fixture.store,
        modelClient: new QueueModelClient([
          createTextCompletion("目标：等待\n事实：已观察\n任务：执行\n验证：测试\n风险：无\n不执行：安装"),
        ]),
        contextProvider: createStaticContextProvider(),
      },
      { ...nativeAgentRuntimeDependencies, randomUUID: uuidSequence() },
    );
    const handle = await runtime.startRun({ sessionId, prompt: "task", planningEnabled: true });
    await vi.waitFor(() => expect(runtime.getActiveRun(handle.runId)?.pendingPlanApproval).toBeDefined());
    expect(handle.cancel("用户取消计划等待")).toBe(true);
    await expect(handle.completion).resolves.toMatchObject({
      status: "cancelled",
      reason: "用户取消计划等待",
    });
    const events = (await fixture.store.readEvents(sessionId)).events;
    expect(events.filter((event) => event.type === "run.cancelled")).toHaveLength(1);
    expect(events.some((event) => event.type === "plan.approval.resolved")).toBe(false);
  });
});
