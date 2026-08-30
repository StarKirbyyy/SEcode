import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PREFIX = "secode-stage19.";
const MARKER_FILE = ".secode-stage19-marker";
const MARKER_CONTENT = "SECODE_STAGE19_FIXTURE_V1\n";

async function create(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), PREFIX));
  const workspace = path.join(root, "workspace");
  const marker = path.join(root, MARKER_FILE);
  await mkdir(workspace);
  await writeFile(marker, MARKER_CONTENT, "utf8");
  process.stdout.write(`${JSON.stringify({
    root,
    workspace,
    marker,
    markerContent: MARKER_CONTENT.trim(),
  })}\n`);
}

void create().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "stage19 fixture failed"}\n`);
  process.exitCode = 1;
});
