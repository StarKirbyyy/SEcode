import { z } from "zod";

import { JsonObjectSchema } from "./json";

export const MAX_TOOL_OUTPUT_BYTES = 64 * 1024;
export const MAX_SUMMARY_CHARACTERS = 1_024;

const utf8Encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).byteLength;
}

export const ErrorInfoSchema = z
  .strictObject({
    code: z.string().trim().min(1).max(128),
    message: z.string().min(1).max(8_192),
    recoverable: z.boolean(),
    details: JsonObjectSchema.optional(),
  });

export const ToolResultSchema = z
  .strictObject({
    ok: z.boolean(),
    summary: z.string().min(1).max(MAX_SUMMARY_CHARACTERS),
    output: z
      .string()
      .refine(
        (value) => utf8ByteLength(value) <= MAX_TOOL_OUTPUT_BYTES,
        `output must not exceed ${MAX_TOOL_OUTPUT_BYTES} UTF-8 bytes`,
      )
      .optional(),
    metadata: JsonObjectSchema.optional(),
    error: ErrorInfoSchema.optional(),
  })
  .superRefine((result, context) => {
    if (result.ok && result.error !== undefined) {
      context.addIssue({
        code: "custom",
        message: "a successful tool result cannot contain an error",
        path: ["error"],
      });
    }

    if (!result.ok && result.error === undefined) {
      context.addIssue({
        code: "custom",
        message: "a failed tool result must contain an error",
        path: ["error"],
      });
    }
  });

export type ErrorInfo = z.infer<typeof ErrorInfoSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
