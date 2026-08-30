import { AgentEventSchema, type AgentEvent } from "@/lib/domain";

import { UiClientError } from "./api-client";

export const MAX_CLIENT_NDJSON_LINE_BYTES = 8 * 1024 * 1024;

function streamInvalid(message = "模型事件流不符合预期协议"): UiClientError {
  return new UiClientError("UI_STREAM_INVALID", message, true);
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function joinFragments(fragments: Uint8Array[], byteLength: number): Uint8Array {
  if (fragments.length === 1 && fragments[0]?.byteLength === byteLength) {
    return fragments[0];
  }
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const fragment of fragments) {
    output.set(fragment, offset);
    offset += fragment.byteLength;
  }
  return output;
}

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw streamInvalid("模型事件流包含无效 UTF-8");
  }
}

function parseLine(bytes: Uint8Array): AgentEvent | undefined {
  let line = bytes;
  if (line.at(-1) === 13) line = line.slice(0, -1);
  const text = decode(line);
  if (text.trim().length === 0) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw streamInvalid("模型事件流包含无效 JSON");
  }
  const parsed = AgentEventSchema.safeParse(value);
  if (!parsed.success) throw streamInvalid("模型事件流包含无效事件");
  return parsed.data;
}

export async function* parseAgentEventStream(
  stream: ReadableStream<Uint8Array>,
  options: { maximumLineBytes?: number } = {},
): AsyncGenerator<AgentEvent> {
  const maximumLineBytes = options.maximumLineBytes ?? MAX_CLIENT_NDJSON_LINE_BYTES;
  const reader = stream.getReader();
  let fragments: Uint8Array[] = [];
  let pendingBytes = 0;

  const append = (fragment: Uint8Array) => {
    pendingBytes += fragment.byteLength;
    if (pendingBytes > maximumLineBytes) {
      throw streamInvalid("模型事件流单行超过大小限制");
    }
    if (fragment.byteLength > 0) fragments.push(fragment);
  };

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      let start = 0;
      for (let index = 0; index < next.value.byteLength; index += 1) {
        if (next.value[index] !== 10) continue;
        append(next.value.slice(start, index));
        const event = parseLine(joinFragments(fragments, pendingBytes));
        fragments = [];
        pendingBytes = 0;
        start = index + 1;
        if (event !== undefined) yield event;
      }
      append(next.value.slice(start));
    }

    if (pendingBytes > 0) {
      const tail = decode(joinFragments(fragments, pendingBytes));
      if (tail.trim().length > 0) {
        throw streamInvalid("模型事件流在完整事件前结束");
      }
    }
  } catch (error) {
    if (error instanceof UiClientError) throw error;
    if (isAbortError(error)) {
      throw new UiClientError("UI_OPERATION_ABORTED", "事件流读取已取消", true);
    }
    throw streamInvalid("模型事件流读取失败");
  } finally {
    reader.releaseLock();
  }
}
