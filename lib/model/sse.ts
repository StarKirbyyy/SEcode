import { utf8ByteLength } from "@/lib/domain";

import {
  MAX_SSE_EVENT_BYTES,
  ModelAbortError,
  createModelError,
} from "./types";

export type SseStreamEvent =
  | { type: "data"; data: string }
  | { type: "done" };

export interface ParseSseOptions {
  signal: AbortSignal;
  maxEventBytes?: number;
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  options: ParseSseOptions,
): AsyncGenerator<SseStreamEvent> {
  const maxEventBytes = options.maxEventBytes ?? MAX_SSE_EVENT_BYTES;
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let dataLines: string[] = [];
  let dataBytes = 0;
  let completed = false;

  const abortReader = () => {
    void reader.cancel(options.signal.reason).catch(() => undefined);
  };
  options.signal.addEventListener("abort", abortReader, { once: true });

  const processLine = (line: string): SseStreamEvent | undefined => {
    if (line === "") {
      if (dataLines.length === 0) {
        return undefined;
      }
      const data = dataLines.join("\n");
      dataLines = [];
      dataBytes = 0;
      return data.trim() === "[DONE]"
        ? { type: "done" }
        : { type: "data", data };
    }

    if (line.startsWith(":")) {
      return undefined;
    }

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    if (field !== "data") {
      return undefined;
    }
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    dataBytes += utf8ByteLength(value) + (dataLines.length === 0 ? 0 : 1);
    if (dataBytes > maxEventBytes) {
      throw createModelError(
        "MODEL_RESPONSE_TOO_LARGE",
        "模型 SSE 事件超过大小限制",
        false,
        { limitBytes: maxEventBytes },
      );
    }
    dataLines.push(value);
    return undefined;
  };

  const extractLines = function* (atEof: boolean): Generator<string> {
    while (buffer.length > 0) {
      const lf = buffer.indexOf("\n");
      const cr = buffer.indexOf("\r");
      let end = -1;
      if (lf !== -1 && cr !== -1) {
        end = Math.min(lf, cr);
      } else {
        end = Math.max(lf, cr);
      }
      if (end === -1) {
        break;
      }
      if (buffer[end] === "\r" && end === buffer.length - 1 && !atEof) {
        break;
      }
      const line = buffer.slice(0, end);
      const width =
        buffer[end] === "\r" && buffer[end + 1] === "\n" ? 2 : 1;
      buffer = buffer.slice(end + width);
      yield line;
    }
    if (atEof && buffer.length > 0) {
      const tail = buffer;
      buffer = "";
      yield tail;
    }
  };

  try {
    while (!completed) {
      if (options.signal.aborted) {
        throw new ModelAbortError("模型 SSE 读取已取消", options.signal.reason);
      }
      const { done, value } = await reader.read();
      if (options.signal.aborted) {
        throw new ModelAbortError("模型 SSE 读取已取消", options.signal.reason);
      }
      if (done) {
        try {
          buffer += decoder.decode();
        } catch (cause) {
          throw createModelError(
            "MODEL_PROTOCOL_ERROR",
            "模型 SSE 包含非法 UTF-8",
            false,
            undefined,
            cause,
          );
        }
        for (const line of extractLines(true)) {
          const event = processLine(line);
          if (event) {
            yield event;
            if (event.type === "done") {
              completed = true;
              break;
            }
          }
        }
        if (!completed && dataLines.length > 0) {
          const event = processLine("");
          if (event) {
            yield event;
            completed = event.type === "done";
          }
        }
        break;
      }

      try {
        buffer += decoder.decode(value, { stream: true });
      } catch (cause) {
        throw createModelError(
          "MODEL_PROTOCOL_ERROR",
          "模型 SSE 包含非法 UTF-8",
          false,
          undefined,
          cause,
        );
      }
      for (const line of extractLines(false)) {
        const event = processLine(line);
        if (event) {
          yield event;
          if (event.type === "done") {
            completed = true;
            await reader.cancel("SSE completed").catch(() => undefined);
            break;
          }
        }
      }
    }
  } finally {
    options.signal.removeEventListener("abort", abortReader);
    reader.releaseLock();
  }
}
