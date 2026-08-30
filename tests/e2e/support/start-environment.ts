import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, realpathSync, rmSync, statSync, unlinkSync } from "node:fs";
import { mkdir, mkdtemp, realpath, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { startFakeModelServer } from "./fake-model-server";
import { E2E_MANIFEST_PATH, type RuntimeManifest } from "./runtime-manifest";

const NEXT_PORT = 3100;
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

async function ignoreMissing(operation: Promise<unknown>) {
  try {
    await operation;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function writeFixture(workspace: string) {
  await mkdir(path.join(workspace, "src"), { recursive: true });
  await mkdir(path.join(workspace, "tests"), { recursive: true });
  await mkdir(path.join(workspace, "context"), { recursive: true });
  await mkdir(path.join(workspace, "notes"), { recursive: true });
  await mkdir(path.join(workspace, ".git"));
  await writeFile(path.join(workspace, "README.md"), [
    "# Slugify contract",
    "",
    "slugify(value) must trim outer whitespace, convert every run of whitespace to one hyphen, and lowercase the result.",
    "Do not change or remove tests. Do not install dependencies. Do not commit changes.",
    "",
  ].join("\n"));
  await writeFile(path.join(workspace, "package.json"), `${JSON.stringify({
    name: "secode-stage14-fixture",
    private: true,
    type: "module",
    scripts: {
      test: "node --test tests/*.test.mjs",
      approved: "node -e \"process.stdout.write('approved\\\\n')\"",
      slow: "node -e \"setTimeout(() => {}, 60000)\"",
    },
  }, null, 2)}\n`);
  await writeFile(path.join(workspace, "src/slug.mjs"), [
    'export const FIXTURE_MARKER = "SECODE_STAGE14_SLUG";',
    "",
    "export function slugify(value) {",
    '  return value.toLowerCase().replace(" ", "-");',
    "}",
    "",
  ].join("\n"));
  await writeFile(path.join(workspace, "tests/slug.test.mjs"), [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { slugify } from "../src/slug.mjs";',
    "",
    "test(\"lowercases and joins one space\", () => assert.equal(slugify(\"Hello World\"), \"hello-world\"));",
    "test(\"trims and collapses repeated spaces\", () => assert.equal(slugify(\"  Hello   World  \"), \"hello-world\"));",
    "test(\"normalizes tabs\", () => assert.equal(slugify(\"Hello\\tWorld\"), \"hello-world\"));",
    "test(\"preserves an existing slug\", () => assert.equal(slugify(\"already-slugged\"), \"already-slugged\"));",
    "",
  ].join("\n"));
  await writeFile(path.join(workspace, "context/chunk.txt"), `${"C".repeat(2_048)}\n`);
}

async function buildEnvironmentRoot() {
  const temporary = await mkdtemp(path.join(tmpdir(), "secode-stage14-e2e-"));
  const root = await realpath(temporary);
  const pickerRoot = path.join(root, "code-area");
  const workspace = path.join(pickerRoot, "slug-project");
  const dataDir = path.join(root, "data");
  const outside = path.join(root, "outside-picker-root");
  await mkdir(pickerRoot);
  await mkdir(dataDir);
  await mkdir(outside);
  await writeFixture(workspace);
  await mkdir(path.join(pickerRoot, "empty-project"));
  await mkdir(path.join(pickerRoot, ".visible-project"));
  await mkdir(path.join(pickerRoot, "node_modules"));
  const many = path.join(pickerRoot, "many-projects");
  await mkdir(many);
  await Promise.all(Array.from({ length: 501 }, (_, index) => mkdir(path.join(many, `project-${String(index).padStart(3, "0")}`))));
  await symlink(outside, path.join(pickerRoot, "escape-link"));
  await writeFile(path.join(pickerRoot, "not-a-directory.txt"), "not selectable\n");
  return { root, pickerRoot, workspace, dataDir };
}

async function waitForExit(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}

async function main() {
  await ignoreMissing(unlink(E2E_MANIFEST_PATH));
  const paths = await buildEnvironmentRoot();
  const rootStats = await stat(paths.root);
  const fakeModel = await startFakeModelServer();
  const manifest: RuntimeManifest = {
    version: 1,
    ...paths,
    nextPort: NEXT_PORT,
    fakeModelPort: fakeModel.port,
    rootDev: rootStats.dev,
    rootIno: rootStats.ino,
  };
  await writeFile(E2E_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });

  const cleanupFilesSynchronously = () => {
    try {
      if (existsSync(paths.root)) {
        const currentRoot = realpathSync(paths.root);
        const currentStats = statSync(currentRoot);
        if (currentRoot === paths.root && currentStats.dev === rootStats.dev && currentStats.ino === rootStats.ino) {
          rmSync(paths.root, { recursive: true, force: false });
        }
      }
    } finally {
      if (existsSync(E2E_MANIFEST_PATH)) unlinkSync(E2E_MANIFEST_PATH);
    }
  };
  process.on("exit", cleanupFilesSynchronously);

  const child = spawn("pnpm", ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(NEXT_PORT)], {
    cwd: REPOSITORY_ROOT,
    shell: false,
    stdio: "inherit",
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: "",
      DEEPSEEK_BASE_URL: "",
      DEEPSEEK_MODEL: "",
      LONGCAT_API_KEY: "",
      LONGCAT_BASE_URL: "",
      LONGCAT_MODEL: "",
      OPENAI_COMPAT_API_KEY: "",
      OPENAI_COMPAT_BASE_URL: fakeModel.baseUrl,
      OPENAI_COMPAT_MODEL: "secode-e2e-model",
      OPENAI_COMPAT_CONTEXT_WINDOW: "64000",
      OPENAI_COMPAT_SUPPORTS_THINKING: "false",
      SECODE_DATA_DIR: paths.dataDir,
      SECODE_WORKSPACE_PICKER_ROOT: paths.pickerRoot,
      SECODE_NEXT_DIST_DIR: ".next-e2e",
    },
  });

  let cleanupPromise: Promise<void> | undefined;
  const cleanup = (terminateChild: boolean) => {
    cleanupPromise ??= (async () => {
      if (terminateChild && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      await waitForExit(child);
      await fakeModel.close();
      const currentRoot = await realpath(paths.root);
      const currentStats = await stat(currentRoot);
      if (currentRoot !== paths.root || currentStats.dev !== rootStats.dev || currentStats.ino !== rootStats.ino) throw new Error("refusing to clean changed E2E root");
      rmSync(paths.root, { recursive: true, force: false });
      await ignoreMissing(unlink(E2E_MANIFEST_PATH));
    })();
    return cleanupPromise;
  };

  process.on("SIGINT", () => { void cleanup(true).then(() => process.exit(130)); });
  process.on("SIGTERM", () => { void cleanup(true).then(() => process.exit(143)); });
  child.once("exit", (code, signal) => {
    void cleanup(false).then(() => {
      process.exitCode = code ?? (signal === null ? 1 : 128);
    });
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "E2E environment failed");
  process.exitCode = 1;
});
