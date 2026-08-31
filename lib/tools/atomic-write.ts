import path from "node:path";

import {
  resolveWritableWorkspacePath,
  revalidateWritableWorkspacePath,
  WorkspaceLayerError,
  type WorkspaceHandle,
} from "@/lib/workspace";

import { throwIfAborted } from "./abort";
import {
  nativeToolDependencies,
  type ToolDependencies,
} from "./dependencies";
import {
  FileContentError,
  readTextFileAbsolute,
  sha256Bytes,
} from "./file-content";
import { LocalToolExecutionAbortedError } from "./types";

export interface AtomicWriteResult {
  changed: boolean;
  operation: "create" | "overwrite";
  beforeSha256?: string;
  afterSha256: string;
  bytes: number;
}

export interface AtomicWriteOptions {
  expectedCurrentSha256?: string;
}

export class AtomicWriteError extends Error {
  constructor(
    readonly code:
      | "stale"
      | "content"
      | "atomic_io",
    cause?: unknown,
  ) {
    super(code);
    this.name = "AtomicWriteError";
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

function errnoCode(cause: unknown): string | undefined {
  return cause !== null &&
    typeof cause === "object" &&
    "code" in cause &&
    typeof cause.code === "string"
    ? cause.code
    : undefined;
}

async function existingHash(
  absolutePath: string,
  dependencies: ToolDependencies,
) {
  try {
    return await readTextFileAbsolute(absolutePath, dependencies);
  } catch (cause) {
    if (cause instanceof FileContentError) {
      throw new AtomicWriteError("content", cause);
    }
    throw cause;
  }
}

export async function atomicWriteWorkspaceFile(
  workspace: WorkspaceHandle,
  relativePath: string,
  targetBytes: Buffer,
  signal: AbortSignal,
  dependencies: ToolDependencies = nativeToolDependencies,
  options: AtomicWriteOptions = {},
): Promise<AtomicWriteResult> {
  throwIfAborted(signal);
  const writable = await resolveWritableWorkspacePath(workspace, relativePath, {
    allowExisting: true,
  });
  let existing:
    | Awaited<ReturnType<typeof readTextFileAbsolute>>
    | undefined;
  if (writable.existed) {
    existing = await existingHash(writable.absolutePath, dependencies);
    if (
      options.expectedCurrentSha256 !== undefined &&
      existing.sha256 !== options.expectedCurrentSha256
    ) {
      throw new AtomicWriteError("stale");
    }
  } else if (options.expectedCurrentSha256 !== undefined) {
    throw new AtomicWriteError("stale");
  }

  const afterSha256 = sha256Bytes(targetBytes);
  if (existing?.bytes.equals(targetBytes)) {
    return {
      changed: false,
      operation: "overwrite",
      beforeSha256: existing.sha256,
      afterSha256,
      bytes: targetBytes.byteLength,
    };
  }

  throwIfAborted(signal);
  let temporaryPath: string | undefined;
  let handle: Awaited<ReturnType<ToolDependencies["fileSystem"]["open"]>> | undefined;
  let committed = false;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = path.join(
        writable.parentPath,
        ".secode-write-" + dependencies.randomUUID() + ".tmp",
      );
      try {
        handle = await dependencies.fileSystem.open(
          candidate,
          "wx",
          existing?.mode ?? (0o666 & ~process.umask()),
        );
        temporaryPath = candidate;
        break;
      } catch (cause) {
        if (errnoCode(cause) !== "EEXIST" || attempt === 2) {
          throw new AtomicWriteError("atomic_io", cause);
        }
      }
    }
    if (!handle || !temporaryPath) {
      throw new AtomicWriteError("atomic_io");
    }

    await handle.writeFile(targetBytes);
    await handle.sync();
    await handle.close();
    handle = undefined;

    throwIfAborted(signal);
    await revalidateWritableWorkspacePath(workspace, writable);
    if (writable.existed) {
      const current = await existingHash(writable.absolutePath, dependencies);
      if (current.sha256 !== existing?.sha256) {
        throw new AtomicWriteError("stale");
      }
    }
    throwIfAborted(signal);
    await dependencies.fileSystem.rename(temporaryPath, writable.absolutePath);
    committed = true;

    return {
      changed: true,
      operation: writable.existed ? "overwrite" : "create",
      ...(existing === undefined ? {} : { beforeSha256: existing.sha256 }),
      afterSha256,
      bytes: targetBytes.byteLength,
    };
  } catch (cause) {
    if (
      cause instanceof AtomicWriteError ||
      cause instanceof WorkspaceLayerError ||
      cause instanceof LocalToolExecutionAbortedError
    ) {
      throw cause;
    }
    throw new AtomicWriteError("atomic_io", cause);
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // The primary operation result remains authoritative.
      }
    }
    if (temporaryPath && !committed) {
      try {
        await dependencies.fileSystem.unlink(temporaryPath);
      } catch {
        // Only the exact temporary path is eligible for best-effort cleanup.
      }
    }
  }
}
