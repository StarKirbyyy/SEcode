import { randomUUID } from "node:crypto";

import type { JsonObject } from "@/lib/domain";
import {
  prepareLocalToolCall,
  type LocalToolExecutionContext,
  type PreparedLocalToolInvocation,
} from "@/lib/tools";

export const TOOL_CALL_ID = "11111111-1111-4111-8111-111111111111";
export const APPROVAL_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_APPROVAL_ID = "33333333-3333-4333-8333-333333333333";

export const EMPTY_EXECUTION_CONTEXT =
  {} as unknown as LocalToolExecutionContext;

export function prepared(
  name: string,
  arguments_: JsonObject,
): PreparedLocalToolInvocation {
  const result = prepareLocalToolCall({
    id: randomUUID(),
    name,
    arguments: arguments_,
  });
  if (!result.ok) throw new Error(result.result.summary);
  return result.invocation;
}
