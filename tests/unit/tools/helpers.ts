import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { JsonObject, ToolCall } from "@/lib/domain";
import { prepareLocalToolCall } from "@/lib/tools";
import { executePreparedLocalTool } from "@/lib/tools/registry";
import { createWorkspaceHandle, type WorkspaceHandle } from "@/lib/workspace";

const PREFIX = "secode-tools-test-";
const registered = new Set<string>();

export interface ToolFixture {
  root: string;
  project: string;
  outside: string;
  workspace: WorkspaceHandle;
}

export async function createToolFixture(): Promise<ToolFixture> {
  const root = await fs.mkdtemp(path.join(tmpdir(), PREFIX));
  registered.add(root);
  const project = path.join(root, "project");
  const outside = path.join(root, "project-copy");
  await fs.mkdir(project);
  await fs.mkdir(outside);
  return {
    root,
    project,
    outside,
    workspace: await createWorkspaceHandle(project),
  };
}

export async function cleanupToolFixture(root: string): Promise<void> {
  if (
    !registered.has(root) ||
    path.dirname(root) !== path.resolve(tmpdir()) ||
    !path.basename(root).startsWith(PREFIX)
  ) {
    throw new Error("refusing unsafe tool fixture cleanup");
  }
  registered.delete(root);
  await fs.rm(root, { recursive: true, force: true });
}

export async function cleanupAllToolFixtures(): Promise<void> {
  for (const root of [...registered]) {
    await cleanupToolFixture(root);
  }
}

export function toolCall(name: string, arguments_: JsonObject): ToolCall {
  return { id: randomUUID(), name, arguments: arguments_ };
}

export async function runTool(
  workspace: WorkspaceHandle,
  name: string,
  arguments_: JsonObject,
  signal: AbortSignal = new AbortController().signal,
) {
  const prepared = prepareLocalToolCall(toolCall(name, arguments_));
  if (!prepared.ok) return prepared.result;
  return executePreparedLocalTool(
    { workspace, signal },
    prepared.invocation,
  );
}
