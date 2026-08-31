# 阶段 27 Task：项目 README 与运行说明

> **状态：已批准，T27-00～T27-05 已完成。** 本 Task 依据已批准的 [阶段 27 Spec](./27-project-readme-spec.md) 编写。用户于 2026-08-31 明确批准本 Task；README 已完成并通过文档专项验证，Summary 已生成并等待用户审批。README.txt、视频、ZIP、真实 provider、Git commit/push、发布和部署始终不在本 Task 范围。

## 1. 批准基线

- 前置 Summary：[阶段 26 Summary 修订 2](./26-agent-convergence-efficiency-summary.md)，用户于 2026-08-31 明确批准。
- 批准 Spec：[阶段 27 Spec](./27-project-readme-spec.md)，用户于 2026-08-31 明确批准。
- 本 Task 覆盖：`NFR-008`、`SEC-006`、`SEC-008`、`COM-001`～`COM-004`，以及 `AC27-01`～`AC27-08`。
- Task 审批：用户于 2026-08-31 明确回复“批准”，现允许按依赖顺序实施 T27-00～T27-05。

## 2. 实施原则

1. 只修改文档，不改变业务代码、测试、依赖、脚本、环境变量合同或运行行为。
2. README 的每项能力、命令、版本、环境变量和限制都必须能追溯到当前代码、配置或已批准阶段证据。
3. 快速开始优先于完整架构说明；读者不阅读开发阶段文档也能完成首次本地启动。
4. 不读取 `.env.local`，不调用真实 provider，不展示任何真实凭据、私有 endpoint、Session ID 或用户绝对路径。
5. 不把兼容性测试写成所有 provider 的最新真实验收，不把 `run.completed` 写成业务目标必然通过。
6. 不执行 Git commit/push、发布或部署。

## 3. 依赖顺序

```text
T27-00 审批与事实基线
  → T27-01 重写 README 主体
  → T27-02 命令、配置与链接核对
  → T27-03 安全、事实与模板残留审计
  → T27-04 Markdown 可读性与最终差异检查
  → T27-05 Summary 与停止点
```

## 4. 任务清单

### T27-00：审批、工作区与事实基线

**允许修改：**

- `docs/development/27-project-readme-tasks.md` 的实施记录
- 不修改根 README

**步骤：**

1. 运行 `git status --short`，确认并保留阶段 26 审批、阶段 27 Spec/Task 及用户已有修改。
2. 重新读取 `README.md`、`package.json`、`.env.example`、`lib/terminal/arguments.ts`、阶段 27 Spec 和阶段 26 Summary 的相关部分。
3. 使用 `git rev-parse HEAD` 与 `git rev-parse origin/main` 记录当前提交事实；不执行 fetch、pull 或其他网络/Git 写操作。
4. 建立 README 事实清单：版本、脚本、模型 profiles、六工具、数据目录、安全边界、测试数字、真实 provider 限制。

**完成条件：** 没有超出已批准 Spec 的新产品主张；发现冲突时停止并回到 Spec，不自行选择版本。

### T27-01：重写根 README

**允许修改：**

- `README.md`

**步骤：**

1. 删除全部 create-next-app 模板、npm/yarn/bun 并列命令和 Vercel 部署说明。
2. 按 Spec 第 5 节的信息架构编写中文 README：
   - 标题和一句话定位；
   - 核心能力；
   - Mermaid 架构图和纯文本调用链；
   - 安全边界；
   - 环境要求；
   - Web 快速开始；
   - 模型配置；
   - Terminal 使用；
   - 数据与恢复；
   - 验证；
   - 已知限制；
   - 开发文档索引。
3. 快速开始使用以下真实顺序：
   - `pnpm install --frozen-lockfile`；
   - `cp .env.example .env.local`；
   - 用户自行填写模型配置和 `SECODE_WORKSPACE_PICKER_ROOT`；
   - `pnpm dev`；
   - 打开 `http://localhost:3000`。
4. Terminal 示例同时覆盖新建 Session 和按 UUID 恢复，但只使用 `/absolute/path/to/project`、`/absolute/path/to/data`、`<session-uuid>` 等中性占位符。
5. 模型配置表只列 `.env.example` 已存在的变量；说明 DeepSeek Key 是默认 profile 的必需项，LongCat/Generic 由 base URL、model 和可选 Key 配置决定。
6. 验证章节区分：
   - 阶段 26 Summary 记录的 1034 unit/integration、51 E2E、coverage、双 build 和 agent-browser；
   - 2026-08-31 README 观察现场重跑的 lint、typecheck、coverage 1034 和 diff check。
7. 限制章节明确 T26R2-08 未执行、可信本地单用户、非强沙箱、工具串行、OpenAI-compatible Chat Completions 边界和无自动 commit/push/deploy。

**完成条件：** `README.md` 独立可读，命令可复制，架构与安全边界准确，未出现范围外产物。

### T27-02：命令、配置与链接核对

**允许修改：**

- `README.md`，仅修正核对发现的文档错误
- `docs/development/27-project-readme-tasks.md` 的实施记录

**步骤：**

1. 对照 `package.json` 核对 README 中每个 `pnpm` script 和 Node/pnpm 版本。
2. 对照 `lib/terminal/arguments.ts` 核对创建、恢复和交互命令；不得加入 CLI 未实现的 flag。
3. 对照 `.env.example`、`lib/model/config.ts`、`lib/storage/config.ts` 和 `lib/server/workspace-picker.ts` 核对环境变量、默认值和必需条件。
4. 对照 `lib/tools/schemas.ts` 或工具注册事实核对六个工具名。
5. 解析 README 中的仓库相对链接，逐一确认目标文件或目录存在；外部仓库 URL 只检查文本格式，本 Task 不发网络请求。
6. 核对 Mermaid 节点与纯文本调用链均包含 Browser/Terminal、Route Handlers、Agent Runtime、Context/Model、Approval/Tools/Workspace 和 JSONL Event Store。

**完成条件：** `AC27-02`～`AC27-04`、`AC27-08` 的静态事实检查通过。

### T27-03：安全、事实与模板残留审计

**允许修改：**

- `README.md`，仅修正审计问题
- `docs/development/27-project-readme-tasks.md` 的实施记录

**步骤：**

1. 扫描 README 中的 `sk-`、Bearer、Cookie、非空 API Key assignment、私有 endpoint、`.env.local` 值、UUID、`/Users/`、`/home/` 和临时目录形状；除公开变量名和中性占位符外不得命中敏感事实。
2. 扫描 `create-next-app`、`yarn`、`bun`、`Deploy on Vercel`、多租户、强沙箱、自动部署等模板或夸大描述。
3. 核对 README 没有声称 T26R2-08、阶段 19～22 或阶段 25 的失败路径已经追溯通过。
4. 核对 `run.completed` 相关文案表达为“正常交付最终回答”，并允许携带验证/启动限制，不宣称全部需求自动验收成功。
5. 核对仓库地址仅使用公开 HTTPS URL，不写 SSH remote。

**完成条件：** `AC27-01`、`AC27-03`、`AC27-05`～`AC27-07` 全部满足，无秘密或安全承诺扩大。

### T27-04：Markdown 可读性与最终差异检查

**允许修改：**

- `README.md`，仅修正文档结构、链接或排版
- `docs/development/27-project-readme-tasks.md` 的实施记录

**步骤：**

1. 检查 Markdown 标题层级、代码围栏、表格列、列表空行和 Mermaid 围栏闭合。
2. 确认快速开始位于架构深读之前或能从目录快速到达；避免把阶段开发流水账复制到 README。
3. 使用当前可用的 Markdown 渲染预览做人工可读性检查；若没有安全可用的渲染入口，则记录为静态审阅，不安装依赖。
4. 运行 `git diff --check`。
5. 运行 `git diff -- README.md docs/development/27-project-readme-tasks.md docs/development/README.md`，确认只存在获批范围内的文档修改。
6. 运行 `git status --short`，确认没有新增 README.txt、视频、ZIP、依赖、测试产物或业务代码修改。

**完成条件：** Markdown 静态结构、链接、事实和 diff check 通过；工作区没有越界修改。

### T27-05：Summary 与停止点

**允许修改/新增：**

- `docs/development/27-project-readme-summary.md`
- `docs/development/README.md`
- `docs/development/27-project-readme-tasks.md` 的最终实施记录

**步骤：**

1. 生成阶段 27 Summary，记录实际 README 结构、修改文件、事实来源和全部验证结果。
2. 如实记录任何初次检查失败、原因、修正和重跑；不得把未运行的全量测试、E2E、build 或真实 provider 写成通过。
3. 明确 README.txt、视频、ZIP、T26R2-08、Git commit/push、发布和部署均未执行。
4. 更新阶段索引为“Summary 待用户审批”。
5. 立即停止；用户批准 Summary 前不进入新的交付阶段。

**完成条件：** Summary 和索引状态一致，未越过用户审批门禁。

## 5. 验收追踪

| Spec 验收 | Task |
| --- | --- |
| AC27-01 | T27-01、T27-03 |
| AC27-02 | T27-01、T27-02 |
| AC27-03 | T27-01～T27-03 |
| AC27-04 | T27-01、T27-02 |
| AC27-05 | T27-01、T27-03 |
| AC27-06 | T27-01、T27-03、T27-05 |
| AC27-07 | T27-01、T27-03 |
| AC27-08 | T27-02、T27-04、T27-05 |

## 6. 预期文件范围

实施阶段只允许：

```text
README.md
docs/development/27-project-readme-tasks.md
docs/development/27-project-readme-summary.md
docs/development/README.md
```

阶段 26 审批同步形成的 `docs/development/00-process.md`、`docs/development/26-agent-convergence-efficiency-summary.md` 和阶段 27 Spec 属于进入本 Task 前已经发生的流程文档修改，不在 README 实施中继续扩展。

## 7. 不执行

- 不修改 `.env.example`、`package.json`、lockfile、Production、测试或配置。
- 不新增 Markdown lint、链接检查器或其他依赖。
- 不运行真实 provider，不读取 `.env.local`。
- 不创建 README.txt、视频、ZIP 或 delivery 目录。
- 不执行全量 unit/integration、coverage、E2E 或 build；本阶段是纯文档变更，除非用户在批准 Task 时明确增加这些门禁。
- 不执行 Git commit/push、release、部署或表单提交。

## 8. 失败与回退策略

- 事实源冲突：停止实施，回到 Spec 修订并等待批准。
- 需要修改运行行为或配置才能让 README 成立：删除该文案或回到 Spec，不修改业务代码。
- 相对链接不存在：优先改为实际存在的稳定文档；不得创建无授权占位文件。
- 秘密或真实路径命中：立即从 README 删除或替换为中性占位符，再完整重跑安全扫描。
- Markdown 渲染工具不可用：不安装依赖，保留静态结构检查并在 Summary 记录限制。

## 9. Task 审批

**当前状态：已批准，实施完成。**

- 审批时间：2026-08-31（北京时间）。
- 审批结果：用户明确回复“批准”，语义等价于批准阶段 27 Task。
- 实施范围：T27-00～T27-05 已完成；README.txt、视频、ZIP、真实 provider、Git 写入、发布和部署未执行。

## 10. 实施记录

- T27-00：实施前工作区只包含阶段 26 审批和阶段 27 Spec/Task 文档修改；`HEAD` 与 `origin/main` 均为 `9c60ec876d6cb7a921b41ee1fe6f60025bb264be`。
- T27-01：根 README 从 36 行 create-next-app 模板改为 212 行中文项目说明，覆盖定位、能力、Mermaid/纯文本架构、安全、Web/Terminal、模型配置、Session、验证、限制和文档索引。
- T27-02：README 中 17/17 个仓库相对链接存在；列出的环境变量集合与 `.env.example` 一致；所有 `pnpm` 命令对应 `package.json` 现有脚本；工具名和 CLI flag 与实现一致。
- T27-03：模板、npm/yarn/bun 并列启动、SSH remote、Bearer、`sk-`、UUID、`/Users/` 和 `/home/` 扫描无命中；中性 `<your-api-key>` 与 `/absolute/path/...` 占位符保留。
- T27-04：12 个 Markdown 代码围栏成对闭合，标题层级为一个 H1 加连续 H2；`git diff --check` 通过。当前没有独立 Markdown 渲染依赖，使用静态结构、差异和 Codex 文件预览审阅，未安装新工具。
- T27-05：已生成 `27-project-readme-summary.md` 并将阶段索引更新为 Summary 待审批。
- 编辑过程曾有两次补丁应用失败：首次因为同一补丁同时删除和新增 README，第二次因为模板 URL 参数与上下文不完全匹配；两次均在写入前被 `apply_patch` 拒绝，没有产生部分文件修改。随后拆分为审批同步、删除旧模板和新增同路径 README 三个原子补丁完成。
