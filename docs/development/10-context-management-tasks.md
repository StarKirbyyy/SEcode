# 阶段 10 Task：上下文管理

## 1. 文档状态与审批链

- 当前状态：已批准
- 生成日期：2026-08-28
- 已批准 Spec：[10-context-management-spec.md](./10-context-management-spec.md)
- Spec 审批记录：用户于 2026-08-28 明确批准
- Task 审批记录：用户于 2026-08-28 明确批准
- 当前允许：严格按本文顺序实施 T10-00～T10-12
- 当前禁止：超出白名单、改变已批准预算/摘要语义或进入阶段 11
- 下一步门禁：实现、验证和 Summary 完成后等待用户审批，批准前不得开始阶段 11

审批链：

```text
阶段 10 Spec（已批准）
  → 本 Task（已批准）
  → T10-00～T10-12（已解锁）
  → 阶段 10 Summary（实现完成后生成）
```

## 2. 任务目标

在不修改阶段 03–09 已批准协议、不引入依赖和不进入阶段 11–14 的前提下，实现事件驱动的生产 `AgentContextProvider`。

最终产物应具备：

- 固定版本的编程 Agent system prompt 和工作区段。
- durable event 到完整 model/tool round 的纯投影。
- provider-independent `ChatMessage[]` 渲染。
- 包含六工具定义开销的保守 token 估算。
- 75% 阈值和最近 8 完整回合硬保留。
- 当前 Session 模型驱动的增量摘要。
- durable compaction fact 的重启复用。
- 取消、非法历史、预算不足和摘要故障处理。
- 面向阶段 11 的最小 `@/lib/context` 公共入口。

## 3. 执行总顺序

```text
T10-00 基线与批准范围复核
  → T10-01 契约、Schema 与错误
  → T10-02 system prompt 与 token 估算
  → T10-03 durable history 回合投影
  → T10-04 ChatMessage 渲染与 diagnostic
  → T10-05 分页读取与基础 provider
  → T10-06 75% 压缩选择与 draft 边界
  → T10-07 模型摘要生成器
  → T10-08 provider 压缩、旧摘要与重启恢复
  → T10-09 取消、故障与资源收口
  → T10-10 AgentRuntime 集成、公共 API 与安全收口
  → T10-11 全量验证、差异审查与反思修正
  → T10-12 Summary 与用户审批门禁
```

所有任务按顺序执行。当前任务的最小验证失败时，不进入下一任务；需要改变 Spec 中的公共接口、安全策略、预算或摘要语义时立即停止并重新审批。

## 4. 文件白名单

### 4.1 生产文件

实现阶段只允许新增：

```text
lib/context/types.ts
lib/context/schemas.ts
lib/context/errors.ts
lib/context/system-prompt.ts
lib/context/token-estimator.ts
lib/context/history-projector.ts
lib/context/message-renderer.ts
lib/context/compaction.ts
lib/context/summary-generator.ts
lib/context/provider.ts
lib/context/index.ts
```

相较 Spec 第 21 节建议布局，本 Task 额外拆分三个纯内部职责文件：

- `system-prompt.ts`：隔离固定 prompt 版本和动态工作区渲染。
- `message-renderer.ts`：隔离事件投影到 ChatMessage 的纯映射。
- `compaction.ts`：隔离 75% 选择和序号计算。

该拆分不增加公共接口或阶段范围，避免 `provider.ts` 同时承担所有纯算法。

### 4.2 测试文件

实现阶段只允许新增：

```text
tests/unit/context/helpers.ts
tests/unit/context/schemas.test.ts
tests/unit/context/token-estimator.test.ts
tests/unit/context/history-projector.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/context/provider.test.ts
tests/unit/context/compaction.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/context/security.test.ts
tests/unit/context/public-api.test.ts
```

### 4.3 文档文件

允许修改：

```text
docs/development/10-context-management-spec.md
docs/development/10-context-management-tasks.md
docs/development/10-context-management-summary.md
docs/development/README.md
```

Spec 只能更新真实审批记录。实现发现需改变 Spec 时必须停止并重新审批，不能回写规格掩盖偏差。

### 4.4 明确禁止修改

```text
lib/domain/**
lib/model/**
lib/workspace/**
lib/tools/**
lib/approval/**
lib/storage/**
lib/agent/**
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

若实现确实需要修改任一禁止路径，立即停止并回到 Spec 修订，不以兼容或测试修复为由越界。

## 5. T10-00：实施前基线与批准范围复核

### 输入

- 已批准阶段 10 Spec。
- 阶段 00 流程、阶段 01 需求、阶段 03/04/06/08/09 Spec/Task/Summary。
- 当前 `AGENTS.md`、Git 状态、依赖和测试基线。

### 操作

1. 逐项对照 Spec 第 5–20、23、26 节和本 Task。
2. 记录实现前 `git status --short`，区分用户与前序阶段已有内容。
3. 确认 `lib/context`、`tests/unit/context` 尚不存在或只含本阶段登记文件。
4. 确认不需要 Next.js API。编码前按仓库 `AGENTS.md` 再核对本地 Next.js 16.3.3 TypeScript/项目结构指南；若出现 Next import 需求，停止并回到 Spec。
5. 运行实施前基线：

```text
pnpm test
pnpm lint
pnpm typecheck
```

6. 记录测试文件数、测试数、warning 和失败；不清理或改写既有工作树。
7. 检查 package/lock/config，确认阶段 10 不需要新依赖。

### 完成条件

- 基线全部通过；出现既有失败则停止并报告。
- 未创建生产或测试文件。
- 没有覆盖前序阶段内容。

### 覆盖

- NFR-006/008、COM-001/003。

## 6. T10-01：公共契约、strict Schema 与错误

### 涉及文件

```text
lib/context/types.ts
lib/context/schemas.ts
lib/context/errors.ts
tests/unit/context/helpers.ts
tests/unit/context/schemas.test.ts
```

### 操作

1. 固定 Spec 第 8 节全部常量和值。
2. 定义只含 `getSessionMetadata()`、`readEvents()` 的 `ContextEventSource`。
3. 定义 options、history/round/diagnostic/selection/summary 公共与内部类型。
4. 固定 9 个 `CONTEXT_*` 错误码和 recoverable 映射。
5. `ContextLayerError` 使用 `ErrorInfoSchema` 二次校验，cause 不可枚举。
6. 错误 details 只允许 profileId、runId、iteration、seq、计数和预算数字，并统一脱敏。
7. 为 summary transcript、v1 envelope、diagnostic 和最终结果边界建立 strict Schema。
8. factory options 含 capability，只做手工对象/必需方法验证，不放入 Zod/JSON。
9. helpers 提供 deterministic 事件、temp store、fake model/read source 和精确清理。

### 最小测试

- 常量、9 个错误码和 recoverable 表。
- strict payload/envelope 的额外 key、空内容、超限和错误版本拒绝。
- options 缺必需对象/方法时失败。
- 错误 JSON 无 stack、cause、prompt、path、tool output 或 secret。
- `pnpm exec vitest run tests/unit/context/schemas.test.ts`。
- `pnpm typecheck`。

### 完成条件

- 后续任务不需要临时改变类型或错误码。
- provider 类型在编译期不能调用 append/create/initialize。
- 没有 I/O、模型或环境读取。

### 覆盖

- FR-010、NFR-002/003/006、SEC-005/006。

## 7. T10-02：固定 system prompt 与 token 估算

### 涉及文件

```text
lib/context/system-prompt.ts
lib/context/token-estimator.ts
lib/context/types.ts
tests/unit/context/token-estimator.test.ts
tests/unit/context/security.test.ts
```

### 操作

1. 实现 fixed v1 system policy，覆盖 Spec 第 10 节八条语义。
2. 工作区段只接受 metadata 绝对路径，同时要求工具使用相对路径。
3. system/workspace/memory 拼装后脱敏，不允许外部覆盖 system prompt。
4. 纯文本估算固定为 `ceil(utf8Bytes / 2)`。
5. 计入 messages 稳定 JSON、每消息 8 token、请求 32 token 和六工具定义 JSON。
6. 输入预算固定 `floor(contextWindow × 0.75)`；恰好等于预算触发压缩。
7. 对 contextWindow、乘法和加法执行安全整数/溢出检查。
8. 不使用 usage、随机值、厂商 tokenizer 或缓存。

### 最小测试

- system policy 关键约束、版本和 workspace 脱敏。
- ASCII、中文、emoji、组合字符、空文本。
- message/tool/request overhead。
- 75% 前 1 token、恰好、超过。
- 极小/超大 contextWindow、溢出和重复调用确定性。
- `pnpm exec vitest run tests/unit/context/token-estimator.test.ts tests/unit/context/security.test.ts`。

### 完成条件

- token 选择完全确定且偏保守。
- 工具定义不会遗漏出预算。
- 无 tokenizer/SDK/新依赖。

### 覆盖

- FR-004/009/010、NFR-002/006、SEC-001/002/006、COM-003。

## 8. T10-03：durable history 与完整回合投影

### 涉及文件

```text
lib/context/history-projector.ts
lib/context/types.ts
lib/context/schemas.ts
tests/unit/context/history-projector.test.ts
tests/unit/context/helpers.ts
```

### 操作

1. 实现纯增量 projector，识别 run goal、model iteration、round、工具槽位、审批和 terminal。
2. stop 只有 final assistant 存在时 complete；tool_calls 只有全部 result 完成时 complete。
3. intermediate、publicArguments、ToolResult、approval annotation 和 seq 边界进入不可变 round。
4. failed/cancelled/interrupted 保留此前完整 rounds，不完整尾部只生成 diagnostic。
5. unresolved tool error 使用 toolName + error.code + canonical publicArguments；同签名 success 清除。
6. 后续 completed run 出现前保留最新非完成 Session terminal diagnostic。
7. compaction 必须 throughSeq 递增、from > through、to < event seq 且区间不倒退。
8. 识别 latest compaction、初始 goal、当前 goal 和 stable lastSeq。
9. 输出深冻结结构，不暴露 Map/Set。
10. 不复制 JSONL 字节解析和 Agent 副作用逻辑。

### 最小测试

- 单轮 final、多 run、多工具/intermediate。
- approved/rejected、invalid/unknown/policy denied。
- model/tool/approval 中间 failed/cancelled/interrupted。
- orphan/重复 ID、iteration 缺口、缺 goal、错误 final。
- unresolved 同签名清除和不同签名隔离。
- 多 compaction 单调、倒退和非法 range。
- 重复投影深相等且纯测试无磁盘/模型。
- `pnpm exec vitest run tests/unit/context/history-projector.test.ts`。
- `pnpm typecheck`。

### 完成条件

- ContextRound 成为唯一可压缩原子单元。
- 不完整工具片段不能变为不配对消息。
- 初始/当前 goal、diagnostic、latest compaction 可查询。

### 覆盖

- FR-004/008/010、NFR-002/003/006、SEC-003–007。

## 9. T10-04：ChatMessage 渲染与 diagnostic memory

### 涉及文件

```text
lib/context/message-renderer.ts
lib/context/system-prompt.ts
lib/context/types.ts
tests/unit/context/history-projector.test.ts
tests/unit/context/security.test.ts
```

### 操作

1. 按 Spec 第 14 节渲染 system、memory、历史 goal/round、当前 goal/round。
2. tool round 的 assistant 同时包含 optional content 和全部 toolCalls。
3. toolCalls 只使用 UUID、toolName、publicArguments，不猜测 raw arguments。
4. tool result 转为 canonical JSON content，含公开 result 和可选 approval annotation。
5. tool message 的数量、ID、name、顺序与 assistant toolCalls 一一对应。
6. final round 渲染普通 assistant content。
7. 不完整 terminal 只进入有限 diagnostic，不进入 tool role。
8. 初始/当前 goal 相同则去重；retained round 所属 run goal 在其前插入一次。
9. unresolved error 最多置顶 16 个，更多条目记录数量并交摘要处理。
10. 所有动态文本最终脱敏；数组通过 `ChatMessageSchema` 并深冻结。

### 最小测试

- system/workspace/goal/final 精确顺序。
- intermediate + 单/多 toolCalls + tool messages。
- approval annotation、canonical key 顺序和 argumentsTruncated。
- retained round 跨 run 补 goal 且不重复。
- terminal diagnostic 无 orphan tool。
- unresolved 16/17 边界。
- secret/reasoning/prepared/authorization 哨兵不出现。
- `ChatMessageSchema.array()` 全部通过。
- `pnpm exec vitest run tests/unit/context/history-projector.test.ts tests/unit/context/security.test.ts`。

### 完成条件

- 结果可直接传入 ModelClient。
- assistant/tool pairing 完整且顺序稳定。
- 不引入可执行能力或原始敏感参数。

### 覆盖

- FR-004/010、NFR-002/003、SEC-003–007。

## 10. T10-05：分页事件读取、profile 校验与基础 provider

### 涉及文件

```text
lib/context/provider.ts
lib/context/types.ts
lib/context/schemas.ts
tests/unit/context/provider.test.ts
tests/unit/context/helpers.ts
```

### 操作

1. 实现 `createAgentContextProvider()` 和 options 手工校验。
2. build 先检查 signal，再读取 metadata。
3. 使用 afterSeq=0、limit=1000 分页，逐页检查 signal。
4. 验证 Session/seq/lastSeq 连续、hasMore 进展和末页稳定。
5. 不调用 inspect/repair/append；source 编译期没有这些方法。
6. 从 ModelClient snapshot 取 metadata 固定 profile，要求存在、configured、contextWindow 合法。
7. 投影历史、渲染候选并估算。
8. 低于预算直接返回 `{ messages }`，零摘要调用、无 compaction。
9. 结果通过 `AgentContextResultSchema`，不保留影响结果的跨调用缓存。
10. store/profile 错误映射有限 ContextLayerError。

### 最小测试

- 新 Session 首轮含 system、workspace、完整当前 goal。
- 1、1000、1001、2001 条事件分页。
- afterSeq 推进、hasMore 无进展、seq/session/lastSeq 异常。
- profile 正常、缺失、未配置和小窗口。
- 低于阈值 model.complete 0 次、compaction undefined。
- 重复 build 深相等且不可变。
- source 不提供 append、事件数量不变。
- `pnpm exec vitest run tests/unit/context/provider.test.ts tests/unit/context/token-estimator.test.ts`。

### 完成条件

- 未压缩 provider 已可注入 AgentRuntime。
- 无隐式环境依赖。
- 低于阈值无额外模型成本。

### 覆盖

- FR-004/008/009/010、NFR-002–006、SEC-001/006/008。

## 11. T10-06：75% 压缩选择与 draft 边界

### 涉及文件

```text
lib/context/compaction.ts
lib/context/types.ts
tests/unit/context/compaction.test.ts
tests/unit/context/helpers.ts
```

### 操作

1. 实现纯 selector，输入 history、未压缩 messages、input budget 和 summary target。
2. estimate < budget 不压缩；estimate >= budget 触发。
3. 从最老完整 round 选择连续 prefix，不跳过中间 round。
4. 硬保留 workspace、初始 goal、当前完整 goal、最近 8 round、retained run goal、最新 summary 和 16 个 diagnostic。
5. run goal 随最后一个被压缩 round 进入摘要；仍有 retained round 时继续原文保留。
6. 按 summary target 扩大 prefix，直到 retained candidate 小于预算。
7. 固定 `throughSeq = retainedRange.fromSeq - 1`，toSeq=stable lastSeq。
8. 新 throughSeq 必须大于旧值，range 指向稳定连续历史。
9. 无可压缩 round、硬保留超限、summary request 超限或整数异常时 `CONTEXT_BUDGET_EXCEEDED`。
10. selector 不调用模型、store、时钟或随机值。

### 最小测试

- 75% 前 1 token、恰好、超过。
- 7/8/9/20 round 保留边界。
- 多工具 round 整体 prefix/retained。
- 当前/初始/retained run goal 保留。
- unresolved 16/17 的置顶与摘要输入。
- previous summary 只选择新增 prefix。
- throughSeq/fromSeq/toSeq 精确且单调。
- 无可压缩、超大当前 prompt、最近 8 大输出失败。
- 重复调用深相等且不修改输入。
- `pnpm exec vitest run tests/unit/context/compaction.test.ts`。

### 完成条件

- 算法可在无模型时精确验证。
- 不拆 assistant/tool pairing。
- 预算不足失败可解释且不静默丢信息。

### 覆盖

- FR-010、NFR-002/003/004、SEC-006、COM-003。

## 12. T10-07：当前模型驱动的摘要生成器

### 涉及文件

```text
lib/context/summary-generator.ts
lib/context/system-prompt.ts
lib/context/schemas.ts
lib/context/errors.ts
tests/unit/context/summary-generator.test.ts
tests/unit/context/helpers.ts
```

### 操作

1. 实现 summary policy v1，把历史作为不可信 canonical transcript。
2. payload 含 previousSummary、选中 rounds、goals、diagnostics、throughSeq、token target。
3. 摘要请求先估算小于 profile contextWindow 的 75%。
4. `ModelClient.complete()` 固定使用 Session profile、system+user、`tools: []`、原 signal，无 continuation/thinking/delta。
5. 不生成 Agent model 事件，不计 iteration。
6. 只接受 stop、零 toolCalls、trim 后非空 content。
7. 输出脱敏并包裹 `SECODE_CONTEXT_SUMMARY_V1`。
8. 验证 65536 字符和 input budget 12.5% token 上限。
9. 不截断非法摘要，不做无界重试或递归 map-reduce。
10. ModelLayerError → SUMMARY_FAILED；协议/大小 → SUMMARY_INVALID；cause 不公开。

### 最小测试

- profile、两 messages、tools 空数组和禁止字段缺失。
- previousSummary 与 round/diagnostic 稳定 payload。
- prompt injection 数据分隔不改变 policy。
- 合法 stop、v1 envelope。
- tool_calls、空白、字符/token 超限、secret 输出。
- auth/rate limit/timeout/protocol error 映射。
- 摘要请求超预算时模型调用 0 次。
- signal 传递且无悬挂 delta/listener。
- `pnpm exec vitest run tests/unit/context/summary-generator.test.ts tests/unit/context/security.test.ts`。

### 完成条件

- 摘要调用受 Agent signal 和固定 profile 控制。
- 输出可安全进入 `context.compacted.summary`。
- 无 hidden tools、continuation、thinking 或 reasoning。

### 覆盖

- FR-009/010、NFR-002–004/006、SEC-006/008、COM-003。

## 13. T10-08：provider 压缩、旧摘要与重启恢复

### 涉及文件

```text
lib/context/provider.ts
lib/context/message-renderer.ts
lib/context/compaction.ts
tests/unit/context/provider.test.ts
tests/unit/context/compaction.test.ts
tests/unit/context/runtime-integration.test.ts
```

### 操作

1. 达阈值时 selector → summary generator，单次 build 最多调用摘要一次。
2. 用实际 summary 重渲染和重估；仍超预算则失败，不返回 draft。
3. 返回唯一 messages + `{ throughSeq, summary, retainedRange }`。
4. provider 不 append；只有 runtime 集成测试允许 runtime 追加 draft。
5. 追加后新 build 读取 latest summary，从 retainedRange 继续。
6. 多 compaction 只用最新有效 summary，旧 prefix 不逐条回放。
7. 初始 goal/unresolved 从全历史重建并置顶。
8. 长度再次增长时只摘要旧 throughSeq 后的新连续 prefix。
9. 无新增可压缩内容时不重复生成等价 compaction。
10. direct build 前后事件数组和 `events.jsonl` bytes 完全不变。
11. 新 provider 实例无缓存恢复同一 context。

### 最小测试

- 首次越阈值摘要一次、draft seq 准确。
- runtime 追加后 build 复用 summary、摘要调用 0 次。
- 新实例 messages 深相等。
- 第二次增长 previousSummary 正确。
- 多 compaction 单调、非法倒退拒绝。
- actual summary 过大导致最终预算失败。
- 压缩后仍保留最近 8、goals、workspace、errors。
- direct build JSONL bytes/事件数不变。
- runtime 轨迹 compacted 位于下一 model.requested 前。
- `pnpm exec vitest run tests/unit/context/provider.test.ts tests/unit/context/compaction.test.ts tests/unit/context/runtime-integration.test.ts`。

### 完成条件

- compaction 可跨实例重建，不依赖内存 token。
- provider/runtime 事件所有权清晰。
- 原始 prefix 不删除、不改写、不重复发送。

### 覆盖

- FR-005/008/010、NFR-002–006、SEC-005/006/008。

## 14. T10-09：取消、故障和资源收口

### 涉及文件

```text
lib/context/provider.ts
lib/context/summary-generator.ts
lib/context/errors.ts
tests/unit/context/provider.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/context/runtime-integration.test.ts
```

### 操作

1. metadata 前、每页后、projection 后、summary 前后、final validation 前检查 signal。
2. 已取消映射 CONTEXT_ABORTED/保留 signal，使 Agent linked abort 分类生效。
3. storage → SESSION_UNAVAILABLE；profile → MODEL_UNAVAILABLE；历史 → HISTORY_INVALID。
4. budget/summary/model/internal 按批准表分类，不能全部吞为 internal。
5. 任意失败不返回 partial messages 或 draft。
6. provider 不注册长期 listener；summary 只传原 signal。
7. 测试全部 promises settle，fake model/read 无悬挂。
8. runtime 验证用户取消/总时限仍是 cancelled/AGENT_RUN_TIMEOUT。
9. 普通 context 错误由 Agent 映射为单一 AGENT_CONTEXT_FAILED。

### 最小测试

- build 前取消，source/model 0 调用。
- metadata/read 首/中/末页故障。
- 分页中、摘要中、摘要后取消。
- code/recoverable/details 精确。
- runtime external cancel、timeout、context failure 单 terminal。
- 失败无 draft/append/额外模型调用。
- deferred promise 和临时目录全部清理。
- `pnpm exec vitest run tests/unit/context/provider.test.ts tests/unit/context/summary-generator.test.ts tests/unit/context/runtime-integration.test.ts`。

### 完成条件

- 所有等待点可取消且无悬挂。
- 取消与普通上下文错误分类正确。
- provider 失败无 durable 副作用。

### 覆盖

- FR-007/010、NFR-003/004/006、SEC-006/008。

## 15. T10-10：AgentRuntime 集成、公共 API 与安全收口

### 涉及文件

```text
lib/context/index.ts
lib/context/provider.ts
lib/context/types.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/context/public-api.test.ts
tests/unit/context/security.test.ts
```

### 操作

1. `@/lib/context` 只导出 factory、ContextLayerError、批准常量/错误码及装配所需 types。
2. 不导出 mutable history、prompt/selection/transcript builder、fake dependencies 或 continuation。
3. 装配 temp JsonlEventStore + fake ModelClient + production context + production AgentRuntime。
4. 验证首轮 final、tool round 后下一轮、compaction 后下一轮 final。
5. 阶段 11 只依赖公共 barrels，不使用 context internal import。
6. 源码扫描禁止 Next/React/browser、Agent SDK/tokenizer/RAG、直接 fs/spawn/fetch/process.env、append/raw executor/capability、reasoning/continuation 反射和真实 key。
7. JSON/snapshot/error/summary fixture 无 stack、cause、capability 或真实路径。
8. 测试只用临时 data root/合成工作区。
9. 阶段 03–09、app、package/lock/config 无差异。

### 最小测试

- public export 精确白名单和 forbidden symbol。
- `@/lib/context` 可注入 `@/lib/agent`。
- 纯文本、工具、压缩三条 fake 端到端轨迹。
- import/capability/secret 源码扫描。
- `pnpm exec vitest run tests/unit/context/public-api.test.ts tests/unit/context/security.test.ts tests/unit/context/runtime-integration.test.ts`。
- `pnpm lint`。
- `pnpm typecheck`。

### 完成条件

- 阶段 11 只需公共 barrel 装配。
- 无写入/执行能力或模型私有状态泄露。
- 无禁止路径变化和新依赖。

### 覆盖

- FR-004–010、NFR-002/003/006、SEC-001–008、COM-001/003。

## 16. T10-11：全量验证、差异审查与反思修正

### 操作

1. 运行精确测试：

```text
pnpm exec vitest run tests/unit/context
```

2. 运行全仓门禁：

```text
pnpm test
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

3. 对照 Spec 第 22 节测试设计和第 23 节验收标准逐项核销。
4. 检查 Task 测试点都有行为用例，不以文件/覆盖率代替断言。
5. 对照精确白名单检查路径；确认 package/lock/config/app/阶段 03–09源码无差异。
6. 检查无 `.secode-data`、临时工作区或真实项目 fixture。
7. 扫描 key/Bearer/reasoning/capability/raw args/真实绝对路径。
8. 检查 direct build 前后 JSONL bytes 不变。
9. 记录每次失败的症状、原因、修正、重跑范围和结果。
10. 专项反思 75% off-by-one、最近 8 round 原子性、summary 单调性、每个 await 后取消竞态、actual summary 超目标失败关闭。
11. 只在批准文件/接口内修正；需改变设计则停止并回到 Spec。

### 完成条件

- context 精确测试全部通过。
- 全仓 test、lint、typecheck、build、diff check 通过且 lint 0 warning。
- 无越界文件、依赖变化、秘密、能力或真实数据。
- 不降低断言、删除测试或增加永久 skip。

### 覆盖

- 本阶段全部 FR/NFR/SEC/COM。

## 17. T10-12：Summary、索引与用户审批门禁

### 涉及文件

```text
docs/development/10-context-management-summary.md
docs/development/10-context-management-tasks.md
docs/development/README.md
```

### 操作

1. 更新本 Task 实际完成状态，不改写批准范围。
2. 生成 Summary，记录审批链、逐任务完成、关键实现、文件、验证、失败修正、规格一致性、安全、限制、反思和阶段 11 影响。
3. 更新索引为“阶段 10 Summary 待用户审批”。
4. 检查文档链接、围栏、空白、白名单和 `git diff --check`。
5. 立即停止，不开始阶段 11 观察或终端实现。

### 完成条件

- Summary 如实反映全部开发过程。
- 通用内部门禁通过。
- 用户批准前阶段 10 未正式完成，阶段 11 未解锁。

### 覆盖

- NFR-008。

## 18. 需求—任务追踪矩阵

| 需求 | 主要任务 | 关键证据 |
| --- | --- | --- |
| FR-004 | T10-03/04/05/10 | 完整 round、ChatMessage、runtime fake 轨迹 |
| FR-005 | T10-08/10 | context.compacted 顺序与事件消费 |
| FR-007 | T10-09 | 分页、摘要和 runtime linked abort |
| FR-008 | T10-05/08 | JSONL 分页、新实例旧摘要恢复 |
| FR-009 | T10-05/07 | 固定 profile contextWindow/摘要请求 |
| FR-010 | T10-02–08 | 75% 估算、原子压缩、日志不变 |
| NFR-002/003 | T10-01/03/04/07/09 | strict 边界与有限错误 |
| NFR-004/005 | T10-02/03/06/09 | 预算、signal、公开 ToolResult |
| NFR-006/008 | T10-00/10/11/12 | Node-only、扫描、文档证据 |
| SEC-001/002 | T10-02/05/10 | metadata workspace、无执行能力 |
| SEC-003–005/007 | T10-03/04/10 | 只重放公开工具事实 |
| SEC-006/008 | T10-01/04/07/08/09/10 | 脱敏、重启和安全失败 |
| COM-001/003 | T10-00/02/03/06/10/11 | 自研算法、无框架/SDK |

## 19. 测试策略

| 层次 | 使用对象 | 禁止对象 | 主要验证 |
| --- | --- | --- | --- |
| 纯单元 | Schema、estimator、history、renderer、selector | 磁盘、网络、真实时间 | 边界、原子 round、确定性 |
| provider 单元 | temp store、fake source/model | 用户目录、真实凭据/网络 | 分页、profile、摘要、恢复 |
| runtime 集成 | production Agent/context + fake model/store | CLI、HTTP、UI、真实模型 | 调用顺序和 terminal 分类 |
| 故障注入 | deferred read/model、signal | 模糊 sleep、随机失败 | 取消竞态、无半成品 |
| 全仓回归 | Vitest/lint/typecheck/build | skip、降断言 | 不破坏阶段 03–09 |

阶段 10 不执行真实 DeepSeek/LongCat、人工终端对话、真实项目修改、HTTP/UI 或产品 Playwright E2E；这些依次留到阶段 11–14。

## 20. 失败处理和回退策略

### 20.1 实现失败

- 记录失败命令、错误、输入类别和当前任务。
- 只修改已批准 context 白名单文件。
- 修正后先重跑最小测试，再跑受影响 context 测试。
- 不删除测试、降低断言或添加永久 skip。

### 20.2 必须回到 Spec 的情况

- 需要修改 AgentContextProvider/AgentRuntime、durable event 或 JSONL 格式。
- 需要改变 75%、2 bytes/token、最近 8 round、summary 12.5% 或超窗失败语义。
- 需要 provider 写 store、读工作区文件或恢复 capability。
- 需要 tokenizer、Agent SDK、RAG、数据库或新依赖。
- 需要提前实现终端、API 或 UI。

### 20.3 必须修订 Task 的情况

只需调整 context 内部文件、任务顺序或局部分工但仍符合 Spec 时，停止实现、修订本 Task并重新等待批准。

### 20.4 工作树保护

- 不使用 `git reset --hard`、`git checkout --` 或递归删除。
- 不覆盖阶段 07–09 和用户已有修改。
- 回退只用精确 `apply_patch` 处理登记文件。
- 临时目录只删除 helper 本次创建的精确目标。

## 21. 明确不执行的工作

- 不修改阶段 03–09源码、协议、测试或 barrel。
- 不创建 CLI/TTY，不调用真实模型，不读取真实 Key，不访问真实项目。
- 不创建 Route Handler、Server Action、NDJSON、React/UI 或产品 E2E。
- 不实现 tokenizer、embedding、RAG、数据库、缓存索引或递归 map-reduce。
- 不 commit、push、发布、部署或改写 Git 历史。
- 不添加依赖，不修改 package/lock/config/env。
- 不修复与本阶段无关的既有差异。

## 22. 实施阶段逐项门禁

每开始任务前确认：

- [ ] Spec/Task 仍为已批准且未被取代。
- [ ] 前置任务最小验证通过。
- [ ] 文件位于精确白名单。
- [ ] 不需要新公共接口、预算或安全决策。
- [ ] 既有 Git 修改已识别并保留。

每完成任务后确认：

- [ ] 输出和完成条件满足。
- [ ] 最小测试及要求的 typecheck/lint 通过。
- [ ] 失败与修正已登记给 Summary。
- [ ] 未开始下一阶段能力。

## 23. Task 内部门禁

- [x] 已链接已批准 Spec 并记录 2026-08-28 审批。
- [x] 已按依赖顺序拆分 T10-00～T10-12。
- [x] 每项任务包含操作、文件、测试、完成条件和需求覆盖。
- [x] 已锁定生产、测试、文档白名单和禁止路径。
- [x] 已覆盖 prompt、投影、映射、预算、压缩、摘要、恢复、取消和安全。
- [x] 已定义全量验证、失败回退和重新审批条件。
- [x] 已明确不实现终端、真实模型、API、UI、tokenizer 或 RAG。
- [x] 未创建/修改 context 实现或测试。
- [x] 未生成阶段 10 Summary。

**Task 内部门禁：通过。当前状态：已批准。**

## 24. 用户审批项

批准本 Task 即确认：

1. 按 T10-00～T10-12 顺序实施。
2. 允许新增第 4 节的 11 个生产文件和 10 个测试文件。
3. `system-prompt.ts`、`message-renderer.ts`、`compaction.ts` 是 Spec 允许的内部职责拆分。
4. 每个子任务最小验证通过后才能继续。
5. 全量通过后只生成 Summary，不进入阶段 11。

- 当前审批结果：用户已于 2026-08-28 批准阶段 10 Task。
- 用户批准后解锁：严格按 T10-00～T10-12 实施，并生成 Summary。
- 当前仍禁止：业务实现、context 测试、终端、真实模型、API 或 UI。
- 用户要求修订时：只修改本 Task 和索引，修订后重新等待批准。

## 25. 实施完成记录

- 实施日期：2026-08-28
- 实施范围：严格限定于第 4 节白名单；未修改阶段 03–09 源码、`app/**`、依赖、lockfile、配置或环境文件。
- 实施结果：T10-00～T10-11 已按顺序完成，T10-12 已生成 Summary 并进入用户审批门禁。

| 任务 | 状态 | 实际结果 |
| --- | --- | --- |
| T10-00 基线与范围复核 | 已完成 | 实施前 52 files / 493 tests，lint、typecheck 通过；确认 Next 本地指南和白名单 |
| T10-01 契约、Schema 与错误 | 已完成 | 固定常量、9 错误码、只读事件端口、strict 摘要边界和有限错误 |
| T10-02 system prompt 与估算 | 已完成 | 固定 Agent/摘要策略、workspace memory、canonical JSON 和保守 token 估算 |
| T10-03 durable history 投影 | 已完成 | final/tool 完整回合、approval、unresolved error、terminal 和 compaction 投影 |
| T10-04 ChatMessage 渲染 | 已完成 | system/memory/goals/assistant/tools 稳定配对、脱敏、Schema 和冻结 |
| T10-05 基础 Provider | 已完成 | metadata、每页 1000 事件、profile、快路径和有限故障映射 |
| T10-06 压缩选择 | 已完成 | 75% 精确触发、最旧连续前缀、最近至少 8 回合和稳定 range |
| T10-07 摘要生成 | 已完成 | 当前固定模型、tools 空数组、v1 envelope、大小/协议/错误检查 |
| T10-08 恢复 | 已完成 | compaction draft、durable summary 同/新实例复用、JSONL bytes 不变 |
| T10-09 取消和故障 | 已完成 | 预取消、分页/摘要取消检查、Agent cancelled/failed 单终态 |
| T10-10 Runtime/公共 API/安全 | 已完成 | final/tool/compaction 生产接线、最小 barrel 和源码扫描 |
| T10-11 全量验证与反思 | 已完成 | Context 9 files / 40 tests；全仓 61 files / 533 tests；全部门禁通过 |
| T10-12 Summary 与审批门禁 | 已完成，已批准 | Summary 已于 2026-08-28 获用户批准；阶段 11 只读观察与 Spec 已解锁 |

详细实现、验证、失败修正和限制见 [10-context-management-summary.md](./10-context-management-summary.md)。
