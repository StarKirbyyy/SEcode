import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createJsonlEventStoreWithDependencies } from "@/lib/storage/event-store";
import type { EventStoreDependencies } from "@/lib/storage/dependencies";

import {
  cleanupAllStorageFixtures,
  createInitializedTestStore,
  createStorageFixture,
  createTestDependencies,
  errno,
} from "./helpers";

afterEach(cleanupAllStorageFixtures);

describe("JSONL session creation", () => {
  it("requires explicit initialization", async () => {
    const fixture = await createStorageFixture();
    const store = createJsonlEventStoreWithDependencies(
      { dataDir: fixture.dataDir },
      createTestDependencies(),
    );
    await expect(store.listSessions()).rejects.toMatchObject({
      error: { code: "EVENT_STORE_NOT_INITIALIZED", recoverable: true },
    });
    await expect(store.readEvents("not-a-uuid", { limit: -1 })).rejects.toMatchObject({
      error: { code: "EVENT_STORE_NOT_INITIALIZED" },
    });
  });

  it("atomically creates matching metadata and session.created", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const created = await store.createSession({
      title: "Agent session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    expect(created.event).toMatchObject({
      seq: 1,
      sessionId: created.metadata.id,
      type: "session.created",
    });
    expect(created.event.runId).toBeUndefined();
    expect(created.session).toMatchObject({
      status: "idle",
      createdAt: created.session.updatedAt,
    });
    expect(Object.isFrozen(created)).toBe(true);
    expect(Object.isFrozen(created.event.data)).toBe(true);

    const sessionPath = path.join(
      fixture.dataDir,
      "sessions",
      created.metadata.id,
    );
    const metadata = JSON.parse(
      (await fs.readFile(path.join(sessionPath, "session.json"), "utf8")).trim(),
    );
    const event = JSON.parse(
      (await fs.readFile(path.join(sessionPath, "events.jsonl"), "utf8")).trim(),
    );
    expect(metadata).toEqual(created.metadata);
    expect(event).toEqual(created.event);
    if (process.platform !== "win32") {
      expect((await fs.stat(sessionPath)).mode & 0o777).toBe(0o700);
      expect((await fs.stat(path.join(sessionPath, "session.json"))).mode & 0o777).toBe(
        0o600,
      );
    }
  });

  it("loads immutable metadata and ignores residual temporary directories", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const created = await store.createSession({
      title: "Session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    await fs.mkdir(path.join(fixture.dataDir, "sessions", ".creating-residual"));
    expect(await store.getSessionMetadata(created.metadata.id)).toEqual(
      created.metadata,
    );
    expect(await store.listSessions()).toEqual([created.metadata]);
  });

  it("does not overwrite a generated session identifier conflict", async () => {
    const fixture = await createStorageFixture();
    const sameUuid = "123e4567-e89b-42d3-a456-426614174000";
    const store = await createInitializedTestStore(
      fixture,
      createTestDependencies({ randomUUID: () => sameUuid }),
    );
    const input = {
      title: "Session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    };
    await store.createSession(input);
    await expect(store.createSession(input)).rejects.toMatchObject({
      error: { code: "SESSION_ALREADY_EXISTS" },
    });
    expect(await store.listSessions()).toHaveLength(1);
  });

  it("returns commit uncertain when parent directory sync fails after rename", async () => {
    const fixture = await createStorageFixture();
    const native = createTestDependencies();
    let failDirectorySync = false;
    const wrappedOpen = async (...args: Parameters<typeof fs.open>) => {
      const handle = await fs.open(...args);
      if (
        failDirectorySync &&
        path.basename(String(args[0])) === "sessions"
      ) {
        return new Proxy(handle, {
          get(target, property) {
            if (property === "sync") {
              return async () => Promise.reject(errno("EIO"));
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      }
      return handle;
    };
    const dependencies: EventStoreDependencies = {
      ...native,
      fs: {
        ...native.fs,
        open: wrappedOpen as typeof native.fs.open,
      },
    };
    const store = await createInitializedTestStore(fixture, dependencies);
    failDirectorySync = true;
    await expect(
      store.createSession({
        title: "Uncertain",
        workspacePath: fixture.workspace,
        modelProfileId: "deepseek",
      }),
    ).rejects.toMatchObject({
      error: { code: "EVENT_COMMIT_UNCERTAIN", recoverable: false },
    });
    failDirectorySync = false;
    expect(await store.listSessions()).toHaveLength(1);
  });

  it("maps an invalid injected clock to a structured configuration error", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(
      fixture,
      createTestDependencies({ now: () => "not-a-date" }),
    );
    await expect(
      store.createSession({
        title: "Session",
        workspacePath: fixture.workspace,
        modelProfileId: "deepseek",
      }),
    ).rejects.toMatchObject({
      error: { code: "EVENT_STORE_CONFIG_INVALID" },
    });
  });
});
