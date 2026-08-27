import { describe, expect, it } from "vitest";

import { ModelAbortError, ModelLayerError } from "@/lib/model/types";
import { parseSseStream } from "@/lib/model/sse";

import { collectAsync, streamFromBytes, streamFromText } from "./helpers";

const SSE_FIXTURE = [
  ": keep-alive\r\n",
  "event: message\r\n",
  "data: {\"content\":\"中\r\n",
  "data: 文\"}\r\n",
  "id: ignored\r\n",
  "\r\n",
  "data:\r\n",
  "\r\n",
  "data: [DONE]\r\n",
  "\r\n",
].join("");

const EXPECTED_EVENTS = [
  { type: "data", data: "{\"content\":\"中\n文\"}" },
  { type: "data", data: "" },
  { type: "done" },
];

describe("SSE byte stream parser", () => {
  it("parses comments, fields, CRLF and multiple data lines", async () => {
    const events = await collectAsync(
      parseSseStream(streamFromText(SSE_FIXTURE), {
        signal: new AbortController().signal,
      }),
    );
    expect(events).toEqual(EXPECTED_EVENTS);
  });

  it("produces identical events at every byte boundary", async () => {
    const bytes = new TextEncoder().encode(SSE_FIXTURE);
    for (let boundary = 1; boundary < bytes.byteLength; boundary += 1) {
      const events = await collectAsync(
        parseSseStream(streamFromBytes(bytes, [boundary]), {
          signal: new AbortController().signal,
        }),
      );
      expect(events, `boundary ${boundary}`).toEqual(EXPECTED_EVENTS);
    }
  });

  it("handles a CR and LF split across chunks", async () => {
    const text = "data: one\r\n\r\ndata: [DONE]\r\n\r\n";
    const bytes = new TextEncoder().encode(text);
    const crBoundary = bytes.indexOf(13) + 1;

    await expect(
      collectAsync(
        parseSseStream(streamFromBytes(bytes, [crBoundary]), {
          signal: new AbortController().signal,
        }),
      ),
    ).resolves.toEqual([
      { type: "data", data: "one" },
      { type: "done" },
    ]);
  });

  it("flushes a final data event without an empty terminator", async () => {
    await expect(
      collectAsync(
        parseSseStream(streamFromText("data: tail"), {
          signal: new AbortController().signal,
        }),
      ),
    ).resolves.toEqual([{ type: "data", data: "tail" }]);
  });

  it("rejects oversized events", async () => {
    const operation = collectAsync(
      parseSseStream(streamFromText("data: too-large\n\n"), {
        signal: new AbortController().signal,
        maxEventBytes: 3,
      }),
    );
    await expect(operation).rejects.toBeInstanceOf(ModelLayerError);
    await expect(operation).rejects.toMatchObject({
      error: { code: "MODEL_RESPONSE_TOO_LARGE" },
    });
  });

  it("turns caller cancellation into ModelAbortError", async () => {
    const controller = new AbortController();
    controller.abort("user-cancelled");

    await expect(
      collectAsync(
        parseSseStream(streamFromText("data: ignored\n\n"), {
          signal: controller.signal,
        }),
      ),
    ).rejects.toBeInstanceOf(ModelAbortError);
  });

  it("rejects invalid UTF-8", async () => {
    const invalid = new Uint8Array([100, 97, 116, 97, 58, 32, 0xc3]);
    await expect(
      collectAsync(
        parseSseStream(streamFromBytes(invalid), {
          signal: new AbortController().signal,
        }),
      ),
    ).rejects.toMatchObject({
      error: { code: "MODEL_PROTOCOL_ERROR" },
    });
  });
});
