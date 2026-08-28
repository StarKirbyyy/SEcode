# 阶段 10 Summary：上下文管理

## 1. 文档状态与审批链

- 当前状态：已批准
- 完成日期：2026-08-28
- 已批准 Spec：[10-context-management-spec.md](./10-context-management-spec.md)
- 已批准 Task：[10-context-management-tasks.md](./10-context-management-tasks.md)
- Spec 审批：用户于 2026-08-28 批准
- Task 审批：用户于 2026-08-28 批准
- Summary 审批：用户于 2026-08-28 批准
- 当前门禁：阶段 11 只读观察与 Spec 已解锁；阶段 11 Task 和实现仍需后续独立审批

审批链：

```text
阶段 10 Spec（已批准）
  → 阶段 10 Task（已批准）
  → T10-00～T10-11（已完成）
  → T10-12 本 Summary（已批准）
  → 阶段 11 只读观察与 Spec（已解锁）
```

## 2. 完成结论

阶段 10 已实现事件驱动的生产 `AgentContextProvider`。它只读取 Session 元数据和 durable JSONL 事件，将完整 Agent 回合投影为模型消息，并在保守估算达到模型上下文窗口 75% 时生成可持久化的增量摘要。

最终形成：

- 11 个 `lib/context` 生产模块，共 1613 行。
- 9 个 Context 测试文件和 1 个测试 helper，共 1376 行。
- 9 个稳定 `CONTEXT_*` 错误码。
- 40 项 Context 精确测试全部通过。
- 全仓 61 个测试文件、533 项测试全部通过。
- lint 零 warning、typecheck、Next.js 16.3.3 生产 build 和差异检查全部通过。
- 未修改阶段 03–09 源码、`app/**`、依赖、lockfile、配置或环境文件。

生产路径如下：

```text
AgentRuntime buildContext
  → 读取 Session 固定 workspace / model profile
  → 每页 1000 条读取 durable events
  → 校验并投影完整 final / tool rounds
  → system policy + memory + 历史消息
  → 2 UTF-8 bytes/token 保守估算（含六工具定义）
  ├── < 75% → 直接返回 messages
  └── >= 75%
        → 保留最近至少 8 个完整回合
        → 当前模型、tools: [] 生成摘要
        → 重估通过后返回 messages + compaction draft
        → AgentRuntime 先追加 context.compacted，再请求业务模型
```

Provider 本身没有 append、文件读取、命令执行、网络请求或环境变量能力。原始 JSONL 永久不删改；重启后从最新 `context.compacted` 恢复摘要和保留范围。

## 3. 实际任务完成情况

| 任务 | 状态 | 实际产物 | 验证证据 |
| --- | --- | --- | --- |
| T10-00 基线与范围复核 | 已完成 | 基线、白名单、Next 本地指南和既有工作树登记 | 52 files / 493 tests；lint、typecheck 通过 |
| T10-01 契约、Schema 与错误 | 已完成 | 常量、9 错误码、只读事件端口、strict summary 边界 | Schema、错误脱敏和 factory 测试 |
| T10-02 system prompt 与估算 | 已完成 | 固定策略、工作区 memory、canonical JSON、保守估算 | 多字节、overhead、75% 和安全整数测试 |
| T10-03 durable history 投影 | 已完成 | final/tool round、approval、错误和终态 diagnostic 投影 | 合法/非法历史、原子多工具和确定性测试 |
| T10-04 消息渲染 | 已完成 | system/memory/goal/assistant/tool 的稳定映射 | `ChatMessageSchema`、配对、脱敏和冻结测试 |
| T10-05 基础 Provider | 已完成 | 元数据、分页、profile 校验和低预算快路径 | 首轮、分页、无进展和只读测试 |
| T10-06 压缩选择 | 已完成 | 最旧连续前缀、最近 8 回合硬保留和稳定 range | 75% 精确边界、原子前缀和超窗失败测试 |
| T10-07 摘要生成 | 已完成 | 当前 Session 模型、固定 policy、严格 v1 envelope | tools 空、无 continuation、脱敏和故障映射测试 |
| T10-08 摘要恢复 | 已完成 | durable summary 复用、实际摘要后重估和 draft | 同/新 Provider 实例恢复、JSONL bytes 不变测试 |
| T10-09 取消与故障 | 已完成 | 分页/摘要 signal 检查和有限错误映射 | 预取消、摘要取消、运行时读取中取消和单终态测试 |
| T10-10 Runtime/公共 API/安全 | 已完成 | 最小 barrel、production AgentRuntime 接线和源码扫描 | final、tool、compaction、failure 集成轨迹 |
| T10-11 全量验证与反思 | 已完成 | 全仓门禁、白名单、残留和敏感内容审计 | 40 context tests；533 full tests；全部门禁通过 |
| T10-12 Summary 与审批门禁 | 已完成，已批准 | 本 Summary、Task 完成记录和索引 | 用户于 2026-08-28 批准，阶段 11 观察已解锁 |

任务按批准顺序实施，没有进入终端、真实模型、HTTP 或 UI 工作。

## 4. 关键实现说明

### 4.1 契约和错误边界

`types.ts` 固定了已批准的全部参数：协议版本 1、75% 输入预算、最近 8 个回合、每页 1000 事件、2 UTF-8 bytes/token、每消息 8 token、每请求 32 token、摘要目标 12.5%、摘要最多 65536 字符和最多 16 个置顶 diagnostic。

`ContextEventSource` 只暴露 `getSessionMetadata()` 与 `readEvents()`。它在类型层无法 append、repair 或恢复执行 capability。`createAgentContextProvider()` 手工检查这两个只读方法和 `ModelClient` 必需方法，不尝试序列化 AbortSignal 或模型能力对象。

9 个错误码区分输入、Session、模型配置、历史、预算、摘要调用、摘要内容、取消和内部故障。公开 details 采用字段白名单，只保留 profile/run/iteration/seq/计数/预算等有限信息；cause 不可枚举，不进入 JSON、事件或 UI。

### 4.2 固定系统策略与工作区 memory

业务模型每次都收到两个 system message：

1. 固定版本的编程 Agent 策略，要求只依据用户目标和已提交工具事实工作。
2. 当前 workspace、初始目标、最新 durable summary、有限 unresolved diagnostic 和当前目标说明。

历史 summary、工具输出和仓库文本被明确标记为不可信数据，不能覆盖 system policy。动态 workspace、目标、工具结果、diagnostic 和摘要在进入消息前再次脱敏。初始目标与当前目标相同时只在 memory 标记相同，完整当前目标仍作为 user message 发送。

### 4.3 Durable 历史投影

`history-projector.ts` 逐序号消费事件，验证 Session 一致性、run 不重叠、model requested/completed 配对、iteration 连续、assistant 位置、toolCallId 归属、approval 关联、tool result 和 compaction 单调范围。

只有完整回合进入模型历史：

- final 回合：`model.requested → model.completed(stop) → assistant.message(final)`。
- 工具回合：assistant optional content、全部 `tool.requested` 和全部 `tool.result` 作为一个原子单位。

被取消、失败或中断的完整旧回合仍可保留；不完整尾部不会伪造 orphan tool message，只形成有限 diagnostic。失败工具按 `toolName + canonical publicArguments + error.code` 追踪，同签名成功会清除对应错误。

### 4.4 ChatMessage 渲染

渲染顺序固定为 system policy、context memory、各保留 run 的 user goal、完整 assistant/tool 回合、当前 user goal。每个工具 assistant 的 toolCalls 与后续 tool messages 在数量、ID、名称和顺序上一一对应。

工具消息只包含公开 arguments 截断标记、公开 `ToolResult` 和可选 approval 注解，不恢复 prepared invocation、authorization、原始参数或 continuation。消息数组经过 `ChatMessageSchema` 校验并递归冻结，可直接传给阶段 04 `ModelClient`。

### 4.5 Token 估算与 75% 边界

估算器先按 key 排序生成 canonical JSON，保持数组顺序；文本 token 数为 `ceil(UTF-8 bytes / 2)`。总量包含：

```text
每条完整 ChatMessage JSON
  + 每消息固定 8 token
  + 六个 ToolDefinition JSON
  + 每请求固定 32 token
```

输入预算为 `floor(contextWindow × 0.75)`。估算小于预算时不压缩；恰好等于预算时触发压缩。所有加法和窗口计算检查正安全整数，溢出或极小窗口结构化失败。

### 4.6 完整回合压缩

Selector 是无 I/O、模型、时间或随机依赖的纯函数。它只能从最老完整回合选择连续前缀，不跳过中间回合，也不拆 assistant/tool 配对。

始终硬保留：

- workspace、初始目标和完整当前目标。
- 最近至少 8 个完整回合。
- 保留回合所属 run 的目标。
- 最新 durable summary。
- 最近 16 个未解决 diagnostic，并记录更早条目数量。

`throughSeq` 固定为首个保留回合 `startSeq - 1`；`retainedRange.toSeq` 固定为本次稳定历史的 `lastSeq`。若没有可压缩回合，或硬保留集加摘要目标仍超过预算，则 `CONTEXT_BUDGET_EXCEEDED`，不截断当前目标或工具回合。

### 4.7 当前模型驱动的摘要

摘要请求使用 Session 固定 profile、固定 system policy 和 canonical transcript user message，始终传 `tools: []` 和原始 AbortSignal，不传 continuation、thinking、delta callback 或工具能力，也不计入 Agent iteration。

transcript 包含 previous summary、被压缩回合、相关 run goals、已压缩范围内 diagnostic、throughSeq 和目标 token。摘要只接受 `finishReason=stop`、零 toolCalls、非空文本；输出先脱敏，再验证字符和 token 上限，最终包裹：

```text
SECODE_CONTEXT_SUMMARY_V1
<中文结构化摘要>
```

模型异常映射为 `CONTEXT_SUMMARY_FAILED`，非法输出映射为 `CONTEXT_SUMMARY_INVALID`。摘要请求本身超出 75% 时零模型调用并失败，不递归 map-reduce。

### 4.8 Durable 恢复与事件所有权

Provider 生成 compaction draft，但不写事件。阶段 09 AgentRuntime 先把 draft 追加为 `context.compacted`，再追加下一次 `model.requested`。这保持 JSONL 为单一事实源和单一写入所有者。

后续 build 分页读到最新 compaction 后，只回放其 retained range，并把 summary 放入 memory。新 Provider 实例得到相同消息且不会重复调用摘要模型。历史继续增长后，selector 只能从旧 `throughSeq` 之后选择新的连续前缀；原始 JSONL 不删除、不重写。

直接 Provider 测试对 build 前后的 `events.jsonl` bytes 和事件数做了相等断言，确认读取路径无 durable 副作用。

### 4.9 取消与 AgentRuntime 集成

Provider 在读取前、每页读取后、历史投影后、摘要调用前后及最终返回前的 await 边界检查同一 signal。预取消不会调用 storage 或 model；分页中取消在当前只读调用返回后立即停止；摘要取消沿原始 signal 结束。

生产集成测试使用临时 JSONL store、合成 workspace、fake ModelClient、生产 Context Provider 和生产 AgentRuntime，覆盖：

- 新 Session 首轮文本完成。
- `read_file` 工具执行后，下一轮收到完整 assistant/tool 历史。
- 长历史先提交 `context.compacted`，再发起业务模型请求。
- 上下文读取期间用户取消，只生成一个 `run.cancelled`。
- 普通上下文故障只生成一个 `run.failed(AGENT_CONTEXT_FAILED)`，内部原因不落盘。

### 4.10 公共 API 与安全边界

`@/lib/context` 只导出 factory、`ContextLayerError`、批准常量、错误码和装配所需类型。projector、renderer、selector、summary generator、prompt builder 和 fake dependencies 均保持内部实现。

源码测试扫描生产模块，禁止 Next/React/browser、Agent framework/SDK、直接 fs/child_process/fetch、`process.env`、append、raw executor、approval capability、private reasoning 和 continuation 反射。生产代码没有真实 Key 形状；测试只使用显式假 secret 验证脱敏。

## 5. 实际文件变更

### 5.1 新增生产文件

```text
lib/context/compaction.ts
lib/context/errors.ts
lib/context/history-projector.ts
lib/context/index.ts
lib/context/message-renderer.ts
lib/context/provider.ts
lib/context/schemas.ts
lib/context/summary-generator.ts
lib/context/system-prompt.ts
lib/context/token-estimator.ts
lib/context/types.ts
```

### 5.2 新增测试文件

```text
tests/unit/context/compaction.test.ts
tests/unit/context/helpers.ts
tests/unit/context/history-projector.test.ts
tests/unit/context/provider.test.ts
tests/unit/context/public-api.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/context/schemas.test.ts
tests/unit/context/security.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/context/token-estimator.test.ts
```

### 5.3 文档变更

```text
docs/development/10-context-management-tasks.md
docs/development/10-context-management-summary.md
docs/development/README.md
```

阶段 10 Spec 只在实现前记录用户审批，开发过程未反向修改已批准设计。没有删除文件。工作树中的阶段 07 Summary、阶段 08/09文档、源码和测试是进入本阶段前已有成果，本阶段没有覆盖或清理。

## 6. 验证结果

### 6.1 实施前基线

```text
pnpm test
  Test Files  52 passed (52)
  Tests       493 passed (493)

pnpm lint
  通过，0 warning

pnpm typecheck
  通过
```

### 6.2 Context 精确测试

```text
pnpm exec vitest run tests/unit/context
  Test Files  9 passed (9)
  Tests       40 passed (40)
```

覆盖契约、错误、固定 prompt、估算、75% 精确边界、history、消息配对、压缩选择、摘要、恢复、取消、runtime 接线、公开 API 和安全扫描。

### 6.3 全仓最终门禁

```text
pnpm test
  Test Files  61 passed (61)
  Tests       533 passed (533)

pnpm lint
  通过，0 warning

pnpm typecheck
  通过

pnpm build
  Next.js 16.3.3 (Turbopack)
  Compiled successfully
  TypeScript 通过
  4/4 static pages 生成成功

git diff --check
  通过
```

### 6.4 白名单与残留审计

- `lib/context` 恰好 11 个批准生产文件。
- `tests/unit/context` 恰好 10 个批准文件，其中 9 个为 Vitest 文件、1 个为 helper。
- package、lockfile、配置、环境、`app/**` 和阶段 03–09 源码无本阶段差异。
- 未发现 `.secode-data`、`secode-context-*` 临时目录或真实用户项目 fixture。
- 未引入依赖、skip、网络调用、真实模型凭据或真实项目访问。
- 未执行 commit、push、发布或部署。

## 7. 开发中失败、原因与修正

### 7.1 预算字段被通用脱敏器误判

- 症状：错误详情中的 `inputBudgetTokens` 被移除，Schema 测试失败。
- 原因：通用敏感 key 规则把包含 `token` 的预算计数字段也视为凭据。
- 修正：Context 错误 details 改为批准字段显式白名单；字符串仍脱敏，数字只接受有限值。
- 结果：错误结构测试、typecheck 和后续全量门禁通过。

### 7.2 `session.created` 测试 helper 意外携带 runId

- 症状：多个 history 投影测试在第一个事件即失败。
- 原因：helper 的默认参数把显式 `undefined` 重新解释成默认 runId。
- 修正：用 `null` 作为“无 runId”的测试专用哨兵，再由 helper 省略字段。
- 结果：Session 起点协议恢复正确。

### 7.3 中断 diagnostic 被新 active run 隐藏

- 症状：旧 run 中断后创建新 active run，预期 diagnostic 缺失。
- 原因：投影器只检查最后一个 run，而不是最后一个已有终态的 run。
- 修正：反向查找最新 terminal，并与最后 completed run 的位置比较。
- 结果：不完整中断尾部不伪造工具消息，同时 diagnostic 可见。

### 7.4 压缩测试错误假设必须恰好保留 8 回合

- 症状：Selector 合法保留 9 回合时测试失败。
- 原因：规格规定“至少保留最近 8 回合”，算法还需满足 12.5% 摘要目标和整体预算，不承诺恰好 8。
- 修正：断言改为 `>= 8`，并继续检查最旧连续前缀、range 和原子性。
- 结果：测试与批准语义一致，没有为了通过测试扩大压缩范围。

### 7.5 测试 fixture 的静态类型边界

- 症状：fake event source、mock completion 和 compaction draft 写入测试事件时出现 TypeScript 错误。
- 原因：运行时 draft 与 durable event 数据虽字段等价，但前者没有 JSON 索引签名；测试 mock 也需要精确遵循联合类型。
- 修正：在测试中显式映射 `throughSeq/summary/retainedRange`，补齐联合类型缩窄和确定的 runId。
- 结果：没有放宽生产 Schema 或使用不安全 cast，typecheck 通过。

### 7.6 Runtime 集成测试 lint warning

- 症状：一个未使用形参和未缩窄的 `toolCalls` 访问导致 warning/type error。
- 原因：测试先验证了运行行为，再暴露静态质量问题。
- 修正：删除无用形参，以 `role + in` 缩窄 ChatMessage 联合。
- 结果：lint 恢复 0 warning，行为测试仍通过。

所有失败均在阶段 10 白名单内修正；没有删除测试、降低安全断言、增加 skip 或修改已批准 Spec。

## 8. 规格一致性核销

- [x] Provider 可直接注入生产 AgentRuntime。
- [x] 首轮包含固定系统约束、工作区和完整当前目标。
- [x] final、多工具和 approval 历史映射为合法有序 ChatMessage。
- [x] 工具 assistant/result 在分页和压缩中保持原子配对。
- [x] 估算包含消息、六工具定义和固定开销，恰好 75% 触发。
- [x] 低于阈值不调用摘要模型、不返回 compaction。
- [x] 保留初始/当前目标、最近至少 8 回合和 unresolved diagnostic。
- [x] 摘要使用 Session 固定模型，且无工具、continuation、thinking 或 delta。
- [x] 最新 durable summary 可由新 Provider 实例恢复，不重复摘要旧前缀。
- [x] compaction draft 指向稳定连续历史。
- [x] direct build 不 append，不改变 JSONL bytes 或事件数。
- [x] 取消、预算、非法历史和摘要故障结构化终止，无半成品。
- [x] prompt、tool content、diagnostic、summary 和错误均执行有限脱敏。
- [x] 未修改阶段 03–09源码、app、依赖或配置。
- [x] Context 精确测试及全仓 test/lint/typecheck/build/diff check 通过。
- [x] 本 Summary 提交审批时尚未开始阶段 11；获批后才进入下一阶段观察。

## 9. 安全复核

- Provider 持有读取端口，不能写 JSONL 或执行工具。
- 工作区只作为脱敏后的 system memory；Context 层不直接访问工作区文件。
- 只使用 durable public arguments 和 ToolResult，不恢复 opaque capability。
- 摘要请求关闭工具，历史数据明确标记为不可信。
- private reasoning、reasoning token 和 continuation 不进入 memory、事件或错误。
- 错误 cause、stack、原始路径、prompt、工具输出和 secret 不公开。
- 所有测试在临时 data root 与合成 workspace 内运行，并精确清理。
- 当前边界仍是可信本地单用户应用级边界，不是恶意代码的 OS 沙箱。

## 10. 反思与已知限制

### 10.1 75% off-by-one

实现使用严格 `< inputBudgetTokens` 作为快路径，因此恰好等于 75% 必然进入压缩。新增测试根据实际估算反推精确窗口，同时验证预算多 1 token 时不压缩，避免边界比较回归。

### 10.2 最近 8 回合是下界

Selector 会尽早找到可容纳目标摘要的最小连续压缩前缀，因此可能保留 8 个以上回合。把规则理解为“必须恰好 8”会无谓丢失上下文；测试已经按硬下界修正。

### 10.3 摘要是记忆，不是事实源

模型可能遗漏或误述旧信息。原始 JSONL 永久保留，最近回合和当前目标保持原文，摘要被标记为 untrusted memory。未来若需要可验证结构化摘要或独立摘要审计事件，必须另立 Spec。

### 10.4 取消不能中断任意自定义只读端口内部阻塞

`ContextEventSource.readEvents()` 的阶段 08 接口没有 signal 参数，因此 Provider 能在 await 前后检查取消，但不能强制终止一个不返回的自定义实现。生产 JSONL 读取是有限本地 I/O；若未来引入远端 storage，需要升级端口并重新审批。

### 10.5 全历史读取为 O(n)

每轮为确定初始目标、最新 compaction 和 unresolved error 都扫描完整事件历史。首版优先确定性与重启恢复；checkpoint、索引或缓存会引入新的事实一致性问题，不在本阶段添加。

### 10.6 无厂商 tokenizer

2 UTF-8 bytes/token 是保守启发式，不保证与 DeepSeek/LongCat 精确一致。75% 余量降低风险，但提供方仍可能拒绝病理输入；当前会可解释失败，不静默截断。

### 10.7 硬保留集超窗失败关闭

当前目标、最近 8 个大工具输出或摘要请求自身仍可能超窗。实现按规格返回 `CONTEXT_BUDGET_EXCEEDED`，不拆回合、不丢当前目标，也不递归摘要。

## 11. 对阶段 11 的固定影响

阶段 11 可交互终端应只通过公共 barrel 装配：

```text
createJsonlEventStore
  + createModelClient
  + createAgentContextProvider
  + createAgentRuntime
```

终端不得复制 history、token 或摘要算法，也不得直接修改 `context.compacted`。它应展示 durable 事件、工具结果、错误和 compaction，并通过现有 Runtime API 执行取消与审批。

阶段 11 Summary 获批后，基础人工 Agent 对话测试首次可用；真实 DeepSeek/LongCat 和完整核心验收仍属于阶段 12。

## 12. 用户审批项

请重点审阅：

1. 事件投影是否只把完整 final/tool round 发送给模型。
2. 75% 触发、最近至少 8 回合和 12.5% 摘要目标是否符合预期。
3. 摘要使用当前 Session 模型且无工具/continuation 的边界是否合适。
4. Provider 只读、Runtime 单点追加 compaction 的职责是否清晰。
5. 已知限制是否可以接受。
6. 是否批准阶段 10 Summary，从而只解锁阶段 11 的“观察并生成 Spec”。

用户已于 2026-08-28 明确批准本 Summary。阶段 10 正式完成，阶段 11 只读观察与 Spec 已解锁；阶段 11 Task 和实现仍需分别等待后续审批。
