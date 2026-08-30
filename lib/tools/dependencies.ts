import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import * as fs from "node:fs/promises";

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
  probeHttp(url: string, signal: AbortSignal): Promise<number>;
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
  probeHttp: async (url, signal) => {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      signal,
    });
    await response.body?.cancel().catch(() => undefined);
    return response.status;
  },
  signalProcess: (pid, signal) => process.kill(pid, signal),
};
