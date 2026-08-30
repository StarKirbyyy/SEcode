# 阶段 21 Task：写入依赖恢复与完成证据收敛

## 1. 文档状态与审批门禁

- 当前状态：`T21-00～T21-08 已完成并通过自动门禁；T21-09 已独立授权并执行，但真实回归未通过，阶段 21 阻塞且未生成 Summary`。
- 批准的 Spec：[21-agent-dependency-completion-recovery-spec.md](./21-agent-dependency-completion-recovery-spec.md)。
- Spec 审批：用户于 2026-08-30 在收到 Spec 全文链接和门禁说明后回复“批准”，语义等价于“阶段 21 Spec 通过”；本次批准只解锁本 Task 的编写。
- 当前允许：审阅 T21-09 的真实失败记录，并由用户决定是否另开阶段或重新修订门禁。
- 当前禁止：不得继续重试真实 LongCat、修改产品代码来现场追赶失败或生成阶段 21 Summary；不得执行 Git commit/push、发布或部署。
- Task 获批后只解锁 T21-00～T21-08 的开发与自动验证；T21-08 展示实际结果后必须停止。T21-09 真实 LongCat 回归仍需一次独立用户授权，Spec/Task 批准和工具审批均不能复用。
- 本阶段不授权 Git commit、push、发布、部署、依赖升级、读取 `.env.local` 或修改真实用户生成项目。

## 2. 实施原则与冻结边界

1. 严格使用 TDD：每个真实缺口先加入失败断言，再做最小实现，再运行直接相关测试。
2. 不新增第七个工具，不让 `write_file` 创建父目录；目录仍由经风险审批的 `run_process` 显式创建，并经 `list_directory` 重新观察。
3. 写入依赖恢复和完成证据账本只属于当前 run；JSONL 只持久化请求、结果、拒绝和终态，不持久化可执行授权。
4. 动态工具集合必须同时用于 Context token 估算、压缩、cache fingerprint 和真实模型请求，不能让 Context 以六工具计费而请求只发送四工具。
5. 完成证据只采信成功、oneshot、可分类且晚于对应 mutation 的结构化进程结果；service/readiness/HTTP/install/stdout 自称成功不能清账。
6. 新事件字段保持可选、有限和脱敏，旧 JSONL 零迁移解析；客户端与 UI 只投影事件，不复制 Runtime 判定。
7. 局部纠正预算不重置全局模型请求、工具、取消或墙钟预算；真正新增 scope 覆盖才算进展。
8. 不新增无具体失败场景支撑的 hash、冻结 contract、baseline 或额外 gate。本阶段新增的事件兼容、工作区 hash 和真实模型门禁都分别对应 Spec 已记录的明确失败。

## 3. 固定实施顺序

```text
T21-00 基线与本地文档
  → T21-01 RED：纯状态与协议失败断言
  → T21-02 写入依赖恢复与动态工具能力
  → T21-03 分 scope 完成证据账本
  → T21-04 纠正预算、事件与跨层投影
  → T21-05 Terminal / Server 集成轨迹
  → T21-06 Web UI / E2E
  → T21-07 差分与完整自动门禁
  → T21-08 自动结果停止点
  → 用户独立授权
  → T21-09 真实 LongCat 回归与阶段收口
```

任一任务发现需要新增工具、自动创建目录、改变风险审批、放宽验证类型、修改安全边界或改变验收含义，立即停止并回退到 Spec 修订。

## 4. 任务清单

### T21-00：基线、差分归属与 Next.js 本地文档

**覆盖：** 全部需求与 AC21-08。

**允许文件：** 只读；完成事实记录时仅允许修改本 Task。

- [x] 重新运行 `git status --short`，记录并保留阶段 13～20 与用户已有未提交修改；不得 reset、stash、覆盖或清理。
- [x] 核对阶段 20 T20-09 事件事实：首次依赖预检、两次 `completion.evidence.rejected`、65 次模型请求迭代、`AGENT_RUN_TIMEOUT` 和服务释放。
- [x] 冻结根因：当前完成证据要求单一验证 cwd 覆盖全部路径；server/client 分别验证无法联合清账。
- [x] 在修改 Next.js/React/UI 前完整阅读本机 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`、`15-route-handlers.md` 与 `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`，记录与 Client Component、Route Handler 流式恢复和 Playwright 直接相关的约束。
- [x] 确认没有端口 3300、4317、4318 遗留服务；不得终止用户已有 3000 服务。

T21-00 记录：脏树包含阶段 13～21 的连续未提交工作，未做 reset/stash/清理；3300、4317、4318 均未监听。Next.js 16.3.3 本地文档确认交互状态应留在既有 Client Component，Route Handler 默认动态且运行事件接口继续保持显式 `no-store/no-transform`，Playwright 应等待实际 server readiness 并从用户可见行为验收，不在 UI 复制 Runtime 状态机。根因以 `completion-evidence.ts` 的全路径单命令覆盖条件和 `runtime.ts` 的单批父目录预检为准。

**最小验证：** 只读命令与文档记录，不修改代码。

**完成条件：** 后续每个改动都能映射到真实失败或批准 Spec，且现有脏树归属清楚。

### T21-01：RED——状态机、动态工具与事件协议失败断言

**覆盖：** FR-033～FR-035、NFR-026～NFR-027、SEC-021、AC21-01～AC21-07。

**允许文件：**

- `tests/unit/agent/workspace-observations.test.ts`
- `tests/unit/agent/completion-evidence.test.ts`
- `tests/unit/agent/runtime-tools.test.ts`
- `tests/unit/agent/runtime-completion.test.ts`
- `tests/unit/agent/runtime-limits.test.ts`
- `tests/unit/agent/runtime-cancellation.test.ts`
- `tests/unit/agent/schemas.test.ts`
- `tests/unit/domain/event.test.ts`
- `tests/unit/context/provider.test.ts`
- `tests/unit/context/runtime-integration.test.ts`
- `tests/unit/context/history-projector.test.ts`
- `tests/unit/terminal/event-renderer.test.ts`
- `tests/unit/client/event-state.test.ts`
- `tests/unit/client/transcript.test.ts`
- 必要的既有 test helper；不得先修改实现。

- [x] 加入缺失父目录触发恢复态、同批合并、零 `tool.started`、工作区 hash 不变的 RED 断言。
- [x] 加入恢复态工具集合不含 `write_file/replace_in_file`，Context 估算/压缩/cache fingerprint/模型请求使用同一集合的 RED 断言。
- [x] 加入模型伪造恢复态写工具被 Runtime 二次拒绝、目录创建后未重新 listing 仍不可写、完整 listing 后恢复的 RED 断言。
- [x] 加入 server/client 分 scope 联合覆盖、单侧未覆盖、根覆盖、验证后再写、失败/service/readiness/install 不覆盖的 RED 断言。
- [x] 加入纠正态有进展重置、4 模型请求/8 工具无进展提前失败、取消与全局预算不重置的 RED 断言。
- [x] 加入 `uncoveredScopes/acceptedKinds` 可选字段、旧事件缺失字段恢复和绝对路径/secret 哨兵的 RED 断言。

**最小验证：** 只运行新增的纯单元测试并确认因缺少批准实现而失败；记录真实失败，不降低断言。

**完成条件：** 每个 RED 都能直接证明 Spec 中一个已观察缺口或安全边界。

### T21-02：写入依赖恢复态与动态工具能力

**覆盖：** FR-033、NFR-026、SEC-021、AC21-01～AC21-03。

**允许文件：**

- `lib/agent/workspace-observations.ts`
- 可新增 `lib/agent/write-dependency-recovery.ts`
- `lib/agent/runtime.ts`
- `lib/agent/types.ts`
- `lib/tools/schemas.ts`
- `lib/tools/index.ts`
- `lib/tools/registry.ts`
- `lib/context/provider.ts`
- `lib/context/types.ts`
- `lib/context/index.ts`
- `lib/context/system-prompt.ts`
- T21-01 对应单元测试与 helper。

- [x] 建立 run-local `pendingParentDirectories` 与依赖恢复进展/预算状态；相对路径规范化、去重、数量与字符上限必须有测试。
- [x] 首次已知缺失父目录仍在执行器前拦截，同批相同父目录合并；把父目录加入恢复态，不产生写工具 `tool.started`。
- [x] 导出固定、冻结的 dependency-recovery 工具集合，仅含 `list_directory`、`read_file`、`search_text`、`run_process`；不新增工具。
- [x] 扩展内部 `AgentContextRequest` 使用受限 capability kind，而不是接受调用方任意 ToolDefinition；Context token 估算、压缩选择与真实模型请求使用完全相同的工具集合。
- [x] 将 capability kind 纳入本地 Context cache fingerprint/失效语义；normal/planning/recovery 的 warm/cold messages 与工具定义保持确定一致。
- [x] 恢复态模型请求注入有限中文动态事实；System Prompt 做最小版本升级并同步三 phase 固定契约测试。
- [x] `createToolPlan` 增加与 planning 同层级的 Runtime 二次能力检查；伪造写/替换调用返回有限可恢复错误且零执行。
- [x] `run_process` 后保持 pending 并使 listing 失效；只有后续完整 listing 把 pending path 观察为真实目录才解除，symlink/截断/被阻止 listing 均不能解除。

**最小验证：** workspace observations、runtime tools、context provider/runtime integration、tool schemas 与 system prompt 专项测试。

**完成条件：** 目录依赖从单批预检升级为有界恢复流程，工具集合与 Context 预算不分叉。

### T21-03：分 scope 完成证据账本

**覆盖：** FR-034、NFR-026～NFR-027、AC21-04～AC21-05。

**允许文件：**

- `lib/agent/completion-evidence.ts`
- `lib/agent/runtime.ts`
- `lib/agent/types.ts`
- `lib/tools/types.ts`（仅在共享只读类型确有需要时）
- T21-01 对应 completion/runtime 测试与 helper。

- [x] 用每个规范化相对 mutation path 的最新 seq 取代全局 `pendingValidation + relevantMutationPaths` 判定。
- [x] 记录成功 oneshot 验证的 kind/cwd/seq，并按 cwd 祖先关系覆盖其子树内、早于验证的 mutation。
- [x] 合并多个 cwd 的证据；实现 server/client 分别验证后 pending 为空，单侧验证只留下另一侧最小 scope。
- [x] 后续 mutation 只使受影响路径重新 pending；根 cwd 覆盖全部，文档扩展名继续排除。
- [x] 失败、service、readiness、HTTP、install、未知脚本、非结构化 stdout 不得产生覆盖。
- [x] 提供纯函数读取 `uncoveredScopes`、是否 pending 与新增覆盖计数，Runtime 不直接重复路径算法。

**最小验证：** `tests/unit/agent/completion-evidence.test.ts` 与 `runtime-completion.test.ts` 专项。

**完成条件：** T20-09 的 server/client 验证序列无需根脚本即可正确清账，且未验证范围仍被阻止完成。

### T21-04：纠正预算、错误、事件与跨层投影

**覆盖：** FR-035、NFR-026～NFR-027、SEC-021、AC21-03、AC21-06～AC21-07。

**允许文件：**

- `lib/agent/completion-evidence.ts`
- `lib/agent/write-dependency-recovery.ts`（若 T21-02 新增）
- `lib/agent/runtime.ts`
- `lib/agent/errors.ts`
- `lib/agent/types.ts`
- `lib/agent/events.ts`
- `lib/agent/schemas.ts`
- `lib/agent/projection.ts`
- `lib/agent/index.ts`
- `lib/domain/event.ts`
- `lib/domain/index.ts`
- `lib/context/history-projector.ts`
- `lib/context/message-renderer.ts`
- `lib/terminal/event-renderer.ts`
- `lib/client/event-state.ts`
- `lib/client/transcript.ts`
- `app/ui/workbench/transcript.tsx`
- 对应 unit tests 与 fixture。

- [x] 新增 `AGENT_WRITE_DEPENDENCY_UNRESOLVED` 并同步 error code、Schema、投影和安全文案；recoverable 语义按 Spec 固定。
- [x] 完成纠正态记录起始请求/工具计数与覆盖基线；无新覆盖超过 4 请求或 8 工具时提前以 `AGENT_COMPLETION_EVIDENCE_MISSING` 失败。
- [x] 新增覆盖时重置无进展计数；两次无进展 `stop` 仍提前失败，不能通过任意工具调用无限推迟。
- [x] `completion.evidence.rejected` 增加可选、有限、排序稳定的 `uncoveredScopes` 与 `acceptedKinds`；缺失字段的旧事件继续 strict 解析。
- [x] Context 历史只投影有限纠正事实；不得把绝对路径、输出正文或 run-local 授权写入摘要输入。
- [x] Terminal 与 Web 显示待验证相对 scope 和局部预算进度；无字段旧事件保持阶段 20 文案。
- [x] dependency recovery 与 completion correction 使用独立状态、错误、计数和消息，不能互相清除或授权。

**最小验证：** agent errors/schemas/projection、domain event、context history、terminal、client transcript/event-state 专项测试。

**完成条件：** 两类纠正都能取得进展或在局部预算内结束，事件与所有消费者保持一致和脱敏。

### T21-05：Terminal 与 Server 完整集成轨迹

**覆盖：** AC21-01～AC21-07。

**允许文件：**

- `tests/integration/terminal/execution-precision.test.ts`
- `tests/integration/terminal/runtime.test.ts`
- `tests/integration/terminal/helpers.ts`
- `tests/integration/server/run-stream.test.ts`
- `tests/integration/server/session-routes.test.ts`
- `tests/integration/server/helpers.ts`
- 仅在新可选字段确需 Route 输入/输出同步时允许修改 `lib/server/schemas.ts`、`lib/server/types.ts`、`lib/server/application.ts` 和 `app/api/sessions/[id]/runs/route.ts`。

- [x] 假模型轨迹：空根 listing → 错误嵌套写请求 → 零执行恢复态 → 审批 mkdir → 重新 listing → 写入成功。
- [x] 断言恢复态中伪造写工具、stop、重复无进展和取消均有确定终态，工作区 hash 与审批边界正确。
- [x] 假模型轨迹：server/client 分别写入、分别验证、首次合规完成声明产生 `run.completed`，零 `completion.evidence.rejected`。
- [x] 负轨迹：只验证 server 时拒绝并只公开 client scope；纠正无进展在局部预算内失败，不出现 `AGENT_RUN_TIMEOUT`。
- [x] NDJSON 顺序、断线取消、旧事件恢复、usage/cache/compaction 字段和 `no-store, no-transform` 保持不变。

**最小验证：** 目标 Terminal 与 Server integration 文件。

**完成条件：** 核心行为先在无浏览器环境中完整成立，HTTP 只传输同一事件事实。

### T21-06：Web 工作台呈现与 E2E

**覆盖：** NFR-027、AC21-07、AC21-10。

**允许文件：**

- `app/ui/workbench/transcript.tsx`
- 仅为有限状态样式允许修改 `app/globals.css`
- `lib/client/transcript.ts`
- `lib/client/event-state.ts`
- `tests/unit/client/**`
- `tests/e2e/agent-workflow.spec.ts`
- `tests/e2e/recovery-security.spec.ts`
- `tests/e2e/fixtures.ts`
- `tests/e2e/support/**`
- 若现有假模型场景不足，仅允许扩展 `tests/manual/openai-compatible-server.ts`。

- [x] UI 对依赖预检显示“未执行，等待目录依赖”，不显示为成功写入，不伪造 assistant 正文。
- [x] 完成拒绝显示有限相对 scope、接受的验证种类和进度；旧事件仍显示兼容文案。
- [x] 刷新、断线恢复、移动端详情、键盘和 `aria-live` 不重复或丢失拒绝事实；页面 DOM 属性和接口响应不含绝对路径/secret/reasoning 哨兵。
- [x] E2E 同时证明 server/client 联合验证后直接完成，不再重复 readiness/API/验证直到超时。
- [x] 阶段 20 的每请求/run/Session Token、provider/local cache 与压缩面板保持可读且数值不回归。

**最小验证：** Client/UI unit 与目标 Playwright 用例。

**完成条件：** UI 忠实展示核心状态，不形成第二套完成或恢复判定。

### T21-07：差分验证与完整自动门禁

**覆盖：** AC21-01～AC21-08、AC21-10 自动部分。

**允许文件：** 只允许修复本阶段实现或测试暴露的范围内缺陷，并记录于本 Task；公共接口、安全边界或验收含义变化必须回退 Spec。

- [x] 运行 dependency recovery 与 normal/planning 三工具集合的 cold/warm Context 差分，messages、工具定义、预算与压缩选择逐项一致。
- [x] 运行 server/client 分 scope、根 scope、后验证再写、无进展预算和取消/超时的假时钟差分。
- [x] 运行 `pnpm lint`。
- [x] 运行 `pnpm typecheck`。
- [x] 运行 `pnpm test`。
- [x] 运行 `pnpm test:coverage`，不得降低既有全局阈值。
- [x] 运行 `pnpm test:e2e`。
- [x] 使用隔离 dist 目录运行 webpack build 与 Turbopack build；不干扰用户已有 dev server。
- [x] 运行 `git diff --check`，检查无凭据、无越界路径、无意外生成物和无 `tsconfig.json` 自动改写残留。
- [x] 所有失败记录真实症状、根因、最小修正与重跑结果；不得跳过、删除或放宽断言制造通过。

**最小验证：** 完整自动门禁。

**完成条件：** 自动测试覆盖 Spec 全部确定性不变量，且阶段 13～20 既有能力无回归。

### T21-08：自动结果展示与真实模型停止点

**覆盖：** AC21-08。

**允许文件：** 本 Task、README 索引与阶段验收记录；不得启动真实模型。

- [x] 汇总 T21-00～T21-07 的实际实现、测试数量、coverage、E2E、双 build、失败修正和剩余风险。
- [x] 明确区分“自动门禁通过”与“真实 LongCat 尚未执行”。
- [x] 更新 Task 状态为“等待 T21-09 独立授权”，向用户展示结果后立即停止。
- [x] 不读取 `.env.local`，不根据当前环境是否存在 LongCat profile 自动继续。

**最小验证：** 文档一致性与 `git diff --check`。

**完成条件：** 用户得到全部自动证据，真实模型门禁仍锁定。

T21-01～T21-08 实施与自动验证记录：

- 写入依赖：新增 run-local `pendingParentDirectories`、`write.dependency.rejected` 与 `AGENT_WRITE_DEPENDENCY_UNRESOLVED`；恢复态模型和 Context 统一使用四工具 capability，伪造写调用由 Runtime 二次拒绝。`run_process` 不解除依赖，只有新的完整 `list_directory` 观察到真实目录才恢复写能力。
- 完成证据：待验证状态改为每个相对 mutation path 的最新 seq；成功 oneshot lint/typecheck/test/build 按 cwd 子树逐项清账，server/client 可联合覆盖，后续写入只使对应 scope 失效。拒绝事件可选公开有限 `uncoveredScopes/acceptedKinds`，旧事件仍可 strict 解析。
- 有界收敛：完成证据与目录恢复分别记录局部请求/工具预算；无新增覆盖最多 4 次模型请求或 8 次工具调用，两次无进展 stop 仍作为更早终止条件，全局取消、时限与工具预算不重置。
- Terminal/Server/Web：新增事件由 Domain、Agent、Context、Terminal、Client 和 Web 同源投影；Terminal/NDJSON 集成覆盖多 scope 正负轨迹，Playwright 覆盖 client scope 提示、联合验证完成和刷新后 durable 恢复。独立浏览器健全性检查结果为 `HAS_CONTENT`、无 Next.js 错误覆盖层，关键入口控件完整。
- 自动门禁：`pnpm lint`、`pnpm typecheck` 通过；完整 Vitest 为 116 files / 963 tests 全部通过。coverage 为 Statements 88.47%、Branches 82.65%、Functions 90.82%、Lines 90.22%。完整 Playwright 为 41/41 通过。隔离 webpack 与 Turbopack production build 均通过，构建自动写入的 `tsconfig.json` include/格式已用补丁恢复，`git diff --check` 通过。
- 失败与修正：首轮纯单元 RED 为 6 个预期失败；首轮全量 Vitest 的 6 项真实断言失败来自 System Prompt 仍期望 v8，更新为 v9 后通过，其余 22 项为沙箱禁止 TCP/Unix socket 的 `EPERM`，在获批的沙箱外重跑后 963/963 通过。首次 webpack 因沙箱网络无法解析 `fonts.googleapis.com` 失败，获批联网重跑后通过。Turbopack 保留一个既有动态文件访问导致扩大 tracing 的 warning，未把 warning 误记为失败或擅自扩大本阶段修复范围。
- 停止点：自动门禁通过不等于真实模型通过；本轮未读取 `.env.local`、未启动 LongCat、未生成阶段 21 Summary。T21-09 和 AC21-09～AC21-10 的真实模型结论仍为空，必须等待独立授权。

### T21-09：独立授权后的真实 LongCat 回归与阶段收口

**前置门禁：** 用户在看到 T21-08 全部实际结果后，另行明确批准“执行 T21-09 真实 LongCat 回归”。

**允许文件：** 可新增 `tests/manual/stage21-fixture.ts`；只允许更新本 Task、README 和阶段 21 Summary。不得修改产品代码来现场追赶失败。

- [x] 从本地应用配置选择 LongCat profile，不读取、打印、复制或持久化 API Key。
- [x] 新建系统临时 marker 根和独立 Session 数据目录；不得复用阶段 19/20 fixture、真实用户项目或 3000 端口。
- [ ] 运行小型前后端多 scope 任务，要求显式目录创建、分别 typecheck/build/test、双 service readiness、代表性 API 与真实浏览器创建/切换流程。
- [x] 事件级断言：所有已发生的 `write_file tool.started` 前父目录事实成立；模型先请求错误嵌套写入时只发生一次有界恢复且零文件副作用；未观察到重复成功副作用。
- [ ] 前后端分别验证后，首次合规完成声明产生 `run.completed`；零 `completion.evidence.rejected` 误拒绝、零重复验证循环、零 `AGENT_RUN_TIMEOUT`。
- [ ] 实时核对公开中文说明、tool-only 状态、reasoning 隐藏，以及每请求/run/Session Token、Context 摘要、provider/local cache 与压缩展示（公开中文、reasoning 隐藏和指标展示已核对；本次失败前没有形成 tool-only 或实际压缩样本）。
- [x] 结束后确认目标服务与隔离 SEcode 服务端口全部释放；终端 NDJSON、JSONL、HTTP 与 UI 对结构化失败保持一致。
- [ ] 只有 AC21-01～AC21-10 全部真实通过后生成 `21-agent-dependency-completion-recovery-summary.md` 并停止等待 Summary 审批；失败则如实记录阻塞，不生成虚假 Summary。

**完成条件：** 两个 T20-09 阻塞点在真实模型、多 scope、完整项目验证中均收敛，阶段 20 可见输出/usage/cache/压缩能力无回归。

#### T21-09 真实 LongCat 回归记录（2026-08-30，未通过）

- 独立授权：用户在 T21-08 自动结果和停止点之后再次回复“批准”，本次只解锁 T21-09。新增一次性 `tests/manual/stage21-fixture.ts`，创建 marker 根 `secode-stage21.4kLdyh`、独立事件目录和空工作区；SEcode 使用 3300，目标项目固定 4327/4328，未使用或终止 3000，未读取或输出 `.env.local` 与 API Key。
- 目录依赖恢复：模型先经审批显式创建 `server/client` 并完整 listing。首次请求 `server/src/types.ts` 时 `server/src` 已知缺失，事件只有 `tool.requested` seq 45 与失败 `tool.result` seq 46，没有 `tool.started`，文件未创建。Runtime 收窄后只允许一次 `mkdir -p server/src server/test`，完整 listing seq 60 确认目录事实后，重试写入才在 seq 65 启动并成功。其余已启动写入均有先行父目录事实，未观察到重复成功副作用。
- **阻塞——真实模型协议失败：** 第 18 次已完成请求之后，LongCat 生成了参数损坏的 `run_process`，被归一化为 `invalid_tool_call` 且没有进程启动；第 19 次模型请求随即返回无效 `choices` chunk。运行在 seq 115 以 `MODEL_PROTOCOL_ERROR`、`partialOutputDiscarded: true` 和 `iterations: 19` 安全失败。项目只完成部分 server 源码，尚未安装依赖、创建 client、执行 typecheck/build/test、启动双服务或运行 API/真实浏览器项目流程；没有 `run.completed`，因此 AC21-09 不通过。未出现 `completion.evidence.rejected` 或 `AGENT_RUN_TIMEOUT`，但这不能替代缺失的完成证据。
- 可见性与账本：真实流在工具前后持续显示公开简体中文 `assistant.delta`，UI 未显示 reasoning；本次失败前每个已完成模型请求均有公开正文，因此没有形成新的 tool-only 样本。18 个已完成模型请求逐项显示 usage；第 19 次无 usage，因此 run 与 Session 均诚实显示“至少 输入 105509、输出 4627、总计 110136、推理 922（1 次请求用量未知）”。供应商 Prompt Cache 为 `partial`，命中 88064 Token、miss 未上报、命中率不可计算；本地 Context Cache 为 cold/warm/invalidated `1/15/2`，命中率 `83.3%`，复用/尾部事件 `808/203`，避免读取 `408498 B`，构建耗时 `36 ms`。本次上下文未达到压缩阈值，UI 如实显示 `0/0/0` 与“尚未压缩”，但没有形成新的实际压缩样本。
- 跨入口一致性：JSONL 共 115 个 durable 事件；终端 NDJSON、只读 HTTP `events?after=100` 和 Web UI 均以 seq 115 `run.failed / MODEL_PROTOCOL_ERROR` 收口。独立 `agent-browser` 检查确认页面有内容、无 Next.js 错误覆盖层，Session 标题、失败状态、逐请求 usage、详情账本和“继续上次任务”控件可见。
- 清理：运行未启动目标服务；结束时 4327/4328 均无监听。隔离 SEcode production 服务已正常停止，3300 无监听；`tsconfig.json` hash 保持 `3cce6f8b2540d983756b909e9e5c181034da4c38`，`git diff --check` 通过。未修改产品代码、未触碰真实用户项目、未执行 Git 写操作、发布或部署。

结论：本次证明目录依赖的零越序执行与一次有界恢复在真实 LongCat 轨迹中生效，阶段 20 的可见输出、usage 和双 cache 展示也未回归；但供应商协议失败使多 scope 项目与完成证据收敛无法完成。阶段 21 保持未完成，不生成 Summary，也不重试挑选成功结果。

## 5. 需求与验收追踪

| Task | 主要需求 | 主要验收 |
| --- | --- | --- |
| T21-00 | 全部基线 | AC21-08 实施前事实 |
| T21-01 | FR-033～FR-035、NFR-026～NFR-027、SEC-021 | AC21-01～AC21-07 RED |
| T21-02 | FR-033、NFR-026、SEC-021 | AC21-01～AC21-03 |
| T21-03 | FR-034、NFR-026～NFR-027 | AC21-04、AC21-05 |
| T21-04 | FR-035、NFR-026～NFR-027、SEC-021 | AC21-03、AC21-06、AC21-07 |
| T21-05 | 全部核心 | AC21-01～AC21-07 |
| T21-06 | NFR-027 | AC21-07、AC21-10 |
| T21-07 | 全部 | AC21-01～AC21-08 自动门禁 |
| T21-08 | 全部 | 自动结果与真实模型停止点 |
| T21-09 | 全部 | AC21-09、AC21-10 真实模型验收 |

## 6. 失败处理与回退策略

- RED 失败原因必须对应缺少实现；若测试因既有无关脏树或环境失败，先隔离归属，不覆盖用户改动。
- 动态工具集合若导致 Context 预算或 cache fingerprint 分叉，停止 T21-02，不能通过关闭 cache 或放宽 token 断言规避。
- scope 算法若无法同时满足“联合覆盖”和“后写失效”，停止 T21-03 并回到 Spec，不退化成任意成功即放行。
- 新事件字段导致旧 JSONL 无法解析时，修复为 optional 并完整重跑恢复测试，不做迁移脚本。
- 自动门禁失败只修复本阶段原因；真实 LongCat 失败不得现场修改产品代码，先记录并回退到 Spec/Task 门禁。
- 所有受控 service 在成功、失败、取消、超时后均须释放；不得用宽泛 `kill`、`pkill` 或终止未知用户进程掩盖清理缺陷。

## 7. 明确不执行

- 不新增工具、依赖、Agent 框架、缓存数据库、Shell、自定义 env 或自动进程授权。
- 不让文件工具隐式创建目录，不改变覆盖 SHA、symlink 与工作区边界。
- 不重新实现阶段 20 usage/cache/compaction，不处理降级摘要中的错误消解语义。
- 不修改真实用户项目，不 commit/push，不发布部署，不制作最终 README.txt 或视频。
- T21-08 前不运行真实 LongCat；T21-09 未独立授权前不因任何历史批准自动开始。

## 8. Task 审批门禁

**当前状态：阶段 21 T21-00～T21-08 已完成并通过自动门禁；T21-09 已获独立批准并执行，但真实 LongCat 回归未通过。阶段 21 阻塞，未生成 Summary。**

审批记录：用户于 2026-08-30 在收到本 Task 全文链接与门禁说明后回复“批准”，语义等价于“阶段 21 Task 通过”。本次批准只解锁 T21-00～T21-08；T21-08 自动结果展示后必须停止，T21-09 仍需独立批准。

T21-09 独立审批记录：用户于 2026-08-30 在收到 T21-08 自动门禁结果与停止点后再次回复“批准”，本次只解锁一次性真实 LongCat 回归及其验收记录；不授权产品代码修改、Git 写操作、发布或部署。

T21-09 执行结论：真实运行在第 19 次模型请求以 `MODEL_PROTOCOL_ERROR` 失败，未完成 client、完整验证或 `run.completed`。按失败处理规则停止，不生成 Summary。
