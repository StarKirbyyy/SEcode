import { JsonValueSchema, UuidSchema, redactSecrets, type JsonValue } from "@/lib/domain";

function sorted(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) result[key] = sorted(value[key]);
    return result;
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sorted(JsonValueSchema.parse(value)));
}

function visibleEscape(code: number): string {
  return `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function terminalSafeText(value: string): string {
  const normalized = redactSecrets(value).replace(/\r\n/g, "\n");
  let result = "";
  for (const character of normalized) {
    const code = character.codePointAt(0)!;
    if (character === "\n" || character === "\t") result += character;
    else if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) result += visibleEscape(code);
    else result += character;
  }
  return result;
}

export function shortUuid(value: string): string {
  return UuidSchema.parse(value).slice(0, 8);
}
