import { redactSecrets } from "@/lib/domain";
import { resolveExistingWorkspacePath } from "@/lib/workspace";

import { listenForAbort, throwIfAborted } from "./abort";
import {
  nativeToolDependencies,
  type ToolDependencies,
} from "./dependencies";
import { BoundedTextAccumulator } from "./output";
import {
  LocalToolExecutionAbortedError,
  PROCESS_KILL_GRACE_MS,
  createToolFailure,
  createToolSuccess,
  type LocalToolExecutionContext,
  type RunProcessArguments,
} from "./types";

type CompletionMode = "running" | "timeout" | "abort";

function filteredEnvironment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(result)) {
    if (/(?:API_KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION)/i.test(key)) {
      delete result[key];
    }
  }
  return result;
}

export async function executeRunProcess(
  context: LocalToolExecutionContext,
  arguments_: RunProcessArguments,
  dependencies: ToolDependencies = nativeToolDependencies,
) {
  throwIfAborted(context.signal);
  const cwd = await resolveExistingWorkspacePath(
    context.workspace,
    arguments_.cwd,
    { expectedKind: "directory" },
  );
  throwIfAborted(context.signal);

  const startedAt = dependencies.now();
  const accumulator = new BoundedTextAccumulator();
  const stdoutDecoder = new TextDecoder();
  const stderrDecoder = new TextDecoder();

  return new Promise<ReturnType<typeof createToolSuccess>>((resolve, reject) => {
    let child;
    try {
      child = dependencies.spawnProcess(arguments_.program, arguments_.args, {
        cwd: cwd.absolutePath,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: filteredEnvironment(),
      });
    } catch {
      resolve(
        createToolFailure(
          "PROCESS_SPAWN_FAILED",
          "进程启动失败",
          true,
          {
            toolName: "run_process",
            relativePath: arguments_.cwd,
            reason: "spawn_error",
          },
        ),
      );
      return;
    }

    let settled = false;
    let mode: CompletionMode = "running";
    let escalationTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutTimer = setTimeout(() => {
      if (settled || mode !== "running") return;
      mode = "timeout";
      child.kill("SIGTERM");
      escalationTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, PROCESS_KILL_GRACE_MS);
    }, arguments_.timeoutMs);

    const cleanupAbort = listenForAbort(context.signal, () => {
      if (settled || mode !== "running") return;
      mode = "abort";
      child.kill("SIGTERM");
      escalationTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, PROCESS_KILL_GRACE_MS);
    });

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (escalationTimer) clearTimeout(escalationTimer);
      cleanupAbort();
    };
    const outputMetadata = () => {
      const output = accumulator.finish();
      return {
        output,
        metadata: {
          program: redactSecrets(arguments_.program),
          cwd: arguments_.cwd,
          durationMs: Math.max(0, dependencies.now() - startedAt),
          truncated: output.truncated,
          originalBytes: accumulator.totalBytes,
          returnedBytes: output.returnedBytes,
        },
      };
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      accumulator.push("[stdout] " + stdoutDecoder.decode(chunk, { stream: true }));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      accumulator.push("[stderr] " + stderrDecoder.decode(chunk, { stream: true }));
    });
    child.once("error", () => {
      if (settled) return;
      settled = true;
      cleanup();
      const { output, metadata } = outputMetadata();
      resolve(
        createToolFailure(
          "PROCESS_SPAWN_FAILED",
          "进程启动失败",
          true,
          {
            toolName: "run_process",
            relativePath: arguments_.cwd,
            reason: "spawn_error",
          },
          output.value,
          metadata,
        ),
      );
    });
    child.once("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      accumulator.push(stdoutDecoder.decode());
      accumulator.push(stderrDecoder.decode());
      const { output, metadata } = outputMetadata();
      const fullMetadata = {
        ...metadata,
        exitCode,
        signal,
        timedOut: mode === "timeout",
      };
      if (mode === "abort") {
        reject(new LocalToolExecutionAbortedError(context.signal.reason));
        return;
      }
      if (mode === "timeout") {
        resolve(
          createToolFailure(
            "PROCESS_TIMEOUT",
            "进程执行超时",
            true,
            {
              toolName: "run_process",
              relativePath: arguments_.cwd,
              reason: "timeout",
              timeoutMs: arguments_.timeoutMs,
              exitCode,
              signal,
              truncated: output.truncated,
            },
            output.value,
            fullMetadata,
          ),
        );
        return;
      }
      if (exitCode === 0) {
        resolve(createToolSuccess("进程执行完成", output.value, fullMetadata));
        return;
      }
      resolve(
        createToolFailure(
          "PROCESS_EXIT_NONZERO",
          "进程以非零状态结束",
          true,
          {
            toolName: "run_process",
            relativePath: arguments_.cwd,
            reason: "nonzero_exit",
            exitCode,
            signal,
            truncated: output.truncated,
          },
          output.value,
          fullMetadata,
        ),
      );
    });
  });
}
