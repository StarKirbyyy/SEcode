import { describe, expect, it, vi } from "vitest";

import type {
  ActiveAgentRunView,
  AgentRunHandle,
  AgentRunOutcome,
  AgentRuntime,
} from "@/lib/agent";
import type { ModelProfile } from "@/lib/domain";
import type { StoredSessionMetadata } from "@/lib/storage";
import type { WorkspaceHandle } from "@/lib/workspace";
import { runTerminalApplication } from "@/lib/terminal/application";
import { createTerminalWriter } from "@/lib/terminal/writer";
import type { TerminalIO } from "@/lib/terminal/types";
import { FakeTerminalIO, RUN_ID, SESSION_ID, deferred } from "./helpers";

const metadata: StoredSessionMetadata = {
  storageVersion: 1, id: SESSION_ID, title: "测试", workspacePath: "/tmp/work", modelProfileId: "deepseek", createdAt: "2026-08-28T00:00:00.000Z",
};
const profile: ModelProfile = {
  id: "deepseek", label: "DeepSeek", provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek", contextWindow: 64000, supportsThinking: true, configured: true,
};

function runtimeFixture(options: { immediate?: boolean; pendingApproval?: boolean } = {}) {
  let counter = 0;
  let current: { handle: AgentRunHandle; completion: ReturnType<typeof deferred<AgentRunOutcome>>; view: ActiveAgentRunView } | undefined;
  const startRun = vi.fn(async (request, controls) => {
    counter += 1;
    const runId = counter === 1 ? RUN_ID : `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
    await controls?.onEvent?.({
      protocolVersion: 1, durable: false, id: "00000000-0000-4000-8000-000000000099", streamSeq: 1,
      sessionId: SESSION_ID, runId, type: "assistant.delta", createdAt: "2026-08-28T00:00:00.000Z", data: { content: `响应${counter}` },
    });
    const completion = deferred<AgentRunOutcome>();
    const handle: AgentRunHandle = {
      sessionId: SESSION_ID,
      runId,
      completion: completion.promise,
      cancel: vi.fn((reason?: string) => {
        if (!current || current.handle.runId !== runId) return false;
        completion.resolve({ status: "cancelled", runId, iterations: 1, reason: reason ?? "cancel" });
        current = undefined;
        return true;
      }),
    };
    const view: ActiveAgentRunView = {
      sessionId: SESSION_ID, runId, status: options.pendingApproval ? "awaiting_approval" : "requesting_model", iterations: 1,
      ...(options.pendingApproval ? { pendingApproval: { approvalId: "00000000-0000-4000-8000-000000000010", toolCallId: "00000000-0000-4000-8000-000000000011", reason: "确认", toolSummary: "命令" } } : {}),
    };
    current = { handle, completion, view };
    if (options.immediate) {
      completion.resolve({ status: "completed", runId, iterations: 1, durationMs: 1 });
      current = undefined;
    }
    return handle;
  });
  const getActiveRun = vi.fn((runId: string) => current?.handle.runId === runId ? current.view : undefined);
  const resolveApproval = vi.fn(async (_runId, _approvalId, decision) => ({ status: "resolved" as const, approved: decision.approved }));
  const runtime = { startRun, getActiveRun, resolveApproval } as unknown as AgentRuntime;
  return { runtime, startRun, getActiveRun, resolveApproval, current: () => current };
}

function run(lines: readonly string[], fixture = runtimeFixture()) {
  const io = new FakeTerminalIO(lines);
  const result = runTerminalApplication({
    session: { metadata, profile, workspace: { rootPath: "/tmp/work" } as WorkspaceHandle, snapshot: { sessionId: SESSION_ID, status: "idle", lastSeq: 1 } },
    runtime: fixture.runtime,
    input: io.input[Symbol.asyncIterator](),
    writer: createTerminalWriter(io),
    onInterrupt: io.onInterrupt.bind(io),
  });
  return { io, fixture, result };
}

describe("terminal application", () => {
  it("shows welcome, help, status and exits normally", async () => {
    const item = run(["", "/help", "/status", "/exit"]);
    await expect(item.result).resolves.toEqual({ exitCode: 0, reason: "normal" });
    const output = item.io.frames.map((frame) => frame.text).join("\n");
    expect(output).toContain("可信本地单用户");
    expect(output).toContain("/approve");
    expect(output).toContain("空闲");
  });

  it("starts a task with only session, prompt and event sink", async () => {
    const fixture = runtimeFixture();
    const item = run(["修复测试", "/exit"], fixture);
    await expect(item.result).resolves.toEqual({ exitCode: 0, reason: "normal" });
    expect(fixture.startRun).toHaveBeenCalledTimes(1);
    expect(fixture.startRun.mock.calls[0]?.[0]).toEqual({ sessionId: SESSION_ID, prompt: "修复测试" });
    expect(fixture.startRun.mock.calls[0]?.[1]).toEqual({ onEvent: expect.any(Function) });
    expect(item.io.frames.map((frame) => frame.text).join("")).toContain("响应1");
  });

  it("rejects a second task while active and cancels on exit", async () => {
    const fixture = runtimeFixture();
    const item = run(["任务一", "任务二", "/exit"], fixture);
    await item.result;
    expect(fixture.startRun).toHaveBeenCalledTimes(1);
    expect(item.io.frames.map((frame) => frame.text).join("\n")).toContain("当前已有运行");
  });

  it("resolves the current pending approval with the exact id and reason", async () => {
    const fixture = runtimeFixture({ pendingApproval: true });
    const item = run(["需要安装", "/approve 受控临时目录", "/exit"], fixture);
    await item.result;
    expect(fixture.resolveApproval).toHaveBeenCalledWith(
      RUN_ID,
      "00000000-0000-4000-8000-000000000010",
      { approved: true, reason: "受控临时目录" },
    );
  });

  it("keeps recoverable command errors interactive", async () => {
    const item = run(["/cancel", "/unknown", "/exit"]);
    await expect(item.result).resolves.toEqual({ exitCode: 0, reason: "normal" });
    const output = item.io.frames.map((frame) => frame.text).join("\n");
    expect(output).toContain("TERMINAL_NO_ACTIVE_RUN");
    expect(output).toContain("TERMINAL_COMMAND_INVALID");
  });

  it("returns fatal when the writer fails", async () => {
    const fixture = runtimeFixture();
    const io = new FakeTerminalIO(["任务"]);
    io.failWrites();
    const result = await runTerminalApplication({
      session: { metadata, profile, workspace: { rootPath: "/tmp/work" } as WorkspaceHandle, snapshot: { sessionId: SESSION_ID, status: "idle", lastSeq: 1 } },
      runtime: fixture.runtime,
      input: io.input[Symbol.asyncIterator](),
      writer: createTerminalWriter(io),
      onInterrupt: io.onInterrupt.bind(io),
    });
    expect(result).toEqual({ exitCode: 1, reason: "fatal" });
    expect(fixture.startRun).not.toHaveBeenCalled();
  });

  it("wakes a pending input read and exits when completion rejects", async () => {
    const completion = deferred<AgentRunOutcome>();
    let first = true;
    const frames: Array<{ text: string }> = [];
    const io: TerminalIO = {
      interactive: true,
      input: {
        [Symbol.asyncIterator]: () => ({
          next: () => {
            if (first) {
              first = false;
              return Promise.resolve({ done: false as const, value: "触发拒绝" });
            }
            return new Promise<IteratorResult<string>>(() => undefined);
          },
        }),
      },
      async write(frame) { frames.push(frame); },
      onInterrupt() { return () => undefined; },
      async close() {},
    };
    const startRun = vi.fn(async () => ({ sessionId: SESSION_ID, runId: RUN_ID, completion: completion.promise, cancel: vi.fn(() => true) }));
    const runtime = { startRun, getActiveRun: vi.fn() } as unknown as AgentRuntime;
    const result = runTerminalApplication({
      session: { metadata, profile, workspace: { rootPath: "/tmp/work" } as WorkspaceHandle, snapshot: { sessionId: SESSION_ID, status: "idle", lastSeq: 1 } },
      runtime,
      input: io.input[Symbol.asyncIterator](),
      writer: createTerminalWriter(io),
      onInterrupt: io.onInterrupt.bind(io),
    });
    await vi.waitFor(() => expect(startRun).toHaveBeenCalledTimes(1));
    completion.reject(new Error("private completion failure"));
    await expect(result).resolves.toEqual({ exitCode: 1, reason: "fatal" });
    expect(frames.map((frame) => frame.text).join("\n")).not.toContain("private completion failure");
  });
});
