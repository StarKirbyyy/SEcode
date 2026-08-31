import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import * as fs from "node:fs/promises";
import { request } from "node:http";

export type HttpProbeErrorCategory =
  | "connection_refused"
  | "connection_reset"
  | "request_timeout"
  | "other";

export interface HttpProbeResult {
  connected: boolean;
  status?: number;
  errorCategory?: HttpProbeErrorCategory;
}

export interface ToolFileSystem {
  readdir(path: string): Promise<Dirent[]>;
  stat(path: string): Promise<Stats>;
  readFile(path: string): Promise<Buffer>;
  open(path: string, flags: string, mode?: number): Promise<FileHandle>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export interface ToolDependencies {
  fileSystem: ToolFileSystem;
  spawnProcess(
    program: string,
    args: readonly string[],
    options: SpawnOptions,
  ): ChildProcess;
  randomUUID(): string;
  now(): number;
  probeHttp(url: string, signal: AbortSignal): Promise<HttpProbeResult>;
  signalProcess(pid: number, signal: NodeJS.Signals): void;
}

export const nativeToolDependencies: ToolDependencies = {
  fileSystem: {
    readdir: (targetPath) => fs.readdir(targetPath, { withFileTypes: true }),
    stat: fs.stat,
    readFile: fs.readFile,
    open: fs.open,
    rename: fs.rename,
    unlink: fs.unlink,
  },
  spawnProcess: (program, args, options) => spawn(program, args, options),
  randomUUID,
  now: Date.now,
  probeHttp: (url, signal) => new Promise((resolve) => {
    const probe = request(url, {
      method: "GET",
      agent: false,
      signal,
    }, (response) => {
      const status = response.statusCode;
      response.resume();
      resolve({
        connected: true,
        ...(status === undefined ? {} : { status }),
      });
    });
    probe.once("error", (error: NodeJS.ErrnoException) => {
      const errorCategory: HttpProbeErrorCategory =
        error.code === "ECONNREFUSED" ? "connection_refused"
          : error.code === "ECONNRESET" ? "connection_reset"
            : error.name === "AbortError" || signal.aborted ? "request_timeout"
              : "other";
      resolve({ connected: false, errorCategory });
    });
    probe.end();
  }),
  signalProcess: (pid, signal) => process.kill(pid, signal),
};
