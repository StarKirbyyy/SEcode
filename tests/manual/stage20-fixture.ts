import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PREFIX = "secode-stage20.";
const MARKER_FILE = ".secode-stage20-marker";
const MARKER_CONTENT = "SECODE_STAGE20_FIXTURE_V1\n";

async function create(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), PREFIX));
  const workspace = path.join(root, "workspace");
  const dataDir = path.join(root, "data");
  await mkdir(workspace);
  await mkdir(dataDir);
  await writeFile(path.join(root, MARKER_FILE), MARKER_CONTENT, "utf8");
  await writeFile(
    path.join(workspace, "AGENTS.md"),
    `# Stage 20 真实 LongCat 验收边界

- 这是一次性系统临时工作区；所有项目文件必须位于本工作区。
- 使用端口 4317 运行后端，使用端口 4318 运行前端；代码、脚本、README 和验证必须一致。
- 可以在本工作区安装项目依赖，但不得读取或修改工作区外的项目、Session 或用户数据。
- 不执行 Git commit、push、发布或部署，不删除 marker 所在的临时根。
- 先读取现状和指令，再按依赖顺序创建文件；完成前必须真实运行安装、类型检查、构建、关键测试、双服务 readiness、代表性 API 断言和页面关键流程。
- 保留真实 stdout/stderr 和退出码；不得把 HTTP 200 当作全部完成证据。
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
  process.stderr.write(`${error instanceof Error ? error.message : "stage20 fixture failed"}\n`);
  process.exitCode = 1;
});
