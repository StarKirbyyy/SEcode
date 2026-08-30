import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PREFIX = "secode-stage18.";
const MARKER = "SECODE_STAGE18_FIXTURE_V1";

async function create(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), PREFIX));
  const workspace = path.join(root, "workspace");
  await mkdir(path.join(workspace, "scripts"), { recursive: true });
  await mkdir(path.join(workspace, "src"), { recursive: true });
  await mkdir(path.join(workspace, "fixtures"), { recursive: true });
  await writeFile(
    path.join(root, ".secode-stage18-marker"),
    `${MARKER}\n`,
    "utf8",
  );
  await writeFile(
    path.join(workspace, "AGENTS.md"),
    `# Stage 18 真实模型验收边界

- 这是一次性临时工作区，只修改本工作区内文件。
- 不安装依赖，不初始化或修改 Git，不执行 commit、push、发布或部署。
- 真实 stdout/stderr 必须保留；命令成败以结构化结果和退出码判断。
- 不修改 fixtures/non-blocking-warning.txt；它只提供非阻塞 warning 事实。
- 写文件前先确认父目录和目标；覆盖既有文件必须读取最新完整 SHA。
`,
    "utf8",
  );
  await writeFile(
    path.join(workspace, "package.json"),
    `${JSON.stringify({
      name: "secode-stage18-fixture",
      private: true,
      scripts: {
        "warning-only": "node scripts/verify.mjs warning",
        "build:mixed": "node scripts/verify.mjs build",
      },
    }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(workspace, "scripts/verify.mjs"),
    `import { readFile } from "node:fs/promises";

process.stderr.write("NON_BLOCKING_WARNING: fixture stderr channel\\n");
if (process.argv[2] === "build") {
  const blocker = await readFile(new URL("../src/blocker.ts", import.meta.url), "utf8");
  if (!blocker.includes("FIXED")) {
    process.stderr.write("DIRECT_BLOCKER: src/blocker.ts is not fixed\\n");
    process.exitCode = 1;
  }
}
`,
    "utf8",
  );
  await writeFile(
    path.join(workspace, "src/blocker.ts"),
    `export const buildState = "DIRECT_BLOCKER";\n`,
    "utf8",
  );
  await writeFile(
    path.join(workspace, "src/existing.ts"),
    `export const existing = 1;\n`,
    "utf8",
  );
  await writeFile(
    path.join(workspace, "fixtures/non-blocking-warning.txt"),
    `NON_BLOCKING_WARNING must remain unchanged\n`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify({
    root,
    workspace,
    marker: path.join(root, ".secode-stage18-marker"),
    expected: {
      warningOnlyExitCode: 0,
      mixedBuildInitialExitCode: 1,
      warningText: "NON_BLOCKING_WARNING",
      blockerText: "DIRECT_BLOCKER",
    },
  })}\n`);
}

void create().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "stage18 fixture failed"}\n`);
  process.exitCode = 1;
});
