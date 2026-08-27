import { utf8ByteLength } from "./core";
import { JsonValueSchema, type JsonObject, type JsonValue } from "./json";

export const REDACTED_VALUE = "[REDACTED]";
export const TRUNCATED_VALUE = "[TRUNCATED]";
export const MAX_PUBLIC_ARGUMENT_BYTES = 16 * 1024;
export const MAX_EVENT_STRING_BYTES = 4 * 1024;

const SENSITIVE_KEY_PATTERN =
  /(?:token|secret|password|authorization|api[_-]?key)/i;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SK_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
const ENV_API_KEY_PATTERN =
  /\b[A-Za-z][A-Za-z0-9_]*_API_KEY\s*=\s*[^\s"']+/gi;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const MIN_PUBLIC_ARGUMENT_BYTES = encoder.encode(
  JSON.stringify({ truncated: true }),
).byteLength;

export interface TruncatedUtf8 {
  value: string;
  truncated: boolean;
  originalBytes: number;
  returnedBytes: number;
}

export interface PublicToolArguments {
  publicArguments: JsonObject;
  truncated: boolean;
  originalBytes: number;
}

export function redactSecrets(value: string): string {
  return value
    .replace(BEARER_TOKEN_PATTERN, `Bearer ${REDACTED_VALUE}`)
    .replace(SK_KEY_PATTERN, REDACTED_VALUE)
    .replace(ENV_API_KEY_PATTERN, (match) => {
      const separator = match.indexOf("=");
      return `${match.slice(0, separator + 1)}${REDACTED_VALUE}`;
    });
}

export function truncateUtf8(value: string, maxBytes: number): TruncatedUtf8 {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }

  const bytes = encoder.encode(value);
  if (bytes.byteLength <= maxBytes) {
    return {
      value,
      truncated: false,
      originalBytes: bytes.byteLength,
      returnedBytes: bytes.byteLength,
    };
  }

  let end = maxBytes;
  while (end > 0) {
    try {
      const truncatedValue = decoder.decode(bytes.slice(0, end));
      return {
        value: truncatedValue,
        truncated: true,
        originalBytes: bytes.byteLength,
        returnedBytes: end,
      };
    } catch {
      end -= 1;
    }
  }

  return {
    value: "",
    truncated: true,
    originalBytes: bytes.byteLength,
    returnedBytes: 0,
  };
}

function sanitizeUnknown(
  value: unknown,
  seen: WeakSet<object>,
  maxStringBytes: number,
): JsonValue {
  if (value === null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return truncateUtf8(redactSecrets(value), maxStringBytes).value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined") {
    return "[UNDEFINED]";
  }

  if (typeof value === "function") {
    return "[FUNCTION]";
  }

  if (typeof value === "symbol") {
    return value.description ? `[SYMBOL:${value.description}]` : "[SYMBOL]";
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "[INVALID_DATE]" : value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateUtf8(redactSecrets(value.message), maxStringBytes).value,
    };
  }

  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.map((item) =>
      sanitizeUnknown(item, seen, maxStringBytes),
    );
    seen.delete(value);
    return result;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    seen.delete(value);
    return `[${value.constructor?.name?.toUpperCase() || "OBJECT"}]`;
  }

  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? REDACTED_VALUE
      : sanitizeUnknown(item, seen, maxStringBytes);
  }
  seen.delete(value);
  return result;
}

export function sanitizeForEvent(
  value: unknown,
  options: { maxStringBytes?: number } = {},
): JsonValue {
  const result = sanitizeUnknown(
    value,
    new WeakSet<object>(),
    options.maxStringBytes ?? MAX_EVENT_STRING_BYTES,
  );

  return JsonValueSchema.parse(result);
}

function createTruncatedArguments(
  sanitizedJson: string,
  originalBytes: number,
  maxBytes: number,
): JsonObject {
  let previewBudget = Math.max(0, maxBytes - 128);

  while (previewBudget >= 0) {
    const preview = truncateUtf8(sanitizedJson, previewBudget).value;
    const candidate: JsonObject = {
      truncated: true,
      originalBytes,
      preview,
    };

    if (utf8ByteLength(JSON.stringify(candidate)) <= maxBytes) {
      return candidate;
    }

    if (previewBudget === 0) {
      break;
    }
    previewBudget = Math.max(0, previewBudget - 32);
  }

  return { truncated: true };
}

export function createPublicToolArguments(
  value: unknown,
  maxBytes = MAX_PUBLIC_ARGUMENT_BYTES,
): PublicToolArguments {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < MIN_PUBLIC_ARGUMENT_BYTES) {
    throw new RangeError(
      `maxBytes must be a safe integer of at least ${MIN_PUBLIC_ARGUMENT_BYTES}`,
    );
  }

  const sanitized = sanitizeForEvent(value);
  const publicArguments: JsonObject =
    sanitized !== null && !Array.isArray(sanitized) && typeof sanitized === "object"
      ? sanitized
      : { value: sanitized };
  const serialized = JSON.stringify(publicArguments);
  const originalBytes = utf8ByteLength(serialized);

  if (originalBytes <= maxBytes) {
    return { publicArguments, truncated: false, originalBytes };
  }

  return {
    publicArguments: createTruncatedArguments(
      serialized,
      originalBytes,
      maxBytes,
    ),
    truncated: true,
    originalBytes,
  };
}
