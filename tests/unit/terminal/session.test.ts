import { describe, expect, it, vi } from "vitest";

import type { AgentRuntime, SessionAgentSnapshot } from "@/lib/agent";
import type { ModelRegistrySnapshot } from "@/lib/model";
import type { JsonlEventStore, StoredSessionMetadata } from "@/lib/storage";
import type { WorkspaceHandle } from "@/lib/workspace";
import { selectTerminalSession } from "@/lib/terminal/session";
import { createTerminalWriter } from "@/lib/terminal/writer";
import { FakeTerminalIO, SESSION_ID } from "./helpers";

const metadata: StoredSessionMetadata = {
  storageVersion: 1,
  id: SESSION_ID,
  title: "既有任务",
  workspacePath: "/canonical/workspace",
  modelProfileId: "deepseek",
  createdAt: "2026-08-28T00:00:00.000Z",
};

const snapshot: SessionAgentSnapshot = { sessionId: SESSION_ID, status: "idle", lastSeq: 1 };
const models: ModelRegistrySnapshot = {
  profiles: [{ id: "deepseek", label: "DeepSeek", provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek", contextWindow: 64000, supportsThinking: true, configured: true }],
  issues: [],
};

function fixture(lines: readonly string[] = [], options: { sessions?: StoredSessionMetadata[]; configured?: boolean } = {}) {
  const io = new FakeTerminalIO(lines);
  const createSession = vi.fn(async () => ({ metadata, session: {}, event: {} }));
  const getSessionMetadata = vi.fn(async () => metadata);
  const listSessions = vi.fn(async () => options.sessions ?? []);
  const store = { createSession, getSessionMetadata, listSessions } as unknown as JsonlEventStore;
  const recoverSession = vi.fn(async () => snapshot);
  const runtime = { recoverSession } as unknown as AgentRuntime;
  const createWorkspace = vi.fn(async (rootPath: string) => ({ rootPath: rootPath === "/raw/workspace" ? "/canonical/workspace" : rootPath }) as WorkspaceHandle);
  const modelSnapshot: ModelRegistrySnapshot = {
    ...models,
    profiles: models.profiles.map((profile) => ({ ...profile, configured: options.configured ?? true })),
  };
  return {
    io,
    createSession,
    getSessionMetadata,
    listSessions,
    recoverSession,
    createWorkspace,
    dependencies: {
      store,
      runtime,
      modelSnapshot,
      createWorkspace,
      input: io.input[Symbol.asyncIterator](),
      writer: createTerminalWriter(io),
      onInterrupt: io.onInterrupt.bind(io),
    },
  };
}

describe("terminal session selection", () => {
  it("creates with a canonical workspace, default title and exactly one recovery", async () => {
    const item = fixture();
    const result = await selectTerminalSession({ mode: "create", workspacePath: "/raw/workspace", modelProfileId: "deepseek" }, item.dependencies);
    expect(result.status).toBe("ready");
    expect(item.createSession).toHaveBeenCalledWith({ title: "workspace", workspacePath: "/canonical/workspace", modelProfileId: "deepseek" });
    expect(item.recoverSession).toHaveBeenCalledTimes(1);
    expect(item.recoverSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it("resumes metadata-fixed workspace and profile", async () => {
    const item = fixture();
    const result = await selectTerminalSession({ mode: "resume", sessionId: SESSION_ID }, item.dependencies);
    expect(result.status).toBe("ready");
    expect(item.getSessionMetadata).toHaveBeenCalledWith(SESSION_ID);
    expect(item.createWorkspace).toHaveBeenCalledWith("/canonical/workspace");
    expect(item.createSession).not.toHaveBeenCalled();
  });

  it("supports setup new and restore using the shared iterator", async () => {
    const fresh = fixture(["n", "/raw/workspace", "deepseek", "自定义标题"]);
    await expect(selectTerminalSession({ mode: "setup" }, fresh.dependencies)).resolves.toMatchObject({ status: "ready" });
    expect(fresh.createSession).toHaveBeenCalledWith(expect.objectContaining({ title: "自定义标题" }));

    const restore = fixture(["r 1"], { sessions: [metadata] });
    await expect(selectTerminalSession({ mode: "setup" }, restore.dependencies)).resolves.toMatchObject({ status: "ready" });
    expect(restore.getSessionMetadata).toHaveBeenCalledWith(SESSION_ID);
    expect(restore.io.frames.map((frame) => frame.text).join("\n")).toContain("既有任务");
    expect(restore.io.frames.map((frame) => frame.text).join("\n")).not.toContain("/canonical/workspace");
  });

  it("returns normal exit on setup EOF without creating a session", async () => {
    const item = fixture([]);
    await expect(selectTerminalSession({ mode: "setup" }, item.dependencies)).resolves.toEqual({ status: "exit", result: { exitCode: 0, reason: "normal" } });
    expect(item.createSession).not.toHaveBeenCalled();
  });

  it("fails with a finite model error when the fixed profile is unavailable", async () => {
    const item = fixture([], { configured: false });
    await expect(selectTerminalSession({ mode: "resume", sessionId: SESSION_ID }, item.dependencies)).rejects.toMatchObject({ error: { code: "TERMINAL_MODEL_UNAVAILABLE", recoverable: true } });
    expect(item.recoverSession).not.toHaveBeenCalled();
  });

  it("maps workspace and store failures without exposing paths or causes", async () => {
    const item = fixture();
    item.createWorkspace.mockRejectedValueOnce(new Error("private /raw/workspace"));
    const error = await selectTerminalSession({ mode: "create", workspacePath: "/raw/workspace", modelProfileId: "deepseek" }, item.dependencies).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ error: { code: "TERMINAL_WORKSPACE_UNAVAILABLE" } });
    expect(JSON.stringify(error)).not.toContain("/raw/workspace");
  });
});
