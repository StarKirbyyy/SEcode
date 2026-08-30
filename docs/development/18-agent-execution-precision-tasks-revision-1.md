# 阶段 18 Task 修订 1：工作区权限、Token 统计与工作台细节修复

## 1. 文档状态与审批门禁

- 当前状态：`被后续修订取代`。
- 取代说明：Spec 修订 2 新增启动验收、service 生命周期、readiness 和完整 usage 计量范围；本 Task 的审批门禁不再解锁实现。
- 批准的 Spec：[18-agent-execution-precision-spec-revision-1.md](./18-agent-execution-precision-spec-revision-1.md)。
- Spec 审批：用户于 2026-08-29 回复“批准”。
- 本文作用：将 Spec 修订 1 拆分为可验证的实现任务。
- 当前禁止：用户批准本 Task 前，不得修改产品代码、测试、配置、依赖或事件协议。
- 下一门禁：用户明确回复“阶段 18 Task 修订 1 通过”或语义等价内容后，才能开始 T18-R1-01。

## 2. 不可变约束

1. Token 累计只改变客户端投影和展示，不改写旧 `model.completed` 事件。
2. 权限策略按规范化 `workspacePath` 隔离；默认 `ask`。
3. “批准本次”仍是单个 `approvalId` 的一次性 capability。
4. “完全访问权限”只放宽原本 `require_approval` 的调用；`deny`、工作区边界、哈希校验、取消、预算和进程清理不可绕过。
5. 计划审批与工具审批继续分离。
6. 权限策略必须由服务端最终判定，客户端设置不能单独放行工具。
7. 顶部普通提示默认 4 秒消退；错误和审批状态不能被短提示隐藏。
8. 工作区新建入口必须复用服务端工作区验证，不接受客户端未经验证的绝对路径。
9. 不新增第三方依赖，不执行 Git 写操作，不触碰真实用户项目和凭据。

## 3. 任务清单与依赖

### T18-R1-01：需求追踪、类型与测试基线

- 输入：批准的 Spec 修订 1、现有阶段 18 Task 和当前脏工作树。
- 工作：补充需求追踪；定义工作区权限模式与严格 Schema；确定旧 Session 默认 `ask` 的兼容行为；先写失败测试。
- 涉及文件：`docs/development/01-requirements.md`、`lib/approval/*`、`lib/domain/*`、对应单元测试。
- 完成条件：公共类型、错误语义和审计字段在测试中固定；没有改变现有三态风险决定。
- 验证：相关 Vitest、typecheck、`git diff --check`。

### T18-R1-02：Token run 累计投影

- 输入：多轮 `model.completed` usage 事件及缺失字段 fixture。
- 工作：修改 `projectRun` 按字段求和；保留每轮 transcript usage；详情抽屉显示输入/输出/总计并正确处理缺失值。
- 涉及文件：`lib/client/event-state.ts`、`lib/client/transcript.ts`、`app/ui/workbench/details-drawer.tsx`、相关 Client 单元测试。
- 完成条件：71 轮样例累计值与事件总和一致；最后一轮值不再冒充 run 总值。
- 验证：客户端投影测试、UI 组件测试、typecheck。

### T18-R1-03：工作区权限策略存储与服务端 API

- 输入：`workspacePath` 规范化结果、现有 Server Application 和审批 API。
- 工作：实现工作区级策略读写、策略 API、严格请求 Schema、恢复旧 Session 默认 `ask`；加入策略变更 durable 审计事实（如实现需要新增事件，必须同步 Domain Schema、投影、恢复和测试）。
- 涉及文件：`lib/server/*`、`lib/approval/*`、`lib/storage/*`、`lib/domain/event.ts`、`app/api/*`、相关集成测试。
- 完成条件：A/B 两个工作区策略互不泄漏；重启/恢复不把旧批准伪装为能力；重复和越界请求结构化失败。
- 验证：Server Application、API、存储恢复和安全边界测试。

### T18-R1-04：审批运行时与“批准本次/完全访问”

- 输入：T18-R1-03 的策略服务和现有 `AgentRuntime.resolveApproval`。
- 工作：在风险评估前读取工作区策略；实现当前请求批准与工作区完全访问的原子顺序；保持 capability 一次消费；提供恢复 `ask` 的服务端动作。
- 涉及文件：`lib/agent/runtime.ts`、`lib/agent/types.ts`、`lib/approval/*`、`lib/server/application.ts`、运行时/恢复/并发测试。
- 完成条件：同一工作区后续高风险调用不重复询问；切换工作区立即使用另一策略；硬拒绝始终不执行。
- 验证：Runtime、取消、并发、重放和审批生命周期测试。

### T18-R1-05：审批卡片与权限设置 UI

- 输入：T18-R1-04 的 API 和事件事实。
- 工作：在审批卡增加“批准本次”“完全访问权限”；显示当前工作区权限模式、撤销入口和风险说明；处理提交中、重复点击、失败和事件确认。
- 涉及文件：`app/ui/workbench/tool-card.tsx`、`app/ui/workbench/session-workbench.tsx`、`app/ui/workbench/details-drawer.tsx`、`app/ui/shell/app-shell-provider.tsx`、`lib/client/api-client.ts`、Schema/UI 测试。
- 完成条件：UI 不直接执行工具；只通过 API 请求并以服务端事件确认最终状态；移动端可用且键盘可操作。
- 验证：组件测试、API Client 测试、Playwright 审批流程。

### T18-R1-06：顶部提示生命周期

- 输入：现有 `navigationNotice`、`cancelNotice` 与导航保护流程。
- 工作：增加可取消计时器，普通提示默认 4 秒清除；新提示清理旧计时器；组件卸载无泄漏；错误区域保持可见。
- 涉及文件：`app/ui/shell/app-shell-provider.tsx`、`app/ui/shell/app-shell.tsx`、必要的 UI 测试。
- 完成条件：快速连续提示、导航切换、运行结束和卸载场景均无旧提示复活。
- 验证：Fake Timer 组件测试、lint、typecheck。

### T18-R1-07：工作区分组直接新建对话

- 输入：现有分组导航、工作区验证 API 和新任务页。
- 工作：为每个工作区分组增加新建按钮；新增 provider 动作，复用验证并导航到 `/`；遵守运行中导航保护；覆盖桌面、窄屏和移动抽屉。
- 涉及文件：`app/ui/shell/session-navigation.tsx`、`app/ui/shell/app-shell-provider.tsx`、`app/ui/shell/app-shell.tsx`、`app/ui/home/new-task-page.tsx`、`app/globals.css`、E2E 测试。
- 完成条件：点击分组新建后工作区已预选且已验证；失败不丢草稿；运行中不会切换任务。
- 验证：Playwright 导航/工作区流程、响应式可访问性检查。

### T18-R1-08：跨层验证与 Summary

- 输入：T18-R1-01～T18-R1-07 全部完成。
- 工作：运行相关单元、集成、E2E、lint、typecheck、coverage、build 和 `git diff --check`；记录失败与修正；生成阶段 18 Summary 修订 1。
- 完成条件：所有失败如实记录；真实 LongCat 如需执行，必须另获用户独立授权并使用全新带 marker 临时工作区；Summary 生成后立即停止等待审批。
- 涉及文件：`docs/development/18-agent-execution-precision-summary-revision-1.md`、`docs/development/README.md`、测试记录文档。

## 4. 文件边界

允许修改的生产范围仅限：

- `lib/client`、`lib/approval`、`lib/agent`、`lib/server`、`lib/domain`、`lib/storage` 中与本 Spec 直接相关的类型、策略、投影和 API；
- `app/api`、`app/ui` 中对应权限卡片、详情、提示和工作区新建入口；
- 对应测试与阶段文档。

禁止修改：模型 wire 协议、无关工具执行器、真实用户项目、凭据、部署配置、Git 历史和第三方依赖。

## 5. 验收映射

| 任务 | 覆盖验收 |
| --- | --- |
| T18-R1-01 | AC18-R1-02、04、05、08 |
| T18-R1-02 | AC18-R1-01 |
| T18-R1-03～04 | AC18-R1-02～05 |
| T18-R1-05 | AC18-R1-02～05、08 |
| T18-R1-06 | AC18-R1-06 |
| T18-R1-07 | AC18-R1-07 |
| T18-R1-08 | AC18-R1-08 |

## 6. Task 审批门禁

本 Task 已根据已批准 Spec 修订 1 编写，但当前仍为 `待用户审批`。用户批准前不得开始任何 T18-R1 任务；批准后必须按依赖顺序实施，并在全部任务完成后生成 Summary 修订 1。
