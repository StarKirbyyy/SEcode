# 阶段 23 Task：Web 长历史分页与终态协调修复

## 1. 文档状态与审批门禁

- 当前状态：`T23-00～T23-09 已完成；Summary 已批准，阶段 23 完成`。
- 批准的 Spec：[23-web-history-pagination-terminal-reconciliation-spec.md](./23-web-history-pagination-terminal-reconciliation-spec.md)。
- Spec 审批：用户于 2026-08-30 回复“批准”；该批准只解锁本 Task 的编写。
- Task 获批前不得修改产品代码、测试、配置或真实 Session，不得执行真实模型回归。
- 本 Task 获批后解锁 T23-00～T23-08；必须按依赖顺序实施并记录真实 RED、修正和验证结果。
- 本阶段不需要真实 LongCat。若实施证据表明确定性 Client/E2E 无法覆盖关键风险，必须先停止并说明新增真实运行的独立价值，未经用户再次授权不得运行。
- 本阶段不授权 commit、push、发布、部署、依赖安装/升级、读取或输出 `.env.local`、修改真实用户工作区或真实 `.secode-data` Session。

## 2. 冻结边界与实施原则

1. 严格 TDD：先让 538 条分页和原子协调在正确 seam 形成 RED，再写最小实现；不得先改 `app-shell-provider.tsx` 后补浅层断言。
2. `EventPage.lastSeq` 继续表示日志最后稳定序号；分页 cursor 只使用当前非空页最后 event 的 `seq`。
3. 完整历史先构建为内部候选 ledger，通过稳定尾部、连续性、Session、recovery 和进展校验后一次提交；不得逐页替换可见 ready ledger。
4. 同 Session 恢复采用单一提交所有权。旧 generation、abort、路由切换和晚到响应不得提交 ready/error 或覆盖更新 ledger。
5. JSONL、events Route Handler、公共 Schema、Agent Runtime、Model、Context、Terminal、工具、审批、语言门、完成证据、usage 和 cache 语义全部冻结。
6. 不通过把 page limit 提高到超过 fixture、把 `lastSeq` 改成页尾、关闭终态详情、隐藏错误或删除历史来制造通过。
7. E2E 大历史必须使用系统临时数据目录中的全新合成 Session，经现有 JsonlEventStore API 创建和追加；不得复制真实 Session 内容或直接拼写不受 Schema 校验的 JSONL。
8. 所有错误保持有限、简体中文和可重试，不包含绝对路径、事件正文、tool arguments、private reasoning、secret 或内部异常。

## 3. 允许文件白名单

### 3.1 预计新增

- `lib/client/history-reconciliation.ts`
- `tests/unit/client/history-reconciliation.test.ts`
- `tests/e2e/history-pagination.spec.ts`
- `tests/e2e/support/history-fixture.ts`（仅在大历史构造无法合理内聚于 spec 文件时）
- `docs/development/23-web-history-pagination-terminal-reconciliation-summary.md`（仅 T23-08 全部门禁通过后）

### 3.2 预计修改

- `lib/client/index.ts`
- `app/ui/shell/app-shell-provider.tsx`
- `app/ui/workbench/session-workbench.tsx`（仅当消除 effect/finally 重复恢复确有需要）
- `tests/unit/client/event-state.test.ts`（仅补充终态/ledger 不倒退契约）
- `tests/integration/server/session-routes.test.ts`（仅冻结现有日志级 `lastSeq` HTTP 契约，不改服务端实现）
- `tests/e2e/fixtures.ts`（仅增加安全的合成历史 fixture 接口；若 support helper 足够则不修改）
- `docs/development/23-web-history-pagination-terminal-reconciliation-tasks.md`
- `docs/development/README.md`

### 3.3 明确禁止

- `lib/storage/**`、`lib/server/**`、`app/api/**`、`lib/agent/**`、`lib/model/**`、`lib/context/**`、`lib/terminal/**`、`lib/tools/**`。
- `package.json`、`pnpm-lock.yaml`、`.env*`、`next.config.ts`、`playwright.config.ts`、公共 Domain/Event Schema。
- 真实 `.secode-data/**`、真实用户工作区和阶段 17～22 manual fixture。

若实现必须超出白名单、改变公共 API/Schema、引入新 UI 状态或修改 Store/Route Handler，立即停止并修订 Task 或回退 Spec 审批，不能现场扩张。

## 4. 固定实施顺序

```text
T23-00 基线、真实回放与范围冻结
  → T23-01 RED：完整分页候选加载器
  → T23-02 实现分页契约与完整性校验
  → T23-03 RED：原子提交、并发所有权与陈旧响应
  → T23-04 App Shell 集成与流结束协调
  → T23-05 大历史 E2E 与四类终态矩阵
  → T23-06 边界、安全与既有链路回归
  → T23-07 全量自动门禁
  → T23-08 Summary 与停止点
  → 用户要求追加真实浏览器验收并批准 T23-09
  → T23-09 DeepSeek 全真浏览器验收
  → 修订 Summary 与停止点
```

## 5. 任务清单

### T23-00：基线、真实回放与范围冻结

**覆盖：** AC23-01～AC23-10。

**允许文件：** 只读；完成记录只写本 Task。

- [x] 运行 `git status --short`，记录并保留当前阶段 13～23 和用户已有大量未提交修改；不得 reset、stash、checkout、清理或覆盖。
- [x] 核对阶段 23 Spec/Task 均已批准且批准前无阶段 23 产品修改，确认当前 App Shell 仍在 `hasMore=true` 时执行 `after = page.lastSeq`。
- [x] 复跑脱敏三段信号：完整 538 为 failed、前 500 为 running、恢复 538 为 failed；只输出计数、状态、terminal 和 cursor，不输出正文/参数。
- [x] 记录相关现有 19 项测试基线和 `git diff --check`：3 files / 19 tests 通过，diff whitespace 检查通过。
- [x] 再次核对本地 Next.js 16.3.3 Client Component 与 Route Handler 文档；确认本阶段不修改 Route Handler 或缓存策略。

**完成条件：** 可重复信号、契约、脏树归属、允许文件和停止条件明确。

### T23-01：RED——完整分页候选加载器

**覆盖：** FR-005、FR-008、NFR-011、AC23-01、AC23-04、AC23-07、AC23-09。

**允许文件：**

- `tests/unit/client/history-reconciliation.test.ts`
- 必要的既有 Client test helper；不得修改实现。

- [x] 构造 538 条连续 durable events，模拟第一页 events 1～500、`lastSeq=538`、`hasMore=true`，第二页 501～538；断言请求 cursor 精确为 `[0, 500]`，返回候选尾部 538。
- [x] 加入 500、501、1000、1001 与末页 1 条边界，断言不漏、不重、不倒序。
- [x] 加入 `hasMore=true` + 空 events、页尾不前进、seq 间隙/重复、错误 Session、非 durable、recovery mismatch、跨页 `lastSeq` 改变和末页未达到稳定尾部 RED。
- [x] 加入网络、Schema/Client error 与 AbortSignal RED，断言错误有限且不携带注入的 secret、绝对路径、正文或 reasoning 哨兵。
- [x] 运行仅新增测试，确认它们因缺少 `history-reconciliation` 实现而按预期 RED；记录失败原因，不能降低断言。

**完成条件：** RED 直接覆盖日志级尾序号与页 cursor 分离，而不是只调用 `mergeAgentEvent()`。

### T23-02：实现分页契约与完整性校验

**覆盖：** AC23-01、AC23-04、AC23-07、AC23-09。

**允许文件：**

- `lib/client/history-reconciliation.ts`
- `lib/client/index.ts`
- `tests/unit/client/history-reconciliation.test.ts`

- [x] 实现内部 `loadCompleteHistory`（最终命名可在本文件内等价调整）：输入 sessionId、`getEvents` 与 AbortSignal，输出完整 `EventLedger`、最终 recovery 和稳定 `lastSeq`。
- [x] 首页冻结日志级 `stableLastSeq`；每页验证 `page.lastSeq === stableLastSeq` 和 `page.recovery.lastStableSeq === stableLastSeq`。
- [x] 使用候选 ledger 的当前页尾 event seq 推进 `afterSeq`；`hasMore=true` 时空页或无进展直接结构化失败。
- [x] 复用 `mergeAgentEvents` 保持 AgentEvent Schema、Session、seq、ID 冲突校验，不自行建立宽松解析器。
- [x] `hasMore=false` 时要求候选最后 durable seq 精确达到稳定尾部；不完整候选不返回。
- [x] AbortSignal 在请求前后和候选返回前均生效；取消不转写成普通协议成功。
- [x] 运行 T23-01 专项测试由 RED 转 GREEN；再运行 `tests/unit/client/event-state.test.ts` 与 Client schema/NDJSON 回归。

**完成条件：** 所有合法边界完整恢复，所有不一致候选有限失败，Store/API 无修改。

### T23-03：RED——原子提交、并发所有权与陈旧响应

**覆盖：** NFR-007、NFR-011、AC23-02～AC23-03、AC23-05～AC23-08。

**允许文件：**

- `tests/unit/client/history-reconciliation.test.ts`
- `tests/unit/client/event-state.test.ts`
- `tests/e2e/history-pagination.spec.ts`
- `tests/e2e/support/history-fixture.ts`（若需要）

- [x] 用两个 deferred page source 反转完成顺序，建立“旧 generation 晚到不得覆盖新候选”的 RED。
- [x] 建立“当前 ready ledger 已含 seq 1～538 failed，协调候选仅完成 1～500 时，可见 ledger 仍为 538 failed”的 RED。
- [x] 建立 abort/路由切换后候选不得提交 ready/error 的 RED。
- [x] 建立首次加载没有 ready ledger 时只显示 loading，完整候选到达后一次切换 ready 的行为断言。
- [x] 建立后续 run 追加后旧 run 尾部、Session usage/context/cache 与新终态不丢失/不重复的投影断言。
- [x] 运行最小 RED，确认当前 App Shell 的逐页 `replaceHistory` 或缺少提交所有权会失败。

**完成条件：** RED 能区分“分页数据正确”与“可见协调仍回退/竞态覆盖”两个层面。

### T23-04：App Shell 集成与流结束协调

**覆盖：** FR-005、FR-008、NFR-007、NFR-011、AC23-02～AC23-08。

**允许文件：**

- `app/ui/shell/app-shell-provider.tsx`
- `app/ui/workbench/session-workbench.tsx`（仅确有需要）
- `lib/client/history-reconciliation.ts`
- `lib/client/index.ts`
- T23-03 对应 Client 测试。

- [x] `loadHistory` 改为调用完整候选加载器；首次加载可进入 loading，但不得逐页发布 ready。
- [x] 已有同 Session ready ledger 时保持可见；强制协调在后台构建候选，只有候选连续尾部不低于当前 durable 尾部时才原子提交。
- [x] 增加有界 generation/owner ref 或等价机制；只有最新且未取消、Session 匹配的恢复拥有提交权。
- [x] 同 Session 重复初始加载复用 in-flight 或确定性失去提交权；不得由页面 effect 与流 `finally` 形成重复循环。
- [x] 删除 `finally` 中手动把 `historyRef.current` 伪设为 idle 的回退路径；改为显式后台 reconcile，不清空现有 ready ledger。
- [x] 网络/协议/完整性失败：有 ready ledger 时保留并设置有限 run/history notice；无 ready ledger 时进入可重试 error。不得把 failed/completed 降回 executing。
- [x] run transport、active run、navigation guard、submission lock、stop、approval 和 Session deletion 行为不变。
- [x] T23-03 RED 转 GREEN，并检查 React hooks dependency 稳定、unmount abort 和无 console/page error。

**完成条件：** cursor、原子可见性和提交所有权同时修复；单纯修改第 269 行不足以完成本任务。

### T23-05：合成大历史 E2E 与四类终态矩阵

**覆盖：** AC23-01～AC23-08、SEC-006。

**允许文件：**

- `tests/e2e/history-pagination.spec.ts`
- `tests/e2e/support/history-fixture.ts`
- `tests/e2e/fixtures.ts`（仅必要 helper）
- `tests/integration/server/session-routes.test.ts`

- [x] 使用 E2E runtime manifest 的临时 `dataDir/workspace` 与现有 JsonlEventStore API 创建全新合成 Session；不直接写原始 JSONL。
- [x] 生成 538 条公开 durable events，尾部为 `run.failed`，刷新稳定 URL 后断言最后 assistant/status、失败错误码和详情 failed 可见，且 events 请求 cursor 包含 `after=500`、不包含错误跳转 `after=538`。
- [x] 在完整 failed 历史已显示后启动一个短假模型 run；拦截/延迟协调第二页，断言等待期间旧 transcript 与新实时终态均不回退，协调后新终态只出现一次。
- [x] 以共享生成器覆盖 completed、cancelled、interrupted 和真实无终态 open run；断言四类 terminal 与 open 投影不混淆。
- [x] 覆盖 1001 条至少一个浏览器用例，证明三页 cursor `[0,500,1000]` 和最终尾部完整。
- [x] HTTP 集成测试冻结现有 contract：第一页 events 页尾小于日志级 `lastSeq` 且 `hasMore=true`；服务端不需要修改。
- [x] fixture 注入 secret/path/reasoning 哨兵只用于不可见断言，不进入浏览器错误、截图文本或持久文档。

**完成条件：** 浏览器直接复现并锁定用户报告的回退与伪 executing，而不是只证明 helper 返回数组。

### T23-06：边界、安全与既有链路回归

**覆盖：** AC23-04～AC23-10。

**允许文件：** 本阶段已批准测试/实现白名单；不得扩大产品范围。

- [x] 运行专项 Client、event-state、transcript、schema、NDJSON、Server events contract 测试。
- [x] 运行 `tests/e2e/history-pagination.spec.ts`，要求 Chromium `workers=1`、`retries=0`、无 console/page error。
- [x] 运行既有 agent-workflow、language、plan、approval/cancel、recovery、session deletion E2E，确认导航、审批、取消、删除和刷新不回归。
- [x] 检查 package/lock、events API、Store、Agent/Model/Context/Terminal/工具目录无阶段 23 diff。
- [x] 扫描新增代码/fixture/错误输出，不含 `.env.local` 值、Authorization、provider body、绝对真实路径、private reasoning 或真实工具参数。
- [x] 检查不存在 skip/only、放宽 page limit、修改 `lastSeq` 语义、第二事实源或调试日志。

**完成条件：** 专项与邻接回归通过，安全/冻结边界无偏差。

### T23-07：全量自动门禁

**覆盖：** AC23-10。

**允许文件：** 不新增业务修改；只记录结果。构建生成物使用阶段 23 隔离 dist，完成后只删除本任务创建且已核对的生成目录。

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm test:coverage`
- [x] `pnpm test:e2e`
- [x] `SECODE_NEXT_DIST_DIR=.next-stage23-webpack pnpm exec next build --webpack`
- [x] `SECODE_NEXT_DIST_DIR=.next-stage23-turbopack pnpm exec next build --turbopack`
- [x] `git diff --check`
- [x] 核对 `git status --short`，只归属阶段 23 白名单与既有改动；精确清理 `.next-stage23-webpack`、`.next-stage23-turbopack` 等本阶段生成物，不触碰用户服务、`.next` 或无关文件。

失败必须记录真实命令、症状、根因、修正和完整重跑结果；不得通过删测试、skip、降低 coverage、关闭 TypeScript/ESLint 或修改构建模式制造通过。若构建自动改写 `tsconfig.json`，只允许用精确补丁恢复本阶段构建引入的机械差异，不能覆盖用户已有内容。

**完成条件：** 全部门禁真实通过且无遗留服务/生成物；若任一必需门禁未通过，阶段保持阻塞，不生成成功 Summary。

### T23-08：Summary 与停止点

**覆盖：** NFR-008、AC23-10。

**允许文件：**

- `docs/development/23-web-history-pagination-terminal-reconciliation-summary.md`
- 本 Task 实施记录
- `docs/development/README.md`

- [x] 如实记录 RED、实现、允许文件、验证命令、失败/修正、偏差、安全检查和剩余风险。
- [x] 记录真实三段信号在合成回归中的修复后结果；不重新读取或修改真实 Session。
- [x] 若所有 AC23-01～AC23-10 满足，生成 Summary 并把索引更新为“Summary 待用户审批”；否则记录阻塞事实并停止。
- [x] 生成 Summary 后立即停止，不进入阶段 24，不制作最终文档/视频，不 commit/push。

**完成条件：** Summary 事实完整并等待用户独立审批。

### T23-09：DeepSeek 全真浏览器验收（追加任务，已批准）

**审批记录：** 用户在阶段 23 Summary 待审批期间明确要求调用 `agent-browser`、使用 `deepseek-v4-flash` 进行一次全真测试；在收到隔离范围、真实 API/费用、验收路径和停止点后回复“批准”。该回复批准本追加任务，不等价于批准修订后的 Summary。

**允许范围：**

- 文档：本 Task、阶段 23 Summary、`docs/development/README.md`。
- 运行时：使用 `.env.local` 已存在的 DeepSeek 凭据启动本地 Next.js，但不得读取、打印、复制或修改凭据；只以进程环境覆盖 `DEEPSEEK_MODEL=deepseek-v4-flash`。
- 数据：只使用本任务新建的临时 dataDir、临时 workspace 和临时浏览器 Session；不得读取、写入或复用真实 `.secode-data` Session 与真实用户项目。
- 浏览器：按 `agent-browser` 的 open → snapshot → interact → re-snapshot 流程操作；测试结束必须关闭浏览器和本地服务。
- 不授权 Production/Test 代码变更、依赖变更、Git commit/push、发布部署或阶段 24 工作。

**验收任务：**

- [x] 在临时工作区创建一个无外部依赖、初始测试失败的 `slugify` JavaScript fixture。
- [x] 使用隔离 `SECODE_DATA_DIR`、`SECODE_WORKSPACE_PICKER_ROOT` 和 `DEEPSEEK_MODEL=deepseek-v4-flash` 启动本地应用；通过公开配置或 UI 确认 DeepSeek profile 可用，不输出 secret。
- [x] 使用 `agent-browser` 选择临时工作区并提交中文任务，要求 Agent 完成读取、最小修复、运行测试和中文总结。
- [x] 观察真实模型请求、工具调用、可见正文、终态和详情；记录有限事件计数、错误码和最终状态，不记录 private reasoning、原始 provider body 或凭据。
- [x] 刷新稳定 Session URL，确认 transcript、最新终态和详情保持一致，不出现回退或永久伪 `executing`。
- [x] 核对临时项目测试结果与实际文件内容；测试结束关闭 `agent-browser` 和 Next 服务，并只清理本任务创建的临时 dataDir/workspace。
- [x] 将成功或失败事实如实写入阶段 23 Summary 与索引；重新进入 Summary 待审批停止点。

**失败处理：** profile 未配置、模型名不可用、上游失败、Agent 业务失败或浏览器异常均如实记录；不得切换其他模型、修改 Production、放宽验收或重复消耗真实 API 来制造通过。是否重跑必须基于已确认的非模型偶发原因，并保持有限次数。

**完成条件：** 一次受控真实浏览器运行有完整、脱敏、可审计的结果，临时资源已清理，修订 Summary 等待用户审批。

## 6. 验收标准到任务映射

| 验收标准 | 主要任务 |
| --- | --- |
| AC23-01 | T23-01、T23-02、T23-05 |
| AC23-02 | T23-03～T23-05 |
| AC23-03 | T23-03～T23-05 |
| AC23-04 | T23-01～T23-02、T23-05～T23-06 |
| AC23-05 | T23-03～T23-05 |
| AC23-06 | T23-03～T23-04、T23-06 |
| AC23-07 | T23-01～T23-04 |
| AC23-08 | T23-03～T23-06 |
| AC23-09 | T23-00、T23-02、T23-06～T23-07 |
| AC23-10 | T23-06～T23-09 |

## 7. 失败处理与回退

- RED 不能复现 cursor `[0,538]`：停止检查 seam，不得凭代码阅读直接修改实现。
- 需要修改 Store `lastSeq` 或 events API：立即停止并回退 Spec，不得用跨层破坏换局部通过。
- App Shell 无法在现结构中测试原子提交：只允许提取 `lib/client` 内部协调模块，并由 Task 白名单测试；不得新增公共持久状态。
- E2E 合成历史触碰真实 dataDir/workspace：立即停止并删除仅本任务临时 fixture，报告安全边界失败。
- 分页期间真实尾部变化导致候选失效：保留旧 ready ledger并返回有限错误；不得拼接两个稳定快照。
- 全量门禁发现无关既有失败：记录命令和归属，不能修改阶段 23 范围外文件追绿。
- 回退只使用精确补丁作用于阶段 23 修改；禁止 `git reset --hard`、`git checkout --`、stash 或覆盖用户已有修改。

## 8. Task 审批门禁

**当前状态：原 Task 与追加 T23-09 均已批准。**

- 审批记录：用户于 2026-08-30 在收到本 Task、T23-00～T23-08 顺序和停止点后回复“批准”，语义等价于“阶段 23 Task 通过”。
- 本次批准解锁 T23-00～T23-08 的顺序实施，不授权真实 LongCat、Git 写操作、发布部署、依赖变更或阶段 24 工作。
- 追加审批：用户于 2026-08-30 批准 T23-09，只解锁使用 `deepseek-v4-flash`、隔离临时目录和 `agent-browser` 的一次全真验收；仍不授权修改真实 Session、真实项目、Production/Test 代码、Git 写操作或阶段 24。
- Summary 审批：用户于 2026-08-30 已批准阶段 23 Summary；2026-08-31 的全量历史文档审批再次确认该状态。阶段 23 已完成。
- 任何白名单、公共契约、测试范围或验收标准变化都必须先停止并重新审批。
