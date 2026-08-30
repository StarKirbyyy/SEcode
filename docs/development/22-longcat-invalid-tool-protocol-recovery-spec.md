# 阶段 22 Spec：LongCat 无效工具调用与流协议恢复

## 1. 文档状态与审批门禁

- 当前状态：`已获用户批准；仅解锁阶段 22 Task 编写`。
- 生成日期：2026-08-30（北京时间）。
- 触发来源：阶段 21 T21-09 的真实 LongCat 回归已证明目录依赖恢复在真实轨迹中有界收敛，但第 18 次完成响应产生 malformed `run_process` 后，第 19 次请求收到无 `choices` 的 SSE data，最终以 `MODEL_PROTOCOL_ERROR` 失败。用户随后明确要求“修复后重新进行回归”。
- 前置状态：阶段 21 保留真实失败记录且不生成虚假 Summary；本阶段作为独立纠偏阶段承接模型协议层新缺口，不回写阶段 21 为成功。
- 阶段调整：本阶段成为阶段 22；“文档、视频与最终提交”顺延为阶段 23。
- 当前允许：依据本 Spec 编写或审阅 `22-longcat-invalid-tool-protocol-recovery-tasks.md`，并同步 `docs/development/README.md` 的阶段状态。
- 当前禁止：Task 再次获批前不得修改产品代码、测试、配置、事件协议或 UI，不得重新启动真实 LongCat 回归，不得生成阶段 21/22 Summary。

## 2. 阶段目标与需求追踪

本阶段修复的不是“让所有异常响应都重试”，而是两个已被确定性重放证明的窄缺口：无效工具调用不能以不合法的 provider history 回灌 LongCat；尚未接受任何语义输出时收到的有限 provider error envelope 可以在原模型请求内安全、有限地恢复。

| ID | 本阶段拟议需求 |
| --- | --- |
| FR-036 | 模型产生不可验证的工具调用时，Runtime 继续记录公开 `invalid_tool_call` 与直接失败结果且零执行副作用；下一次 provider 请求不得回放 malformed arguments、伪造新工具或把公开哨兵名冒充原函数名。 |
| FR-037 | 模型客户端识别有限的 SSE provider error envelope；只对明确可重试且尚未接受任何语义输出的错误使用既有最多三次 attempt 预算，成功后继续同一 Agent 模型请求。 |
| NFR-028 | 重试不得重复公开 delta、工具调用、审批或文件/进程副作用；重试成功后的 usage 必须标记不完整，run/Session Token 继续显示“至少/未知”，取消、单 attempt 超时和总墙钟预算不重置。 |
| NFR-029 | invalid tool correction、provider error 与 retry 诊断必须有限、确定、可测试；DeepSeek、LongCat、Generic 的合法文本、工具、usage、cache 与 continuation 行为不得回归。 |
| SEC-022 | 无效工具调用恢复不得执行 malformed 调用、发送原始错误包到事件/UI、泄露 raw arguments、provider message、reasoning、API Key 或绝对路径；不得新增第七个工具或自动授权进程。 |

关联并细化既有 `FR-004`、`FR-009`、`FR-031`、`NFR-003`、`NFR-005`、`NFR-023`、`SEC-006`、`SEC-019`、阶段 04 continuation 契约及 `AC21-09～AC21-10`。

## 3. 只读观察、反馈环与根因证据

### 3.1 T21-09 真实事实

- 第 18 次 LongCat 响应以 `finishReason=tool_calls` 完成，公开说明为“现在安装后端依赖”。其 `run_process` arguments 是损坏的 JSON 字符串，模型层正确归一化为 `MODEL_INVALID_TOOL_CALL`，Runtime 只产生 `tool.requested/tool.result`，没有 `tool.started` 或进程副作用。
- 第 19 次 Agent 模型请求随即开始；首个被解析的 SSE data 缺少 `choices`。当前错误只公开 `field=choices` 与 `partialOutputDiscarded=true`，没有保存 raw response、凭据或 reasoning。
- run 在 durable seq 115 以 `run.failed / MODEL_PROTOCOL_ERROR / iterations: 19` 收口；没有 `run.completed`、`AGENT_RUN_TIMEOUT` 或目标服务遗留。
- 事件、HTTP、终端 NDJSON 和 Web UI 对该失败保持一致；18 个已完成请求的 usage 与 provider/local cache 正常展示，第 19 次 usage 诚实保持未知。

### 3.2 确定性反馈环 A：invalid call continuation

只读 `tsx -e` 重放使用当前 `accumulateChatCompletion`、`buildChatRequest` 和 LongCat adapter，输入一个 provider 原始函数名为 `run_process`、arguments 为 malformed string 的 tool call。当前下一请求稳定生成：

```text
assistant.tool_calls[0].function.name = run_process
assistant.tool_calls[0].function.arguments = malformed string
tool.name = invalid_tool_call
tool.tool_call_id = 同一个 provider call ID
```

这同时存在两个协议矛盾：provider assistant history 保留损坏参数；紧随其后的 LongCat tool result 名称又与原函数名不一致。LongCat 官方模型模板的有效示例要求 assistant tool call 的 arguments 为对象，并要求 `role=tool.name` 使用同一个原函数名。本阶段以[官方 LongCat-2.0 仓库的 Chat Template](https://github.com/meituan-longcat/LongCat-2.0#chat-template)作为 provider-specific 事实来源；公开 API 仍按 [LongCat Chat Completions 文档](https://longcat.chat/platform/docs/api/chat.html)的 OpenAI-compatible SSE 边界接入。

### 3.3 确定性反馈环 B：首帧 provider error

只读模型客户端重放预置两个 HTTP 200 SSE response：第一次为带 `error` 且无 `choices` 的 data，第二次为合法 stop completion。当前结果稳定为：

```text
fetch attempts = 1
error = MODEL_PROTOCOL_ERROR
field = choices
partialOutputDiscarded = true
第二个合法 response 未被读取
```

`client.ts` 当前在任何 SSE data 到达时即设置 `payloadStarted=true`；随后所有 `ModelLayerError` 都强制 `retryable=false`。因此“收到一个 data event”被错误等同于“已经向用户或 Runtime 接受了不可安全重放的语义输出”。

### 3.4 现有测试为何未发现

- `chat-accumulator.test.ts` 覆盖 invalid arguments 归一化，但没有把该 completion 继续映射到下一次 LongCat 请求。
- `chat-mapper.test.ts` 覆盖合法 LongCat object arguments、provider ID 与 reasoning continuation，但没有 invalid/valid 混合调用或公开哨兵名。
- `client.test.ts` 覆盖 429/5xx、连接错误、timeout 和“公开 delta 后不重试”，但没有首个 data 为 provider error envelope 的用例。
- `runtime-tools.test.ts` 只证明 invalid call 零执行副作用，没有捕获下一次真实 provider wire request。
- 本次只读基线运行上述三个测试文件，结果为 3 files / 30 tests 全部通过；这证明是测试链路缺失，不是已有断言失败。

### 3.5 假设检验结论

| 假设 | 结论 | 证据 |
| --- | --- | --- |
| 无效工具结果名/参数污染下一次 LongCat history | 已确认 | 确定性 wire 重放同时出现 `run_process`、malformed string 与 `invalid_tool_call` 名称错配；官方模板要求 object arguments 与原函数名。 |
| 无 `choices` 的首帧错误本可有限恢复，但当前被一概视为已开始 payload | 已确认存在恢复缺口 | 两响应重放只执行一次 fetch；第二个合法 response 永远不可达。 |
| SSE 行解析器把注释、心跳或非 data 字段误判为 chunk | 已排除 | `sse.ts` 已忽略注释与非 data 字段；真实失败发生在已交付给 JSON chunk 校验的 data。 |
| 真实 raw error envelope 的具体 code/message 可从现有事件还原 | 无法确认且不应猜测 | 现有脱敏边界只持久化 `field=choices`，没有 raw body；本阶段不通过扩大日志泄露来补证据。 |

## 4. 方案比较与选定方案

### 4.1 invalid tool call 的 provider history

| 方案 | 结论 |
| --- | --- |
| 原样续传 malformed arguments，只把 tool result name 改回原名 | 不采用。名称虽然一致，损坏 arguments 仍可能使 provider 请求模板或校验失败。 |
| 把公开 `invalid_tool_call` 注册为第七个模型工具 | 不采用。它不是可执行能力，会扩大公共工具协议并诱导模型调用伪工具。 |
| 任意替换为某个合法工具名和空参数 | 不采用。它会伪造模型没有产生过的调用并可能误导 provider。 |
| 从 provider continuation 排除 invalid call，在 Context 中以固定中文纠错事实反馈；合法 sibling 保持原 continuation | 采用。公开审计事实不丢失，provider wire history 保持合法，invalid call 仍零执行。 |

### 4.2 无 `choices` SSE data

| 方案 | 结论 |
| --- | --- |
| 忽略所有无 `choices` chunk | 不采用。会吞掉鉴权、请求错误或未来不兼容协议，最终可能伪造成功。 |
| 所有 `MODEL_PROTOCOL_ERROR` 都自动重试三次 | 不采用。确定性坏请求只会重复计费；已有公开 delta/tool fragment 时还会重复用户可见输出。 |
| 严格识别有限 provider error envelope，并按错误类别与“是否已接受语义输出”决定 retry | 采用。保持严格协议校验，同时覆盖真实失败形态的安全恢复窗口。 |

## 5. 设计规格

### 5.1 invalid call 的公开事实与 provider-safe correction

1. `NormalizedModelToolCall(ok=false)`、公开 `invalid_tool_call`、原有 `MODEL_INVALID_TOOL_CALL` reason 和直接 `tool.result` 保持；该调用不得产生 `tool.started`、审批或执行器调用。
2. accumulator 只把 `ok=true` 的 provider tool calls 写入下一 continuation。invalid call 的原始 provider ID、name、arguments 和 reasoning 不得因纠错而写入 JSONL，也不得以不合法 assistant/tool 协议回放。
3. Context message renderer 识别公开 `invalid_tool_call` exchange，不把它渲染为 assistant `tool_calls` 或 `role=tool`。改为一条固定、有限的中文 system correction：上一轮某个工具调用未通过参数/名称校验、没有执行、请依据当前工具 Schema 重新生成。
4. correction 只允许包含受控 reason code、invalid 数量和安全索引；不包含 raw arguments preview、provider message、绝对路径、秘密或 reasoning。公开事件/UI 仍可按既有脱敏规则展示有限 preview，模型纠错上下文不重复发送该 preview。
5. 同一 completion 同时含合法与 invalid sibling 时，合法 calls 保持 provider ID、原始合法 arguments 形态和串行执行一次；invalid calls 被排除并聚合为最多一条 correction。不得因一个 invalid sibling 丢弃合法工具结果或重复合法调用。
6. 没有 continuation 的旧 JSONL 恢复也使用相同 Context 过滤规则；旧事件零迁移，不能把历史 `invalid_tool_call` 重新伪装成可执行工具。

### 5.2 provider error envelope 与语义开始边界

1. JSON chunk 校验仍优先接受现有 completion/usage 形态。缺少 `choices` 时只额外尝试严格、有限的 provider error envelope Schema；任意其他未知结构仍为非重试 `MODEL_PROTOCOL_ERROR`。
2. error envelope 只读取受限 code/type/status；message、raw body、headers 和未知字段不进入事件。鉴权、支付、请求非法映射为现有非重试错误；rate limit、timeout、overloaded/unavailable/internal 等明确瞬时类别映射为现有可恢复错误；未知 code 不猜测为瞬时故障。
3. 用“已接受语义输出”替代“收到任意 data”作为重试副作用边界。可见 content、reasoning、tool fragment、usage 或 finish reason 任一通过运行时校验后即视为语义已开始。
4. 只有明确可重试 error envelope 且语义尚未开始，才使用模型客户端既有最多 3 attempts、退避、attempt timeout 和父 `AbortSignal`。不得创建第二个 Agent run、第二个 `model.requested` 或重置模型请求/工具/墙钟预算。
5. 若语义已经开始，继续保持不重试并设置 `partialOutputDiscarded`；必须取消剩余 response body，StreamingVisibleTextGate 丢弃未形成安全片段的积压，不重复 delta 或工具。
6. retry 后成功 completion 设置 `usageComplete=false`，现有 run/Session ledger 显示“至少/请求用量未知”；不能把最后一次 response 的 usage 当成所有 provider attempts 的精确总和。provider/local Context cache 仍只记录真实返回字段和本地事实。

### 5.3 错误、事件与跨层一致性

1. 不新增错误码即可表达本阶段：继续使用 `MODEL_INVALID_TOOL_CALL`、`MODEL_AUTH_ERROR`、`MODEL_PAYMENT_REQUIRED`、`MODEL_REQUEST_INVALID`、`MODEL_RATE_LIMITED`、`MODEL_PROVIDER_UNAVAILABLE`、`MODEL_TIMEOUT` 与 `MODEL_PROTOCOL_ERROR`。
2. 若后续 Task 证明现有 `usageComplete` 无法让 Terminal/Web 诚实表达 retry 后未知 usage，只允许增加向后兼容的可选 attempt 计数字段；不得为便利预先新增事件或第二账本。
3. JSONL、NDJSON、HTTP、Terminal、Client/Web 对最终 completion/failure 与 usageComplete 使用同一现有事件投影；客户端不得实现 provider retry 状态机。
4. 失败详情只含有限 adapter/profile/attempt/provider code 分类，不含 endpoint query、Authorization、raw error、prompt、tool arguments 或私有异常。

## 6. 安全与兼容性

- DeepSeek 与 Generic 的合法 string arguments、LongCat 的合法 object arguments、provider call ID、reasoning continuation 与 usage-only tail chunk保持不变。
- invalid call correction 是模型输入事实，不是用户消息、工具执行或授权；不得影响 planning 只读、危险工具审批、目录恢复、完成证据或语言门预算。
- retry 只发生在同一个 `ModelClient.complete` 内，复用完全相同的 request snapshot；不得重建 Context、压缩历史或重新执行工具。
- 真实 `.env.local` 与 API Key 仍只由应用加载；自动测试使用假 endpoint 和哨兵秘密。
- 不保存真实 provider error body来换取可诊断性；以 envelope 分类、有限 code 和确定性 fixture 作为反馈环。
- 不新增依赖、Agent 框架、模型 SDK、工具、数据库或迁移。

## 7. 验收标准

| ID | 验收标准 |
| --- | --- |
| AC22-01 | malformed arguments 的 LongCat completion 仍产生一个公开 invalid direct result且零 `tool.started`；下一 provider request 不含 malformed arguments、`invalid_tool_call` assistant/tool 帧或不匹配的 tool name，并收到固定有限 correction。 |
| AC22-02 | 合法与 invalid sibling 混合时，合法调用保持 provider ID/object-or-string arguments 并只执行一次；invalid sibling 零执行且只形成一条 correction。 |
| AC22-03 | DeepSeek、LongCat、Generic 的合法 text/tool/usage/continuation、LongCat object arguments、旧 JSONL 无 continuation 恢复全部保持兼容。 |
| AC22-04 | 首个 data 为明确瞬时 provider error envelope、零语义输出时使用既有最多 3 attempts；第二次成功返回 completion 且 `usageComplete=false`，Agent 仍只有一次 `model.requested`。 |
| AC22-05 | 公开 content、reasoning、tool fragment、usage 或 finish 任一已接受后发生错误时不重试；无重复 delta、tool result、审批或文件/进程副作用。 |
| AC22-06 | auth/payment/request-invalid/未知 envelope/任意未知 chunk 不盲目重试；取消、attempt timeout、retry sleep、总墙钟和最多三次 attempt 保持原语义。 |
| AC22-07 | error/correction/usage 在 Model、Agent、Storage、Terminal、HTTP、Client/Web 中有限、脱敏且一致；哨兵秘密、raw arguments、provider message、reasoning 和绝对路径不可见。 |
| AC22-08 | 专项 RED/单元/集成/Terminal/Server/E2E、lint、typecheck、全量 test、coverage、webpack、Turbopack 与 `git diff --check` 全部按 Task 真实执行并记录。 |
| AC22-09 | 自动门禁展示后经用户独立授权，在全新 marker/Session/非 3000 端口完成真实 LongCat 多 scope 项目：前后端分别验证、双 readiness、API 与浏览器流程通过，首次合规完成声明产生 `run.completed`；无 `MODEL_PROTOCOL_ERROR`、完成误拒绝、重复副作用或超时，所有服务释放。 |
| AC22-10 | 真实回归继续核对公开中文说明、tool-only（若真实产生则如实显示）、reasoning 隐藏、每请求/run/Session Token、Context 摘要、provider/local cache 与压缩；未实际发生的 provider retry、tool-only 或 compaction 不伪造为已覆盖，由确定性测试提供对应证据。 |

## 8. 验证策略与阶段门禁

1. Task 实施必须先把两条只读 `tsx -e` 重放转成正式 RED：跨 accumulator/continuation/Context/mapper 的 invalid call wire 测试，以及首帧 error envelope 后第二 response 可达的 client 测试。
2. 再加入 mixed sibling、无 continuation 恢复、合法三 provider 差分、语义开始后禁止 retry、取消/timeout/usageComplete/secret 哨兵。
3. Agent/Terminal/Server 集成使用假 provider 捕获连续 request body，证明 invalid direct result 零执行、下一 request 合法、一次 Agent 模型请求内 provider retry 不重复 durable request/tool 事实。
4. Web 只验证既有错误和未知 usage 投影，不在 UI 增加 retry 判定；只有 Task 证明现有展示不足且 Spec 5.3.2 条件成立时才允许最小 optional 字段。
5. 完成完整自动门禁并展示真实结果后立即停止。真实 LongCat 回归必须再次获得独立用户授权；本 Spec/Task 批准、历史 T21-09 授权和单个工具审批都不能复用。
6. 真实回归使用新的系统临时 marker 根、独立数据目录、全新 Session 和一致的非 3000 目标端口，不复用 Stage 20/21 fixture 或真实用户项目，不读取/输出 API Key。
7. 只有 AC22-01～AC22-10 全部通过后生成阶段 22 Summary；失败则如实记录并停止，不现场放宽协议、不反复运行挑选成功样本。

## 9. 范围外

- 不实现 Anthropic Messages/Responses API，不更换 provider、模型、endpoint 或凭据方案。
- 不对所有未知 SSE chunk 做容错，不忽略 schema error，不把非瞬时请求错误自动重试。
- 不展示或持久化 raw provider error、raw malformed arguments、private reasoning 或 continuation。
- 不重做阶段 20 usage/cache/compaction，也不修改阶段 21 目录恢复与完成证据算法。
- 不新增可执行 `invalid_tool_call` 工具，不安装 SDK，不修改真实用户生成项目。
- 不 commit/push，不发布部署，不制作最终文档、视频或提交材料。

## 10. 风险、假设与选定边界

| 风险/决策 | 选定边界 |
| --- | --- |
| 排除 invalid provider call 会改变原始 assistant history | 只有无法验证且绝不能执行的 call 被排除；公开 durable 事实保留，并用固定 correction 告知模型。合法 siblings 继续原样续传。 |
| provider error envelope 可能各家不同 | 只接受严格有限公共形态与已知 code 分类；未知结构继续失败，不为单一 LongCat 样本关闭全局校验。 |
| retry 可能产生额外计费但无 usage | 只在零语义输出的瞬时错误恢复，沿用最多三次预算；成功后 usageComplete=false，账本显示至少/未知。 |
| 真实 LongCat 不一定再次生成 malformed call | invalid 路径由确定性跨层测试强制覆盖；真实回归检验完整 provider/Agent 项目闭环，不操纵模型输出冒充同一路径。 |
| 阶段 21 尚未完成即进入阶段 22 | 这是用户针对新协议阻塞的明确修复请求；阶段 21 保留失败事实，本阶段不追认其 Summary。 |

## 11. Spec 审批门禁

- 审批结果：`已批准`。
- 审批记录：用户于 2026-08-30 在收到本 Spec、阶段范围和停止点后回复“批准”；本次批准只解锁阶段 22 Task 的编写，不构成 Task 批准、开发授权或真实 LongCat 回归授权。
- 批准本 Spec 只解锁 `22-longcat-invalid-tool-protocol-recovery-tasks.md` 的编写。
- Task 再次获批前，仍不得修改产品代码、测试、配置、事件协议或 UI，也不得启动真实 LongCat 回归。
- 真实 LongCat 回归必须在自动门禁结果展示后再次取得独立授权。
