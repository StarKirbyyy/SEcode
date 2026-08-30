# 阶段 22 Task：LongCat 无效工具调用与流协议恢复

## 1. 文档状态与审批门禁

- 当前状态：`T22-00～T22-08 已完成并通过自动门禁；T22-09 已执行一次并因 AGENT_RUN_TIMEOUT 失败，已停止且未生成 Summary`。
- 批准的 Spec：[22-longcat-invalid-tool-protocol-recovery-spec.md](./22-longcat-invalid-tool-protocol-recovery-spec.md)。
- Spec 审批：用户于 2026-08-30 在收到 Spec、阶段范围和停止点后回复“批准”；该批准只解锁本 Task 的编写。
- 当前允许：只记录和复核本次 T22-09 失败事实；再次运行、修复产品代码或生成成功 Summary 均未获授权。
- 当前禁止：不得修改产品代码或自动测试来现场追赶真实失败，不得重复运行挑选成功样本；不得修改真实用户项目、执行 Git 写操作、发布或部署。
- Task 获批后只解锁 T22-00～T22-08。T22-08 展示完整自动结果后必须停止；T22-09 真实 LongCat 回归仍需一次独立用户授权，Spec/Task 批准、历史 T21-09 授权和单个工具审批均不能复用。
- 本阶段不授权 Git commit、push、发布、部署、依赖安装或升级、读取/输出 `.env.local`、保存真实 provider error body，或修改真实用户生成项目。

## 2. 实施原则与冻结边界

1. 严格使用 TDD：先把两条确定性重放转成正式 RED，再做最小实现；不得先改实现后补覆盖。
2. invalid call 继续产生公开 `invalid_tool_call` 与直接失败结果且零执行；只从 provider continuation 和 assistant/tool 协议历史中排除不合法调用，不能删除其 durable 审计事实。
3. 同一 completion 的合法 sibling 必须保留 provider call ID、合法 arguments 形态与一次串行执行；invalid sibling 聚合为最多一条固定中文 correction。
4. provider error envelope 只接受严格有限结构和白名单分类。未知 code、未知无 `choices` chunk 与确定性请求错误均不盲目重试。
5. retry 副作用边界是“已接受语义输出”：content、reasoning、tool fragment、usage 或 finish 任一通过校验即关闭安全 retry 窗口；仅收到尚未形成语义的 error envelope 不等于语义已开始。
6. retry 复用同一 `ModelClient.complete` 请求快照、既有最多 3 attempts、退避、attempt timeout 和父 `AbortSignal`；不得创建第二个 Agent 模型请求、重建 Context、再次执行工具或重置总预算。
7. retry 后成功固定 `usageComplete=false`，沿用阶段 20 的“至少/请求用量未知”投影。现有观察已证明该字段能被 Terminal/Web 消费，因此本 Task 冻结为不新增 attempt 字段、事件类型、API 字段、UI 状态机或第二账本；若实现期出现反证，必须停止并修订 Task。
8. 不修改 Next.js/React 产品代码。若后续证据表明确需触碰 Route Handler、Client Component 或 UI，先阅读对应 Next.js 16.3.3 本地文档并回退 Task 审批，不能在实施中扩大范围。
9. 不新增错误码、依赖、Agent 框架、模型 SDK、第七个工具、数据库或迁移；不放宽阶段 21 的目录恢复、完成证据、审批和语言安全边界。

## 3. 固定实施顺序

```text
T22-00 基线、重放事实与范围冻结
  → T22-01 RED：provider wire、error envelope 与安全边界
  → T22-02 invalid continuation 与 Context correction
  → T22-03 provider error 分类与零语义 retry
  → T22-04 Agent / usage / 旧事件跨层一致性
  → T22-05 Terminal / Server 捕获式集成轨迹
  → T22-06 三 provider 差分、安全与回归
  → T22-07 完整自动门禁
  → T22-08 自动结果停止点
  → 用户独立授权
  → T22-09 真实 LongCat 回归与阶段收口
```

任一任务发现需要忽略未知 SSE、重试已开始语义的 response、记录 raw provider body、执行 malformed call、新增工具/事件/UI 状态、改变风险审批或放宽验收含义，立即停止并回退 Spec 或 Task 修订。

## 4. 任务清单

### T22-00：基线、重放事实与范围冻结

**覆盖：** 全部需求与 AC22-08。

**允许文件：** 只读；完成事实记录时仅允许修改本 Task。

- [x] 运行 `git status --short`，记录并保留阶段 13～22 与用户已有未提交修改；不得 reset、stash、覆盖或清理。
- [x] 核对阶段 21 T21-09 durable seq 112～115：第 18 次 malformed `run_process` 零执行、第 19 次无 `choices` data、最终 `MODEL_PROTOCOL_ERROR`、无 `run.completed` 且服务已释放。
- [x] 重放 Spec 3.2：确认当前下一次 LongCat request 同时含 malformed assistant arguments 与 `tool.name=invalid_tool_call` 名称错配。
- [x] 重放 Spec 3.3：确认 transient-like 首帧 error envelope 后第二个合法 response 当前不可达且 fetch attempt 为 1。
- [x] 确认本阶段不修改 Next.js/React、事件/API/UI，并检查自动测试使用的 3300、4327、4328 端口无遗留服务；不得终止用户已有 3000 服务。

**最小验证：** 只读 Git、事件、端口与确定性重放；不得修改代码或测试。

**完成条件：** 两个根因均由当前代码稳定复现，脏树归属和不修改范围明确。

### T22-01：RED——provider wire、error envelope 与安全边界

**覆盖：** FR-036～FR-037、NFR-028～NFR-029、SEC-022、AC22-01～AC22-07。

**允许文件：**

- `tests/unit/model/chat-accumulator.test.ts`
- `tests/unit/model/chat-mapper.test.ts`
- `tests/unit/model/client.test.ts`
- `tests/unit/context/history-projector.test.ts`
- `tests/unit/context/model-language.test.ts`
- `tests/unit/context/provider.test.ts`
- `tests/unit/context/security.test.ts`
- `tests/unit/agent/runtime-tools.test.ts`
- 必要的既有 test helper；不得先修改实现。

- [x] 加入 all-invalid completion 的跨 accumulator/continuation/Context/LongCat wire RED：公开 direct result 保留、零 `tool.started`，下一 request 无 malformed arguments、无 `invalid_tool_call` assistant/tool 帧且只有一条有限 correction。
- [x] 加入 valid + invalid sibling RED：合法 call ID、LongCat object arguments 或其他 provider string arguments精确保留并只执行一次；invalid sibling 零执行且只贡献一条 correction。
- [x] 加入缺失 continuation 的旧 JSONL/history RED，证明公开 invalid exchange 不会被重新渲染为可执行 assistant/tool 协议。
- [x] 加入 HTTP 200 SSE transient error envelope → 第二个合法 response 的 RED：一个 Agent 模型请求、两个 provider attempts、成功 completion、`usageComplete=false`。
- [x] 加入 auth/payment/request-invalid、unknown code 和任意未知无 `choices` chunk不重试的 RED。
- [x] 分别加入 content、reasoning、tool fragment、usage、finish 已接受后出现错误不重试的 RED，并断言 partial discard、response body 取消和无重复公开输出。
- [x] 加入 raw arguments、provider message、private reasoning、Authorization、endpoint query 与绝对路径哨兵不可见的 RED。

**最小验证：** 只运行新增纯单元测试，确认它们因缺少批准实现而按预期失败；记录真实失败，不降低断言。

**完成条件：** 每个 RED 直接对应一个已观察缺口、retry 副作用边界或安全条件。

### T22-02：invalid continuation 与 Context correction

**覆盖：** FR-036、NFR-029、SEC-022、AC22-01～AC22-03、AC22-07。

**允许文件：**

- `lib/model/chat-accumulator.ts`
- `lib/model/chat-mapper.ts`（仅当保持合法 provider continuation 形态确有需要）
- `lib/model/types.ts`（仅限内部 continuation/accumulator 类型）
- `lib/context/message-renderer.ts`
- `lib/context/types.ts`（仅限内部渲染类型确有需要）
- T22-01 对应 model/context/agent 单元测试与 helper。

- [x] accumulator 只将 `ok=true` 的 provider calls 写入 continuation；invalid 原始 ID、name、arguments 和 reasoning 不进入下一 provider history。
- [x] 保留公开 normalized invalid call、`MODEL_INVALID_TOOL_CALL` reason 与 Runtime direct result；不得改变零执行、无审批、无 `tool.started` 契约。
- [x] Context renderer 将 `toolName=invalid_tool_call` exchange 从 assistant `tool_calls` 和 `role=tool` 中排除，改为固定简体中文 system correction。
- [x] correction 只包含白名单 reason code、稳定排序的安全索引和 invalid 数量；设置明确数量/字符上限，不包含 preview、raw arguments、provider message、路径、secret 或 reasoning。
- [x] mixed sibling 保留全部合法 calls 的 provider ID、原始合法 arguments 形态和结果顺序；多个 invalid sibling 聚合为最多一条 correction。
- [x] 无 continuation 的旧 history 走同一过滤规则，零事件迁移；DeepSeek/LongCat/Generic 合法 continuation 与 reasoning continuation 不变。

**最小验证：** chat accumulator/mapper、history projector、model language、context provider/security 与 runtime tools 专项单元测试。

**完成条件：** invalid durable 事实可审计但 provider wire 永远合法，合法 sibling 不丢失、不改写、不重复。

### T22-03：provider error 分类与零语义 retry

**覆盖：** FR-037、NFR-028～NFR-029、SEC-022、AC22-04～AC22-07。

**允许文件：**

- `lib/model/chat-accumulator.ts`
- `lib/model/client.ts`
- `lib/model/types.ts`
- `tests/unit/model/chat-accumulator.test.ts`
- `tests/unit/model/client.test.ts`
- 必要的 model test helper。

- [x] 在现有合法 completion/usage 校验失败且缺少 `choices` 时，才尝试严格 error envelope；只读取有限 `code/type/status`，忽略并不持久化 message/raw body/headers/未知字段。
- [x] 冻结非重试映射：authentication/auth/invalid-api-key → `MODEL_AUTH_ERROR`；payment/insufficient-quota → `MODEL_PAYMENT_REQUIRED`；invalid-request/bad-request → `MODEL_REQUEST_INVALID`。
- [x] 冻结可恢复映射：rate-limit → `MODEL_RATE_LIMITED`；timeout/request-timeout → `MODEL_TIMEOUT`；overloaded/unavailable/internal/server/upstream → `MODEL_PROVIDER_UNAVAILABLE`。匹配使用有限规范化枚举，不做 message 子串猜测；unknown 继续 `MODEL_PROTOCOL_ERROR`。
- [x] accumulator 在 content、reasoning、tool fragment、usage 或 finish 任一通过校验时向 client 标记 `semanticAccepted=true`；单纯解析到 error envelope 不设置该标记。
- [x] client 仅在上述可恢复错误且 `semanticAccepted=false` 时使用既有最多 3 attempts、退避、attempt timeout 与父取消信号；请求 body、Context 和 Agent `model.requested` 不重建。
- [x] `semanticAccepted=true` 后所有错误不重试，设置 `partialOutputDiscarded` 并取消 body；不得重放 delta、tool fragment 或 safe visible text gate 积压。
- [x] provider retry 成功固定 `usageComplete=false`；最后一次 usage 保留为已知下界，不合成为虚假的精确总量。
- [x] 取消、timeout、retry sleep 和第三次失败保持既有预算与终态；不得因 error envelope 延长总墙钟或创建第四次 attempt。

**最小验证：** model accumulator/client 专项单元测试与假时钟、AbortSignal 测试。

**完成条件：** 只有明确瞬时且零语义的 error envelope 可恢复，所有有副作用或未知情形保持严格失败。

### T22-04：Agent、usage 与旧事件跨层一致性

**覆盖：** NFR-028～NFR-029、SEC-022、AC22-01～AC22-07、AC22-10 自动部分。

**允许文件：**

- `tests/unit/agent/runtime-tools.test.ts`
- `tests/unit/context/history-projector.test.ts`
- `tests/unit/context/provider.test.ts`
- `tests/unit/context/security.test.ts`
- `tests/unit/context/runtime-integration.test.ts`
- 既有 model 测试与 helper。
- 产品实现仍限于 T22-02～T22-03 已列文件；不得修改 Agent 事件、Storage、Terminal、Client/Web 或 Route Handler 产品代码。

- [x] 证明一个 `ModelClient.complete` 内多个 provider attempts 仍只有一个 durable `model.requested`，不重复模型请求预算或 Context 压缩。
- [x] 证明 invalid direct result 只有一组 `tool.requested/tool.result` 且零 `tool.started`，合法 sibling 只执行一次。
- [x] 证明 retry 成功沿用现有 `usageComplete=false`，run/Session ledger 保持“至少/请求用量未知”，provider/local cache 只展示真实返回字段与本地事实。
- [x] 证明旧 JSONL 缺失 continuation 或新增内部状态时仍无需迁移，事件 Schema 和所有已有投影不变。
- [x] 证明 cancellation、语言门、计划只读、危险工具审批、目录恢复、完成证据和总预算不因 correction/retry 改变。
- [x] 若任何断言证明现有事件或 UI 无法诚实表达 usage，立即停止并修订本 Task；不得直接新增字段。

**最小验证：** 目标 Agent/Context/Model 单元与 runtime integration 测试。

**完成条件：** 修复停留在 Model/Context 边界，现有 Agent 与 usage/cache/compaction 账本无需新协议即可诚实工作。

### T22-05：Terminal 与 Server 捕获式集成轨迹

**覆盖：** AC22-01～AC22-07、AC22-10 自动部分。

**允许文件：**

- `tests/manual/openai-compatible-server.ts`
- `tests/integration/terminal/runtime.test.ts`
- `tests/integration/terminal/manual-server.test.ts`
- `tests/integration/terminal/helpers.ts`
- `tests/integration/server/run-stream.test.ts`
- `tests/integration/server/helpers.ts`
- 必要的既有 integration fixture；不得修改 Terminal、Server、API 或 UI 产品代码。

- [x] 扩展假 provider 捕获连续 request body：先返回 malformed tool call，再核对下一 request 已过滤 invalid 帧、含一条 correction，随后合法调用只执行一次并正常完成。
- [x] 增加 mixed sibling 轨迹，逐项核对合法 provider ID/arguments、公开 invalid direct result、零 invalid side effect 和无重复合法工具。
- [x] 增加 transient error envelope → 同一模型请求内 retry → 成功轨迹，断言 NDJSON 只有一个 `model.requested`、最终 usage unknown 且终态唯一。
- [x] 增加 auth/unknown envelope 与 semantic-start 后错误的负轨迹，断言不 retry、partial discard、终态错误有限且不含 raw provider message。
- [x] 核对断线取消、attempt timeout、旧 Session 恢复、`no-store, no-transform`、Token/cache/compaction 投影均保持既有行为。
- [x] 所有自动轨迹使用临时工作区、假 endpoint 与哨兵秘密，不读取 `.env.local`，不接触真实 Session 数据。

**最小验证：** 目标 Terminal 与 Server integration 文件。

**完成条件：** 无浏览器环境已证明连续 provider wire、durable 事件、usage 和终态完全一致且无副作用重复。

### T22-06：三 provider 差分、安全与回归

**覆盖：** NFR-029、SEC-022、AC22-02～AC22-08、AC22-10 自动部分。

**允许文件：** 仅 T22-01～T22-05 已列测试、fixture 与实现文件。

- [x] 对 DeepSeek、LongCat、Generic 分别运行合法 text、tool、mixed call、usage-only tail、finish 与 continuation 差分；合法 wire 除预期修复外完全不变。
- [x] LongCat 合法 object arguments、DeepSeek/Generic string arguments、provider call ID 与 reasoning continuation 精确保持。
- [x] 对每一种语义开始信号运行 no-retry 差分，对每一种白名单 error code 运行 retry/non-retry 分类差分，并核对 attempts 不超过 3。
- [x] 运行无 continuation 旧 history、多个 invalid 聚合上限、超长 preview/provider message、绝对路径、endpoint query、Authorization 与 reasoning 哨兵安全测试。
- [x] 运行阶段 20 usage/cache/compaction 与阶段 21 dependency/completion 相关专项回归，确认没有重复执行、完成误判或显示回退。
- [x] 不新增 UI 专项实现或 E2E 场景；现有 Web E2E 在 T22-07 全量门禁中验证投影未回归。

**最小验证：** Model、Context、Agent、Terminal、Server 目标测试集合。

**完成条件：** 修复对三 provider 合法流透明，对 invalid/error 流严格、有限、脱敏。

### T22-07：完整自动门禁

**覆盖：** AC22-01～AC22-08、AC22-10 自动部分。

**允许文件：** 只允许修复本阶段实现或测试暴露的批准范围内缺陷，并将症状、根因、修正与重跑结果记录于本 Task；公共接口、安全边界或验收含义变化必须回退审批。

- [x] 运行全部 T22 专项单元与集成测试。
- [x] 运行 `pnpm lint`。
- [x] 运行 `pnpm typecheck`。
- [x] 运行 `pnpm test`。
- [x] 运行 `pnpm test:coverage`，不得降低既有全局阈值。
- [x] 运行 `pnpm test:e2e`，不得占用或终止用户 3000 服务。
- [x] 使用隔离 dist 目录分别运行 webpack build 与 Turbopack build，避免干扰用户已有 dev server。
- [x] 运行 `git diff --check`，检查无凭据、raw provider body、绝对路径泄露、意外生成物和 `tsconfig.json` 自动改写残留。
- [x] 所有失败记录真实症状、根因、最小修正与重跑结果；不得跳过、删除、快照覆盖或放宽断言制造通过。

**最小验证：** 完整自动门禁。

**完成条件：** AC22-01～AC22-08 与 AC22-10 的自动部分都有直接证据，既有全仓能力无回归。

### T22-08：自动结果展示与真实模型停止点

**覆盖：** AC22-08。

**允许文件：**

- 本 Task
- `docs/development/README.md`

- [x] 汇总 T22-00～T22-07 的 RED、实现、专项、全量、coverage、E2E、双 build、diff 与失败修正记录。
- [x] 将每条 AC 映射到具体测试/命令证据，并明确 AC22-09 与 AC22-10 的真实模型部分仍未执行。
- [x] 检查临时服务和端口全部释放，不保留真实 provider 响应、凭据或用户工作区副本。
- [x] 更新状态为“自动门禁已完成，等待 T22-09 独立授权”，立即停止并向用户请求明确批准。

**最小验证：** 文档、Git 状态、端口和证据一致性检查。

**完成条件：** 用户可在不依赖聊天记忆的情况下审阅全部自动证据；尚未取得独立授权时零真实 LongCat 调用。

#### T22-00～T22-08 实施与自动门禁记录

- 基线：原有 Model 三文件为 3 files / 37 tests 通过；3300、4327、4328 均无监听。确定性 wire 与首帧 error envelope 事实和 Spec 记录一致。
- RED：新增 continuation、Context correction 与 SSE envelope 断言后，3 files 中 5 tests 按预期失败、46 tests 继续通过。失败分别为 invalid provider call 仍进入下一 LongCat request、首帧 transient envelope 不重试、auth/request-invalid 未分类、旧 history 仍渲染公开哨兵工具帧。
- 根因与修复：`chat-accumulator.ts` 在校验前写 continuation；`message-renderer.ts` 无条件渲染 invalid exchange；`client.ts` 把任意 data 当作 payload 已开始且所有 `ModelLayerError` 禁止 retry。现已仅持久化合法 provider sibling、用固定有限中文 correction 替代 invalid assistant/tool 帧，并以五类语义接受信号控制严格 error envelope retry。
- 范围：产品实现只修改 `lib/model/chat-accumulator.ts`、`lib/model/client.ts` 和 `lib/context/message-renderer.ts`；没有新增事件、API、UI、错误码、依赖、工具或数据库迁移。
- 专项单元：9 files / 98 tests 通过，覆盖 malformed/valid sibling、旧 history、auth/request-invalid/unknown、零语义 transient retry，以及 content/reasoning/tool fragment/usage/finish 后禁止 retry。
- loopback 集成：`tests/integration/terminal/manual-server.test.ts` 11/11 通过；临时假 provider 首次返回 `service_unavailable` envelope，第二次合法 completion 可达，request count 为 2 且 `usageComplete=false`。沙箱内首次因 `listen EPERM` 失败，使用获批的本机回环测试权限原样重跑后通过，未修改断言。
- lint：`pnpm lint` 通过。
- typecheck：`pnpm typecheck` 通过。
- 全量测试：首次同时并行运行 test 与 coverage 时，同一个既有 5 秒长迭代用例在约 5.04 秒资源竞争超时，其余 973 tests 通过；该文件单独 7/7 通过。随后串行 `pnpm test` 为 116 files / 974 tests 全部通过，未放宽 timeout。
- coverage：串行 `pnpm test:coverage` 为 116 files / 974 tests 通过；Statements 88.44%、Branches 82.62%、Functions 90.93%、Lines 90.20%。
- E2E：`pnpm test:e2e` 为 Chromium 41/41 通过，既有 Token、cache、compaction、语言、计划、审批、恢复与 UI 流程未回归。
- 构建：隔离目录 webpack 与 Turbopack 均成功；Turbopack 仅报告既有动态文件系统追踪警告。构建自动改写的 `tsconfig.json` 已精确还原，两个隔离 dist 目录已删除。
- 最终检查：`git diff --check` 通过；没有 `[DEBUG-*]` 残留、构建目录、3300/4327/4328 监听或真实 provider 调用。测试中的 `PRIVATE_*` 仅为泄露哨兵且对应负断言。
- 停止点：AC22-01～AC22-08 与 AC22-10 自动部分已有证据；AC22-09 和 AC22-10 的真实 provider 部分尚未执行。必须取得新的明确批准后才能进入 T22-09。

### T22-09：真实 LongCat 完整回归与阶段收口

**前置门禁：** 仅在 T22-08 已展示全部自动结果且用户随后再次明确批准后执行。

**独立授权记录：** 用户于 2026-08-30 在收到 T22-00～T22-08 全部自动结果、覆盖率、E2E、双构建和停止点后再次回复“批准”；本次授权只允许执行一次 T22-09 真实 LongCat 回归及其验收记录，不授权产品代码修改、重复取样、Git 写操作、发布或部署。

**覆盖：** AC22-09～AC22-10 及全部需求的真实 provider 证据。

**允许文件与环境：**

- 可新增 `tests/manual/stage22-fixture.ts`，只生成系统临时目录内的 marker 项目。
- 本 Task、`docs/development/README.md`；全部验收通过后可新增 `22-longcat-invalid-tool-protocol-recovery-summary.md`。
- 使用本地 `.env.local` 中既有配置启动应用，但任何命令、日志、事件、截图和文档都不得输出 API Key；不得修改 `.env.local`。
- 使用全新系统临时 marker 根、独立数据目录、全新 Session、SEcode 端口 3300 与目标端口 4337/4338；如端口被占用先只读识别，不能终止未知用户进程，需选择新的明确非 3000 端口并记录。

- [x] 启动新的 Stage 22 fixture 与 SEcode，完成 readiness 后创建绑定全新 marker 的 Session；不复用 Stage 20/21 fixture、Session 或用户项目。
- [ ] 使用真实 LongCat 完成同时含 server/client 多 scope、目录依赖、文件写入、分别验证、双 readiness、API 和浏览器交互的完整任务。
- [ ] 核对首次合规完成声明产生 `run.completed`；不得出现 `MODEL_PROTOCOL_ERROR`、完成误拒绝、重复工具/进程副作用、无进展循环或 `AGENT_RUN_TIMEOUT`。
- [x] 若真实模型自然产生 invalid call，核对它仍为公开 direct result、零 `tool.started`，后续 provider request 恢复且不泄露 raw arguments；若未发生则如实标记“确定性自动测试覆盖，真实轨迹未触发”，不得操纵响应或伪造覆盖。
- [x] 若真实 provider 自然触发零语义 retry，核对一个 `model.requested`、attempt 有界与 usage unknown；若未发生则同样只引用确定性证据，不声称真实命中。
- [ ] 核对 assistant 中文过程说明与最终正文持续可见、tool-only 若自然发生则如实呈现、private reasoning 隐藏。
- [x] 核对每模型请求、run、Session Token，Context 原始/发送/摘要、provider cache 命中率、本地 Context cache hit/miss 与 compaction；未发生 retry、tool-only、provider cache 或 compaction 时显示真实 0/未知/未发生。
- [x] 通过 HTTP 和浏览器验证生成项目，保存有限、脱敏、可复核的事件序号与结果；不得保存 raw provider response。
- [x] 结束时释放 SEcode、fixture、子服务和端口，检查无遗留进程；失败则在本 Task 如实记录并停止，不现场改码或重复运行挑选成功样本。
- [ ] 仅当 AC22-01～AC22-10 全部通过时生成阶段 22 Summary，并停下等待 Summary 独立批准；否则不生成成功 Summary。

**最小验证：** 一次全新真实 LongCat 多 scope 完整回归，加 HTTP、浏览器、事件、usage/cache/compaction 与端口释放核对。

**完成条件：** 自动证据与真实 provider 完整闭环同时成立，或以明确失败/外部阻塞状态收口且不虚报成功。

#### T22-09 单次真实回归记录（失败收口）

- 环境：全新系统临时根 `secode-stage22.Zq1k8i`、marker 工作区、独立数据目录、Session `7c7f44dc-f0d4-480c-8250-5426c46b340a`、run `cb947b68-7998-4db2-9377-7a6cca63a4ae`；SEcode 使用 3300，生成服务使用 4337/4338，未触碰 3000 或真实用户项目。
- Agent 轨迹：durable JSONL 与 HTTP 均为 337 个事件；41 个 `model.requested` 对应 41 个 `model.completed`，70 个 `tool.requested`，不存在重复 `tool.started`。后端 typecheck/build/test 在 seq 171/173/175 通过，前端 typecheck/build/test 在 seq 300/302/320 通过；后端和前端 readiness 分别在 seq 328、336 返回 200。
- 终态失败：seq 337 为唯一终态 `run.failed`，错误 `AGENT_RUN_TIMEOUT`，迭代数 41；不存在 `run.completed`、最终 assistant 正文或完成声明。真实 Agent 因 30 分钟总时限在双 readiness 后退出，未自行完成 API 和浏览器步骤。因此 AC22-09 不通过，T22-09 不得标记成功。
- invalid 事实：模型自然产生两次 `list_directory` 参数校验失败，seq 7→10 与 13→14 均以公开 `TOOL_ARGUMENTS_INVALID` direct result 收口且没有对应 `tool.started`；随后请求继续成功。轨迹未产生 provider 归一化 `MODEL_INVALID_TOOL_CALL`，不得把这两次 schema-invalid arguments 夸大为该分支的真实命中。
- retry 事实：未自然触发零语义 provider retry；41 次请求均有一次可见 completion，`usageComplete=false` 为 0，且无 `MODEL_PROTOCOL_ERROR`。retry 仅保留 T22-01～T22-08 的确定性自动证据。
- 可见性：Web 会话时间线显示 16 条简体中文 `assistant.message` 过程正文与每次模型请求用量，未显示 private reasoning；由于 timeout，没有最终正文，故相应清单保持未完成。
- 用量与缓存：当前 run 与整个 Session 均为输入 647418、输出 10561、总计 657979、推理 1377；供应商缓存命中 461824 Token，但缺少未命中值，状态为 `partial` 且命中率显示“不可计算”。本地 Context Cache 为 cold/warm/invalidated `1/40/0`，命中率 97.6%，复用/尾部事件 `6397/328`，避免读取 3766291 B，构建 100 ms。compaction 为 `0/0/0`，显示“尚未压缩”；Context 摘要 Token 为未知。
- 审批与安全：14 次审批均有 durable required/resolved 配对；其中 seq 155 拒绝可能修改工作区外 npm 配置的命令，随后只批准临时项目内的 `npm install --include=dev`。未发现 Git、发布、全局安装或越界写入。
- 独立项目验收：原 run 失败并自动释放子服务后，只重启既有生成产物，不重复真实模型 run。HTTP 验证 `/health` 为 200，`POST /tasks` 为 201，`PATCH /tasks/1/toggle` 为 200 且 `completed=true`，列表事实一致；真实浏览器在 4338 创建“Stage 22 浏览器验收”并成功勾选完成。该补充证据只能证明生成项目可运行，不能将 Agent 的 timeout 改写为成功。
- 清理：已停止独立验收服务和 SEcode，3300/4337/4338 均无监听；隔离构建目录已删除，`tsconfig.json` 已移除隔离构建自动追加项。临时 marker 与脱敏 JSONL 仅保留为本次失败的可复核证据。
- 阶段结论：AC22-01～AC22-08 的既有自动门禁不受影响；AC22-09 失败，AC22-10 的可观测性真实部分通过但最终正文部分失败。依照失败处理规则，不修改产品代码、不重复取样、不生成阶段 22 成功 Summary，等待用户决定是否另开修复阶段。

## 5. 验收追踪矩阵

| 验收 | 主要任务 | 核心证据 |
| --- | --- | --- |
| AC22-01 | T22-01、T22-02、T22-05 | all-invalid wire、公开 direct result、零执行、单条 correction |
| AC22-02 | T22-01、T22-02、T22-05、T22-06 | mixed sibling 的 ID/arguments/执行次数差分 |
| AC22-03 | T22-02、T22-04、T22-06 | 三 provider 合法 continuation 与旧 history 恢复 |
| AC22-04 | T22-01、T22-03～T22-05 | 零语义 transient envelope 有界 retry、单 `model.requested`、usage unknown |
| AC22-05 | T22-01、T22-03、T22-05～T22-06 | 五类语义信号后的 no-retry、partial discard、零重复副作用 |
| AC22-06 | T22-01、T22-03、T22-05～T22-06 | 非重试分类、unknown 严格失败、取消/timeout/attempt 上限 |
| AC22-07 | T22-01～T22-06 | Model→Agent→Storage→Terminal/HTTP/Web 现有投影与 secret 哨兵 |
| AC22-08 | T22-07～T22-08 | 专项、全量、coverage、E2E、双 build、diff 真实结果 |
| AC22-09 | T22-09 | 全新 marker/Session 的真实 LongCat 多 scope 项目闭环 |
| AC22-10 | T22-04～T22-09 | 可见正文、reasoning 隐藏、Token/cache/compaction 的确定性与真实轨迹证据 |

## 6. 失败处理与回退规则

- RED 未按预期失败：先证明用例是否已被现有行为覆盖或 fixture 是否错误；不得为制造红灯破坏正确实现。
- 合法 provider wire 发生非必要变化：回退到最小过滤/分类实现，不能以“provider 兼容”为由重写全部 mapper。
- unknown envelope 被错误重试：视为安全回归，恢复严格 `MODEL_PROTOCOL_ERROR` 并补差分测试。
- retry 发生在语义开始后、产生重复 delta/tool/审批/副作用，或把 usage 误报为完整：立即停止实现，保留失败证据并回退到 Task/Spec 复审。
- 需要新事件/API/UI 字段：停止并修订 Task；不能使用 Spec 5.3.2 的条件许可跳过再次审批。
- 自动门禁失败：只修复批准范围内根因并重跑受影响最小集合与完整门禁；不得跳过或降低阈值。
- 真实回归失败：记录事件序号、公开错误、服务释放与可复核有限证据，停止 T22-09；不得现场改码、换 provider、放宽完成条件或反复取最好样本。

## 7. 明确不做

- 不重写阶段 20 cache/compaction/usage 系统，不新增 retry 仪表盘或缓存账本。
- 不修改阶段 21 的写入依赖恢复、完成证据算法或真实失败记录。
- 不忽略未知 SSE、不保存 raw provider response、不按 message 文本猜测错误分类。
- 不执行或伪造 malformed call，不把 `invalid_tool_call` 注册成模型工具。
- 不修改 Next.js/React/UI/Route Handler 产品代码，不新增 E2E 专用产品分支。
- 不安装依赖、不修改真实用户项目、不 commit/push、不发布部署、不制作阶段 23 材料。

## 8. Task 审批门禁

- 审批结果：`已批准`。
- 审批记录：用户于 2026-08-30 在收到本 Task、自动门禁范围和真实模型独立停止点后回复“批准”；本次批准只解锁 T22-00～T22-08，不构成 T22-09 真实 LongCat 回归授权。
- 批准本 Task 只解锁 T22-00～T22-08 的实施和自动验证。
- T22-08 完成并展示真实自动结果后必须停止；T22-09 真实 LongCat 回归需要用户再次明确批准。
- T22-09 通过后才允许生成阶段 22 Summary；Summary 仍需独立批准，之后才能进入阶段 23。
