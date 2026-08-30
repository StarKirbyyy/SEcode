# SEcode 文档驱动开发索引

本目录记录 SEcode 从需求到提交的完整开发过程。阶段 03 起采用三级用户审批：Spec 通过后才能写 Task，Task 通过后才能开发，Summary 通过后才能进入下一阶段。

## 阶段状态

| 阶段 | 主题 | 状态 | 文档 |
| --- | --- | --- | --- |
| 00 | 开发流程与三级审批规范 | 已批准 | [00-process.md](./00-process.md) |
| 01 | 需求、范围与验收标准 | 已批准 | [01-requirements.md](./01-requirements.md) |
| 02 | 工程基线 | 已批准（旧流程） | [02-engineering-baseline.md](./02-engineering-baseline.md) |
| 03 | 领域类型与事件协议 | 已批准 | [Spec（已批准）](./03-domain-protocol-spec.md) / [Task 修订 1（已批准）](./03-domain-protocol-tasks.md) / [Summary（已批准）](./03-domain-protocol-summary.md) |
| 04 | 模型协议层 | 已批准 | [Spec（已批准）](./04-model-protocol-spec.md) / [Task（已批准）](./04-model-protocol-tasks.md) / [Summary（已批准）](./04-model-protocol-summary.md) |
| 05 | 工作区安全层 | 已批准 | [Spec（已批准）](./05-workspace-security-spec.md) / [Task（已批准）](./05-workspace-security-tasks.md) / [Summary（已批准）](./05-workspace-security-summary.md) |
| 06 | 本地工具系统 | 已批准 | [Spec（已批准）](./06-local-tools-spec.md) / [Task（已批准）](./06-local-tools-tasks.md) / [Summary（已批准）](./06-local-tools-summary.md) |
| 07 | 风险分级与审批 | 已批准 | [Spec（已批准）](./07-risk-approval-spec.md) / [Task 修订 1（已批准）](./07-risk-approval-tasks.md) / [Summary（已批准）](./07-risk-approval-summary.md) |
| 08 | JSONL 事件存储 | 已批准 | [Spec（已批准）](./08-jsonl-event-store-spec.md) / [Task（已批准）](./08-jsonl-event-store-tasks.md) / [Summary（已批准）](./08-jsonl-event-store-summary.md) |
| 09 | Agent 状态机 | 已批准 | [Spec（已批准）](./09-agent-state-machine-spec.md) / [Task（已批准）](./09-agent-state-machine-tasks.md) / [Summary（已批准）](./09-agent-state-machine-summary.md) |
| 10 | 上下文管理 | 已批准 | [Spec（已批准）](./10-context-management-spec.md) / [Task（已批准）](./10-context-management-tasks.md) / [Summary（已批准）](./10-context-management-summary.md) |
| 11 | 可交互终端入口 | 已批准 | [Spec（已批准）](./11-interactive-terminal-spec.md) / [Task（已批准）](./11-interactive-terminal-tasks.md) / [Summary（已批准）](./11-interactive-terminal-summary.md) |
| 12 | 终端测试与核心验收 | 进度 Summary 已批准；LongCat 真实冒烟经用户明确跳过，状态仍为外部阻塞 | [Spec（已批准）](./12-terminal-core-acceptance-spec.md) / [Task（原版与 R1 均已批准）](./12-terminal-core-acceptance-tasks.md) / [进度 Summary 与范围豁免](./12-terminal-core-acceptance-summary.md) |
| 13 | Next.js Route Handlers | 已批准 | [Spec（已批准）](./13-nextjs-route-handlers-spec.md) / [Task（已批准，实施完成）](./13-nextjs-route-handlers-tasks.md) / [Summary（已批准）](./13-nextjs-route-handlers-summary.md) |
| 14 | 中文工作台、受限目录弹窗、海报视觉层与 UI E2E | 已批准，阶段完成 | [Spec 修订 2（已批准）](./14-chinese-workbench-ui-e2e-spec.md) / [Task（已批准，实施完成）](./14-chinese-workbench-ui-e2e-tasks.md) / [Summary（已批准）](./14-chinese-workbench-ui-e2e-summary.md) |
| 15 | Claude Code Web 风格工作区与 Session 纯文本体验重构 | 已批准，阶段完成 | [Spec 修订 2（已批准）](./15-workbench-home-workspace-ux-spec.md) / [Task（已批准，实施完成）](./15-workbench-home-workspace-ux-tasks.md) / [Summary（已批准）](./15-workbench-home-workspace-ux-summary.md) |
| 16 | Session 对话删除与安全清理 | 已批准，阶段完成 | [Spec（已批准）](./16-session-deletion-spec.md) / [Task 修订 1（已批准，实施完成）](./16-session-deletion-tasks.md) / [Summary（已批准）](./16-session-deletion-summary.md) |
| 17 | Agent 中文输出强制、中文模型上下文、可选计划门禁、运行预算与长任务可靠性 | Summary 修订 6 已批准，阶段完成；分页/Context/续跑修复有效，真实完整回归遗留如实转入阶段 18 | [Spec 修订 6（已批准）](./17-agent-orchestration-plan-mode-spec.md) / [Task 修订 7（实施记录）](./17-agent-orchestration-plan-mode-tasks.md#88-task-修订-7-实施记录r6-01r6-05) / [真实 LongCat R6 记录](./17-agent-plan-terminal-acceptance.md#30-修订-6真实-longcat-多文件回归记录) / [Summary 修订 6（已批准）](./17-agent-orchestration-plan-mode-summary.md) |
| 18 | Agent 执行因果判定、Token 统计、工作区权限与工作台细节修复 | Summary 修订 2 已批准，阶段完成 | [原 Spec（已批准）](./18-agent-execution-precision-spec.md) / [Spec 修订 1（已批准）](./18-agent-execution-precision-spec-revision-1.md) / [Spec 修订 2（已批准）](./18-agent-execution-precision-spec-revision-2.md) / [原 Task（审批范围已失效）](./18-agent-execution-precision-tasks.md) / [Task 修订 1（被后续修订取代）](./18-agent-execution-precision-tasks-revision-1.md) / [Task 修订 2（已批准）](./18-agent-execution-precision-tasks-revision-2.md) / [Summary 修订 1（被后续修订取代）](./18-agent-execution-precision-summary-revision-1.md) / [Summary 修订 2（已批准）](./18-agent-execution-precision-summary-revision-2.md) / [自动与终端验收记录](./18-agent-execution-precision-terminal-acceptance.md) |
| 19 | 计划呈现、项目端口规避与真实写入顺序修复 | T19-00～T19-06 已完成；真实运行发现新的跨层缺口，用户明确改由阶段 20 重新 Spec，T19-07 不再执行；阶段 19 未生成 Summary、未标记完成 | [Spec（已批准）](./19-real-agent-regression-fixes-spec.md) / [Task（T19-07 已停止）](./19-real-agent-regression-fixes-tasks.md) / [终端验收记录](./19-real-agent-regression-terminal-acceptance.md) |
| 20 | Agent 可见输出、完成证据、用量与缓存系统 | T20-00～T20-08 已完成并通过自动门禁；T20-09 已获独立授权并执行，但因首次写入顺序失败及完成证据门误拒绝后运行超时而未通过，阶段阻塞 | [Spec 修订 1（已批准）](./20-agent-visibility-usage-completion-spec.md) / [Task（T20-09 真实回归未通过）](./20-agent-visibility-usage-completion-tasks.md)；Summary 未生成 |
| 21 | 写入依赖恢复与完成证据收敛 | T21-09 已执行但真实 LongCat 因模型协议错误未通过；阶段阻塞 | [Spec（已批准）](./21-agent-dependency-completion-recovery-spec.md) / [Task（真实回归失败记录）](./21-agent-dependency-completion-recovery-tasks.md)；Summary 未生成 |
| 22 | LongCat 无效工具调用与流协议恢复 | T22-00～T22-08 已通过；T22-09 单次真实回归因 `AGENT_RUN_TIMEOUT` 失败并已停止；用户已同意把随后发现的 Web 长历史缺口转入阶段 23 | [Spec（已批准）](./22-longcat-invalid-tool-protocol-recovery-spec.md) / [Task（真实回归失败记录）](./22-longcat-invalid-tool-protocol-recovery-tasks.md)；未生成成功 Summary |
| 23 | Web 长历史分页与终态协调修复 | Summary 已批准，阶段完成；`deepseek-v4-flash` 全真浏览器验收通过 | [Spec（已批准）](./23-web-history-pagination-terminal-reconciliation-spec.md) / [Task（含已批准且已完成 T23-09）](./23-web-history-pagination-terminal-reconciliation-tasks.md) / [Summary（已批准）](./23-web-history-pagination-terminal-reconciliation-summary.md) |
| 24 | Agent Harness 收敛效率、完成证据精确纠正与可解释失败终态 | Summary 已批准，阶段完成；T24-10 可选真实模型回归未执行且不追认为通过 | [Spec 修订 1（已批准）](./24-completion-evidence-terminal-closure-spec.md) / [Task（已批准，实施完成）](./24-completion-evidence-terminal-closure-tasks.md) / [Summary（已批准）](./24-completion-evidence-terminal-closure-summary.md) |
| 25 | 文档、视频与最终提交 | 待只读观察 | [原阶段 15 Spec（已被流程修订取代）](./15-documentation-video-final-submission-spec.md)；阶段 25 Spec / Task / Summary 尚未生成 |

## 需求追踪规则

2026-08-31，用户明确要求批准此前全部待审批文档，并确认阶段 24 所处理问题已经修复。盘点时唯一真实待审批产物为阶段 24 Summary，现已批准；阶段 23 Task 顶部的陈旧状态已同步修正。阶段 19～22 的失败记录与未生成 Summary 仍作为历史事实保留，不被追溯改写为成功或补造审批。

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
