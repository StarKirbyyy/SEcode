import type { AgentRunHandle, AgentRunOutcome } from "@/lib/agent";
import type { ErrorInfo } from "@/lib/domain";

import { parseTerminalCommand, TERMINAL_COMMAND_HELP_TEXT } from "./arguments";
import { asTerminalError, createTerminalError, TerminalLayerError } from "./errors";
import {
  INITIAL_TERMINAL_RENDER_STATE,
  renderAgentEvent,
  type TerminalRenderState,
} from "./event-renderer";
import { shortUuid } from "./text-safety";
import type {
  TerminalApplicationOptions,
  TerminalApplicationResult,
  TerminalCommand,
  TerminalFrame,
} from "./types";

const LOCAL_TRUST_NOTICE = "安全提示：本程序仅面向可信本地单用户；工作区内写入会记录，危险操作需要审批。";

function publicError(error: unknown): ErrorInfo {
  if (error instanceof TerminalLayerError) return error.error;
  if (error !== null && typeof error === "object" && "error" in error) {
    const candidate = (error as { error?: unknown }).error;
    if (
      candidate !== null &&
      typeof candidate === "object" &&
      typeof (candidate as { code?: unknown }).code === "string" &&
      typeof (candidate as { message?: unknown }).message === "string" &&
      typeof (candidate as { recoverable?: unknown }).recoverable === "boolean"
    ) return candidate as ErrorInfo;
  }
  return asTerminalError(error).error;
}

export async function runTerminalApplication(options: TerminalApplicationOptions): Promise<TerminalApplicationResult> {
  let active: AgentRunHandle | undefined;
  let completionObserver: Promise<void> | undefined;
  let lastOutcome: AgentRunOutcome | undefined;
  let renderState: TerminalRenderState = INITIAL_TERMINAL_RENDER_STATE;
  let fatal: ErrorInfo | undefined;
  let closing = false;
  let interruptPending = false;
  let interruptResolver: (() => void) | undefined;
  let closeResolver: (() => void) | undefined;
  let pendingNext: Promise<IteratorResult<string>> | undefined;

  const frames = async (items: readonly TerminalFrame[]) => {
    for (const frame of items) await options.writer.write(frame);
  };
  const closeStream = async () => {
    if (!renderState.lineOpen) return;
    await options.writer.write({ channel: "stdout", mode: "line", text: "" });
    renderState = INITIAL_TERMINAL_RENDER_STATE;
  };
  const notice = async (text: string, channel: TerminalFrame["channel"] = "stdout") => {
    await closeStream();
    await options.writer.write({ channel, mode: "line", text });
  };
  const showError = async (error: unknown) => {
    const info = publicError(error);
    await notice(`${info.code}: ${info.message}`, "stderr");
    return info;
  };

  const observe = (handle: AgentRunHandle) => {
    completionObserver = handle.completion.then(async (outcome) => {
      lastOutcome = outcome;
      if (active?.runId === handle.runId) active = undefined;
    }).catch(async (cause) => {
      fatal = publicError(cause);
      closing = true;
      closeResolver?.();
      await showError(fatal).catch(() => undefined);
    });
  };

  const startTask = async (content: string) => {
    if (active) {
      await notice("当前已有运行；请先使用 /status、/cancel 或等待完成。", "stderr");
      return;
    }
    try {
      const handle = await options.runtime.startRun(
        { sessionId: options.session.metadata.id, prompt: content },
        {
          onEvent: async (event) => {
            try {
              const rendered = renderAgentEvent(event, renderState);
              await frames(rendered.frames);
              renderState = rendered.state;
            } catch (cause) {
              fatal = publicError(cause);
              closing = true;
              throw cause;
            }
          },
        },
      );
      active = handle;
      observe(handle);
    } catch (cause) {
      const info = await showError(cause);
      if (!info.recoverable) {
        fatal = info;
        closing = true;
      }
    }
  };

  const status = async () => {
    if (!active) {
      await notice(lastOutcome ? `空闲；最近运行 ${shortUuid(lastOutcome.runId)}：${lastOutcome.status}` : `空闲；历史稳定序号 ${options.session.snapshot.lastSeq}`);
      return;
    }
    const view = options.runtime.getActiveRun(active.runId);
    if (!view) {
      await notice(`运行 ${shortUuid(active.runId)} 正在收尾`);
      return;
    }
    await notice(`运行 ${shortUuid(view.runId)}：${view.status}，第 ${view.iterations} 轮${view.pendingApproval ? `，待审批 ${shortUuid(view.pendingApproval.approvalId)}` : ""}`);
  };

  const approval = async (approved: boolean, reason?: string) => {
    if (!active) throw createTerminalError("TERMINAL_NO_ACTIVE_RUN", "当前没有活动运行");
    const view = options.runtime.getActiveRun(active.runId);
    if (!view?.pendingApproval) throw createTerminalError("TERMINAL_NO_PENDING_APPROVAL", "当前运行没有待审批操作", { runId: active.runId });
    const result = await options.runtime.resolveApproval(active.runId, view.pendingApproval.approvalId, { approved, ...(reason === undefined ? {} : { reason }) });
    if (result.status === "invalid") throw new TerminalLayerError(result.error);
    await notice(approved ? "审批已提交：允许。" : "审批已提交：拒绝。" );
  };

  const cancel = async (reason: string) => {
    if (!active) throw createTerminalError("TERMINAL_NO_ACTIVE_RUN", "当前没有活动运行");
    const accepted = active.cancel(reason);
    await notice(accepted ? "已请求取消当前运行。" : "取消请求已存在或运行正在结束。", "stderr");
  };

  const execute = async (command: TerminalCommand): Promise<"continue" | "exit"> => {
    switch (command.kind) {
      case "empty": return "continue";
      case "task": await startTask(command.content); return "continue";
      case "help": await notice(TERMINAL_COMMAND_HELP_TEXT); return "continue";
      case "status": await status(); return "continue";
      case "approve": await approval(true, command.reason); return "continue";
      case "reject": await approval(false, command.reason); return "continue";
      case "cancel": await cancel(command.reason ?? "用户通过终端命令取消运行"); return "continue";
      case "exit": return "exit";
      default: {
        const exhaustive: never = command;
        throw createTerminalError("TERMINAL_INTERNAL_ERROR", `未知命令 ${String(exhaustive)}`);
      }
    }
  };

  const disposeInterrupt = options.onInterrupt(() => {
    interruptPending = true;
    interruptResolver?.();
  });

  try {
    await notice(LOCAL_TRUST_NOTICE);
    await notice(`Session ${shortUuid(options.session.metadata.id)}｜工作区 ${options.session.workspace.rootPath}｜模型 ${options.session.profile.id}`);
    await notice("输入编程任务，或使用 /help 查看命令。");

    while (!closing) {
      if (interruptPending) {
        interruptPending = false;
        if (active) {
          await cancel("用户通过 Ctrl+C 取消运行").catch(showError);
          continue;
        }
        return { exitCode: 130, reason: "interrupted" };
      }
      if (!pendingNext) pendingNext = options.input.next();
      const interrupt = new Promise<"interrupt">((resolve) => {
        interruptResolver = () => resolve("interrupt");
      });
      const close = new Promise<"close">((resolve) => {
        closeResolver = () => resolve("close");
      });
      const winner = await Promise.race([
        pendingNext.then((value) => ({ kind: "next" as const, value })),
        interrupt.then(() => ({ kind: "interrupt" as const })),
        close.then(() => ({ kind: "close" as const })),
      ]);
      interruptResolver = undefined;
      closeResolver = undefined;
      if (winner.kind === "close") break;
      if (winner.kind === "interrupt") {
        interruptPending = false;
        if (active) {
          await cancel("用户通过 Ctrl+C 取消运行").catch(showError);
          continue;
        }
        return { exitCode: 130, reason: "interrupted" };
      }
      pendingNext = undefined;
      if (winner.value.done) {
        if (active) await cancel("终端输入已结束").catch(showError);
        closing = true;
        break;
      }
      try {
        const result = await execute(parseTerminalCommand(winner.value.value));
        if (result === "exit") {
          if (active) await cancel("用户退出终端").catch(showError);
          closing = true;
        }
      } catch (cause) {
        const info = await showError(cause);
        if (!info.recoverable) {
          fatal = info;
          closing = true;
        }
      }
    }

    if (completionObserver) await completionObserver;
    await closeStream();
    return fatal ? { exitCode: 1, reason: "fatal" } : { exitCode: 0, reason: "normal" };
  } catch (cause) {
    fatal = publicError(cause);
    if (active) active.cancel("终端发生致命错误");
    if (completionObserver) await completionObserver.catch(() => undefined);
    return { exitCode: 1, reason: "fatal" };
  } finally {
    disposeInterrupt();
    interruptResolver = undefined;
    closeResolver = undefined;
    await options.writer.flush().catch(() => undefined);
  }
}
