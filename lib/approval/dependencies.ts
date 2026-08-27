import { randomUUID } from "node:crypto";

import type { ToolResult } from "@/lib/domain";
import {
  executePreparedLocalTool,
  isPreparedLocalToolInvocation,
} from "@/lib/tools/registry";
import type {
  LocalToolExecutionContext,
  PreparedLocalToolInvocation,
} from "@/lib/tools/types";

export interface ApprovalDependencies {
  randomUUID(): string;
  isPreparedInvocation(
    value: unknown,
  ): value is PreparedLocalToolInvocation;
  executePrepared(
    context: LocalToolExecutionContext,
    invocation: PreparedLocalToolInvocation,
  ): Promise<ToolResult>;
}

export const nativeApprovalDependencies: ApprovalDependencies = {
  randomUUID,
  isPreparedInvocation: isPreparedLocalToolInvocation,
  executePrepared: executePreparedLocalTool,
};
