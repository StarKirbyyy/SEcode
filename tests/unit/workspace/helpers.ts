import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const WORKSPACE_TEST_PREFIX = "secode-workspace-test-";

export interface WorkspaceFixture {
  root: string;
  workspace: string;
  outside: string;
}

const registeredRoots = new Set<string>();

export async function createWorkspaceFixture(): Promise<WorkspaceFixture> {
  const root = await fs.mkdtemp(path.join(tmpdir(), WORKSPACE_TEST_PREFIX));
  registeredRoots.add(root);
  const workspace = path.join(root, "project");
  const outside = path.join(root, "project-copy");
  await Promise.all([
    fs.mkdir(workspace, { recursive: false }),
    fs.mkdir(outside, { recursive: false }),
  ]);
  return { root, workspace, outside };
}

export async function cleanupWorkspaceFixture(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const resolvedTemp = path.resolve(tmpdir());
  if (
    !registeredRoots.has(root) ||
    path.dirname(resolvedRoot) !== resolvedTemp ||
    !path.basename(resolvedRoot).startsWith(WORKSPACE_TEST_PREFIX)
  ) {
    throw new Error("refusing to clean an unregistered workspace fixture");
  }
  registeredRoots.delete(root);
  await fs.rm(resolvedRoot, { recursive: true, force: true });
}

export async function cleanupAllWorkspaceFixtures(): Promise<void> {
  for (const root of [...registeredRoots]) {
    await cleanupWorkspaceFixture(root);
  }
}

export function errno(
  code: string,
  targetPath = "/private/outside-path",
): NodeJS.ErrnoException {
  return Object.assign(new Error("private filesystem error"), {
    code,
    path: targetPath,
    syscall: "realpath",
  });
}
