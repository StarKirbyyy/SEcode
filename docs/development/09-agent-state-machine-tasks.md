# 阶段 09 Task：Agent 状态机

## 1. 文档状态与审批链

- 当前状态：已批准
- 生成日期：2026-08-27
- 已批准 Spec：[09-agent-state-machine-spec.md](./09-agent-state-machine-spec.md)
- Spec 审批记录：用户于 2026-08-27 明确批准
- 当前允许：严格按本文顺序实施 T09-00～T09-13
- 当前禁止：超出白名单、实现真实上下文、终端、Route Handler 或 UI
- 下一步门禁：完成实现、验证和 Summary 后等待用户审批，批准前不得开始阶段 10

审批链：

```text
阶段 09 Spec（已批准）
  → 本 Task（已批准）
  → T09-00～T09-13（已解锁）
  → 阶段 09 Summary（实现完成后生成）
```

## 2. 任务目标

在不修改阶段 03–08 已批准协议、不引入新依赖和不进入阶段 10–14 的前提下，实现一个 Node-only、自研、事件驱动的 Agent 运行时。

本 Task 将批准的 Spec 转换为可顺序执行的工程工作。实现阶段不得临时决定新的公共接口、安全边界、事件格式或终止策略。

最终产物应具备：

- strict 运行契约、错误和限制。
- 纯 durable event 生命周期投影器。
- prompt/delta/event 脱敏与有序事件发布。
- Session 恢复、active run 注册和运行前校验。
- 模型 completion、工具、审批和结果反馈循环。
- 取消、超时、迭代上限、三连工具错误与提交不确定处理。
- 面向阶段 10/11 的稳定公共 API。
- 完整 deterministic 单元测试和全仓质量门禁。

## 3. 执行总顺序

```text
T09-00 基线与门禁复核
  → T09-01 契约、Schema、错误与依赖
  → T09-02 生命周期投影器
  → T09-03 流式脱敏与事件管线
  → T09-04 Session 恢复与运行骨架
  → T09-05 模型循环与文本完成
  → T09-06 工具计划与非审批执行路径
  → T09-07 审批等待与决定
  → T09-08 取消、超时和 sink 断开
  → T09-09 迭代与连续错误限制
  → T09-10 durable 提交故障与资源清理
  → T09-11 公共 API 与安全收口
  → T09-12 全量验证、差异审查与反思修正
  → T09-13 Summary 与审批门禁
```

所有任务按顺序执行。一个任务的最小验证失败时，不开始下一任务。

## 4. 文件白名单

### 4.1 生产文件

实现阶段只允许新增：

```text
lib/agent/types.ts
lib/agent/schemas.ts
lib/agent/errors.ts
lib/agent/dependencies.ts
lib/agent/projection.ts
lib/agent/redaction.ts
lib/agent/events.ts
lib/agent/approval-wait.ts
lib/agent/runtime.ts
lib/agent/index.ts
```

### 4.2 测试文件

实现阶段只允许新增：

```text
tests/unit/agent/helpers.ts
tests/unit/agent/schemas.test.ts
tests/unit/agent/projection.test.ts
tests/unit/agent/recovery.test.ts
tests/unit/agent/runtime-completion.test.ts
tests/unit/agent/runtime-tools.test.ts
tests/unit/agent/runtime-approval.test.ts
tests/unit/agent/runtime-cancellation.test.ts
tests/unit/agent/runtime-limits.test.ts
tests/unit/agent/events.test.ts
tests/unit/agent/security.test.ts
tests/unit/agent/public-api.test.ts
```

### 4.3 文档文件

允许修改：

```text
docs/development/09-agent-state-machine-spec.md
docs/development/09-agent-state-machine-tasks.md
docs/development/09-agent-state-machine-summary.md
docs/development/README.md
```

Spec 只能更新真实审批记录；实现发现需改变 Spec 时必须停止并重新审批，不能直接回写掩盖偏差。

### 4.4 明确禁止修改

```text
lib/domain/**
lib/model/**
lib/workspace/**
lib/tools/**
lib/approval/**
lib/storage/**
app/**
package.json
pnpm-lock.yaml
tsconfig.json
vitest.config.ts
eslint.config.mjs
next.config.ts
.env*
.gitignore
```

若实现确实需要修改任一禁止路径，立即停止并回到 Spec 修订，不以“兼容修复”为由越界。

## 5. T09-00：实施前基线与批准范围复核

### 输入

- 已批准阶段 09 Spec。
- 阶段 00 流程、阶段 01 需求、阶段 03–08 Spec/Task/Summary。
- 当前 `AGENTS.md`、Git 状态、依赖和测试基线。

### 操作

1. 逐项核对 Spec 第 6、8–29、32 节和本 Task。
2. 记录实现前 `git status --short`，区分既有用户/前序阶段修改。
3. 确认 `lib/agent`、`tests/unit/agent` 尚不存在或只包含本阶段已登记文件。
4. 确认本阶段不需要 Next.js API；若出现 Next.js import 需求，停止并回到 Spec。真正使用任何 Next.js API 前必须按 `AGENTS.md` 阅读 `node_modules/next/dist/docs/` 对应指南。
5. 运行实施前基线：

```text
pnpm test
pnpm lint
pnpm typecheck
```

6. 记录测试文件数、测试数、warning 和失败；不得把既有失败误记成本阶段引入。

### 输出

- Summary 中可追溯的实施前基线记录。
- 已确认的白名单和禁止范围。

### 完成条件

- 基线全部通过，或存在与本阶段无关的既有失败且已停止向用户报告。
- 未创建实现文件。
- 未修改或清理既有工作树内容。

### 覆盖

- NFR-006、NFR-008、COM-001/003。

## 6. T09-01：公共契约、strict Schema、错误与依赖

### 输入

- Spec 第 8–11、21、22、25 节。
- 阶段 03 的 `ErrorInfo`、消息、ID、状态和事件类型。
- 阶段 04/05/07/08 公共类型。

### 涉及文件

```text
lib/agent/types.ts
lib/agent/schemas.ts
lib/agent/errors.ts
lib/agent/dependencies.ts
tests/unit/agent/helpers.ts
tests/unit/agent/schemas.test.ts
```

### 操作

1. 在 `types.ts` 固定 Spec 第 8 节全部常量和值。
2. 定义：

```text
AgentRunRequest
AgentRunControls
AgentRunHandle
AgentRunOutcome
AgentEventSink
AgentContextRequest
AgentContextResult
AgentContextProvider
AgentRuntime
SessionAgentSnapshot
RunSnapshot / ActiveAgentRunView
AgentApprovalResolution
AgentErrorCode
```

3. `AgentRunRequestSchema`：
   - strict object。
   - UUID Session ID。
   - prompt trim 后非空、最多 1048576 字符。
   - maxIterations 1–30。
   - maxDurationMs 1000–600000。
   - thinking 复用已批准枚举，不接受额外字段。
4. 为 context result 建立仅验证消息与 compaction 结构的内部 strict Schema；不实现压缩算法。
5. 建立 16 个已批准 Agent 错误码和固定 recoverable 映射。
6. `AgentLayerError` 以 `ErrorInfoSchema` 二次验证，cause 不可枚举。
7. `dependencies.ts` 只定义 runtime 所需的时钟、UUID、timer、workspace/gateway 薄适配器和 factory 默认绑定；不导出 raw capability 构造器。
8. helpers 只提供 deterministic UUID/时间、temp workspace/store、fake model/context 和事件读取工具；所有临时目录必须登记后清理。

### 最小测试

- 默认和降低后的 limits。
- 31 次、999ms、600001ms、空 prompt、非法 UUID、额外 key 拒绝。
- controls.signal/onEvent 不属于请求 Schema。
- context messages 和 compaction strict 校验。
- 15 个错误码、recoverable 表、有限 message/details 和非枚举 cause。
- `pnpm typecheck`。

### 完成条件

- 公共契约足以支撑后续任务，不需要临时改变签名。
- 不读取环境变量、磁盘、模型或工具。
- 没有 Next.js/React/浏览器依赖。

### 覆盖

- FR-004/005/006/007/008/010。
- NFR-002/003/004/006。
- SEC-006。

## 7. T09-02：纯 durable event 生命周期投影器

### 输入

- Spec 第 12、13、20、21 节。
- 阶段 03 的 16 类 durable event。
- storage 已保证的物理 seq/ID/Session 不变量。

### 涉及文件

```text
lib/agent/projection.ts
lib/agent/types.ts
lib/agent/errors.ts
tests/unit/agent/helpers.ts
tests/unit/agent/projection.test.ts
```

### 操作

1. 实现纯增量 projector，可从空状态逐事件 reduce，不访问 I/O。
2. 只保留运行投影所需摘要：当前/最后 run、模型 iteration、工具槽位、审批、final、终态、连续错误状态和最后 seq。
3. 验证 Session 级：
   - 唯一 session.created。
   - 同时最多一个 open run。
   - runId 归属和 terminal 后禁止事件。
4. 验证用户消息和模型回合：
   - 一次 user.message 且位于首次 model request 前。
   - iteration 从 1 连续。
   - requested/completed 成对。
   - stop/tool_calls 后续路径不同。
5. 验证工具：
   - toolCallId run 内唯一。
   - 同 completion 先全部 requested 后进入第一个审批/started/result。
   - 工具严格串行。
   - prepare/policy/reject 直达 result 与批准执行路径。
6. 验证审批 ID、approved/rejected 语义和禁止重复。
7. 验证 compaction 只位于稳定边界，throughSeq 小于自身 seq，retained range 指向已见稳定历史。
8. 验证 completed/failure/cancel/interrupted 的 iteration、final、pending 和 lastStableSeq 规则。
9. 非法历史统一抛 `AGENT_HISTORY_INVALID`，details 只含 event type、seq、有限 reason 和公共 ID。
10. 返回深冻结或只读快照，不暴露 mutable Map/Set。

### 最小测试

- 至少覆盖 Spec 27.2 的全部正反轨迹。
- 每一种事件类型至少出现在一个合法或非法用例中。
- 对同一事件序列重复投影结果一致。
- projector 测试中禁止创建磁盘、模型或工具实例。
- `pnpm exec vitest run tests/unit/agent/projection.test.ts`。
- `pnpm typecheck`。

### 完成条件

- 合法 incomplete run 可投影为 open。
- 非法业务历史失败关闭，不跳过、不自动修复。
- failed/cancelled/interrupted 能从合法中间态终止。
- projector 不与 storage 复制物理 JSONL 解析逻辑。

### 覆盖

- FR-004/005/006/008。
- NFR-002/003/006。
- SEC-006。

## 8. T09-03：跨 chunk 脱敏与事件提交/发布管线

### 输入

- Spec 第 14、15、22、23、29 节。
- `redactSecrets`、domain event Schema、`JsonlEventStore.appendEvent()`。

### 涉及文件

```text
lib/agent/redaction.ts
lib/agent/events.ts
lib/agent/dependencies.ts
tests/unit/agent/events.test.ts
tests/unit/agent/security.test.ts
```

### 操作

1. 实现有界增量流式脱敏器，覆盖 Bearer、`sk-*`、`*_API_KEY=`。
2. 待判定前缀最多 256 bytes；超限保守输出 `[REDACTED]`。
3. 正常结束 flush 非敏感尾部；取消/错误丢弃未确认尾部。
4. 实现 durable append helper：draft 校验 → store append → projector apply → sink。
5. durable sink 只接收 store 返回的完整事件。
6. 实现 live event factory：UUID、ISO time、per-run streamSeq、非空 sanitized content。
7. live event 禁止调用 store；private reasoning 不存在于接口。
8. sink 第一次失败后禁用并通知 runtime 取消源，不能递归向失败 sink 发 terminal。
9. prompt、assistant content、cancel reason、approval reason 和 Agent error message 使用完整值脱敏与领域上限校验。

### 最小测试

- 三类秘密在每一个字节/字符边界切分。
- 中文 UTF-8 与普通代码保持一致。
- 256-byte 边界与超长未终止 token 保守脱敏。
- 拼接 live fragments 不包含秘密并等价于完整脱敏结果。
- streamSeq 从 1 连续，空片段不占序号。
- durable append 成功前 sink 不触发；append 失败不发布。
- live event 永不进入 store。
- sink 失败只通知一次并停止后续调用。
- `pnpm exec vitest run tests/unit/agent/events.test.ts tests/unit/agent/security.test.ts`。

### 完成条件

- 任意测试 chunk 划分不能泄露哨兵秘密。
- durable/live 事件顺序和所有权明确。
- 未修改阶段 03 redaction 或事件协议。

### 覆盖

- FR-005/007。
- NFR-003/006。
- SEC-006。

## 9. T09-04：Session 恢复、active registry 与运行骨架

### 输入

- Spec 第 10、13、14、19、21、24 节。
- T09-01～T09-03 产物。
- storage inspection/read/append、workspace factory、model registry snapshot。

### 涉及文件

```text
lib/agent/runtime.ts
lib/agent/dependencies.ts
lib/agent/events.ts
tests/unit/agent/helpers.ts
tests/unit/agent/recovery.test.ts
```

### 操作

1. 实现 `sessionId → runId`、`runId → active state` 注册表。
2. start/recover 以 Session 为 key 串行；不同 Session 不互锁。
3. `recoverSession()`：
   - inspect 修复尾部。
   - 分页增量投影。
   - 零 open 时零写入。
   - 一个合法 open 时追加一次 interrupted。
   - 多 open/交叠/非法历史失败关闭。
4. interrupted 使用 inspection 的 lastStableSeq 和固定脱敏原因；追加后重新投影。
5. preflight 顺序严格执行输入、signal、busy、recover、metadata、workspace、model profile、context provider。
6. workspacePath 必须重新创建 opaque handle；metadata 字符串不能直接执行。
7. profile 必须存在且 configured；不得读取或返回 API Key。
8. prompt 在进入事件和未来 context 前完成脱敏，原始值不保留在 active snapshot。
9. 建立 linked controller、单调起始时间、timer 和 runId。
10. 成功提交 run.started 后返回 handle；后台先提交唯一 user.message。
11. 句柄 cancel 委托 runtime；completion 暂接后续循环。
12. preflight 失败不产生 run.started；run.started 后失败由后续任务完成 terminal 处理。

### 最小测试

- Spec 27.3 全部恢复路径。
- recover 幂等和 interrupted lastStableSeq。
- 同 Session 两个 start 只有一个成功，不同 Session 可并行前置校验。
- workspace 改变、profile 缺失/未配置、context 缺失。
- start 前 signal aborted 零运行事件。
- run.started 成功后 handle 字段固定且 active view 可读。
- prompt 秘密不进入模型前置状态、run.started preview 或 user.message。
- 不重建 continuation/pending/authorization。
- `pnpm exec vitest run tests/unit/agent/recovery.test.ts tests/unit/agent/schemas.test.ts`。

### 完成条件

- 新 run 不能绕过恢复。
- 同 Session 单 active run，无第二状态文件。
- 所有 capability 只存在进程内 active state。

### 覆盖

- FR-004/007/008/009。
- NFR-003/004/006。
- SEC-001/002/006/008。

## 10. T09-05：上下文端口、模型循环与文本完成路径

### 输入

- Spec 第 11、16、19、22 节。
- T09-04 运行骨架。
- `ModelClient.complete()` 和 fake context provider。

### 涉及文件

```text
lib/agent/runtime.ts
lib/agent/events.ts
lib/agent/schemas.ts
tests/unit/agent/helpers.ts
tests/unit/agent/runtime-completion.test.ts
```

### 操作

1. 后台循环在每轮开始检查 linked signal、总时限和迭代边界。
2. 调用 provider 并 strict 校验结果；provider 无 store 写权限。
3. compaction 存在时先提交 `context.compacted`，再 model.requested。
4. 成功提交 model.requested 后增加 iteration。
5. 调用模型时传 profile、messages、六工具 definitions、signal、thinking、continuation 和 sanitized delta callback。
6. continuation 仅保存于 active state，下一轮传回；不出现在事件/snapshot/error。
7. completion 后提交 model.completed，丢弃 reasoningTokens。
8. stop 路径验证非空 content 和 1048576 字符领域上限。
9. 依次提交 final assistant.message 和 run.completed。
10. `durationMs` 使用单调时钟且不为负；iterations 等于已提交 model.requested 数。
11. ModelLayerError 原样进入 run.failed；Agent 不做第二层模型重试。
12. provider 错误/非法输出映射 `AGENT_CONTEXT_FAILED`；过大消息映射 `AGENT_ASSISTANT_MESSAGE_TOO_LARGE`。
13. terminal 成功后 resolve outcome 并清理 active registry。

### 最小测试

- 一轮 stop/final/completed 完整轨迹和 outcome。
- compaction 在 model.requested 前且只由 runtime 追加。
- live delta 顺序与 durable final 校正。
- continuation 首轮无、第二轮相同进程内传入、事件不可见。
- usage 不含 reasoningTokens。
- provider throw/非法 messages/非法 compaction。
- ModelLayerError 不产生 Agent 额外重试。
- stop content 空、消息过大、负向时钟防护。
- `pnpm exec vitest run tests/unit/agent/runtime-completion.test.ts tests/unit/agent/events.test.ts`。

### 完成条件

- fake provider + fake model 可完成纯文本 run。
- final/completed 不可乱序或重复。
- 错误 terminal 与 outcome 一致。

### 覆盖

- FR-004/005/007/009/010。
- NFR-003/004/006。
- SEC-006。

## 11. T09-06：工具计划、归一化和非审批执行路径

### 输入

- Spec 第 16–18、20、23 节。
- 阶段 06 prepare、阶段 07 authorization gateway。
- T09-05 模型循环。

### 涉及文件

```text
lib/agent/runtime.ts
lib/agent/events.ts
lib/agent/projection.ts
tests/unit/agent/helpers.ts
tests/unit/agent/runtime-tools.test.ts
```

### 操作

1. tool_calls completion 有 content 时先提交 intermediate assistant.message。
2. 在执行任何工具前，验证本 completion 和 run 的 toolCallId 唯一性。
3. 将合法/非法 completion 项统一转换为内部 tool plan slot。
4. 合法调用先 prepare，保留 opaque invocation，并使用其 public projection。
5. 非法 normalized call 使用：
   - 原稳定 ID。
   - `invalid_tool_call`。
   - 有界、脱敏 publicArguments。
   - `argumentsTruncated=true`。
6. 将本 completion 的全部 tool.requested 按模型顺序提交完毕。
7. 再按顺序处理每个 slot；前一个未有 result 前不得开始下一个。
8. prepare invalid、unknown、参数错误直接提交 ToolResult，不进入 risk/started。
9. policy denied 直接提交 gateway ToolResult，不产生 started。
10. 自动允许路径先提交 tool.started，再消费一次性 authorization 执行，最后提交 result。
11. 成功或普通工具错误都作为下一轮上下文事实，不直接停止 run。
12. 所有 tool result 完成后回到下一模型轮。
13. duplicate ID 映射 `AGENT_MODEL_OUTPUT_INVALID`，本 completion 不执行工具。

### 最小测试

- tool_calls → result → 下一轮 final。
- 多工具全部 requested 在任何 started/result 之前。
- 多工具严格串行，禁止 Promise.all。
- intermediate 位于 requested 前。
- invalid call 占位名称、argumentsTruncated 和 MODEL_INVALID_TOOL_CALL result。
- unknown/参数错误无 assessment/started。
- policy denied 无 started。
- 自动允许 started 成功提交后才执行。
- 执行成功、非零退出等普通 ToolResult 反馈下一轮。
- duplicate toolCallId 无副作用并 failed。
- `pnpm exec vitest run tests/unit/agent/runtime-tools.test.ts tests/unit/agent/projection.test.ts`。

### 完成条件

- fake model 可完成至少两个工具后再 final 的轨迹。
- 任何工具副作用都有先行 durable started 事实。
- Agent 未导入工具内部 executor。

### 覆盖

- FR-003/004/005。
- NFR-003/006。
- SEC-001–005/007。

## 12. T09-07：审批等待、批准和拒绝

### 输入

- Spec 第 18、19、24 节。
- `PendingToolApproval`、view、resolve gateway、一次性 authorization。

### 涉及文件

```text
lib/agent/approval-wait.ts
lib/agent/runtime.ts
lib/agent/types.ts
lib/agent/schemas.ts
tests/unit/agent/helpers.ts
tests/unit/agent/runtime-approval.test.ts
```

### 操作

1. 实现单 pending approval wait slot，保存 opaque pending 和受控 resolver。
2. `approval.required` 成功提交后状态进入 awaiting_approval，外部只看到 view。
3. `resolveApproval()` 严格验证 runId、approvalId、decision 和当前 pending。
4. decision reason 在进入 gateway 和事件前脱敏并限制 4096 字符。
5. 先调用 gateway resolve：
   - invalid：返回 control error，不写事件、不清 pending。
   - authorized/rejected：继续 durable 事实。
6. 批准：先提交 approval.resolved，再唤醒、提交 started、执行和 result。
7. 批准事实提交失败时丢弃 authorization，不执行，不重新 resolve。
8. 拒绝：提交 approval.resolved，再直接提交 gateway rejection result，无 started。
9. 每个决定只完成一次；重复决定返回 control error。
10. cancel/timeout 通过独立控制路径唤醒等待，不伪造 resolved/result。

### 最小测试

- required 后 pending view、awaiting status。
- 批准事件顺序和一次执行。
- 拒绝事件顺序、无 started、下一轮可继续。
- wrong run/approval、无 pending、重复决定零新事件。
- gateway invalid 后仍可用正确 ID 决定。
- reason 脱敏和最大长度。
- approval.resolved append failure 后无执行。
- 同 run 不可能同时存在两个 pending。
- `pnpm exec vitest run tests/unit/agent/runtime-approval.test.ts tests/unit/agent/projection.test.ts`。

### 完成条件

- pending/authorization 不进入 snapshot、event、JSONL 或 public barrel。
- approved 历史不能作为能力。
- reject 不终止整个 run，除非后续命中其他限制。

### 覆盖

- FR-005/006/007。
- NFR-002/003/006。
- SEC-005/006。

## 13. T09-08：取消、总时限和事件消费者断开

### 输入

- Spec 第 15、19、23、24 节。
- model/tool 专用 abort 异常和 approval wait。

### 涉及文件

```text
lib/agent/runtime.ts
lib/agent/approval-wait.ts
lib/agent/events.ts
lib/agent/dependencies.ts
tests/unit/agent/runtime-cancellation.test.ts
```

### 操作

1. linked controller 连接外部 signal、handle/runtime cancel、总时限和 sink failure。
2. 只保存第一个终止来源，后续 abort 幂等。
3. 用户/外部/sink 断开映射 run.cancelled；reason 固定或脱敏有界。
4. 总时限映射 `run.failed(AGENT_RUN_TIMEOUT)`。
5. 模型自身 `MODEL_TIMEOUT` 保持模型错误，不误记用户取消。
6. ModelAbortError/LocalToolExecutionAbortedError 按内部来源分类；无来源时内部错误。
7. model、tool、approval wait 三处都能被 signal 及时唤醒。
8. 取消 pending 时不写 approval.resolved/tool.result。
9. sink 失败后不再调用 sink，但 terminal 仍尝试落盘。
10. terminal 竞争使用单一 finalize gate，cancel/timeout/model failure 只能有一个获胜。

### 最小测试

- start 前、model 中、tool 中、approval wait 中取消。
- handle.cancel、runtime.cancelRun、外部 signal 行为一致。
- 重复 cancel 返回 false、单 terminal。
- sink 第一次失败后停止回调并 persisted cancelled。
- fake timer 精确命中总时限，清理 timer。
- MODEL_TIMEOUT 与 AGENT_RUN_TIMEOUT 分类。
- 无内部 abort source 的专用 abort 变 internal error。
- cancelled iterations 等于已提交请求数。
- `pnpm exec vitest run tests/unit/agent/runtime-cancellation.test.ts tests/unit/agent/runtime-approval.test.ts`。

### 完成条件

- 所有等待位置无悬挂 promise/listener。
- 取消不反馈模型重试。
- 同一 run 只有一个 terminal outcome。

### 覆盖

- FR-006/007。
- NFR-003/004/006。
- SEC-006。

## 14. T09-09：迭代上限和连续相同工具错误

### 输入

- Spec 第 8、16、20、22 节。
- T09-05/06 模型与工具循环。

### 涉及文件

```text
lib/agent/runtime.ts
lib/agent/projection.ts
tests/unit/agent/helpers.ts
tests/unit/agent/runtime-limits.test.ts
```

### 操作

1. 下一次模型请求前检查 iteration；允许第 30 次，禁止第 31 次。
2. 超限提交 `AGENT_ITERATION_LIMIT`，不发额外模型请求。
3. canonical JSON 递归排序 object keys、保持数组顺序。
4. signature 固定为 toolName + error.code + SHA-256(canonical publicArguments)。
5. 成功 result 清零；不同失败替换为 streak 1；相同失败累加。
6. 第三次相同连续失败必须先提交 tool.result，再 failed。
7. 命中三连后不请求模型，也不执行当前 completion 尚未开始的后续工具。
8. projector 能从 durable requested/result 重建 streak，但 runtime 重启仍按 interrupted 恢复。

### 最小测试

- maxIterations=1 和默认 30 的 off-by-one。
- 第 30 次 stop 可 completed，第 31 次未调用。
- key 顺序不同但语义相同的 publicArguments signature 相同。
- array 顺序不同 signature 不同。
- 第三次事件顺序 result → failed。
- 中间 success/不同 code/name/arguments 重置或替换 streak。
- 三连后剩余 tool slots 无 started/result。
- `pnpm exec vitest run tests/unit/agent/runtime-limits.test.ts tests/unit/agent/projection.test.ts`。

### 完成条件

- 30/31 和第 2/3 次边界无歧义。
- signature 不使用 prepared/raw/sensitive arguments。
- 终止后无额外副作用。

### 覆盖

- FR-004/005。
- NFR-003/004/006。
- SEC-006。

## 15. T09-10：durable 提交故障、终态失败和资源清理

### 输入

- Spec 第 23、24 节。
- storage 故障注入和 active resources。

### 涉及文件

```text
lib/agent/runtime.ts
lib/agent/events.ts
lib/agent/approval-wait.ts
tests/unit/agent/helpers.ts
tests/unit/agent/recovery.test.ts
tests/unit/agent/runtime-cancellation.test.ts
tests/unit/agent/runtime-tools.test.ts
```

### 操作

1. 任意 store append/read/inspect error 进入最高优先级持久化故障路径。
2. `EVENT_COMMIT_UNCERTAIN` 后立即 abort，禁止同 draft 重试、禁止补 run.failed、禁止工具 replay。
3. 其他 run.started 后 storage error 同样 reject completion，留 open run 给恢复 interrupted。
4. terminal event 提交失败时 completion reject，不 resolve 伪 outcome。
5. approval.resolved、tool.started、tool.result 各位置故障验证无额外副作用。
6. 下一次 runtime 实例重新读取磁盘，按实际已提交/未提交情况投影并 interrupted。
7. finally 清理 timer、external listener、sink、continuation、workspace、prepared、pending、authorization 和 registry。
8. 清理函数幂等，不删除 JSONL、Session 或用户工作区文件。

### 最小测试

- run.started、user.message、model.requested/completed、approval.resolved、tool.started/result、terminal 每类代表性 append 故障。
- commit uncertain 同一 draft 调用次数始终 1。
- started 不确定后 executor 调用次数 0；result 不确定后工具调用不重复。
- completion reject 后 active registry 释放。
- 新实例 recover 追加一次 interrupted。
- timer/listener/pending resolver 无泄漏。
- `pnpm exec vitest run tests/unit/agent/recovery.test.ts tests/unit/agent/runtime-cancellation.test.ts tests/unit/agent/runtime-tools.test.ts`。

### 完成条件

- 存储事实不确定时安全停止而非猜测。
- 不产生重复副作用或虚假 terminal。
- 所有进程内 capability 清理。

### 覆盖

- FR-007/008。
- NFR-003/006。
- SEC-005/006/008。

## 16. T09-11：公共 barrel、封装和安全收口

### 输入

- Spec 第 10、22、25、26、29 节。
- T09-01～T09-10 完整实现。

### 涉及文件

```text
lib/agent/index.ts
lib/agent/types.ts
lib/agent/runtime.ts
tests/unit/agent/public-api.test.ts
tests/unit/agent/security.test.ts
```

### 操作

1. `index.ts` 只导出：
   - runtime factory。
   - 批准的 Schema、限制和错误码。
   - `AgentLayerError`。
   - AgentRuntime、request、controls、handle、outcome、snapshot、context provider 和审批公共类型。
2. 不导出 active state、projector mutable state、append helper、stream redactor 状态、prepared/pending/authorization、tool gateway adapter 或 dependency overrides。
3. 源码扫描禁止：
   - React/Next/browser API。
   - Agent framework/SDK。
   - 直接 fs/spawn/raw executor。
   - 环境 API Key 读取。
   - reasoning/raw continuation 反射。
4. 检查 event/snapshot/error JSON 不含 capability、stack、cause、API Key 或真实敏感哨兵。
5. 检查测试只使用临时数据根和临时工作区。
6. 检查阶段 03–08、配置、依赖和 app 无差异。

### 最小测试

- public export 精确白名单和 forbidden symbol。
- public type/runtime 可从 `@/lib/agent` 使用。
- dependency/import 源码扫描。
- secrets/capabilities/reasoning 哨兵扫描。
- `pnpm exec vitest run tests/unit/agent/public-api.test.ts tests/unit/agent/security.test.ts`。
- `pnpm lint`。
- `pnpm typecheck`。

### 完成条件

- 阶段 10/11 只需依赖公共 barrel。
- 无安全能力或内部依赖泄露。
- 无禁止路径变化和新依赖。

### 覆盖

- FR-004–010。
- NFR-002/003/006。
- SEC-001–008。
- COM-001/003。

## 17. T09-12：全量验证、差异审查与反思修正

### 输入

- T09-01～T09-11 全部产物和每步失败记录。
- 实施前 baseline。

### 操作

1. 运行 Agent 精确测试：

```text
pnpm exec vitest run tests/unit/agent
```

2. 运行全仓门禁：

```text
pnpm test
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

3. 检查所有 Task 测试点均有用例，不以文件存在代替行为证据。
4. 对照 Spec 第 28 节 14 项验收标准逐项确认。
5. 对照文件白名单检查新增/修改/删除路径。
6. 检查 package/lock/config/app/阶段 03–08 源码无差异。
7. 检查仓库根没有测试遗留 `.secode-data` 或未登记临时目录。
8. 检查常见 key/Bearer 模式、private reasoning、capability 名称没有进入事件 fixture 或公开产物。
9. 复盘所有失败：症状、原因、修正、重跑范围和最终结果。
10. 只允许在已批准文件和接口内修正；若需改变公共设计，停止并回到 Spec。

### 完成条件

- Agent 精确测试全部通过。
- 全仓测试、lint、typecheck、build、diff check 全部通过。
- 0 lint warning。
- 无越界文件、依赖变化、秘密或真实用户数据。
- 所有修正未降低断言、删除用例或跳过失败。

### 覆盖

- 本阶段全部 FR/NFR/SEC/COM。

## 18. T09-13：Summary、索引与用户审批门禁

### 输入

- 已批准 Spec、Task。
- T09-00～T09-12 的真实实现、命令输出、失败和修正记录。

### 涉及文件

```text
docs/development/09-agent-state-machine-summary.md
docs/development/09-agent-state-machine-tasks.md
docs/development/README.md
```

### 操作

1. 将本 Task 的完成状态逐项更新，但不改写批准范围。
2. 生成 Summary，至少包含：
   - Spec/Task 审批链。
   - 每项任务完成情况。
   - 详细开发过程和关键状态机语义。
   - 新增、修改、删除文件。
   - 每条验证命令和真实结果。
   - 失败、诊断、修正和重新验证。
   - Spec/Task 一致性与偏差。
   - 安全检查、已知限制、反思和阶段 10 影响。
3. 更新开发索引为“阶段 09 Summary 待用户审批”。
4. 执行文档链接、围栏、空白、白名单和 `git diff --check`。
5. 立即停止，不开始阶段 10 观察。

### 完成条件

- Summary 如实反映全部开发过程。
- 通用内部门禁全部通过。
- 用户批准前阶段 09 仍未正式完成。

### 覆盖

- NFR-008。

## 19. 需求—任务追踪矩阵

| 需求 | 主要任务 | 关键证据 |
| --- | --- | --- |
| FR-003 | T09-06/07 | 六工具计划、gateway、串行执行测试 |
| FR-004 | T09-02/05/06/09 | projector、模型—工具闭环、限制测试 |
| FR-005 | T09-02/03/05/06/07 | durable/live 事件和状态快照 |
| FR-006 | T09-02/07/08 | approval 生命周期和等待取消 |
| FR-007 | T09-04/08/10 | linked Abort、各等待位置和清理 |
| FR-008 | T09-02/04/10 | 分页投影、interrupted、commit uncertainty |
| FR-009 | T09-04/05 | 固定 profile preflight 与模型请求 |
| FR-010 | T09-01/02/05 | context port、compaction draft 单点追加 |
| NFR-002 | T09-01/02/07/11 | strict Schema、业务不变量、公共 API |
| NFR-003 | T09-01～T09-11 | 错误映射与失败路径 |
| NFR-004 | T09-01/08/09 | 30 轮、10 分钟、边界测试 |
| NFR-005 | T09-05/06 | 复用模型和工具既有限制 |
| NFR-006 | T09-00/01/11/12 | Node-only、扫描、全仓验证 |
| NFR-008 | T09-00/12/13 | 文档、命令和审批证据 |
| SEC-001/002 | T09-04/06/11 | workspace handle 重建与工具边界 |
| SEC-003/004/005 | T09-06/07/11 | gateway 唯一执行路径 |
| SEC-006 | T09-01/03/04/11/12 | prompt/delta/event/error 脱敏与扫描 |
| SEC-007 | T09-06 | 工具层 hash 契约不被 Agent 绕过 |
| SEC-008 | T09-04/10/12 | 单进程、commit uncertainty、已知限制 |
| COM-001/003 | T09-00/11/12 | 自研实现、依赖和源码扫描 |

## 20. 测试策略总表

| 层次 | 使用对象 | 禁止对象 | 主要验证 |
| --- | --- | --- | --- |
| 纯单元 | Schema、projector、redactor、canonical signature | 磁盘、网络、真实时间 | 不变量和精确边界 |
| runtime 单元 | temp store/workspace、fake model/context、真实公共 gateway 或薄适配器 | 用户目录、真实凭据、真实网络 | 模型/工具/审批/取消闭环 |
| 故障注入 | fake store/sink/timer/adapter | 模糊 sleep、随机网络故障 | 不确定提交和资源清理 |
| 全仓回归 | 现有 Vitest、lint、typecheck、build | 跳过/降级断言 | 不破坏阶段 03–08 和 Next 基线 |

阶段 09 不执行：

- Playwright 产品 E2E。
- 真实 DeepSeek/LongCat 请求。
- 真实用户项目修改。
- 人工终端聊天。
- context token/压缩算法测试。

这些分别留到阶段 10–14。

## 21. 失败处理和回退策略

### 21.1 实现失败

- 先记录失败命令、错误、触发输入和当前任务。
- 只修改当前或此前已批准的 Agent 白名单文件。
- 修正后重跑最小测试，再重跑所有受影响 Agent 测试。
- 不删除测试、不降低断言、不添加永久 skip。

### 21.2 规格冲突

以下任一情况立即停止，Task 审批失效，回到 Spec 修订：

- 需要修改阶段 03–08 公共协议。
- 需要新增 durable/live event 或改变 JSONL 格式。
- 需要改变 prompt 脱敏、审批、取消、提交不确定或工具执行安全语义。
- 需要引入 Next.js、React、浏览器、Agent framework 或新依赖。
- 需要提前实现真实上下文、终端、API 或 UI。

### 21.3 任务冲突

若只需调整文件位置、任务顺序或局部实现分工但仍满足 Spec，停止实现、修订本 Task 并重新等待 Task 批准。

### 21.4 工作树保护

- 不使用 `git reset --hard`、`git checkout --` 或递归删除。
- 不覆盖阶段 07/08 和用户已有修改。
- 回退只通过精确 `apply_patch` 处理本阶段登记文件。
- 临时目录只删除测试 helper 明确登记的目标。

## 22. 明确不执行的工作

- 不实现阶段 10 的历史选择、token 估算、75% 压缩和摘要生成。
- 不创建 CLI/TTY，不提供人工交互入口。
- 不调用真实模型，不读取真实 API Key。
- 不创建 Route Handler、Server Action、NDJSON HTTP 或浏览器状态。
- 不创建或修改 React/Tailwind/Markdown/UI/Playwright 产品用例。
- 不改动 Git 历史，不 commit、push、发布或部署。
- 不添加依赖，不修改 package/lock/config。
- 不实现多 Agent、多进程锁、容器沙箱或后台队列。
- 不修复与本阶段无关的既有代码或文档差异。

## 23. 实施阶段逐项门禁

每开始一个任务前确认：

- [ ] Spec 和 Task 仍为已批准且未被修订取代。
- [ ] 当前任务的所有前置任务已通过最小验证。
- [ ] 计划修改文件位于白名单。
- [ ] 不需要新的公共接口或安全决策。
- [ ] Git 既有修改已识别并保留。

每完成一个任务后确认：

- [ ] 任务输出和完成条件全部满足。
- [ ] 对应最小测试和 typecheck/lint 要求通过。
- [ ] 失败与修正已登记给 Summary。
- [ ] 未开始下一阶段能力。

## 24. Task 内部门禁

- [x] 已链接已批准 Spec 并记录审批日期。
- [x] 已按依赖顺序拆分 T09-00～T09-13。
- [x] 每项任务包含输入、操作、文件、测试、完成条件和需求覆盖。
- [x] 已锁定生产、测试、文档白名单和禁止路径。
- [x] 已覆盖 Spec 的 runtime、projector、恢复、模型、工具、审批、取消、限制、提交和安全语义。
- [x] 已定义全量验证、失败处理、回退和重新审批条件。
- [x] 已明确不实现上下文算法、终端、API 和 UI。
- [x] 未创建或修改任何 Agent 实现和测试文件。
- [x] 未生成阶段 09 Summary。

**Task 内部门禁：通过。当前状态：已批准。**

## 25. 用户审批记录

- 当前审批结果：用户已于 2026-08-27 批准阶段 09 Task。
- 本次批准解锁：严格按 T09-00～T09-13 顺序实施，并在结束时生成 Summary。
- 当前仍禁止：任何超出白名单的实现、阶段 10 上下文算法、终端、API 或 UI。
- 用户要求修订时：只修改本 Task 和开发索引，修订后重新等待审批。

## 26. 实施完成记录

- 实施日期：2026-08-27
- 实施范围：严格限定于第 4 节白名单；未修改阶段 03–08 源码、`app/**`、依赖或工程配置。
- 实施结果：T09-00～T09-12 已按顺序完成，T09-13 已生成 Summary 并进入用户审批门禁。

| 任务 | 状态 | 实际结果 |
| --- | --- | --- |
| T09-00 基线与范围复核 | 已完成 | 实施前 41 files / 408 tests，lint、typecheck 通过；识别并保留前序工作树内容 |
| T09-01 契约、Schema、错误与依赖 | 已完成 | 固定限制、16 个错误码、strict 输入与上下文 Schema、依赖端口 |
| T09-02 生命周期投影器 | 已完成 | 纯 durable event projector、完整运行不变量、连续工具错误状态 |
| T09-03 脱敏与事件管线 | 已完成 | 跨 chunk 脱敏、durable 先提交后发布、live delta 序列和 sink 隔离 |
| T09-04 恢复与运行骨架 | 已完成 | 分页恢复、单次 interrupted、Session 互斥、workspace/model preflight |
| T09-05 模型循环与文本完成 | 已完成 | context 端口、compaction 事实、continuation、final/completed 路径 |
| T09-06 工具计划与执行 | 已完成 | 全量 requested 后严格串行、错误归一化、gateway 唯一执行路径 |
| T09-07 审批等待与决定 | 已完成 | 单 pending、批准/拒绝顺序、一次性能力、错误决定零副作用 |
| T09-08 取消、超时与 sink 断开 | 已完成 | linked abort、单终态竞争、model/tool/approval 等待取消 |
| T09-09 运行限制 | 已完成 | 30/31 轮边界、canonical signature、第三次相同工具错误终止 |
| T09-10 durable 故障与清理 | 已完成 | 不确定提交安全停止、无重复副作用、恢复 interrupted、资源释放 |
| T09-11 公共 API 与安全收口 | 已完成 | 最小 barrel、无框架/环境密钥/raw executor/capability 泄露 |
| T09-12 全量验证与反思修正 | 已完成 | Agent 11 files / 85 tests；全仓 52 files / 493 tests；全部质量门禁通过 |
| T09-13 Summary 与审批门禁 | 已完成，待审批 | 已生成阶段 Summary；阶段 10 仍未解锁 |

详细实现、验证、失败与修正证据见 [09-agent-state-machine-summary.md](./09-agent-state-machine-summary.md)。
