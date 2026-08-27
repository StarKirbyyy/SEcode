import {
  MAX_TOOL_OUTPUT_BYTES,
  redactSecrets,
  truncateUtf8,
  utf8ByteLength,
} from "@/lib/domain";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export interface LimitedToolOutput {
  value: string;
  truncated: boolean;
  originalBytes: number;
  returnedBytes: number;
}

function utf8Suffix(value: string, maxBytes: number): string {
  const bytes = encoder.encode(value);
  let start = Math.max(0, bytes.byteLength - maxBytes);
  while (start < bytes.byteLength) {
    try {
      return decoder.decode(bytes.slice(start));
    } catch {
      start += 1;
    }
  }
  return "";
}

export function limitToolOutput(
  rawValue: string,
  maxBytes = MAX_TOOL_OUTPUT_BYTES,
  originalBytesOverride?: number,
): LimitedToolOutput {
  const value = redactSecrets(rawValue);
  const actualValueBytes = utf8ByteLength(value);
  const originalBytes = originalBytesOverride ?? actualValueBytes;
  if (actualValueBytes <= maxBytes && originalBytes <= maxBytes) {
    return {
      value,
      truncated: false,
      originalBytes,
      returnedBytes: originalBytes,
    };
  }

  let marker = "\n...[TRUNCATED " + originalBytes + " UTF-8 bytes]...\n";
  if (utf8ByteLength(marker) > maxBytes) {
    marker = truncateUtf8(marker, maxBytes).value;
  }
  const available = Math.max(0, maxBytes - utf8ByteLength(marker));
  const headBudget = Math.floor(available * 0.75);
  const tailBudget = available - headBudget;
  const head = truncateUtf8(value, headBudget).value;
  const tail = utf8Suffix(value, tailBudget);
  const limited = head + marker + tail;
  return {
    value: limited,
    truncated: true,
    originalBytes,
    returnedBytes: utf8ByteLength(limited),
  };
}

export class BoundedTextAccumulator {
  private head = "";
  private tail = "";
  private originalBytes = 0;

  push(value: string): void {
    this.originalBytes += utf8ByteLength(value);
    if (utf8ByteLength(this.head) < MAX_TOOL_OUTPUT_BYTES) {
      this.head = truncateUtf8(
        this.head + value,
        MAX_TOOL_OUTPUT_BYTES,
      ).value;
    }
    this.tail = utf8Suffix(this.tail + value, MAX_TOOL_OUTPUT_BYTES);
  }

  finish(): LimitedToolOutput {
    if (this.originalBytes <= MAX_TOOL_OUTPUT_BYTES) {
      return limitToolOutput(this.head);
    }
    return limitToolOutput(
      this.head + "\n...[STREAM MIDDLE OMITTED]...\n" + this.tail,
      MAX_TOOL_OUTPUT_BYTES,
      this.originalBytes,
    );
  }

  get totalBytes(): number {
    return this.originalBytes;
  }
}
