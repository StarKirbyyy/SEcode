import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  nativeEventStoreDependencies,
  type EventStoreDependencies,
} from "@/lib/storage/dependencies";
import { createJsonlEventStoreWithDependencies } from "@/lib/storage/event-store";
import type { JsonlEventStore } from "@/lib/storage";

export const STORAGE_TEST_PREFIX = "secode-storage-test-";

const registeredRoots = new Set<string>();

export interface StorageFixture {
  readonly root: string;
  readonly dataDir: string;
  readonly workspace: string;
}

export async function createStorageFixture(): Promise<StorageFixture> {
  const root = await fs.mkdtemp(path.join(tmpdir(), STORAGE_TEST_PREFIX));
  registeredRoots.add(root);
  const dataDir = path.join(root, "data");
  const workspace = path.join(root, "workspace");
  await fs.mkdir(workspace);
  return { root, dataDir, workspace };
}

export async function cleanupStorageFixture(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  if (
    !registeredRoots.has(root) ||
    path.dirname(resolvedRoot) !== path.resolve(tmpdir()) ||
    !path.basename(resolvedRoot).startsWith(STORAGE_TEST_PREFIX)
  ) {
    throw new Error("refusing to clean an unregistered storage fixture");
  }
  registeredRoots.delete(root);
  await fs.rm(resolvedRoot, { recursive: true, force: true });
}

export async function cleanupAllStorageFixtures(): Promise<void> {
  for (const root of [...registeredRoots]) {
    await cleanupStorageFixture(root);
  }
}

export function createTestDependencies(
  overrides: Partial<EventStoreDependencies> = {},
): EventStoreDependencies {
  return {
    ...nativeEventStoreDependencies,
    randomUUID,
    now: () => "2026-08-27T12:00:00.000Z",
    readEnvironment: () => undefined,
    ...overrides,
  };
}

export function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error("private filesystem failure"), {
    code,
    path: "/private/secret/storage-path",
    syscall: "open",
  });
}

export async function createInitializedTestStore(
  fixture: StorageFixture,
  dependencies = createTestDependencies(),
): Promise<JsonlEventStore> {
  const store = createJsonlEventStoreWithDependencies(
    { dataDir: fixture.dataDir },
    dependencies,
  );
  await store.initialize();
  return store;
}
