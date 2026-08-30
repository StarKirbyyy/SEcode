import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PREFIX = "secode-stage17.";
const MARKER = "SECODE_STAGE17_FIXTURE_V1";

async function create(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), PREFIX));
  const workspace = path.join(root, "workspace");
  await mkdir(path.join(workspace, "notes"), { recursive: true });
  await mkdir(path.join(workspace, "tests"), { recursive: true });
  await writeFile(path.join(root, ".secode-stage17-marker"), `${MARKER}\n`, "utf8");
  await writeFile(
    path.join(workspace, "README.md"),
    "# Stage 17 terminal fixture\n\nCreate notes/plan-result.txt, run tests, do not install dependencies, and do not commit.\n",
    "utf8",
  );
  await writeFile(
    path.join(workspace, "package.json"),
    `${JSON.stringify({
      name: "secode-stage17-fixture",
      private: true,
      scripts: { test: "node --test tests/*.test.mjs" },
    }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(workspace, "tests", "fixture.test.mjs"),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('fixture is healthy', () => assert.equal(2 + 2, 4));\n",
    "utf8",
  );
  process.stdout.write(`${root}\n`);
}

async function clean(rootArgument: string | undefined): Promise<void> {
  if (rootArgument === undefined || !path.isAbsolute(rootArgument)) {
    throw new Error("cleanup root must be an absolute path");
  }
  const info = await lstat(rootArgument);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error("cleanup root must be a real directory");
  }
  const root = await realpath(rootArgument);
  const temporaryRoot = await realpath(tmpdir());
  if (path.dirname(root) !== temporaryRoot || !path.basename(root).startsWith(PREFIX)) {
    throw new Error("cleanup root is outside the stage 17 temporary namespace");
  }
  const markerPath = path.join(root, ".secode-stage17-marker");
  const markerInfo = await lstat(markerPath);
  if (markerInfo.isSymbolicLink() || !markerInfo.isFile()) {
    throw new Error("cleanup marker is invalid");
  }
  if ((await readFile(markerPath, "utf8")) !== `${MARKER}\n`) {
    throw new Error("cleanup marker identity mismatch");
  }
  await rm(root, { recursive: true, force: false });
  process.stdout.write(`removed ${root}\n`);
}

async function main(): Promise<void> {
  const [command, root] = process.argv.slice(2);
  if (command === "create") return create();
  if (command === "clean") return clean(root);
  throw new Error("usage: stage17-fixture.ts create | clean <absolute-root>");
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "stage17 fixture failed"}\n`);
  process.exitCode = 1;
});
