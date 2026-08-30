import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

function containsCycle(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }

  if (ancestors.has(value)) {
    return true;
  }

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  ancestors.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  const cyclic = children.some((child) => containsCycle(child, ancestors));
  ancestors.delete(value);
  return cyclic;
}

export const JsonValueSchema = z.preprocess((value, context) => {
  if (containsCycle(value)) {
    context.addIssue({
      code: "custom",
      message: "cyclic values are not valid JSON",
    });
    return z.NEVER;
  }

  return value;
}, z.json());
export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

export const UuidSchema = z.uuid();
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const SequenceSchema = z.int().positive();
export const ProtocolVersionSchema = z.literal(PROTOCOL_VERSION);

export type JsonValue = z.infer<typeof JsonValueSchema>;
export type JsonObject = z.infer<typeof JsonObjectSchema>;

export type SessionId = string;
export type RunId = string;
export type EventId = string;
export type ToolCallId = string;
export type ApprovalId = string;
export type PlanId = string;
