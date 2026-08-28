import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createJsonlEventStoreWithDependencies } from "@/lib/storage/event-store";

import {
  cleanupAllStorageFixtures,
  createInitializedTestStore,
  createStorageFixture,
  createTestDependencies,
} from "./helpers";

afterEach(cleanupAllStorageFixtures);

describe("event store restart recovery", () => {
  it("repairs an incomplete tail and reports an open run", async () => {
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
        promptPreview: "Recover",
        limits: { maxIterations: 30, maxDurationMs: 600_000 },
      },
    });
    const eventsPath = path.join(
      fixture.dataDir,
      "sessions",
      session.metadata.id,
      "events.jsonl",
    );
    await fs.appendFile(eventsPath, '{"type":"approval.resolved"}');

    const restarted = createJsonlEventStoreWithDependencies(
      { dataDir: fixture.dataDir },
      createTestDependencies(),
    );
    await restarted.initialize();
    const inspection = await restarted.inspectSession(session.metadata.id);
    expect(inspection.recovery).toEqual({
      tailRepaired: true,
      discardedTailBytes: Buffer.byteLength(
        '{"type":"approval.resolved"}',
      ),
      lastStableSeq: 2,
      openRunIds: [runId],
    });
    expect((await fs.readFile(eventsPath, "utf8")).endsWith("\n")).toBe(true);
  });

  it("does not report a run after a terminal event", async () => {
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
        promptPreview: "Complete",
        limits: { maxIterations: 30, maxDurationMs: 600_000 },
      },
    });
    await store.appendEvent(session.metadata.id, {
      type: "run.completed",
      runId,
      data: { iterations: 1, durationMs: 10 },
    });
    expect(
      (await store.inspectSession(session.metadata.id)).recovery.openRunIds,
    ).toEqual([]);
  });

  it("replays approval facts without returning an execution capability", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const session = await store.createSession({
      title: "Session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    const runId = "123e4567-e89b-42d3-a456-426614174010";
    const approvalId = "123e4567-e89b-42d3-a456-426614174011";
    const toolCallId = "123e4567-e89b-42d3-a456-426614174012";
    await store.appendEvent(session.metadata.id, {
      type: "run.started",
      runId,
      data: {
        promptPreview: "Approve",
        limits: { maxIterations: 30, maxDurationMs: 600_000 },
      },
    });
    await store.appendEvent(session.metadata.id, {
      type: "approval.required",
      runId,
      data: {
        approvalId,
        toolCallId,
        reason: "Dependency installation",
        toolSummary: "pnpm add package",
      },
    });
    await store.appendEvent(session.metadata.id, {
      type: "approval.resolved",
      runId,
      data: { approvalId, approved: true },
    });
    const page = await store.readEvents(session.metadata.id);
    expect(page.events.some((event) => event.type === "approval.resolved")).toBe(
      true,
    );
    expect(JSON.stringify(page)).not.toMatch(
      /authorization|PendingToolApproval|preparedInvocation/,
    );
  });

  it("fails closed on a newline-terminated corrupt record", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const session = await store.createSession({
      title: "Session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    const eventsPath = path.join(
      fixture.dataDir,
      "sessions",
      session.metadata.id,
      "events.jsonl",
    );
    await fs.appendFile(eventsPath, "{bad}\n");
    await expect(store.inspectSession(session.metadata.id)).rejects.toMatchObject({
      error: { code: "EVENT_LOG_CORRUPT", recoverable: false },
    });
  });
});
