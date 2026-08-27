import { z } from "zod";

import { ToolResultSchema } from "./core";
import { JsonObjectSchema } from "./json";
import {
  ChatToolCallSchema,
  TOOL_NAME_PATTERN,
  ToolNameSchema,
} from "./model";

export const ToolCallSchema = ChatToolCallSchema.extend({
  name: ToolNameSchema,
});

export const ToolDefinitionSchema = z.strictObject({
  type: z.literal("function"),
  function: z.strictObject({
    name: ToolNameSchema,
    description: z.string().trim().min(1).max(4_096),
    parameters: JsonObjectSchema,
  }),
});

export { ToolResultSchema };
export { TOOL_NAME_PATTERN, ToolNameSchema };

export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
