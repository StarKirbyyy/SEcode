import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupAllStorageFixtures,
  createInitializedTestStore,
  createStorageFixture,
  createTestDependencies,
} from "./helpers";

afterEach(cleanupAllStorageFixtures);

describe("event store reads and derived lists", () => {
  it("returns bounded pages with log-wide lastSeq", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const session = await store.createSession({
      title: "Session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    const runId = "123e4567-e89b-42d3-a456-426614174010";
    await store.appendEvent(session.metadata.id, {
      type: "run.started",
      runId,
      data: {
        promptPreview: "Page",
        limits: { maxIterations: 30, maxDurationMs: 600_000 },
      },
    });
    await store.appendEvent(session.metadata.id, {
      type: "user.message",
      runId,
      data: { content: "Task" },
    });
    const first = await store.readEvents(session.metadata.id, { limit: 2 });
    expect(first.events.map((event) => event.seq)).toEqual([1, 2]);
    expect(first.lastSeq).toBe(3);
    expect(first.hasMore).toBe(true);
    const second = await store.readEvents(session.metadata.id, {
      afterSeq: 2,
      limit: 2,
    });
    expect(second.events.map((event) => event.seq)).toEqual([3]);
    expect(second.hasMore).toBe(false);
    expect(Object.isFrozen(second.events)).toBe(true);
  });

  it("derives recent workspaces from sorted session metadata", async () => {
    const fixture = await createStorageFixture();
    const timestamps = [
      "2026-08-27T12:00:00.000Z",
      "2026-08-27T12:01:00.000Z",
      "2026-08-27T12:02:00.000Z",
    ];
    const store = await createInitializedTestStore(
      fixture,
      createTestDependencies({
        now: () => timestamps.shift() ?? "2026-08-27T12:03:00.000Z",
      }),
    );
    const secondWorkspace = path.join(fixture.root, "workspace-two");
    await fs.mkdir(secondWorkspace);
    await store.createSession({
      title: "First",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    await store.createSession({
      title: "Duplicate workspace",
      workspacePath: fixture.workspace,
      modelProfileId: "longcat",
    });
    await store.createSession({
      title: "Second workspace",
      workspacePath: secondWorkspace,
      modelProfileId: "deepseek",
    });
    expect(await store.listSessions()).toHaveLength(3);
    expect(await store.listRecentWorkspaces()).toEqual([
      secondWorkspace,
      fixture.workspace,
    ]);
    expect(await store.listRecentWorkspaces({ limit: 1 })).toEqual([
      secondWorkspace,
    ]);
  });

  it("fails when metadata drifts from session.created", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const session = await store.createSession({
      title: "Original",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    const metadataPath = path.join(
      fixture.dataDir,
      "sessions",
      session.metadata.id,
      "session.json",
    );
    await fs.writeFile(
      metadataPath,
      `${JSON.stringify({ ...session.metadata, title: "Changed" })}\n`,
    );
    await expect(store.inspectSession(session.metadata.id)).rejects.toMatchObject({
      error: { code: "SESSION_METADATA_CORRUPT" },
    });
  });

  it("rejects metadata larger than the bounded reader limit", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const session = await store.createSession({
      title: "Original",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    const metadataPath = path.join(
      fixture.dataDir,
      "sessions",
      session.metadata.id,
      "session.json",
    );
    await fs.writeFile(metadataPath, Buffer.alloc(64 * 1024 + 1, 0x20));
    await expect(store.getSessionMetadata(session.metadata.id)).rejects.toMatchObject({
      error: { code: "SESSION_METADATA_CORRUPT" },
    });
  });
});
