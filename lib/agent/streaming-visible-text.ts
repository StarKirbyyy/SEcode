import {
  analyzeAssistantLanguage,
  isAssistantTechnicalContent,
} from "@/lib/context/language-policy";

import { StreamingSecretRedactor } from "./redaction";

export const MAX_STREAMING_VISIBLE_SEGMENT_CHARACTERS = 2_048;
export const MAX_STREAMING_VISIBLE_BUFFER_CHARACTERS = 65_536;

export interface StreamingVisibleTextResult {
  publishedCharacters: number;
  suppressedCharacters: number;
}

export class StreamingVisibleTextGate {
  private readonly redactor = new StreamingSecretRedactor();
  private buffer = "";
  private publishedCharacters = 0;
  private suppressedCharacters = 0;
  private stopped = false;

  constructor(
    private readonly publish: (content: string) => void | Promise<void>,
  ) {}

  async push(chunk: string): Promise<void> {
    if (this.stopped || chunk.length === 0) return;
    await this.consume(this.redactor.push(chunk), false);
  }

  async finish(): Promise<StreamingVisibleTextResult> {
    if (this.stopped) return this.result();
    await this.consume(this.redactor.finish(), true);
    this.stopped = true;
    return this.result();
  }

  abort(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.redactor.abort();
    this.buffer = "";
  }

  private result(): StreamingVisibleTextResult {
    return Object.freeze({
      publishedCharacters: this.publishedCharacters,
      suppressedCharacters: this.suppressedCharacters,
    });
  }

  private async consume(value: string, finishing: boolean): Promise<void> {
    if (value.length > 0) this.buffer += value;
    if (this.buffer.length > MAX_STREAMING_VISIBLE_BUFFER_CHARACTERS) {
      this.suppressedCharacters += this.buffer.length;
      this.buffer = "";
      return;
    }
    while (this.buffer.length > 0) {
      const boundary = this.boundaryIndex(finishing);
      if (boundary === 0) break;
      const segment = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary);
      await this.publishIfSafe(segment);
    }
    if (
      !finishing &&
      this.buffer.length > MAX_STREAMING_VISIBLE_SEGMENT_CHARACTERS
    ) {
      this.suppressedCharacters += this.buffer.length;
      this.buffer = "";
    }
  }

  private boundaryIndex(finishing: boolean): number {
    let inFence = false;
    for (let index = 0; index < this.buffer.length; index += 1) {
      if (this.buffer.startsWith("```", index)) {
        inFence = !inFence;
        index += 2;
        continue;
      }
      const character = this.buffer[index];
      if (!inFence && /[。！？；\n]/u.test(character)) return index + 1;
    }
    return finishing ? this.buffer.length : 0;
  }

  private async publishIfSafe(segment: string): Promise<void> {
    if (
      analyzeAssistantLanguage(segment).ok ||
      isAssistantTechnicalContent(segment)
    ) {
      await this.publish(segment);
      this.publishedCharacters += segment.length;
      return;
    }
    this.suppressedCharacters += segment.length;
  }
}
