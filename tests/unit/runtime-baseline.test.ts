import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

describe("Node.js runtime baseline", () => {
  it("supports UUID generation used by sessions and events", () => {
    expect(randomUUID()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("supports Web ReadableStream used by NDJSON responses", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("ready"));
        controller.close();
      },
    });

    await expect(new Response(stream).text()).resolves.toBe("ready");
  });

  it("supports abort signals used by model requests and processes", () => {
    const controller = new AbortController();
    controller.abort("cancelled");
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBe("cancelled");
  });
});
