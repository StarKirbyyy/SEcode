import { describe, expect, it, vi } from "vitest";

import type { AgentRuntime } from "@/lib/agent";
import type { ModelClient, ModelEnvironment, ModelRegistrySnapshot } from "@/lib/model";
import type { JsonlEventStore, StoredSessionMetadata } from "@/lib/storage";
import type { WorkspaceHandle } from "@/lib/workspace";
import { runTerminalMainWithDependencies } from "@/lib/terminal/bootstrap";
import type { TerminalBootstrapDependencies } from "@/lib/terminal/types";
import { FakeTerminalIO, SESSION_ID } from "./helpers";

const metadata: StoredSessionMetadata = {
  storageVersion: 1, id: SESSION_ID, title: "测试", workspacePath: "/tmp/work", modelProfileId: "deepseek", createdAt: "2026-08-28T00:00:00.000Z",
};
const modelSnapshot: ModelRegistrySnapshot = {
  profiles: [{ id: "deepseek", label: "DeepSeek", provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek", contextWindow: 64000, supportsThinking: true, configured: true }], issues: [],
};

function fixture(lines: readonly string[] = ["/exit"], interactive = true) {
  const io = new FakeTerminalIO(lines, interactive);
  const initialize = vi.fn(async () => undefined);
  const createSession = vi.fn(async () => ({ metadata, session: {}, event: {} }));
  const store = { initialize, createSession, getSessionMetadata: vi.fn(async () => metadata), listSessions: vi.fn(async () => []) } as unknown as JsonlEventStore;
  const model = { getConfigSnapshot: vi.fn(() => modelSnapshot) } as unknown as ModelClient;
  const runtime = { recoverSession: vi.fn(async () => ({ sessionId: SESSION_ID, status: "idle", lastSeq: 1 })), startRun: vi.fn(), getActiveRun: vi.fn(), resolveApproval: vi.fn() } as unknown as AgentRuntime;
  const createIO = vi.fn(() => io);
  const createStore = vi.fn(() => store);
  const createModel = vi.fn((environment: ModelEnvironment) => {
    void environment;
    return model;
  });
  const createRuntime = vi.fn(() => runtime);
  const createWorkspace = vi.fn(async () => ({ rootPath: "/tmp/work" }) as WorkspaceHandle);
  const dependencies: TerminalBootstrapDependencies = { createIO, createStore, createModel, createRuntime, createWorkspace };
  return { io, initialize, createSession, createIO, createStore, createModel, createRuntime, createWorkspace, dependencies };
}

describe("terminal production bootstrap boundary", () => {
  it("short-circuits help before TTY, store and model", async () => {
    const item = fixture([], false);
    await expect(runTerminalMainWithDependencies({ argv: ["--help"], environment: {}, io: item.io }, item.dependencies)).resolves.toEqual({ exitCode: 0, reason: "normal" });
    expect(item.createStore).not.toHaveBeenCalled();
    expect(item.createModel).not.toHaveBeenCalled();
    expect(item.createRuntime).not.toHaveBeenCalled();
    expect(item.io.frames.map((frame) => frame.text).join("\n")).toContain("SEcode 本地编程智能体");
  });

  it("rejects non-TTY before durable/model initialization", async () => {
    const item = fixture([], false);
    await expect(runTerminalMainWithDependencies({ argv: [], environment: {}, io: item.io }, item.dependencies)).resolves.toEqual({ exitCode: 2, reason: "usage" });
    expect(item.createStore).not.toHaveBeenCalled();
    expect(item.createModel).not.toHaveBeenCalled();
  });

  it("assembles create in order and uses flag dataDir", async () => {
    const item = fixture(["/exit"]);
    const result = await runTerminalMainWithDependencies({
      argv: ["--workspace", "/tmp/work", "--model", "deepseek", "--data-dir", "/tmp/data"],
      environment: { DEEPSEEK_API_KEY: "sk-abcdefgh", SECODE_DATA_DIR: "/tmp/env", EXTRA_SECRET: "drop" },
      io: item.io,
    }, item.dependencies);
    expect(result).toEqual({ exitCode: 0, reason: "normal" });
    expect(item.createStore).toHaveBeenCalledWith("/tmp/data");
    expect(item.initialize).toHaveBeenCalledTimes(1);
    expect(item.createModel).toHaveBeenCalledWith(expect.objectContaining({ DEEPSEEK_API_KEY: "sk-abcdefgh" }));
    expect(item.createModel.mock.calls[0]?.[0]).not.toHaveProperty("EXTRA_SECRET");
    expect(item.createSession).toHaveBeenCalledTimes(1);
    expect(item.io.closeCount).toBe(1);
  });

  it("maps invalid argv to usage without store/model side effects", async () => {
    const item = fixture([]);
    const result = await runTerminalMainWithDependencies({ argv: ["--api-key", "sk-verysecret"], environment: {}, io: item.io }, item.dependencies);
    expect(result).toEqual({ exitCode: 2, reason: "usage" });
    expect(item.createStore).not.toHaveBeenCalled();
    expect(item.io.frames.map((frame) => frame.text).join("\n")).not.toContain("sk-verysecret");
  });
});
