# 阶段 28 Spec 修订 1：README.txt 交付

> **状态：已批准。** 用户于 2026-08-31 明确回复“批准”，阶段 28 Spec 修订 1 获批并只解锁 Task 修订 1 编写。视频与 ZIP 由用户自行处理；Task 修订 1 获批前不得创建 README.txt。

## 1. 修订原因与审批边界

原 Spec 同时覆盖 README.txt、视频核验、ZIP、全量交付门禁和可选 Git push。用户现明确只需要 Codex 提供 README.txt：

- 演示视频由用户自行加入；
- ZIP 由用户自行压缩；
- 不需要 Codex 搜索、读取、核验、复制、转码或删除视频；
- 不需要 Codex 创建 `delivery/`、修改 `.gitignore` 或生成 ZIP；
- 不需要 Codex 执行 Git commit/push、远端核验或提交表单。

审批链调整为：

```text
原阶段 28 Spec（已批准但范围被用户收窄）
  → 原阶段 28 Task（未获有效实施授权，被本修订取代）
  → 本 Spec 修订 1（已批准）
  → Task 修订 1（待用户审批）
  → 用户审批 Task 修订 1
  → 创建并核验 README.txt
  → 阶段 28 Summary
  → 用户审批 Summary
```

## 2. 目标与需求映射

阶段 28 的唯一交付目标是在仓库根目录创建一份简洁、准确、可直接放入用户最终 ZIP 的 `README.txt`。

- `NFR-008`：交付说明可追踪且与真实项目一致。
- `SEC-006`：README.txt 不包含 API Key、Token、Cookie、真实凭据或敏感日志。
- `SEC-008`：如实说明可信本地单用户边界，不扩大安全承诺。
- `COM-001`～`COM-004`：准确说明自研 Agent 核心、运行方式与边界。
- `COM-006`：README.txt 不超过 1000 汉字。

视频与 ZIP 的 `COM-007` 以及最终仓库/截止事项由用户自行负责，不作为本阶段 Codex 验收结论。

## 3. 范围

### 3.1 范围内

1. 创建根 `README.txt`。
2. 使用 UTF-8 纯文本和 LF 换行。
3. 包含项目名称、公开仓库 URL、环境要求、配置方式、Web/Terminal 最短运行步骤、核心特色和必要限制。
4. 对照 `README.md`、`package.json`、`.env.example` 和 CLI 实现核对事实。
5. 统计 Unicode code points、汉字数和 UTF-8 bytes。
6. 检查控制字符、秘密模式、真实路径、UUID、私有 endpoint 和错误命令。
7. 执行 `git diff --check`，生成阶段 Summary 并等待审批。

### 3.2 范围外

- 搜索、读取、播放、核验、复制、移动、重命名、转码或删除演示视频。
- 创建或修改 `delivery/`、`.gitignore`、视频副本或 ZIP。
- 检查最终 ZIP 的文件名、内容、体积、哈希或目录结构。
- 代替用户执行视频隐私检查、压缩或表单提交。
- 运行真实 provider、读取 `.env.local`、修改业务代码、测试、依赖或配置。
- 执行 Git add/commit/push、发布、部署或匿名远端核验。
- 为纯文本交付重新运行全量 unit/integration、coverage、E2E 或 production build。

## 4. README.txt 内容规格

建议结构：

```text
SEcode 编程智能体
项目简介：...
代码仓库：https://github.com/StarKirbyyy/SEcode
环境要求：...
运行方式：...
核心特色：...
注意事项：...
```

必须满足：

1. 仓库地址固定为 `https://github.com/StarKirbyyy/SEcode`，不使用 SSH remote。
2. Node.js、pnpm、安装、环境配置、Web 与 Terminal 命令必须来自当前事实源。
3. 环境配置只说明复制 `.env.example` 和自行填写，不包含任何真实值。
4. 核心特色简述自研 Agent 循环、六个本地工具、审批与工作区隔离、JSONL 事件、中文 Web/Terminal。
5. 限制明确：可信本地单用户应用，不是恶意代码安全沙箱；LongCat/Generic 为 OpenAI-compatible 配置；不会自动 commit/push/deploy。
6. 不使用 Markdown 表格、HTML、图片、ANSI 序列或不可见控制字符。
7. 总 Unicode code points `<=1000`，目标 `<=900`；同时记录汉字数和 UTF-8 bytes，保留文件末尾换行。
8. 不包含用户名、用户绝对路径、Session ID、PID、真实 endpoint、真实日志或凭据。

## 5. 验收标准

| ID | 验收标准 |
| --- | --- |
| AC28R1-01 | 根 `README.txt` 存在，是 UTF-8 纯文本、LF 换行、无 NUL/ANSI/异常控制字符，并保留末尾换行。 |
| AC28R1-02 | Unicode code points 与汉字数均不超过 1000；目标总 code points 不超过 900；记录 UTF-8 bytes。 |
| AC28R1-03 | 项目定位、公开仓库 URL、环境要求、配置、Web/Terminal 命令与当前事实源一致。 |
| AC28R1-04 | 核心特色和限制准确，不夸大 provider 验收、安全沙箱或自动 Git/部署能力。 |
| AC28R1-05 | 秘密、真实路径、UUID、私有 endpoint、模板残留和敏感日志扫描无风险命中。 |
| AC28R1-06 | `git diff --check` 通过，工作区没有本修订引入的视频、ZIP、delivery、业务代码、测试、依赖或配置修改。 |
| AC28R1-07 | Summary 如实记录 README.txt 的字符统计、事实核对、扫描结果、未执行项和用户自行负责的视频/ZIP步骤。 |

## 6. 预期文件范围

实施阶段只允许：

```text
README.txt
docs/development/28-final-delivery-spec.md
docs/development/28-final-delivery-tasks-revision-1.md
docs/development/28-final-delivery-summary.md
docs/development/28-final-delivery-tasks.md（仅标记被取代）
docs/development/README.md
docs/development/00-process.md
```

阶段 27 Summary 的审批同步属于进入阶段 28 前的既有流程修改，不在 README.txt 实施中继续扩展。

## 7. 风险与处理

| 风险 | 处理 |
| --- | --- |
| README.txt 超过题目限制 | 以 code points 和汉字数双重保守检查，精简内容后完整重跑。 |
| 命令或配置与仓库不一致 | 只采用当前代码与配置事实，不凭历史记忆编写。 |
| 文本带入秘密或本机信息 | 使用中性占位符并执行专项模式扫描。 |
| 用户最终 ZIP 不合规 | 本阶段不核验 ZIP；在 Summary 中明确由用户自行确认。 |
| 误解为授权 Git 写入 | Spec/Task 批准均不授权 add、commit 或 push。 |

## 8. 用户自行负责的最终动作

Codex 交付 README.txt 后，用户自行：

1. 将 README.txt 与已录制的演示视频放入最终 ZIP；
2. 核对视频为 MP4、时长不超过 2 分钟、体积不超过 200 MB 且无凭据或隐私；
3. 按提交要求命名 ZIP 并检查其中没有额外文件；
4. 自行提交最终表单；
5. 如需 Git commit/push，另行明确授权或自行执行，并遵守截止时间。

## 9. Spec 修订 1 审批

**当前状态：已批准。**

- 审批时间：2026-08-31（北京时间）。
- 审批结果：用户明确回复“批准”。
- 解锁范围：只允许编写 `28-final-delivery-tasks-revision-1.md`；Task 修订 1 获批后才创建 README.txt。
- 视频、ZIP、Git 写入、发布、部署和表单提交仍不在 Codex 当前授权范围。
