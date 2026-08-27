# SEcode 文档驱动开发索引

本目录记录 SEcode 从需求到提交的完整开发过程。阶段 03 起采用三级用户审批：Spec 通过后才能写 Task，Task 通过后才能开发，Summary 通过后才能进入下一阶段。

## 阶段状态

| 阶段 | 主题 | 状态 | 文档 |
| --- | --- | --- | --- |
| 00 | 开发流程与三级审批规范 | 已批准 | [00-process.md](./00-process.md) |
| 01 | 需求、范围与验收标准 | 已批准 | [01-requirements.md](./01-requirements.md) |
| 02 | 工程基线 | 已批准（旧流程） | [02-engineering-baseline.md](./02-engineering-baseline.md) |
| 03 | 领域类型与事件协议 | 已批准 | [Spec（已批准）](./03-domain-protocol-spec.md) / [Task 修订 1（已批准）](./03-domain-protocol-tasks.md) / [Summary（已批准）](./03-domain-protocol-summary.md) |
| 04 | 模型协议层 | Summary 待用户审批 | [Spec（已批准）](./04-model-protocol-spec.md) / [Task（已批准）](./04-model-protocol-tasks.md) / [Summary](./04-model-protocol-summary.md) |
| 05 | 工作区安全层 | 待开始 | Spec / Task / Summary 待生成 |
| 06 | 本地工具系统 | 待开始 | Spec / Task / Summary 待生成 |
| 07 | 风险分级与审批 | 待开始 | Spec / Task / Summary 待生成 |
| 08 | JSONL 事件存储 | 待开始 | Spec / Task / Summary 待生成 |
| 09 | Agent 状态机 | 待开始 | Spec / Task / Summary 待生成 |
| 10 | 上下文管理 | 待开始 | Spec / Task / Summary 待生成 |
| 11 | 可交互终端入口 | 待开始 | Spec / Task / Summary 待生成 |
| 12 | 终端测试与核心验收 | 待开始 | Spec / Task / Summary 待生成 |
| 13 | Next.js Route Handlers | 待开始 | Spec / Task / Summary 待生成 |
| 14 | 中文工作台与 UI E2E | 待开始 | Spec / Task / Summary 待生成 |
| 15 | 文档、视频与最终提交 | 待开始 | Spec / Task / Summary 待生成 |

## 需求追踪规则

- 功能需求使用 `FR-*` 标识。
- 非功能需求使用 `NFR-*` 标识。
- 安全需求使用 `SEC-*` 标识。
- 题目合规要求使用 `COM-*` 标识。
- 每个阶段必须列出覆盖的需求 ID、实现证据和验证证据。
- 发现需求冲突时，先更新需求文档并记录原因，不直接在代码中自行决定。

## 三级用户审阅门禁

- 观察后提交 Spec，批准前不得生成 Task。
- Spec 批准后提交 Task，批准前不得开发。
- 开发完成后提交 Summary，批准前不得进入下一阶段。
- 任何需要改变已批准规格或任务的情况都必须停止并重新审批。
- 详细规则以 [00-process.md](./00-process.md) 为准。

## 当前基线说明

仓库最初是 Next.js 16.3.3 默认模板。通用依赖、质量脚本和测试工具已在阶段 02 完成并获批准。三级审批流程从阶段 03 起完整执行。
