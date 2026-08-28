import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  initializeEventStoreConfig,
  resolvePendingEventStoreConfig,
} from "@/lib/storage/config";
import {
  openVerifiedSessionFile,
  validateSessionDirectory,
} from "@/lib/storage/file-safety";

import {
  cleanupAllStorageFixtures,
  createInitializedTestStore,
  createStorageFixture,
  createTestDependencies,
} from "./helpers";

afterEach(cleanupAllStorageFixtures);

describe("event store file safety", () => {
  it("rejects a UUID session symlink", async () => {
    const fixture = await createStorageFixture();
    const dependencies = createTestDependencies();
    const config = await initializeEventStoreConfig(
      resolvePendingEventStoreConfig({ dataDir: fixture.dataDir }, dependencies),
      dependencies,
    );
    const sessionId = "123e4567-e89b-42d3-a456-426614174000";
    await fs.symlink(fixture.workspace, path.join(config.sessionsRoot, sessionId));
    await expect(
      validateSessionDirectory(config.sessionsRoot, sessionId, dependencies),
    ).rejects.toMatchObject({
      error: { code: "EVENT_STORE_SYMLINK_DENIED" },
    });
  });

  it("rejects a symlinked event file", async () => {
    const fixture = await createStorageFixture();
    const dependencies = createTestDependencies();
    const config = await initializeEventStoreConfig(
      resolvePendingEventStoreConfig({ dataDir: fixture.dataDir }, dependencies),
      dependencies,
    );
    const sessionId = "123e4567-e89b-42d3-a456-426614174000";
    const sessionPath = path.join(config.sessionsRoot, sessionId);
    const outsideFile = path.join(fixture.root, "outside.jsonl");
    await fs.mkdir(sessionPath);
    await fs.writeFile(outsideFile, "secret\n");
    await fs.symlink(outsideFile, path.join(sessionPath, "events.jsonl"));
    await expect(
      openVerifiedSessionFile(
        config.sessionsRoot,
        sessionId,
        "events.jsonl",
        "r",
        dependencies,
      ),
    ).rejects.toMatchObject({
      error: { code: "EVENT_STORE_SYMLINK_DENIED" },
    });
  });

  it("rejects a symlinked metadata file through the public store", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const session = await store.createSession({
      title: "Session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    const sessionPath = path.join(
      fixture.dataDir,
      "sessions",
      session.metadata.id,
    );
    const metadataPath = path.join(sessionPath, "session.json");
    const outsideFile = path.join(fixture.root, "outside-metadata.json");
    await fs.writeFile(outsideFile, "{}\n");
    await fs.rm(metadataPath);
    await fs.symlink(outsideFile, metadataPath);
    await expect(store.getSessionMetadata(session.metadata.id)).rejects.toMatchObject({
      error: { code: "EVENT_STORE_SYMLINK_DENIED" },
    });
  });

  it("detects a file identity change between lstat and open", async () => {
    const fixture = await createStorageFixture();
    const dependencies = createTestDependencies();
    const config = await initializeEventStoreConfig(
      resolvePendingEventStoreConfig({ dataDir: fixture.dataDir }, dependencies),
      dependencies,
    );
    const sessionId = "123e4567-e89b-42d3-a456-426614174000";
    const sessionPath = path.join(config.sessionsRoot, sessionId);
    const eventPath = path.join(sessionPath, "events.jsonl");
    const otherPath = path.join(fixture.root, "other-file");
    await fs.mkdir(sessionPath);
    await fs.writeFile(eventPath, "event\n");
    await fs.writeFile(otherPath, "other\n");
    const originalLstat = dependencies.fs.lstat;
    const changedDependencies = createTestDependencies({
      fs: {
        ...dependencies.fs,
        lstat: (async (target) =>
          String(target) === eventPath
            ? fs.lstat(otherPath)
            : originalLstat(target)) as typeof dependencies.fs.lstat,
      },
    });
    await expect(
      openVerifiedSessionFile(
        config.sessionsRoot,
        sessionId,
        "events.jsonl",
        "r",
        changedDependencies,
      ),
    ).rejects.toMatchObject({
      error: { code: "EVENT_STORE_PATH_CONFLICT" },
    });
  });
});
