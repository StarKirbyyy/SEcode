import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  initializeEventStoreConfig,
  resolvePendingEventStoreConfig,
} from "@/lib/storage/config";
import { EventStoreError } from "@/lib/storage/errors";

import {
  cleanupAllStorageFixtures,
  createStorageFixture,
  createTestDependencies,
} from "./helpers";

afterEach(cleanupAllStorageFixtures);

describe("event store configuration", () => {
  it("resolves the default relative to the captured cwd", () => {
    const dependencies = createTestDependencies({
      cwd: () => "/tmp/secode-app",
    });
    expect(resolvePendingEventStoreConfig({}, dependencies)).toEqual({
      dataRootCandidate: path.join("/tmp/secode-app", ".secode-data"),
    });
  });

  it("prefers explicit dataDir over the environment", () => {
    const dependencies = createTestDependencies({
      cwd: () => "/tmp/secode-app",
      readEnvironment: () => "from-environment",
    });
    expect(
      resolvePendingEventStoreConfig({ dataDir: "explicit" }, dependencies),
    ).toEqual({ dataRootCandidate: "/tmp/secode-app/explicit" });
  });

  it("rejects blank and NUL environment values without echoing them", () => {
    for (const configured of ["   ", "secret\0path"]) {
      const dependencies = createTestDependencies({
        readEnvironment: () => configured,
      });
      try {
        resolvePendingEventStoreConfig({}, dependencies);
        throw new Error("expected configuration failure");
      } catch (error) {
        expect(error).toBeInstanceOf(EventStoreError);
        expect(String(error)).not.toContain(configured);
      }
    }
  });

  it("initializes the data root and sessions directory idempotently", async () => {
    const fixture = await createStorageFixture();
    const dependencies = createTestDependencies();
    const pending = resolvePendingEventStoreConfig(
      { dataDir: fixture.dataDir },
      dependencies,
    );
    const first = await initializeEventStoreConfig(pending, dependencies);
    const second = await initializeEventStoreConfig(pending, dependencies);
    expect(second).toEqual(first);
    expect((await fs.stat(first.dataRoot)).isDirectory()).toBe(true);
    expect((await fs.stat(first.sessionsRoot)).isDirectory()).toBe(true);
    if (process.platform !== "win32") {
      expect((await fs.stat(first.sessionsRoot)).mode & 0o777).toBe(0o700);
    }
  });

  it("reports a non-directory data root as a path conflict", async () => {
    const fixture = await createStorageFixture();
    await fs.writeFile(fixture.dataDir, "not a directory");
    const dependencies = createTestDependencies();
    await expect(
      initializeEventStoreConfig(
        resolvePendingEventStoreConfig(
          { dataDir: fixture.dataDir },
          dependencies,
        ),
        dependencies,
      ),
    ).rejects.toMatchObject({
      error: { code: "EVENT_STORE_PATH_CONFLICT", recoverable: false },
    });
  });

  it("allows an explicit data-root symlink but rejects a sessions symlink", async () => {
    const fixture = await createStorageFixture();
    const target = path.join(fixture.root, "target");
    const linkedRoot = path.join(fixture.root, "linked-data");
    await fs.mkdir(target);
    await fs.symlink(target, linkedRoot, "dir");
    const dependencies = createTestDependencies();
    const initialized = await initializeEventStoreConfig(
      resolvePendingEventStoreConfig({ dataDir: linkedRoot }, dependencies),
      dependencies,
    );
    expect(initialized.dataRoot).toBe(await fs.realpath(target));

    const other = path.join(fixture.root, "other");
    await fs.mkdir(other);
    await fs.rm(initialized.sessionsRoot, { recursive: true });
    await fs.symlink(other, initialized.sessionsRoot, "dir");
    await expect(
      initializeEventStoreConfig(
        resolvePendingEventStoreConfig({ dataDir: linkedRoot }, dependencies),
        dependencies,
      ),
    ).rejects.toMatchObject({
      error: { code: "EVENT_STORE_SYMLINK_DENIED" },
    });
  });
});
