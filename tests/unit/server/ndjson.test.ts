import { describe, expect, it, vi } from "vitest";

import type { AgentEvent } from "@/lib/domain";
import { createNdjsonEventBridgeWithLimits } from "@/lib/server/ndjson";

const event = (content = "中文🙂\ntext"): AgentEvent => ({
  protocolVersion: 1,
  durable: false,
  id: "00000000-0000-4000-8000-000000000001",
  streamSeq: 1,
  sessionId: "00000000-0000-4000-8000-000000000002",
  runId: "00000000-0000-4000-8000-000000000003",
  type: "assistant.delta",
  createdAt: "2026-08-28T00:00:00.000Z",
  data: { content },
});

describe("NDJSON event bridge", () => {
  it("prebuffers one UTF-8 event and round-trips one LF-delimited line", async () => {
    const bridge = createNdjsonEventBridgeWithLimits(undefined, { maximumLineBytes: 8_192, maximumQueueBytes: 16_384 });
    const original = event();
    await bridge.publish(original);
    const reader = bridge.stream.getReader();
    const chunk = (await reader.read()).value!;
    const text = new TextDecoder().decode(chunk);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.slice(0, -1)).not.toContain("\n\n");
    expect(JSON.parse(text)).toEqual(original);
    expect(original.data).toEqual({ content: "中文🙂\ntext" });
    const close = bridge.close();
    expect((await reader.read()).done).toBe(true);
    await close;
  });

  it("rejects oversized lines", async () => {
    const bridge = createNdjsonEventBridgeWithLimits(undefined, { maximumLineBytes: 128, maximumQueueBytes: 256 });
    await expect(bridge.publish(event("x".repeat(100)))).rejects.toMatchObject({ error: { code: "API_STREAM_FAILED" } });
  });

  it("applies FIFO backpressure and resumes after pull", async () => {
    const sampleBytes = new TextEncoder().encode(`${JSON.stringify(event("a"))}\n`).byteLength;
    const bridge = createNdjsonEventBridgeWithLimits(undefined, { maximumLineBytes: sampleBytes, maximumQueueBytes: sampleBytes });
    await bridge.publish(event("a"));
    let resolved = false;
    const second = bridge.publish(event("b")).then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);
    const reader = bridge.stream.getReader();
    expect(JSON.parse(new TextDecoder().decode((await reader.read()).value!)).data.content).toBe("a");
    await second;
    expect(JSON.parse(new TextDecoder().decode((await reader.read()).value!)).data.content).toBe("b");
  });

  it("cancels once, rejects waiters, and cancels a handle bound late", async () => {
    const onCancel = vi.fn();
    const cancel = vi.fn(() => true);
    const sampleBytes = new TextEncoder().encode(`${JSON.stringify(event("a"))}\n`).byteLength;
    const bridge = createNdjsonEventBridgeWithLimits(onCancel, { maximumLineBytes: sampleBytes, maximumQueueBytes: sampleBytes });
    await bridge.publish(event("a"));
    const pending = bridge.publish(event("b"));
    await bridge.stream.cancel();
    await expect(pending).rejects.toMatchObject({ error: { code: "API_STREAM_FAILED" } });
    bridge.bindRunHandle({ cancel });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    await bridge.stream.cancel();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
