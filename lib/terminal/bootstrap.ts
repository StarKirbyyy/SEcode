import { createAgentRuntime } from "@/lib/agent";
import { createAgentContextProvider } from "@/lib/context";
import { createModelClient } from "@/lib/model";
import { createJsonlEventStore } from "@/lib/storage";
import { createWorkspaceHandle } from "@/lib/workspace";

import { parseTerminalArguments, TERMINAL_HELP_TEXT } from "./arguments";
import { runTerminalApplication } from "./application";
import { asTerminalError, TerminalLayerError } from "./errors";
import { selectModelEnvironment, selectTerminalDataDirectory } from "./environment";
import { createNodeTerminalIO } from "./node-io";
import { selectTerminalSession } from "./session";
import type { TerminalApplicationResult, TerminalBootstrapDependencies, TerminalMainOptions } from "./types";
import { createTerminalWriter } from "./writer";

const PRODUCTION_DEPENDENCIES: TerminalBootstrapDependencies = {
  createIO: createNodeTerminalIO,
  createStore: (dataDir) => createJsonlEventStore(dataDir === undefined ? undefined : { dataDir }),
  createModel: (environment) => createModelClient({ env: environment }),
  createRuntime: ({ eventStore, modelClient }) => createAgentRuntime({
    eventStore,
    modelClient,
    contextProvider: createAgentContextProvider({ eventSource: eventStore, modelClient }),
  }),
  createWorkspace: createWorkspaceHandle,
};

function usageError(error: TerminalLayerError): boolean {
  return error.error.code === "TERMINAL_ARGUMENT_INVALID" || error.error.code === "TERMINAL_TTY_REQUIRED";
}

export async function runTerminalMainWithDependencies(
  options: TerminalMainOptions,
  dependencies: TerminalBootstrapDependencies,
): Promise<TerminalApplicationResult> {
  let io = options.io;
  let writer: ReturnType<typeof createTerminalWriter> | undefined;
  try {
    const launch = parseTerminalArguments(options.argv);
    io ??= dependencies.createIO();
    writer = createTerminalWriter(io);
    if (launch.mode === "help") {
      await writer.write({ channel: "stdout", mode: "line", text: TERMINAL_HELP_TEXT });
      return { exitCode: 0, reason: "normal" };
    }
    if (!io.interactive) {
      throw new TerminalLayerError({ code: "TERMINAL_TTY_REQUIRED", message: "交互终端要求 stdin 和 stdout 均为 TTY", recoverable: false });
    }
    const dataDir = selectTerminalDataDirectory(launch.dataDir, options.environment);
    const store = dependencies.createStore(dataDir);
    await store.initialize();
    const modelClient = dependencies.createModel(selectModelEnvironment(options.environment));
    const runtime = dependencies.createRuntime({ eventStore: store, modelClient });
    const input = io.input[Symbol.asyncIterator]();
    const selection = await selectTerminalSession(launch, {
      store,
      runtime,
      modelSnapshot: modelClient.getConfigSnapshot(),
      createWorkspace: dependencies.createWorkspace,
      input,
      writer,
      onInterrupt: io.onInterrupt.bind(io),
    });
    if (selection.status === "exit") return selection.result;
    return await runTerminalApplication({
      session: selection.session,
      runtime,
      input,
      writer,
      onInterrupt: io.onInterrupt.bind(io),
    });
  } catch (cause) {
    const error = asTerminalError(cause);
    if (!io) io = dependencies.createIO();
    if (!writer) writer = createTerminalWriter(io);
    await writer.write({ channel: "stderr", mode: "line", text: `${error.error.code}: ${error.error.message}` }).catch(async () => {
      await io!.write({ channel: "stderr", mode: "line", text: "TERMINAL_IO_ERROR: 终端输出失败" }).catch(() => undefined);
    });
    return usageError(error) ? { exitCode: 2, reason: "usage" } : { exitCode: 1, reason: "fatal" };
  } finally {
    await writer?.flush().catch(() => undefined);
    await io?.close().catch(() => undefined);
  }
}

export function runTerminalMain(options: TerminalMainOptions): Promise<TerminalApplicationResult> {
  return runTerminalMainWithDependencies(options, PRODUCTION_DEPENDENCIES);
}
