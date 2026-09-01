# 阶段 27 Summary：项目 README 与运行说明

> **状态：已批准。** 阶段 27 Spec、Task 均已批准，T27-00～T27-05 已完成；用户于 2026-08-31 明确批准本 Summary，阶段 27 正式完成并解锁阶段 28 最终交付的只读观察与 Spec 编写。

## 1. 结果

根 `README.md` 已从 create-next-app 英文模板改为 212 行、10075 bytes 的中文项目说明。新 README 面向首次本地使用者和仓库审阅者，能够独立说明 SEcode 的定位、核心能力、架构、安全边界、环境要求、Web/Terminal 使用、模型配置、Session 恢复、验证证据、已知限制和开发文档入口。

本阶段没有修改 Production、测试、依赖、脚本、配置 Schema 或环境变量合同。

## 2. 实际实现

### 2.1 README 内容

- 明确 SEcode 是本地可信单用户 Coding Agent，核心链路自行实现，不依赖 Agent 框架或托管代码执行。
- 列出六工具、Plan Mode、危险审批、取消、预算、上下文压缩、JSONL 恢复和 usage/cache 可观测性。
- 增加 Mermaid 架构图和不依赖 Mermaid 渲染的纯文本调用链，并链接九个核心模块目录。
- 增加确定性安全边界，明确工作区 realpath、符号链接、原子写、`spawn(program,args)`、审批、同源 API 和凭据边界。
- 提供 Node/pnpm/Next.js/React 版本、Web 快速开始、三类模型 profile 环境变量和 Terminal 新建/恢复示例。
- 说明 Session 固定绑定、事件事实源、上下文压缩、删除语义及 `run.completed` 的真实含义。
- 区分本轮现场验证与阶段 26 已批准的 E2E、双 build、agent-browser 证据。
- 明确可信本地用户、非强沙箱、Chat Completions 边界、工具串行、T26R2-08 未执行和无自动发布等限制。
- 删除 create-next-app 教学内容、四包管理器并列命令和 Vercel 部署模板。

### 2.2 流程文档

- 阶段 26 Summary 和流程索引已同步用户对阶段 26 的批准。
- 阶段 27 Spec、Task、实施记录和阶段索引均与真实审批状态一致。
- 本 Summary 只记录已执行的 README 文档工作，不追认任何范围外验收。

## 3. 修改文件

- `README.md`
- `docs/development/00-process.md`（阶段 26 Summary 与阶段 27 Spec 审批同步）
- `docs/development/26-agent-convergence-efficiency-summary.md`（阶段 26 批准状态）
- `docs/development/README.md`
- `docs/development/27-project-readme-spec.md`
- `docs/development/27-project-readme-tasks.md`
- `docs/development/27-project-readme-summary.md`

没有修改或创建 README.txt、视频、ZIP、Production、测试、依赖、lockfile 或配置文件。

## 4. 验证

| 检查 | 结果 |
| --- | --- |
| 工作区基线 | 实施前 `HEAD` 与 `origin/main` 均为 `9c60ec876d6cb7a921b41ee1fe6f60025bb264be`；保留已有阶段文档修改 |
| README 相对链接 | 17/17 个目标存在，0 missing |
| 环境变量 | README 与 `.env.example` 的 16 个变量集合一致 |
| pnpm 命令 | `agent`、`lint`、`typecheck`、`test`、`test:coverage`、`test:e2e`、`build` 均存在于 `package.json` |
| 工具与 CLI | 六工具名、`--workspace`、`--model`、`--session`、`--data-dir` 和交互命令均与实现一致 |
| 模板/秘密/路径扫描 | create-next-app、Vercel 模板、npm/yarn/bun 并列启动、SSH remote、Bearer、`sk-`、UUID、真实 home path 均无命中 |
| Markdown 结构 | 12 个代码围栏成对闭合；一个 H1，后续为连续 H2；表格和列表静态审阅通过 |
| `git diff --check` | 通过 |
| 越界产物 | 未发现 README.txt、MP4 或 ZIP |

本阶段没有重跑 unit/integration、coverage、E2E、build 或真实 provider。README 中的 1034 项测试、coverage、51 项 E2E、双 build 和 agent-browser 数据分别明确标注了现场重跑与阶段 26 Summary 来源，没有把未执行门禁写成本轮通过。

## 5. 失败与修正

1. 首次补丁尝试在一个 patch 中同时删除和新增 `README.md`，被 `apply_patch` 的目标冲突检查拒绝；没有文件变化。
2. 第二次整文件更新使用的模板末尾 URL 与真实文件包含的查询参数不完全一致，因此上下文校验失败；README 仍未变化。
3. 随后将操作拆为审批状态同步、删除旧模板、创建同路径新 README 三个补丁，成功完成且未覆盖其他文件。
4. 初次差异审阅发现“已批准的[阶段 26 Summary]”缺少空格，仅做 Markdown 文案修正后重新运行链接、结构和 diff check，全部通过。

## 6. 安全与事实检查

- 未读取 `.env.local` 或真实凭据，未调用任何真实 provider。
- README 只使用 `<your-api-key>`、`/absolute/path/...`、`<session-uuid>` 等中性占位符。
- 未公开 SSH remote、真实用户路径、Session ID、PID、临时端口或私有 endpoint。
- 没有把工作区限制描述成恶意代码强沙箱。
- 没有把 LongCat/Generic compatible 或历史回归描述成阶段 26 最新真实 provider 全通过。
- 没有把 `run.completed` 描述为全部业务需求自动验收成功。

## 7. 偏差与限制

- Spec 允许 Mermaid 或等价纯文本图，最终两者都提供，保证 GitHub 和不支持 Mermaid 的阅读器均能理解主调用链。
- 仓库没有现成 Markdown lint/本地 GitHub Markdown 渲染依赖。本阶段遵守 Task，不安装新依赖；采用静态结构、链接、差异和 Codex 文件预览审阅。这不等价于真实 GitHub 页面网络验收。
- 本阶段有意不执行全量测试和 build，因为只修改文档；既有完整门禁引用已明确注明来源。

## 8. 剩余门禁

- 阶段 27 Summary 尚待用户批准。
- README.txt、视频、ZIP 和最终提交材料需另行定规格与授权。
- T26R2-08 真实 provider 仍未执行且不追认为通过。
- Git commit/push、发布、部署和表单提交均未授权、未执行。

## 9. Summary 审批

**当前状态：已批准。**

- 审批时间：2026-08-31（北京时间）。
- 审批结果：用户明确回复“批准，现在进入交付阶段，演示视频我已经录制完毕”，语义等价于批准阶段 27 Summary 并要求开始阶段 28 只读观察。
- 后续事实：用户已自行完成演示视频录制；视频路径、元数据和内容尚未由本项目核验。
- 解锁范围：阶段 28 最终交付只读观察与 Spec 编写。
- 未解锁范围：视频移动/编辑/转码、README.txt、ZIP、Git 写入、push、发布、部署和表单提交仍需阶段 28 Task 或独立授权。
