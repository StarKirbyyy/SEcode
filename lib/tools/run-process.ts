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

type CompletionMode = "running" | "ready" | "timeout" | "abort";

const READINESS_PROBE_INTERVAL_MS = 100;

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
  const lifecycle = arguments_.lifecycle ?? "oneshot";
  const readinessTimeoutMs = arguments_.readiness?.timeoutMs ?? arguments_.timeoutMs;
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
        detached: arguments_.readiness !== undefined && process.platform !== "win32",
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
    let readinessStatus: number | undefined;
    let escalationTimer: ReturnType<typeof setTimeout> | undefined;
    let probeTimer: ReturnType<typeof setTimeout> | undefined;
    let serviceAbortCleanup: (() => void) | undefined;
    let serviceStopTimer: ReturnType<typeof setTimeout> | undefined;
    const probeController = new AbortController();

    const signalChild = (signal: NodeJS.Signals) => {
      if (
        arguments_.readiness !== undefined &&
        process.platform !== "win32" &&
        child.pid !== undefined
      ) {
        try {
          dependencies.signalProcess(-child.pid, signal);
          return;
        } catch {
          // The group may already have exited; ChildProcess.kill is the safe fallback.
        }
      }
      try {
        child.kill(signal);
      } catch {
        // Close/error remains the single settlement path.
      }
    };

    const terminateChild = () => {
      signalChild("SIGTERM");
      escalationTimer = setTimeout(() => {
        if (!settled) signalChild("SIGKILL");
      }, PROCESS_KILL_GRACE_MS);
    };

    const timeoutTimer = setTimeout(() => {
      if (settled || mode !== "running") return;
      mode = "timeout";
      probeController.abort("timeout");
      terminateChild();
    }, arguments_.readiness === undefined ? arguments_.timeoutMs : readinessTimeoutMs);

    const cleanupAbort = listenForAbort(context.signal, () => {
      if (settled || mode !== "running") return;
      mode = "abort";
      probeController.abort(context.signal.reason);
      terminateChild();
    });

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (escalationTimer) clearTimeout(escalationTimer);
      if (probeTimer) clearTimeout(probeTimer);
      if (!probeController.signal.aborted) probeController.abort("cleanup");
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
          ...(arguments_.readiness === undefined
            ? {}
            : {
                ready: mode === "ready",
                lifecycle,
                ...(child.pid === undefined ? {} : { pid: child.pid }),
                readinessUrl: arguments_.readiness.url,
                expectedStatus: arguments_.readiness.expectedStatus,
                readinessTimeoutMs,
                ...(readinessStatus === undefined
                  ? {}
                  : { readinessStatus }),
              }),
        },
      };
    };

    const scheduleProbe = (delayMs: number) => {
      const readiness = arguments_.readiness;
      if (readiness === undefined) return;
      probeTimer = setTimeout(async () => {
        if (settled || mode !== "running") return;
        try {
          const status = await dependencies.probeHttp(
            readiness.url,
            probeController.signal,
          );
          if (settled || mode !== "running") return;
          readinessStatus = status;
          if (status === readiness.expectedStatus) {
            mode = "ready";
            probeController.abort("ready");
            if (lifecycle === "service") {
              settled = true;
              cleanup();
              serviceAbortCleanup = listenForAbort(context.signal, () => {
                signalChild("SIGTERM");
                serviceStopTimer = setTimeout(() => signalChild("SIGKILL"), PROCESS_KILL_GRACE_MS);
              });
              child.stdout?.resume();
              child.stderr?.resume();
              child.unref?.();
              accumulator.push(stdoutDecoder.decode());
              accumulator.push(stderrDecoder.decode());
              const { output, metadata } = outputMetadata();
              resolve(createToolSuccess("服务已就绪并保持运行", output.value, metadata));
              return;
            }
            terminateChild();
            return;
          }
        } catch {
          if (settled || mode !== "running") return;
        }
        scheduleProbe(READINESS_PROBE_INTERVAL_MS);
      }, delayMs);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      accumulator.push("[标准输出] " + stdoutDecoder.decode(chunk, { stream: true }));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      accumulator.push("[标准错误] " + stderrDecoder.decode(chunk, { stream: true }));
    });
    child.once("error", () => {
      if (settled) return;
      settled = true;
      if (arguments_.readiness !== undefined) signalChild("SIGKILL");
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
      if (settled) {
        serviceAbortCleanup?.();
        serviceAbortCleanup = undefined;
        if (serviceStopTimer) clearTimeout(serviceStopTimer);
        return;
      }
      settled = true;
      if (arguments_.readiness !== undefined) signalChild("SIGKILL");
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
      if (arguments_.readiness !== undefined) {
        if (mode === "ready") {
          resolve(createToolSuccess("服务已就绪并完成进程清理", output.value, fullMetadata));
          return;
        }
        resolve(
          createToolFailure(
            "PROCESS_EXIT_NONZERO",
            "进程在服务就绪前结束",
            true,
            {
              toolName: "run_process",
              relativePath: arguments_.cwd,
              reason: "readiness_not_reached",
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

    scheduleProbe(0);
  });
}
