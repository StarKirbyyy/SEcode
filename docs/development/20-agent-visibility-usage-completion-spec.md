# 阶段 20 Spec 修订 1：Agent 可见输出、完成证据、用量与缓存系统

## 1. 文档状态与审批门禁

- 当前状态：`修订 1 已批准`。
- 生成日期：2026-08-30（北京时间）。
- 触发来源：用户对 2026-08-30 12:19:23～13:34:29 的真实 LongCat Agent 运行反馈项目完成度、LLM 可见文本和上下文/缓存/Token 可观测性问题；只读诊断后，用户明确同意“新开一个阶段重新 Spec”。
- 前置状态：阶段 19 的 T19-00～T19-06 已完成，T19-07 尚未获得独立授权且不再作为下一步执行；阶段 19 未生成 Summary，也不伪装为已完成。用户本次明确授权以新的纠偏阶段承接真实运行暴露的跨层缺口。
- 阶段调整：本阶段成为阶段 20；“文档、视频与最终提交”顺延为阶段 21。
- 修订来源：用户在初版 Spec 待审期间要求同时完成缓存系统，并在只读观察确认边界后批准将供应商 Prompt Cache 接入、本地上下文增量缓存和固定派生数据缓存纳入本阶段；该批准授权生成本修订版，不提前视为对修订后全文的批准。
- 当前允许：审阅或修订本 Spec，并同步阶段索引与流程编号。
- 当前禁止：本 Spec 获批前不得生成 Task，不得修改产品代码、测试、事件协议、模型 usage 契约或 UI；不得启动真实模型回归或生成阶段 19/20 Summary。

## 2. 阶段目标与需求追踪

本阶段修复“运行看似活跃但缺少可见模型说明、完成声明缺乏验证、用量与缓存事实不可观察”的跨层问题。它不展示模型私有推理，不猜测供应商未返回的缓存或计费数据。

| ID | 本阶段拟议需求 |
| --- | --- |
| FR-029 | 模型公开的 `delta.content` 经过增量秘密过滤与简体中文分段合规门后，作为真实 `assistant.delta` 及时显示；工具调用前后的可见说明与 durable assistant 事实一致。 |
| FR-030 | Agent 对代码或配置产生变更后，只有取得变更后的结构化验证证据，才能以成功完成任务；启动成功、HTTP 200、warning 或文件数量不能替代 lint/test/typecheck/build/关键流程证据。 |
| FR-031 | 工作台与终端显示每次模型请求、当前 run 和整个 Session 的输入、输出、总 Token，以及供应商明确上报时的缓存命中/未命中 Token 和命中率；Context 摘要调用单独标识并计入累计。 |
| FR-032 | Context Provider 使用有界、可失效的本地增量缓存复用已经验证的不可变事件前缀、历史投影和固定派生数据；下一次构建只处理新增事件尾部，且 warm build 与从 JSONL 全量重建的 cold build 产生相同模型上下文。 |
| FR-010、FR-019 | Context 压缩继续保留原始 JSONL；运行时可看到压缩次数、策略、范围、模型摘要/本地降级结果与用量完整性，但压缩不得被标记为缓存命中。 |
| FR-005、FR-015、FR-017 | 模型轮次、工具、状态、中文可见正文和预算统计保持同一事实口径；不展示或持久化私有 reasoning 正文。 |
| NFR-018 | 完成证据必须发生在最后一次相关变更之后；真实模型验收不能只断言服务可访问。 |
| NFR-023 | usage 缺失、重试、摘要超时或供应商不支持缓存明细时，UI 必须显示“至少/不完整/未上报/不支持”，不得用 0 或推算值伪装精确事实。 |
| NFR-024 | 可见文本流在正常网络下按真实公开内容持续推进；断线、刷新、终态和 durable authoritative message 不重复、不倒退、不重放历史动画。 |
| NFR-025 | 供应商 Prompt Cache 与本地 Context Cache 使用独立名称、命中口径和指标；本地命中只报告避免的事件读取、字节、投影工作和构建耗时，不宣称节省供应商 Token 或费用。 |
| SEC-019 | 实时文本、usage、缓存统计和完成证据不得泄露 API Key、私有 reasoning、原始异常、隐藏工具正文或工作区外绝对路径；流式显示不能绕过既有中文合规门。 |
| SEC-020 | 本地缓存不是事实源或授权源，不得缓存 API Key、私有 reasoning、审批授权、能力句柄、准备执行的工具调用或未提交写入；Session 删除、存储恢复/尾部修复及协议版本变化必须使相关项失效。 |

## 3. 只读观察与事实证据

### 3.1 真实运行范围

- Session：`a4eb7092-3922-4b22-98a9-44862747a9e7`，工作区 `/Users/starkirby/Codes/test/web`，模型 `longcat`。
- Session 创建于 12:19:22，用户主要观察截止为 13:34:29；事件继续到 13:41:00，包含后续启动和 HTTP 检查。
- 首个执行 run 在 34 次模型请求、33 次工具调用后因 30 分钟总时限失败；后续主 run 使用 69 次模型请求、68 次工具调用完成，最后又以 4 次模型请求执行服务检查。
- 截止 13:34:29，供应商已报告至少 2,592,985 Token，另有 3 次摘要超时调用没有 usage；完整 Session 已报告至少 3,298,694 Token，真实值只能判定为更高而不能精确恢复。

### 3.2 可见正文链路未接通真实模型增量

- `ModelRequest` 与 `chat-accumulator` 已支持 `onTextDelta`，且只从公开 `delta.content` 触发，不会把 `reasoning_content` 交给该回调。
- `AgentRuntime` 发起业务模型请求时没有传 `onTextDelta`；当前只在完整 completion 返回并通过语言策略后，用 `publishLive(content)` 一次性发送整段内容。
- 本次 69 轮主 run 只有 5 条 durable `assistant.message`；其余绝大多数工具轮没有公开 content，且没有 `model.output.rejected`，因此不是客户端过滤或中文合规门误删，而是“提供方未给公开说明 + Runtime 未接增量”的组合结果。
- `assistant.delta` 是 live 事件，本来就不写入 JSONL；不能以 JSONL 缺少 delta 单独证明流式失败，必须以 Runtime 接线和实时事件测试为证据。
- 既有 `StreamingSecretRedactor` 可处理跨 chunk 的 `sk-`、Bearer 和环境变量秘密，但当前 Runtime 未使用它；恢复接线时必须先验证分片边界、结束、取消和 sink 失败清理。

### 3.3 完成声明只证明“可启动”

- 生成项目完成了依赖安装、Prisma generate/db push/seed、前后端 service readiness 和两个 HTTP 200 检查。
- 事件中没有后端 build、前端 build、lint、typecheck、项目测试或浏览器关键流程验收；生成项目自身没有测试文件。
- 最终正文把两个 HTTP 200 扩大为“前后端服务均已正常运行/项目完成”，没有区分“启动证据”“构建证据”“功能证据”和“未验证项”。
- System Prompt 已要求完成证据，但真实模型仍可违反软约束；本阶段需要窄、确定性的运行时完成证据门，而不是继续堆叠提示词。

### 3.4 Context 压缩已工作，但不是缓存系统

- 配置的 LongCat context window 为 64,000；Context 在保守估算达到 75% 输入预算时压缩，保留最近至少 8 个完整回合和原始 JSONL。
- 本次实际产生 6 个 `context.compacted`：3 次模型摘要成功，3 次模型摘要 60 秒超时后使用 `deterministic_fallback`。
- 压缩把单轮输入维持在约 48k～51k Token 附近，主要解决“能否继续请求”，并不自动降低累计成本；频繁工具轮仍反复发送较大的上下文。
- UI 目前只显示最后压缩到的序号，不能看到次数、策略分布、fallback 原因或摘要调用用量。

### 3.5 Token 已有部分事实，缓存明细没有进入协议

- `model.completed` 和 `context.compacted` 已能保存 prompt/completion/total usage 与 `usageComplete`；客户端能累计指定 run，transcript 能显示每轮 total Token。
- 详情抽屉默认只投影最新 run；新 run 开始后，用户看不到此前 run 的 Session 累计，容易把最后 105,134 Token 误认为全部消耗。
- 当前 wire usage schema 不解析缓存字段；`ModelUsage`、事件 Schema、Terminal 和 Web 也没有 cached/miss 字段或命中率。
- [DeepSeek 官方 Context Caching 文档](https://api-docs.deepseek.com/news/news0802/)说明 usage 提供 `prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens`。[LongCat 官方 Chat Completions 文档](https://longcat.ai/platform/docs/zh/api/chat)当前公开示例只展示 prompt/completion/total 与 reasoning token，并未承诺缓存命中明细；因此 LongCat 未上报时只能显示“未上报/不支持”，不能从重复前缀或价格档位反推命中。
- Token 属于模型请求而不是工具调用。工具调用本身不显示伪造的 Token；它的参数和结果会影响下一次模型请求的 prompt Token。

### 3.6 本地 Context 每轮全量重建，尚无缓存系统

- `EventBackedAgentContextProvider.buildContext()` 当前每次模型请求都从 `afterSeq = 0` 分页读取 Session 全部 JSONL 事件，再完整执行历史投影、工具输出投影、消息渲染和 Token 估算；事件增长后重复 I/O 与 CPU 工作随之增长。
- Server 生命周期内 Runtime/Context Provider 是应用级复用对象，Terminal 生命周期内也是单次进程复用对象，因此具备实现进程内有界缓存的稳定生命周期；进程重启后允许冷启动，不需要新增持久缓存文件。
- `chat-mapper` 的 continuation 状态只保存 provider assistant turn、reasoning continuation 和 tool call ID 映射，每次请求仍发送完整 `messages`；它不是供应商 KV cache，也不是本地响应缓存。
- 当前消息顺序在固定系统政策之后放置经常变化的动态 Context memory，再放历史回合。供应商前缀缓存只可能复用完全相同的前缀；Task 必须在不改变语义和中文政策优先级的前提下验证稳定前缀布局，不能仅凭文本相似宣称命中。
- Server JSON/NDJSON 响应已使用 `no-store`。Session、运行、事件和审批属于实时状态，HTTP 缓存不属于本阶段缓存系统，且不得为了“命中率”而开启。
- 正常 Agent completion 尤其可能包含工具调用；缓存并重放旧 completion 会使用过期工作区事实、绕过新的审批/预算/取消状态并可能重复副作用，因此响应回放缓存不具备可接受的安全语义。

## 4. 范围

### 4.1 范围内

1. 业务模型公开 `delta.content` 到 Agent live event、NDJSON、客户端账本和 TypingText 的安全增量链路。
2. 增量秘密过滤、简体中文分段合规、取消/断线/重试/终态一致性，以及对私有 reasoning 的持续抑制。
3. 工具轮公开说明缺失时的明确 UI 状态；不把工具卡、reasoning 或本地模板伪装成 LLM 正文。
4. 代码/配置变更后的运行时完成证据状态、有限纠正请求、成功/失败/未验证的最终语义。
5. provider usage 的可选缓存命中/未命中与 reasoning token 计数归一化；主模型和 Context 摘要分别记录。
6. 每轮、当前 run、整个 Session 的 usage 聚合、完整性、缓存命中率和 Context 压缩状态展示。
7. 供应商 Prompt Cache 的稳定前缀优化和实际 usage 接入；应用不代替供应商创建或声称管理其服务端 KV cache。
8. 进程内、有界的本地 Context 增量缓存：复用经校验的事件前缀、历史投影及固定系统提示词/工具定义/确定性 Token 估算等固定派生数据。
9. 本地缓存的冷/热等价、尾部增量、并发一致性、失效、容量、指标和安全验证。
10. Terminal、HTTP/NDJSON、Web、刷新恢复、旧 JSONL、单元/集成/E2E 与真实模型验收。

### 4.2 范围外

- 不展示、记录、摘要或推断模型私有 reasoning 正文。
- 不实现或重放业务模型 completion/response 结果缓存，不代替供应商创建或管理服务端 KV cache。
- 不新增持久缓存数据库或缓存文件；进程重启后允许从 JSONL 冷构建。
- 不为 Session、运行、事件流或审批 API 开启 Next.js/HTTP/CDN 缓存。
- 不根据文本相似度、continuation、上下文复用或价格推测缓存命中。
- 不计算人民币/美元费用，不内置易变价格表，不把 Token 数等同于最终账单。
- 不为每个工具调用分摊虚构 Token；不修改六工具边界，不新增 Agent 框架。
- 不保证任意生成项目的产品设计天然成熟；本阶段保证完成声明与实际验证证据一致，并用真实项目任务检验。
- 不修改真实用户生成项目 `/Users/starkirby/Codes/test/web`，不清理现有服务，不提交、推送、发布或部署。

## 5. 设计规格

### 5.1 真实可见文本的安全流式链路

1. Runtime 为每次业务模型请求创建独立的流式可见正文状态，并把 `onTextDelta` 传给 `ModelClient.complete()`；Context 摘要继续不传增量回调。
2. 只有 `delta.content` 可以进入可见链路；`reasoning_content` 只做有界协议累积和可选计数，任何正文都不得进入 live/durable 事件、日志或 UI。
3. 原始 chunk 先经过跨 chunk 的 `StreamingSecretRedactor`，再进入有界中文分段门。分段门只发布已经独立判定为中文合规或允许的代码/命令/路径/URL/JSON 事实片段；未闭合片段保留到后续 chunk，不能为追求低延迟绕过合规。
4. 分段单位、最大缓冲、允许的技术片段和结束处理必须在 Task 中冻结并以拆字、跨 chunk secret、中文夹技术英文、纯英文、代码围栏和超长无分隔文本测试证明。不能使用“先展示、失败后撤回”。
5. 每个发布片段形成递增 `assistant.delta.streamSeq`。模型完成后，现有完整正文仍执行最终秘密与语言校验；durable `assistant.message` 是 authoritative 事实，客户端收到后清除该 run 的 live draft，不重复正文。
6. 若增量门已发布片段但最终完整正文不一致、协议失败或语言失败，Runtime 不得持久化错误正文；Task 必须设计可解释的终止/重述与 live draft 清理事件顺序，且已展示内容本身必须已经逐段合规和脱敏。
7. retry 不得复用上一 attempt 的 live 序号或拼接部分输出；取消、sink 失败和模型错误必须 abort redactor/gate，且不能继续执行半截工具参数。

### 5.2 工具轮可见说明与 UI 诚实状态

1. System Prompt 下一版本要求模型在有实际进度、决策变化、失败诊断或验证结论时，将简短简体中文说明放入公开 content；不得要求或诱导输出 reasoning。
2. 模型只返回 tool calls 且公开 content 为空时，UI 显示中性的系统事实“模型返回工具调用，未提供可见说明”，它属于轮次状态而不是 assistant 消息，不使用打字动画。
3. 不能把工具参数摘要自动改写成“LLM 输出”，不能虚构“正在思考”“已经理解”或完成进度。
4. transcript 继续以真实事件顺序呈现：模型请求/公开说明/工具/结果；积压 delta 必须在工具、审批、错误或终态前 flush 到安全边界，不能延迟关键状态。

### 5.3 运行时完成证据门

1. Runtime 在当前 run 内维护最小内存态 `CompletionEvidenceState`，不跨 run 当作授权，不删除或改写历史事件。
2. 成功的 `write_file` / `replace_in_file` 对代码、配置、依赖清单、数据库 schema 和构建脚本产生“待验证变更”；文档或纯说明文件可由写工具自身结果证明写入，不强制运行项目命令。
3. 只有发生在最后一次相关变更之后的验证才有效。service readiness 只记为“启动验证”，HTTP 200 只记为“连通性验证”，都不能单独清除代码质量/功能待验证状态。
4. Task 必须冻结有限的结构化验证分类，至少覆盖项目脚本中的 lint、test、typecheck/check、build，以及常见直接验证程序；分类依据 `program`、`args`、`cwd`、lifecycle 和结构化 result，不扫描或相信 stdout 中自称成功的文本。
5. 若代码/配置仍待验证而模型返回 `stop`，Runtime 不立即 `run.completed`：追加新的有限 completion-evidence rejection 事实，并在同一 run 发起纠正请求，明确缺少的证据类别。纠正共享原模型请求计数、工具预算、取消和总时限，不重复已经执行的工具。
6. 纠正次数必须有限；仍无证据时以新的结构化错误失败或以明确的“外部阻塞/未完成”终态结束，不能降级为成功。用户明确要求不运行测试或外部环境确实阻塞时，最终正文必须区分已完成修改、未执行验证和风险；是否允许成功终态须在 Task 中冻结，不能临时决定。
7. 对创建可运行 Web 项目的真实验收，最低证据包括依赖安装结果、前后端 build/typecheck、项目测试（若无测试则必须先补最小关键流程测试）、双 service readiness、代表性 API 断言和页面关键流程；仅 HTTP 200 不通过。

### 5.4 usage 与缓存字段归一化

1. 扩展 `ModelUsage` 和事件 `UsageSchema`，字段均为可选非负安全整数：

```ts
interface ModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedPromptTokens?: number;
  cacheMissPromptTokens?: number;
}
```

2. DeepSeek 映射 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`；Generic/OpenAI-compatible 仅在响应实际包含 `prompt_tokens_details.cached_tokens` 时映射 `cachedPromptTokens`。LongCat 使用同一兼容解析，但官方未承诺的字段缺失时保持 undefined。
3. 不从 `promptTokens - cachedPromptTokens` 自动生成 miss，除非对应 provider 契约明确规定且测试固定；通用层优先保留未知。
4. reasoning 只保存数量，不保存正文；Task 必须核对 provider 的 total/completion/reasoning 包含关系，不自行相加改写供应商 total。
5. `usageComplete` 描述请求 usage 是否完整；缓存维度另有 `cacheStatus: reported | partial | unreported | unsupported` 的投影语义。旧事件没有缓存字段时是 unreported/unsupported，不是 0% 命中。
6. Context 模型摘要成功时 usage 与缓存字段写入 `context.compacted`；摘要 timeout/fallback 继续标记至少和未完整，未知消耗不伪造为 0。

### 5.5 每轮、run 与 Session 聚合

1. 每个 `model.completed` 轮次显示输入、输出、总 Token；存在时显示 reasoning、缓存命中/未命中与该请求命中率。usage 只有在供应商最终 SSE usage 到达后确认，请求进行中显示“等待供应商用量”。
2. 缓存命中率只在分母可靠时计算：

```text
有 hit + miss：hitRate = hit / (hit + miss)
只有 cached + provider 明确 promptTokens 包含 cached：hitRate = cached / promptTokens
其他情况：未上报，不能计算
```

3. run 聚合分别按字段求和，包含业务模型和该 run 触发的 Context 摘要；UI 同时提供“业务模型”“Context 摘要”“合计”，避免把摘要成本隐藏在主轮次之外。
4. Session 聚合遍历该 Session 全部 run 的 durable usage，不因最新 run 切换而清零。取消、失败和中断 run 的已报告 usage 仍计入 Session 总量。
5. 任一已发起请求缺失 usage、发生带未知 usage 的 retry 或摘要 timeout 时，相应聚合显示“至少 N”和未知请求数；字段独立累计，不用 total 反推 prompt/completion。
6. 工具卡不显示 Token 数；可在说明中标注“工具本身无模型 Token，结果将在后续模型请求中计入输入”。

### 5.6 Context 压缩可观测性

1. 运行详情把“上下文压缩”与“供应商缓存”分成两个区域。
2. Context 区域显示：配置窗口、触发阈值、压缩次数、最新 throughSeq/retainedRange、model/fallback 次数、最近 fallbackReason、摘要 usage 完整性。
3. 不向 UI 暴露完整摘要正文、私有估算细节、被裁剪工具输出或绝对路径；原始 JSONL 仍是审计事实且不迁移。
4. 若当前事件不足以恢复某字段，显示未知；不得为展示方便新增会与 JSONL 冲突的客户端第二状态机。

### 5.7 供应商 Prompt Cache 与稳定前缀

1. DeepSeek 继续使用供应商自动 Context Caching，只接收并归一化实际返回的 hit/miss usage；Generic/OpenAI-compatible 与 LongCat 只解析响应中真实存在的兼容字段，不发送未由对应 provider 契约支持的臆造参数。
2. 固定系统政策、固定工具定义和可稳定复用的上下文片段应尽量形成确定性前缀；动态 run 状态、最新错误、计划和近期回合不得为了缓存命中而陈旧化、删除或移到语义错误的位置。
3. Task 必须用请求快照证明连续轮次的预期稳定前缀，并用 provider usage 证明真实命中；没有 usage 时只能报告“未上报”，不能用前缀长度预测值冒充命中。
4. Prompt Cache 命中不能跳过模型请求，不改变模型请求预算、超时、重试、取消或事件顺序。

### 5.8 本地 Context 增量缓存

1. Context Provider 内建立进程级、有界、按 Session 隔离的 read-through cache。缓存键至少包含 `sessionId`、已验证 `lastSeq`、模型 profile/context window、系统提示协议版本、工具定义版本以及会影响投影结果的 Context 算法版本。
2. 缓存值只包含从 durable JSONL 导出的不可变事件前缀、确定性历史投影和可安全复用的固定派生结果；JSONL、Session metadata 和当前事件尾部仍是唯一权威事实。
3. warm build 先验证 Session 仍存在且当前尾序号不小于缓存序号，再从缓存 `lastSeq` 之后读取尾部。发现序号不连续、尾序号回退、分页期间追加、recovery/tail repair 或元数据/版本不匹配时丢弃该项并执行 cold build；不得返回可能过期的上下文。
4. 同一 Session 的并发构建采用 single-flight 或等价串行策略；不同 Session 可独立进行。取消的构建、失败投影和不确定存储提交不得写入缓存。
5. Session 删除必须清除对应缓存；进程重启自然清空。缓存采用明确的 Session 数、事件数或字节上限及 LRU/等价确定性淘汰，不能随长任务和 Session 数无限增长。
6. 固定系统提示词、工具定义规范化与确定性 Token 估算可按版本独立缓存，但最终请求仍必须对最新完整消息执行预算校验。
7. 本地指标至少包括 cold/warm/invalidated、命中率、复用事件数/字节、尾部处理事件数和 Context build 耗时；不记录事件正文、摘要正文、路径、工具参数或秘密，不把这些指标计入 provider cached tokens。
8. Context 压缩摘要已经作为 durable `context.compacted` 事实复用，不再建立独立的摘要响应缓存。缓存淘汰不得删除摘要事件或原始历史。

### 5.9 禁止 Agent 响应回放缓存

1. 业务模型 completion、tool calls、语言重述、完成证据纠正和 Context 模型摘要响应不得以请求哈希命中后直接回放。
2. continuation 映射只服务协议连续性，不得被统计为本地或供应商缓存命中。
3. 测试必须证明重复的模型输入仍会发起新的模型请求，旧工具调用不会因缓存重复执行，审批、预算、取消和工作区最新状态仍由当前 run 判定。

### 5.10 事件、兼容性与数据迁移

- 优先扩展现有 `usage` 对象和新增有限 completion-evidence 事件，不改变既有事件含义、seq 或 ID。
- 所有新增事件先更新 Domain strict Schema、Agent 投影、Storage、Terminal、Server、Client、恢复与冻结旧 fixture；旧 JSONL 零迁移继续解析。
- live delta 不写 JSONL；durable assistant message、model completed、context compacted 和完成证据仍是恢复事实。
- 客户端只能从 durable 事件重建 run/Session usage 和压缩状态，不能用 React 状态累计后冒充审计值。
- usage 与缓存字段不含价格、账户余额、API Key、请求 body 或 provider 原始响应。
- 本地 Context cache 是可丢弃的进程内优化，不新增 durable 事件作为缓存真相；仅在既有运行详情投影中暴露不含敏感正文的诊断指标。

## 6. 错误与安全边界

- 增量秘密过滤必须覆盖跨 chunk 前缀、分隔符、结束和取消；发现 secret 时只发布 `[REDACTED]`，不允许先泄露后替换。
- 中文分段门不得翻译或改写代码、命令、路径、URL、JSON、哈希和真实 stdout/stderr；不确定片段宁可缓冲或抑制。
- 私有 reasoning 正文在 Model 层之后不可见；测试通过注入唯一标记并扫描 live、durable、日志、HTTP 和 UI 证明零泄露。
- completion-evidence rejection 不能执行工具、自动批准、重置预算或创建新 run，只能要求同一模型继续取得缺失证据。
- 缓存命中率只基于 provider usage；不读取账户后台、不抓取账单、不外发本地 Session 内容。
- 本地 Context cache 命中率必须与 provider 命中率分栏；缓存内容不得成为审批、工具执行、Session 存在性或完成状态的依据。
- warm build 任一完整性校验失败必须安全回退 cold build；不得用缓存可用性降低 JSONL 恢复、尾部修复或删除安全等级。
- 不削弱工作区边界、SHA-256、危险审批、planning 只读、进程清理、总时限或重复错误保护。

## 7. 验收标准

| ID | 验收标准 |
| --- | --- |
| AC20-01 | 多 chunk 公开中文 `delta.content` 经跨 chunk secret redactor 和分段语言门后按递增 live seq 到达 Terminal/Web；首个安全片段在 completion 前可见，durable message 到达后无重复或尾字丢失。 |
| AC20-02 | `reasoning_content`、纯英文不合规片段、API Key/Bearer/env secret 在 live、JSONL、NDJSON、日志、恢复和 UI 中均不可见；代码、命令、路径和 URL 事实保真。 |
| AC20-03 | tool_calls 带公开中文说明时先显示说明再显示工具；公开 content 为空时只显示诚实系统状态，不伪造 LLM 正文或 thinking。 |
| AC20-04 | retry、取消、模型协议失败、sink 断开、刷新和历史恢复不会拼接旧 attempt、重放动画、重复 durable 正文或继续执行半截工具调用。 |
| AC20-05 | 代码/配置最后一次变更后没有合格验证时，`stop` 不产生 `run.completed`；有限纠正后验证成功可完成，重复拒绝以结构化未完成结果收口。 |
| AC20-06 | build、lint/test/typecheck、service readiness、HTTP 连通性和关键功能证据分别记录；HTTP 200 不能替代 build/test，warning 不改变结构化成功/失败因果。 |
| AC20-07 | DeepSeek hit/miss、兼容 cached tokens、LongCat 未上报、重试不完整和摘要 timeout 五类 usage 正确归一化；未知值不显示为 0。 |
| AC20-08 | 每轮、run、Session 的 prompt/completion/total/reasoning/cache 聚合分别正确；取消/失败 run 与 Context 摘要计入 Session，总量在新 run 后不清零。 |
| AC20-09 | 命中率只在分母可靠时计算并满足边界 0%、部分、100%；partial/unreported/unsupported 明确区分，不能从 continuation 或文本重复推测。 |
| AC20-10 | Context 面板显示压缩次数、model/fallback、范围、最近原因和 usage 完整性，并与供应商 cache 区域分离；旧 JSONL 零迁移恢复。 |
| AC20-11 | 确定性自动测试覆盖 Model、Runtime、Context、Domain、Terminal、Server、Client、Web；lint、typecheck、全量 test、coverage、E2E、webpack build/Turbopack 实际结果和 `git diff --check` 如实记录。 |
| AC20-12 | 自动门禁展示后经独立用户授权，在全新 marker 临时工作区完成真实 LongCat 前后端项目回归：运行中有公开可见说明，首次写入顺序正确，非 3000 端口一致，项目具备并通过 build/关键测试/双 readiness/API/页面流程，最终证据与 usage/压缩/cache 展示一致。 |
| AC20-13 | 同一 Session、相同版本和相同 `lastSeq` 的第二次 Context build 命中本地缓存；warm 与强制 cold build 的 messages、工具定义、压缩选择和预算判定逐项相同。 |
| AC20-14 | 追加一个或多个事件后只读取并投影连续尾部；并发追加、序号回退、尾部修复、Session 删除、profile/context window、系统提示、工具 Schema 或 Context 算法版本变化均触发确定性失效或 cold fallback，绝不返回陈旧上下文。 |
| AC20-15 | 本地缓存具有容量上限、Session 隔离和确定性淘汰；取消、投影失败、commit uncertain、进程重启与删除不遗留可用脏项，缓存与诊断指标不含秘密或事件正文。 |
| AC20-16 | UI/Terminal 明确分开 provider cached tokens/hit rate 与 local Context cache hit rate/avoided work；重复模型输入仍调用 provider，包含工具调用的 completion 不被缓存或重放，事件和 HTTP API 保持 `no-store`。 |

## 8. 测试与真实验收策略

1. Model：SSE 拆分、公开/reasoning、usage provider 变体、重试、部分流、超限与取消。
2. Agent：增量 redactor/语言门、事件顺序、sink backpressure、完成证据状态、有限纠正、预算与审批不回归。
3. Context：主请求与摘要 usage 分账、fallback 未知用量、压缩计数和旧历史恢复。
4. Context Cache：cold/warm 差分、尾部增量、并发追加、recovery/repair/delete/version 失效、LRU 上限、取消/错误不污染和多 Session 隔离。
5. Model Cache：稳定前缀请求快照、provider usage 变体，以及重复输入仍实际调用 provider、tool calls 不回放。
6. Client/UI：每轮/run/Session 聚合、两类命中率状态、Context 压缩与两类 cache 分区、刷新/移动端/减少动态效果。
7. 真实回归继续使用全新系统临时工作区和 marker，不能复用 `/Users/starkirby/Codes/test/web` 或阶段 19 fixture；不读取或输出 API Key，不自动批准危险工具。
8. 真实模型运行必须在自动门禁完成后再次获得独立授权；Spec/Task 批准不能复用。

## 9. 风险与待审批决策

| 风险/决策 | 选定边界 |
| --- | --- |
| 实时显示与中文合规存在天然张力 | 不先展示后撤回；采用真实公开 delta 的有界分段合规，接受句段级延迟。具体分段算法在 Task 冻结。 |
| 流式 redaction 若处理错误会不可逆泄密 | 跨 chunk 状态机先于 live event；secret 注入测试是硬门禁。 |
| 完成证据分类可能误伤纯文档任务 | 只对代码/配置/依赖/schema 等相关变更建立命令验证门；文档写入保持轻量。分类清单需在 Task 明确。 |
| 供应商 usage 字段口径不同 | 保留原始提供方含义的规范化可选字段，不重算 total，不内置价格；不支持即明确显示。 |
| Session 数百万 Token 聚合可能影响前端 | 以现有分页 durable 事件做纯投影并测试规模；若需服务端聚合，必须在 Task 中明确 API 和一致性，不能临时新增第二事实源。 |
| 本地缓存可能返回陈旧上下文 | JSONL 始终权威；尾序号、连续性、recovery 和版本任一不匹配即 cold fallback，同 Session 并发构建受控。 |
| 缓存增长或泄露敏感内容 | 仅进程内、有界、按 Session 隔离，指标不含正文；删除、重启和确定性淘汰清理缓存。 |
| 稳定前缀优化可能改变提示语义 | 先冻结语义与请求快照，再优化确定性布局；缓存命中不能高于中文、安全、当前状态和完整历史要求。 |
| 响应缓存可能重复副作用 | 明确禁止业务 completion/tool call 回放；缓存只作用于确定性 Context 派生工作。 |
| 阶段 19 尚未 Summary 就开启阶段 20 | 这是用户针对真实缺口的明确流程重定向；阶段 19 保持未完成，T19-07 不执行，其真实门禁由 AC20-12 取代。 |

## 10. Spec 审批门禁

**当前状态：修订 1 已批准。**

审批记录：用户于 2026-08-30 在收到修订 1 文档链接及缓存范围说明后回复“批准”，语义等价于“阶段 20 Spec 修订 1 通过”。

本次批准只解锁 `20-agent-visibility-usage-completion-tasks.md` 的编写；Task 需再次独立批准后才能修改产品代码、测试、事件协议或 UI。真实 LongCat 回归仍由自动门禁后的第三次独立授权锁定。
