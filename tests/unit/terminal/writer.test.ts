import { describe, expect, it } from "vitest";

import { SerializedTerminalWriter } from "@/lib/terminal/writer";
import { TerminalLayerError } from "@/lib/terminal/errors";

describe("serialized terminal writer", () => {
  it("preserves enqueue order even when writes resolve asynchronously", async () => {
    const calls: string[] = [];
    const writer = new SerializedTerminalWriter({
      async write(frame) {
        await Promise.resolve();
        calls.push(`${frame.mode}:${frame.text}`);
      },
    });
    await Promise.all([
      writer.write({ channel: "stdout", mode: "append", text: "A" }),
      writer.write({ channel: "stdout", mode: "line", text: "B" }),
      writer.write({ channel: "stderr", mode: "line", text: "C" }),
    ]);
    await writer.flush();
    expect(calls).toEqual(["append:A", "line:B", "line:C"]);
  });

  it("applies terminal safety as a final defense", async () => {
    const calls: string[] = [];
    const writer = new SerializedTerminalWriter({ async write(frame) { calls.push(frame.text); } });
    await writer.write({ channel: "stdout", mode: "line", text: "x\x1b[2J sk-abcdefgh" });
    expect(calls[0]).toBe("x\\u001B[2J [REDACTED]");
  });

  it("latches the first I/O failure and does not call the sink again", async () => {
    let calls = 0;
    const writer = new SerializedTerminalWriter({ async write() { calls += 1; throw new Error("private"); } });
    const first = await writer.write({ channel: "stdout", mode: "line", text: "one" }).catch((error: unknown) => error);
    const second = await writer.write({ channel: "stdout", mode: "line", text: "two" }).catch((error: unknown) => error);
    expect(first).toBeInstanceOf(TerminalLayerError);
    expect(second).toBe(first);
    expect(calls).toBe(1);
    expect(writer.failed).toBe(true);
    await expect(writer.flush()).rejects.toBe(first);
  });
});
