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
};
