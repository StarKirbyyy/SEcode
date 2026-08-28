import path from "node:path";

import { z } from "zod";

import type { EventStoreDependencies } from "./dependencies";
import {
  createEventStoreError,
  isErrno,
  mapStorageIoError,
} from "./errors";
import { JsonlEventStoreOptionsSchema } from "./schemas";
import { DEFAULT_DATA_DIRECTORY_NAME } from "./types";

export interface PendingEventStoreConfig {
  readonly dataRootCandidate: string;
}

export interface InitializedEventStoreConfig {
  readonly dataRoot: string;
  readonly sessionsRoot: string;
}

function invalidConfig(reason: string, cause?: unknown): never {
  throw createEventStoreError(
    "EVENT_STORE_CONFIG_INVALID",
    "The event store configuration is invalid.",
    { field: "dataDir", reason },
    cause,
  );
}

export function resolvePendingEventStoreConfig(
  input: unknown,
  dependencies: EventStoreDependencies,
): PendingEventStoreConfig {
  const parsed = JsonlEventStoreOptionsSchema.safeParse(input ?? {});
  if (!parsed.success) {
    invalidConfig("options_failed_validation", parsed.error);
  }

  const cwd = parsed.data.cwd ?? dependencies.cwd();
  if (!path.isAbsolute(cwd) || cwd.includes("\0")) {
    invalidConfig("cwd_must_be_absolute");
  }

  const environmentValue = dependencies.readEnvironment("SECODE_DATA_DIR");
  const configuredValue = parsed.data.dataDir ?? environmentValue;
  if (configuredValue !== undefined) {
    if (configuredValue.trim().length === 0) {
      invalidConfig("data_dir_cannot_be_blank");
    }
    if (configuredValue.includes("\0")) {
      invalidConfig("data_dir_cannot_contain_nul");
    }
  }

  const selected = configuredValue ?? DEFAULT_DATA_DIRECTORY_NAME;
  const dataRootCandidate = path.isAbsolute(selected)
    ? path.normalize(selected)
    : path.resolve(cwd, selected);

  return Object.freeze({ dataRootCandidate });
}

async function ensureRootDirectory(
  candidate: string,
  dependencies: EventStoreDependencies,
): Promise<string> {
  try {
    await dependencies.fs.mkdir(candidate, { recursive: true, mode: 0o700 });
    const realPath = await dependencies.fs.realpath(candidate);
    const metadata = await dependencies.fs.stat(realPath);
    if (!metadata.isDirectory()) {
      throw createEventStoreError(
        "EVENT_STORE_PATH_CONFLICT",
        "The event store data root is not a directory.",
        { expectedKind: "directory", actualKind: "other" },
      );
    }
    return realPath;
  } catch (error) {
    if (error instanceof z.ZodError) {
      invalidConfig("data_root_failed_validation", error);
    }
    if (isErrno(error, "EEXIST") || isErrno(error, "ENOTDIR")) {
      throw createEventStoreError(
        "EVENT_STORE_PATH_CONFLICT",
        "The event store data root conflicts with a non-directory entry.",
        { expectedKind: "directory", actualKind: "other" },
        error,
      );
    }
    throw mapStorageIoError(
      error,
      "The event store data root could not be initialized.",
    );
  }
}

async function ensureSessionsDirectory(
  dataRoot: string,
  dependencies: EventStoreDependencies,
): Promise<string> {
  const sessionsRoot = path.join(dataRoot, "sessions");
  try {
    try {
      const existing = await dependencies.fs.lstat(sessionsRoot);
      if (existing.isSymbolicLink()) {
        throw createEventStoreError(
          "EVENT_STORE_SYMLINK_DENIED",
          "The event store sessions directory cannot be a symbolic link.",
        );
      }
      if (!existing.isDirectory()) {
        throw createEventStoreError(
          "EVENT_STORE_PATH_CONFLICT",
          "The event store sessions path is not a directory.",
          { expectedKind: "directory", actualKind: "other" },
        );
      }
    } catch (error) {
      if (!isErrno(error, "ENOENT")) {
        throw error;
      }
      await dependencies.fs.mkdir(sessionsRoot, {
        recursive: false,
        mode: 0o700,
      });
    }

    const realSessionsRoot = await dependencies.fs.realpath(sessionsRoot);
    if (
      realSessionsRoot !== sessionsRoot ||
      path.dirname(realSessionsRoot) !== dataRoot
    ) {
      throw createEventStoreError(
        "EVENT_STORE_SYMLINK_DENIED",
        "The event store sessions directory changed identity.",
      );
    }
    return realSessionsRoot;
  } catch (error) {
    throw mapStorageIoError(
      error,
      "The event store sessions directory could not be initialized.",
    );
  }
}

export async function initializeEventStoreConfig(
  pending: PendingEventStoreConfig,
  dependencies: EventStoreDependencies,
): Promise<InitializedEventStoreConfig> {
  const dataRoot = await ensureRootDirectory(
    pending.dataRootCandidate,
    dependencies,
  );
  const sessionsRoot = await ensureSessionsDirectory(dataRoot, dependencies);
  return Object.freeze({ dataRoot, sessionsRoot });
}
