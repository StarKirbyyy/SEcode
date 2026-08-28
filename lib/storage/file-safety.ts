import path from "node:path";
import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";

import type { EventStoreDependencies } from "./dependencies";
import {
  createEventStoreError,
  isErrno,
  mapStorageIoError,
} from "./errors";

function isContained(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function sameFileIdentity(before: Stats, after: Stats): boolean {
  if (before.dev === 0 && before.ino === 0) {
    return before.isFile() === after.isFile();
  }
  return before.dev === after.dev && before.ino === after.ino;
}

export async function validateSessionDirectory(
  sessionsRoot: string,
  sessionId: string,
  dependencies: EventStoreDependencies,
): Promise<string> {
  const sessionPath = path.join(sessionsRoot, sessionId);
  try {
    const metadata = await dependencies.fs.lstat(sessionPath);
    if (metadata.isSymbolicLink()) {
      throw createEventStoreError(
        "EVENT_STORE_SYMLINK_DENIED",
        "The session directory cannot be a symbolic link.",
        { sessionId },
      );
    }
    if (!metadata.isDirectory()) {
      throw createEventStoreError(
        "EVENT_STORE_PATH_CONFLICT",
        "The session path is not a directory.",
        { sessionId, expectedKind: "directory", actualKind: "other" },
      );
    }
    const realPath = await dependencies.fs.realpath(sessionPath);
    if (path.dirname(realPath) !== sessionsRoot || !isContained(sessionsRoot, realPath)) {
      throw createEventStoreError(
        "EVENT_STORE_SYMLINK_DENIED",
        "The session directory escaped the event store.",
        { sessionId },
      );
    }
    return realPath;
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      throw createEventStoreError(
        "SESSION_NOT_FOUND",
        "The requested session does not exist.",
        { sessionId },
        error,
      );
    }
    throw mapStorageIoError(
      error,
      "The session directory could not be validated.",
      { sessionId },
    );
  }
}

export async function openVerifiedSessionFile(
  sessionsRoot: string,
  sessionId: string,
  fileName: string,
  flags: string,
  dependencies: EventStoreDependencies,
): Promise<FileHandle> {
  const sessionPath = await validateSessionDirectory(
    sessionsRoot,
    sessionId,
    dependencies,
  );
  const filePath = path.join(sessionPath, fileName);
  let handle: FileHandle | undefined;
  try {
    const before = await dependencies.fs.lstat(filePath);
    if (before.isSymbolicLink()) {
      throw createEventStoreError(
        "EVENT_STORE_SYMLINK_DENIED",
        "Event store files cannot be symbolic links.",
        { sessionId },
      );
    }
    if (!before.isFile()) {
      throw createEventStoreError(
        "EVENT_STORE_PATH_CONFLICT",
        "An event store file is not a regular file.",
        { sessionId, expectedKind: "file", actualKind: "other" },
      );
    }
    const realPath = await dependencies.fs.realpath(filePath);
    if (path.dirname(realPath) !== sessionPath) {
      throw createEventStoreError(
        "EVENT_STORE_SYMLINK_DENIED",
        "An event store file escaped its session directory.",
        { sessionId },
      );
    }
    handle = await dependencies.fs.open(filePath, flags);
    const after = await handle.stat();
    if (!after.isFile() || !sameFileIdentity(before, after)) {
      throw createEventStoreError(
        "EVENT_STORE_PATH_CONFLICT",
        "An event store file changed identity while opening.",
        { sessionId, expectedKind: "stable_file", actualKind: "changed" },
      );
    }
    return handle;
  } catch (error) {
    if (handle !== undefined) {
      await handle.close().catch(() => undefined);
    }
    throw mapStorageIoError(
      error,
      "An event store file could not be opened safely.",
      { sessionId },
    );
  }
}
