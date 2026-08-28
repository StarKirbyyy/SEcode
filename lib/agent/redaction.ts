import { REDACTED_VALUE } from "@/lib/domain";

import { MAX_STREAM_REDACTION_PREFIX } from "./types";

type RedactionMode =
  | "normal"
  | "word"
  | "sk_token"
  | "bearer_space"
  | "env_before_equals"
  | "env_after_equals"
  | "discard_token"
  | "discard_sk"
  | "discard_env";

const identifierCharacter = /[A-Za-z0-9_]/;
const identifierStart = /[A-Za-z]/;
const tokenCharacter = /[A-Za-z0-9._~+/=-]/;
const skTokenCharacter = /[A-Za-z0-9_-]/;

export class StreamingSecretRedactor {
  private mode: RedactionMode = "normal";
  private buffer = "";
  private skCharacters = 0;
  private stopped = false;

  push(chunk: string): string {
    if (this.stopped || chunk.length === 0) return "";
    let output = "";
    for (const character of chunk) {
      output += this.consume(character);
    }
    return output;
  }

  finish(): string {
    if (this.stopped) return "";
    this.stopped = true;
    if (
      this.mode === "discard_token" ||
      this.mode === "discard_sk" ||
      this.mode === "discard_env"
    ) {
      this.reset();
      return "";
    }
    const output = this.buffer;
    this.reset();
    return output;
  }

  abort(): void {
    this.stopped = true;
    this.reset();
  }

  private reset(): void {
    this.mode = "normal";
    this.buffer = "";
    this.skCharacters = 0;
  }

  private boundedBuffer(character: string): string {
    this.buffer += character;
    if (this.buffer.length <= MAX_STREAM_REDACTION_PREFIX) return "";
    this.buffer = "";
    this.mode = "discard_env";
    return REDACTED_VALUE;
  }

  private consume(character: string): string {
    switch (this.mode) {
      case "normal":
        if (identifierStart.test(character)) {
          this.mode = "word";
          this.buffer = character;
          return "";
        }
        return character;

      case "word":
        if (identifierCharacter.test(character)) {
          return this.boundedBuffer(character);
        }
        return this.finishWord(character);

      case "sk_token":
        if (skTokenCharacter.test(character)) {
          this.skCharacters += 1;
          if (this.skCharacters === 8) {
            this.buffer = "";
            this.mode = "discard_sk";
            return REDACTED_VALUE;
          }
          this.buffer += character;
          return "";
        }
        return this.flushAndReconsume(character);

      case "bearer_space":
        if (/\s/.test(character)) {
          return this.boundedBuffer(character);
        }
        if (tokenCharacter.test(character)) {
          this.buffer = "";
          this.mode = "discard_token";
          return `Bearer ${REDACTED_VALUE}`;
        }
        return this.flushAndReconsume(character);

      case "env_before_equals":
        if (/\s/.test(character)) {
          return this.boundedBuffer(character);
        }
        if (character === "=") {
          return this.boundedBufferAndSet(character, "env_after_equals");
        }
        return this.flushAndReconsume(character);

      case "env_after_equals":
        if (/\s/.test(character)) {
          return this.boundedBuffer(character);
        }
        if (character === '"' || character === "'") {
          return this.flushAndReconsume(character);
        }
        {
          const equalsIndex = this.buffer.indexOf("=");
          const prefix = this.buffer.slice(0, equalsIndex + 1);
          this.buffer = "";
          this.mode = "discard_env";
          return `${prefix}${REDACTED_VALUE}`;
        }

      case "discard_token":
        if (tokenCharacter.test(character)) return "";
        this.mode = "normal";
        return this.consume(character);

      case "discard_sk":
        if (skTokenCharacter.test(character)) return "";
        this.mode = "normal";
        return this.consume(character);

      case "discard_env":
        if (!/\s/.test(character) && character !== '"' && character !== "'") {
          return "";
        }
        this.mode = "normal";
        return this.consume(character);
    }
  }

  private boundedBufferAndSet(
    character: string,
    nextMode: RedactionMode,
  ): string {
    const output = this.boundedBuffer(character);
    if (output.length === 0) this.mode = nextMode;
    return output;
  }

  private finishWord(delimiter: string): string {
    const word = this.buffer;
    const lower = word.toLowerCase();
    if (lower === "sk" && delimiter === "-") {
      this.mode = "sk_token";
      this.buffer = "sk-";
      this.skCharacters = 0;
      return "";
    }
    if (lower === "bearer" && /\s/.test(delimiter)) {
      this.mode = "bearer_space";
      this.buffer = `${word}${delimiter}`;
      return "";
    }
    if (lower.endsWith("_api_key")) {
      if (/\s/.test(delimiter)) {
        this.mode = "env_before_equals";
        this.buffer = `${word}${delimiter}`;
        return "";
      }
      if (delimiter === "=") {
        this.mode = "env_after_equals";
        this.buffer = `${word}=`;
        return "";
      }
    }
    this.buffer = "";
    this.mode = "normal";
    return word + this.consume(delimiter);
  }

  private flushAndReconsume(character: string): string {
    const output = this.buffer;
    this.buffer = "";
    this.mode = "normal";
    this.skCharacters = 0;
    return output + this.consume(character);
  }
}
