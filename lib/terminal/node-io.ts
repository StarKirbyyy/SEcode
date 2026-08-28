import readline from "node:readline";
import type { Readable, Writable } from "node:stream";

import { createTerminalError } from "./errors";
import type { TerminalFrame, TerminalIO } from "./types";

interface NodeTerminalStreams {
  stdin: Readable & { isTTY?: boolean };
  stdout: Writable & { isTTY?: boolean };
  stderr: Writable;
}

function writeStream(stream: Writable, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error | null) => {
      if (settled) return;
      settled = true;
      stream.off("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onError = (error: Error) => finish(error);
    stream.once("error", onError);
    try {
      stream.write(text, (error) => finish(error));
    } catch (error) {
      finish(error instanceof Error ? error : new Error("stream write failed"));
    }
  });
}

export function createNodeTerminalIOWithStreams(streams: NodeTerminalStreams): TerminalIO {
  const rl = readline.createInterface({ input: streams.stdin, output: streams.stdout, terminal: true, crlfDelay: Infinity });
  const listeners = new Set<() => void>();
  let closed = false;
  const dispatchInterrupt = () => { for (const listener of [...listeners]) listener(); };
  rl.on("SIGINT", dispatchInterrupt);
  return {
    interactive: streams.stdin.isTTY === true && streams.stdout.isTTY === true,
    input: rl,
    async write(frame: TerminalFrame) {
      const stream = frame.channel === "stdout" ? streams.stdout : streams.stderr;
      try {
        await writeStream(stream, `${frame.text}${frame.mode === "line" ? "\n" : ""}`);
      } catch (cause) {
        throw createTerminalError("TERMINAL_IO_ERROR", "终端流写入失败", undefined, cause);
      }
    },
    onInterrupt(listener) {
      listeners.add(listener);
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        listeners.delete(listener);
      };
    },
    async close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      rl.off("SIGINT", dispatchInterrupt);
      rl.close();
    },
  };
}

export function createNodeTerminalIO(): TerminalIO {
  return createNodeTerminalIOWithStreams({ stdin: process.stdin, stdout: process.stdout, stderr: process.stderr });
}
