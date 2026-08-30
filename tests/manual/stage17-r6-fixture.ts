import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PREFIX = "secode-stage17-r6.";
const MARKER = "SECODE_STAGE17_R6_FIXTURE_V1";

async function create(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), PREFIX));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(root, ".secode-stage17-r6-marker"), `${MARKER}\n`, "utf8");
  await writeFile(
    path.join(workspace, "AGENTS.md"),
    `# Stage 17 R6 真实模型验收边界

- 这是一次性临时工作区；所有项目文件必须位于 \`login-system/\`。
- 必须先从 Next.js 官方 create-next-app 模板创建项目，再使用 \`pnpm dev\` 和安全的 127.0.0.1 高位端口 readiness 验证启动；readiness 通过后才开始认证功能修改。
- 依赖安装、包管理和锁文件使用 npm；不得生成 \`pnpm-lock.yaml\`。
- Next.js 修改前读取生成项目的适用 AGENTS.md，并按 \`read_file\` 返回的 \`nextStartLine\` 分页阅读该项目 \`node_modules/next/dist/docs/\` 中直接相关的本地文档；不得反复整文件读取长文档。
- 实现注册、登录、退出和受保护个人中心；本地持久化必须隔离测试数据，密码使用慢哈希，会话使用 HttpOnly Cookie，服务端不得信任客户端提交的身份。
- 完善校验、错误、加载状态与自动化测试；完成前真实运行 lint、test、build 并核对证据。
- 不执行 Git commit、push、发布或部署，不访问真实用户数据或工作区外路径。
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
    throw new Error("cleanup root is outside the stage 17 R6 namespace");
  }
  const markerPath = path.join(root, ".secode-stage17-r6-marker");
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
  throw new Error("usage: stage17-r6-fixture.ts create | clean <absolute-root>");
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "stage17 R6 fixture failed"}\n`);
  process.exitCode = 1;
});
