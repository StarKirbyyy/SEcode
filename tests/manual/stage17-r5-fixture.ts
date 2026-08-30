import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PREFIX = "secode-stage17-r5.";
const MARKER = "SECODE_STAGE17_R5_FIXTURE_V1";

async function create(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), PREFIX));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(root, ".secode-stage17-r5-marker"), `${MARKER}\n`, "utf8");
  await writeFile(
    path.join(workspace, "AGENTS.md"),
    `# Stage 17 R5 真实模型验收边界

- 这是一次性临时工作区；所有项目文件必须位于 \`login-system/\`。
- 必须先用官方 create-next-app 创建模板，再用 \`pnpm dev\` 的 readiness 验证启动，之后才开始认证功能修改。
- 包管理和依赖安装使用 npm；不得生成 \`pnpm-lock.yaml\`。
- Next.js 修改前读取生成项目中适用的 AGENTS.md，以及该项目 \`node_modules/next/dist/docs/\` 的相关本地文档。
- 测试数据必须位于项目内部的临时或忽略目录，不得访问真实用户数据。
- 不执行 Git commit、push、发布或部署。
`,
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
    throw new Error("cleanup root is outside the stage 17 R5 namespace");
  }
  const markerPath = path.join(root, ".secode-stage17-r5-marker");
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
  throw new Error("usage: stage17-r5-fixture.ts create | clean <absolute-root>");
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "stage17 R5 fixture failed"}\n`);
  process.exitCode = 1;
});
