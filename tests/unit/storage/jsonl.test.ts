import * as fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { DurableAgentEvent } from "@/lib/domain";
import {
  repairIncompleteTail,
  scanEventLog,
  serializeDurableEvent,
} from "@/lib/storage/jsonl";
import { MAX_EVENT_LINE_BYTES } from "@/lib/storage/types";

import {
  cleanupAllStorageFixtures,
  createStorageFixture,
  createTestDependencies,
  errno,
} from "./helpers";

afterEach(cleanupAllStorageFixtures);

const sessionId = "123e4567-e89b-42d3-a456-426614174000";
const eventId = "123e4567-e89b-42d3-a456-426614174001";

function sessionEvent(): DurableAgentEvent {
  return {
    protocolVersion: 1,
    durable: true,
    id: eventId,
    seq: 1,
    sessionId,
    type: "session.created",
    createdAt: "2026-08-27T00:00:00.000Z",
    data: {
      session: {
        id: sessionId,
        title: "测试会话",
        workspacePath: "/tmp/project",
        modelProfileId: "deepseek",
        status: "idle",
        createdAt: "2026-08-27T00:00:00.000Z",
        updatedAt: "2026-08-27T00:00:00.000Z",
      },
    },
  };
}

async function scanText(text: string, chunkBytes = 64 * 1024) {
  const fixture = await createStorageFixture();
  const file = path.join(fixture.root, "events.jsonl");
  await fs.writeFile(file, text);
  const handle = await fs.open(file, "r");
  try {
    return await scanEventLog(
      handle,
      { sessionId, afterSeq: 0, limit: 500, chunkBytes },
      createTestDependencies(),
    );
  } finally {
    await handle.close();
  }
}

describe("JSONL event primitives", () => {
  it("serializes one validated UTF-8 LF record", () => {
    const serialized = serializeDurableEvent(sessionEvent());
    expect(serialized.at(-1)).toBe(0x0a);
    expect(serialized.toString("utf8").split("\n")).toHaveLength(2);
  });

  it("parses UTF-8 correctly at one-byte chunk boundaries", async () => {
    const serialized = serializeDurableEvent(sessionEvent()).toString("utf8");
    const result = await scanText(serialized, 1);
    expect(result.events).toHaveLength(1);
    expect(result.firstEvent).toMatchObject({ type: "session.created" });
    expect(result.lastSeq).toBe(1);
    expect(result.discardedTailBytes).toBe(0);
  });

  it("reports but does not parse an unterminated final tail", async () => {
    const stable = serializeDurableEvent(sessionEvent()).toString("utf8");
    const result = await scanText(`${stable}{"partial":true}`, 3);
    expect(result.lastSeq).toBe(1);
    expect(result.discardedTailBytes).toBe(
      Buffer.byteLength('{"partial":true}'),
    );
  });

  it("discards an unterminated tail even when it is valid event JSON", async () => {
    const first = serializeDurableEvent(sessionEvent()).toString("utf8");
    const second = {
      ...sessionEvent(),
      id: "123e4567-e89b-42d3-a456-426614174002",
      seq: 2,
      type: "user.message" as const,
      runId: "123e4567-e89b-42d3-a456-426614174010",
      data: { content: "complete but not committed" },
    };
    const unterminated = serializeDurableEvent(second).subarray(0, -1);
    const result = await scanText(`${first}${unterminated.toString("utf8")}`, 5);
    expect(result.lastSeq).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(result.discardedTailBytes).toBe(unterminated.byteLength);
  });

  it("truncates an incomplete tail to the stable offset", async () => {
    const fixture = await createStorageFixture();
    const file = path.join(fixture.root, "events.jsonl");
    const stable = serializeDurableEvent(sessionEvent());
    await fs.writeFile(file, Buffer.concat([stable, Buffer.from("partial")]));
    const handle = await fs.open(file, "r+");
    await repairIncompleteTail(handle, stable.byteLength);
    await handle.close();
    expect(await fs.readFile(file)).toEqual(stable);
  });

  it("reports commit uncertainty when tail synchronization fails", async () => {
    const fixture = await createStorageFixture();
    const file = path.join(fixture.root, "events.jsonl");
    await fs.writeFile(file, "incomplete");
    const handle = await fs.open(file, "r+");
    const failingHandle = new Proxy(handle, {
      get(target, property) {
        if (property === "sync") {
          return async () => Promise.reject(errno("EIO"));
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      repairIncompleteTail(failingHandle as FileHandle, 0),
    ).rejects.toMatchObject({
      error: { code: "EVENT_COMMIT_UNCERTAIN", recoverable: false },
    });
    await handle.close();
  });

  it.each([
    ["empty line", `${serializeDurableEvent(sessionEvent()).toString()}\n`],
    ["CRLF", serializeDurableEvent(sessionEvent()).toString().replace("\n", "\r\n")],
    ["bad JSON", `${serializeDurableEvent(sessionEvent()).toString()}{bad}\n`],
    ["BOM", `\ufeff${serializeDurableEvent(sessionEvent()).toString()}`],
  ])("rejects a complete %s", async (_label, text) => {
    await expect(scanText(text, 2)).rejects.toMatchObject({
      error: { code: "EVENT_LOG_CORRUPT" },
    });
  });

  it("rejects a sequence gap and duplicate event identifier", async () => {
    const first = sessionEvent();
    const gap = {
      ...first,
      seq: 3,
      type: "user.message" as const,
      runId: "123e4567-e89b-42d3-a456-426614174010",
      data: { content: "task" },
    };
    await expect(
      scanText(
        `${serializeDurableEvent(first).toString()}${serializeDurableEvent(gap).toString()}`,
      ),
    ).rejects.toMatchObject({
      error: { code: "EVENT_SEQUENCE_CONFLICT" },
    });

    const duplicate = { ...gap, seq: 2 };
    await expect(
      scanText(
        `${serializeDurableEvent(first).toString()}${serializeDurableEvent(duplicate).toString()}`,
      ),
    ).rejects.toMatchObject({
      error: { code: "EVENT_ID_DUPLICATE" },
    });
  });

  it("rejects a second session.created and a wrong session identifier", async () => {
    const first = sessionEvent();
    const duplicateCreation = {
      ...first,
      id: "123e4567-e89b-42d3-a456-426614174002",
      seq: 2,
    };
    await expect(
      scanText(
        `${serializeDurableEvent(first).toString()}${serializeDurableEvent(duplicateCreation).toString()}`,
      ),
    ).rejects.toMatchObject({ error: { code: "EVENT_LOG_CORRUPT" } });

    const wrongSession = {
      ...first,
      id: "123e4567-e89b-42d3-a456-426614174003",
      seq: 2,
      sessionId: "123e4567-e89b-42d3-a456-426614174099",
      type: "user.message" as const,
      runId: "123e4567-e89b-42d3-a456-426614174010",
      data: { content: "wrong" },
    };
    await expect(
      scanText(
        `${serializeDurableEvent(first).toString()}${serializeDurableEvent(wrongSession).toString()}`,
      ),
    ).rejects.toMatchObject({ error: { code: "EVENT_SESSION_MISMATCH" } });
  });

  it("rejects unknown protocol and live-event records", async () => {
    const first = sessionEvent();
    await expect(
      scanText(`${JSON.stringify({ ...first, protocolVersion: 2 })}\n`),
    ).rejects.toMatchObject({ error: { code: "EVENT_LOG_CORRUPT" } });
    await expect(
      scanText(
        `${JSON.stringify({
          protocolVersion: 1,
          durable: false,
          id: eventId,
          streamSeq: 1,
          sessionId,
          runId: "123e4567-e89b-42d3-a456-426614174010",
          type: "assistant.delta",
          createdAt: "2026-08-27T00:00:00.000Z",
          data: { content: "delta" },
        })}\n`,
      ),
    ).rejects.toMatchObject({ error: { code: "EVENT_LOG_CORRUPT" } });
  });

  it("rejects complete records larger than the hard limit", async () => {
    const fixture = await createStorageFixture();
    const file = path.join(fixture.root, "events.jsonl");
    const prefix = serializeDurableEvent(sessionEvent());
    await fs.writeFile(
      file,
      Buffer.concat([
        prefix,
        Buffer.alloc(MAX_EVENT_LINE_BYTES, 0x20),
        Buffer.from("\n"),
      ]),
    );
    const handle = await fs.open(file, "r");
    await expect(
      scanEventLog(
        handle,
        { sessionId, afterSeq: 0, limit: 1, chunkBytes: 1_024 },
        createTestDependencies(),
      ),
    ).rejects.toMatchObject({ error: { code: "EVENT_TOO_LARGE" } });
    await handle.close();
  });
});
