import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import {
  executeAuthorizedLocalTool,
  getPendingToolApprovalView,
  requestLocalToolAuthorization,
  resolveLocalToolApproval,
} from "@/lib/approval";
import { prepareLocalToolCall } from "@/lib/tools";
import { createWorkspaceHandle } from "@/lib/workspace";

export interface AgentRuntimeDependencies {
  randomUUID: () => string;
  monotonicNow: () => number;
  wallClockNow: () => Date;
  setTimer: (callback: () => void, milliseconds: number) => unknown;
  clearTimer: (timer: unknown) => void;
  createWorkspaceHandle: typeof createWorkspaceHandle;
  prepareLocalToolCall: typeof prepareLocalToolCall;
  requestLocalToolAuthorization: typeof requestLocalToolAuthorization;
  getPendingToolApprovalView: typeof getPendingToolApprovalView;
  resolveLocalToolApproval: typeof resolveLocalToolApproval;
  executeAuthorizedLocalTool: typeof executeAuthorizedLocalTool;
}

export const nativeAgentRuntimeDependencies: AgentRuntimeDependencies = {
  randomUUID,
  monotonicNow: () => performance.now(),
  wallClockNow: () => new Date(),
  setTimer: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  createWorkspaceHandle,
  prepareLocalToolCall,
  requestLocalToolAuthorization,
  getPendingToolApprovalView,
  resolveLocalToolApproval,
  executeAuthorizedLocalTool,
};
