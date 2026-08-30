import { describe, expect, it } from "vitest";

import {
  MAX_CLIENT_NDJSON_LINE_BYTES,
  parseAgentEventStream,
} from "@/lib/client/ndjson";

const ID = "00000000-0000-4000-8000-000000000001";
const ID2 = "00000000-0000-4000-8000-000000000002";
const NOW = "2026-08-28T00:00:00.000Z";

function delta(content = "你好，SEcode") {
  return { protocolVersion: 1, durable: false, id: ID2, streamSeq: 1, sessionId: ID, runId: ID2, type: "assistant.delta", createdAt: NOW, data: { content } };
}

function stream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function collect(input: ReadableStream<Uint8Array>) {
  const output = [];
  for await (const event of parseAgentEventStream(input)) output.push(event);
  return output;
}

describe("NDJSON agent event parser", () => {
  it("parses multibyte content at every byte boundary", async () => {
    const bytes = new TextEncoder().encode(`${JSON.stringify(delta())}\n`);
    for (let boundary = 0; boundary <= bytes.length; boundary += 1) {
      await expect(collect(stream([bytes.slice(0, boundary), bytes.slice(boundary)]))).resolves.toEqual([delta()]);
    }
  });

  it("accepts LF, CRLF and blank lines without dropping the final legal line", async () => {
    const second = { ...delta("第二条"), id: "00000000-0000-4000-8000-000000000003", streamSeq: 2 };
    const bytes = new TextEncoder().encode(`\n${JSON.stringify(delta())}\r\n \r\n${JSON.stringify(second)}\n`);
    await expect(collect(stream([bytes]))).resolves.toEqual([delta(), second]);
  });

  it("accepts exactly 8 MiB and rejects one byte more", async () => {
    expect(MAX_CLIENT_NDJSON_LINE_BYTES).toBe(8 * 1024 * 1024);
    const empty = JSON.stringify(delta(""));
    const contentBytes = MAX_CLIENT_NDJSON_LINE_BYTES - new TextEncoder().encode(empty).byteLength;
    const exact = new TextEncoder().encode(`${JSON.stringify(delta("a".repeat(contentBytes)))}\n`);
    expect(exact.byteLength - 1).toBe(MAX_CLIENT_NDJSON_LINE_BYTES);
    await expect(collect(stream([exact]))).resolves.toHaveLength(1);
    const tooLarge = new TextEncoder().encode(`${JSON.stringify(delta("a".repeat(contentBytes + 1)))}\n`);
    await expect(collect(stream([tooLarge]))).rejects.toMatchObject({ code: "UI_STREAM_INVALID" });
  });

  it.each([
    [new Uint8Array([0xff, 0x0a]), "invalid UTF-8"],
    [new TextEncoder().encode("{bad}\n"), "invalid JSON"],
    [new TextEncoder().encode(`${JSON.stringify({ privateReasoning: "secret" })}\n`), "private frame"],
    [new TextEncoder().encode(JSON.stringify(delta())), "unterminated tail"],
  ] as const)("rejects %s", async (bytes, _label) => {
    void _label;
    await expect(collect(stream([bytes]))).rejects.toMatchObject({ code: "UI_STREAM_INVALID", recoverable: true });
  });

  it("allows whitespace-only EOF tails", async () => {
    await expect(collect(stream([new TextEncoder().encode(" \t\r")]))).resolves.toEqual([]);
  });

  it("accepts the durable language rejection event without a content field", async () => {
    const rejected = {
      protocolVersion: 1,
      durable: true,
      id: ID,
      seq: 1,
      sessionId: ID,
      runId: ID2,
      type: "model.output.rejected",
      createdAt: NOW,
      data: {
        iteration: 1,
        reason: "language_mismatch",
        action: "retry",
        retryAttempt: 1,
        contentCharacters: 24,
        contentSha256: "d".repeat(64),
      },
    };
    const bytes = new TextEncoder().encode(`${JSON.stringify(rejected)}\n`);
    await expect(collect(stream([bytes]))).resolves.toEqual([rejected]);
  });

  it("maps reader and abort errors to finite client errors", async () => {
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("private reader cause"));
      },
    });
    await expect(collect(broken)).rejects.toMatchObject({ code: "UI_STREAM_INVALID" });

    const aborted = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new DOMException("aborted", "AbortError"));
      },
    });
    await expect(collect(aborted)).rejects.toMatchObject({ code: "UI_OPERATION_ABORTED" });
  });
});
