import { randomUUID } from "node:crypto";
import { createReadStream, type ReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";

export type StorageFileSystem = Pick<
  typeof fs,
  | "lstat"
  | "stat"
  | "realpath"
  | "mkdir"
  | "open"
  | "rename"
  | "readdir"
  | "rm"
>;

export interface EventStoreDependencies {
  readonly fs: StorageFileSystem;
  readonly platform: NodeJS.Platform;
  randomUUID(): string;
  now(): string;
  cwd(): string;
  readEnvironment(name: string): string | undefined;
  createReadStream(
    handle: FileHandle,
    highWaterMark: number,
  ): ReadStream;
}

export const nativeEventStoreDependencies: EventStoreDependencies = {
  fs,
  platform: process.platform,
  randomUUID,
  now: () => new Date().toISOString(),
  cwd: () => process.cwd(),
  readEnvironment: (name) => process.env[name],
  createReadStream: (handle, highWaterMark) =>
    createReadStream("", {
      autoClose: false,
      fd: handle.fd,
      highWaterMark,
      start: 0,
    }),
};
