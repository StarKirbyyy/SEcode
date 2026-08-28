import path from "node:path";

import type { AgentRuntime } from "@/lib/agent";
import type { ModelProfile, SessionId } from "@/lib/domain";
import type { ModelRegistrySnapshot } from "@/lib/model";
import type { JsonlEventStore, StoredSessionMetadata } from "@/lib/storage";
import type { WorkspaceHandle } from "@/lib/workspace";

import { createTerminalError, TerminalLayerError } from "./errors";
import { shortUuid } from "./text-safety";
import type {
  TerminalApplicationResult,
  TerminalLaunch,
  TerminalSession,
  TerminalSessionSelection,
  TerminalWriter,
} from "./types";

export interface TerminalSessionDependencies {
  readonly store: JsonlEventStore;
  readonly runtime: AgentRuntime;
  readonly modelSnapshot: ModelRegistrySnapshot;
  readonly createWorkspace: (rootPath: string) => Promise<WorkspaceHandle>;
  readonly input: AsyncIterator<string>;
  readonly writer: TerminalWriter;
  readonly onInterrupt: (listener: () => void) => () => void;
}

function publicFailure(code: "TERMINAL_SESSION_UNAVAILABLE" | "TERMINAL_WORKSPACE_UNAVAILABLE" | "TERMINAL_MODEL_UNAVAILABLE", message: string, details?: Record<string, unknown>, cause?: unknown): TerminalLayerError {
  return createTerminalError(code, message, details, cause);
}

function configuredProfile(snapshot: ModelRegistrySnapshot, profileId: string): ModelProfile {
  const profile = snapshot.profiles.find((candidate) => candidate.id === profileId);
  if (profile?.configured) return profile;
  throw publicFailure("TERMINAL_MODEL_UNAVAILABLE", "所选模型配置当前不可用", { profileId });
}

function defaultTitle(rootPath: string): string {
  const candidate = path.basename(rootPath).trim();
  return (candidate || "SEcode Session").slice(0, 256);
}

async function writeLine(writer: TerminalWriter, text: string): Promise<void> {
  await writer.write({ channel: "stdout", mode: "line", text });
}

interface SetupReadResult { status: "line"; line: string }
interface SetupEndResult { status: "eof" | "interrupted" }

async function readSetupLine(dependencies: TerminalSessionDependencies): Promise<SetupReadResult | SetupEndResult> {
  let interrupted = false;
  let resolveInterrupt!: () => void;
  const interrupt = new Promise<void>((resolve) => { resolveInterrupt = resolve; });
  const dispose = dependencies.onInterrupt(() => {
    interrupted = true;
    resolveInterrupt();
  });
  try {
    const next = dependencies.input.next();
    const winner = await Promise.race([
      next.then((value) => ({ kind: "next" as const, value })),
      interrupt.then(() => ({ kind: "interrupt" as const })),
    ]);
    if (winner.kind === "interrupt" || interrupted) return { status: "interrupted" };
    return winner.value.done ? { status: "eof" } : { status: "line", line: winner.value.value };
  } finally {
    dispose();
  }
}

function setupExit(status: "eof" | "interrupted"): TerminalSessionSelection {
  const result: TerminalApplicationResult = status === "interrupted"
    ? { exitCode: 130, reason: "interrupted" }
    : { exitCode: 0, reason: "normal" };
  return { status: "exit", result };
}

async function setupLaunch(dependencies: TerminalSessionDependencies): Promise<
  | Extract<TerminalLaunch, { mode: "create" | "resume" }>
  | TerminalSessionSelection
> {
  const sessions = await dependencies.store.listSessions().catch((cause) => {
    throw publicFailure("TERMINAL_SESSION_UNAVAILABLE", "无法列出最近 Session", undefined, cause);
  });
  await writeLine(dependencies.writer, "最近 Session：");
  if (sessions.length === 0) await writeLine(dependencies.writer, "  （暂无）");
  for (const [index, session] of sessions.entries()) {
    await writeLine(dependencies.writer, `  ${index + 1}. ${shortUuid(session.id)}｜${session.title}｜${session.modelProfileId}｜${path.basename(session.workspacePath)}｜${session.createdAt}`);
  }
  await writeLine(dependencies.writer, "输入 n 新建 Session，或输入 r <序号> 恢复：");
  const choice = await readSetupLine(dependencies);
  if (choice.status !== "line") return setupExit(choice.status);
  const trimmed = choice.line.trim();
  const restore = /^r\s+(\d+)$/.exec(trimmed);
  if (restore) {
    const selected = sessions[Number(restore[1]) - 1];
    if (!selected) throw createTerminalError("TERMINAL_COMMAND_INVALID", "Session 序号无效", { command: "r", reason: "selection_out_of_range" });
    return { mode: "resume", sessionId: selected.id };
  }
  if (trimmed !== "n") throw createTerminalError("TERMINAL_COMMAND_INVALID", "Setup 选择无效", { command: trimmed.slice(0, 64), reason: "expected_new_or_restore" });

  const prompts = ["请输入工作区绝对路径：", "请输入模型 profile（deepseek / longcat / generic）：", "请输入标题（留空使用目录名）："];
  const answers: string[] = [];
  for (const prompt of prompts) {
    await writeLine(dependencies.writer, prompt);
    const answer = await readSetupLine(dependencies);
    if (answer.status !== "line") return setupExit(answer.status);
    answers.push(answer.line.trim());
  }
  return {
    mode: "create",
    workspacePath: answers[0]!,
    modelProfileId: answers[1]!,
    ...(answers[2] ? { title: answers[2] } : {}),
  };
}

async function recover(
  metadata: StoredSessionMetadata,
  workspace: WorkspaceHandle,
  profile: ModelProfile,
  runtime: AgentRuntime,
): Promise<TerminalSession> {
  try {
    const snapshot = await runtime.recoverSession(metadata.id as SessionId);
    return { metadata, workspace, profile, snapshot };
  } catch (cause) {
    throw publicFailure("TERMINAL_SESSION_UNAVAILABLE", "Session 恢复失败；请重启后重试", { sessionId: metadata.id }, cause);
  }
}

async function createSession(launch: Extract<TerminalLaunch, { mode: "create" }>, dependencies: TerminalSessionDependencies): Promise<TerminalSession> {
  const profile = configuredProfile(dependencies.modelSnapshot, launch.modelProfileId);
  let workspace: WorkspaceHandle;
  try {
    workspace = await dependencies.createWorkspace(launch.workspacePath);
  } catch (cause) {
    throw publicFailure("TERMINAL_WORKSPACE_UNAVAILABLE", "工作区不可用", undefined, cause);
  }
  let created;
  try {
    created = await dependencies.store.createSession({
      title: launch.title ?? defaultTitle(workspace.rootPath),
      workspacePath: workspace.rootPath,
      modelProfileId: profile.id,
    });
  } catch (cause) {
    throw publicFailure("TERMINAL_SESSION_UNAVAILABLE", "Session 创建未完成；请检查数据目录后重启", undefined, cause);
  }
  return recover(created.metadata, workspace, profile, dependencies.runtime);
}

async function resumeSession(launch: Extract<TerminalLaunch, { mode: "resume" }>, dependencies: TerminalSessionDependencies): Promise<TerminalSession> {
  let metadata: StoredSessionMetadata;
  try {
    metadata = await dependencies.store.getSessionMetadata(launch.sessionId);
  } catch (cause) {
    throw publicFailure("TERMINAL_SESSION_UNAVAILABLE", "找不到指定 Session", { sessionId: launch.sessionId }, cause);
  }
  const profile = configuredProfile(dependencies.modelSnapshot, metadata.modelProfileId);
  let workspace: WorkspaceHandle;
  try {
    workspace = await dependencies.createWorkspace(metadata.workspacePath);
  } catch (cause) {
    throw publicFailure("TERMINAL_WORKSPACE_UNAVAILABLE", "Session 固定工作区不可用", { sessionId: metadata.id }, cause);
  }
  return recover(metadata, workspace, profile, dependencies.runtime);
}

export async function selectTerminalSession(
  initialLaunch: Exclude<TerminalLaunch, { mode: "help" }>,
  dependencies: TerminalSessionDependencies,
): Promise<TerminalSessionSelection> {
  const selected = initialLaunch.mode === "setup" ? await setupLaunch(dependencies) : initialLaunch;
  if ("status" in selected) return selected;
  const session = selected.mode === "create"
    ? await createSession(selected, dependencies)
    : await resumeSession(selected, dependencies);
  return { status: "ready", session };
}
