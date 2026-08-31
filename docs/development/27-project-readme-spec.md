# 阶段 27 Spec：项目 README 与运行说明

> **状态：已批准。** 本 Spec 仅定义根 `README.md` 的改写范围。用户于 2026-08-31 明确批准本 Spec，现只解锁阶段 27 Task 编写；Task 获批前不得修改根 README。README.txt、视频、ZIP、Git commit/push、发布和表单提交均不在本轮范围。

## 1. 阶段目标与审批边界

用户于 2026-08-31 明确批准阶段 26，并要求完善 README。阶段 26 Summary 修订 2 已同步为已批准，因此本轮获准进入阶段 27 的只读观察和 Spec 编写。

本阶段目标是把当前 create-next-app 模板 README 改为一份面向仓库审阅者和本地使用者的中文项目说明，使读者能够准确理解 SEcode 的定位、架构、运行方式、安全边界、验证证据和已知限制。

审批链：

```text
阶段 26 Summary 修订 2（已批准）
  → 阶段 27 只读观察（已完成）
  → 本 Spec（已批准）
  → 阶段 27 Task（待用户审批）
  → 用户审批 Task
  → 修改 README.md 并验证
  → 阶段 27 Summary
  → 用户审批 Summary
```

## 2. 需求映射

- `NFR-008`：关键设计与验证证据可追踪。
- `SEC-006`：API Key 不进入客户端、仓库、日志或说明文档。
- `SEC-008`：明确可信本地单用户边界，不把本项目描述为恶意代码安全沙箱。
- `COM-001`～`COM-004`：准确说明自研 Agent 核心、无 Agent 框架和无托管代码工具依赖，并保持凭据安全。

`COM-006`～`COM-008` 对应提交 README.txt、视频和最终截止门禁，不由本轮根 README Spec 实施或验收。

## 3. 观察范围与事实证据

### 3.1 已观察文件

- 根 `README.md`：仍是英文 create-next-app 模板，内容与实际产品不符。
- `package.json`：Next.js 16.3.3、React 19.2.8、TypeScript、pnpm 10.33.3；包含 Web、Terminal、lint、typecheck、test、coverage、E2E 和 build 脚本。
- `.env.example`：包含 DeepSeek、LongCat、Generic OpenAI-compatible、`SECODE_DATA_DIR` 和 `SECODE_WORKSPACE_PICKER_ROOT` 的无秘密示例。
- `lib/terminal/arguments.ts`：记录 CLI 启动方式、Session 恢复和交互命令。
- `lib/agent`、`lib/context`、`lib/model`、`lib/tools`、`lib/workspace`、`lib/approval`、`lib/storage`、`lib/server`、`lib/client`：确认 README 可描述的实际模块边界。
- `docs/development/01-requirements.md` 与阶段 03～26 最新文档：确认能力、限制、失败历史和真实验收状态。
- Git：当前 `main` 的 HEAD 与 `origin/main` 均为 `9c60ec876d6cb7a921b41ee1fe6f60025bb264be`；本轮观察开始时工作区干净。

### 3.2 可公开陈述的当前事实

1. SEcode 是 Next.js 本地单用户 Coding Agent，核心链路自行实现，不使用 LangChain、Vercel AI SDK、OpenAI Agents SDK 等 Agent 框架。
2. Agent 通过 OpenAI-compatible Chat Completions 流协议连接 DeepSeek、LongCat 或 Generic profile。
3. 首版提供 `list_directory`、`read_file`、`search_text`、`write_file`、`replace_in_file`、`run_process` 六个本地工具。
4. 系统包含 Plan Mode、危险工具审批、取消、运行预算、中文输出门禁、上下文压缩、JSONL 恢复、Token/cache 统计和 Web/Terminal 入口。
5. 工作区 realpath、符号链接、敏感路径、原子写、进程参数和本机 HTTP 请求均有确定性约束。
6. 最新自动证据为 1034 项 unit/integration、51 项 E2E、coverage、双 build 和 agent-browser 通过；本次 README 观察前另行现场核对 lint、typecheck、1034 项 coverage 测试和 diff check 通过。
7. 阶段 26 修订 2 的最新策略尚未执行可选真实 provider T26R2-08；历史真实 DeepSeek/LongCat 结果必须按开发文档原样表述，不能概括成“所有 provider 全面通过”。

### 3.3 当前 README 缺口

- 没有产品定位、功能说明或架构。
- 启动命令仍同时列出 npm/yarn/pnpm/bun，与仓库固定 pnpm 约束不符。
- 没有模型和工作区配置步骤。
- 没有 Terminal 入口、数据目录、Session 恢复、审批和取消说明。
- 没有可信本地单用户与“非强沙箱”边界。
- 没有质量门禁、测试规模、已知限制和开发文档索引。
- 保留 Vercel 部署模板，会错误暗示当前本地文件和子进程能力适合直接托管部署。

## 4. 范围

### 4.1 范围内

1. 以中文完整重写根 `README.md`。
2. 提供可复制的 pnpm 安装、配置、Web 启动和 Terminal 启动命令。
3. 用 Mermaid 或等价纯文本图说明 Browser/Terminal、Route Handler、Agent Runtime、Model、Tools、Approval、Workspace 和 JSONL Event Store 的关系。
4. 说明六工具、Plan Mode、审批、取消、上下文、恢复、可观测性和服务 readiness。
5. 说明模型 profile 环境变量，但不写任何真实凭据、私有端点或本机个人路径。
6. 说明测试命令、当前通过证据和开发文档入口。
7. 明确已知限制、运行信任边界和阶段 26 最新真实 provider 未验收事实。

### 4.2 范围外

- 修改 Production、测试、依赖、配置 Schema、环境变量合同或开发脚本。
- 创建或修改提交包专用 `README.txt`。
- 创建视频脚本、录制/编辑视频、生成 ZIP 或提交材料。
- 执行真实 provider、读取 `.env.local`、输出 API Key 或真实 endpoint。
- Git commit、push、release、部署或表单提交。
- 因 README 文案修改需求、事件协议、安全边界或产品行为。

## 5. README 信息架构

根 README 采用以下顺序：

1. **项目标题与定位**：一句话解释“本地单用户、自研核心的编程智能体”。
2. **核心能力**：六工具、原生模型工具循环、Plan Mode、审批/取消、上下文压缩、JSONL 恢复、中文 Web/Terminal。
3. **架构概览**：展示入口、Agent、模型、工具、安全和持久化的主调用链，并链接关键目录。
4. **安全边界**：工作区限制、符号链接防逃逸、原子写、无 shell 拼接、危险审批、可信本地单用户、非恶意代码沙箱。
5. **环境要求**：Node `>=20.9.0`、pnpm `10.33.3`，说明当前 Next.js/React 版本。
6. **快速开始**：安装、复制 `.env.example`、设置最少模型配置和 picker root、启动 Web。
7. **模型配置**：DeepSeek、LongCat、Generic 的必需/可选变量表；不复制真实值。
8. **Terminal 使用**：创建/恢复 Session 的示例和 `/plan`、审批、取消等交互命令入口。
9. **数据与恢复**：`.secode-data` 默认位置、Session 固定工作区/模型、JSONL 事实源和删除语义。
10. **验证**：列出 lint、typecheck、test、coverage、E2E、build 命令及最近证据日期。
11. **已知限制**：本地单用户、非强沙箱、仅 OpenAI-compatible Chat Completions、工具串行、真实 provider 最新回归状态、无自动 commit/push/deploy。
12. **开发文档**：链接需求、流程、阶段索引和当前阶段 26 Summary。

## 6. 文案与安全约束

- 中文优先；代码、命令、路径、环境变量、协议名和模型 ID 保持原样。
- 不出现真实 API Key、Cookie、Bearer、私有 endpoint、`.env.local` 内容、Session ID 或用户绝对路径。
- 不宣称支持多租户、远程任意工作区、恶意代码隔离、自动部署或未实现的 Agent 能力。
- 不把 `run.completed` 等同于业务目标必然通过；README 应说明最终回答会如实携带未完成验证或服务启动警告。
- 不宣称 T26R2-08 已执行，不抹除阶段 19～22 和阶段 25 的真实失败历史。
- 不使用会随当前机器变化的 PID、端口、测试临时目录或绝对路径作为示例。
- 删除全部 create-next-app、Vercel 部署模板和与本项目无关的教学链接。

## 7. 可测试验收标准

| ID | 验收标准 |
| --- | --- |
| AC27-01 | 根 README 不再包含 create-next-app 模板、npm/yarn/bun 并列启动或 Vercel 部署建议。 |
| AC27-02 | README 的安装、Web、Terminal、质量命令均与 `package.json` 和 CLI 解析器一致。 |
| AC27-03 | README 列出的环境变量均存在于 `.env.example` 或真实配置读取代码；不出现秘密和用户绝对路径。 |
| AC27-04 | 六工具、主要模块、Plan Mode、审批、取消、恢复、上下文和 usage/cache 描述与当前实现一致。 |
| AC27-05 | 安全章节明确可信本地单用户、工作区边界和非强沙箱，不扩大安全承诺。 |
| AC27-06 | 验证章节准确记录 2026-08-31 的最新自动证据，并区分“本轮现场重跑”和“阶段 Summary 记录”。 |
| AC27-07 | 已知限制明确 T26R2-08 未执行，以及 Generic/LongCat compatible 不等于最新策略已在所有 provider 真实通过。 |
| AC27-08 | README 内部相对链接、Markdown 结构、命令和 `git diff --check` 通过；不新增依赖或业务代码变更。 |

## 8. 预期文件范围

Spec 获批后只能先生成阶段 27 Task。Task 再获批后，预期允许修改：

```text
README.md
docs/development/27-project-readme-tasks.md
docs/development/27-project-readme-summary.md
docs/development/README.md
```

如实施中发现需要修改 `.env.example`、`package.json`、Production、测试、安全边界或需求文档，必须停止并回到本 Spec 修订，不得顺手修改。

## 9. 验证方案

Task 应至少要求：

1. 对 README 中的命令、环境变量和相对链接做确定性核对。
2. 扫描真实凭据模式、私有 endpoint、用户绝对路径和模板残留，并对测试示例之外的命中逐项判断。
3. 运行 Markdown/链接的轻量检查；仓库没有现成 Markdown lint 时不新增依赖，可使用确定性文本检查和人工渲染审阅。
4. 运行 `git diff --check`。
5. README 不修改运行时代码，因此默认不重复全量 1034 测试、E2E 或双 build；若 Task 审批时用户要求全量门禁，再明确加入。

## 10. 风险与取舍

| 风险 | 处理 |
| --- | --- |
| README 为追求宣传效果夸大真实 provider 或完成能力 | 只采用代码、最新 Summary 和真实验收记录中的事实；单列限制。 |
| 快速开始复制后无法运行 | 命令逐项对照脚本/CLI，最少配置明确区分 Web 与 Terminal。 |
| Mermaid 在部分阅读器不可用 | 图下提供一行纯文本调用链，不让架构理解依赖渲染器。 |
| 文档过长、核心步骤难找 | 快速开始前置，深入架构和开发流程后置；避免复制阶段文档。 |
| README 暴露安全信息 | 只引用变量名和占位符，不读取 `.env.local`；执行秘密/路径扫描。 |
| 根 README 与提交 README.txt 混淆 | 本阶段明确只改 `README.md`；README.txt 另行定规格。 |

## 11. 待用户确认

1. 本轮只完善根 `README.md`，不同时创建提交包专用 `README.txt`、视频或 ZIP。
2. README 使用简体中文为主，保留必要英文技术名词和命令。
3. README 可以公开写入仓库地址 `https://github.com/StarKirbyyy/SEcode`，但本阶段不执行 commit 或 push。

## 12. Spec 审批

**当前状态：已批准。**

- 审批时间：2026-08-31（北京时间）。
- 审批结果：用户明确回复“批准”，语义等价于批准阶段 27 Spec。
- 解锁范围：只允许生成 `27-project-readme-tasks.md`。
- 未解锁范围：根 `README.md` 修改、Summary、README.txt、视频、ZIP、真实 provider、Git 写入、发布和部署均未授权。
