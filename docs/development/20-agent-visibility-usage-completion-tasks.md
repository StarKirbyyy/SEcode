# 阶段 20 Task：Agent 可见输出、完成证据、用量与缓存系统

## 1. 文档状态与审批门禁

- 当前状态：`T20-00～T20-08 已完成；T20-09 已独立授权并执行，但真实回归未通过，阶段 20 阻塞且未生成 Summary`。
- 批准的 Spec：[20-agent-visibility-usage-completion-spec.md](./20-agent-visibility-usage-completion-spec.md)。
- Spec 审批：用户于 2026-08-30 在收到 Spec 修订 1 全文链接后回复“批准”，语义等价于“阶段 20 Spec 修订 1 通过”。
- Task 审批：用户于 2026-08-30 在收到本 Task 全文链接和门禁说明后回复“批准”，语义等价于“阶段 20 Task 通过”；本次批准解锁 T20-00～T20-08，不解锁 T20-09。
- 本 Task 只把已批准 Spec 拆成可执行工作，不扩大模型、工具、工作区或发布边界。
- 当前允许：审阅本次失败记录，并由用户决定回退到阶段 20 Spec 修订或另开修复阶段观察。
- 当前禁止：在新授权前继续修改产品代码、测试、事件 Schema、API 或 UI，或再次启动真实 LongCat 回归；验收未通过，不得生成阶段 20 Summary。
- Task 初次获批只解锁 T20-00～T20-08；T20-09 后续已取得独立用户授权并执行，实际结果见本 Task 的 T20-09 记录。
- 本阶段不授权 Git commit、push、发布、部署、依赖升级或修改真实用户生成项目 `/Users/starkirby/Codes/test/web`。

## 2. 实施原则与冻结边界

1. 全部业务改动使用 TDD：先加入能证明真实缺口的失败断言，再做最小实现，再运行任务列出的专项验证。
2. JSONL 继续是 Session、run、assistant、usage、压缩和完成状态的唯一 durable 事实源；本地 Context cache 只是可丢弃的进程内优化。
3. 供应商 Prompt Cache、本地 Context cache 和 Context compaction 是三种不同能力，事件、投影、Terminal 和 UI 不复用名称或命中率。
4. 不缓存或回放业务 completion、tool calls、语言重述、完成证据纠正或 Context 摘要响应；重复输入仍发起新的 provider 请求。
5. 私有 `reasoning_content` 只能用于有界协议累积和数量统计，正文不得进入 live/durable 事件、缓存、日志、HTTP、Terminal 或 UI。
6. 不引入 Agent 框架、缓存数据库、持久缓存文件、CDN/HTTP 响应缓存或新的本地工具。
7. 新增字段保持可选，旧 JSONL 和旧 HTTP fixture 零迁移可解析；未知 usage 不写成 0，也不通过字段相减推测。
8. 修改 Next.js/React 前先阅读本机 Next.js 16.3.3 中与 Route Handler、Server/Client Component、缓存和 Playwright 直接相关的文档，并记录结论。
9. 所有自动测试只使用内存 fixture 或系统临时工作区；不得读取 `.env.local`、输出凭据或修改真实 Session/项目。

## 3. 公共契约与内部接口冻结

### 3.1 Provider usage 与 durable 诊断

扩展现有 `ModelUsage` 和 Domain `UsageSchema`，不保存 provider 原始响应：

```ts
export interface ModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedPromptTokens?: number;
  cacheMissPromptTokens?: number;
}

export type ProviderCacheStatus =
  | "reported"
  | "partial"
  | "unreported"
  | "unsupported";
```

解析规则冻结如下：

- DeepSeek 顶层 `prompt_cache_hit_tokens` 映射 `cachedPromptTokens`，`prompt_cache_miss_tokens` 映射 `cacheMissPromptTokens`。
- OpenAI-compatible `prompt_tokens_details.cached_tokens` 映射 `cachedPromptTokens`。
- 同一响应同时出现顶层 hit 与 details cached 且值不同，返回 `MODEL_PROTOCOL_ERROR`，不能静默选一个。
- LongCat 和 Generic 只消费真实返回字段；没有字段时保持 `undefined` 和 `unreported`。
- `reasoningTokens` 不与 `completionTokens` 或 `totalTokens` 再相加。
- `reported` 表示可靠分母可计算，`partial` 表示只收到部分缓存字段，`unreported` 表示契约可能支持但本次未返回，`unsupported` 仅供明确声明不支持的 profile 使用。

扩展既有 `model.completed` 和 `context.compacted` usage；`model.completed` 另带不含正文的 Context build 诊断：

```ts
export interface ContextCacheDiagnostic {
  status: "cold" | "warm" | "invalidated";
  reusedEvents: number;
  tailEvents: number;
  avoidedBytes: number;
  buildMilliseconds: number;
}
```

所有数值为有限非负安全整数。`avoidedBytes` 是本地读取/投影避免量，不是 cached Token。诊断作为既有 `model.completed` 的可选字段持久化，以便刷新后按 JSONL 恢复；它不授权缓存内容，也不新增缓存事实事件。

### 3.2 Context 增量投影与缓存

将当前一次性历史投影重构为同一 reducer 驱动的冷/增量接口；原 `projectContextHistory()` 调用该 reducer，确保只有一个语义实现：

```ts
export interface ContextHistoryProjection;

export function createContextHistoryProjection(
  expectedSessionId?: SessionId,
): ContextHistoryProjection;

export function appendContextHistoryEvents(
  projection: ContextHistoryProjection,
  events: readonly DurableAgentEvent[],
): void;

export function snapshotContextHistory(
  projection: ContextHistoryProjection,
): ContextHistory;
```

Context cache 固定为 Context Provider 内部实现：

- `CONTEXT_CACHE_PROTOCOL_VERSION = 1`。
- 最多 16 个 Session、总估算 64 MiB、单 Session 最多 16 MiB；超过单项上限的构建正常返回但不入缓存。
- LRU 以成功 build 完成时间更新；相同时间以 Session ID 排序，测试中可确定重现。
- key/version fingerprint 包含 Session ID、model profile ID、context window、Context/System Prompt/工具定义/投影算法版本。
- cache entry 包含最后验证 seq、增量投影快照及安全派生信息；不包含 API Key、provider continuation、approval capability、prepared invocation、AbortSignal 或私有 reasoning。
- warm build 从 cached `lastSeq` 后调用 `readEvents`；空尾部也必须通过 `page.lastSeq` 和 recovery 状态验证。
- 任一页 `lastSeq` 改变、seq 不连续、尾序号回退、recovery 非空、metadata/fingerprint 改变即丢弃 entry 并在同一次 build 执行 cold scan。
- 同一 Session 使用 single-flight 串行 build；不同 Session 不共享锁。等待者各自检查 `AbortSignal`，一个调用取消不取消其他调用。
- 取消、投影失败、摘要失败导致整个 build 失败或存储 commit uncertain 时不发布新 cache entry。
- Context Provider 增加 `invalidateSession(sessionId)`；Server 删除 Session 的成功、失败或不确定分支均在 `finally` 调用失效。Terminal 没有删除入口。

### 3.3 稳定 Prompt 前缀

System Prompt 升级为 V8，只增加公开说明和完成证据规则，不删除 V7 安全/语言/端口/无 Shell 契约。消息布局冻结为：

1. 固定 System Prompt V8；
2. 稳定 Session memory：工作区绑定和初始目标；
3. 已投影的完整历史回合；
4. 易变 Context memory：当前目标、最新 durable 摘要、未解决诊断、当前计划与 phase；
5. 固定输出语言政策。

稳定与易变 memory 使用独立 renderer，字段不重复、不丢失。请求快照测试必须证明：连续轮次至少复用固定政策、稳定 Session memory 和此前完整历史；不得根据快照预测 provider 命中率。

### 3.4 安全可见 delta

新增 Agent 内部 `StreamingVisibleTextGate`，冻结以下行为：

- 每个 model attempt 独立创建 `StreamingSecretRedactor` 和语言分段 gate；retry 不复用缓冲或 `streamSeq`。
- 原始 `delta.content` 先经过跨 chunk secret redactor，再进入语言 gate；`reasoning_content` 不调用该链路。
- gate 以 `。！？；\n` 为安全候选边界，单个待判片段最多 2,048 字符，总缓冲最多 65,536 字符；达到上限仍无可判边界时抑制该片段并标记最终一致性失败，不能先显示。
- 每个候选片段复用现有简体中文合规判定；代码围栏、命令、路径、URL、JSON 和哈希按既有技术内容豁免保真，不翻译或改写。
- 只有判定通过的片段才能 `publishLive()`；终止时调用 redactor/gate `finish()` 处理尾部。
- sink 异常、取消、协议失败或语言失败立即关闭 gate，后续 callback 不再发布。
- 完整 completion 仍执行既有最终脱密与中文门。durable `assistant.message` 到达后客户端用 authoritative 正文替换/清除 live draft，不重复拼接。
- tool calls 且公开 content 为空时只投影系统状态 `模型返回工具调用，未提供可见说明`，不产生 assistant 正文。

### 3.5 完成证据状态机

新增 run 内内存态 `CompletionEvidenceState`，不跨 run 恢复为授权：

```ts
export type VerificationKind =
  | "lint"
  | "typecheck"
  | "test"
  | "build";

export interface CompletionEvidenceState {
  lastRelevantMutationSeq?: number;
  pendingValidation: boolean;
  verifiedAfterMutation: readonly VerificationKind[];
  correctionAttempts: number;
}
```

判定规则：

- 成功 `write_file`/`replace_in_file` 修改代码、配置、依赖清单、schema 或构建脚本后设置 pending；仅 `.md`、`.mdx`、`.txt`、`.rst` 文档写入不设置。
- 只依据成功 `run_process` 的结构化 `program`、`args`、`cwd`、lifecycle 和 exit 结果分类；不扫描 stdout 自称成功的文字。
- 识别 package manager 的 `lint`、`typecheck`/`check`、`test`、`build` scripts，以及直接 `tsc --noEmit`、`vitest`、`jest`、`playwright test`、`pytest`、`cargo test`、`go test`。shell、未知别名、后台 service readiness、`curl`/HTTP 200 不属于上述验证。
- 验证 cwd 必须覆盖相关变更路径，且发生在最后一次相关变更之后；新的相关写入重新置 pending。
- 任一成功的 lint/typecheck/test/build 可清除一般代码变更的 runtime pending，但四类证据分别保留展示；创建 Web 项目的 T20-09 人工验收仍必须具备 Spec AC20-12 的全部证据。
- 模型在 pending 时返回 `stop`，Runtime 不写 `run.completed`，而是追加 `completion.evidence.rejected`：`iteration`、`missing: ["post_change_verification"]`、`correctionAttempt`。最多纠正两次，继续占用原模型预算、总时限和 AbortSignal。
- 两次纠正后仍 pending，以不可恢复 `AGENT_COMPLETION_EVIDENCE_MISSING` 结束；用户要求跳过或外部阻塞只能在最终失败说明中如实呈现，不能降级成成功。
- rejection 不执行工具、不自动批准、不重置预算，也不重复既有工具调用。

## 4. 任务清单

### T20-00：实施前基线与 Next.js 本地文档

**输入：** 已批准 Spec、本 Task、当前长期脏工作树。

**允许文件：** 只读。

- [x] 运行 `git status --short`，记录并保留已有修改，不 reset、stash、清理或覆盖无关内容。
- [x] 阅读本地 Next.js 16.3.3 中 Server/Client Components、Route Handlers/缓存、Playwright 指南；确认 API 继续 `no-store`，详情抽屉保持 Client Component。
- [x] 运行现有专项基线：Model accumulator/mapper、Context provider/projector/token estimator、Agent runtime completion/language/cancellation、Domain event、Terminal renderer、Client projection/transcript、Server run stream 和主 Agent E2E。
- [x] 记录 RED 缺口：cache usage 字段不解析、每轮 Context 从 seq 0 重建、Runtime 未传 `onTextDelta`、HTTP 200 可先于完成证据、Session usage 只看最新 run。

实施记录：2026-08-30 运行 15 个现有 Vitest 文件，共 161 项测试全部通过；传入的 Playwright spec 不属于 Vitest include，未被误记为已执行 E2E。Next.js 本地文档确认 Route Handler 默认不缓存、`use cache` 不应用于实时状态接口、交互详情保持 Client Component、Playwright 继续使用现有 webServer。

**完成条件：** 只有只读证据；没有产品或测试文件改动。

### T20-01：Provider usage、事件协议与旧数据兼容 TDD

**覆盖：** FR-031、NFR-023、SEC-019、AC20-07、AC20-09。

**文件：**

- 修改：`lib/model/types.ts`、`lib/model/chat-accumulator.ts`
- 修改：`lib/domain/event.ts`、`lib/domain/index.ts`
- 修改：`lib/agent/types.ts`、`lib/agent/schemas.ts`、`lib/agent/runtime.ts`、`lib/agent/projection.ts`
- 修改：对应 Model、Domain、Agent 单元测试和旧 fixture

- [x] 先写 DeepSeek hit/miss、details cached、字段冲突、LongCat 缺失、reasoning 计数和安全整数 RED。
- [x] 扩展 `ModelUsage`、strict wire schema 和 durable usage，落实 3.1 映射规则。
- [x] 扩展主模型与 Context summary usage 透传；未知字段保持缺失，旧事件零迁移解析。
- [x] 为 `model.completed` 加可选 Context cache diagnostic Schema，但本任务只完成契约，不伪造数据。
- [x] 验证 provider 原始对象、reasoning 正文、价格和凭据未进入事件。

实施记录：新增断言先出现 4 项预期 RED；实现后 Model/Domain/Agent/Context 7 个文件共 108 项测试通过，`pnpm typecheck` 通过。reasoning 只持久化数量，冲突 cache 字段以 `MODEL_PROTOCOL_ERROR` 拒绝。

**最小验证：** Model accumulator/client、Domain event、Agent schemas/projection/runtime usage 专项 Vitest。

**完成条件：** usage 契约支持两类缓存字段和 reasoning 数量，旧 JSONL 兼容，未知口径不被推算。

### T20-02：增量历史投影与有界 Context cache TDD

**覆盖：** FR-032、NFR-025、SEC-020、AC20-13～AC20-15。

**文件：**

- 修改：`lib/context/history-projector.ts`、`lib/context/provider.ts`、`lib/context/types.ts`、`lib/context/index.ts`
- 修改：`lib/agent/types.ts`、`lib/agent/runtime.ts`
- 修改：`lib/server/bootstrap.ts`、`lib/server/application.ts` 及相关类型
- 修改：Context、Agent、Server 删除/恢复测试

- [x] 先写 cold 与增量 reducer 差分 RED：空尾、单事件、多页尾部、不完整工具回合、run 终态和 compaction 的 snapshot 必须与全量 projector 深度相等。
- [x] 将现有 projector 重构为 3.2 的单一 reducer，保留所有当前错误码和 seq 校验。
- [x] 写 cache RED：第二次相同 seq 为 warm；追加只读取尾部；不同 Session 可并行；同 Session single-flight；取消等待者不污染共享结果。
- [x] 实现版本 fingerprint、recovery/回退校验、cold fallback、64 MiB/16 Session/16 MiB 单项上限和确定性 LRU。
- [x] 用可控事件源验证 reused/tail/avoided bytes/build ms；指标不含正文并符合安全整数。
- [x] 接通 `invalidateSession()`，验证 Session 删除成功和失败均清除缓存；commit uncertain 走相同 `finally` 路径。
- [x] 注入投影失败、分页期间 append、尾部回退和 recovery，证明不返回陈旧 history、不发布脏 entry。

实施记录：增量 reducer、进程内有界 LRU、版本 fingerprint、repair/cold fallback、删除失效和 durable Context cache diagnostics 已实现；专项 6 个文件 61 项测试及 typecheck 通过。固定工具 Token 估算使用按定义对象的 WeakMap 派生缓存。

**最小验证：** Context projector/provider/cache、Agent runtime integration、Storage recovery/deletion、Server deletion 专项 Vitest。

**完成条件：** warm/cold 请求逐项等价，新增事件只读/投影尾部，缓存有界且所有异常安全回退。

### T20-03：System Prompt V8 与供应商稳定前缀 TDD

**覆盖：** FR-029、FR-032、AC20-03、AC20-16。

**文件：**

- 修改：`lib/context/system-prompt.ts`、`lib/context/message-renderer.ts`、`lib/context/types.ts`
- 修改：`lib/model/chat-mapper.ts`
- 修改：Context language/token/message 与 Model mapper 测试

- [x] 先将版本断言升级为 V8，并写固定/稳定/易变 memory 顺序和字段唯一性 RED。
- [x] V8 增加公开简体中文过程说明、禁止 reasoning 展示、变更后验证和 HTTP 200 不等于完成规则；完整保留 V7 契约。
- [x] 拆分稳定与易变 memory renderer，按 3.3 排列消息；所有 phase/provider 保持同一基础政策。
- [x] 捕获连续请求，证明此前完整历史位于易变 memory 之前，动态错误/计划/摘要仍为最新。
- [x] 验证仍发送完整 messages、每次都调用 provider，不新增未支持 cache 参数，不把 continuation 统计为命中。

实施记录：System Prompt V8 与稳定/易变 memory 布局完成；5 个专项文件 48 项测试通过，阶段 18 的端口、写入顺序和 warning 契约继续通过。

**最小验证：** Context model-language/message-renderer/token-estimator、Model mapper/client 快照测试。

**完成条件：** 提示语义完整且确定，稳定前缀更长，但命中事实仍只来自 provider usage。

### T20-04：真实公开 delta 的安全流式链路 TDD

**覆盖：** FR-029、NFR-024、SEC-019、AC20-01～AC20-04。

**文件：**

- 新增：`lib/agent/streaming-visible-text.ts`
- 修改：`lib/agent/redaction.ts`、`lib/agent/runtime.ts`、`lib/agent/events.ts` 及内部类型
- 修改：Agent streaming/language/cancellation/runtime 测试
- 修改：Terminal 与 Server run-stream 集成测试

- [x] 先写拆字中文、跨 chunk `sk-`/Bearer/env、中文夹代码/路径/URL/JSON、纯英文、超长无边界、finish 尾段、sink 失败、取消和 retry RED。
- [x] 实现 3.4 gate，并为业务 `complete()` 接通 awaited `onTextDelta`；Context summary 不传回调。
- [x] 保证 `assistant.delta.streamSeq` 单调递增；工具、审批、错误和终态前 flush 已通过的安全片段。
- [x] 注入唯一 reasoning 标记并扫描 live、durable、NDJSON、Terminal 输出和捕获日志，证明零泄露。
- [x] 验证最终 authoritative assistant message 清除 draft，不重复、倒退或在历史恢复时动画重播。
- [x] tool-only completion 投影中性系统状态，不产生伪造 assistant/reasoning 文本。

实施记录：新增跨 chunk 脱密与中文分段 gate，Runtime 在 `model.completed` 前发布安全公开 delta；rejection、durable assistant 和终态清理 live draft。专项 8 个文件 72 项测试、类型检查及 Server/Terminal 集成通过。

**最小验证：** Agent streaming/redaction/language/cancellation、Terminal runtime、Server run stream 专项 Vitest。

**完成条件：** completion 结束前可看到真实安全公开文本，失败路径不泄密、不残留、不重复工具。

### T20-05：完成证据门与有限纠正 TDD

**覆盖：** FR-030、NFR-018、AC20-05、AC20-06。

**文件：**

- 新增：`lib/agent/completion-evidence.ts`
- 修改：`lib/domain/event.ts`、`lib/domain/index.ts`
- 修改：`lib/agent/runtime.ts`、`lib/agent/errors.ts`、`lib/agent/schemas.ts`、`lib/agent/types.ts`、`lib/agent/projection.ts`
- 修改：对应 Domain/Agent/Terminal/Context projector 测试

- [x] 先为文档写入、代码写入、四类成功验证、失败验证、错误 cwd、readiness、HTTP 200、warning、验证后再写入和未知命令写 RED。
- [x] 实现 3.5 的纯判定模块，不读取 stdout，不扩大六工具边界。
- [x] 增加 strict durable `completion.evidence.rejected` 和错误码；Context projector 将 rejection 作为有限诊断供同 run 纠正，不当作用户授权。
- [x] Runtime 在 stop 前检查 pending；验证最多两次纠正共享原预算/时限/取消，第三次结构化失败。
- [x] 验证纠正不重复旧工具、不开新 run、不自动批准，取消和预算耗尽优先按真实因果收口。
- [x] 回归纯文档任务、只读问答、失败写入和 planning phase 不被误伤。

实施记录：纯状态机 14 项判定与 Runtime/Domain/Context/Terminal 专项共 117 项测试通过；代码或配置写入后缺少成功验证时拒绝两次完成声明，第三次以 `AGENT_COMPLETION_EVIDENCE_MISSING` 失败。

**最小验证：** completion-evidence 纯模块、Runtime completion/tools/limits/cancellation/plan、Domain event、Context history 专项 Vitest。

**完成条件：** 代码变更后没有结构化验证不能成功，启动/HTTP 200/warning 不会冒充完整证据。

### T20-06：每轮、run、Session 聚合与双缓存可观测性 TDD

**覆盖：** FR-031、FR-010、FR-019、NFR-023、NFR-025、AC20-07～AC20-10、AC20-16。

**文件：**

- 修改：`lib/client/types.ts`、`lib/client/schemas.ts`、`lib/client/event-state.ts`、`lib/client/transcript.ts`、`lib/client/view-model.ts`、`lib/client/index.ts`
- 修改：`lib/terminal/event-renderer.ts` 及类型
- 修改：对应 Client/Terminal 单元测试

- [x] 先写跨三个 run（完成、失败、取消）和 Context summary 的聚合 RED，证明切换最新 run 不清空 Session 总量。
- [x] 冻结 `business`、`contextSummary`、`combined` 三个 usage bucket；字段分别累计，记录每个字段未知请求数，显示“至少 N”。
- [x] 实现命中率：hit+miss 为分母；仅 cached 且 provider 契约确认 prompt 包含 cached 时以 prompt 为分母；其他不计算。
- [x] 每轮 transcript 显示 provider usage；工具卡不分摊 Token。
- [x] Context compaction 投影次数、strategy/fallback、范围、usage 完整性；与 provider cache、本地 Context cache 分为三个区块。
- [x] 本地 cache 聚合 cold/warm/invalidated、reused/tail/avoided bytes/build time，不能进入 Token 或 provider hit rate。
- [x] 旧事件和未知 status 显示“未上报/不支持/至少”，不显示伪造的 0。

实施记录：Client/Terminal 专项 6 个文件 35 项测试通过；run 与 Session 都保留业务、摘要、合计 bucket，provider 与 local cache 分栏并覆盖 0%/partial/100% 口径。

**最小验证：** Client schema/event-state/transcript/view-model/security、Terminal renderer 专项 Vitest。

**完成条件：** 每轮、当前 run、全 Session 和两种 cache 均有独立、可恢复、诚实的统计口径。

### T20-07：HTTP、Web 详情与端到端交互 TDD

**覆盖：** FR-029～FR-032、NFR-024、SEC-019、AC20-01～AC20-10、AC20-16。

**文件：**

- 修改：`lib/server/*` 与现有 Session/run Route Handlers（只做字段透传，不开启缓存）
- 修改：`app/ui/workbench/details-drawer.tsx`、`transcript.tsx`、`typing-text.tsx`、`session-workbench.tsx`
- 修改：`app/globals.css`
- 修改：fake model server、Server integration 和 Playwright E2E

- [x] 在改 UI 前完成 T20-00 指定的 Next.js 本地文档阅读记录。
- [x] Server RED/GREEN：NDJSON 保持顺序、`no-store, no-transform`、新字段 strict 解析、断线取消、旧事件恢复。
- [x] 详情抽屉增加“本轮/当前 run/整个 Session”“业务模型/Context 摘要/合计”“供应商缓存/本地 Context 缓存/上下文压缩”层级；未知和至少状态可读。
- [x] transcript 测试真实 delta 在 completion 前出现，tool-only 中性状态、工具/错误前 flush、durable 后不重复。
- [x] E2E 覆盖刷新、断线、retry、取消、旧 Session、跨 run 累计、移动端抽屉、键盘、`aria-live` 和 `prefers-reduced-motion`。
- [x] 注入 reasoning/secret 唯一标记，扫描页面正文、DOM 属性和接口响应均不存在。
- [x] 保持 Session/event/run/approval API `no-store`，不得引入 `use cache`、ISR 或客户端第二事实状态机。

实施记录：隔离 `.next-e2e` 避免干扰现有 dev server；目标 Agent 场景与全量 40 项 Playwright 均通过，详情恢复出 390 总 Token、57.4% provider 命中率及 local cold/warm 1/3。

**最小验证：** Server integration、Client/UI 单元测试、目标 Playwright 用例。

**完成条件：** 用户运行时能看到真实公开说明、完整 usage、双 cache 与压缩状态，刷新和异常路径保持一致。

### T20-08：自动门禁、差分回归与人工验收停止点

**覆盖：** AC20-01～AC20-16。

**允许文件：** 只允许修复本阶段实现引入的缺陷、测试和阶段验收记录；超出 Spec 的接口或安全变化必须退回 Spec。

- [x] 运行专项差分：强制 cold 与 warm Context 对相同事件历史产生完全相同 messages、tool definitions、compaction selection 和预算结果。
- [x] 运行重复模型输入测试，证明 provider 调用次数递增、completion/tool calls 不回放。
- [x] 运行完整自动门禁：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:coverage`、`pnpm test:e2e`、webpack build、Turbopack build、`git diff --check`。
- [x] 使用系统临时目录的 Terminal、Server 和浏览器假模型轨迹组合验证：公开 delta、代码变更、验证纠正、usage、Context 压缩、provider cache 字段和 local cache cold/warm/invalidated 全部出现。
- [x] 记录所有失败的症状、根因、最小修正和重跑结果；不得降低断言、跳过或删除测试制造通过。
- [x] 展示自动结果后立即停止，更新 Task 状态为“等待 T20-09 独立授权”；不得由 Agent 读取 `.env.local` 或自动开始真实 LongCat。

门禁记录：初次 lint 因 `.next-e2e` 生成物未忽略而失败，已增加 ESLint ignore；初次完整 Vitest 在沙箱内因 loopback/Unix socket 权限产生 26 项环境失败，另有 3 项 Stage 18 写入轨迹因新完成证据门缺少验证而超时，补入真实 `npm test` 后在沙箱外 115 文件 947 项全通过。覆盖率为 statements 88.37%、branches 82.42%、functions 90.87%、lines 90.10%。Playwright 40/40 通过。Webpack 首次因沙箱 DNS 无法获取 Geist 字体失败，授权网络后成功；Turbopack 成功并保留一条既有动态文件追踪 warning。最终 lint、typecheck、`git diff --check` 均通过。T20-09 未执行。

**完成条件：** 自动门禁和临时工作区轨迹结果已展示，且仍未启动真实模型验收。

### T20-09：独立授权后的真实 LongCat 回归与阶段收口

**前置门禁：** 用户在看到 T20-08 全部实际结果后，另行明确批准“执行 T20-09 真实 LongCat 回归”。Spec 或 Task 的批准不能复用。

**范围：** 全新系统临时 marker 工作区；不得复用阶段 19 fixture 或 `/Users/starkirby/Codes/test/web`。

- [x] 从本地环境选择 LongCat profile，但不打印、复制或持久化 API Key。
- [x] 要求 Agent 创建带后端、前端和关键流程测试的小型项目；端口使用一致的非 3000 值。
- [x] 实时确认工具前后存在真实公开中文说明；tool-only 轮诚实显示无说明状态，reasoning 不可见。
- [ ] 事件级验证首次写入依赖顺序、无重复工具副作用、Context cache cold/warm、压缩与 provider cache “实际值或未上报”。
- [x] 项目必须实际通过依赖安装、后端 build/typecheck、前端 build/typecheck、关键测试、双 service readiness、代表性 API 断言和浏览器页面关键流程；HTTP 200 不能替代其余证据。
- [x] 核对每轮、run、Session Token 与 Context 摘要分账；任何未知 usage 显示至少/未上报，不伪造精确总量。
- [ ] 结束全部测试服务，记录终端、事件、HTTP/UI 和最终完成声明的一致证据。
- [ ] 只在以上结果真实完成后编写 `20-agent-visibility-usage-completion-summary.md`，然后停止等待 Summary 审批。

#### T20-09 真实 LongCat 回归记录（2026-08-30，未通过）

- 独立授权：用户在 T20-08 结果之后再次明确回复“批准”，本次只解锁 T20-09。
- 隔离范围：新建系统临时 marker 工作区 `secode-stage20.2KjCru/workspace` 与独立事件目录；未复用阶段 19 fixture、真实用户项目或 3000 端口。SEcode 验收服务使用 3300，目标项目后端/前端固定使用 4317/4318。未读取或输出 `.env.local` 与 API Key，只通过应用既有本地 LongCat profile 启动。
- 可见性：首轮 tool-only 如实只显示工具状态；后续请求在工具前后实时出现公开简体中文正文，真实 `assistant.delta` 在请求完成前可见；页面和事件中未出现私有 reasoning 正文。
- 项目证据：后端/前端依赖均真实安装；后端 typecheck、build、7 项测试，前端 typecheck、build，双 service readiness，创建/列表/切换/400 校验/CORS 断言均通过。另使用真实浏览器在 4318 页面创建“浏览器验收任务”并切换为已完成。运行终止后再次访问 4317/4318 均连接失败，确认监督服务已清理。
- 缓存与压缩：详情面板最终显示 local Context Cache `cold / warm / invalidated = 1 / 62 / 0`、本地命中率 `98.4%`、复用/尾部事件 `16173 / 496`、避免读取 `9464877 B`、构建耗时 `290 ms`。供应商缓存状态为 `partial`，命中 `898560 Token`、miss 未上报、命中率诚实显示“不可计算”。事件流出现 3 次压缩：2 次模型摘要、1 次因 `model_timeout` 使用确定性本地降级；最新压缩至 seq 151，摘要 usage 有 1 次不完整。
- Token 账本：每个模型请求行均显示输入/输出/总计/推理/缓存命中。最终 run 与 Session 合计均为“至少 输入 1474328、输出 23568、总计 1497896、推理 7276（1 次请求用量未知）”；业务模型为输入 1463002、输出 19230、总计 1482232、推理 6313；Context 摘要为至少输入 11326、输出 4338、总计 15664、推理 963（1 次未知）。没有把未知值伪造成精确总量。
- **阻塞 1——首次写入依赖顺序失败：** event seq 18 首次写 `server/package.json` 时父目录不存在，返回 `WORKSPACE_PARENT_NOT_FOUND`；同批另外两次写入被抑制。Agent 随后才执行 `mkdir -p` 并重试。因而“首次写入前先满足目录依赖”的验收项不通过，即使后续没有观察到重复的成功副作用，也不能勾选整项。
- **阻塞 2——完成证据门与运行终态不一致：** Agent 已在后续真实重跑 typecheck/build/test/readiness/API 后两次输出完成声明，但 `completion.evidence.rejected` 仍连续两次判定“缺少变更后验证”。运行继续重复验证和服务启停，最终 event seq 516 以 `AGENT_RUN_TIMEOUT`、`iterations: 65` 失败，未产生 `run.completed`。因此终端、事件、HTTP/UI 与最终完成声明无法形成成功一致证据。
- 附带观察：第三次压缩的模型摘要请求超时后，本地降级摘要继续工作，但其保留的“未解决错误”包含后来已经纠正的早期失败事实；这证明降级路径可用，也提示后续修复应核对摘要中的错误消解语义。
- 过程故障：fixture 脚本首次在沙箱内因 `tsx` IPC `listen EPERM` 失败，改在已批准的受控环境运行后成功；Next dev 自动改写的根 `tsconfig.json` 已按原内容恢复，未保留该验收副作用。

结论：T20-09 真实回归未通过，阶段 20 保持未完成；按完成条件不生成 Summary，也不进入阶段 21。下一步需要先对“首次写入目录依赖”与“完成证据门误拒绝/超时循环”重新进入 Spec 修订或新阶段观察并等待用户决定。

**完成条件：** 真实运行同时证明可见输出、完成质量、用量、压缩和缓存系统；失败则如实记录阻塞，不生成虚假成功 Summary。

## 5. 需求与验收追踪

| Task | 主要需求 | 主要验收 |
| --- | --- | --- |
| T20-00 | 全部基线 | 实施前事实与本地 Next.js 约束 |
| T20-01 | FR-031、NFR-023、SEC-019 | AC20-07、AC20-09 |
| T20-02 | FR-032、NFR-025、SEC-020 | AC20-13～AC20-15 |
| T20-03 | FR-029、FR-032 | AC20-03、AC20-16 |
| T20-04 | FR-029、NFR-024、SEC-019 | AC20-01～AC20-04 |
| T20-05 | FR-030、NFR-018 | AC20-05、AC20-06 |
| T20-06 | FR-031、FR-010、FR-019、NFR-023、NFR-025 | AC20-07～AC20-10、AC20-16 |
| T20-07 | FR-029～FR-032、SEC-019 | AC20-01～AC20-10、AC20-16 |
| T20-08 | 全部 | AC20-01～AC20-16 自动门禁 |
| T20-09 | 全部 | AC20-12 真实模型验收 |

## 6. Task 审批门禁

**当前状态：T20-00～T20-08 已完成；T20-09 已获独立授权并执行，但真实 LongCat 回归未通过。阶段 20 阻塞，未生成 Summary。**

审批记录：用户于 2026-08-30 回复“批准”，语义等价于“阶段 20 Task 通过”。

Task 获批只解锁 T20-00～T20-08 的开发与自动验证；T20-09 已在后续独立授权下执行。由于首次写入顺序和完成证据终态未通过，当前必须停在失败记录，不得生成 Summary。
