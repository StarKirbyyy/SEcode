import path from "node:path";

import type { ToolResult } from "@/lib/domain";
import type { PreparedLocalToolInvocation } from "@/lib/tools";

type ObservedEntryKind = "directory" | "file" | "symbolic_link";

interface CompleteDirectoryListing {
  root: string;
  depth: number;
  entries: ReadonlyMap<string, ObservedEntryKind>;
}

export interface WorkspaceObservationState {
  readonly completeListings: Map<string, CompleteDirectoryListing>;
}

export type WriteDependencyDecision =
  | { kind: "allow" }
  | { kind: "known_missing_parent"; parent: string };

export function createWorkspaceObservationState(): WorkspaceObservationState {
  return { completeListings: new Map() };
}

function canonicalRelativePath(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "" || value.includes("\\")) return undefined;
  if (path.posix.isAbsolute(value)) return undefined;
  const normalized = path.posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../")) return undefined;
  return normalized === "" ? "." : normalized;
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function parseCompleteListing(
  invocation: Extract<PreparedLocalToolInvocation, { name: "list_directory" }>,
  result: ToolResult,
): CompleteDirectoryListing | undefined {
  if (!result.ok || result.metadata === undefined) return undefined;
  const metadata = result.metadata;
  const root = canonicalRelativePath(metadata.path);
  if (
    root === undefined ||
    root !== canonicalRelativePath(invocation.arguments.path) ||
    metadata.depth !== invocation.arguments.depth ||
    metadata.truncated !== false ||
    metadata.ignoredEntries !== 0 ||
    metadata.blockedEntries !== 0 ||
    metadata.unsupportedEntries !== 0 ||
    !nonnegativeInteger(metadata.returnedEntries)
  ) {
    return undefined;
  }

  const lines = result.output === undefined || result.output === ""
    ? []
    : result.output.split("\n");
  if (lines.length !== metadata.returnedEntries) return undefined;
  const entries = new Map<string, ObservedEntryKind>();
  for (const line of lines) {
    const match = /^(目录|文件|符号链接|已阻止)\s+(.+)$/u.exec(line);
    if (match === null || match[1] === "已阻止") return undefined;
    const relativePath = canonicalRelativePath(match[2]);
    if (relativePath === undefined) return undefined;
    const kind = match[1] === "目录"
      ? "directory"
      : match[1] === "文件"
        ? "file"
        : "symbolic_link";
    entries.set(relativePath, kind);
  }
  return { root, depth: invocation.arguments.depth, entries };
}

function distanceFromRoot(root: string, candidate: string): number | undefined {
  if (candidate === root) return 0;
  const prefix = root === "." ? "" : `${root}/`;
  if (!candidate.startsWith(prefix)) return undefined;
  const suffix = candidate.slice(prefix.length);
  if (suffix === "" || suffix.startsWith("../")) return undefined;
  return suffix.split("/").length;
}

export function evaluateWriteDependency(
  state: WorkspaceObservationState,
  invocation: PreparedLocalToolInvocation,
): WriteDependencyDecision {
  if (invocation.name !== "write_file") return { kind: "allow" };
  const target = canonicalRelativePath(invocation.arguments.path);
  if (target === undefined) return { kind: "allow" };
  const parent = path.posix.dirname(target);
  if (parent === ".") return { kind: "allow" };

  let knownMissing = false;
  for (const listing of state.completeListings.values()) {
    const distance = distanceFromRoot(listing.root, parent);
    if (distance === undefined) continue;
    if (distance === 0) return { kind: "allow" };
    if (distance > listing.depth) continue;
    const observed = listing.entries.get(parent);
    if (observed === "directory") return { kind: "allow" };
    knownMissing = true;
  }
  return knownMissing
    ? { kind: "known_missing_parent", parent }
    : { kind: "allow" };
}

export function updateWorkspaceObservations(
  state: WorkspaceObservationState,
  invocation: PreparedLocalToolInvocation,
  result: ToolResult,
): void {
  if (invocation.name === "run_process") {
    state.completeListings.clear();
    return;
  }
  if (invocation.name !== "list_directory") return;
  const root = canonicalRelativePath(invocation.arguments.path);
  if (root !== undefined) state.completeListings.delete(root);
  const listing = parseCompleteListing(invocation, result);
  if (listing === undefined) return;
  state.completeListings.set(listing.root, listing);
}

export function isObservedDirectory(
  state: WorkspaceObservationState,
  relativePathValue: string,
): boolean {
  const relativePath = canonicalRelativePath(relativePathValue);
  if (relativePath === undefined) return false;
  if (relativePath === ".") return true;
  for (const listing of state.completeListings.values()) {
    const distance = distanceFromRoot(listing.root, relativePath);
    if (distance === 0) return true;
    if (
      distance !== undefined &&
      distance <= listing.depth &&
      listing.entries.get(relativePath) === "directory"
    ) {
      return true;
    }
  }
  return false;
}
