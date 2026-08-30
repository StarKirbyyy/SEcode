import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createJsonlEventStoreWithDependencies } from "@/lib/storage/event-store";

import {
  cleanupAllStorageFixtures,
  createInitializedTestStore,
  createStorageFixture,
  createTestDependencies,
  errno,
} from "./helpers";

afterEach(cleanupAllStorageFixtures);

async function createSession(fixture: Awaited<ReturnType<typeof createStorageFixture>>) {
  const store = await createInitializedTestStore(fixture);
  const created = await store.createSession({
    title: "Delete me",
    workspacePath: fixture.workspace,
    modelProfileId: "deepseek",
  });
  return { store, created };
}

describe("JSONL session deletion", () => {
  it("deletes only the selected session and never touches its workspace", async () => {
    const fixture = await createStorageFixture();
    const marker = path.join(fixture.workspace, "keep.txt");
    await fs.writeFile(marker, "workspace remains\n", "utf8");
    const { store, created } = await createSession(fixture);
    const other = await store.createSession({
      title: "Keep me",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });

    await expect(store.deleteSession(created.metadata.id)).resolves.toEqual({
      sessionId: created.metadata.id,
      status: "deleted",
    });
    await expect(store.getSessionMetadata(created.metadata.id)).rejects.toMatchObject({
      error: { code: "SESSION_NOT_FOUND" },
    });
    expect(await store.listSessions()).toEqual([other.metadata]);
    expect(await fs.readFile(marker, "utf8")).toBe("workspace remains\n");
  });

  it("maps malformed and missing session identifiers to not found", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    await expect(store.deleteSession("not-a-uuid" as never)).rejects.toMatchObject({
      error: { code: "SESSION_NOT_FOUND", recoverable: true },
    });
    await expect(
      store.deleteSession("00000000-0000-4000-8000-000000000099"),
    ).rejects.toMatchObject({ error: { code: "SESSION_NOT_FOUND" } });
  });

  it("rejects a UUID session symlink without deleting its target", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const id = "00000000-0000-4000-8000-000000000099";
    await fs.symlink(fixture.workspace, path.join(fixture.dataDir, "sessions", id));
    await expect(store.deleteSession(id)).rejects.toMatchObject({
      error: { code: "EVENT_STORE_SYMLINK_DENIED" },
    });
    await expect(fs.stat(fixture.workspace)).resolves.toMatchObject({});
  });

  it("uses recursive rm only for a controlled tombstone direct child", async () => {
    const fixture = await createStorageFixture();
    const native = createTestDependencies();
    const removed: string[] = [];
    const dependencies = createTestDependencies({
      fs: {
        ...native.fs,
        rm: (async (target, options) => {
          removed.push(String(target));
          return native.fs.rm(target, options);
        }) as typeof native.fs.rm,
      },
    });
    const store = createJsonlEventStoreWithDependencies({ dataDir: fixture.dataDir }, dependencies);
    await store.initialize();
    const created = await store.createSession({ title: "Session", workspacePath: fixture.workspace, modelProfileId: "deepseek" });
    await store.deleteSession(created.metadata.id);

    expect(removed).toHaveLength(1);
    expect(path.dirname(removed[0]!)).toBe(
      await fs.realpath(path.join(fixture.dataDir, "sessions")),
    );
    expect(path.basename(removed[0]!)).toMatch(
      new RegExp(`^\\.deleting-${created.metadata.id}-[0-9a-f-]{36}$`, "u"),
    );
    expect(removed).not.toContain(fixture.workspace);
    expect(removed).not.toContain(fixture.dataDir);
    expect(removed).not.toContain(path.join(fixture.dataDir, "sessions"));
  });

  it("reports an uncertain commit if tombstone cleanup fails after rename", async () => {
    const fixture = await createStorageFixture();
    const native = createTestDependencies();
    let failDelete = false;
    const dependencies = createTestDependencies({
      fs: {
        ...native.fs,
        rm: (async (target, options) => {
          if (failDelete && path.basename(String(target)).startsWith(".deleting-")) {
            throw errno("EIO");
          }
          return native.fs.rm(target, options);
        }) as typeof native.fs.rm,
      },
    });
    const store = createJsonlEventStoreWithDependencies({ dataDir: fixture.dataDir }, dependencies);
    await store.initialize();
    const created = await store.createSession({ title: "Session", workspacePath: fixture.workspace, modelProfileId: "deepseek" });
    failDelete = true;

    await expect(store.deleteSession(created.metadata.id)).rejects.toMatchObject({
      error: { code: "EVENT_COMMIT_UNCERTAIN", recoverable: false },
    });
    expect(await store.listSessions()).toEqual([]);
    expect((await fs.readdir(path.join(fixture.dataDir, "sessions"))).some((name) => name.startsWith(".deleting-"))).toBe(true);
  });

  it("cleans only valid deletion tombstones during initialization", async () => {
    const fixture = await createStorageFixture();
    const sessionsRoot = path.join(fixture.dataDir, "sessions");
    await fs.mkdir(sessionsRoot, { recursive: true });
    const valid = ".deleting-00000000-0000-4000-8000-000000000001-00000000-0000-4000-8000-000000000002";
    const similar = ".deleting-not-a-session";
    await fs.mkdir(path.join(sessionsRoot, valid));
    await fs.mkdir(path.join(sessionsRoot, similar));
    await fs.writeFile(path.join(sessionsRoot, valid, "residual"), "old\n");

    const store = createJsonlEventStoreWithDependencies(
      { dataDir: fixture.dataDir },
      createTestDependencies(),
    );
    await store.initialize();

    await expect(fs.lstat(path.join(sessionsRoot, valid))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.lstat(path.join(sessionsRoot, similar))).resolves.toMatchObject({});
  });

  it("serializes deletion behind an in-flight session read", async () => {
    const fixture = await createStorageFixture();
    const native = createTestDependencies();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let markEntered!: () => void;
    const entered = new Promise<void>((resolve) => { markEntered = resolve; });
    let blockRead = false;
    const dependencies = createTestDependencies({
      fs: {
        ...native.fs,
        open: (async (...args: Parameters<typeof fs.open>) => {
          if (blockRead && path.basename(String(args[0])) === "events.jsonl" && args[1] === "r") {
            markEntered();
            await gate;
          }
          return fs.open(...args);
        }) as typeof native.fs.open,
      },
    });
    const store = createJsonlEventStoreWithDependencies({ dataDir: fixture.dataDir }, dependencies);
    await store.initialize();
    const created = await store.createSession({ title: "Session", workspacePath: fixture.workspace, modelProfileId: "deepseek" });
    blockRead = true;
    const read = store.readEvents(created.metadata.id, { afterSeq: 0, limit: 10 });
    await entered;
    const deletion = store.deleteSession(created.metadata.id);
    let deleted = false;
    void deletion.then(() => { deleted = true; });
    await Promise.resolve();
    expect(deleted).toBe(false);
    release();
    await expect(read).resolves.toMatchObject({ lastSeq: 1 });
    await expect(deletion).resolves.toMatchObject({ status: "deleted" });
  });
});
