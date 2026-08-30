import path from "node:path";

import { utf8ByteLength } from "@/lib/domain";

import {
  isObservedDirectory,
  type WorkspaceObservationState,
} from "./workspace-observations";

const MAX_PENDING_PARENTS = 16;
const MAX_PENDING_PARENT_BYTES = 1_024;
export const MAX_WRITE_RECOVERY_MODEL_REQUESTS = 4;
export const MAX_WRITE_RECOVERY_TOOL_CALLS = 8;

export interface WriteDependencyRecoveryState {
  readonly pendingParentDirectories: Set<string>;
  baselineModelRequests?: number;
  baselineToolCalls?: number;
  stopAttempts: number;
}

export function createWriteDependencyRecoveryState(): WriteDependencyRecoveryState {
  return { pendingParentDirectories: new Set(), stopAttempts: 0 };
}

function normalizeParent(value: string): string {
  if (value === "" || value.includes("\\") || path.posix.isAbsolute(value)) {
    throw new Error("待恢复父目录必须是规范化相对路径");
  }
  const normalized = path.posix.normalize(value);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error("待恢复父目录必须位于工作区内");
  }
  return normalized.replace(/^\.\//u, "");
}

export function recordMissingParentDirectory(
  state: WriteDependencyRecoveryState,
  value: string,
  modelRequests: number,
  toolCalls: number,
): boolean {
  const parent = normalizeParent(value);
  if (state.pendingParentDirectories.has(parent)) return false;
  const next = [...state.pendingParentDirectories, parent];
  if (
    next.length > MAX_PENDING_PARENTS ||
    utf8ByteLength(next.join("\n")) > MAX_PENDING_PARENT_BYTES
  ) {
    throw new Error("待恢复父目录超过安全上限");
  }
  state.pendingParentDirectories.add(parent);
  if (state.baselineModelRequests === undefined) {
    state.baselineModelRequests = modelRequests;
    state.baselineToolCalls = toolCalls;
  }
  return true;
}

export function getPendingParentDirectories(
  state: WriteDependencyRecoveryState,
): string[] {
  return [...state.pendingParentDirectories].sort((left, right) =>
    left.localeCompare(right)
  );
}

export function hasPendingParentDirectories(
  state: WriteDependencyRecoveryState,
): boolean {
  return state.pendingParentDirectories.size > 0;
}

export function resolveObservedParentDirectories(
  state: WriteDependencyRecoveryState,
  observations: WorkspaceObservationState,
): number {
  let resolved = 0;
  for (const parent of state.pendingParentDirectories) {
    if (isObservedDirectory(observations, parent)) {
      state.pendingParentDirectories.delete(parent);
      resolved += 1;
    }
  }
  if (state.pendingParentDirectories.size === 0) {
    state.baselineModelRequests = undefined;
    state.baselineToolCalls = undefined;
    state.stopAttempts = 0;
  }
  return resolved;
}

export function writeDependencyRecoveryBudgetExceeded(
  state: WriteDependencyRecoveryState,
  modelRequests: number,
  toolCalls: number,
): boolean {
  if (!hasPendingParentDirectories(state)) return false;
  const baselineModels = state.baselineModelRequests ?? modelRequests;
  const baselineTools = state.baselineToolCalls ?? toolCalls;
  return (
    modelRequests - baselineModels >= MAX_WRITE_RECOVERY_MODEL_REQUESTS ||
    toolCalls - baselineTools >= MAX_WRITE_RECOVERY_TOOL_CALLS
  );
}
