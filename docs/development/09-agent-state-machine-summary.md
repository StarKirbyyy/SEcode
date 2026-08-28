# 阶段 09 Summary：Agent 状态机

## 1. 文档状态与审批链

- 当前状态：已批准
- 完成日期：2026-08-27
- 已批准 Spec：[09-agent-state-machine-spec.md](./09-agent-state-machine-spec.md)
- 已批准 Task：[09-agent-state-machine-tasks.md](./09-agent-state-machine-tasks.md)
- Spec 审批：用户于 2026-08-27 批准
- Task 审批：用户于 2026-08-27 批准
- Summary 审批：用户于 2026-08-27 批准
- 当前门禁：阶段 10 只读观察与 Spec 已解锁；阶段 10 Task 和实现仍需后续独立审批

审批链：

```text
阶段 09 Spec（已批准）
  → 阶段 09 Task（已批准）
  → T09-00～T09-13（已完成）
  → 本 Summary（已批准）
  → 阶段 10 只读观察与 Spec（已解锁）
```

## 2. 完成结论

阶段 09 已实现一个与 Next.js、React、浏览器和终端界面解耦的本地 Node.js Agent 运行时。它将阶段 04–08 的模型、工作区、工具、审批和 JSONL 存储能力编排为事件驱动的单 Agent 决策循环。

最终形成：

- 10 个 `lib/agent` 生产模块，共 2372 行。
- 11 个 Agent 测试文件和 1 个测试 helper，共 2517 行。
- 16 个稳定 Agent 错误码。
- 85 项 Agent 精确测试全部通过。
- 全仓 52 个测试文件、493 项测试全部通过。
- lint 零 warning、typecheck、生产 build、差异与安全检查全部通过。
- 未修改阶段 03–08 源码、`app/**`、依赖、lockfile 或工程配置。

已实现的主路径：

```text
Session 恢复与业务历史投影
  → workspace / model / context preflight
  → run.started / user.message
  → context provider / 可选 compaction 事实
  → model.requested / model.completed
  ├── stop → final assistant.message → run.completed
  └── tool_calls
        → 全部 tool.requested
        → 严格串行 prepare / policy / approval / started / result
        → 工具结果进入下一轮上下文
```

取消、总时限、模型/工具失败、连续三次相同工具错误和迭代上限均进入单一终态竞争；durable 提交不确定时安全停止，不猜测落盘状态，也不重复工具副作用。

本阶段仍不提供人工聊天入口。真实上下文算法属于阶段 10，可交互终端属于阶段 11，因此基础人工 Agent 对话测试需在阶段 11 完成后进行。

## 3. 实际任务完成情况

| 任务 | 状态 | 实际产物 | 验证证据 |
| --- | --- | --- | --- |
| T09-00 基线与范围复核 | 已完成 | 基线、白名单和既有工作树登记 | 41 files / 408 tests；lint、typecheck 通过 |
| T09-01 契约与 Schema | 已完成 | `types`、`schemas`、`errors`、依赖端口 | 边界、strict、错误映射测试 |
| T09-02 生命周期投影 | 已完成 | 纯增量 projector 和 canonical 工具错误签名 | 合法/非法轨迹、确定性、16 类事件测试 |
| T09-03 事件与脱敏 | 已完成 | 流式 redactor、durable/live publisher | 任意 chunk、发布顺序、sink 故障测试 |
| T09-04 恢复与骨架 | 已完成 | Session 锁、active registry、恢复与 preflight | 幂等恢复、busy、workspace/profile 测试 |
| T09-05 模型完成路径 | 已完成 | context/model loop、continuation、final | 文本完成、compaction、模型/上下文错误测试 |
| T09-06 工具路径 | 已完成 | 工具计划、归一化、严格串行 gateway 执行 | 多工具、非法、拒绝、重复 ID 测试 |
| T09-07 审批路径 | 已完成 | 单 pending waiter、批准与拒绝编排 | 事件顺序、错误决定、取消、提交故障测试 |
| T09-08 取消与超时 | 已完成 | linked abort、finalize gate、sink 断开 | model/tool/approval 中取消与超时分类测试 |
| T09-09 限制 | 已完成 | 迭代边界、连续错误签名和终止 | 30/31、2/3、重置规则和剩余 slot 测试 |
| T09-10 durable 故障 | 已完成 | 不确定提交保护和资源清理 | 多位置 append 故障、无 replay、恢复测试 |
| T09-11 公共收口 | 已完成 | 最小 `@/lib/agent` barrel | 精确导出和源码安全扫描 |
| T09-12 总体验证 | 已完成 | 全仓门禁与反思修正 | 85 Agent tests；493 full tests；全部门禁通过 |
| T09-13 文档门禁 | 已完成，待审批 | Task 完成记录、本 Summary、索引 | 链接、空白、白名单、diff check |

任务按批准顺序实施，没有跳过、合并或提前进入阶段 10。

## 4. 关键实现说明

### 4.1 公共契约和输入边界

`AgentRunRequestSchema` 是 strict object，验证：

- Session ID 必须是 UUID。
- prompt trim 后非空，最大 1048576 字符。
- 迭代次数只能在 1–30。
- 总时限只能在 1000–600000ms。
- thinking 只接受阶段 04 已批准字段。
- `signal` 和 `onEvent` 仅存在于不可持久化 controls，不进入请求 Schema。

运行时固定默认 30 次模型迭代、10 分钟总时限、连续三次相同工具错误终止。16 个 `AGENT_*` 错误码均有固定 recoverable 语义，公共错误在返回前再次经过既有 `ErrorInfoSchema` 校验；内部 cause 不可枚举且不进入事件。

### 4.2 纯事件生命周期投影器

`projection.ts` 只消费 durable events，不访问磁盘、模型、时钟、工具或审批能力。它验证：

- 唯一 `session.created` 和同一时刻单 open run。
- `user.message`、模型 iteration 和 requested/completed 配对。
- stop 与 tool_calls 的不同后续路径。
- 同一 completion 必须先完整记录全部 `tool.requested`，再处理第一个工具。
- 工具严格串行，toolCallId 与 approvalId 唯一。
- approved 必须先于 started，rejected 不允许 started。
- compaction 只能出现在稳定边界且引用已见历史。
- final、terminal、pending 和 iteration 必须相互一致。

投影快照返回前被冻结，不泄露内部 Map、Set 或可变状态。连续工具错误签名由共享 canonical JSON 算法计算，使运行时判定与历史重放保持一致。

### 4.3 流式脱敏和事件发布

增量脱敏器以有界状态机处理 Bearer、`sk-*` 和 `*_API_KEY=`，能跨任意 chunk 边界识别敏感串。最多保留 256 bytes 待判定前缀，异常或取消时丢弃未确认尾部；普通中文和代码文本保持原序。

durable 发布顺序固定为：

```text
draft 校验 → JSONL append + fsync → projector apply → event sink
```

因此消费者只会看到已确认的完整事件。`assistant.delta` 由运行时生成 UUID、ISO 时间和连续 streamSeq，仅发送给 sink，永不写入 store。sink 首次失败后被永久禁用并触发取消，后续终态仍尽力写入 JSONL，但不会递归通知已失败的 sink。

### 4.4 Session 恢复和运行注册

同一 Session 的恢复和启动通过 keyed lock 串行，不同 Session 可并行。恢复流程先由 storage 检查和修复不完整尾行，再分页投影全部 durable events：

- 没有 open run 时零写入。
- 一个合法 open run 时追加一次 `run.interrupted`。
- 非法或交叠历史以 `AGENT_HISTORY_INVALID` 失败关闭。
- 第二次恢复读取已提交事实，不重复 interrupted。

启动前重新创建工作区 opaque handle，并确认 Session 固定模型 profile 存在且 configured。原始 workspace 字符串、模型配置和历史审批不能直接恢复为执行能力。prompt 在进入 active state、preview、事件和上下文前完成脱敏。

`sessionId → runId` 和 `runId → active state` 注册表保证单进程内每个 Session 最多一个运行。active state 只保存不可序列化的 controller、continuation、prepared invocation、pending 和 authorization，不写第二份状态文件。

### 4.5 上下文和模型循环

阶段 09 只定义 `AgentContextProvider` 端口。每轮由 provider 根据已提交事件返回消息和可选 compaction draft；运行时 strict 校验后先提交 `context.compacted`，再提交 `model.requested`。

模型调用复用阶段 04 的重试和单请求超时，不在 Agent 层增加第二套重试。continuation 只在当前进程、当前 run 的下一轮传递；private reasoning 和 `reasoningTokens` 不进入事件、快照或公开错误。

stop completion 必须提供非空、未超限的 final content。成功顺序固定为 `model.completed → assistant.message(final) → run.completed`。iteration 等于已成功提交的 `model.requested` 数量，duration 使用单调时钟且不为负。

### 4.6 工具计划和串行执行

tool_calls completion 先验证所有 ID，再建立内部 slot。若 completion 含正文，先提交 intermediate `assistant.message`；随后必须完整提交所有 `tool.requested`，才允许处理第一个工具。

各路径语义如下：

- 非法模型工具调用：使用稳定 ID、`invalid_tool_call` 和有界公开参数，直接产生结构化错误 result。
- 未知工具或参数错误：prepare 失败后直接 result，不进入 risk 或 started。
- policy denied：使用 gateway 结果直接 result，不产生 started。
- 自动允许：先 durable `tool.started`，再消费一次性 authorization 执行，最后 durable result。
- 需要审批：先 durable `approval.required` 并等待外部决定。

所有工具严格串行，未使用 `Promise.all`。普通工具失败会作为下一轮模型上下文事实，不直接终止整个 run；专用 abort 异常则进入统一取消/超时控制流。

### 4.7 审批生命周期

每个 active run 同时最多一个 pending approval。公开视图仅包含已批准的 `PendingToolApprovalView`，opaque pending 和 authorization 不进入 barrel、事件或快照。

批准顺序：

```text
gateway resolve → approval.resolved(approved) → tool.started → execute → tool.result
```

拒绝顺序：

```text
gateway resolve → approval.resolved(rejected) → rejection tool.result
```

拒绝路径没有 `tool.started`。错误 runId、approvalId、重复决定或 gateway invalid 不写新事件，也不清除仍有效的 pending。批准事实提交失败会丢弃 authorization，绝不执行工具。

### 4.8 取消、超时和单终态

外部 signal、handle/runtime cancel、总时限和 sink failure 汇入同一 linked controller，只记录第一个来源。模型、工具和审批等待都能由同一 signal 唤醒。

- 用户、外部 signal 和 sink 断开：`run.cancelled`。
- Agent 总时限：`run.failed(AGENT_RUN_TIMEOUT)`。
- 模型自身超时：保留阶段 04 的 `MODEL_TIMEOUT`。
- 无已知内部来源的专用 abort：`AGENT_INTERNAL_ERROR`。

finalize gate 与落盘前 abort 复查避免 completed、failed、cancelled 竞争出多个终态。取消 pending 时不伪造 `approval.resolved` 或 `tool.result`。

### 4.9 迭代与连续错误终止

第 30 次模型请求可以正常完成；准备提交第 31 次时才产生 `AGENT_ITERATION_LIMIT`。连续工具错误签名为：

```text
toolName + error.code + SHA-256(canonical publicArguments)
```

对象 key 递归排序，数组顺序保持。相同失败累加，不同失败替换为 1，成功清零。第三次相同连续失败先持久化当前 `tool.result`，再以 `AGENT_REPEATED_TOOL_ERROR` 终止；当前 completion 中尚未开始的后续工具不再执行。

### 4.10 durable 提交不确定与清理

任何 `EventStoreError` 在 run 建立后都进入最高优先级存储故障路径。尤其 `EVENT_COMMIT_UNCERTAIN`：

- 不重试同一 draft。
- 不补写推测性的 `run.failed`。
- 不 replay 工具或重复副作用。
- completion reject，要求新 runtime 重新读取真实磁盘状态。

终态自身提交失败也不返回伪 outcome。下一实例根据实际落盘内容恢复，并对合法 open run 追加一次 interrupted。

`finally` 统一清理 timer、外部 listener、sink、continuation、workspace、prepared、pending、authorization 和 active registry；清理不删除 JSONL、Session 或工作区文件。

### 4.11 公共 API

`@/lib/agent` 只导出：

- `createAgentRuntime`、`AgentLayerError`。
- 5 个批准的 strict Schema。
- 运行限制、占位工具名和错误码常量。
- runtime、request、controls、handle、outcome、snapshot、context provider 和审批结果公共类型。

未导出 projector 内部状态、dependency overrides、事件 publisher、流式 redactor、active registry、prepared invocation、pending、authorization 或 raw executor。

## 5. 实际文件变更

### 5.1 新增生产文件

```text
lib/agent/approval-wait.ts
lib/agent/dependencies.ts
lib/agent/errors.ts
lib/agent/events.ts
lib/agent/index.ts
lib/agent/projection.ts
lib/agent/redaction.ts
lib/agent/runtime.ts
lib/agent/schemas.ts
lib/agent/types.ts
```

### 5.2 新增测试文件

```text
tests/unit/agent/events.test.ts
tests/unit/agent/helpers.ts
tests/unit/agent/projection.test.ts
tests/unit/agent/public-api.test.ts
tests/unit/agent/recovery.test.ts
tests/unit/agent/runtime-approval.test.ts
tests/unit/agent/runtime-cancellation.test.ts
tests/unit/agent/runtime-completion.test.ts
tests/unit/agent/runtime-limits.test.ts
tests/unit/agent/runtime-tools.test.ts
tests/unit/agent/schemas.test.ts
tests/unit/agent/security.test.ts
```

### 5.3 文档修改

```text
docs/development/09-agent-state-machine-tasks.md
docs/development/09-agent-state-machine-summary.md
docs/development/README.md
```

没有删除文件。阶段 09 Spec 只在实现前记录过用户批准状态，本次实施未反向改写规格。

工作树中的阶段 07 Summary 修订、阶段 08 文档/源码/测试均为进入阶段 09 前已存在的前序内容，本阶段没有覆盖或清理它们。

## 6. 验证结果

### 6.1 实施前基线

```text
pnpm test
  Test Files  41 passed (41)
  Tests       408 passed (408)

pnpm lint
  通过，0 warning

pnpm typecheck
  通过
```

### 6.2 Agent 精确测试

```text
pnpm exec vitest run tests/unit/agent
  Test Files  11 passed (11)
  Tests       85 passed (85)
```

`helpers.ts` 是测试支持文件，不由 Vitest 计为独立测试文件。

### 6.3 全仓门禁

```text
pnpm test
  Test Files  52 passed (52)
  Tests       493 passed (493)

pnpm lint
  通过，0 warning

pnpm typecheck
  通过

pnpm build
  Next.js 16.3.3 / Turbopack
  Compiled successfully
  TypeScript passed
  4/4 static pages generated

git diff --check
  通过，无输出
```

### 6.4 边界与安全审计

- `lib/agent` 与 `tests/unit/agent` 文件集合和 Task 白名单完全一致。
- `package.json`、`pnpm-lock.yaml`、Next/TypeScript/ESLint/Vitest 配置无差异。
- `app/**` 和阶段 03–08 生产源码无本阶段差异。
- 仓库根未遗留 `.secode-data`。
- Agent 生产源码无 Next.js、React、浏览器、Agent framework 或厂商 SDK import。
- Agent 生产源码无直接 `fs`、`child_process`、`process.env`、API Key 环境变量或真实秘密模式。
- 测试中的 `node:fs` 只用于已登记临时目录；Bearer、`sk-*` 和 API Key 字符串均为故意验证脱敏的假哨兵。
- 无尾随空白；没有跳过测试、降低断言或新增永久 skip。

虽然本阶段未使用 Next.js API，仍按仓库 `AGENTS.md` 核对了本地 Next.js 16.3.3 项目结构与 TypeScript 指南，确认顶层 `lib/agent` 是非路由代码且会被项目 TypeScript 检查覆盖。

## 7. 开发中发现的问题、原因与修正

### 7.1 projector 的 TypeScript 收窄问题

- 症状：行为测试通过，但 typecheck 报告 optional 字段未充分收窄和不可达分支类型错误。
- 原因：事件判别已经完成后，局部变量仍保留联合/可选类型；穷尽分支又访问了被收窄为 `never` 的值。
- 修正：在已验证边界保存明确局部值，移除不安全的不可达值访问，并保留运行时失败关闭。
- 重验：projection 聚焦测试、typecheck 和全仓测试通过。

### 7.2 测试回调意外返回数组长度

- 症状：event 测试的 `push` 箭头函数推断返回 `number`，不满足 `void | Promise<void>` sink 契约。
- 原因：使用表达式体直接返回 `array.push()` 结果。
- 修正：改为块体回调，仅执行 push，不返回值。
- 重验：events/security 测试和 typecheck 通过。

### 7.3 文本完成末段异常绕过统一终态处理

- 症状：final/completed 相关故障注入可令 Promise rejection 直接越过外层 catch。
- 原因：异步函数中使用 `return this.completeTextRun(...)`，被返回 Promise 的后续 rejection 不再位于当前 try/catch 的 await 点。
- 修正：改为 `return await`，让 final validation、消息追加和完成事件错误统一进入运行时故障路径。
- 重验：runtime completion、recovery 和全仓回归通过。

### 7.4 测试类型过宽或恒真判断

- 症状：recovery/limits 行为测试通过，但 typecheck 分别发现恒真条件、缺失 `JsonValue` import 和测试对象推断过宽。
- 原因：测试辅助类型没有与生产联合保持同等精确度。
- 修正：收紧 fixture 类型、补充批准的领域类型 import，并删除无意义判断。
- 重验：对应聚焦测试与 typecheck 通过。

### 7.5 审批测试等待窗口过短

- 症状：首轮 4 个审批测试均超时，测试清理后后台 run 又产生 `SESSION_NOT_FOUND` 噪声。
- 原因：以固定 100 次 `setImmediate` 等待 durable append/fsync，在真实文件系统调度下并不构成可靠时间边界；超时清理早于后台 run 收束。
- 修正：改为有 3 秒明确截止时间、5ms 间隔的状态轮询，并确保每个 run 在清理前 settle。
- 重验：审批与 projector 共 19 项测试通过，随后全 Agent 85 项通过。

### 7.6 lint 收口问题

- 症状：公共 API 收口后出现 3 个 unused import 和 1 个 `prefer-const`。
- 原因：实现重构后测试/运行时代码残留未使用符号，可变声明实际未重新赋值。
- 修正：移除多余 import，并用明确 active holder 结构满足状态生命周期和 lint 规则。
- 重验：lint 零 warning，typecheck 与相关测试通过。

### 7.7 终态和取消竞态复盘

初版聚焦测试通过后又进行了一次主动竞态审计，发现测试未完全覆盖的窄窗口：

- context/compaction 返回后、模型请求前可能已超时。
- `approval.required` fsync 期间取消时，新建 waiter 可能晚于首次 abort。
- approval resolve、`tool.started` 和 executor 之间可能插入取消。
- final 消息和 completed 之间可能与 cancel 竞争。
- 未知模型 finish reason 需要 projector 显式拒绝。
- `sk-*` 后接标点的流式结果需要与完整脱敏等价。

修正包括：在关键 durable/副作用边界重新检查 abort、创建 waiter 后立即同步既有 abort、resolve 前后校验取消、`tool.started` 前复查、引入 finalizing gate、projector 拒绝未知 finish reason，以及为 `sk-*` 增加独立 discard 状态以保留后续标点。

新增/加强回归后，projection、security、approval、cancellation 共 40 项聚焦测试通过；最终 Agent 85 项和全仓 493 项均通过。

## 8. Spec / Task 一致性

### 8.1 一致项

- 生产、测试和文档文件均在批准白名单内。
- 固定限制、公共接口、16 个错误码和 strict 输入边界与 Spec 一致。
- durable event 为唯一恢复事实，projector 与 runtime 副作用分离。
- 工具调用严格串行，执行只经阶段 07 gateway。
- 审批事实先于副作用，拒绝无 started。
- 取消、总时限、迭代上限、三连错误和提交不确定语义均按规格实现。
- 未实现真实上下文算法、终端、HTTP、UI、真实模型调用或多 Agent。
- 未引入任何依赖或 Agent framework。

### 8.2 偏差

无需要重新审批的 Spec 或 Task 偏差。

实现中增加的 abort 边界复查、finalizing gate、未知 finish reason 拒绝和 `sk-*` 标点回归，均是在既有批准语义内关闭竞态和泄露窗口，没有改变公共 API、事件协议或安全策略。

## 9. 需求验收证据

| 需求 | 实现证据 | 验证证据 |
| --- | --- | --- |
| FR-003/004 | 工具计划、模型—工具—反馈循环、终止限制 | runtime-tools、runtime-limits |
| FR-005 | durable/live publisher、projector、快照 | events、projection |
| FR-006 | pending waiter、批准/拒绝和一次性 authorization | runtime-approval |
| FR-007 | linked abort、finalize gate、统一清理 | runtime-cancellation、recovery |
| FR-008 | 分页投影、interrupted、commit uncertainty | recovery、runtime-tools |
| FR-009 | Session profile preflight 和固定 profile 调用 | recovery、runtime-completion |
| FR-010 | context provider 端口和 compaction 单点追加 | schemas、runtime-completion |
| NFR-002/003 | strict Schema、有限错误、非法历史失败关闭 | schemas、projection、security |
| NFR-004/005 | 30 轮、10 分钟、复用模型/工具层限制 | runtime-limits、runtime-cancellation |
| NFR-006 | Node-only、无框架耦合 | public-api、源码扫描、build |
| NFR-008 | Spec / Task / Summary 和真实命令记录 | 本文与开发索引 |
| SEC-001–005/007 | workspace 重建、gateway 唯一执行路径 | recovery、runtime-tools、runtime-approval |
| SEC-006 | prompt/delta/event/error/reason 脱敏 | events、security、源码扫描 |
| SEC-008 | 单进程边界、不确定提交安全停止 | recovery、故障注入测试 |
| COM-001/003 | 自研状态机、projector、redactor、无 Agent SDK | package/config diff 与源码扫描 |

## 10. 已知限制

- 当前只保证单进程内 Session 互斥；多进程同时操作同一 Session 不在首版范围。
- active registry、continuation、pending 和 authorization 在进程重启后不会恢复；open run 会被中断事实关闭。
- 阶段 09 只有 context provider 端口，没有真实历史选择、token 估算、75% 阈值或摘要生成。
- 没有 CLI/TTY、HTTP 或 UI 入口，不能直接手工发起 Agent 对话。
- 本阶段只使用假模型、临时数据根和临时工作区，没有读取真实 Key、访问真实项目或请求外部模型。
- sink 是进程内即时观察通道，断开后只能从 JSONL 恢复 durable 事件；未持久化的 delta 不可重放。
- 应用面向可信本地单用户，不构成恶意代码的操作系统级沙箱。

## 11. 反思与阶段 10 影响

### 11.1 有效做法

- 先把事件生命周期做成纯 projector，再编写副作用 runtime，使非法轨迹、恢复和终态竞争可独立验证。
- 将 durable append、projection 和 sink 顺序集中在一个 publisher，避免各路径自行决定事实顺序。
- 用 fake model/context 与真实临时 JSONL store 组合，既保持确定性，也能暴露 fsync 与异步等待的真实问题。
- 每个子任务后运行聚焦测试和 typecheck，使行为正确但类型不严谨的问题在进入下一任务前被发现。
- 全量通过后再做竞态审计，发现了正常 happy-path 测试难以暴露的取消窗口。

### 11.2 可改进处

- 审批测试最初使用事件循环次数而不是明确时间截止，说明异步持久化测试必须基于可观察状态和有界 deadline。
- runtime 文件达到 1043 行；阶段 10 接入时应保持端口边界，不继续把上下文算法塞入 runtime。若后续确需拆分，只能在对应阶段 Spec 中先批准文件和职责变化。
- 终态竞争应更早以“每个 await 后都可能被取消”为设计检查表，而不是在实现末尾补做专项审计。
- fault injection 应继续优先验证“事实是否已提交不确定”而非仅验证函数抛错，防止恢复语义被简化。

### 11.3 阶段 10 的固定输入

阶段 10 可依赖 `@/lib/agent` 导出的 `AgentContextProvider`、`AgentContextRequest`、`AgentContextResult` 和 compaction Schema，实现真实历史投影与压缩。

阶段 10 必须保持：

- provider 无 storage 写权限。
- compaction 只返回 draft，由 runtime 单点追加 durable event。
- 消息和摘要输出必须通过现有 strict Schema。
- 不改变 AgentRuntime 公共签名、事件协议、工具/审批顺序或取消语义。
- 如果观察证明接口不足，先修订阶段 10 Spec 并明确是否需要回到阶段 09 重新审批，不能直接修改本阶段契约。

## 12. 用户审批项

请重点审阅：

1. AgentRuntime 的公共接口和阶段 10 上下文端口是否符合预期。
2. durable event 生命周期、审批和工具副作用顺序是否可接受。
3. 取消、超时、迭代上限、三连错误与不确定提交策略是否符合要求。
4. 当前不能人工聊天、需等阶段 10/11 的阶段边界是否继续保持。
5. 已知限制和阶段 10 固定输入是否完整。

用户已于 2026-08-27 明确批准本 Summary。阶段 09 正式完成，阶段 10 只读观察与 Spec 已解锁；阶段 10 Task 和实现仍需分别等待后续审批。
