import { readFile, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { z } from "zod";

export const E2E_MANIFEST_PATH = path.join(tmpdir(), "secode-stage14-e2e-runtime.json");

const ManifestSchema = z.strictObject({
  version: z.literal(1),
  root: z.string().min(1),
  pickerRoot: z.string().min(1),
  workspace: z.string().min(1),
  dataDir: z.string().min(1),
  nextPort: z.int().min(1024).max(65535),
  fakeModelPort: z.int().min(1024).max(65535),
  rootDev: z.int().nonnegative(),
  rootIno: z.int().nonnegative(),
});

export type RuntimeManifest = z.infer<typeof ManifestSchema>;

function within(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

export async function readRuntimeManifest(): Promise<RuntimeManifest> {
  const manifest = ManifestSchema.parse(JSON.parse(await readFile(E2E_MANIFEST_PATH, "utf8")));
  const canonicalRoot = await realpath(manifest.root);
  const rootStats = await stat(canonicalRoot);
  if (canonicalRoot !== manifest.root || rootStats.dev !== manifest.rootDev || rootStats.ino !== manifest.rootIno) throw new Error("E2E root identity changed");
  if (!within(canonicalRoot, await realpath(manifest.pickerRoot)) || !within(canonicalRoot, await realpath(manifest.workspace)) || !within(canonicalRoot, await realpath(manifest.dataDir))) throw new Error("E2E manifest path escaped registered root");
  return manifest;
}
