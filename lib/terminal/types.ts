import type { AgentRuntime, AgentRunHandle, AgentRunOutcome, SessionAgentSnapshot } from "@/lib/agent";
import type { ModelProfile } from "@/lib/domain";
import type { ModelClient, ModelEnvironment, ModelRegistrySnapshot } from "@/lib/model";
import type { JsonlEventStore, StoredSessionMetadata } from "@/lib/storage";
import type { WorkspaceHandle } from "@/lib/workspace";

export const TERMINAL_EXIT_CODES = [0, 1, 2, 130] as const;
export type TerminalExitCode = (typeof TERMINAL_EXIT_CODES)[number];

export type TerminalLaunch =
  | Readonly<{ mode: "help" }>
  | Readonly<{ mode: "setup"; dataDir?: string }>
  | Readonly<{
      mode: "create";
      workspacePath: string;
      modelProfileId: string;
      title?: string;
      dataDir?: string;
    }>
  | Readonly<{ mode: "resume"; sessionId: string; dataDir?: string }>;

export type TerminalCommand =
  | Readonly<{ kind: "task"; content: string }>
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "help" }>
  | Readonly<{ kind: "status" }>
  | Readonly<{ kind: "plan"; enabled: boolean }>
  | Readonly<{ kind: "approve-plan"; reason?: string }>
  | Readonly<{ kind: "reject-plan"; reason?: string }>
  | Readonly<{ kind: "approve"; reason?: string }>
  | Readonly<{ kind: "reject"; reason?: string }>
  | Readonly<{ kind: "cancel"; reason?: string }>
  | Readonly<{ kind: "exit" }>;

export type TerminalFrame = Readonly<{
  channel: "stdout" | "stderr";
  mode: "line" | "append";
  text: string;
}>;

export interface TerminalIO {
  readonly interactive: boolean;
  readonly input: AsyncIterable<string>;
  write(frame: TerminalFrame): Promise<void>;
  onInterrupt(listener: () => void): () => void;
  close(): Promise<void>;
}

export interface TerminalApplicationResult {
  exitCode: TerminalExitCode;
  reason: "normal" | "usage" | "fatal" | "interrupted";
}

export interface TerminalWriter {
  write(frame: TerminalFrame): Promise<void>;
  flush(): Promise<void>;
  readonly failed: boolean;
}

export interface TerminalSession {
  readonly metadata: StoredSessionMetadata;
  readonly workspace: WorkspaceHandle;
  readonly profile: ModelProfile;
  readonly snapshot: SessionAgentSnapshot;
}

export type TerminalSessionSelection =
  | Readonly<{ status: "ready"; session: TerminalSession }>
  | Readonly<{ status: "exit"; result: TerminalApplicationResult }>;

export interface TerminalApplicationOptions {
  readonly session: TerminalSession;
  readonly runtime: AgentRuntime;
  readonly input: AsyncIterator<string>;
  readonly writer: TerminalWriter;
  readonly onInterrupt: TerminalIO["onInterrupt"];
}

export interface TerminalMainOptions {
  readonly argv: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly io?: TerminalIO;
}

export interface TerminalBootstrapDependencies {
  readonly createIO: () => TerminalIO;
  readonly createStore: (dataDir?: string) => JsonlEventStore;
  readonly createModel: (environment: ModelEnvironment) => ModelClient;
  readonly createRuntime: (options: {
    eventStore: JsonlEventStore;
    modelClient: ModelClient;
  }) => AgentRuntime;
  readonly createWorkspace: (rootPath: string) => Promise<WorkspaceHandle>;
}

export type TerminalRunState = Readonly<{
  handle: AgentRunHandle;
  outcome?: AgentRunOutcome;
}>;

export type TerminalModelState = Readonly<{
  client: ModelClient;
  snapshot: ModelRegistrySnapshot;
}>;
