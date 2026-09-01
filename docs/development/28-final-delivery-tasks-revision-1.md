# 阶段 28 Task 修订 1：README.txt 交付

> **状态：已批准，T28R1-00～T28R1-03 已完成。** 用户于 2026-08-31 明确回复“批准”。根 README.txt 已创建并通过专项核验，阶段 Summary 已生成并等待用户审批。视频与 ZIP 由用户自行处理；Git 写入未授权且未执行。

## 1. 批准基线

- 前置阶段：[阶段 27 Summary](./27-project-readme-summary.md) 已获用户批准。
- 批准规格：[阶段 28 Spec 修订 1](./28-final-delivery-spec.md)，用户于 2026-08-31 明确批准。
- 被取代任务：[原阶段 28 Task](./28-final-delivery-tasks.md) 未获有效实施授权，不再执行。
- 覆盖需求：`NFR-008`、`SEC-006`、`SEC-008`、`COM-001`～`COM-004`、`COM-006`。
- 覆盖验收：`AC28R1-01`～`AC28R1-07`。

## 2. 实施原则

1. 唯一用户交付物是仓库根目录 `README.txt`。
2. 内容以当前 `README.md`、`package.json`、`.env.example` 和 CLI 实现为事实源。
3. 不读取 `.env.local`，不调用真实 provider，不处理视频或 ZIP。
4. 不修改 Production、测试、依赖、配置或 `.gitignore`。
5. 不执行 Git add/commit/push、发布、部署或表单提交。

## 3. 依赖顺序

```text
T28R1-00 审批与事实基线
  → T28R1-01 创建 README.txt
  → T28R1-02 字符、事实与安全核验
  → T28R1-03 Summary 与停止点
```

## 4. 任务清单

### T28R1-00：审批与事实基线

**允许修改：**

- `docs/development/28-final-delivery-tasks-revision-1.md` 的实施记录

**步骤：**

1. 运行 `git status --short`，保留全部已有修改，不 reset、stash 或覆盖用户内容。
2. 读取 `README.md`、`package.json`、`.env.example`、`lib/terminal/arguments.ts` 和阶段 28 Spec 修订 1。
3. 核对 Node/pnpm 要求、安装脚本、Web/Terminal 命令、环境配置、六工具、仓库 URL 和已知限制。
4. 若事实源冲突或需要修改运行行为才能让说明成立，停止并回到 Spec，不修改代码。

**完成条件：** README.txt 所需事实均有当前仓库依据，未产生范围外修改。

### T28R1-01：创建根 README.txt

**允许新增：**

- `README.txt`

**步骤：**

1. 使用 UTF-8、LF 换行和末尾换行创建纯文本文件。
2. 依次写明项目名称与简介、公开仓库、环境要求、配置方式、Web/Terminal 最短运行步骤、核心特色和必要限制。
3. 使用公开 HTTPS 仓库 URL；配置只引用 `.env.example` 和中性占位符。
4. 不使用 Markdown 表格、HTML、图片、ANSI 序列或不可见控制字符。
5. 内容目标不超过 900 Unicode code points，硬上限为 1000。

**完成条件：** 根 README.txt 独立可读，覆盖 Spec 第 4 节全部必要信息。

### T28R1-02：字符、事实与安全核验

**允许修改：**

- `README.txt`，仅修正核验发现的问题
- `docs/development/28-final-delivery-tasks-revision-1.md` 的实施记录

**步骤：**

1. 验证 UTF-8 解码、LF、文件末尾换行，并检查 NUL、ANSI 和异常控制字符。
2. 统计 Unicode code points、汉字数和 UTF-8 bytes；code points 与汉字数均不得超过 1000。
3. 对照事实源逐项核对仓库 URL、Node/pnpm、安装、环境配置、Web/Terminal 命令、能力和限制。
4. 扫描真实 Key、Bearer/Cookie、非空 Key assignment、私有 endpoint、用户绝对路径、UUID、PID、Session ID、真实日志和模板残留。
5. 核对没有夸大真实 provider 验收、安全沙箱、自动 commit/push/deploy 或最终视频/ZIP状态。
6. 运行 `git diff --check` 和 `git status --short`，确认未引入视频、ZIP、delivery、业务代码、测试、依赖、配置或 `.gitignore` 修改。
7. 若检查失败，只在允许范围内修正并完整重跑。

**完成条件：** `AC28R1-01`～`AC28R1-06` 全部通过，并记录真实计数与结果。

### T28R1-03：Summary 与停止点

**允许新增/修改：**

- `docs/development/28-final-delivery-summary.md`
- `docs/development/28-final-delivery-tasks-revision-1.md` 的实施记录
- `docs/development/README.md`

**步骤：**

1. 生成阶段 28 Summary，记录 README.txt 内容范围、字符统计、事实核对、安全扫描、diff check 和工作区边界。
2. 明确视频、ZIP、Git 写入、发布、部署和表单提交均未执行，由用户自行处理。
3. 更新阶段索引为“Summary 待用户审批”并立即停止。

**完成条件：** `AC28R1-07` 通过，Summary 与真实执行证据一致。

## 5. 验收追踪

| Spec 验收 | Task |
| --- | --- |
| AC28R1-01 | T28R1-01、T28R1-02 |
| AC28R1-02 | T28R1-01、T28R1-02 |
| AC28R1-03 | T28R1-00～T28R1-02 |
| AC28R1-04 | T28R1-01、T28R1-02 |
| AC28R1-05 | T28R1-02 |
| AC28R1-06 | T28R1-02 |
| AC28R1-07 | T28R1-03 |

## 6. 允许文件范围

```text
README.txt
docs/development/28-final-delivery-tasks-revision-1.md
docs/development/28-final-delivery-summary.md
docs/development/README.md
```

进入实施前已经存在的流程审批文档修改予以保留，但不在本 Task 中继续扩展。若需要修改其他文件，立即停止并重新审批。

## 7. 不执行

- 不搜索、读取、播放、核验、复制、移动、转码或删除视频。
- 不创建 ZIP 或 delivery，不修改 `.gitignore`。
- 不运行全量 unit/integration、coverage、E2E、production build 或真实 provider。
- 不读取 `.env.local`，不输出秘密或本机敏感信息。
- 不执行 Git add/commit/push、release、部署或表单提交。

## 8. 失败与回退

- 字符超限：精简文本并重新执行完整专项检查。
- 命令或配置错误：按当前事实源修正；若事实源冲突则停止并回到 Spec。
- 秘密或本机信息命中：删除或替换为中性占位符后完整重跑。
- 需要代码/配置变更：停止，不在本交付 Task 内修复。

## 9. Task 修订 1 审批

**当前状态：已批准，实施完成。**

- 审批时间：2026-08-31（北京时间）。
- 审批结果：用户明确回复“批准”。
- 解锁范围：T28R1-00～T28R1-03，现已完成；不包含视频、ZIP、Git 写入、发布、部署或表单提交。

## 10. 实施记录

- T28R1-00：读取并核对当前 `README.md`、`package.json`、`.env.example` 和 `lib/terminal/arguments.ts`。确认 Node.js `>=20.9.0`、pnpm `10.33.3`、Web/Terminal 命令、环境配置、六工具、公开仓库和限制事实一致。
- T28R1-01：创建根 `README.txt`，使用 UTF-8 与 LF，覆盖项目简介、公开仓库、环境、Web/Terminal 运行、核心特色和注意事项。
- T28R1-02：最终计数为 899 Unicode code points、234 个汉字、1441 UTF-8 bytes；CR、NUL、ANSI 和异常控制字符均为 0，文件保留末尾 LF。命令/事实命中检查通过，秘密、真实用户路径、UUID 和模板残留扫描无风险命中，`git diff --check` 通过。
- T28R1-02 初次检查：初稿为 988 code points，满足硬上限但未达到 900 的保守目标；第一次精简后为 917，第二次为 903，最终精简至 899。每次均保持必要内容，最终完整重跑全部专项检查通过。
- 工作区边界：实施开始前已存在用户侧 `README.md` 修改和一个 PDF 删除，以及此前阶段流程文档修改；本 Task 未修改或恢复这些用户内容。未新增视频、ZIP、delivery、业务代码、测试、依赖、配置或 `.gitignore` 修改。
- T28R1-03：已生成 `28-final-delivery-summary.md`，阶段索引更新为 Summary 待用户审批并停止。
