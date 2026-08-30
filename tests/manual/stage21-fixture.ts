import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PREFIX = "secode-stage21.";
const MARKER_FILE = ".secode-stage21-marker";
const MARKER_CONTENT = "SECODE_STAGE21_FIXTURE_V1\n";

async function create(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), PREFIX));
  const workspace = path.join(root, "workspace");
  const dataDir = path.join(root, "data");
  await mkdir(workspace);
  await mkdir(dataDir);
  await writeFile(path.join(root, MARKER_FILE), MARKER_CONTENT, "utf8");
  await writeFile(
    path.join(workspace, "AGENTS.md"),
    `# Stage 21 真实 LongCat 验收边界

- 这是一次性系统临时工作区；所有项目文件必须位于本工作区。
- 使用端口 4327 运行后端，使用端口 4328 运行前端；代码、脚本、README 和验证必须一致。
- 可以在本工作区安装项目依赖，但不得读取或修改工作区外的项目、Session 或用户数据。
- 不执行 Git commit、push、发布或部署，不删除 marker 所在的临时根。
- 先读取现状和指令；创建 server/client 文件前，必须显式创建对应目录并重新完整列出工作区确认目录存在。
- 完成前必须分别运行 server/client 的 typecheck、build 和关键测试，再运行双服务 readiness、代表性 API 断言和真实浏览器创建/切换流程。
- 保留真实 stdout/stderr 和退出码；不得把 HTTP 200 当作全部完成证据，不得重复已经成功且未被后续写入失效的验证。
`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify({
    root,
    workspace,
    dataDir,
    marker: path.join(root, MARKER_FILE),
    markerContent: MARKER_CONTENT.trim(),
  })}\n`);
}

void create().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "stage21 fixture failed"}\n`);
  process.exitCode = 1;
});
