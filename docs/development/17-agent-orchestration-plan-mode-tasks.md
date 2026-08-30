# 阶段 17 Task 修订 7：大型工具输出分页、上下文有界投影与毒化历史恢复

## 1. 文档状态与审批链

- 当前状态：Task 修订 7 已批准并实施；R6-01～R6-06 已完成真实记录，Summary 修订 6 已于 2026-08-29 获用户批准，阶段 17 完成。
- 上游 Spec：[`17-agent-orchestration-plan-mode-spec.md`](./17-agent-orchestration-plan-mode-spec.md) 修订 6，已于 2026-08-29 获用户批准；修订 1～5 的实现与失败证据是历史基线。
- Spec 修订 1 审批：用户于 2026-08-28 明确回复“批准”。
- Spec 修订 2 审批：用户于 2026-08-28 明确回复“批准”。
- 原 Task：已批准并完成 T17-00～T17-14；其实现和终端人工验收保留为历史基线，但原 Task 授权不覆盖本次中文化增量。
- 本 Task 修订 5 依据：`FR-004`、`FR-015`、`NFR-004`、`NFR-010`～`NFR-011`、新增 `NFR-015`、`SEC-013`、`AC17-20`～`AC17-24`；修订 3 的 `FR-017`～`FR-018`、`NFR-014`、`AC17-16`～`AC17-19` 及阶段 17 既有验收全部作为回归基线。
- Spec 修订 6 审批：用户于 2026-08-29 明确回复“批准”，仅解锁本 Task 修订 7 的编写。
- 当前允许：进入阶段 18 只读观察并生成 Spec；保留隔离临时根供复核。
- 当前禁止：阶段 18 Spec 获批前生成 Task 或修改产品代码；禁止修改真实 Session/失败样例/用户工作区、继续消耗真实模型额度、默认删除保留的临时根、commit、push 或部署。
- 下一门禁：等待用户审批阶段 18 Spec；批准后才可生成阶段 18 Task。
- Task 修订 6 审批：用户于 2026-08-29 在完整 Task 生成后明确回复“批准”。
- Spec 修订 4 审批：用户于 2026-08-29 明确批准默认无模型请求次数门、显式模型请求保险 1～120、默认及最大工具调用预算 300 的规格。
- 当前用户回复“批准”：发生在 Task 修订 5 生成之前，只再次确认已批准 Spec，不追溯为本 Task 的批准。
- Task 修订 5 一致性修订：用户指出第 2 节仍保留修订 1～3 的旧预算不可变决策；现已按 Spec 修订 4 更新第 10～12、31 项，并明确第 3～50 节为历史记录。本次修订不改变第 51～61 节任务范围、顺序、文件白名单或验收标准。
- Task 修订 5 审批：用户于 2026-08-29 在一致性修订完成后明确回复“批准”，解锁 T17-R4-01～R4-05。
- 修订 2 历史人工门禁：T17-R2-04 完成后曾停止等待用户验收，用户随后已回复“验证通过”；本修订使用第 43 节的新门禁。
- 原 Task 审批：用户于 2026-08-28 明确回复“批准”；原终端验收也已明确通过。
- Task 修订 1 审批：用户于 2026-08-28 明确回复“批准”。
- Task 修订 1 实施检查：已完成本地 Next.js 16 Vitest/项目结构指南阅读、依赖哈希核对和 14 个文件/66 项专项基线，尚未修改生产代码或测试。
- 修订原因：实施前发现 `tests/unit/context/history-projector.test.ts` 直接断言英文 phase 与计划批准 synthetic message，但该文件遗漏于修订 1 增量白名单；中文化后必须同步更新该测试。
- Task 修订 2 变更：只把上述既有测试加入 T17-R2-01、R2-02、R2-04 和增量白名单；任务语义、生产文件、安全边界与验收标准均不变化。
- Task 修订 2 审批：用户于 2026-08-28 明确回复“批准”。
- Task 修订 2 实施结果：T17-R2-01～R2-03 已完成；Context 6 个文件/29 项、Tools/Runtime 4 个文件/21 项、请求捕获 5 个文件/24 项测试及 typecheck 均通过。
- 修订 3 原因：T17-R2-04 扫描发现确定性假模型 `tests/manual/openai-compatible-server.ts` 仍按英文 phase 文案路由，且由 `tests/integration/terminal/manual-server.test.ts` 验证；不更新会使中文终端验收走错分支。
- Task 修订 3 变更：只把上述两个测试基础设施文件加入 T17-R2-04 和增量白名单；允许将 phase 匹配哨兵同步改为中文并增加请求描述断言，不改变假模型业务轨迹。
- Task 修订 3 审批：用户于 2026-08-28 明确回复“批准”。
- 修订 2 中文终端验收：用户于 2026-08-28 回复“验证通过”。
- 修订 2 Summary 状态：因升级后真实 DeepSeek Session 仍产生英文 assistant 叙述，Summary 审批已撤回；既有实现与测试作为修订 3 基线保留。
- Task 修订 4 原因：已批准 Spec 修订 3 新增确定性中文输出合规门、有限重述、工具调用正文抑制、摘要合规门、中文工具标记和可审计拒绝事件；旧 Task 授权不覆盖这些公共行为变化。
- Task 修订 4 审批：用户于 2026-08-29 明确回复“批准”。
- 审批结果：Task 修订 4 已批准，解锁 T17-R3-01～R3-05；T17-R3-06 仍受终端人工门禁约束。
- 修订 3 终端人工验收：用户于 2026-08-29 明确回复“批准阶段17修改3”，作为第 43 节通过口令的语义等价确认；T17-R3-06 已解锁。

## 2. 批准规格的不可变决策

本节至第 76 节记录修订 1～5 与 Task 修订 6 的累计决策和实施历史。修订 6 的现行任务以第 77 节起为准；冲突时以后者取代，不得用旧的 EOF 读取或 durable output 原样重放语义覆盖新任务。

实现不得临时改变：

1. Plan Mode 是每个任务的布尔开关，默认关闭。
2. 关闭时直接使用现有正常执行流程。
3. 开启时，同一个 run 依次经历 planning、等待计划审批、approved execution。
4. 规划阶段只能调用 `list_directory/read_file/search_text`，不开放任何 process。
5. 计划必须先 durable 提交，再等待用户同意；批准前零写入、零进程、零危险工具审批。
6. 用户同意后无需再次输入，同一 run 自动继续；runId、目标和累计预算不重置。
7. 用户拒绝计划后当前 run 取消，不执行、不自动重规划。
8. 计划审批和危险工具审批使用不同事件、ID、waiter、API 与 UI；计划批准不预批准工具。
9. 计划不写工作区文件，不创建第二数据库或第二真相。
10. 模型请求默认不设次数上限；调用方可通过 `maxModelRequests` 或 deprecated `maxIterations` 显式设置 1～120 的保险。工具调用默认值与可配置硬上限均为 300，总时限仍为 10 分钟。
11. `iteration/iterations/maxIterations` durable wire 名称保留并继续表示模型请求；新 `run.started.limits.maxIterations` 仅在显式配置请求上限时写入，旧事件有值时原样恢复。
12. planning 和 executing 共享 300 工具预算、10 分钟总时限及显式模型请求上限（若有）；上下文摘要调用不计入业务模型请求。
13. 连续三次相同只读稳定事实停止；现有连续三次相同错误规则保留。
14. Terminal 自动和人工验收先于 HTTP/Web。
15. 不新增生产依赖，不引入 Agent SDK，不修改工具审批和风险语义。
16. 现有 System Prompt V3 和固定上下文中文化作为实施基线，本修订必须按第 23 项升级到 V4。
17. 修订 2 的“默认中文”软约束已被真实 DeepSeek 否证；新运行的计划、过程说明和最终回答改为固定简体中文，不接受普通用户自然语言覆盖。
18. 工具名、参数键、事件类型、状态、错误码等稳定协议标识保持英文。
19. 六个工具的 function description 和所有参数 description 使用中文，normal/planning 共用同一来源。
20. Context memory、summary system/user wrapper 和计划批准/拒绝 synthetic message 使用中文。
21. 用户输入、历史模型正文、仓库内容、搜索结果、命令输出、路径、哈希及外部响应不翻译。
22. 不迁移或重写旧 JSONL；中文化只影响升级后的新模型请求。
23. System Prompt 升级为 V4，并在请求末尾重复不可被普通用户自然语言覆盖的中文输出策略。
24. 新运行的 assistant 计划、过程说明和最终回答固定使用简体中文；代码、命令、路径、URL、JSON、日志及稳定协议标识允许保留原文。
25. 使用确定性语言分析器判定模型自然语言：先排除受保护技术片段，再拒绝无汉字且达到阈值的英文叙述段；不得调用翻译服务或改写原始事实。
26. `stop` 分支正文先完整缓冲，合规后才发布 durable assistant 内容；不合规时同一 run 最多重述 2 次，第三次以 `AGENT_OUTPUT_LANGUAGE_INVALID` 失败。
27. 带 `tool_calls` 的英文 narrative 不重试整轮，只抑制 narrative 并执行原工具调用一次；工具 ID、私有 reasoning 和 provider continuation 结构保持完整。
28. 摘要模型输出复用同一语言合规门，最多重述 2 次；失败时不得提交压缩结果，但摘要请求仍不计入业务 `iterations`。
29. 新增不含被拒绝正文的 `model.output.rejected` durable 事件，旧 JSONL 无迁移恢复；事件只记录原因、动作、次数、长度和摘要哈希。
30. `list_directory` 类型标签、进程通道标记和截断标记改为中文；真实文件内容和 stdout/stderr 字节保持原样。
31. 语言重述共享原 run 的显式模型请求上限（若有）、300 工具预算、取消信号和 10 分钟总时限，不得创建默认次数门、重置预算、创建第二 run 或绕过计划/危险审批。
32. Provider 原始 delta 不再直接进入 UI；前端只对已验证、已持久化正文执行本地打字动画。
33. 修订 3 继续坚持 Terminal 先于 HTTP/Web；用户通过真实 DeepSeek 终端验收前，禁止修改 HTTP/Client/UI/E2E。

若必须改变任一项，立即停止并回到 Spec 修订，原 Task 审批失效。

## 3. 实施基线与观察证据

开发获批后，T17-00 先执行并记录：

```text
git status --short
git diff --check
shasum -a 256 package.json pnpm-lock.yaml
pnpm exec vitest run tests/unit/domain tests/unit/agent tests/unit/context tests/unit/terminal tests/unit/client
pnpm typecheck
```

当前观察基线：

- Agent/Context/Terminal/相关 Client：33 files / 192 tests，通过。
- 阶段 16 最终全仓：102 files / 767 tests；E2E 24/24。
- package hash：`5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13`。
- lock hash：`5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683`。
- 当前 dirty worktree 包含阶段 13–16 已获批准改动，禁止 reset、stash、覆盖或错误归入阶段 17。

所有自动删除/写入测试必须使用 `mkdtemp` 或 E2E 自动创建的临时 workspace/data root。不得触碰仓库真实 `.secode-data` 或用户项目。

## 4. 任务依赖图与中间门禁

```text
T17-00 基线和历史 fixture
  → T17-01 需求、公共契约和失败测试
      ├── T17-02 System Prompt V2
      └── T17-03 Domain 计划事件与兼容投影
              → T17-04 Context phase/plan 映射
              → T17-05 Runtime planning 能力门与 proposal
              → T17-06 独立计划审批与同 run 执行
              → T17-07 预算与无进展保护
              → T17-08 Terminal 命令和自动测试
              → T17-09 Terminal 人工验收文档
                    ↓ 用户人工验收批准
                 T17-10 Server/Route
                    → T17-11 Client
                    → T17-12 Web UI
                    → T17-13 E2E/全量/安全/反思
                    → T17-14 Summary
```

T17-09 完成后必须停止并给出人工测试流程。用户未确认终端验收通过前，不得创建 Route、Client 或 Web Plan Mode 实现。

修订 1 的增量依赖图：

```text
既有 T17-00～T17-14（已完成）
  → T17-R2-01 模型消息清单、需求追踪与失败测试
      → T17-R2-02 System Prompt / Memory / Summary / 计划决定中文化
      → T17-R2-03 六工具中文描述、参数说明与能力错误中文化
      → T17-R2-04 请求捕获、事实保真、专项回归与终端验收文档
            ↓ 用户确认中文终端验收通过
         T17-R2-05 全量回归、反思与 Summary 修订
```

T17-R2 仅修改模型上下文语言契约和对应测试；不得借机重构 Plan Mode、UI、HTTP、模型传输、工具执行器或持久化协议。

## 5. T17-00：基线、旧历史 fixture 与边界确认

### 输入

- 已批准 Spec 修订 1、本 Task 和 `00-process.md`。
- 阶段 09/10/11/13/15/16 Summary。
- 当前 dirty worktree。

### 操作

1. 执行第 3 节基线命令并记录真实结果。
2. 保存一组由当前事件格式生成的只读旧历史 fixture，至少覆盖：
   - 正常 final run。
   - 工具 run。
   - failed/cancelled/interrupted。
   - context.compacted。
3. fixture 不含 `planningEnabled`、`maxToolCalls` 或 plan event，作为 NFR-010 的兼容证据。
4. 记录 stage17 新文件与既有 dirty 文件归属，不清理用户改动。
5. 确认 package/lock、storageVersion、protocolVersion 初始值。

### 允许文件

- 新增 `tests/fixtures/agent-history-v1/*.jsonl`，或在现有 test helper 中使用内联 frozen fixture；Task 实施时择一并记录。
- `tests/unit/domain/event.test.ts`
- 本 Task 末尾实施记录。

### 最小验证

```text
pnpm exec vitest run tests/unit/domain/event.test.ts tests/unit/agent/recovery.test.ts tests/unit/context/history-projector.test.ts
```

### 完成条件

- 旧 fixture 可由当前代码读取。
- hash 和工作树归属已记录。
- 没有生产代码变化。

覆盖：`NFR-010`、`AC17-10`、`AC17-13`。

## 6. T17-01：需求追踪、公共契约与失败测试

### 输入

- Spec 第 4、8、10、12、14 节。
- T17-00 fixture。

### 操作

1. 在 `01-requirements.md` 增加 `FR-012`～`FR-015`、`NFR-010`～`NFR-012`、`SEC-010`～`SEC-011`。
2. 定义但不完成业务实现：
   - `planningEnabled` 默认 false。
   - `AgentRunPhase`。
   - pending plan view、plan decision/result。
   - model/tool budget 与 progress 类型。
   - `awaiting_plan_approval` status。
   - plan proposal/resolution event schema。
3. 新增错误码常量及 recoverability，但不提前实现触发路径。
4. 先写失败测试锁定：
   - old run.started 缺新字段仍解析为 normal。
   - 新 plan event strict schema。
   - 非法 plan 轨迹被 projector 拒绝。
   - request/budget 默认、上限和 legacy alias 冲突。
   - public barrel 不泄露 waiter/capability。
5. `protocolVersion`、storageVersion 与已有事件字段保持不变。

### 允许文件

```text
docs/development/01-requirements.md
lib/domain/event.ts
lib/domain/model.ts
lib/domain/index.ts
lib/agent/types.ts
lib/agent/schemas.ts
lib/agent/errors.ts
lib/agent/index.ts
tests/unit/domain/event.test.ts
tests/unit/domain/core.test.ts
tests/unit/agent/schemas.test.ts
tests/unit/agent/public-api.test.ts
tests/unit/agent/errors.test.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/domain tests/unit/agent/schemas.test.ts tests/unit/agent/errors.test.ts tests/unit/agent/public-api.test.ts
pnpm typecheck
```

### 完成条件

- 公共类型和 Schema 与 Spec 完全一致。
- 旧 fixture 仍解析。
- 计划 waiter、prepared invocation 和私有 phase state 不从 barrel 导出。

覆盖：`FR-013`～`FR-015`、`NFR-010`、`SEC-011`、`AC17-02`、`AC17-06`、`AC17-10`。

## 7. T17-02：System Prompt V2

### 输入

- Spec 第 9 节。
- 当前固定 policy、memory renderer 和 token estimator。

### 测试先行

新增/扩展测试，先确认当前实现失败：

1. `SYSTEM_PROMPT_VERSION = 2` 独立于 Context protocol version。
2. normal/planning/approved execution 只出现一个 phase overlay。
3. 通用 policy 包含事实、失败恢复、最小修改、验证、持续推进和完成规则。
4. Planning policy 包含只读、完整计划格式和等待批准。
5. Approved execution 明确计划批准不等于危险工具批准。
6. policy 不含 workspace/prompt/secret，动态 memory 继续脱敏。
7. 固定 prompt token 估算低于 Spec 目标。

### 实现

1. 将 prompt 拆为固定常量和确定性组合器，不引入模板依赖。
2. `renderSystemPolicy(phase)` strict 接受批准 phase。
3. Context summary policy 保持独立、`tools: []`、无 plan capability。
4. 不在事件/UI/错误中输出固定 prompt。

### 允许文件

```text
lib/context/system-prompt.ts
lib/context/message-renderer.ts
lib/context/types.ts
lib/context/index.ts
tests/unit/context/token-estimator.test.ts
tests/unit/context/message-renderer.test.ts
tests/unit/context/security.test.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/context/token-estimator.test.ts tests/unit/context/message-renderer.test.ts tests/unit/context/security.test.ts
pnpm typecheck
```

### 完成条件

- `AC17-01` 全部通过。
- prompt 组合确定、有限、脱敏且只有当前 phase overlay。

覆盖：`FR-012`、`SEC-010`～`SEC-011`、`AC17-01`。

## 8. T17-03：Domain 计划事件与兼容 Projection

### 输入

- T17-01 契约。
- T17-00 旧历史 fixture。

### 测试先行

锁定合法路径：

```text
run.started(planning=true)
→ user.message
→ model/tool planning rounds
→ plan.proposed
→ plan.approval.resolved(true)
→ model/tool execution rounds
→ final
→ run.completed
```

以及：

```text
plan.proposed
→ plan.approval.resolved(false)
→ run.cancelled
```

非法路径至少覆盖：重复 proposal、无 planning 开关 proposal、错误 planId/approvalId、重复 resolution、批准前写工具、拒绝后请求模型、proposal 后 final/terminal 次序错误、tool approval ID 冒充 plan approval。

### 实现

1. `RunStatusSchema` 增加 `awaiting_plan_approval`。
2. run.started 输入缺 `planningEnabled/maxToolCalls` 时兼容默认；新事件输出显式字段。
3. 增加 `plan.proposed` 和 `plan.approval.resolved` 两类 durable event。
4. Projector 从事件推导 phase、pending plan、modelRequests、toolCalls 和预算。
5. run.failed/cancelled/interrupted 允许在 planning/pending 阶段形成唯一终态。
6. 快照 deep-freeze，不暴露内部 Set/Map/waiter。

### 允许文件

```text
lib/domain/event.ts
lib/domain/model.ts
lib/domain/index.ts
lib/agent/projection.ts
lib/agent/types.ts
tests/unit/domain/event.test.ts
tests/unit/agent/projection.test.ts
tests/unit/agent/recovery.test.ts
tests/unit/agent/public-api.test.ts
tests/fixtures/agent-history-v1/**（若 T17-00 选择文件 fixture）
```

### 最小验证

```text
pnpm exec vitest run tests/unit/domain/event.test.ts tests/unit/agent/projection.test.ts tests/unit/agent/recovery.test.ts
pnpm typecheck
```

### 完成条件

- 新生命周期合法、非法轨迹稳定拒绝。
- 旧历史零迁移恢复为 planning off。
- 事件协议版本未变化。

覆盖：`FR-013`～`FR-015`、`NFR-010`、`SEC-011`、`AC17-02`、`AC17-04`～`AC17-07`、`AC17-10`。

## 9. T17-04：Context phase、计划与批准映射

### 输入

- T17-02 Prompt V2。
- T17-03 durable 事件与投影。

### 测试先行

1. normal 使用 NormalPolicy + 六工具估算。
2. planning 使用 PlanningPolicy + 三只读工具估算。
3. plan proposal 映射为 assistant plan fact，不映射成 final 完成。
4. approved resolution 映射为有限用户批准事实，然后使用 ApprovedExecutionPolicy。
5. rejected/interrupted plan 不伪造成已批准。
6. compaction 保留 proposal、批准状态和当前 phase；摘要不得把计划写成完成。
7. 旧历史仍按 normal 渲染。

### 实现

1. Context history run 增加 planning/plan facts。
2. message renderer 按 durable active phase 选择 overlay。
3. Provider token 估算接收当前 phase 对应工具 definitions。
4. Summary transcript 有限记录计划正文/决定，继续脱敏。
5. Context request 不信任 UI 传 phase，以 durable history 为最终事实。

### 允许文件

```text
lib/context/types.ts
lib/context/history-projector.ts
lib/context/message-renderer.ts
lib/context/provider.ts
lib/context/compaction.ts
lib/context/summary-generator.ts
lib/context/token-estimator.ts
lib/context/system-prompt.ts
tests/unit/context/history-projector.test.ts
tests/unit/context/message-renderer.test.ts
tests/unit/context/provider.test.ts
tests/unit/context/compaction.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/context/helpers.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/context
pnpm typecheck
```

### 完成条件

- phase 和 plan facts 只来自 durable history。
- planning 不把六工具错误计入预算。
- 旧 context fixture 可恢复。

覆盖：`FR-012`～`FR-014`、`NFR-010`、`SEC-010`～`SEC-011`、`AC17-01`～`AC17-06`、`AC17-10`。

## 10. T17-05：Runtime planning 能力门与 plan proposal

### 输入

- T17-01 public contract。
- T17-02/04 prompt 与 context。

### 测试先行

1. planning 模型请求只含 list/read/search definitions。
2. 正常模式仍含六工具。
3. planning 可进行多个只读 tool round 后 stop。
4. planning stop 转 `plan.proposed`，不产生 assistant final/run.completed。
5. 空、超大、tool_calls 不变量错误映射。
6. 伪造 write/replace/process 产生 `TOOL_PHASE_DENIED` result，零 prepare/approval/started/executor。
7. proposal 前后临时 workspace tree hash 完全相同。

### 实现

1. 在工具定义模块提供冻结的 planning definitions 子集，保持顺序确定。
2. Runtime active state 初始化 normal 或 planning phase。
3. Model request 使用 phase definitions。
4. `createToolPlan` 在 prepare 前执行 phase gate；公开参数仍有界脱敏。
5. planning stop 生成独立 planId/approvalId，脱敏并 durable 追加 proposal。
6. proposal 后暂停循环，建立独立 pending plan view。

### 允许文件

```text
lib/tools/schemas.ts
lib/tools/index.ts
lib/agent/runtime.ts
lib/agent/types.ts
lib/agent/dependencies.ts（仅必要的确定性 ID/稳定签名依赖）
lib/agent/index.ts
tests/unit/tools/schemas.test.ts
tests/unit/agent/runtime-plan-mode.test.ts（新增）
tests/unit/agent/runtime-tools.test.ts
tests/unit/agent/helpers.ts
tests/unit/agent/security.test.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/tools/schemas.test.ts tests/unit/agent/runtime-plan-mode.test.ts tests/unit/agent/runtime-tools.test.ts tests/unit/agent/security.test.ts
pnpm typecheck
```

### 完成条件

- `AC17-02`、`AC17-03` 通过。
- planning 的只读性由定义过滤与 Runtime gate 双重证明。

覆盖：`FR-013`、`SEC-010`、`AC17-02`～`AC17-03`。

## 11. T17-06：独立计划审批与同 run 执行

### 输入

- T17-03 projection。
- T17-05 pending proposal。

### 测试先行

1. pending 时 `getActiveRun()` 暴露有限 plan view。
2. approved 顺序为 resolved durable → phase executing → 下一模型请求。
3. approved 后 runId、目标、计数不变，continuation 清除。
4. execution 使用 ApprovedExecutionPolicy + 六工具，并能修改/验证/final。
5. plan approval 不产生工具 authorization；后续危险工具仍需要工具审批。
6. rejected 顺序为 resolved(false) → run.cancelled，零执行。
7. 错误 run/plan/approval、重复决定、非 pending 决定均零事件。
8. resolved append 失败保持 pending 且零执行。
9. planning/pending 期间 cancel、timeout 和 sink failure 只有一个终态。

### 实现

1. 新建独立 `AgentPlanApprovalWait`，不导出 opaque waiter。
2. Runtime 增加 `resolvePlanApproval()` 公共方法和严格返回类型。
3. approved 先发布事件，再清 continuation、切 phase、唤醒循环。
4. rejected 发布决定后进入统一 cancel 收口。
5. pending waiter 和工具 waiter 同时最多各自满足合法 phase；不得交叉解析 ID。
6. recovery 不重建可执行 waiter；open run 仍 interrupted。

### 允许文件

```text
lib/agent/plan-approval-wait.ts（新增）
lib/agent/runtime.ts
lib/agent/types.ts
lib/agent/schemas.ts
lib/agent/errors.ts
lib/agent/projection.ts
lib/agent/index.ts
tests/unit/agent/runtime-plan-approval.test.ts（新增）
tests/unit/agent/runtime-cancellation.test.ts
tests/unit/agent/runtime-approval.test.ts
tests/unit/agent/runtime-durable-failure.test.ts
tests/unit/agent/recovery.test.ts
tests/unit/agent/helpers.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/agent/runtime-plan-approval.test.ts tests/unit/agent/runtime-approval.test.ts tests/unit/agent/runtime-cancellation.test.ts tests/unit/agent/runtime-durable-failure.test.ts tests/unit/agent/recovery.test.ts
pnpm typecheck
```

### 完成条件

- `AC17-04`～`AC17-06` 通过。
- 计划批准无法绕过工具审批。
- durable failure 不产生隐藏 phase 切换。

覆盖：`FR-013`～`FR-014`、`NFR-011`、`SEC-011`、`AC17-04`～`AC17-06`。

## 12. T17-07：模型/工具预算与无进展保护

### 输入

- Spec 第 12 节。
- T17-06 完整 lifecycle。

### 测试先行

1. 默认/硬上限 60/120 model requests、120/240 tool calls。
2. legacy `maxIterations` 归一化；与新字段共存拒绝。
3. planning + executing 累计、不在批准时重置。
4. 一次 completion 两工具：model +1、tool +2。
5. context summary 不增加业务请求。
6. 精确允许最后一次模型请求和最后完整工具 batch。
7. 跨工具上限的整个 batch 零 requested/prepare/execute。
8. 相同只读稳定成功第 3 次失败；参数/hash/output 变化和写/process reset。
9. 既有相同工具错误三次行为不回归。

### 实现

1. active state 使用 `modelRequests/toolCalls` 准确命名。
2. durable 写入/读取边界映射旧 iteration wire。
3. 在任何 tool.requested 前完成 batch budget 原子检查。
4. stable result 签名排除 duration 等易变 metadata，只用于三只读工具。
5. 新错误 `AGENT_TOOL_CALL_LIMIT/AGENT_NO_PROGRESS_LIMIT`。
6. Snapshot/outcome/config 暴露准确计数与实际 limits。

### 允许文件

```text
lib/agent/types.ts
lib/agent/schemas.ts
lib/agent/errors.ts
lib/agent/runtime.ts
lib/agent/projection.ts
lib/agent/index.ts
tests/unit/agent/runtime-limits.test.ts
tests/unit/agent/runtime-tools.test.ts
tests/unit/agent/projection.test.ts
tests/unit/agent/schemas.test.ts
tests/unit/agent/errors.test.ts
tests/unit/agent/helpers.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/agent/runtime-limits.test.ts tests/unit/agent/runtime-tools.test.ts tests/unit/agent/projection.test.ts tests/unit/agent/schemas.test.ts tests/unit/agent/errors.test.ts
pnpm typecheck
```

### 完成条件

- `AC17-07`～`AC17-09` 通过。
- 没有把 plan item 当安全预算。
- 旧 iteration wire 保持连续。

覆盖：`FR-015`、`NFR-010`～`NFR-011`、`AC17-07`～`AC17-10`。

## 13. T17-08：Terminal 命令、渲染与自动测试

### 输入

- T17-05～T17-07 production runtime。
- 现有 Terminal 单 active run 应用。

### 测试先行

1. `/plan on|off` strict parser；默认 off；多余/非法参数拒绝。
2. active 时切换 plan 开关拒绝且不影响当前 run。
3. task start 把当前开关传入 `planningEnabled`。
4. proposal 渲染计划、approvalId 和明确命令提示。
5. `/approve-plan`、`/reject-plan` 只处理 pending plan。
6. `/approve`、`/reject` 仍只处理 pending tool。
7. status 显示开关、phase、model requests、tool calls 和上限。
8. approved 后同一 handle 继续；rejected/cancel/exit 收口。
9. 输出脱敏，不打印 System Prompt、完整 workspace 之外的内部路径或 capability。

### 实现

1. 扩展 Terminal command type/schema/parser/help。
2. application 维护“下一任务 planningEnabled”本地开关。
3. plan decision 调用 Runtime 独立 API。
4. event renderer 增加 plan proposed/resolved 文本。
5. outcome/status 改用准确的模型请求/工具调用术语。

### 允许文件

```text
lib/terminal/types.ts
lib/terminal/schemas.ts
lib/terminal/arguments.ts
lib/terminal/application.ts
lib/terminal/event-renderer.ts
lib/terminal/index.ts
tests/unit/terminal/arguments.test.ts
tests/unit/terminal/schemas.test.ts
tests/unit/terminal/application.test.ts
tests/unit/terminal/event-renderer.test.ts
tests/unit/terminal/security.test.ts
tests/integration/terminal/manual-server.test.ts
tests/integration/terminal/runtime.test.ts（若现有文件名不同，Task 实施记录精确说明）
tests/manual/openai-compatible-server.ts（仅确定性 plan 场景）
```

### 最小验证

```text
pnpm exec vitest run tests/unit/terminal tests/integration/terminal
pnpm typecheck
pnpm agent -- --help
```

### 完成条件

- Terminal 自动测试覆盖开关、同 run 批准、拒绝和预算。
- 正常模式既有命令无回归。
- 尚未修改 HTTP/Client/Web。

覆盖：`NFR-012`、`AC17-11`。

## 14. T17-09：Terminal 人工验收文档与用户门禁

### 输入

- T17-08 可运行终端。
- 自动创建的阶段 17 临时 fixture 和 fake/真实 DeepSeek 可选环境。

### 操作

1. 新建 `17-agent-plan-terminal-acceptance.md`，记录一键创建临时 fixture 和完整命令。
2. 至少提供以下人工流程：
   - `/plan on` → 读取项目 → 显示完整计划。
   - 等待时比较 tree hash，证明零写入。
   - `/approve-plan` → 同 run 修改 → 测试 → final。
   - 新任务 `/reject-plan` → cancelled、零修改。
   - `/plan off` → 正常直接执行。
   - `/status` → phase 和两类计数。
3. 自动 fixture 清理脚本只能删除本次创建且身份重新验证的临时根。
4. 记录 fake model 预期事实；真实 DeepSeek 只作为用户可选冒烟，不打印凭据。
5. 交付文档后立即停止，等待用户人工测试和明确批准。

### 允许文件

```text
docs/development/17-agent-plan-terminal-acceptance.md（新增）
tests/manual/openai-compatible-server.ts
tests/manual/**（只允许阶段 17 临时 fixture helper）
package.json（禁止修改；命令必须复用现有脚本）
```

### 最小验证

```text
pnpm test
pnpm typecheck
git diff --check
```

### 完成条件

- 文档命令可复制、路径安全、预期清晰。
- Agent 在终端可观察规划、批准、执行、拒绝和计数。
- 用户明确回复终端人工验收通过。

覆盖：`NFR-012`、`SEC-010`～`SEC-011`、`AC17-02`～`AC17-11`。

## 15. 中间人工验收门禁

T17-09 后状态只能是：

```text
核心与 Terminal 实施完成
→ 人工验收文档已生成
→ 等待用户测试
```

用户未明确批准时，禁止：

- 新增计划审批 Route。
- 修改 Client API/Schema。
- 修改 React UI/CSS。
- 新增 Plan Mode E2E。

若人工测试发现公共语义或安全边界需要改变，回到 Spec 修订；若只需任务文件调整，修订 Task 并重新审批。

## 16. T17-10：Server Application、Route 与集成测试

### 前置门禁

- 用户已明确批准 T17-09 人工终端验收。

### 测试先行

1. Run body 默认/显式 `planningEnabled`、新预算和 legacy alias 冲突。
2. Server startRun 完整透传标准化字段。
3. Plan approval endpoint 200、invalid 404/409、duplicate、Origin/Host/body guard。
4. pending plan 与 tool approval 使用不同 application method。
5. stream 在 pending plan 时保持；approved 后继续同 stream；rejected 后 terminal close。
6. cancel 和 session deletion busy 语义不回归。

### 实现

1. Server types/application 增加独立 plan resolve。
2. 新 Route `POST /api/runs/[id]/plans/[approvalId]`，Node runtime、await params、strict body。
3. Error mapping 按 Spec 返回有限 404/409。
4. Run route 透传 planning/budget normalized input。
5. Public config 返回 model/tool request 新 limits，必要时保留明确 deprecated alias 仅用于兼容测试。

### 允许文件

```text
app/api/sessions/[id]/runs/route.ts
app/api/runs/[id]/plans/[approvalId]/route.ts（新增）
lib/server/types.ts
lib/server/schemas.ts
lib/server/application.ts
lib/server/errors.ts
lib/server/index.ts
tests/unit/server/schemas.test.ts
tests/unit/server/application.test.ts
tests/unit/server/errors.test.ts
tests/unit/server/public-api.test.ts
tests/unit/server/security.test.ts
tests/integration/server/run-stream.test.ts
tests/integration/server/plan-approval-route.test.ts（新增）
tests/integration/server/helpers.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/server tests/integration/server/run-stream.test.ts tests/integration/server/plan-approval-route.test.ts
pnpm typecheck
```

### 完成条件

- HTTP 与 Terminal 共享同一个 Runtime 语义。
- 计划审批不能调用工具审批 endpoint 或 capability。
- NDJSON 同 run 连续。

覆盖：`FR-013`～`FR-015`、`NFR-011`、`SEC-011`、`AC17-02`、`AC17-04`～`AC17-08`。

## 17. T17-11：Client DTO、API 与纯投影

### 输入

- T17-10 HTTP 契约。
- 新 durable events。

### 测试先行

1. config/run/plan response strict schema。
2. `startRun` 请求包含 planning flag；默认明确 false。
3. `resolvePlanApproval` URL 编码、POST body 和错误映射。
4. event projection 推导 planning/pending/executing、plan content、approval IDs 和准确计数。
5. transcript 把 proposal 显示为计划项，旧 iteration 显示“模型请求”。
6. approved/rejected、refresh/reconcile 和 malformed event。
7. client source 无 Node/server/env/Key/System Prompt。

### 实现

1. Client types/schemas/API 增加 run input 和 plan decision。
2. `RunProjection` 增加 phase/planning/pending plan/model/tool limits。
3. Transcript projection 增加 plan item，不复制 tool approval。
4. public barrel 只导出 DTO 和纯视图，不导出 server/core。

### 允许文件

```text
lib/client/types.ts
lib/client/schemas.ts
lib/client/api-client.ts
lib/client/event-state.ts
lib/client/transcript.ts
lib/client/view-model.ts
lib/client/index.ts
tests/unit/client/api-client.test.ts
tests/unit/client/schemas.test.ts
tests/unit/client/event-state.test.ts
tests/unit/client/transcript.test.ts
tests/unit/client/view-model.test.ts
tests/unit/client/public-api.test.ts
tests/unit/client/security.test.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/client
pnpm typecheck
```

### 完成条件

- DTO 与 Route 完全一致。
- Client 不生成虚假批准或执行 phase。
- 旧历史准确显示模型请求。

覆盖：`FR-013`～`FR-015`、`NFR-010`～`NFR-011`、`AC17-02`、`AC17-04`～`AC17-10`。

## 18. T17-12：Web 开关、计划审批与进度 UI

### 输入

- T17-11 Client projection。
- 阶段 15 纯文本 Transcript 和 persistent Provider。

### 操作

1. Home/Session Composer 共用“先规划后执行”开关，默认 off。
2. 每次提交把当前开关传给 startRun；active 时禁用。
3. `plan.proposed` 以纯文本计划块显示，不恢复旧卡片式时间线。
4. 计划操作区显示“同意计划并开始执行”和“拒绝计划”，默认焦点不放在同意按钮。
5. 同意/拒绝调用独立 Client API；pending 时防双击；错误保留计划和可重试事实。
6. approved 后不创建新 run、不清 transcript、不提交伪 user message；继续当前 stream。
7. tool approval 保持原位置和独立文案。
8. Details Drawer 显示 Plan Mode、phase、真实 model/tool counts 和 limits，不硬编码 30。
9. mobile/reduced-motion/键盘/focus/aria-live 与阶段 15/16 兼容。

### 允许文件

```text
app/ui/workbench/composer.tsx
app/ui/workbench/transcript.tsx
app/ui/workbench/session-workbench.tsx
app/ui/workbench/details-drawer.tsx
app/ui/workbench/plan-approval.tsx（必要时新增）
app/ui/home/new-task-page.tsx
app/ui/shell/app-shell-provider.tsx
app/globals.css
tests/unit/client/**（仅发现纯投影回归时）
```

### React/Next 纪律

- 修改前重新阅读本地 Next.js 16 相关指南。
- 多个 TSX 修改后使用 `react-best-practices` skill 复核。
- 不把 Agent phase 或安全决策搬到 Client。
- 不使用 render 写 ref、无界 effect、raw HTML 或 localStorage 第二真相。

### 最小验证

```text
pnpm lint
pnpm typecheck
pnpm exec vitest run tests/unit/client
```

### 完成条件

- `AC17-02`、`AC17-04`～`AC17-08` 的 UI 可操作。
- 正常模式默认和既有 Session workflow 无回归。

覆盖：`FR-013`～`FR-015`、`NFR-011`、`SEC-011`、`AC17-02`、`AC17-04`～`AC17-08`、`AC17-12`。

## 19. T17-13：Integration/E2E、安全、全量回归与反思

### E2E 新场景

新增 `tests/e2e/plan-mode.spec.ts`，至少覆盖：

1. 默认 off：直接正常执行，零 plan proposal。
2. on：只读工具 → 完整计划 → pending，workspace marker/hash 不变。
3. 同意：同一 runId 继续，真实修改和测试通过。
4. 拒绝：cancelled，工作区零变化。
5. approved execution 内危险工具仍出现独立工具审批。
6. active 时开关禁用，不能改变当前 run。
7. Details/Transcript 显示准确模型请求和工具调用。
8. mobile keyboard、计划按钮焦点、Escape/关闭不等于批准。
9. refresh/disconnect 显示 durable proposal/resolution/interrupted 事实。

### 安全扫描

```text
rg -n "LANGCHAIN|@ai-sdk|openai-agents|dangerouslySetInnerHTML" lib app
rg -n "DEEPSEEK_API_KEY|LONGCAT_API_KEY|SECODE_DATA_DIR|node:fs|child_process" lib/client app/ui
rg -n "TOOL_PHASE_DENIED|plan\.proposed|plan\.approval\.resolved" lib tests
rg -n "当前轮次|第 .* 轮|/ 30" app lib/terminal lib/client
```

必须人工检查：

- planning 分支在 prepare/authorization/executor 前被阻断。
- approved 事件 durable 前无 execution phase。
- plan approval 没有调用 approval gateway。
- System Prompt 不进入事件、UI 或日志。
- workspace marker/hash 只在批准后按计划变化。

### 全量命令

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
git diff --check
shasum -a 256 package.json pnpm-lock.yaml
```

### 失败纪律

- 每个失败记录“命令 → 症状 → 根因 → 修正 → 重跑”。
- 不降低断言、coverage、worker 隔离或安全限制。
- 不增加 retry 掩盖竞态。
- 新 build warning 必须解释或修正；既有 storage tracing warning 单独记录。
- 对照白名单和既有 dirty worktree，不清理用户修改。

### 完成条件

- 新 Plan Mode、正常 Agent、审批、取消、删除 Session 和工作区选择 E2E 全部通过。
- package/lock hash 不变。
- 无真实数据写入、秘密或越界文件。
- 反思确认用户需求不是“两个独立 run”。

覆盖：全部阶段 17 需求与 `AC17-01`～`AC17-13`。

## 20. T17-14：Summary 与停止门禁

### 操作

1. 新建 `17-agent-orchestration-plan-mode-summary.md`。
2. 记录 Spec/Task/中间人工验收审批、实际任务、文件、测试、失败修正、偏差、安全、限制和反思。
3. 明确 Plan Mode 默认关闭、同 run 批准后执行、拒绝零执行和预算语义。
4. 更新 README 为“阶段 17 Summary 待审批”。
5. Summary 生成后立即停止；不开始阶段 18 观察、README.txt、视频、提交或发布。

### 完成条件

- 全部证据可追踪。
- 状态准确为待用户审批，不把内部通过写成用户批准。

覆盖：`NFR-012`、`AC17-13`。

## 21. 需求—任务—验收映射

| 需求 | 实现任务 | 主要验收 |
| --- | --- | --- |
| FR-012 | T17-02、04～06 | AC17-01 |
| FR-013 | T17-01、03～06、08、10～12 | AC17-02～04 |
| FR-014 | T17-03、06、08、10～12 | AC17-04～06 |
| FR-015 | T17-01、03、07～13 | AC17-07～09 |
| FR-016 | T17-R2-01～R2-05 | AC17-14～15 |
| NFR-010 | T17-00、01、03、04、07、11、13 | AC17-10 |
| NFR-011 | T17-03～13 | AC17-02～12 |
| NFR-012 | T17-08、09、14 | AC17-11、13 |
| NFR-013 | T17-R2-01、R2-03～R2-05 | AC17-15 |
| SEC-010 | T17-02、04、05、09、13 | AC17-01～03 |
| SEC-011 | T17-03、06、08、10、12、13 | AC17-04～06、12 |
| SEC-012 | T17-R2-01～R2-05 | AC17-14～15 |

## 22. 预计文件白名单

### 22.1 新增

```text
lib/agent/plan-approval-wait.ts
app/api/runs/[id]/plans/[approvalId]/route.ts
app/ui/workbench/plan-approval.tsx                 # 仅必要时
tests/unit/agent/runtime-plan-mode.test.ts
tests/unit/agent/runtime-plan-approval.test.ts
tests/integration/server/plan-approval-route.test.ts
tests/e2e/plan-mode.spec.ts
tests/fixtures/agent-history-v1/**                  # 若采用文件 fixture
docs/development/17-agent-plan-terminal-acceptance.md
docs/development/17-agent-orchestration-plan-mode-tasks.md
docs/development/17-agent-orchestration-plan-mode-summary.md
```

### 22.2 允许修改

```text
docs/development/01-requirements.md
docs/development/README.md
docs/development/17-agent-orchestration-plan-mode-spec.md

lib/domain/event.ts
lib/domain/model.ts
lib/domain/index.ts

lib/tools/schemas.ts
lib/tools/index.ts

lib/agent/types.ts
lib/agent/schemas.ts
lib/agent/errors.ts
lib/agent/dependencies.ts                       # 仅批准的确定性依赖
lib/agent/runtime.ts
lib/agent/projection.ts
lib/agent/index.ts

lib/context/types.ts
lib/context/system-prompt.ts
lib/context/history-projector.ts
lib/context/message-renderer.ts
lib/context/provider.ts
lib/context/compaction.ts
lib/context/summary-generator.ts
lib/context/token-estimator.ts
lib/context/index.ts

lib/terminal/types.ts
lib/terminal/schemas.ts
lib/terminal/arguments.ts
lib/terminal/application.ts
lib/terminal/event-renderer.ts
lib/terminal/index.ts

lib/server/types.ts
lib/server/schemas.ts
lib/server/application.ts
lib/server/errors.ts
lib/server/index.ts
app/api/sessions/[id]/runs/route.ts

lib/client/types.ts
lib/client/schemas.ts
lib/client/api-client.ts
lib/client/event-state.ts
lib/client/transcript.ts
lib/client/view-model.ts
lib/client/index.ts

app/ui/workbench/composer.tsx
app/ui/workbench/transcript.tsx
app/ui/workbench/session-workbench.tsx
app/ui/workbench/details-drawer.tsx
app/ui/home/new-task-page.tsx
app/ui/shell/app-shell-provider.tsx
app/globals.css

tests/unit/domain/**
tests/unit/tools/schemas.test.ts
tests/unit/agent/**
tests/unit/context/**
tests/unit/terminal/**
tests/unit/server/**
tests/unit/client/**
tests/integration/terminal/**
tests/integration/server/helpers.ts
tests/integration/server/run-stream.test.ts
tests/manual/**
tests/e2e/fixtures.ts
tests/e2e/support/fake-model-server.ts
tests/e2e/support/start-environment.ts
tests/e2e/agent-workflow.spec.ts
tests/e2e/approval-cancel.spec.ts
tests/e2e/responsive-visual.spec.ts
```

### 22.3 明确禁止修改

```text
package.json
pnpm-lock.yaml
next.config.ts
tsconfig.json
vitest.config.ts
playwright.config.ts
lib/model/**
lib/storage/**
lib/workspace/**
lib/approval/**
各六工具的具体 executor 文件
真实 .env* / API Key
用户工作区或真实 .secode-data
```

如发现必须越过白名单，停止并修订 Task；若涉及公共语义或安全边界，回到 Spec。

### 22.4 修订 1 增量允许文件

```text
docs/development/01-requirements.md
docs/development/README.md                         # 仅 T17-R2-05
docs/development/17-agent-plan-terminal-acceptance.md
docs/development/17-agent-orchestration-plan-mode-summary.md  # 仅 T17-R2-05

lib/context/system-prompt.ts
lib/context/message-renderer.ts
lib/context/summary-generator.ts
lib/tools/schemas.ts
lib/agent/runtime.ts

tests/unit/context/model-language.test.ts           # 必要时新增
tests/unit/context/history-projector.test.ts         # 同步既有英文行为断言
tests/unit/context/token-estimator.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/context/helpers.ts                       # 仅测试捕获辅助
tests/unit/tools/schemas.test.ts
tests/unit/tools/registry.test.ts
tests/unit/agent/runtime-plan-mode.test.ts
tests/unit/agent/helpers.ts                         # 仅请求捕获辅助
tests/integration/terminal/runtime.test.ts
tests/integration/terminal/manual-server.test.ts       # 假模型中文 phase 回归
tests/manual/openai-compatible-server.ts               # 中文 phase 请求路由哨兵
tests/manual/stage17-fixture.ts                     # 仅必要的中文验收断言/场景
```

除上述文件外，修订 1 禁止修改原宽白名单中的其他文件。若实际调查证明模型可见固定英文来自另一生产文件，先停止并修订本 Task，不得以“原 Task 曾允许”为由直接扩大范围。

## 23. 测试纪律

1. 计划只读性必须同时由 mock 零调用和真实临时 workspace hash 证明。
2. 竞态用 deferred Promise/event gate，不用任意 sleep。
3. plan approval 与 tool approval 测试使用不同 ID 哨兵。
4. old JSONL fixture 只读，不由新实现动态生成，否则无法证明兼容。
5. 工具批次限制测试必须断言整批零副作用。
6. 无进展签名测试排除易变 metadata，但不能删掉影响事实的 output/hash/error。
7. E2E workers=1、retries=0；不触碰真实用户项目。
8. 不连接真实模型作为自动验收；真实 DeepSeek 只由用户可选手工运行。
9. 失败不能通过降低上限、删除断言、跳过旧测试或扩大 planning 工具来解决。
10. 中文覆盖测试检查应用固定自然语言入口，不对用户/仓库/命令事实执行破坏性自动翻译。
11. 不使用“只要包含一个汉字就算中文”的弱断言；关键固定内容使用结构断言和必要语义断言。
12. 英文哨兵允许稳定协议 token 白名单，但必须拒绝完整应用自有英文句子重新进入模型上下文。
13. 工具描述测试必须检查 `z.toJSONSchema` 后实际发送结构中的 property description。

## 24. 错误处理与回退

### 24.1 实现错误

- 只用 `apply_patch` 修正当前任务批准文件。
- 不使用 `git reset --hard`、`git checkout --` 或清理整个 dirty worktree。
- 失败后重跑当前任务完整指定集。

### 24.2 Durable 提交不确定

- proposal/resolution append 失败时不猜测，不进入下一 phase。
- 按既有 publisher/EventStore 错误语义安全停止。
- 不重复计划批准或执行可能产生副作用的工具。

### 24.3 HTTP/UI 失败

- 计划审批请求失败时保留 proposal，不乐观显示 executing。
- 404/409 从 durable history 协调真实 pending/terminal 状态。
- stream 断开使用既有取消/恢复事实，不在 Client 伪造继续。

### 24.4 中文化失败

- Prompt token 预算回归时压缩重复措辞，不删除安全、审批、事实或验证约束。
- Zod `.describe()` 未稳定进入生成 JSON Schema 时，在 `modelParameters()` 的单一出口显式补充 description；不得复制第二套参数类型或改变字段结构。
- 中文描述与 executor 行为不一致时以已批准工具安全语义为准，修正文案和测试，不放宽 executor。
- 模型提供方出现差异时先验证 wire 请求；不得增加 DeepSeek/LongCat 专属英文 fallback 或分叉工具定义。
- 事实保真测试失败时停止，不得通过翻译、过滤或重编码原始代码/输出制造中文覆盖。

## 25. 明确不执行

- 不把 planning/execution 拆成两个 run。
- 不在用户批准后要求再次输入。
- 不未经批准自动执行或自动批准。
- 不实现计划编辑、多版本 revision、逐项任务看板。
- 不创建计划文件、数据库或 localStorage 第二真相。
- 不并行执行工具，不为 planning 开放 process。
- 不修改模型传输、工具 executor、风险分类或审批 gateway。
- 不修改 UI、Route、Client、Domain event 或 Storage；本修订没有这些公共接口变化。
- 不翻译用户/历史模型/仓库/进程原文，不重写已有 JSONL。
- 不本地化工具名、JSON key、事件、phase/status 或错误码。
- 不迁移/重写旧 JSONL，不修改真实 Session。
- 不增加依赖、commit、push、部署、视频或最终 README.txt。

## 26. Task 审批检查

- [x] 已绑定已批准 Spec 修订 1 和需求 ID。
- [x] 已按 Domain → Prompt/Context → Runtime → Terminal → 人工验收 → HTTP/Client/Web 排序。
- [x] 已设置 T17-09 用户人工终端验收中间门禁。
- [x] 已固定同 run 计划批准、拒绝和危险工具审批隔离。
- [x] 已锁定旧 JSONL 兼容、预算、批次原子性和无进展测试。
- [x] 已列出精确新增/修改/禁止文件范围。
- [x] 已定义专项、集成、人工、E2E 和全量验证。
- [x] 已明确回退、durable failure 和禁止项。
- [x] 用户批准原 Task 并完成原实施。
- [x] 已绑定已批准 Spec 修订 2 与 `FR-016/NFR-013/SEC-012`。
- [x] 已将中文化限制为固定模型自然语言，排除协议标识和原始事实。
- [x] 已定义 Prompt、Memory、Summary、计划决定、工具 function/property description 和能力错误的覆盖清单。
- [x] 已定义生成后 JSON Schema、三 phase 请求捕获和英文事实保真测试。
- [x] 已设置修订 2 中文终端人工验收中间门禁。
- [x] 已收窄修订 1 文件白名单并禁止借机修改 UI/HTTP/持久化。
- [x] 用户于 2026-08-28 批准本 Task 修订 1。
- [x] 实施前基线完成，未修改生产代码或测试。
- [x] 已识别并仅补充 `tests/unit/context/history-projector.test.ts` 白名单。
- [x] 用户于 2026-08-28 批准本 Task 修订 2。
- [x] T17-R2-01～R2-03 已按批准白名单完成并通过专项验证。
- [x] 已识别终端假模型的两个中文 phase 适配文件，尚未越权修改。
- [x] 用户于 2026-08-28 批准本 Task 修订 3。

## 27. T17-00～T17-09 实施记录

- T17-00：基线、package/lock hash、dirty worktree 归属与旧 `run.started` 内联冻结 fixture 已确认。
- T17-01：需求 ID、Plan Mode 公共契约、预算别名、错误码和 strict 事件 Schema 已完成。
- T17-02：System Prompt V2 的 normal/planning/executing 确定性 overlay 已完成并受 token/安全测试约束。
- T17-03：`plan.proposed`、`plan.approval.resolved`、phase、pending plan、双计数与旧事件兼容投影已完成。
- T17-04：Context 从 durable history 推导 phase，映射计划与批准，并按 phase 估算三/六工具已完成。
- T17-05：planning 工具定义过滤与 prepare 前 Runtime 二次拒绝已完成；伪造写调用返回 `TOOL_PHASE_DENIED`。
- T17-06：独立计划 waiter、身份校验、durable-first 批准、continuation 清除、同 run 执行、拒绝/取消和 append failure 保持 pending 已完成。
- T17-07：模型请求 60/120、工具调用 120/240、批次原子限制、三次同一只读事实和既有三次错误保护已完成。
- T17-08：Terminal `/plan`、`/approve-plan`、`/reject-plan`、准确状态/事件文案及自动集成测试已完成。
- T17-09：[`17-agent-plan-terminal-acceptance.md`](./17-agent-plan-terminal-acceptance.md) 已生成；确定性假模型与临时 fixture 已真实执行和安全清理。

实施中曾出现一次全量回归失败：新预算常量提前改变了旧 Server `maxIterations` 30 次边界。修正为保留 deprecated legacy alias 30/30，核心和 Terminal 使用新 `maxModelRequests` 60/120；因此在 T17-10 前未修改 Server 契约。修正后全量 104 个文件、792 项测试通过。

**中间门禁结论：核心与 Terminal 已完成，用户于 2026-08-28 明确回复“阶段17终端人工验收通过”。T17-10～T17-13 已解锁；完成 T17-14 Summary 后必须再次停止等待用户审批。**

## 28. T17-10～T17-14 实施记录

- T17-10：Run HTTP body 已标准化 `planningEnabled`、模型请求/工具调用预算与 legacy alias；新增独立计划审批 Route、Server Application 方法、有限 404/409 映射和同一 NDJSON 流集成测试。
- T17-11：Client 增加 strict config/plan DTO、默认关闭的运行请求、独立计划审批 API、phase/pending plan/双计数投影和纯文本计划 Transcript item。
- T17-12：主页与 Session 共用“先规划后执行”开关；新增不自动聚焦同意操作的纯文本计划审批区；详情抽屉显示真实 phase、模型请求和工具调用预算；旧“轮次 / 30”文案已移除。
- T17-13：新增 9 项 Plan Mode E2E，并完成 105 个 Vitest 文件 / 799 项测试、33 项完整 E2E、coverage、lint、typecheck、build、安全扫描、diff 检查和依赖哈希核对。
- T17-14：[`17-agent-orchestration-plan-mode-summary.md`](./17-agent-orchestration-plan-mode-summary.md) 已生成，README 已切换为 Summary 待审批。

实施中由测试发现并修正：Server 公共导出清单遗漏新 Schema；Route 对计划审批联合结果缺少类型收窄；计划 durable 提案到达后 live 草稿未清除会造成重复显示。全部修正后专项与全量回归通过。

**历史门禁结论：修订 1 实施和内部验证曾完成；因用户在 Summary 审批前提出中文模型上下文要求，现已回到 Spec/Task 修订流程，本结论不再解锁阶段 18。**

## 29. T17-R2-01：固定模型消息清单、需求追踪与失败测试

### 输入

- 已批准 Spec 修订 2 的第 1.1、1.2、4、9、16 节。
- 原 T17-00～T17-14 实现和 105/799 Vitest、33/33 E2E 基线。
- 当前 dirty worktree；禁止 reset、stash 或覆盖既有阶段产物。

### 操作

1. 在 `01-requirements.md` 增加 `FR-016`、`NFR-013`、`SEC-012`，不改写既有需求含义。
2. 记录实现前基线：
   - `git status --short`
   - `git diff --check`
   - `shasum -a 256 package.json pnpm-lock.yaml`
   - Context、Tools、Agent Plan Mode 和 Terminal 专项测试。
3. 建立固定模型自然语言入口清单并锁定：
   - `renderSystemPolicy()` 的通用和三 phase policy。
   - `renderContextMemory()` 的固定标签与状态短语。
   - `CONTEXT_SUMMARY_POLICY` 与 summary user wrapper。
   - 计划批准/拒绝 synthetic user message。
   - 六个 `function.description` 与生成后 parameter descriptions。
   - planning phase 的固定能力拒绝 ToolResult。
4. 先新增失败测试，证明当前仍存在英文固定句子、工具参数说明缺失、System Prompt 仍为 V2。
5. 为协议 token 建立显式白名单：`SEcode`、phase、工具名、JSON key、错误码、`SHA-256`、`UTF-8` 等；白名单不得包含完整自然语言句子。
6. 使用包含英文路径、代码、命令和输出的 fixture，先锁定这些原始事实在 Context 中逐字保持。

### 允许文件

```text
docs/development/01-requirements.md
tests/unit/context/model-language.test.ts（新增）
tests/unit/context/history-projector.test.ts
tests/unit/context/token-estimator.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/context/helpers.ts（仅测试辅助）
tests/unit/tools/schemas.test.ts
tests/unit/tools/registry.test.ts
tests/unit/agent/runtime-plan-mode.test.ts
tests/unit/agent/helpers.ts（仅测试辅助）
```

### 最小验证

先记录预期失败，再在本任务末确认既有非中文化基线仍通过：

```text
pnpm exec vitest run \
  tests/unit/context/token-estimator.test.ts \
  tests/unit/context/summary-generator.test.ts \
  tests/unit/context/runtime-integration.test.ts \
  tests/unit/tools/schemas.test.ts \
  tests/unit/tools/registry.test.ts \
  tests/unit/agent/runtime-plan-mode.test.ts
```

### 完成条件

- 每个固定模型消息入口都有失败断言和对应后续任务归属。
- 测试明确区分中文自然语言、稳定协议标识与原始事实。
- 只修改需求和测试，不修改生产代码。

覆盖：`FR-016`、`NFR-013`、`SEC-012`、`AC17-14`～`AC17-15`。

## 30. T17-R2-02：System Prompt、Memory、Summary 与计划决定中文化

### 输入

- T17-R2-01 固定入口测试。
- Spec 第 9.1～9.5、9.7～9.8 节。

### 实现

1. 将 `SYSTEM_PROMPT_VERSION` 从 2 升级为 3；不改变 `CONTEXT_PROTOCOL_VERSION`、事件或存储版本。
2. 将身份/安全和证据/完成 policy 全部改写为含义等价、简洁、无歧义的中文。
3. 将 normal、planning、executing 三个 phase overlay 全部中文化，保持原能力边界：
   - normal 自主观察、修改、验证，不等待计划审批。
   - planning 只读、输出完整计划并停止等待明确批准。
   - executing 核对事实后执行已批准计划，但危险工具仍单独审批。
4. 增加默认语言规则：除非用户明确要求其他语言，否则计划、过程说明和最终回答使用中文；代码、标识符、命令与原始事实不强制翻译。
5. 将 `renderContextMemory()` 中 workspace、初始目标、durable summary、计划提案/决定、诊断和当前目标标签改为中文。
6. 将计划批准/拒绝 synthetic user message 改为中文，并保留“不批准危险工具”的安全含义。
7. 将 `CONTEXT_SUMMARY_POLICY` 和 summary user wrapper 改为中文；继续要求中文结构化纯文本、事实状态区分、抗注入、脱敏和 token 目标。
8. 不改变用户目标、历史 assistant/plan 内容、diagnostic 原文和 tool payload 的序列化数据。

### 允许文件

```text
lib/context/system-prompt.ts
lib/context/message-renderer.ts
lib/context/summary-generator.ts
tests/unit/context/model-language.test.ts
tests/unit/context/history-projector.test.ts
tests/unit/context/token-estimator.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/context/runtime-integration.test.ts
```

### 最小验证

```text
pnpm exec vitest run \
  tests/unit/context/model-language.test.ts \
  tests/unit/context/history-projector.test.ts \
  tests/unit/context/token-estimator.test.ts \
  tests/unit/context/summary-generator.test.ts \
  tests/unit/context/runtime-integration.test.ts \
  tests/unit/context/security.test.ts
pnpm typecheck
```

### 完成条件

- V3 三 phase 只注入当前唯一 overlay，固定自然语言为中文。
- 摘要 system/user 请求均为中文，且仍无业务工具或审批能力。
- 英文代码/路径/输出 fixture 逐字保持。
- 中文化后最小支持 context window 的构建/压缩测试通过。

覆盖：`FR-012`、`FR-016`、`SEC-010`～`SEC-012`、`AC17-01`、`AC17-14`。

## 31. T17-R2-03：六工具中文描述、参数说明与能力错误

### 输入

- T17-R2-01 生成后 JSON Schema 失败测试。
- 六工具既有 Schema、默认值、哈希要求和 executor 安全语义。

### 实现

1. 将六个 `function.description` 改为中文，逐项覆盖 Spec 第 9.6 节的真实能力和限制。
2. 为每个工具 property 增加中文 description：
   - `list_directory`: `path/depth/limit`。
   - `read_file`: `path/startLine/endLine`，明确省略 `endLine` 表示读到文件末尾，避免再次使用极大行号模拟“全部内容”。
   - `search_text`: `query/path/caseSensitive/limit`，明确固定字符串、非正则。
   - `write_file`: `path/content/expectedSha256`，明确创建与覆盖分支。
   - `replace_in_file`: `path/oldText/newText/expectedSha256`，明确唯一匹配。
   - `run_process`: `program/args/cwd/timeoutMs`，明确无 shell/env/stdin 和省略默认值。
3. 优先使用字段级 Zod `.describe()`；必须检查 `z.toJSONSchema()` 后的实际对象。若 description 丢失，只允许在 `modelParameters()` 单一出口补充，不复制第二套 Schema。
4. 将人工编写的工具 Schema 校验文本同步中文化，防止未来错误详情扩展重新暴露英文；不改变 Zod code/path 和约束数值。
5. 将 planning phase 的 `TOOL_PHASE_DENIED` summary/message 全部中文化。
6. 保持 `LOCAL_TOOL_NAMES`、字段键、工具排序、planning 子集、错误码及所有参数类型/默认值不变。

### 允许文件

```text
lib/tools/schemas.ts
lib/agent/runtime.ts
tests/unit/tools/schemas.test.ts
tests/unit/tools/registry.test.ts
tests/unit/agent/runtime-plan-mode.test.ts
```

### 最小验证

```text
pnpm exec vitest run \
  tests/unit/tools/schemas.test.ts \
  tests/unit/tools/registry.test.ts \
  tests/unit/agent/runtime-plan-mode.test.ts \
  tests/unit/agent/runtime-tools.test.ts
pnpm typecheck
```

### 完成条件

- 六个 function description 和 21 个工具 property description 在最终 JSON Schema 中均存在且为中文自然语言。
- normal 六工具与 planning 三工具引用同一中文定义对象来源。
- 参数解析、默认值、限制、风险分类和 executor 行为零变化。
- `read_file` 描述明确正确的整文件读取方式。

覆盖：`FR-016`、`NFR-013`、`SEC-012`、`AC17-03`、`AC17-15`。

## 32. T17-R2-04：请求捕获、事实保真、专项回归与中文终端验收

### 自动验证

1. 使用确定性 fake model 捕获 normal、planning、approved execution 三种业务请求：
   - 固定 system/memory 包装为中文。
   - 当前 phase 唯一且含义正确。
   - normal/executing 为六个中文工具定义，planning 为三个中文工具定义。
2. 单独捕获 context summary 请求，断言 system/user wrapper 为中文且 `tools=[]`。
3. 输入英文用户目标、JavaScript 代码、路径、命令和 stdout/stderr 哨兵，断言它们进入模型请求时逐字不变。
4. 运行 Context、Tools、Agent Plan Mode 和 Terminal 专项；确认计划审批、危险工具审批、预算、取消和事实投影无回归。
5. 扫描批准白名单内生产文件，人工复核所有固定模型自然语言入口；不得用全仓 ASCII 零命中作为错误标准。
6. 将确定性假模型的三 phase 请求判断从英文固定句同步为中文，并在集成测试中确认中文工具 description/parameters 实际到达 OpenAI-compatible wire；假模型返回轨迹不变。

### 终端人工验收产物

在 [`17-agent-plan-terminal-acceptance.md`](./17-agent-plan-terminal-acceptance.md) 增加“修订 2 中文模型上下文”章节，提供自动创建临时 fixture 的完整流程：

1. 正常模式提交中文只读任务，确认最终答复为中文、工具调用仍使用英文协议名。
2. Plan Mode 提交中文修复任务，确认计划为中文、批准后同 run 执行并中文总结。
3. 故意触发一次错误 `read_file` 参数，确认工具错误说明为中文且 Agent 能自行修正。
4. 读取包含英文代码/路径的文件，确认事实未被翻译。
5. 记录模型配置、runId、实际模型请求/工具调用数量和测试结果，但不记录 Key。

文档生成后立即停止，等待用户明确回复“阶段17修订2终端人工验收通过”或语义等价批准。

### 允许文件

```text
tests/unit/context/model-language.test.ts
tests/unit/context/history-projector.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/tools/schemas.test.ts
tests/unit/agent/runtime-plan-mode.test.ts
tests/unit/agent/helpers.ts（仅请求捕获辅助）
tests/integration/terminal/runtime.test.ts
tests/integration/terminal/manual-server.test.ts
tests/manual/openai-compatible-server.ts
tests/manual/stage17-fixture.ts（仅必要时）
docs/development/17-agent-plan-terminal-acceptance.md
```

### 最小验证

```text
pnpm exec vitest run tests/unit/context tests/unit/tools/schemas.test.ts tests/unit/tools/registry.test.ts tests/unit/agent/runtime-plan-mode.test.ts tests/unit/agent/runtime-plan-approval.test.ts tests/integration/terminal/runtime.test.ts tests/integration/terminal/manual-server.test.ts
pnpm typecheck
pnpm lint
git diff --check
```

### 完成条件

- 自动请求捕获证明三 phase、摘要和工具定义中文化。
- 原始事实逐字保真，协议 token 未本地化。
- 专项验证全部通过。
- 中文终端验收文档完整，且实现已停止等待用户确认。

覆盖：`FR-016`、`NFR-013`、`SEC-010`～`SEC-012`、`AC17-01`～`AC17-06`、`AC17-14`～`AC17-15`。

## 33. 历史记录：修订 2 中文终端人工验收门禁

T17-R2-04 完成后的状态只能是：

```text
中文模型上下文实现与专项自动验证完成
→ 终端人工验收待用户确认
→ 禁止 T17-R2-05
```

若人工验收发现固定英文遗漏、默认回答语言错误、工具参数误导或原始事实被改写：

- 仍在已批准语义和白名单内：记录失败并修正 T17-R2-02～04，重跑专项，再请用户复验。
- 需要改变语言边界、协议标识、公共接口或安全语义：停止并回到 Spec 修订。
- 需要新增生产文件：停止并修订 Task，重新审批。

## 34. 历史任务：T17-R2-05 全量回归、反思与 Summary 修订

### 前置门禁

- 用户已明确确认阶段 17 修订 2 中文终端人工验收通过。

### 操作

1. 重跑阶段 17 全部专项、全仓 Vitest、coverage、33 项既有 E2E 和生产构建。
2. 核对 package/lock hash、`git diff --check`、秘密扫描和批准文件白名单。
3. 对照 Spec 修订 2 与本 Task 修订 3，逐项确认 `AC17-14`～`AC17-15`。
4. 记录所有失败的“命令 → 症状 → 根因 → 修正 → 重跑”，不得只记录最终成功。
5. 修订 `17-agent-orchestration-plan-mode-summary.md`：保留原 Plan Mode 实施事实，增加中文化过程、文件、测试、人工验收、偏差、风险与反思。
6. 更新 `docs/development/README.md` 为“阶段 17 Summary 修订待用户审批”。
7. Summary 生成后立即停止，不开始阶段 18、最终 README.txt、视频、提交或发布。

### 全量命令

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
git diff --check
shasum -a 256 package.json pnpm-lock.yaml
```

### 允许文件

```text
docs/development/17-agent-orchestration-plan-mode-summary.md
docs/development/README.md
```

生产/测试修正只能回到 T17-R2-02～04 的相应白名单，不能在 Summary 中补代码。

### 完成条件

- 自动和用户终端验收均有真实记录。
- 所有固定应用模型自然语言为中文；协议和原始事实保持不变。
- 全量质量门禁通过，或真实未通过项被明确标为阻断，不能伪造成功。
- Summary 修订待用户审批，阶段 18 仍未开始。

覆盖：阶段 17 全部需求与 `AC17-01`～`AC17-15`。

## 35. 历史记录：Task 修订 3 最终门禁

- [x] 已按批准 Spec 修订 2 拆分 T17-R2-01～R2-05。
- [x] 每项都有输入、操作、允许文件、验证、完成条件与需求映射。
- [x] 已限制为增量中文化，不重做既有 Plan Mode、UI 或 HTTP。
- [x] 已定义 System Prompt V3、动态上下文、摘要、计划决定和工具 Schema 的具体开发细节。
- [x] 已定义原始事实保真、协议白名单和模型请求捕获测试。
- [x] 已设置中文终端人工验收和 Summary 两个停止门禁。
- [x] 已定义失败处理、白名单升级和回到 Spec/Task 的条件。
- [x] 用户于 2026-08-28 批准本 Task 修订 1。
- [x] 已记录修订 1 实施前检查，未提前修改生产代码或测试。
- [x] 修订 2 只增加一个既有测试文件，不改变生产范围或公共语义。
- [x] 用户于 2026-08-28 批准本 Task 修订 2。
- [x] 已记录 T17-R2-01～R2-03 实施与专项通过事实。
- [x] 修订 3 只增加两个终端假模型测试基础设施文件，不改变生产范围或业务轨迹。
- [x] 用户于 2026-08-28 批准本 Task 修订 3。

**历史结论：T17-R2-01～R2-04 当时已完成并通过专项自动验证，随后用户已回复“验证通过”；修订 3 的现行门禁以第 37～48 节为准。**

## 36. T17-R2-01～R2-04 实施记录

- T17-R2-01：`FR-016/NFR-013/SEC-012` 已写入需求追踪；新增固定模型消息、原始事实和生成后工具 Schema 断言。实现前 6 个测试文件中 9 项按预期失败、24 项通过，失败准确命中 V2 英文内容和缺失参数说明。
- T17-R2-02：System Prompt 升级为 V3；身份/安全、证据/完成、normal/planning/executing、Memory、摘要 system/user wrapper 和计划批准/拒绝 synthetic message 已中文化。Context 专项 6 个文件、29 项通过。
- T17-R2-03：六个 function description、21 个 property description、人工编写的 Schema 校验文本及 `TOOL_PHASE_DENIED` 已中文化；工具名、参数键、约束和 executor 未变化。Tools/Runtime 专项 4 个文件、21 项及 typecheck 通过。
- T17-R2-04：捕获 normal/planning/executing/summary 请求，验证中文固定包装与英文用户目标、代码、路径、命令、stdout/stderr 逐字保真；确定性假模型改为中文 phase 路由并验证中文 descriptions 实际到达 wire。
- 修订 2 前置检查发现 `history-projector.test.ts` 白名单遗漏，修订 Task 后才修改；修订 3 前置扫描发现 terminal fake server 仍依赖英文 phase，修订 Task 后才修改，均未越权扩大生产范围。
- 一次专项后 typecheck 发现请求捕获 mock 自引用导致隐式 `any`；改为独立请求计数器后重跑通过，未放宽类型或断言。

最终专项结果：

```text
Vitest：16 个文件、82 项通过
pnpm typecheck：通过
pnpm lint：0 error；coverage 生成目录 2 条既有 warning
git diff --check：通过
固定英文模型文案扫描：零命中
package.json / pnpm-lock.yaml：哈希未变化
```

终端人工验收流程已写入 [`17-agent-plan-terminal-acceptance.md`](./17-agent-plan-terminal-acceptance.md) 第 12～18 节。该记录描述修订 2 当时的停止点；现行状态见第 1 节和第 48 节。

## 37. 修订 3 实施边界、基线与依赖图

T17-R3 是既有阶段 17 的缺陷修订，不重做 Plan Mode，也不推翻修订 1～2 已验收的领域模型。实现前必须保留真实英文输出证据，随后只修改本 Task 列出的文件。

获批后的基线动作：

```text
git status --short
git diff --check
shasum -a 256 package.json pnpm-lock.yaml
pnpm exec vitest run tests/unit/domain tests/unit/agent tests/unit/context tests/unit/model tests/unit/tools tests/unit/terminal
pnpm typecheck
```

基线记录必须包含：命令、退出码、测试文件数、测试项数、package/lock 哈希和既有 dirty 文件归属。不得 reset、stash、覆盖或把阶段 13～17 的既有获批改动误记为本修订产物。

实施依赖：

```text
T17-R3-01 需求追踪、语言分析契约与预期失败测试
  → T17-R3-02 System Prompt V4、Summary 合规门、中文工具标记
  → T17-R3-03 rejected event、Runtime 缓冲/重述/工具正文抑制
  → T17-R3-04 Context/continuation/Projection/预算兼容回归
  → T17-R3-05 Terminal 渲染、自动测试、真实 DeepSeek 人工验收
       ↓ 用户明确确认终端人工验收通过
     T17-R3-06 HTTP/Client/UI/E2E、全量回归、反思与 Summary 修订 3
```

硬门禁：

1. R3-01 必须先建立能命中真实缺陷的失败测试，再写生产实现。
2. R3-02～R3-04 每项必须完成对应专项验证，失败不得带入下一项。
3. R3-05 完成后必须停止，不得以自动测试代替用户真实 DeepSeek 终端验收。
4. 只有用户明确回复“阶段17修订3终端人工验收通过”或语义等价内容，才解锁 R3-06。
5. R3-06 完成后只生成 Summary 修订 3，仍不得进入阶段 18。

## 38. T17-R3-01：需求追踪、语言分析契约与失败测试

### 输入

- 已批准 Spec 修订 3 第 24～30 节。
- 真实 DeepSeek 英文输出诊断证据。
- 当前 `FR-012`～`FR-016`、`NFR-013`、`SEC-012` 与测试基线。

### 操作

1. 将 `FR-017`、`FR-018`、`NFR-014`、`SEC-013` 和 `AC17-16`～`AC17-19` 写入需求基线及追踪表。
2. 固定 `analyzeAssistantLanguage(content)` 的纯函数契约：
   - 返回是否合规、被判定为自然语言的字符统计和稳定原因码。
   - 排除 fenced code、inline code、URL、绝对/相对路径、命令、JSON/协议 token 和明确的原始输出行。
   - 计划与最终回答至少包含可识别的汉字自然语言。
   - 对“无汉字、至少 3 个 ASCII 单词且累计至少 12 个字母”的自然语言段判为英文不合规。
   - 中文句子中保留 Next.js、API、SHA-256、文件名等技术英文，不因英文 token 数量误拒绝。
3. 新增表格驱动失败测试，至少覆盖：纯中文、纯英文前言、中英混合技术词、代码围栏、inline code、URL、路径、命令、JSON、stdout 日志、空正文和仅工具调用。
4. 新增 Runtime 失败轨迹测试：英文 final、英文 plan、连续三次英文、英文 tool-call narrative、多工具调用和取消期间重述。
5. 新增 Summary、Domain event、工具固定标记测试，使它们在生产实现前按预期失败。
6. 记录失败测试名称、失败原因和它与真实缺陷的对应关系；不得通过降低断言获得绿色。

### 允许文件

```text
docs/development/01-requirements.md
docs/development/17-agent-orchestration-plan-mode-tasks.md（仅实施记录）
tests/unit/context/language-policy.test.ts（新增）
tests/unit/context/summary-generator.test.ts
tests/unit/agent/runtime-language-policy.test.ts（新增）
tests/unit/agent/helpers.ts（仅复用请求/事件捕获辅助）
tests/unit/domain/event.test.ts
tests/unit/tools/list-directory.test.ts
tests/unit/tools/run-process.test.ts
tests/unit/tools/output.test.ts
```

若仓库中的实际测试文件名不同，只能使用同一模块下已有测试或新增上述明确文件；新增其他生产/测试文件前必须停止并修订 Task。

### 最小验证

```text
pnpm exec vitest run tests/unit/context/language-policy.test.ts tests/unit/context/summary-generator.test.ts tests/unit/agent/runtime-language-policy.test.ts tests/unit/domain/event.test.ts tests/unit/tools/list-directory.test.ts tests/unit/tools/run-process.test.ts tests/unit/tools/output.test.ts
git diff --check
```

### 完成条件

- 新测试准确复现“Prompt 为中文但模型英文仍被接受”的缺陷。
- 失败集中于缺失语言分析、拒绝事件、Runtime 门、Summary 门和英文工具标记。
- 既有 Plan Mode、审批和工具测试不出现无关回归。
- 需求条目与测试名称双向可追踪。

覆盖：`FR-017`～`FR-018`、`NFR-014`、`SEC-013`、`AC17-16`～`AC17-19`。

## 39. T17-R3-02：System Prompt V4、Summary 合规门与中文工具标记

### 输入

- R3-01 的已记录失败基线。
- Spec 第 25、27、28、29 节。

### 操作

1. 新增无副作用的语言分析模块，实现 R3-01 固定契约；不引入自然语言处理依赖或外部翻译请求。
2. System Prompt 升级为 V4：
   - 明确计划、过程说明、最终回答固定使用简体中文。
   - 明确代码、路径、命令、URL、JSON、日志和稳定协议标识保持原样。
   - 在每次请求的最后注入 `OUTPUT_LANGUAGE_POLICY`，避免长历史稀释规则。
   - 普通用户输入不得覆盖此输出语言策略。
3. Summary generator 在接受摘要前调用同一分析器；英文摘要最多附加中文重述指令重试 2 次，仍不合规则返回结构化失败且不产生 `context.compacted`。
4. Summary 重试复用原取消信号、单次超时和总运行截止时间；不得将摘要请求计入业务 `iteration`，但必须记录内部请求次数供测试。
5. 把应用生成的工具标记中文化：
   - `file/directory/symlink/blocked` → `文件/目录/符号链接/已阻止`。
   - `[stdout]/[stderr]` → `[标准输出]/[标准错误]`。
   - `[TRUNCATED ...]`、`[STREAM MIDDLE OMITTED]` → 等价中文标记。
6. 只翻译应用新增标签，不修改真实文件内容、哈希、stdout/stderr、路径、工具名、JSON key 或错误码。

### 允许文件

```text
lib/context/language-policy.ts（新增）
lib/context/index.ts
lib/context/system-prompt.ts
lib/context/summary-generator.ts
lib/tools/list-directory.ts
lib/tools/run-process.ts
lib/tools/output.ts
tests/unit/context/language-policy.test.ts
tests/unit/context/model-language.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/tools/list-directory.test.ts
tests/unit/tools/run-process.test.ts
tests/unit/tools/output.test.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/context/language-policy.test.ts tests/unit/context/model-language.test.ts tests/unit/context/summary-generator.test.ts tests/unit/context/runtime-integration.test.ts tests/unit/tools/list-directory.test.ts tests/unit/tools/run-process.test.ts tests/unit/tools/output.test.ts
pnpm typecheck
git diff --check
```

### 完成条件

- 语言分析器边界 fixture 全部通过且无外部依赖。
- 捕获的 normal/planning/executing/summary 请求均以 V4 策略结束。
- 英文摘要不会进入上下文压缩结果；中文重述成功和三次失败均可复现。
- 应用固定工具标记为中文，原始事实逐字保持。

覆盖：`FR-017`、`NFR-014`、`SEC-013`、`AC17-16`、`AC17-18`。

## 40. T17-R3-03：拒绝事件与 Runtime 中文输出门

### 输入

- R3-02 已通过的分析器。
- Spec 第 26、27 节及现有 Agent 状态机。

### 操作

1. 增加 additive `model.output.rejected` 事件：
   - `iteration`：当前业务模型请求序号。
   - `reason="language_mismatch"`。
   - `action="retry" | "content_suppressed"`。
   - `retryAttempt`、`contentCharacters`、`contentSha256`。
   - 禁止记录被拒正文、私有 reasoning、秘密和工具参数。
2. 扩展 strict schema、事件工厂/导出、Projection 合法轨迹和 JSONL 兼容测试；旧事件流没有该事件时保持原恢复结果。
3. Runtime 不再边收 provider delta 边发布可见 `assistant.delta`；完整正文通过秘密检查、大小检查和语言检查后，再提交 durable assistant 内容。
4. 对 `finishReason=stop` 的计划或普通/执行最终正文：
   - 不合规则先追加拒绝事件。
   - 在同一 run、同一 phase 内追加中文重述要求，最多重试 2 次。
   - 重试计入业务模型请求数、`maxIterations`、取消和总时限。
   - 第三次仍失败时产生 `run.failed`，错误码为 `AGENT_OUTPUT_LANGUAGE_INVALID`。
5. 对带工具调用的响应：
   - narrative 不合规时只产生 `content_suppressed` 事件。
   - 不把正文持久化或回送；continuation 的 assistant `content` 规范为 `null`。
   - 保留所有 provider tool call、调用 ID、参数片段与私有 reasoning。
   - 每个工具调用按原序仅执行一次；危险操作仍单独审批。
6. 空正文但存在合法 tool_calls 不应被误判；工具结果后的最终正文仍必须通过语言门。
7. 保持用户取消、HTTP 断开、工具超时、连续错误和计划审批语义不变。

### 允许文件

```text
lib/domain/event.ts
lib/domain/model.ts
lib/domain/index.ts
lib/agent/errors.ts
lib/agent/events.ts
lib/agent/projection.ts
lib/agent/runtime.ts
lib/agent/types.ts
lib/agent/schemas.ts（仅实际存在且事件/错误校验需要时）
tests/unit/domain/event.test.ts
tests/unit/agent/runtime-language-policy.test.ts
tests/unit/agent/runtime.test.ts
tests/unit/agent/runtime-plan-mode.test.ts
tests/unit/agent/runtime-plan-approval.test.ts
tests/unit/agent/projection.test.ts
tests/unit/agent/helpers.ts（仅测试辅助）
```

### 最小验证

```text
pnpm exec vitest run tests/unit/domain/event.test.ts tests/unit/agent/runtime-language-policy.test.ts tests/unit/agent/runtime.test.ts tests/unit/agent/runtime-plan-mode.test.ts tests/unit/agent/runtime-plan-approval.test.ts tests/unit/agent/projection.test.ts
pnpm typecheck
git diff --check
```

### 完成条件

- 英文 plan/final 不会成为 durable assistant/plan 内容，也不会作为成功结果展示。
- 中文重述最多 2 次；第三次稳定失败，且每次请求均计入原预算。
- 英文 tool-call narrative 被抑制而工具调用、审批和副作用不重复。
- 拒绝事件可审计但不包含被拒正文或秘密。

覆盖：`FR-017`～`FR-018`、`SEC-013`、`AC17-16`～`AC17-19`。

## 41. T17-R3-04：Context、Provider continuation、Projection 与预算回归

### 输入

- R3-03 的新事件和 Runtime 行为。
- DeepSeek、LongCat、Generic OpenAI 的现有统一消息映射。

### 操作

1. Context projector 不把 `model.output.rejected` 作为模型事实或摘要材料，不把被抑制 narrative 带入后续请求。
2. Provider continuation 对工具响应保留 provider tool call ID、必要 reasoning 字段和 tool turn 配对，但被抑制的 assistant `content` 必须为 `null`。
3. 验证 normal、planning、plan-approved executing 三种 phase 的最后语言策略均存在；旧英文 assistant 历史可以原样作为事实恢复，但不能改变新输出策略。
4. Projection 在刷新恢复后正确统计拒绝次数、当前 phase、业务模型请求数和最终状态；新事件不伪造 assistant 正文。
5. 验证语言重述与以下边界共享同一预算：30 次默认模型请求、用户配置上限、10 分钟总时限、AbortSignal、连续错误/无进展保护。
6. 回归 plan proposal、计划批准/拒绝、危险工具审批、取消、上下文压缩、interrupted 恢复和旧 JSONL fixture。
7. 对 DeepSeek、LongCat、Generic 映射均使用确定性 fixture；本项不调用真实外部模型。

### 允许文件

```text
lib/context/history-projector.ts
lib/context/message-renderer.ts
lib/context/provider-continuation.ts（仅实际存在时）
lib/context/summary-generator.ts（仅 R3-02 回归修正）
lib/model/chat-mapper.ts
lib/model/types.ts
lib/model/index.ts
lib/agent/projection.ts
lib/agent/runtime.ts（仅 R3-03 回归修正）
tests/unit/context/history-projector.test.ts
tests/unit/context/message-renderer.test.ts
tests/unit/context/provider-continuation.test.ts（仅实际存在或新增同名测试时）
tests/unit/context/summary-generator.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/model/chat-mapper.test.ts
tests/unit/agent/runtime-language-policy.test.ts
tests/unit/agent/runtime-plan-mode.test.ts
tests/unit/agent/runtime-plan-approval.test.ts
tests/unit/agent/projection.test.ts
tests/fixtures/agent-history-v1/*.jsonl（只读；禁止改写）
```

若 `provider-continuation` 在仓库中由其他既有 Context 文件承担，只能修改承担同一职责的现有文件，并在实施记录写明映射；不得为迎合清单创建重复抽象。

### 最小验证

```text
pnpm exec vitest run tests/unit/context tests/unit/model tests/unit/agent/runtime-language-policy.test.ts tests/unit/agent/runtime-plan-mode.test.ts tests/unit/agent/runtime-plan-approval.test.ts tests/unit/agent/projection.test.ts tests/unit/domain/event.test.ts
pnpm typecheck
git diff --check
```

### 完成条件

- 被拒正文不会经历史、摘要或 continuation 重新污染下一请求。
- tool-call continuation 满足三类 provider 的结构约束且不重复工具调用。
- 语言重试不重置 run、phase、预算、审批或取消状态。
- 旧 JSONL 零迁移恢复，现有阶段 17 行为无回归。

覆盖：`NFR-014`、`SEC-013`、`AC17-17`～`AC17-19`。

## 42. T17-R3-05：Terminal 渲染、自动验证与真实 DeepSeek 人工验收

### 输入

- R3-01～R3-04 全部专项通过。
- 当前 terminal application/renderer 与阶段 17 验收 fixture。

### 操作

1. Terminal 将新事件显示为简洁中文状态，例如“模型输出语言不符合要求，正在请求中文重述（1/2）”；不得打印被拒正文。
2. `content_suppressed` 显示为“已忽略工具调用前的非中文说明，工具将按原请求执行一次”。
3. 最终失败显示中文说明和稳定错误码 `AGENT_OUTPUT_LANGUAGE_INVALID`。
4. 扩展确定性 OpenAI-compatible 假模型场景：
   - 英文 final 后中文重述成功。
   - 英文 plan 后中文计划成功。
   - 三次英文导致稳定失败。
   - 英文 narrative + 单/多工具调用，只执行一次。
   - 重述等待期间取消。
   - 英文 Summary 后中文重述成功和最终失败。
5. 自动测试断言终端不可见英文 draft、拒绝事件不含原文、工具未重复、计数和取消状态正确。
6. 修订终端人工验收文档，给出环境变量检查、临时 workspace/data root、启动命令、Plan Mode 开/关用例、预期事件和清理方法。
7. 用户使用真实 DeepSeek 至少执行：
   - 普通只读任务，最终回答为中文。
   - Plan Mode 任务，计划正文为中文，批准后同 run 执行。
   - 包含工具调用的修复任务，工具只执行一次且最终总结为中文。
8. 自动验证完成后立即停止，请用户验收；不得开始 R3-06。

### 允许文件

```text
lib/terminal/application.ts
lib/terminal/event-renderer.ts
lib/terminal/types.ts
tests/manual/openai-compatible-server.ts
tests/manual/stage17-fixture.ts
tests/unit/terminal/application.test.ts
tests/unit/terminal/event-renderer.test.ts
tests/integration/terminal/runtime.test.ts
tests/integration/terminal/manual-server.test.ts
docs/development/17-agent-plan-terminal-acceptance.md
docs/development/17-agent-orchestration-plan-mode-tasks.md（仅实施记录）
```

### 最小验证

```text
pnpm exec vitest run tests/unit/domain tests/unit/agent tests/unit/context tests/unit/model tests/unit/tools tests/unit/terminal tests/integration/terminal/runtime.test.ts tests/integration/terminal/manual-server.test.ts
pnpm typecheck
pnpm lint
git diff --check
```

### 完成条件

- 假模型明确先返回英文时，Terminal 只展示中文重述或中文状态。
- `model.output.rejected` 不泄露原文，工具调用与审批零重复。
- 真实 DeepSeek 验收步骤可由用户独立执行，预期结果明确。
- 文档与自动测试完成后严格停在人工门禁。

覆盖：`FR-017`～`FR-018`、`NFR-014`、`SEC-013`、`AC17-16`～`AC17-19`。

## 43. 修订 3 终端人工验收门禁

R3-05 完成后的唯一合法状态：

```text
中文输出强制核心实现与终端专项完成
→ 用户使用真实 DeepSeek 人工验收
→ 等待用户明确确认
→ HTTP/Client/UI/E2E 仍锁定
```

通过口令：用户明确回复“阶段17修订3终端人工验收通过”或语义完全等价的批准。

失败处理：

- 若属于已批准语言边界、事件字段或 Terminal 白名单内缺陷：记录“症状 → 根因 → 修正 → 重跑”，回到 R3-02～R3-05 对应任务。
- 若要改变阈值语义、重试次数、是否缓存 delta、是否允许英文自然语言、事件公开字段或副作用策略：停止并回到 Spec 修订。
- 若需要新增生产文件、扩大 HTTP/Web 范围或改变 provider 协议：停止并修订 Task，重新审批。
- 不得用“模型偶尔会英文”作为跳过验收的理由；第三次不合规必须稳定失败。

## 44. T17-R3-06：HTTP/Client/UI/E2E、全量回归与 Summary 修订 3

### 前置门禁

- 用户已明确确认阶段 17 修订 3 终端人工验收通过。

### 实施前文档要求

1. 按仓库 `AGENTS.md` 阅读 `node_modules/next/dist/docs/` 中与 Route Handler、流式响应和 Client Component 相关的 Next.js 16 本地指南。
2. 修改 TSX 前读取并遵循适用的 React/Next.js 项目规则；把读取文件和关键约束写入实施记录。
3. 不引入 Agent SDK、状态管理框架或新的生产依赖。

### 操作

1. HTTP NDJSON 流透传 `model.output.rejected`，断线取消与 after-seq 恢复保持现有语义。
2. Client strict decoder、事件状态和 transcript projection 接受新事件；旧 Session 刷新恢复不报错。
3. Web 只展示中文状态与已验证 durable assistant 内容；不得将未验证 provider delta 作为可见 draft。
4. 继续使用现有纯文本/打字动画呈现已接受正文；动画只影响视觉，不生成第二套消息真相。
5. 工具 narrative 被抑制时展示一条可审计状态，不能显示被拒正文，也不能重复工具卡片。
6. E2E fake provider 先返回英文，验证 normal、Plan Mode、批准执行、工具调用、三次失败、取消和刷新恢复。
7. 对照 Spec 与 Task 逐项验证 `AC17-16`～`AC17-19`，并回归 `AC17-01`～`AC17-15`。
8. 执行全量 lint、typecheck、unit/integration、coverage、E2E、build、diff check、秘密扫描和依赖哈希核对。
9. 将全部失败按“命令 → 症状 → 根因 → 修正 → 重跑结果”写入实施记录；不得只报告最后一次成功。
10. 修订 Summary 为修订 3，更新开发索引后立即停止，等待用户审批。

### 允许文件

```text
lib/server/application.ts
lib/server/schemas.ts
lib/server/types.ts
lib/client/api.ts
lib/client/event-state.ts
lib/client/transcript.ts
lib/client/types.ts
app/ui/workbench/session-workbench.tsx
app/ui/workbench/transcript.tsx
app/ui/workbench/inspector.tsx（仅实际需要展示状态时）
app/globals.css（仅既有打字动画状态适配）
tests/unit/server/*.test.ts
tests/integration/server/*.test.ts
tests/unit/client/*.test.ts
tests/unit/ui/*.test.tsx
tests/e2e/fixtures/fake-openai-server.ts（或仓库承担同职责的既有文件）
tests/e2e/*.spec.ts
docs/development/17-agent-orchestration-plan-mode-summary.md
docs/development/README.md
docs/development/17-agent-orchestration-plan-mode-tasks.md（仅实施记录）
```

通配符只允许修改与 `model.output.rejected`、validated assistant content 或阶段 17 回归直接相关的既有测试；不得借机改版 UI、重构 API 或扩大产品功能。

### 全量验证

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
git diff --check
shasum -a 256 package.json pnpm-lock.yaml
```

秘密扫描必须覆盖新增事件、fixture、日志和文档，确认 API Key、Authorization header、被拒正文和私有 reasoning 未进入持久化或测试快照。

### 完成条件

- 浏览器与终端都只展示通过合规门的新 assistant 自然语言正文。
- 刷新恢复、取消、Plan Mode、计划审批和危险工具审批保持正常。
- fake provider 英文轨迹和真实 DeepSeek 人工证据均闭环。
- 全量命令通过；若有环境阻断，必须如实记录而不能宣称完成。
- Summary 修订 3 已生成且待用户审批，阶段 18 尚未开始。

覆盖：阶段 17 全部需求、非功能需求、安全需求和 `AC17-01`～`AC17-19`。

## 45. 修订 3 文件白名单总表

| 层 | 允许范围 | 明确禁止 |
| --- | --- | --- |
| Requirements/Docs | `01-requirements.md`、本 Task、终端验收文档；最后才允许 Summary/索引 | 提前改 Summary、阶段 18 文档、最终 `README.txt` |
| Context | 新语言分析器、System Prompt、history/message/summary/continuation | 翻译用户输入、仓库事实或旧 JSONL |
| Tools | 目录类型、进程通道、截断固定标记 | 改工具参数、风险策略、执行语义、原始输出 |
| Domain/Agent | additive rejected event、Runtime 缓冲/重述/抑制、Projection | 改 run/session ID、审批协议、并行工具、创建第二 run |
| Model | 仅 continuation content 规范化及兼容测试 | 改 SSE、认证、endpoint、provider 重试策略 |
| Terminal | 新事件中文渲染与验收 fixture | 改 CLI 命令语义或工作区安全边界 |
| HTTP/Client/UI | 仅终端人工验收后适配新事件和 durable 内容 | 提前修改、重新设计工作台、引入第二状态源 |
| Tests | 与各任务直接对应的 unit/integration/E2E | 触碰真实用户项目、真实 `.secode-data`、泄露凭据 |

发现以下任一情况必须停止：

1. 必须修改 package/lock 或新增生产依赖。
2. 必须改变公共 Route、审批协议、工具参数或 JSONL 迁移策略。
3. 必须增加白名单外生产文件，且不能由同职责既有模块承载。
4. 语言策略需要机器翻译、模型分类器或外部服务。
5. 为通过测试需要弱化路径安全、秘密脱敏、取消或预算限制。

## 46. 修订 3 需求—任务—验收映射

| 需求 | 主任务 | 自动证据 | 人工证据 |
| --- | --- | --- | --- |
| FR-017 新 assistant 中文合规 | R3-01～R3-05 | 分析器、Runtime、Summary、Terminal 测试 | 真实 DeepSeek normal/plan/final |
| FR-018 有限重述与工具正文抑制 | R3-03～R3-06 | stop/tool_calls/多工具/E2E 轨迹 | 修复任务工具仅执行一次 |
| NFR-014 原始事实保真与旧历史兼容 | R3-02、R3-04、R3-06 | fixture、哈希、stdout、旧 JSONL 恢复 | 终端核对路径/命令/输出未翻译 |
| SEC-013 不重复副作用、不泄露、共享预算 | R3-03～R3-06 | 事件字段、取消、审批、预算、秘密扫描 | 审批/取消人工流程 |
| AC17-16 中文计划/过程/最终 | R3-01～R3-06 | fake model 英文后中文重述 | 真实 DeepSeek 三类任务 |
| AC17-17 工具调用零重复 | R3-03～R3-06 | 单/多工具计数与审批测试 | 工作区 diff/事件时间线 |
| AC17-18 技术事实不误拒绝/改写 | R3-01、R3-02、R3-04 | 代码/URL/路径/JSON/日志表格测试 | 终端输出抽查 |
| AC17-19 失败、取消、恢复可解释 | R3-03～R3-06 | 三次失败、Abort、refresh E2E | 终端状态与错误码 |

## 47. 测试纪律、失败记录与回退

1. 所有会写文件或启动进程的测试使用 `mkdtemp` 临时 workspace 和独立 data root；不得以仓库根目录或真实用户工作区作为写入目标。
2. 假模型必须显式返回英文自然语言，不能继续使用固定中文响应冒充缺陷覆盖。
3. 测试同时断言“用户不可见英文 draft”和“被拒正文未持久化”；只断言最终中文不足以验收。
4. 工具调用测试必须以调用次数、文件哈希或可观察副作用证明恰好一次，不能只检查最终成功。
5. 语言阈值测试不得依赖系统 locale、随机数或外部网络。
6. 真实 DeepSeek 只用于人工冒烟，不进入可重复自动套件；任何日志必须脱敏。
7. 每个失败记录原始命令、退出码、症状、根因、实际改动与重跑结果。
8. 若失败揭示 Spec 语义不完整，停止并返回 Spec；若只揭示文件遗漏，停止并修订 Task；不得先改后补授权。
9. 不删除、跳过或 `.only`/`.skip` 既有测试；不降低 coverage 阈值。
10. 不执行 git commit、push、reset、发布、部署、依赖安装或全仓格式化。

## 48. Task 修订 4 审批检查与当前门禁

- [x] 已记录 Spec 修订 3 于 2026-08-29 获用户批准。
- [x] 已把 `FR-017`～`FR-018`、`NFR-014`、`SEC-013` 映射到具体任务和验收。
- [x] 已采用测试先行，先复现真实英文输出缺陷，再写生产实现。
- [x] 已固定 System Prompt V4、确定性语言分析、有限重述和第三次稳定失败。
- [x] 已区分 stop completion 重述与 tool-calls narrative 抑制，禁止重复工具副作用。
- [x] 已定义不含原文的 durable rejected event、旧历史兼容和 provider continuation。
- [x] 已定义 Summary 合规门、预算/取消/时限复用和上下文防污染。
- [x] 已列出中文工具固定标记与原始事实保真边界。
- [x] 已为每项列出输入、操作、允许文件、最小验证、完成条件和需求覆盖。
- [x] 已设置真实 DeepSeek Terminal 人工验收，且 HTTP/Client/UI/E2E 在该门禁前锁定。
- [x] 已定义全量回归、秘密扫描、失败记录和回到 Spec/Task 的条件。
- [x] 已规定 Summary 修订 3 是下一最终文档门禁，阶段 18 继续锁定。
- [x] 用户于 2026-08-29 明确批准本 Task 修订 4。

**历史结论：T17-R3-01～R3-06、修订 3 终端人工验收和全量验证均已完成；其后已进入修订 4。**

## 49. T17-R3-01～R3-05 实施记录

### 49.1 基线与测试先行

- 实施前基线：54 个测试文件、387 项测试通过；`pnpm typecheck` 通过。
- package hash：`5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13`。
- lock hash：`5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683`。
- 工作区已有阶段 13～17 大量获批 dirty 文件；未 reset、stash、清理或覆盖白名单外改动。
- R3-01 红灯：7 个目标测试文件中 12 项预期失败、35 项通过。失败分别命中缺少语言分析器、Runtime 接受英文、Summary 接受英文、缺少 rejected event 和英文工具标记，没有用无关失败代替缺陷证据。

### 49.2 R3-02：语言策略、Prompt、Summary 和工具标记

- 新增纯函数 `analyzeAssistantLanguage`：排除代码围栏、inline code、URL、路径、命令、JSON、原始输出行和协议行；对自然语言统计汉字、英文单词和英文字母，不返回源正文。
- System Prompt 升级到 V4；normal、planning、executing 请求最后均追加固定 `OUTPUT_LANGUAGE_POLICY`，普通用户自然语言不能覆盖。
- Summary 使用同一语言门，英文结果最多中文重述 2 次；第三次返回 `CONTEXT_SUMMARY_INVALID`，不会提交压缩事件。
- 目录类型、进程通道和截断标记已改为中文；真实文件内容、stdout/stderr 字节、路径、命令、哈希与协议字段不翻译。

### 49.3 R3-03：事件与 Runtime

- 新增 strict `model.output.rejected` durable event，只含 iteration、reason、action、retryAttempt、字符数和 SHA-256；Schema 拒绝额外正文。
- Runtime 不再转发未验证 provider delta。完整正文脱敏、检查大小并通过语言门后，才发布 accepted live 内容和 durable assistant/plan 事实。
- 英文 `stop` 正文在同一 run 请求中文重述，额外请求计入原模型请求预算；连续第三次不合规以 `AGENT_OUTPUT_LANGUAGE_INVALID` 失败。
- 英文 tool-call narrative 只产生 `content_suppressed`，工具 ID、参数、审批和执行顺序不变，工具调用只执行一次。
- 中文重述期间若模型返回新的工具调用，直接以语言输出错误停止，避免借重述新增副作用。

### 49.4 R3-04：历史、Continuation 与预算

- Agent Projection 允许 rejected stop 后的下一次连续 model request，但不伪造 final 或 plan。
- Context History 使用独立模型请求序号，跳过 rejected stop round；被拒正文和拒绝元数据都不进入模型消息或摘要材料。
- Provider continuation 只把被抑制工具说明的 `content` 设为 `null`，保留 provider tool-call ID、对象参数和私有 reasoning；LongCat 映射专项已覆盖。
- 旧 JSONL 没有新事件时保持原解析；Plan Mode、批准/拒绝、取消、上下文压缩和模型/工具预算继续使用原语义。

### 49.5 R3-05：Terminal 与自动验收

- Terminal 对 retry 和 content suppression 使用中文状态，不显示正文或 SHA-256。
- 确定性测试覆盖英文 final 后中文成功、英文 plan 后中文成功、连续三次英文失败、英文工具说明只执行一次、重述期间取消和英文 Summary。
- OpenAI-compatible 假服务器新增英文 first-response、持续英文、英文计划和英文工具说明轨迹；新的尾部 System Policy 不再破坏工具结果路由。
- 终端人工验收文档新增第 20～27 节，覆盖真实 DeepSeek normal、Plan Mode、工具修正、事件脱敏、恢复和安全清理。

### 49.6 开发中发现并修正的问题

1. 新事件加入领域联合后，Terminal 的穷尽分支导致 typecheck 失败；补充中文渲染与正文不泄露测试后恢复通过。
2. 输出大小检查最初晚于语言事件，超大英文正文会使 rejected event 自身越界；将 1 MiB 检查提前，恢复原 `AGENT_ASSISTANT_MESSAGE_TOO_LARGE` 语义。
3. Context 请求末尾增加 System Policy 后，三个旧测试仍假设 user 是最后一条消息；更新为同时断言倒数第二条原始 user 和最后一条强制策略。
4. 测试文件按仓库实际职责分散在 `runtime-completion`、`runtime-cancellation`、`provider`、`public-api` 等既有文件；只修改同模块直接回归断言，没有增加白名单外生产职责。

### 49.7 专项结果与当前门禁

```text
核心/模型/上下文/工具/终端：58 个测试文件、432 项通过
Terminal 语言专项：3 个测试文件、28 项通过
pnpm typecheck：通过
pnpm lint：0 error；coverage 生成目录 2 条既有 warning
git diff --check：通过
package.json / pnpm-lock.yaml：哈希未变化
```

## 50. T17-R3-06 实施记录

### 50.1 Next.js/React 复核与最小实现

- 实施前阅读 Next.js 16.3.3 本地 `15-route-handlers.md`、`streaming.md`、`use-client.md` 和 `05-server-and-client-components.md`；确认 Route Handler 使用原生 Request/Response、动态 params 异步读取、交互边界位于 Client Component 且 props 可序列化。
- 现有 Node Route、NDJSON bridge、Client strict decoder 均直接使用 `AgentEventSchema`，新事件已由领域联合自动透传；没有增加专用 Route、第二协议或服务端状态。
- Client Run Projection 新增 `restating_output`；Transcript 为 retry/content_suppressed 提供中文 warning；Session 顶部显示“正在请求中文重述”。UI 不渲染字符数、SHA-256 或拒绝正文。
- React 复核确认 TSX 只增加静态状态映射和事件详情分支，没有新增 Hook、effect、数据请求、非序列化 props 或客户端依赖。

### 50.2 测试先行与浏览器覆盖

- Client 红灯：3 个测试文件中 2 项失败、22 项通过，准确命中“状态仍为 running”和“tone 仍为 neutral”；实现后 24/24 通过。
- HTTP NDJSON 集成新增英文 final 后中文重述轨迹，证明 stream/JSONL 只有 rejection 元数据和合规正文；`run-stream` 4/4 通过。
- E2E fake provider 新增 `english-final-retry`、`english-plan-retry`、`english-tool-narrative`、`always-english`、`english-retry-cancel`。
- 新增 5 项 E2E 全部通过：英文 final 抑制与刷新、英文 plan 重述和同 run 批准、工具 narrative 零重复、三次英文有限失败、重述期间取消和 durable 恢复。

### 50.3 失败、诊断与修正

1. 本地 Next.js 文档首次用旧 `.mdx` 路径读取失败；通过 `rg --files` 定位当前 `.md` 后完成阅读。
2. 原仓库已有用户 `next dev` PID 80833，Next.js 16 拒绝第二个同目录实例；未终止用户服务，先用 agent-browser 确认页面有内容、关键交互可见、无 error overlay。
3. 临时镜像第一次仍从原目录启动，第二次因外部 `node_modules` symlink 被 Turbopack 拒绝；改为从镜像启动并复制依赖后成功。完成后镜像移动到废纸篓。
4. 新语言 E2E 首轮 4/5；唯一失败是工具用例在 `run.completed` 前读取历史得到 Session busy。增加等待 durable 完成状态后重跑 5/5。
5. 宽泛 `sk-` 扫描误命中文档路径和伪密钥测试；只输出类别/文件定位后，以真实长凭据、Bearer 和非空 Key 赋值规则复扫通过。

### 50.4 全量结果

```text
pnpm lint：通过；0 error，coverage 生成目录 2 条既有 warning
pnpm typecheck：通过
pnpm test：108 个测试文件、839 项通过
pnpm test:coverage：108/839 通过
  Statements 88.19% / Branches 81.87% / Functions 91% / Lines 89.78%
pnpm test:e2e：38/38 通过，workers=1、retries=0
pnpm build：Next.js 16.3.3 生产构建通过；保留既有动态路径 tracing warning
git diff --check：通过
秘密扫描：通过
UI rejected metadata 渲染扫描：通过
package.json / pnpm-lock.yaml：哈希未变化
```

E2E 与 build 在当前代码的隔离镜像中执行，原因是用户现有 3000 端口开发服务不能被中断；原仓库 lint/typecheck/Vitest/coverage/diff/扫描均直接执行。没有修改 Playwright workers/retries、终止用户服务或触碰真实用户工作区/Session。

### 50.5 最终门禁

- [x] R3-01～R3-06 全部完成。
- [x] 修订 3 终端人工验收已确认。
- [x] `AC17-16`～`AC17-19` 与阶段 17 既有验收全部回归。
- [x] Summary 修订 3 和开发索引已更新。
- [ ] 用户批准 Summary 修订 3。

**历史停止点：Summary 修订 3 的审批等待后来因修订 4 撤回。**

## 51. Task 修订 5 状态、输入与固定决策

- Task 日期：2026-08-29（北京时间）。
- 上游规格：[`17-agent-orchestration-plan-mode-spec.md`](./17-agent-orchestration-plan-mode-spec.md) 修订 4，第 34～42 节，已获用户批准。
- 本修订原因：默认 60 次模型请求门会在任务仍有进展时提前失败；用户批准改为默认无模型请求次数门，并把工具调用默认预算与可配置硬上限统一为 300。
- 历史状态：Task 修订 5 已获用户批准并实施完成；Summary 修订 4 的审批等待后来因真实运行失败撤回。
- 实施只允许修改第 58 节白名单，并遵守每项最小验证和失败记录。

以下决策在实现中不可临时改变：

1. `maxModelRequests` 未配置时保持 `undefined`，不得使用 `Infinity`、最大整数、0 或其他哨兵。
2. 显式 `maxModelRequests` 与旧输入别名 `maxIterations` 均允许 1～120；同时出现继续拒绝。
3. `DEFAULT_MAX_MODEL_REQUESTS` 删除；`MAX_MODEL_REQUESTS=120` 保留。
4. `DEFAULT_MAX_TOOL_CALLS=300`、`MAX_TOOL_CALLS=300`；显式 1～300 有效，301 拒绝。
5. `run.started.data.limits.maxIterations` 改为 optional；新 run 只有显式请求上限时才写该 wire 字段。
6. 旧 JSONL 中的 `maxIterations` 数值继续表示该旧 run 的真实上限；新事件缺失时不得回填 60 或 30。
7. Server config 使用 `defaultMaxModelRequests: null`、`maximumModelRequests: 120`、`defaultMaxToolCalls: 300`、`maximumToolCalls: 300`。
8. deprecated config 字段继续保留键名以避免删除式破坏，但语义同步为 `defaultMaxIterations: null`、`maximumIterations: 120`；它们不能驱动 Runtime。
9. `AGENT_ITERATION_LIMIT`、`iteration/iterations`、Plan Mode、中文重述、审批、取消和上下文压缩语义不变。
10. 默认无请求次数门仍共享 10 分钟总时限、300 工具预算、第三次重复错误/无进展保护和单请求超时。

需求覆盖：`FR-004`、`FR-015`、`NFR-004`、`NFR-010`、`NFR-011`、新增 `NFR-015`、`SEC-013`、`AC17-20`～`AC17-24`。

## 52. 依赖顺序与实施纪律

```text
T17-R4-01 需求追踪、公共 limits 契约与红灯测试
  → T17-R4-02 Runtime、durable 事件、Projection 与恢复
  → T17-R4-03 Server、Terminal 与跨层 DTO
  → T17-R4-04 Client/Web 与 E2E
  → T17-R4-05 全量验证、反思、Summary 修订 4
```

每项任务固定遵循：

1. 先对照 Spec/Task 和现有 dirty worktree，不覆盖修订 1～3 或用户其他改动。
2. 先增加能命中旧行为的失败测试，再做最小生产修改。
3. 完成一项即运行该项最小验证；失败要记录症状、根因、修改和重跑结果。
4. 不批量把旧 fixture 的 `maxIterations` 删除；旧有值是兼容性证据。只新增必要的“新事件缺失字段”fixture。
5. 若必须改变第 51 节公共契约、安全边界或验收标准，停止并回到 Spec；若只需增加文件或调整任务依赖，停止并修订 Task。

## 53. T17-R4-01：需求追踪、公共 limits 契约与红灯测试

### 输入

- Spec 修订 4 第 35、36、39 节。
- 当前 `lib/agent/types.ts`、`schemas.ts`、Server/Client config Schema 和相关 public API 测试。
- 当前需求中的过期 `NFR-004` 与 `FR-015`。

### 操作

1. 更新 `01-requirements.md`：
   - 修订 `FR-015`、`NFR-004`、`NFR-010`、`SEC-013`。
   - 新增 `NFR-015`。
   - 新增 `AC17-20`～`AC17-24` 追踪表，不改写修订 3 历史验收。
2. 先写失败测试，锁定：
   - 未传模型请求限制时 parsed limits 中没有 `maxModelRequests`。
   - `maxModelRequests/maxIterations` 1～120 与冲突校验。
   - 工具默认/最大 300，301 拒绝。
   - Agent public API 不再导出 `DEFAULT_MAX_MODEL_REQUESTS`。
   - Server/Client config 接受 `null` 默认请求上限并保留最大值 120。
3. 修改 limits 常量、类型和 Schema：
   - 删除 `DEFAULT_MAX_MODEL_REQUESTS` 与误导的数字默认路径。
   - 将 normalized `maxModelRequests` 设为 optional。
   - 将工具默认/最大值均设为 300。
   - deprecated `maxIterations` 输入复用 120 硬上限，不再受旧 30 限制。
4. 不在本任务修改 Runtime 循环、durable Schema、Terminal 或 UI。

### 允许文件

- `docs/development/01-requirements.md`
- `lib/agent/types.ts`
- `lib/agent/schemas.ts`
- `lib/agent/index.ts`
- `lib/server/types.ts`
- `lib/client/schemas.ts`
- `tests/unit/agent/schemas.test.ts`
- `tests/unit/agent/public-api.test.ts`
- `tests/unit/server/schemas.test.ts`
- `tests/unit/client/schemas.test.ts`

`lib/server/types.ts` 和 `lib/client/schemas.ts` 只允许先调整 config 类型/解析契约；config 值的生产接线留给 R4-03。

### 最小验证

```text
pnpm exec vitest run \
  tests/unit/agent/schemas.test.ts \
  tests/unit/agent/public-api.test.ts \
  tests/unit/server/schemas.test.ts \
  tests/unit/client/schemas.test.ts
pnpm typecheck
git diff --check
```

### 完成条件

- 需求追踪与批准 Spec 一致。
- optional/default/max/legacy alias 的类型和 Schema 无歧义。
- 红灯确实由旧 60/120/240/30 契约导致，生产修改后全部转绿。
- Runtime 和 durable 行为尚未改变。

## 54. T17-R4-02：Runtime、durable 事件、Projection 与恢复

### 输入

- R4-01 已通过的 limits 契约。
- Spec 修订 4 第 36.2、36.3、37、39 节。
- 当前 Runtime、Agent Projection、Domain event Schema 和冻结恢复 fixture。

### 操作

1. 测试先行覆盖：
   - 默认 run 的 `run.started.limits` 省略 `maxIterations`，写入 `maxToolCalls=300`。
   - 显式 `maxModelRequests` 或 `maxIterations` 时 wire 仍写 `maxIterations`。
   - 由至少 61 个具有不同参数/结果的工具回合组成的任务可在第 62 次或之后正常 `stop` 完成，不触发 `AGENT_ITERATION_LIMIT`。
   - 显式请求上限 1 在第二次业务请求前继续以现有错误码失败。
   - 默认工具预算 300 与显式较低工具批次原子限制同时有效。
   - 旧 `maxIterations=30/60` 事件恢复为有上限；新缺失事件恢复为无上限。
2. Domain：把 `run.started.data.limits.maxIterations` 改为 optional positive integer，其他 durable 字段不变。
3. Runtime：只有 `active.limits.maxModelRequests !== undefined` 时检查请求上限；append `run.started` 时按 optional 语义构造对象。
4. Agent 类型和 Projection：`maxIterations/maxModelRequests` 改为 optional；旧事件有值原样投影，新事件缺失不填默认数字。
5. 工具预算继续在整批 prepare/approval/execution 前原子检查；未知、非法、phase denied 和失败调用继续计数。
6. 不修改 Context 压缩算法；只运行 Context 回归证明 optional wire 不破坏历史投影和摘要。

### 允许文件

- `lib/domain/event.ts`
- `lib/agent/types.ts`
- `lib/agent/runtime.ts`
- `lib/agent/projection.ts`
- `tests/unit/domain/event.test.ts`
- `tests/unit/agent/helpers.ts`
- `tests/unit/agent/runtime-limits.test.ts`
- `tests/unit/agent/projection.test.ts`
- `tests/unit/agent/recovery.test.ts`
- `tests/unit/context/helpers.ts`
- `tests/unit/context/provider.test.ts`
- `tests/unit/context/runtime-integration.test.ts`
- `tests/unit/storage/recovery.test.ts`

Context/Storage 测试文件只允许增加或调整直接受 optional `run.started` 影响的 fixture/断言，不修改生产 Context/Storage 代码；若生产代码必须变化，先停止并修订 Task。

### 最小验证

```text
pnpm exec vitest run \
  tests/unit/domain/event.test.ts \
  tests/unit/agent/runtime-limits.test.ts \
  tests/unit/agent/projection.test.ts \
  tests/unit/agent/recovery.test.ts \
  tests/unit/context/provider.test.ts \
  tests/unit/context/runtime-integration.test.ts \
  tests/unit/storage/recovery.test.ts
pnpm typecheck
git diff --check
```

### 完成条件

- 默认路径超过 60 次仍有进展时可继续并正常完成。
- 显式请求保险、300 工具预算和所有其他保护保持有效。
- 新旧 durable 事件均严格解析、恢复和展示正确上限语义。
- 没有迁移或重写任何 JSONL。

## 55. T17-R4-03：Server、Terminal 与跨层 DTO

### 输入

- R4-01～R4-02 已通过的 Domain/Agent 契约。
- Spec 修订 4 第 36.4、39.3 节。
- 当前 Server config/run DTO、Terminal `/status` 与 event renderer。

### 操作

1. Server 请求 Schema 不再为缺失输入注入 60；显式新/旧字段仍透传为同一 optional 上限。
2. Public config 固定为：

```ts
{
  defaultMaxModelRequests: null,
  maximumModelRequests: 120,
  defaultMaxToolCalls: 300,
  maximumToolCalls: 300,
  defaultMaxIterations: null,
  maximumIterations: 120,
  defaultMaxDurationMs: 600000,
  maximumDurationMs: 600000,
}
```

3. Server public types、Client strict config decoder 和 public API 测试同步 nullable 字段；不删除 deprecated 键。
4. Terminal `/status`：始终显示已用模型请求数；无显式上限时分母显示“未设置”，旧/显式上限显示真实数字。
5. `run.started` renderer：无上限时显示“模型请求上限未设置”；工具上限显示事件中的 300。旧事件缺失 `maxToolCalls` 时只为历史展示保留原 120 fallback，不把该 fallback 写回 Runtime。
6. Server/Terminal 集成测试覆盖默认、显式上限、Plan Mode 同 run 审批后继续和历史恢复。

### 允许文件

- `lib/server/application.ts`
- `lib/server/schemas.ts`
- `lib/server/types.ts`
- `lib/server/index.ts`
- `lib/client/schemas.ts`
- `lib/terminal/application.ts`
- `lib/terminal/event-renderer.ts`
- `tests/unit/server/application.test.ts`
- `tests/unit/server/schemas.test.ts`
- `tests/unit/server/public-api.test.ts`
- `tests/unit/client/schemas.test.ts`
- `tests/unit/terminal/application.test.ts`
- `tests/unit/terminal/event-renderer.test.ts`
- `tests/integration/server/run-stream.test.ts`
- `tests/integration/server/plan-approval-route.test.ts`
- `tests/integration/server/recovery-security.test.ts`
- `tests/integration/terminal/runtime.test.ts`

### 最小验证

```text
pnpm exec vitest run \
  tests/unit/server/application.test.ts \
  tests/unit/server/schemas.test.ts \
  tests/unit/server/public-api.test.ts \
  tests/unit/client/schemas.test.ts \
  tests/unit/terminal/application.test.ts \
  tests/unit/terminal/event-renderer.test.ts \
  tests/integration/server/run-stream.test.ts \
  tests/integration/server/plan-approval-route.test.ts \
  tests/integration/server/recovery-security.test.ts \
  tests/integration/terminal/runtime.test.ts
pnpm typecheck
git diff --check
```

### 完成条件

- HTTP default、显式新字段和旧别名与核心完全一致。
- Public config 不再声称存在数字默认模型请求上限。
- Terminal 新旧事件展示清晰且不出现 `/undefined`、`/Infinity` 或哨兵值。
- Plan Mode/审批/取消集成回归通过。

## 56. T17-R4-04：Client/Web 展示与 E2E

### 输入

- R4-03 的 Public config、event 和 snapshot 契约。
- Spec 修订 4 `AC17-23`。
- 当前 Client event projection、Details Drawer 和 Plan Mode E2E。

### 操作

1. Client projection 保持 `maxModelRequests?: number`：新事件缺失时不回填；旧事件有值时原样展示。
2. 新事件总能从 durable `maxToolCalls=300` 得到工具分母；旧事件缺失时允许只读历史展示为 `—`，不得把 Client fallback 当作 Runtime 事实。
3. Details Drawer 显示：
   - 默认新 run：`模型请求 N / —`、`工具调用 M / 300`。
   - 显式或旧 run：模型请求显示真实分母。
4. 更新 Client 单元测试和 `plan-mode` E2E 中旧 `/60`、`/120` 断言；新增默认无上限与工具 300 的刷新恢复断言。
5. 不增加新的 UI 控件：用户无需在 Web 中配置模型请求保险；HTTP/Terminal 测试已覆盖显式输入。
6. 预计现有 `details-drawer.tsx` 已支持 `—`，若测试无需生产修改则不触碰；若确需修改，仅允许该文件做最小渲染修正，并先阅读本地 Next.js 16 Client Component 指南。

### 允许文件

- `lib/client/event-state.ts`
- `tests/unit/client/event-state.test.ts`
- `tests/unit/client/transcript.test.ts`
- `tests/e2e/plan-mode.spec.ts`
- `app/ui/workbench/details-drawer.tsx`（仅在失败测试证明必要时）

### 最小验证

```text
pnpm exec vitest run \
  tests/unit/client/event-state.test.ts \
  tests/unit/client/transcript.test.ts
pnpm exec playwright test tests/e2e/plan-mode.spec.ts --workers=1
pnpm typecheck
git diff --check
```

### 完成条件

- 默认新 run、显式上限 run 和旧历史三种展示均准确。
- 页面刷新后 optional 上限没有被 Client 改写。
- E2E 不依赖真实模型或真实用户 Session。
- 没有新增第二套预算状态或 UI 配置入口。

## 57. T17-R4-05：全量验证、反思与 Summary 修订 4

### 前置条件

- R4-01～R4-04 的最小验证全部通过。
- 实现没有超出第 58 节文件白名单和 Spec 范围。

### 操作

1. 审查完整 diff，确认只改变默认请求门、工具 300、兼容字段和展示。
2. 搜索生产代码中的 `DEFAULT_MAX_MODEL_REQUESTS`、硬编码 `/60`、工具 `120/240` fallback，区分必须删除的新路径与必须保留的旧历史 fixture。
3. 运行全量质量门禁并记录真实结果、耗时、失败和修正。
4. 更新本 Task 的实施记录、`README.md` 阶段状态和 Summary 修订 4。
5. Summary 必须明确：旧 Summary 修订 3 的实现仍有效；本修订只追加预算优化，未执行真实模型测试、commit、push 或阶段 18 工作。
6. 生成 Summary 修订 4 后立即停止等待用户审批。

### 全量验证

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
git diff --check
```

补充只读检查：

```text
rg -n "DEFAULT_MAX_MODEL_REQUESTS|maxModelRequests|maxIterations|maxToolCalls|MAX_TOOL_CALLS" lib app tests
git status --short
```

`rg` 命中不是自动失败；必须逐项区分新契约、deprecated 兼容、旧 JSONL fixture 和过期硬编码。

### 允许文件

- 本 Task 第 58 节白名单内文件。
- `docs/development/17-agent-orchestration-plan-mode-tasks.md`
- `docs/development/17-agent-orchestration-plan-mode-summary.md`
- `docs/development/README.md`

### 完成条件

- `AC17-20`～`AC17-24` 全部具有测试证据。
- 全量质量门禁通过，或外部阻塞被准确记录且未伪造通过。
- Summary 修订 4 待审批；阶段 18 仍锁定。

## 58. Task 修订 5 文件白名单总表

### 58.1 生产与需求文件

```text
docs/development/01-requirements.md
lib/domain/event.ts
lib/agent/types.ts
lib/agent/schemas.ts
lib/agent/index.ts
lib/agent/runtime.ts
lib/agent/projection.ts
lib/server/application.ts
lib/server/schemas.ts
lib/server/types.ts
lib/server/index.ts
lib/client/schemas.ts
lib/client/event-state.ts
lib/terminal/application.ts
lib/terminal/event-renderer.ts
app/ui/workbench/details-drawer.tsx
```

`app/ui/workbench/details-drawer.tsx` 仅为条件白名单；没有对应红灯不得修改。除以上文件外不得修改生产代码。

### 58.2 测试文件

```text
tests/unit/domain/event.test.ts
tests/unit/agent/helpers.ts
tests/unit/agent/schemas.test.ts
tests/unit/agent/public-api.test.ts
tests/unit/agent/runtime-limits.test.ts
tests/unit/agent/projection.test.ts
tests/unit/agent/recovery.test.ts
tests/unit/context/helpers.ts
tests/unit/context/provider.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/storage/recovery.test.ts
tests/unit/server/application.test.ts
tests/unit/server/schemas.test.ts
tests/unit/server/public-api.test.ts
tests/unit/client/schemas.test.ts
tests/unit/client/event-state.test.ts
tests/unit/client/transcript.test.ts
tests/unit/terminal/application.test.ts
tests/unit/terminal/event-renderer.test.ts
tests/integration/server/run-stream.test.ts
tests/integration/server/plan-approval-route.test.ts
tests/integration/server/recovery-security.test.ts
tests/integration/terminal/runtime.test.ts
tests/e2e/plan-mode.spec.ts
```

### 58.3 文档状态文件

```text
docs/development/17-agent-orchestration-plan-mode-tasks.md
docs/development/17-agent-orchestration-plan-mode-summary.md
docs/development/README.md
```

### 58.4 明确禁止

- `package.json`、`pnpm-lock.yaml`、依赖安装和生成式全仓格式化。
- 模型 provider、Context 压缩、工具执行器、审批策略、Session 删除、工作区安全和语言合规实现。
- 真实 `.secode-data`、用户工作区、API Key 或凭据文件。
- 阶段 18 文档、最终 `README.txt`、视频、Git commit/push 和部署。

若测试失败要求白名单外生产修改，必须停止并修订 Task；不得以“顺手修复”为由扩大范围。

## 59. 需求—任务—验收映射

| 需求/验收 | 主任务 | 核心证据 |
| --- | --- | --- |
| FR-004 持续循环直至完成 | R4-02 | 超过 60 次且持续变化的工具轨迹最终正常 stop |
| FR-015 分离计数与可选请求保险 | R4-01～R4-03 | Schema、Runtime、snapshot、Terminal/HTTP 测试 |
| NFR-004 默认 300 工具/10 分钟 | R4-01～R4-03 | 常量、Schema、run.started 与限制测试 |
| NFR-010 新旧 JSONL 兼容 | R4-02、R4-04 | 旧有值/新缺失双 fixture 与刷新恢复 |
| NFR-011 分层一致 | R4-02～R4-04 | Agent/Server/Terminal/Client/E2E |
| NFR-015 默认无请求次数失败 | R4-02 | 61+ 请求完成测试 |
| SEC-013 重述共享保护 | R4-02、R4-03 | 显式上限、时限、取消、工具预算回归 |
| AC17-20 | R4-01、R4-02 | optional normalized limits 与长轨迹 |
| AC17-21 | R4-01～R4-03 | 1～120 请求保险、1～300 工具边界 |
| AC17-22 | R4-02 | 工具批次、错误、无进展、时限、取消回归 |
| AC17-23 | R4-02～R4-04 | durable、DTO、Terminal/Web 新旧展示 |
| AC17-24 | R4-05 | 全量质量命令与 Summary 记录 |

## 60. 失败处理与回退

1. 超过 60 次测试必须使用唯一工具参数或变化事实；若因第三次相同错误/无进展失败，应修正 fixture，不得弱化保护。
2. 300 工具默认不要求执行 300 个真实进程或写文件；使用确定性假模型和临时工作区验证计数边界。
3. Provider usage 缺失不影响本修订；不得借机新增 token/美元预算。
4. 新 event Schema 解析失败时先区分旧事件有值、新事件缺失和真正非法输入，不得将缺失回填为 60。
5. 若 config `null` 破坏 Client strict decoder，只调整获批的 nullable 契约，不删除 strict 校验或 deprecated 键。
6. 若 E2E 受用户正在运行的 dev server 影响，使用阶段 17 既有隔离镜像策略，不终止用户进程。
7. 不通过删除、跳过、放宽断言、提高超时或隐藏错误制造通过。
8. 不 reset、stash、清理或覆盖 dirty worktree 中的既有阶段修改。

## 61. Task 修订 5 审批检查

- [x] 已引用并固定用户批准的 Spec 修订 4。
- [x] 已固定默认无模型请求门、显式 1～120 保险和工具默认/最大 300。
- [x] 已定义 deprecated config 键的 nullable 兼容语义。
- [x] 已把需求、Domain、Runtime、恢复、Server、Terminal、Client/Web 按依赖拆分。
- [x] 已为每项任务列出输入、操作、允许文件、最小验证和完成条件。
- [x] 已设置超过 60 次仍有进展的正向测试和其他保护的负向回归。
- [x] 已保护旧 JSONL fixture，不做迁移或机械重写。
- [x] 已限定生产/测试/文档白名单和回到 Spec/Task 的条件。
- [x] 已保留完整全量质量门禁与 Summary 停止点。
- [x] 用户于 2026-08-29 明确批准本 Task 修订 5。

**历史结论：阶段 17 Task 修订 5 已获批准并完成；Summary 修订 4 的审批等待后来因真实运行失败撤回。**

## 62. Task 修订 5 实施记录

- [x] T17-R4-01：需求、limits 常量/Schema、public API 与 nullable config 契约完成；红灯 5 项，修正后目标 28/28 通过。
- [x] T17-R4-02：optional durable event、Runtime 条件门、Projection 与新旧恢复完成；红灯 9 项，修正后目标 61/61 通过。
- [x] T17-R4-03：Server config、Terminal `/status` 与 event renderer 完成；红灯 3 项，修正后相关 36/36 通过。
- [x] T17-R4-04：Client optional 投影和 Plan Mode E2E 预算展示完成；Client 20/20、目标 E2E 1/1 通过，Details Drawer 无需生产修改。
- [x] T17-R4-05：契约搜索、白名单审查和完整质量门禁完成；108/844 tests、38/38 E2E、coverage、build、typecheck、lint 与 `git diff --check` 均通过。
- [x] 没有修改 `package.json`、`pnpm-lock.yaml`、白名单外生产代码、真实 Session/工作区或阶段 18 产物。
- [x] Summary 修订 4 已生成并进入审批门禁。

**历史停止点：Summary 修订 4 的审批等待已因真实运行失败撤回；当前任务状态以下面的 Task 修订 6 为准。**

## 63. Task 修订 6 状态、输入与固定决策

- Task 日期：2026-08-29（北京时间）。
- 上游规格：Spec 修订 5 第 43～53 节，用户已明确批准。
- 当前状态：已获用户批准；T17-R5-01～R5-07 按依赖顺序解锁，T17-R5-08 仍锁定。
- 历史基线：修订 1～4 与 Task 修订 5 的实现和验证保留，不回滚、不重写；本 Task 只增加修订 5 的差异。
- 真实失败样本只读保留：`.secode-data/sessions/8e4063ad-ff10-4c5d-865d-9b65c3dbbb17/events.jsonl`；不得修改或用作自动测试数据目录。

以下决策在实施中不可临时改变：

1. Context 摘要专用时限为 60000ms；普通业务模型请求仍为 120000ms。
2. 只有摘要模型失败、输出非法、摘要输入超预算或摘要专用时限触发一次确定性本地降级；父 run 取消/总超时、历史非法和最近 8 回合本身超预算不降级。
3. 降级不调用模型/工具、不读取工作区、不计业务模型请求；必须保留最近 8 个完整回合并在目标 Token 内完成。
4. `context.compacted.strategy` 对新事件必写，对旧事件 optional；fallback reason 使用 Spec 的四值枚举，禁止任意字符串。
5. 外层错误码继续是 `AGENT_CONTEXT_FAILED`；只透传有限 `contextCode/reason`，不透传 cause message/body/path/profile/summary。
6. run 默认时限改为 1800000ms，显式最大值 3600000ms；审批等待仍计入墙钟。
7. 模型请求默认无次数门、显式 1～120、工具默认/最大 300、取消、重复错误和无进展保护不变。
8. System Prompt 升级为 V5；只增加已批准的执行可靠性规则，不改变 normal/planning/executing phase 或中文合规门。
9. `run_process.readiness` 只探测字面量 `http://127.0.0.1` 高位端口；成功后也必须清理进程树，不提供后台托管。
10. 不新增依赖、第七个工具、数据迁移、provider wire、通用 PTY 或长期进程句柄。
11. 自动测试只操作临时工作区、随机端口和假模型；不得操作真实 Session、失败样例或用户已有 3000 端口。
12. 真实模型回归必须在 R5-07 全绿和人工确认后进行；不读取/输出凭据，不执行 Git commit/push。

需求覆盖：修订 `FR-004`、`FR-010`、`FR-012`、`NFR-003`～`NFR-005`、`NFR-010`～`NFR-011`、`NFR-015`、`SEC-003`、`SEC-005`、`SEC-013`；新增 `FR-019`～`FR-020`、`NFR-016`～`NFR-018`、`SEC-014`～`SEC-015`、`AC17-25`～`AC17-31`。

## 64. 依赖顺序与实施门禁

```text
T17-R5-01 需求追踪、公共类型/Schema 与红灯测试
  → T17-R5-02 摘要时限、本地降级与安全错误映射
  → T17-R5-03 durable/恢复/Terminal/Client/Web 可观测性
  → T17-R5-04 30/60 分钟墙钟契约
  → T17-R5-05 System Prompt V5 与执行轨迹回归
  → T17-R5-06 run_process readiness 与进程树清理
  → T17-R5-07 全量自动验证、白名单审查
  → 人工确认真实 LongCat 回归
  → T17-R5-08 新临时工作区真实多文件验收、Summary 修订 5
```

每项任务固定遵循：

1. 开始前对照 Spec、Task 和 `git status --short`，不覆盖 dirty worktree 中既有阶段内容。
2. 先写能命中当前缺口的红灯测试，再做最小生产修改；禁止删除、跳过或弱化测试制造通过。
3. 使用假时钟/可控 Promise 验证 60000ms/30 分钟/60 分钟边界，自动测试不得真实等待这些时长。
4. 每项完成即运行最小验证，并在第 76 节记录红灯症状、根因、修正和重跑结果。
5. 修改任何 Next.js/React 文件前，先阅读本地 Next.js 16.3.3 对应文档；把所读路径记录到实施记录。
6. 公共接口、安全边界或验收标准需要变化时回到 Spec；只需调整任务顺序/文件白名单时回到 Task 并重新审批。
7. R5-07 完成后必须停止，等待用户明确确认真实 LongCat 回归；该确认不等同于 Summary 批准。

## 65. T17-R5-01：需求追踪、公共类型/Schema 与红灯测试

### 操作

1. 更新 `01-requirements.md`：
   - `FR-012` 升级为 System Prompt V5；修订 Context/预算/错误既有条目。
   - 新增 `FR-019`（可降级上下文续跑）、`FR-020`（有界开发服务就绪）。
   - 新增 `NFR-016`（摘要 60 秒与一次降级）、`NFR-017`（30/60 分钟墙钟）、`NFR-018`（指令/完成证据）。
   - 新增 `SEC-014`（回环 readiness 与进程树清理）、`SEC-015`（降级摘要及错误脱敏）。
   - 新增 `AC17-25`～`AC17-31` 追踪表。
2. 先增加红灯测试，锁定：
   - `context.compacted` 新 strategy/reason 合法组合、非法组合和旧字段缺失兼容。
   - Agent compaction draft 与 Context fact 的相同类型契约。
   - `run_process.readiness` 的 127.0.0.1/高位端口/status 边界和非法 URL。
   - 1800000 默认、3600000 最大、旧 600000 事件仍合法。
   - 公共导出包含新有限枚举/常量，不暴露内部 fallback/transcript 实现。
3. 实现仅足以让公共类型、Schema 和导出测试通过；不在本项接入 Provider、Runtime、UI 或进程执行。

### 允许文件

```text
docs/development/01-requirements.md
lib/domain/event.ts
lib/agent/types.ts
lib/agent/schemas.ts
lib/agent/index.ts
lib/context/types.ts
lib/context/schemas.ts
lib/context/index.ts
lib/tools/types.ts
lib/tools/schemas.ts
lib/tools/index.ts
lib/server/types.ts
lib/client/schemas.ts
tests/unit/domain/event.test.ts
tests/unit/agent/schemas.test.ts
tests/unit/agent/public-api.test.ts
tests/unit/context/schemas.test.ts
tests/unit/context/public-api.test.ts
tests/unit/tools/schemas.test.ts
tests/unit/server/public-api.test.ts
tests/unit/client/schemas.test.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/domain/event.test.ts tests/unit/agent/schemas.test.ts tests/unit/agent/public-api.test.ts tests/unit/context/schemas.test.ts tests/unit/context/public-api.test.ts tests/unit/tools/schemas.test.ts tests/unit/server/public-api.test.ts tests/unit/client/schemas.test.ts
pnpm typecheck
git diff --check
```

### 完成条件

- 新旧 event、预算和 readiness 输入边界无歧义。
- 红灯原因来自旧契约，生产 Schema 修改后目标测试全绿。
- Provider/Runtime/process 尚未改变。

## 66. T17-R5-02：摘要时限、本地降级与安全错误映射

### 操作

1. 新增纯函数 `fallback-summary.ts`，只消费 Context 投影与 compaction selection；固定优先级、秘密清理、相对路径、安全省略计数/SHA 和 Token 截断。
2. 给摘要调用建立父取消、run 剩余时限和 60000ms 专用时限的组合信号；明确区分“专用时限”与父取消，确保前者可降级、后者立即传播。
3. Provider 对 Spec 允许的四类原因尝试一次 fallback；生成后重新 Schema/Token 校验，失败不循环。
4. Runtime 识别 `ContextLayerError`，映射有限 `contextCode/reason` 到 `AGENT_CONTEXT_FAILED.details`；未知异常继续无 details。
5. 增加冻结毒化历史 fixture：两个旧 `AGENT_CONTEXT_FAILED` run 后的新 run 能 append fallback compaction 并发起业务模型请求。
6. 覆盖取消、总超时、摘要超时、模型失败、英文/非法摘要、摘要输入超预算、fallback 超预算、最近 8 回合超预算和重复诊断上限。
7. 验证摘要调用不增加业务请求数、不重复工具、不泄露注入秘密或绝对路径。

### 允许文件

```text
lib/context/fallback-summary.ts（新增）
lib/context/provider.ts
lib/context/summary-generator.ts
lib/context/errors.ts
lib/context/types.ts
lib/context/schemas.ts
lib/context/token-estimator.ts
lib/context/index.ts
lib/agent/runtime.ts
lib/agent/errors.ts
lib/agent/types.ts
tests/unit/context/fallback-summary.test.ts（新增）
tests/unit/context/summary-generator.test.ts
tests/unit/context/provider.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/context/security.test.ts
tests/unit/agent/runtime-completion.test.ts
tests/unit/agent/runtime-cancellation.test.ts
tests/unit/agent/recovery.test.ts
```

`token-estimator.ts` 只允许复用/增加确定性预算辅助，不改变已批准估算常量。若必须改变 compaction selection 或保留 8 回合规则，回到 Spec。

### 最小验证

```text
pnpm exec vitest run tests/unit/context/fallback-summary.test.ts tests/unit/context/summary-generator.test.ts tests/unit/context/provider.test.ts tests/unit/context/runtime-integration.test.ts tests/unit/context/security.test.ts tests/unit/agent/runtime-completion.test.ts tests/unit/agent/runtime-cancellation.test.ts tests/unit/agent/recovery.test.ts
pnpm typecheck
git diff --check
```

### 完成条件

- AC17-25～AC17-27 的核心 Runtime 路径通过。
- 60000ms 使用假时钟验证，无真实长等待。
- fallback 至多一次且在 durable compaction 后才继续业务请求。

## 67. T17-R5-03：durable、恢复与用户可观测性

### 操作

1. History/Agent Projection 保存 `strategy/fallbackReason`；旧事件缺失时只读视为 legacy model，不回写。
2. Terminal 对 fallback 显示固定 warning；普通 model compaction 保持现有简洁信息。
3. Client strict decoder、event state 和 transcript 投影新字段；Web 显示固定中文 warning，不渲染 summary、hash、profile 或任意 reason 原文。
4. Server NDJSON/恢复集成证明 strict event 可传输；若通用桥无需生产修改，只增加测试，不触碰 Route。
5. 刷新/重启 fixture 覆盖旧缺失、新 model、新 fallback 三类历史。
6. 修改 TSX 前阅读本地 Next.js Client Component 指南并记录；不得顺手调整 UI 视觉结构。

### 允许文件

```text
lib/context/history-projector.ts
lib/agent/projection.ts
lib/client/schemas.ts
lib/client/event-state.ts
lib/client/transcript.ts
lib/terminal/event-renderer.ts
app/ui/workbench/transcript.tsx（仅固定 warning）
tests/unit/context/history-projector.test.ts
tests/unit/agent/projection.test.ts
tests/unit/agent/recovery.test.ts
tests/unit/client/schemas.test.ts
tests/unit/client/event-state.test.ts
tests/unit/client/transcript.test.ts
tests/unit/terminal/event-renderer.test.ts
tests/integration/server/run-stream.test.ts
tests/integration/server/recovery-security.test.ts
tests/e2e/agent-workflow.spec.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/context/history-projector.test.ts tests/unit/agent/projection.test.ts tests/unit/agent/recovery.test.ts tests/unit/client/schemas.test.ts tests/unit/client/event-state.test.ts tests/unit/client/transcript.test.ts tests/unit/terminal/event-renderer.test.ts tests/integration/server/run-stream.test.ts tests/integration/server/recovery-security.test.ts
pnpm exec playwright test tests/e2e/agent-workflow.spec.ts --workers=1
pnpm typecheck
git diff --check
```

### 完成条件

- 三类历史投影一致，旧 JSONL 零迁移。
- fallback 对用户可解释但不泄露摘要或内部错误。
- HTTP/Client 不建立第二套压缩状态。

## 68. T17-R5-04：30/60 分钟墙钟契约

### 操作

1. 将 Agent 默认时限改为 1800000、最大改为 3600000；Schema 接受 1000～3600000。
2. Server public config、请求标准化、Terminal snapshot/status、Client decoder 和展示使用同一值。
3. `run.started` 新事件写实际标准化时限；旧 600000 事件恢复原值。
4. 使用假单调时钟覆盖 30 分钟前继续、到限单终态、显式 60 分钟边界和 3600001 拒绝。
5. 回归 planning、危险审批等待、摘要降级、取消、工具 300、显式模型请求保险、重复错误和无进展；所有阶段共享原 run 墙钟。

### 允许文件

```text
lib/agent/types.ts
lib/agent/schemas.ts
lib/agent/runtime.ts
lib/agent/projection.ts
lib/server/application.ts
lib/server/schemas.ts
lib/server/types.ts
lib/client/schemas.ts
lib/terminal/application.ts
lib/terminal/event-renderer.ts
tests/unit/agent/schemas.test.ts
tests/unit/agent/runtime-limits.test.ts
tests/unit/agent/runtime-plan-approval.test.ts
tests/unit/agent/recovery.test.ts
tests/unit/server/application.test.ts
tests/unit/server/schemas.test.ts
tests/unit/server/public-api.test.ts
tests/unit/client/schemas.test.ts
tests/unit/terminal/application.test.ts
tests/unit/terminal/event-renderer.test.ts
tests/integration/server/run-stream.test.ts
tests/integration/terminal/runtime.test.ts
tests/e2e/plan-mode.spec.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/agent/schemas.test.ts tests/unit/agent/runtime-limits.test.ts tests/unit/agent/runtime-plan-approval.test.ts tests/unit/agent/recovery.test.ts tests/unit/server/application.test.ts tests/unit/server/schemas.test.ts tests/unit/server/public-api.test.ts tests/unit/client/schemas.test.ts tests/unit/terminal/application.test.ts tests/unit/terminal/event-renderer.test.ts tests/integration/server/run-stream.test.ts tests/integration/terminal/runtime.test.ts
pnpm exec playwright test tests/e2e/plan-mode.spec.ts --workers=1
pnpm typecheck
git diff --check
```

### 完成条件

- AC17-28 全部通过，新旧墙钟事实不混淆。
- 未引入暂停计时或重置预算路径。
- 所有其他终止保护保持原错误码与原子性。

## 69. T17-R5-05：System Prompt V5 与执行轨迹回归

### 操作

1. 将稳定核心版本升级为 V5，加入 Spec 第 48 节八项规则；normal/planning/executing overlay、末尾中文输出策略和工具定义来源不变。
2. 请求捕获测试逐项断言：嵌套指令、Next 本地文档、用户顺序检查点、需求—证据核对、批量/依赖工具、Schema 纠错、安全信任边界、dev readiness/清理、时限不足时诚实续跑。
3. 更新确定性假模型轨迹：
   - 先读根与子项目指令；
   - 模板后先 readiness；
   - 一次非法 SHA 后按错误读取并修正，不重复相同参数；
   - 一次响应可含多个无依赖只读工具，Runtime 仍串行且各一次；
   - lint/test/build 任一失败时不产生成功 final，通过后才总结。
4. 回归中文合规门、Plan Mode、危险审批、工具 narrative suppression 和 provider-neutral 请求。

### 允许文件

```text
lib/context/system-prompt.ts
tests/unit/context/model-language.test.ts
tests/unit/context/token-estimator.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/agent/runtime-plan-mode.test.ts
tests/unit/agent/runtime-tools.test.ts
tests/unit/agent/runtime-language-policy.test.ts
tests/manual/openai-compatible-server.ts
tests/integration/terminal/manual-server.test.ts
tests/e2e/support/fake-model-server.ts
tests/e2e/language-policy.spec.ts
tests/e2e/agent-workflow.spec.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/context/model-language.test.ts tests/unit/context/token-estimator.test.ts tests/unit/context/runtime-integration.test.ts tests/unit/agent/runtime-plan-mode.test.ts tests/unit/agent/runtime-tools.test.ts tests/unit/agent/runtime-language-policy.test.ts tests/integration/terminal/manual-server.test.ts
pnpm exec playwright test tests/e2e/language-policy.spec.ts tests/e2e/agent-workflow.spec.ts --workers=1
pnpm typecheck
git diff --check
```

### 完成条件

- AC17-30 自动部分通过，三个 phase 的真实请求均含 V5 规则。
- 假模型只能证明编排契约，不能写成真实模型质量通过。
- 不改变工具执行顺序、审批或语言安全边界。

## 70. T17-R5-06：`run_process` readiness 与进程树清理

### 操作

1. Registry 标准化 optional readiness，URL Schema 在 spawn 前只接受 Spec 规定的 127.0.0.1 高位端口和有限 status。
2. readiness 模式用注入的无凭据 HTTP probe，禁止 redirect/header/cookie；固定短间隔，受同一 timeout/cancel 信号约束。
3. readiness 子进程使用可清理的独立进程组；ready、错误 status、提前退出、timeout、cancel、spawn error 和 probe error 均进入同一幂等 cleanup。
4. ready 后必须等待进程 close 再返回成功；metadata 只含安全 URL/status/ready/duration/exit/signal/截断字段。
5. 测试真实启动临时 Node HTTP 父进程及 fork 子进程，使用系统分配的随机高位端口；每例结束验证 PID 不存活、端口释放。
6. 回归非 readiness 前台模式、64KiB 输出、环境秘密过滤、shell=false、风险分级和审批摘要。
7. 不使用用户 3000 端口，不安装依赖，不以提高 timeout 掩盖泄漏。

### 允许文件

```text
lib/tools/types.ts
lib/tools/schemas.ts
lib/tools/registry.ts
lib/tools/dependencies.ts
lib/tools/run-process.ts
lib/tools/index.ts
lib/approval/assessment.ts（仅在红灯证明必要时）
lib/approval/summary.ts（仅展示安全 readiness 目标）
tests/unit/tools/schemas.test.ts
tests/unit/tools/registry.test.ts
tests/unit/tools/run-process.test.ts
tests/unit/tools/security.test.ts（如不存在则新增）
tests/unit/approval/assessment.test.ts
tests/unit/approval/summary.test.ts
tests/integration/terminal/process.test.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/tools/schemas.test.ts tests/unit/tools/registry.test.ts tests/unit/tools/run-process.test.ts tests/unit/tools/security.test.ts tests/unit/approval/assessment.test.ts tests/unit/approval/summary.test.ts tests/integration/terminal/process.test.ts
pnpm typecheck
git diff --check
```

若没有新增 `tests/unit/tools/security.test.ts`，从命令中删除该路径并在实施记录说明安全断言并入 `run-process.test.ts`；不得创建空测试文件迎合白名单。

### 完成条件

- AC17-29 全部通过，含真实 fork 子进程清理证据。
- 任何失败/取消路径都无孤儿 PID 或占用端口。
- 非 readiness 行为及审批风险不变。

## 71. T17-R5-07：全量自动验证、白名单审查与人工门禁

### 操作

1. 审查完整 diff，确认只覆盖修订 5；检查所有新增 timeout/strategy/reason/readiness 字符串和旧 fixture。
2. 运行完整质量门禁并记录真实耗时、失败根因、修正与重跑。
3. 使用确定性长历史集成场景连续触发至少两次 compaction，其中一次模型摘要成功、一次 timeout fallback，最终正常 stop。
4. 运行秘密/绝对路径/未验证摘要扫描，验证事件、NDJSON、Terminal/Web 和测试日志无泄露。
5. 不生成 Summary；自动验证全绿后更新第 76 节并立即停止，请用户确认是否执行真实 LongCat 多文件回归。

### 全量验证

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
git diff --check
```

补充只读检查：

```text
rg -n "600_000|600000|1_800_000|3_600_000|CONTEXT_SUMMARY|deterministic_fallback|fallbackReason|readiness" lib app tests
git status --short
```

`rg` 命中不是自动失败；必须区分旧兼容 fixture、新契约和过期生产硬编码。

### 允许文件

- 第 73 节自动实现白名单内文件。
- `docs/development/17-agent-orchestration-plan-mode-tasks.md` 与 `docs/development/README.md`，仅记录实施状态/门禁。

### 完成条件

- AC17-25～AC17-30 自动部分具有证据。
- 全量命令通过，或真实外部阻塞被如实记录且没有伪造通过。
- 已停止在真实 LongCat 人工确认门禁，未自行消费真实模型额度。

## 72. T17-R5-08：真实 LongCat 多文件验收与 Summary 修订 5

### 前置门禁

- R5-01～R5-07 全部完成且全量自动验证通过。
- 用户在看到 R5-07 结果后明确同意执行真实 LongCat 回归。
- LongCat profile 已通过现有配置状态确认 `configured=true`；不得读取或输出 Key 值。

### 操作

1. 使用受控临时目录创建全新测试工作区；不得复用 `/Users/starkirby/Codes/test/web` 或真实用户项目。
2. 通过 SEcode 自身的 Terminal/HTTP 入口提交 Spec `AC17-31` 的等价中文 prompt；保留真实事件作为验收证据。
3. 危险工具审批仍由既有机制逐项处理；计划批准不替代工具批准。
4. 验收模板来源、npm lock、`pnpm dev` readiness 顺序、嵌套指令/Next 本地文档读取、认证信任边界、测试隔离和 lint/test/build 结果。
5. 若首次 run 未完成，可提交“继续”；必须证明 fallback/恢复能取得新进展且不重复已执行副作用。
6. 自动检查生成项目，不把未通过的样例代码合入 SEcode；结束后保留最小脱敏报告，临时项目按用户选择保留或可恢复清理。
7. 更新终端人工验收文档、Task 实施记录、README 和 Summary 修订 5；Summary 如实记录模型、run 数、用时、审批、失败、修正、验证和剩余风险。
8. 生成 Summary 修订 5 后立即停止等待用户审批，不开始阶段 18。

### 允许文件

```text
tests/manual/stage17-r5-fixture.ts（如确定性启动器确有需要则新增）
docs/development/17-agent-plan-terminal-acceptance.md
docs/development/17-agent-orchestration-plan-mode-tasks.md
docs/development/17-agent-orchestration-plan-mode-summary.md
docs/development/README.md
```

真实验收产生的临时工作区和 `.secode-data` 测试 Session 不是产品源码白名单；只能由受控验收入口创建，不得复制到仓库、commit 或输出凭据。是否清理必须在人工确认时说明，禁止默认递归删除。

### 完成条件

- AC17-31 七项均有真实事件/文件/命令证据，或明确记录外部阻塞。
- 未修改失败样例、真实用户项目或 SEcode 工作区外无关数据。
- Summary 修订 5 待审批；阶段 18 继续锁定。

## 73. Task 修订 6 文件白名单总表

### 73.1 需求与生产文件

```text
docs/development/01-requirements.md
lib/domain/event.ts
lib/context/types.ts
lib/context/schemas.ts
lib/context/errors.ts
lib/context/fallback-summary.ts（新增）
lib/context/summary-generator.ts
lib/context/provider.ts
lib/context/history-projector.ts
lib/context/token-estimator.ts
lib/context/system-prompt.ts
lib/context/index.ts
lib/agent/types.ts
lib/agent/schemas.ts
lib/agent/errors.ts
lib/agent/runtime.ts
lib/agent/projection.ts
lib/agent/index.ts
lib/tools/types.ts
lib/tools/schemas.ts
lib/tools/registry.ts
lib/tools/dependencies.ts
lib/tools/run-process.ts
lib/tools/index.ts
lib/approval/assessment.ts（条件白名单）
lib/approval/summary.ts（条件白名单）
lib/server/application.ts
lib/server/schemas.ts
lib/server/types.ts
lib/client/schemas.ts
lib/client/event-state.ts
lib/client/transcript.ts
lib/terminal/application.ts
lib/terminal/event-renderer.ts
app/ui/workbench/transcript.tsx（条件白名单）
```

条件白名单必须由对应红灯证明必要；否则不得修改。

### 73.2 自动测试文件

```text
tests/unit/domain/event.test.ts
tests/unit/context/fallback-summary.test.ts（新增）
tests/unit/context/schemas.test.ts
tests/unit/context/public-api.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/context/provider.test.ts
tests/unit/context/history-projector.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/context/model-language.test.ts
tests/unit/context/token-estimator.test.ts
tests/unit/context/security.test.ts
tests/unit/agent/schemas.test.ts
tests/unit/agent/public-api.test.ts
tests/unit/agent/runtime-completion.test.ts
tests/unit/agent/runtime-cancellation.test.ts
tests/unit/agent/runtime-limits.test.ts
tests/unit/agent/runtime-plan-approval.test.ts
tests/unit/agent/runtime-plan-mode.test.ts
tests/unit/agent/runtime-tools.test.ts
tests/unit/agent/runtime-language-policy.test.ts
tests/unit/agent/projection.test.ts
tests/unit/agent/recovery.test.ts
tests/unit/tools/schemas.test.ts
tests/unit/tools/registry.test.ts
tests/unit/tools/run-process.test.ts
tests/unit/tools/security.test.ts（条件新增）
tests/unit/approval/assessment.test.ts
tests/unit/approval/summary.test.ts
tests/unit/server/application.test.ts
tests/unit/server/schemas.test.ts
tests/unit/server/public-api.test.ts
tests/unit/client/schemas.test.ts
tests/unit/client/event-state.test.ts
tests/unit/client/transcript.test.ts
tests/unit/terminal/application.test.ts
tests/unit/terminal/event-renderer.test.ts
tests/integration/server/run-stream.test.ts
tests/integration/server/recovery-security.test.ts
tests/integration/terminal/runtime.test.ts
tests/integration/terminal/process.test.ts
tests/integration/terminal/manual-server.test.ts
tests/e2e/support/fake-model-server.ts
tests/e2e/agent-workflow.spec.ts
tests/e2e/language-policy.spec.ts
tests/e2e/plan-mode.spec.ts
tests/manual/openai-compatible-server.ts
tests/manual/stage17-r5-fixture.ts（条件新增）
```

### 73.3 流程状态文件

```text
docs/development/17-agent-orchestration-plan-mode-spec.md
docs/development/17-agent-orchestration-plan-mode-tasks.md
docs/development/17-agent-plan-terminal-acceptance.md
docs/development/17-agent-orchestration-plan-mode-summary.md
docs/development/README.md
```

### 73.4 明确禁止

- `package.json`、`pnpm-lock.yaml`、依赖安装到 SEcode、生成式全仓格式化。
- 模型 provider wire、Storage 格式/迁移、Workspace 根边界、Session 删除和 API Key 处理。
- 第七个工具、通用后台进程/PTY/stdin、自定义环境变量、非回环探测或 redirect。
- 修改真实 Session、`/Users/starkirby/Codes/test/web`、用户已有 3000 端口服务或无关项目。
- 阶段 18 文档、最终 README.txt、视频、Git commit/push、发布或部署。

## 74. 需求—任务—验收映射

| 需求/验收 | 主任务 | 证据 |
| --- | --- | --- |
| FR-019 / NFR-016 / SEC-015 | R5-01～R5-03 | 摘要 timeout fallback、毒化历史续跑、脱敏错误与新旧恢复 |
| FR-020 / SEC-003 / SEC-014 | R5-01、R5-06 | readiness URL Schema、进程树清理、风险回归 |
| FR-012 / NFR-018 | R5-05、R5-08 | V5 请求捕获、假模型轨迹、真实 LongCat 需求证据 |
| NFR-003 / NFR-011 | R5-02～R5-04 | Context→Agent→Terminal/HTTP/Client/Web 有限错误和状态一致性 |
| NFR-004 / NFR-017 | R5-01、R5-04 | 30/60 分钟边界与其他保护回归 |
| NFR-010 | R5-01、R5-03、R5-04 | 旧 strategy 缺失、旧 600000 恢复和零迁移 |
| AC17-25 | R5-02 | 摘要 60 秒 fallback 后正常业务请求和完成 |
| AC17-26 | R5-02、R5-03 | 两个失败 run 后“继续”取得新进展并可恢复 |
| AC17-27 | R5-02、R5-03 | 单终态、安全 details、无秘密/路径泄露 |
| AC17-28 | R5-04 | 新旧墙钟与全部保护 |
| AC17-29 | R5-06 | readiness 正负路径和 PID/端口释放 |
| AC17-30 | R5-05、R5-07 | V5 三 phase 与完整确定性轨迹 |
| AC17-31 | R5-08 | 新临时工作区真实 LongCat 多文件回归 |

## 75. 失败处理与回退

1. 摘要 timeout 测试必须用假时钟/可控 Promise；不得把测试 timeout 调高到 60 秒等待真实时间。
2. fallback 事实抽取若无法在目标 Token 保留全部低优先级事实，应按 Spec 丢弃并记录计数/hash，不得增加目标比率或减少最近 8 回合。
3. 组合 AbortSignal 若无法区分父取消和专用 timeout，先增加本地类型化 reason；不得把父取消错误降级为继续执行。
4. strict event 解析失败时先核对 strategy/reason 组合；不得给旧事件机械补写新字段。
5. readiness 如果无法可靠清理孙进程，任务保持红灯并停止；不得只验证父 PID 或忽略端口占用。
6. E2E 受用户现有 dev server 影响时沿用隔离镜像，不终止用户服务。
7. 真实 LongCat 返回低质量代码时允许在同一测试 Session 继续修复，但必须保留失败事件和真实结果；不得人工直接修样例来冒充 Agent 通过。
8. 外部依赖源、模型端点或额度阻塞时记录外部阻塞并等待用户决定；不得换模型、读取 Key 或伪造成功。
9. 不 reset、stash、清理或覆盖 dirty worktree；任何白名单外必要修改都先停止审批。

## 76. Task 修订 6 审批与实施记录

### 76.1 审批检查

- [x] 已引用用户批准的 Spec 修订 5 第 43～53 节。
- [x] 已按 Context 核心、跨层展示、墙钟、Prompt、process、全量验证和真实回归拆分依赖。
- [x] 已固定 60000ms 摘要时限、一次 fallback、30/60 分钟墙钟和现有其他保护。
- [x] 已列出每项操作、允许文件、最小验证和完成条件。
- [x] 已设置毒化历史、秘密注入、旧 JSONL、孤儿进程和随机端口负向测试。
- [x] 已为真实 LongCat 回归设置 R5-07 后人工确认门禁。
- [x] 已禁止修改失败样例、真实 Session、用户服务、依赖和阶段 18。
- [x] 用户于 2026-08-29 明确批准 Task 修订 6。

### 76.2 实施记录

- [x] T17-R5-01 已完成：需求追踪补入 `FR-019`～`FR-020`、`NFR-016`～`NFR-018`、`SEC-014`～`SEC-015` 和 `AC17-25`～`AC17-31`；Domain/Agent/Context/Tools strict Schema 增加 compaction strategy/reason、60000ms 摘要时限、30/60 分钟墙钟和 readiness。红灯阶段 6 项按预期失败，生产契约完成后目标测试 66 项通过，typecheck 通过。
- [x] T17-R5-02 已完成：新增确定性本地降级摘要，模型摘要专用时限与父取消分离；四类允许原因只降级一次，fallback 重新做 Schema/Token 校验；Runtime 只映射有限 `contextCode/reason`。目标测试 46 项通过，未把摘要请求计入业务模型请求数。
- [x] T17-R5-03 已完成：History、Agent、Client 投影保存策略与原因，旧缺失策略只读视为 legacy model；Terminal/Web 使用固定中文 warning 且不展示摘要正文、原始 reason 或私有 details；新持久化事件统一补 `strategy=model`。修改 TSX 前已阅读 `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` 及 Next.js skill 的 RSC/directive 指南。目标测试 66 项和 typecheck 通过。
- [x] T17-R5-04 已完成：新 run 默认 1800000ms、显式最大 3600000ms，3600001 严格拒绝；Server config 与 Runtime 事件使用新值，旧 600000 事件保持原事实。目标 7 个文件/64 项通过。
- [x] T17-R5-05 已完成：System Prompt 升级 V5，八项规则进入 normal/planning/executing 的稳定核心，中文输出策略仍位于末尾，估算保持小于 1500 Token。目标 7 个文件/44 项通过。
- [x] T17-R5-06 已完成：`run_process` readiness 使用无凭据、不跟随 redirect 的本机 HTTP probe；就绪、提前退出、错误状态、超时、取消和 spawn error 统一清理独立进程组并等待父进程 close。真实随机高位端口与 fork 子进程测试证明 PID/端口释放；readiness 不降低审批风险。未创建空的 `tests/unit/tools/security.test.ts`，安全断言并入 `run-process.test.ts`。目标 6 个文件/40 项通过。
- [x] T17-R5-07 已完成：新增连续两次 compaction 轨迹（首次模型摘要、第二次 `MODEL_TIMEOUT` 本地降级，最终 durable stop/completed）；生产目录秘密/绝对路径扫描无命中，E2E 3100 端口结束后释放。完整门禁结果：`lint` 0 error（既有 coverage 产物 2 条 warning）、`typecheck` 通过、Vitest 109 文件/863 项通过、coverage 通过（Statements 88.24%、Branches 82.24%、Functions 90.95%、Lines 89.88%）、Playwright 38/38 通过、Next.js build 通过、`git diff --check` 通过。
- [x] 失败与修正已记录：全量测试首轮因 V5/readiness 固定开销使旧 22000 窗口夹具失去“保留 8 回合”前提，校准为 25000 后 862/862 通过；新增双压缩测试最初把类型对象直接传给 JsonObject helper，显式展开稳定字段后 typecheck 和 863/863 重跑通过；E2E 首轮被本仓库此前运行遗留的 3000 `pnpm dev` 进程组阻塞，核对 cwd/PID/PGID 后精确 SIGTERM 清理，重跑 38/38 通过。Build 保留既有 `file-safety.ts` 动态文件追踪 warning，未伪装为无 warning。
- [x] 用户已明确批准真实 LongCat 多文件回归。
- [x] T17-R5-08 已执行完成：在新系统临时根使用真实 LongCat、3 个隔离 Session 和 5 个 run 验收。官方 `create-next-app`、npm lock、嵌套指令/本地文档读取、`pnpm dev` readiness 及进程清理、Git/工作区边界有真实证据；注册/登录/退出/保护页面、测试隔离和 lint/test/build 未完成，因此 `AC17-31` 总体未通过。
- [x] R5-08 失败轨迹已保留：首 run 第 9 次模型请求因整篇读取 1658 行认证文档触发 `AGENT_CONTEXT_FAILED / CONTEXT_BUDGET_EXCEEDED`；同 Session“继续”在 0 次模型请求时重复失败；另两个实现 run 均在第 5 次请求因再次整篇读取文档失败，全部没有 `context.compacted`。独立 readiness run 经审批后 200 成功、端口和进程组清理完成，并在一次中文重述后正常结束。
- [x] 未人工修改失败样例；未执行 commit、push、部署；SEcode dev server 已停止。临时根 `secode-stage17-r5.QGZdnT` 按任务约束保留，未默认递归删除。

**历史结论：T17-R5-01～R5-07 自动验证通过；T17-R5-08 已如实完成但 `AC17-31` 总体未通过。Summary 修订 5 保留为失败基线；该状态已由下方 Task 修订 7 取代。**

## 77. Task 修订 7 状态、固定决策与依赖

### 77.1 状态

- 上游规格：Spec 修订 6 第54～63节，用户已于2026-08-29明确批准。
- 当前状态：用户已于2026-08-29明确批准本 Task 修订7；T17-R6-01～R6-05已完成，T17-R6-06仍受独立真实LongCat确认门禁锁定。
- 历史基线：Task 修订 6 与 Summary 修订 5 保留真实实现/失败事实，不回滚、不重写。
- 当前授权：T17-R6-01～R6-05已实施并验证；不得运行真实LongCat，等待独立确认。

### 77.2 不可变实现决策

1. `read_file` 每页最多200个连续完整行；省略或显式大`endLine`都分页而不是报错。
2. 完整文件SHA-256语义不变；`hasMore/nextStartLine/pageLimited/pageByteTruncated`只描述当前页。
3. durable ToolResult、JSONL、Terminal/Web事实仍保持现有最多64KiB边界，不迁移、不改写。
4. Context-only单工具output最多8192 UTF-8字节；总预算严格使用Spec第58.2节公式，不能用固定32KiB替代小窗口动态值。
5. 总量分配最新round优先，同round公平；小输出逐字不变，只限制`result.output`。
6. baseline、retained estimate、最终消息和summary transcript复用同一投影视图；禁止双重截断或估算/发送不一致。
7. assistant/tool消息配对、最近8个结构完整round、goal、诊断、取消、预算、审批和工具至多一次保持。
8. 投影后仍超预算只返回有限reason `projected_recent_rounds_over_budget`，不得把不可恢复历史伪装成本地摘要成功。
9. 不增加durable事件、依赖、第七个工具、模型wire、Storage迁移或UI改版。
10. 真实LongCat回归受R6-05后的独立人工确认门禁约束；批准本Task本身不授权消费真实模型额度。

### 77.3 实施依赖

```text
T17-R6-01 需求追踪、sanitized真实尺寸红灯
  → T17-R6-02 read_file连续分页
  → T17-R6-03 Context-only工具输出投影
  → T17-R6-04 compaction/summary/恢复/有限错误跨层收口
  → T17-R6-05 全量自动验证与真实模型门禁
       ↓ 用户明确同意再次执行真实LongCat
     T17-R6-06 新临时根AC17-31回归与Summary修订6
```

每项必须先记录最小验证；失败不得通过调高contextWindow、降低75%阈值、减少最近8个结构round、删测试或增加retry制造绿色。

### 77.4 实施前基线

```text
git status --short
git diff --check
shasum -a 256 package.json pnpm-lock.yaml
pnpm exec vitest run tests/unit/tools/read-file.test.ts tests/unit/tools/file-content.test.ts tests/unit/tools/output.test.ts tests/unit/context/compaction.test.ts tests/unit/context/provider.test.ts tests/unit/context/runtime-integration.test.ts tests/unit/agent/runtime-completion.test.ts tests/unit/terminal/event-renderer.test.ts tests/unit/client/transcript.test.ts
pnpm typecheck
```

记录命令、退出码、测试文件/项数、package/lock哈希、既有dirty文件和R5保留临时根状态。不得reset、stash、覆盖或清理无关修改。

## 78. T17-R6-01：需求追踪与原缺陷红灯

### 操作

1. 将`FR-021`～`FR-022`、`NFR-019`～`NFR-020`、`SEC-016`和`AC17-32`～`AC17-36`加入需求基线与追踪表。
2. 在测试helper中构造sanitized事件，不复制真实文档正文、绝对临时路径、Session ID或凭据；只复刻9/5/7 round、55785字节单读、同round多读和失败后新run形状。
3. 建立投影关闭时的原缺陷信号：分别稳定得到52326/53308/68615/73426量级且以`CONTEXT_BUDGET_EXCEEDED`失败；断言不使用严格等于易受固定Prompt变动影响的总Token数字，但必须验证超过48000和selection失败分支。
4. 新增预期失败断言：长文件默认只返回1～200行；模型投影单项/总量有界；同Session继续取得新`model.requested`且不重复旧工具。
5. 红灯只允许由缺失分页/投影/恢复行为造成；若现有测试无关失败，先诊断并停止，不得把它计为目标红灯。

### 允许文件

```text
docs/development/01-requirements.md
docs/development/17-agent-orchestration-plan-mode-tasks.md（仅实施记录）
tests/unit/tools/read-file.test.ts
tests/unit/tools/file-content.test.ts
tests/unit/context/helpers.ts
tests/unit/context/tool-output-projection.test.ts（新增）
tests/unit/context/compaction.test.ts
tests/unit/context/provider.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/agent/runtime-completion.test.ts
```

### 最小验证

```text
pnpm exec vitest run tests/unit/tools/read-file.test.ts tests/unit/tools/file-content.test.ts tests/unit/context/tool-output-projection.test.ts tests/unit/context/compaction.test.ts tests/unit/context/provider.test.ts tests/unit/context/runtime-integration.test.ts tests/unit/agent/runtime-completion.test.ts
git diff --check
```

### 完成条件

- 红灯可在数秒内重复运行，准确命中真实预算前失败和0请求续跑。
- fixture不含真实正文、秘密或工作区绝对路径。
- 每个失败断言能映射到`AC17-32`～`AC17-35`，没有生产代码变化。

## 79. T17-R6-02：`read_file`连续分页

### 操作

1. 在file-content层实现最多200行的纯分页选择，分别保留用户请求结束行、有效结束行和总行数；空文件及越界规则保持。
2. `executeReadFile()`返回连续当前页，不用头尾拼接冒充连续行；增加Spec固定元数据并保持完整文件SHA。
3. 页面限制与64KiB字节限制分别记录；单行超过字节边界时明确`pageByteTruncated`，不得给出可无损续页的假承诺。
4. 更新工具中文描述与参数说明，明确默认200行和`nextStartLine`；不增加参数，不修改工具名或风险等级。
5. 测试短文件兼容、201/1658行、多页无重叠跳行、显式大endLine、Unicode、空文件、越界、敏感路径、取消和超长单行。

### 允许文件

```text
lib/tools/file-content.ts
lib/tools/read-file.ts
lib/tools/schemas.ts
lib/tools/types.ts（仅分页结果内部类型确有需要）
tests/unit/tools/file-content.test.ts
tests/unit/tools/read-file.test.ts
tests/unit/tools/schemas.test.ts
tests/unit/tools/registry.test.ts（仅生成后工具定义断言）
docs/development/17-agent-orchestration-plan-mode-tasks.md（仅实施记录）
```

### 最小验证

```text
pnpm exec vitest run tests/unit/tools/file-content.test.ts tests/unit/tools/read-file.test.ts tests/unit/tools/schemas.test.ts tests/unit/tools/registry.test.ts
pnpm typecheck
git diff --check
```

### 完成条件

- `AC17-32`全部通过；短文件、SHA、安全拒绝和写入并发保护无回归。
- 1658行fixture可按`nextStartLine`完整遍历，任一页最多200行。
- 工具定义不再诱导省略`endLine`读取EOF。

## 80. T17-R6-03：Context-only工具输出投影

### 操作

1. 新增无副作用的投影模块，输入完整round、context input budget和已脱敏ToolResult，输出冻结克隆；不得修改原对象。
2. 固定单项8192字节与动态总预算公式。分配顺序为最新round到最老round；同round先计算公平份额，再按工具请求顺序稳定处理余数。
3. 限制只作用于`result.output`。保留ok、summary、error、metadata、approval、argumentsTruncated、toolCallId、toolName和assistant/tool配对。
4. 小输出在未触发单项/总量限制时canonical JSON逐字不变；大输出使用UTF-8安全头尾摘录和固定中文marker，不输出绝对路径、秘密或私有参数。
5. Provider在第一次baseline估算前只投影一次；compaction retained估算、最终render和summary transcript共享该投影视图，不得各自重新分配预算。
6. 原始`ContextHistory`、durable事件、Client/Terminal DTO与Timeline输出保持不变；投影不产生新事件或模型/工具请求。

### 允许文件

```text
lib/context/tool-output-projection.ts（新增）
lib/context/types.ts
lib/context/index.ts
lib/context/message-renderer.ts
lib/context/compaction.ts
lib/context/provider.ts
lib/context/summary-generator.ts
tests/unit/context/tool-output-projection.test.ts
tests/unit/context/message-renderer.test.ts（如直接渲染测试确有需要则新增）
tests/unit/context/compaction.test.ts
tests/unit/context/provider.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/context/token-estimator.test.ts
tests/unit/context/security.test.ts
docs/development/17-agent-orchestration-plan-mode-tasks.md（仅实施记录）
```

### 最小验证

```text
pnpm exec vitest run tests/unit/context/tool-output-projection.test.ts tests/unit/context/message-renderer.test.ts tests/unit/context/compaction.test.ts tests/unit/context/provider.test.ts tests/unit/context/summary-generator.test.ts tests/unit/context/token-estimator.test.ts tests/unit/context/security.test.ts
pnpm typecheck
git diff --check
```

若未新增`message-renderer.test.ts`，从命令删除并在实施记录说明断言已放入哪个现有测试；禁止创建空文件迎合白名单。

### 完成条件

- `AC17-33`通过；四个sanitized真实切面在64K profile下均低于48000。
- 单项、总量、公平、最新优先、UTF-8、确定性、immutability和秘密测试通过。
- 估算消息与实际返回messages深相等，不存在短估算/长发送。

## 81. T17-R6-04：恢复、摘要与有限错误跨层收口

### 操作

1. 使用同一sanitized历史验证旧大ToolResult无需迁移即可进入新投影；同Session新run追加user目标后先产生`model.requested`。
2. 假模型让恢复run执行一个新的只读工具并正常stop；断言模板安装、readiness和历史工具调用ID均不重复。
3. 覆盖投影后正常baseline、超过75%后的模型摘要、本地fallback、重启后复用compaction及summary transcript不携带未投影大输出。
4. 构造超大goal/assistant/publicArguments等非output载荷，使投影后仍失败；Context details使用`projected_recent_rounds_over_budget`，只产生一个终态。
5. Runtime只白名单映射新reason；Terminal/Web使用固定中文解释且明确重复“继续”预计无效，不插值内部估算、路径或原文。
6. HTTP/Client通用事件协议若可透明承载不得修改；只有测试证明类型或显示缺口时，才使用条件白名单。
7. 修改TSX前必须重新阅读本地Next.js 16相关Server/Client文档并使用适用Next.js/React技能检查；不得借错误文案改版UI。

### 允许文件

```text
lib/context/errors.ts（仅有限reason辅助确有需要）
lib/context/types.ts
lib/context/provider.ts
lib/context/compaction.ts
lib/context/summary-generator.ts
lib/agent/runtime.ts
lib/agent/types.ts（仅公共有限reason类型确有需要）
lib/agent/schemas.ts（仅对应strict类型确有需要）
lib/agent/projection.ts（仅恢复投影确有需要）
lib/terminal/event-renderer.ts
lib/client/event-state.ts（条件白名单）
app/ui/workbench/transcript.tsx
tests/unit/context/compaction.test.ts
tests/unit/context/provider.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/agent/runtime-completion.test.ts
tests/unit/agent/recovery.test.ts
tests/unit/terminal/event-renderer.test.ts
tests/unit/client/event-state.test.ts（条件白名单）
tests/unit/client/transcript.test.ts
tests/integration/server/run-stream.test.ts
tests/integration/terminal/runtime.test.ts
tests/e2e/recovery-security.spec.ts
docs/development/17-agent-orchestration-plan-mode-tasks.md（仅实施记录）
```

### 最小验证

```text
pnpm exec vitest run tests/unit/context/compaction.test.ts tests/unit/context/provider.test.ts tests/unit/context/runtime-integration.test.ts tests/unit/context/summary-generator.test.ts tests/unit/agent/runtime-completion.test.ts tests/unit/agent/recovery.test.ts tests/unit/terminal/event-renderer.test.ts tests/unit/client/event-state.test.ts tests/unit/client/transcript.test.ts tests/integration/server/run-stream.test.ts tests/integration/terminal/runtime.test.ts
pnpm typecheck
pnpm exec playwright test tests/e2e/recovery-security.spec.ts --workers=1 --retries=0
git diff --check
```

条件文件未修改时从命令删除对应测试并记录原因。E2E必须使用隔离workspace/data和端口，不终止用户服务。

### 完成条件

- `AC17-34`～`AC17-35`通过，同Session恢复取得新进展且副作用零重复。
- 最近8个结构round、摘要、取消、语言门、计划/危险审批和旧JSONL回归。
- Terminal/Web只显示固定安全reason；不增加Server专用协议或UI状态真相。

## 82. T17-R6-05：全量自动验证与真实模型门禁

### 操作

1. 审查完整diff和白名单；检查8192、200、0.25、32768及新reason仅位于批准契约或测试。
2. 用R6 sanitized fixture执行投影开/关差分：关闭稳定红灯，开启四切面低于预算；不得读取R5真实正文进入测试日志。
3. 运行全量质量门禁，记录首次失败、根因、修正和重跑结果；不得降低断言或增加retry。
4. 扫描JSONL/NDJSON/Terminal/Web/测试输出，确认无秘密、绝对临时路径、未投影大型output或未验证摘要泄露。
5. 自动全绿后更新实施记录并立即停止，请用户确认是否再次消费LongCat额度；不得提前生成Summary修订6。

### 全量验证

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
git diff --check
```

补充只读检查：

```text
rg -n "8192|200|0\.25|32768|projected_recent_rounds_over_budget|nextStartLine|pageLimited" lib app tests
git status --short
```

### 允许文件

- 第84节生产/测试白名单内文件。
- `docs/development/17-agent-orchestration-plan-mode-tasks.md`和`docs/development/README.md`，仅记录自动结果与真实模型门禁。

### 完成条件

- `AC17-32`～`AC17-35`全部有确定性证据，全量命令通过。
- package/lock哈希不变，没有依赖、迁移、第七工具或durable事件变化。
- 已停止等待真实LongCat确认；阶段18和Summary继续锁定。

## 83. T17-R6-06：真实LongCat回归与Summary修订6

### 前置门禁

- R6-01～R6-05完成且自动全绿。
- 用户在看到R6-05结果后明确批准再次执行真实LongCat回归。
- profile只确认`configured=true`，不读取或输出Key。

### 操作

1. 使用新的带marker系统临时根和全新Session；不得复用R5生成项目、`/Users/starkirby/Codes/test/web`或真实用户项目。
2. 通过SEcode Terminal/HTTP提交`AC17-31`等价中文prompt；危险工具逐项审批，保留脱敏事件。
3. 验证官方模板、npm lock、业务修改前readiness、嵌套指令/本地文档分页、认证信任边界、测试隔离和lint/test/build。
4. 特别验证模型按`nextStartLine`分页或接受Context投影marker后取得进展；事件中不得再出现未处理的大输出导致0请求续跑。
5. 首run未完成可在同Session“继续”；必须取得新`model.requested`，不重复已执行副作用。若仍失败，保留真实结论，不人工修改样例。
6. 更新人工验收、Task、README和Summary修订6；记录模型、Session/run数、Token/工具数、审批、时长、分页/投影事实、失败修正、验证和临时根处置。
7. 生成Summary修订6后立即停止等待审批，不开始阶段18。

### 允许文件

```text
tests/manual/stage17-r6-fixture.ts（如新marker启动器确有需要则新增）
docs/development/17-agent-plan-terminal-acceptance.md
docs/development/17-agent-orchestration-plan-mode-tasks.md
docs/development/17-agent-orchestration-plan-mode-summary.md
docs/development/README.md
```

真实临时项目和Session数据不属于源码白名单。是否清理必须在用户确认时说明，禁止默认递归删除。

### 完成条件

- `AC17-36`和`AC17-31`七项均有真实事件/文件/命令证据，或明确记录不可伪装的外部阻塞/产品失败。
- 未修改失败样例、真实用户项目或无关数据；未commit/push/deploy。
- 后续必须提交 Summary 修订 6 并等待审批；该条件已于 2026-08-29 满足，阶段 18 只读观察与 Spec 已解锁。

## 84. 文件白名单总表

### 84.1 生产与需求

```text
docs/development/01-requirements.md
lib/tools/file-content.ts
lib/tools/read-file.ts
lib/tools/schemas.ts
lib/tools/types.ts（条件）
lib/context/tool-output-projection.ts（新增）
lib/context/types.ts
lib/context/index.ts
lib/context/errors.ts（条件）
lib/context/message-renderer.ts
lib/context/compaction.ts
lib/context/provider.ts
lib/context/summary-generator.ts
lib/agent/runtime.ts
lib/agent/types.ts（条件）
lib/agent/schemas.ts（条件）
lib/agent/projection.ts（条件）
lib/terminal/event-renderer.ts
lib/client/event-state.ts（条件）
app/ui/workbench/transcript.tsx
```

### 84.2 测试与受控fixture

```text
tests/unit/tools/file-content.test.ts
tests/unit/tools/read-file.test.ts
tests/unit/tools/schemas.test.ts
tests/unit/tools/registry.test.ts
tests/unit/context/helpers.ts
tests/unit/context/tool-output-projection.test.ts（新增）
tests/unit/context/message-renderer.test.ts（条件新增）
tests/unit/context/compaction.test.ts
tests/unit/context/provider.test.ts
tests/unit/context/summary-generator.test.ts
tests/unit/context/token-estimator.test.ts
tests/unit/context/security.test.ts
tests/unit/context/runtime-integration.test.ts
tests/unit/agent/runtime-completion.test.ts
tests/unit/agent/recovery.test.ts
tests/unit/terminal/event-renderer.test.ts
tests/unit/client/event-state.test.ts（条件）
tests/unit/client/transcript.test.ts
tests/integration/server/run-stream.test.ts
tests/integration/terminal/runtime.test.ts
tests/e2e/recovery-security.spec.ts
tests/manual/stage17-r6-fixture.ts（条件新增）
```

### 84.3 流程文档

```text
docs/development/17-agent-orchestration-plan-mode-spec.md（仅审批状态）
docs/development/17-agent-orchestration-plan-mode-tasks.md
docs/development/17-agent-plan-terminal-acceptance.md（仅R6-06）
docs/development/17-agent-orchestration-plan-mode-summary.md（仅R6-06）
docs/development/README.md
```

### 84.4 明确禁止

- `package.json`、`pnpm-lock.yaml`、依赖安装、模型provider wire、Domain durable event、Storage迁移、Workspace/Session删除、API Key处理。
- 新增事件、第七个工具、改变工具风险、降低75%阈值、减少最近8个结构round、增加模型/工具retry。
- 修改R5真实JSONL/样例、真实用户工作区、已有3000端口服务或阶段18产物。
- Git commit/push、发布、部署、全仓格式化、reset、stash或删除无关dirty文件。

## 85. 需求—任务—验收映射

| 需求/验收 | 主任务 | 证据 |
| --- | --- | --- |
| FR-021 / AC17-32 | R6-01～R6-02 | 200行连续分页、SHA、hasMore/nextStartLine、边界测试 |
| FR-022 / NFR-019 / AC17-33 | R6-01、R6-03 | 单项8192、动态总量、公平/最新优先、immutability与安全 |
| NFR-020 / AC17-34 | R6-01、R6-04 | 9/5/7回合sanitized重放、0请求继续修复、副作用零重复 |
| SEC-016 / AC17-33～35 | R6-03～R6-05 | 秘密/路径扫描、有限reason、旧JSONL与合法失败 |
| AC17-35 | R6-04～R6-05 | 最近8结构round、摘要/取消/预算/审批全回归 |
| AC17-36 / AC17-31 | R6-05～R6-06 | 全量自动门禁、新临时根真实LongCat完整任务 |

## 86. 失败处理与回退

1. 红灯无法复现真实预算前失败时先修fixture，不得直接写生产代码。
2. 200行仍产生64KiB页面时记录超长单行/大行事实；不得暗改为非连续头尾页或增加未经批准的字节offset参数。
3. 投影分配无法同时满足公平与最新优先时按Spec停下修订Task；不得按对象迭代偶然顺序实现。
4. 实际messages仍超预算时先比较估算视图与发送视图；不得提高contextWindow夹具、降低阈值或减少最近8round。
5. 同Session继续重复副作用时保持红灯并检查history/continuation；不得用新Session测试替代`AC17-34`。
6. 新reason需要白名单外协议/事件时停止并回到Spec，不得把任意cause字符串透传。
7. E2E受用户dev server影响时使用隔离镜像，不终止用户进程；真实LongCat只在独立门禁获批后运行。
8. 任何真实模型失败都保留事件和样例，不人工修项目冒充Agent通过，不读取Key，不换模型伪造成功。
9. 临时根清理必须验证marker和系统临时namespace并由用户选择；禁止默认递归删除。

## 87. Task 修订 7 审批检查

- [x] 已引用并记录用户批准的Spec修订6第54～63节。
- [x] 已把源头分页、恢复层投影、跨层续跑、全量验证和真实回归按依赖拆分。
- [x] 已固定200行、8192字节、动态总预算、公平/最新优先和有限reason。
- [x] 已设置sanitized原缺陷红灯与投影关闭差分，不复制真实正文/路径/秘密。
- [x] 已保持64KiB durable事实、工具配对、最近8结构round、旧JSONL和零重复副作用。
- [x] 已列出每项操作、允许文件、最小验证、完成条件和条件白名单。
- [x] 已设置R6-05后的独立真实LongCat确认门禁。
- [x] 已禁止依赖、事件、模型wire、迁移、用户项目、Git和阶段18变化。
- [x] 用户于2026-08-29明确批准Task修订7。

**当前结论：Task修订7已获用户批准，T17-R6-01～R6-05已完成；必须停止并等待独立的真实LongCat确认，不开始阶段18。**

## 88. Task 修订 7 实施记录（R6-01～R6-05）

### 88.1 R6-01：需求与红灯

- 已将`FR-021`～`FR-022`、`NFR-019`～`NFR-020`、`SEC-016`和`AC17-32`～`AC17-36`写入需求基线。
- 实施前基线：9个测试文件、49项测试通过，`pnpm typecheck`通过；`package.json`与`pnpm-lock.yaml`哈希分别为`5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13`和`5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683`。
- 脱敏红灯稳定命中5项分页断言和缺失投影模块；同批原有29项相关测试通过。fixture只使用固定脱敏ID、占位路径与重复字符，不包含R5真实正文、Session、临时根或凭据。

### 88.2 R6-02：连续分页

- `read_file`现按最多200个连续完整行返回页面；保留完整文件SHA-256，并分别返回`hasMore`、`nextStartLine`、`pageLimited`、`pageByteTruncated`、请求范围字节数与实际返回字节数。
- 201/1658行、显式大范围、逐页重建无重叠跳行、Unicode、空文件、越界、敏感路径、预取消与超长单行均有测试；工具描述不再声称省略`endLine`会一次读到EOF。
- 工具专项最终为4个测试文件、24项测试通过；`typecheck`和`git diff --check`通过。

### 88.3 R6-03：Context-only投影

- 新增纯投影模块：单项最多8192 UTF-8字节，总预算为`min(32768, floor(inputBudgetTokens × 2 × 0.25))`；先保障固定省略标记，再按最新round优先、同round公平和工具请求顺序稳定分配。
- 投影只修改冻结克隆中的`result.output`。Provider在baseline前投影一次，并把同一round对象传给压缩选择、最终消息和摘要transcript；durable事件、JSONL、Terminal/Web事实均不修改。
- 覆盖动态预算、单项/总量、最新优先、公平余数、UTF-8、确定性、输入不可变、小输出逐字不变及摘要transcript不携带大正文。Context专项6个测试文件、33项测试及`typecheck`通过。

### 88.4 R6-04：恢复与有限错误

- 9/5/7回合及同round多读的四个sanitized切面在关闭投影时均超过48000输入预算并进入selection失败分支；启用生产Provider后均低于预算且不调用摘要模型。
- 旧的9回合、每项55785字节工具结果无需迁移；同一Session的新run取得2次新`model.requested`、执行1个新只读工具，9个历史工具ID均只出现一次。
- 投影后仍过大的非output载荷使用有限reason`projected_recent_rounds_over_budget`。Runtime仅透传该白名单reason，Terminal/Web使用固定中文说明并明确重复“继续”预计无效；不透传估算、路径或正文。
- 跨层专项10个测试文件、75项测试、`typecheck`、`git diff --check`通过；隔离`recovery-security` E2E为2/2通过。

### 88.5 R6-05：全量自动验证

- 首次`pnpm test`有2项失败：原因是误把内部投影函数/常量加入Context公共barrel，违反既有“内部投影不可公开”契约；撤销公共导出后全量重跑通过，未降低断言。
- 最终结果：`pnpm lint`退出码0（仅coverage生成文件2条既有unused-disable warning）、`pnpm typecheck`通过、`pnpm test`为110个文件/881项通过、`pnpm test:coverage`为110个文件/881项通过且行覆盖率90.04%、`pnpm test:e2e`为38/38通过、`pnpm build`通过。
- build保留既有Turbopack动态文件系统trace warning；没有编译、类型或页面生成失败。`git diff --check`通过，package/lock哈希保持不变，未安装依赖，未增加durable事件、第七工具、迁移、模型wire或重试。
- 定向扫描未发现R5真实临时路径、真实正文、凭据或大型未投影输出进入新增fixture/日志；既有dirty工作树已原样保留，没有reset、stash、commit、push、发布或部署。

### 88.6 当前门禁

- [x] T17-R6-01～R6-05已按批准顺序完成。
- [x] `AC17-32`～`AC17-35`已有确定性自动证据。
- [x] 用户在看到上述自动结果后，独立确认执行T17-R6-06真实LongCat回归。
- [x] T17-R6-06 已执行并记录真实失败与通过事实。
- [x] Summary 修订 6 已于 2026-08-29 获用户批准；阶段 18 只读观察与 Spec 已解锁。

**历史停止点：R6-05 自动修复与验证完成后曾等待独立真实 LongCat 确认；该确认已记录于下节。**

### 88.7 R6-06 独立批准

- [x] 用户于2026-08-29在看到R6-05自动结果后明确回复“批准”，独立授权执行T17-R6-06真实LongCat回归。
- 当前仅解锁新临时根、真实LongCat回归、验收记录与Summary修订6；阶段18、Git、发布和旧R5样例仍锁定。

### 88.8 R6-06 实施结果与停止门禁

- [x] 使用新的带 marker 系统临时根和全新 LongCat Session；未复用 R5 项目、真实用户项目或 SEcode 工作区。
- [x] 大型 Next.js 文档按 200 行分页；两个 run 共 15 次 Context 压缩，未再出现 `CONTEXT_BUDGET_EXCEEDED` 或 0 请求续跑。
- [x] 同 Session 第二个 run 取得 59 次新模型请求，没有重复模板创建或首次 readiness。
- [x] 最终事件与独立复核均确认 lint 退出 0、5 文件/49 测试通过、build 退出 0。
- [ ] `AC17-31` / `AC17-36` 总体未通过：两个 run 均以 `AGENT_RUN_TIMEOUT` 失败，没有最终总结；缺少真实 HTTP/E2E；生成项目保留嵌套 `.git`；并发测试没有证明同邮箱唯一成功。
- [x] 已如实记录 warning 被当成额外修复目标，以及 4 次父目录缺失、4 次创建/覆盖语义错误和 1 次一般参数错误；这些后续问题不回写已批准 R6 产品范围。
- [x] 用户批准把 warning 因果判定与 `write_file` 前置观察作为阶段 18 候选设计；该批准不追溯为阶段 17 Summary 审批。
- [x] 临时根 `secode-stage17-r6.8dKUoT` 保留，未默认删除；未 commit、push、发布或部署。

**当前停止点更新：T17-R6-06 已按真实结果完成记录，Summary 修订 6 已于 2026-08-29 获用户批准，阶段 17 完成。阶段 18 仅解锁只读观察与 Spec。**
