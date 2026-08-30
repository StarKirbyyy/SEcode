# 阶段 18 Task 修订 2：启动验收、服务进程生命周期与完整用量计量

## 1. 文档状态与审批门禁

- 当前状态：`已批准，实施完成`。
- 批准的 Spec：[18-agent-execution-precision-spec-revision-2.md](./18-agent-execution-precision-spec-revision-2.md)。
- Spec 审批：用户于 2026-08-29 回复“批准”。
- 本文作用：将 Spec 修订 2 拆分为可验证的实现任务；Task 修订 1 的未实施范围被本修订取代，既有代码事实必须保留。
- Task 审批：用户于 2026-08-29 回复“批准”，语义等价于“阶段 18 Task 修订 2 通过”。
- 当前禁止：不得把本 Task 的实现事实写成 Summary 已获批准；Summary 生成后立即停止。
- 下一门禁：完成全部任务后生成 Summary 修订 2，等待用户审批。

## 2. 不可变约束

1. `run_process` 仍使用 `spawn(program, args)`、`shell:false`、工作区相对路径和现有风险审批；不得放宽路径、命令或外部网络边界。
2. `lifecycle="service"` 只改变 readiness 成功后的生命周期，不绕过 deny、审批、取消、预算和工作区安全校验。
3. readiness 仅允许高位 loopback（`localhost`、`127.0.0.1`、`[::1]` 的严格 URL 形式），不跟随重定向、不发送凭据、不自动终止未知端口占用者。
4. service 在 readiness 成功后保持子进程；未就绪提前退出、超时、取消和显式停止必须清理进程组，oneshot 保持等待退出兼容行为。
5. Token 只记录 provider 实际报告的公开 prompt/completion/total；缺失值显示不完整/至少值，不把估算或供应商账单口径伪装为精确事实，不公开 reasoning 正文。
6. 启动验收失败不得在 Agent 最终正文中称项目“可启动”；安装、构建、后端 readiness、前端 readiness 分别记录。
7. 不新增第三方依赖，不执行 Git 写操作，不触碰真实用户项目、凭据或现有无关脏改动。

## 3. 任务清单与依赖

### T18-R2-01：事件、类型与失败测试基线

- 输入：已批准 Spec 修订 2、现有 Domain/Tool/Context/Client 类型和阶段 18 脏工作树。
- 工作：定义 lifecycle/readiness 新参数、service 元数据、usage source/attempt/incomplete 结构和必要错误码；先补充失败测试与旧事件兼容 fixture。
- 涉及文件：`lib/tools/types.ts`、`lib/tools/schemas.ts`、`lib/domain/event.ts`、`lib/domain/index.ts`、`lib/context/types.ts`、`lib/model/types.ts`、对应 `tests/unit`。
- 完成条件：Schema 严格拒绝外部 readiness、非法生命周期组合和超限等待；旧 `run_process`/usage 事件仍能解析；公开结构不含秘密或私有推理。
- 验证：工具/领域/上下文 Schema 测试、typecheck、`git diff --check`。

### T18-R2-02：`run_process` service 生命周期与独立 readiness

- 输入：T18-R2-01 类型和现有 `executeRunProcess`。
- 工作：实现 oneshot/service 分支；将 readiness 等待窗口与命令超时解耦；支持有限 loopback 候选；service readiness 成功后返回 PID 和生命周期元数据并保持子进程及输出排空；失败/取消/显式停止保持 SIGTERM→SIGKILL 清理。
- 涉及文件：`lib/tools/run-process.ts`、`lib/tools/dependencies.ts`（仅必要依赖接口）、`lib/tools/registry.ts`、`tests/unit/tools/run-process.test.ts`、工具集成测试。
- 完成条件：成功 service 端口在 Promise 结束后仍可访问；oneshot 旧行为不变；未就绪和取消不遗留夹具子进程；不会误杀外部 PID。
- 验证：短命 HTTP fixture、慢启动 fixture、IPv4/IPv6 loopback、提前退出、超时、取消、fork 子进程和显式停止测试。

### T18-R2-03：启动验收策略与中文系统提示

- 输入：T18-R2-02 的结构化结果。
- 工作：更新 Agent 系统策略和必要运行时辅助逻辑，要求完成后按 lockfile 选择包管理器，依次执行 install/build/readiness；区分依赖原生编译失败、构建失败、端口占用和 readiness 超时；为后端/前端服务使用 service 模式并保留句柄事实。
- 涉及文件：`lib/context/system-prompt.ts`、`lib/agent/runtime.ts`（仅验收结果/状态所需）、`lib/agent/types.ts`、相关 Agent 测试和文档。
- 完成条件：模型可见固定文本均为简体中文；最终结果逐项报告 install/build/服务状态；不因 stderr 或 warning 误判成功，不擅自修改依赖解决安装失败。
- 验证：确定性模型 Agent 轨迹、安装失败/成功、双服务 readiness 和中文合规测试。

### T18-R2-04：模型 attempt 与上下文摘要 usage 事件

- 输入：T18-R2-01 的 usage 事件类型、`createModelClient`、`generateContextSummary`。
- 工作：在每个 provider attempt 能取得 usage 时生成公开计量；让上下文摘要返回 usage/未计量状态并由 Agent publisher 写入 durable 事件；处理流中断、超时、重试和无 usage 情况，避免同一 attempt 重复计数。
- 涉及文件：`lib/model/client.ts`、`lib/model/chat-accumulator.ts`、`lib/context/summary-generator.ts`、`lib/context/provider.ts`、`lib/agent/runtime.ts`、`lib/domain/event.ts`、相关模型/上下文/Agent 测试。
- 完成条件：主循环、摘要和重试请求均可追溯；部分 usage 标记 `complete=false`，无 usage 标记 `unreported=true`；不公开 reasoning 私有字段。
- 验证：SSE usage-only、部分流、三次重试、摘要成功/失败/语言重述和事件恢复测试。

### T18-R2-05：客户端累计与不完整 usage 展示

- 输入：T18-R2-04 的新旧事件 fixture。
- 工作：扩展 `projectRun`/transcript/详情抽屉和终端 renderer，分别累计 agent、summary、retry 的已报告 usage；显示未计量请求数和“至少/不完整”状态；保持旧 Session 兼容。
- 涉及文件：`lib/client/event-state.ts`、`lib/client/transcript.ts`、`lib/terminal/event-renderer.ts`、`app/ui/workbench/details-drawer.tsx`、相关 Client/UI/Terminal 测试。
- 完成条件：多轮、压缩、重试样例与事件总和一致；缺失字段不互相推算；不再把偏小值显示为完整实际总量。
- 验证：客户端投影、刷新恢复、终端文本和组件可访问性测试。

### T18-R2-06：受控服务停止与恢复边界

- 输入：T18-R2-02 的 PID/生命周期元数据和现有运行取消、应用恢复流程。
- 工作：提供显式且受控的 service stop/cleanup 路径（如 API/运行时动作需要新增则先严格 Schema）；验证 PID、进程组和工作区归属；应用重启后不按旧 PID 猜测或误杀，UI 明示外部服务可能仍在运行。
- 涉及文件：`lib/tools/run-process.ts`、`lib/server/application.ts`、`lib/server/*`、`app/api/*`、`app/ui/workbench/*`、恢复/安全测试。
- 完成条件：显式停止只终止目标 service；旧 Session 恢复不获得失效 ChildProcess 控制权；越权 PID/工作区请求结构化拒绝。
- 验证：取消、恢复、并发停止、PID 复用防护和安全边界测试。

### T18-R2-07：跨层回归、真实临时项目验收与 Summary

- 输入：T18-R2-01～T18-R2-06 全部完成。
- 工作：在全新临时工作区验证一个带前后端和 `npm install` 的样例：安装、构建、后端 service readiness、前端 service readiness、端口持续访问；执行相关单元/集成/E2E、lint、typecheck、coverage、build 和 `git diff --check`；如需真实模型，使用用户已提供配置但不得输出凭据；生成 Summary 修订 2。
- 涉及文件：`tests/manual/*`、`tests/integration/*`、`tests/e2e/*`、`docs/development/18-agent-execution-precision-summary-revision-2.md`、`docs/development/README.md`。
- 完成条件：真实安装失败如实记录，不改写用户项目；所有失败、环境限制、未运行项和偏差写入 Summary；Summary 生成后立即停止等待审批。

## 4. 文件边界

允许修改的生产范围仅限：

- `lib/tools` 中 run_process schema、执行器、依赖接口和结构化结果；
- `lib/domain`、`lib/model`、`lib/context`、`lib/agent` 中 usage/摘要/验收事件及其投影；
- `lib/client`、`lib/terminal`、`app/ui/workbench` 中计量和服务状态展示；必要的 `lib/server`/`app/api` 受控停止接口；
- 对应测试和阶段 18 文档。

禁止修改：无关权限/UI 功能、用户项目文件、凭据、部署配置、Git 历史和第三方依赖；不得借机回写或删除旧 JSONL 事件。

## 5. 验收映射

| 任务 | 覆盖验收 |
| --- | --- |
| T18-R2-01 | AC18-R2-02、06、07、08 |
| T18-R2-02 | AC18-R2-02～04 |
| T18-R2-03 | AC18-R2-01、05、08 |
| T18-R2-04 | AC18-R2-06～07 |
| T18-R2-05 | AC18-R2-06～07 |
| T18-R2-06 | AC18-R2-04、05、07 |
| T18-R2-07 | AC18-R2-01～08 |

## 6. Task 审批门禁

本 Task 已根据已批准 Spec 修订 2 实施完成。Summary 修订 2 已生成并处于待用户审批状态；审批前不进入阶段 19。
