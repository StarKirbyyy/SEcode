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
| 25 | Agent 简化写入、基础 TDD、端口启动与可访问交付 | v2 自动实施完成但最新真实 run 失败；不生成成功 Summary，修复转入阶段 26 | [Spec（v2 已实施；未审 v3 草案被阶段 26 取代）](./25-agent-tdd-startup-handoff-spec.md) / [Task v2（保留实施记录）](./25-agent-tdd-startup-handoff-tasks.md) / [v2 Summary（非成功终稿）](./25-agent-tdd-startup-handoff-summary.md) |
| 26 | Agent 测试、验收与启动收敛效率 | T26R2-00～T26R2-07 已完成；Summary 修订 2 待审批 | [Spec 修订 2（已批准）](./26-agent-convergence-efficiency-spec.md) / [Task 修订 2（已批准，实施完成）](./26-agent-convergence-efficiency-tasks-revision-2.md) / [Summary 修订 2（待审批）](./26-agent-convergence-efficiency-summary.md) / [原 Task（被取代）](./26-agent-convergence-efficiency-tasks.md) |
| 27 | 文档、视频与最终提交 | 等待阶段 26 完成 | [原阶段 15 Spec（已被流程修订取代）](./15-documentation-video-final-submission-spec.md)；阶段 27 Spec / Task / Summary 尚未生成 |

## 需求追踪规则

2026-08-31，用户明确要求批准此前全部待审批文档，并确认阶段 24 所处理问题已经修复。盘点时唯一真实待审批产物为阶段 24 Summary，现已批准；阶段 23 Task 顶部的陈旧状态已同步修正。阶段 19～22 的失败记录与未生成 Summary 仍作为历史事实保留，不被追溯改写为成功或补造审批。

同日，用户检查最新真实 Agent 运行后，要求解决端口反复试错、模型显式管理 SHA、未采用简单 TDD、最终未保持项目运行且缺少直接访问链接的问题，并明确要求开始编写 Spec。阶段 25 因此承接该修复，文档、视频与最终提交顺延为阶段 26；该授权只生成阶段 25 Spec，不等价于批准 Spec、Task 或开发。

用户随后回复“批准”，语义等价于“阶段 25 Spec 通过”；现已生成阶段 25 Task 并停在 Task 审批门禁。该批准不追认为 Task、真实 provider、Git 写入或开发授权。

Task 待审批期间，用户进一步明确“生成项目端口号避开 3000 即可”。端口验收因此收窄：不再规定固定端口、`strictPort` 或冲突后的重试次数。阶段 25 回退到 Spec 修订与重新审批，旧 Task 失效。

用户随后再次回复“批准”，阶段 25 Spec v2 获批。Task 已按收窄后的端口要求重写并重新等待用户审批；仍未授权开发、真实 provider 或 Git 写入。

用户随后批准阶段 25 Task v2，并明确允许直接在当前 `main` 工作区实施。当前只解锁 T25-00～T25-06；T25-07 真实 provider、Git 写入、发布与部署仍未授权。

阶段 25 v2 自动门禁通过并形成待审 Summary 后，用户要求检查磁盘上最新 Agent run。session `e804e0e7-43ec-4c84-96b5-6fbd0c3fc21a` 的 run `ab562cd1-c1a4-496b-9cb0-86e7c1cf92b6` 以 63 次模型请求、73 次工具请求和 `AGENT_COMPLETION_EVIDENCE_MISSING` 失败；server/client 验证、API smoke 与双 service readiness 已成功，却被 `.gitignore`、根协调 `package.json` 和已执行 smoke 脚本误阻塞。真实轨迹还违反简单 TDD，并继承宿主 `PORT=3000`。

用户进一步指出主体功能约 25 次模型调用内完成，之后 38 次调用仍未完成测试、验收和启动，明确允许新开阶段定位并修复。阶段 25 未审批的 v3 草案因此并入阶段 26；阶段 26 承接前置 RED、完成证据归并、收敛状态、验证批处理、端口/readiness 和 ready 后立即 final，原最终交付顺延为阶段 27。该授权只生成阶段 26 Spec，不等价于批准 Spec、Task、代码或真实 provider。

用户随后回复“批准”，语义等价于“阶段 26 Spec 通过”；现已生成阶段 26 Task 并停在 Task 审批门禁。该批准不构成 Task、代码、测试、requirements、真实 provider 或 Git 写入授权。

用户随后再次回复“批准”，语义等价于“阶段 26 Task 通过”；现解锁 T26-00～T26-07 并开始实施。T26-08 真实 provider、真实凭据、Git 写入、发布和部署仍未授权。

T26-05 实施前发现 Task 把 `run_process` 工具描述事实源误写为 `lib/tools/registry.ts`，实际为 `lib/tools/schemas.ts`。用户明确批准文件范围修订后继续。T26-00～T26-07 现已实施：全量 1029 项 unit/integration、50 项 E2E、coverage、双 build、diff check 与 agent-browser 均通过；Summary 已生成并立即停在用户审批门。T26-08 仍未授权。

随后磁盘上最新 Session `ffe26448-2883-48a6-9bc3-5429852e6bb0` 的真实 run 在 28 次模型请求内已基本完成主体、6 项单元测试和服务代码，但两次 readiness 各等待 60 秒并得到无法由现有日志归因的 404；`server/server.js` 局部修正后，completion evidence 的 4 请求局部预算又在测试文件参数校验失败后直接触发 `AGENT_COMPLETION_EVIDENCE_MISSING`，最终无 assistant final。用户明确认为防御性编程和完成硬门过重，并回复“回退”。阶段 26 因此回到 Spec 修订 2 审批门；原 Task 审批失效，原 Summary 被取代，现有实现只作为历史事实保留。

用户随后回复“批准”，阶段 26 Spec 修订 2 获批，只解锁 Task 修订 2 编写。Task 修订 2 已生成并等待独立审批；当前未授权修改 requirements、Production、测试或配置，T26R2-08、真实 provider、Git 写入、发布和部署仍未授权。

用户再次回复“批准”，阶段 26 Task 修订 2 获批，现解锁 T26R2-00～T26R2-07 并开始实施。T26R2-08、真实 provider、真实凭据、Git 写入、发布和部署仍未授权。

T26R2-00～T26R2-07 现已完成：新普通 run 的 completion/service 最终硬门已改为一次纠正后带确定性警告正常交付，readiness 改为原生 `node:http`，Prompt 升为 V13 并增加第 20 次请求后的收尾视图。1034 项 unit/integration、coverage、51 项 E2E、双 build、diff check 与 agent-browser 均通过；Summary 修订 2 已生成并立即停在审批门。T26R2-08 仍未授权。

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
