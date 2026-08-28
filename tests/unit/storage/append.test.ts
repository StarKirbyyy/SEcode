import * as fs from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import type { EventStoreDependencies } from "@/lib/storage/dependencies";
import { MAX_EVENT_LINE_BYTES } from "@/lib/storage";

import {
  cleanupAllStorageFixtures,
  createInitializedTestStore,
  createStorageFixture,
  createTestDependencies,
  errno,
} from "./helpers";

afterEach(cleanupAllStorageFixtures);

describe("durable event append", () => {
  it("allocates continuous sequence numbers and validates the envelope", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const session = await store.createSession({
      title: "Session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    const runId = "123e4567-e89b-42d3-a456-426614174010";
    const started = await store.appendEvent(session.metadata.id, {
      type: "run.started",
      runId,
      data: {
        promptPreview: "Fix tests",
        limits: { maxIterations: 30, maxDurationMs: 600_000 },
      },
    });
    const message = await store.appendEvent(session.metadata.id, {
      type: "user.message",
      runId,
      data: { content: "修复测试" },
    });
    expect(started.seq).toBe(2);
    expect(message.seq).toBe(3);
    expect(message).toMatchObject({
      protocolVersion: 1,
      durable: true,
      sessionId: session.metadata.id,
    });
    expect(Object.isFrozen(message)).toBe(true);
  });

  it("serializes concurrent appends for one session", async () => {
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
        promptPreview: "Concurrent",
        limits: { maxIterations: 30, maxDurationMs: 600_000 },
      },
    });
    const events = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        store.appendEvent(session.metadata.id, {
          type: "user.message",
          runId,
          data: { content: `message-${index}` },
        }),
      ),
    );
    expect(events.map((event) => event.seq)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 3),
    );
    const page = await store.readEvents(session.metadata.id, { limit: 100 });
    expect(page.events.map((event) => event.seq)).toEqual(
      Array.from({ length: 14 }, (_, index) => index + 1),
    );
  });

  it("rejects forbidden or malformed drafts before writing", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const session = await store.createSession({
      title: "Session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    await expect(
      store.appendEvent(session.metadata.id, {
        type: "assistant.delta",
        runId: "123e4567-e89b-42d3-a456-426614174010",
        data: { content: "delta" },
      } as never),
    ).rejects.toMatchObject({ error: { code: "EVENT_TYPE_FORBIDDEN" } });
    expect((await store.inspectSession(session.metadata.id)).lastSeq).toBe(1);
  });

  it("detects a generated event identifier collision", async () => {
    const fixture = await createStorageFixture();
    const sessionId = "123e4567-e89b-42d3-a456-426614174000";
    const nonce = "123e4567-e89b-42d3-a456-426614174001";
    const eventId = "123e4567-e89b-42d3-a456-426614174002";
    const values = [sessionId, nonce, eventId, eventId];
    const store = await createInitializedTestStore(
      fixture,
      createTestDependencies({ randomUUID: () => values.shift() ?? eventId }),
    );
    const session = await store.createSession({
      title: "Session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    await expect(
      store.appendEvent(session.metadata.id, {
        type: "run.started",
        runId: "123e4567-e89b-42d3-a456-426614174010",
        data: {
          promptPreview: "Collision",
          limits: { maxIterations: 30, maxDurationMs: 600_000 },
        },
      }),
    ).rejects.toMatchObject({ error: { code: "EVENT_ID_DUPLICATE" } });
  });

  it("keeps sequence numbers independent across sessions", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const input = {
      title: "Session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    };
    const [first, second] = await Promise.all([
      store.createSession(input),
      store.createSession({ ...input, title: "Second" }),
    ]);
    const runId = "123e4567-e89b-42d3-a456-426614174010";
    const [firstEvent, secondEvent] = await Promise.all([
      store.appendEvent(first.metadata.id, {
        type: "run.started",
        runId,
        data: {
          promptPreview: "First",
          limits: { maxIterations: 30, maxDurationMs: 600_000 },
        },
      }),
      store.appendEvent(second.metadata.id, {
        type: "run.started",
        runId,
        data: {
          promptPreview: "Second",
          limits: { maxIterations: 30, maxDurationMs: 600_000 },
        },
      }),
    ]);
    expect([firstEvent.seq, secondEvent.seq]).toEqual([2, 2]);
  });

  it("returns commit uncertain when append sync fails and reloads from disk", async () => {
    const fixture = await createStorageFixture();
    const native = createTestDependencies();
    let failAppendSync = false;
    const wrappedOpen = async (...args: Parameters<typeof fs.open>) => {
      const handle = await fs.open(...args);
      if (failAppendSync && args[1] === "a") {
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
    const session = await store.createSession({
      title: "Session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    failAppendSync = true;
    await expect(
      store.appendEvent(session.metadata.id, {
        type: "run.started",
        runId: "123e4567-e89b-42d3-a456-426614174010",
        data: {
          promptPreview: "Uncertain",
          limits: { maxIterations: 30, maxDurationMs: 600_000 },
        },
      }),
    ).rejects.toMatchObject({
      error: { code: "EVENT_COMMIT_UNCERTAIN", recoverable: false },
    });
    failAppendSync = false;
    expect((await store.inspectSession(session.metadata.id)).lastSeq).toBe(2);
  });

  it("rejects an oversized draft before opening the append file", async () => {
    const fixture = await createStorageFixture();
    const store = await createInitializedTestStore(fixture);
    const session = await store.createSession({
      title: "Session",
      workspacePath: fixture.workspace,
      modelProfileId: "deepseek",
    });
    await expect(
      store.appendEvent(session.metadata.id, {
        type: "tool.requested",
        runId: "123e4567-e89b-42d3-a456-426614174010",
        data: {
          toolCallId: "123e4567-e89b-42d3-a456-426614174011",
          toolName: "read_file",
          publicArguments: { oversized: "x".repeat(MAX_EVENT_LINE_BYTES) },
          argumentsTruncated: false,
        },
      }),
    ).rejects.toMatchObject({
      error: { code: "EVENT_TOO_LARGE", recoverable: true },
    });
    expect((await store.inspectSession(session.metadata.id)).lastSeq).toBe(1);
  });
});
