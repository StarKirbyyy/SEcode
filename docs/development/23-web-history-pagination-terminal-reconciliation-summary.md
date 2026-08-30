# 阶段 23 Summary：Web 长历史分页与终态协调修复

## 1. 文档状态与审批门禁

- 当前状态：`已批准，阶段 23 完成`。
- 完成日期：2026-08-30（北京时间）。
- 前置 Spec：[`23-web-history-pagination-terminal-reconciliation-spec.md`](./23-web-history-pagination-terminal-reconciliation-spec.md)，用户于 2026-08-30 明确回复“批准”。
- 前置 Task：[`23-web-history-pagination-terminal-reconciliation-tasks.md`](./23-web-history-pagination-terminal-reconciliation-tasks.md)，用户于 2026-08-30 明确回复“批准”。
- 本次批准解锁了 T23-00～T23-08，但未授权真实 LongCat、修改真实 Session、依赖变更、Git 写操作、发布部署或阶段 24 工作。
- 追加审批：用户随后明确要求调用 `agent-browser`、使用 `deepseek-v4-flash` 做一次全真测试，并在收到隔离、费用、验收与停止范围后回复“批准”，解锁 T23-09。
- Summary 审批：用户于 2026-08-30 回复“通过并同意”，明确批准本 Summary，并同意新开阶段 24 修复完成证据收敛与失败终态呈现。
- 当前门禁：阶段 23 已完成；该批准只解锁阶段 24 的只读观察与 Spec 编写，不等价于批准阶段 24 Spec、Task 或业务代码修改。

## 2. 阶段目标与最终结论

阶段 23 已修复 Web 工作台在 durable 事件超过 500 条时跳过尾页、流结束后 transcript 回退以及详情伪 `executing` 的同一根因。

最终链路为：

```text
第一页冻结日志级 stableLastSeq
  → 使用当前页最后 event.seq 推进 after
  → 在内部候选 ledger 合并并验证全部页
  → 校验连续 seq、Session、recovery 与稳定尾部
  → 最新 generation 获得提交权
  → 候选覆盖当前可见 durable 前缀后一次原子提交
```

`EventPage.lastSeq` 仍表示日志最后稳定序号，Store、events API、JSONL 与 Agent Runtime 均未改变。流 `finally` 不再清空 ready ledger 或逐页发布历史；后台协调期间继续显示已验证的完整 transcript 和终态。

T23-00～T23-09 已完成。538 条 failed 历史、501 条 completed/cancelled/interrupted/open-recovery 矩阵、1001 条三页历史、后续短 run 与延迟第二页协调均已通过浏览器回归；追加的 `deepseek-v4-flash` 全真浏览器运行也成功完成读取、最小写入、测试、终态协调和刷新恢复。全量 117 个 Vitest 文件 / 991 项测试、47 项 Chrome E2E、coverage、lint、typecheck、Webpack/Turbopack build 和 `git diff --check` 通过。

## 3. 实际开发顺序

1. 保留 dirty worktree，只读核对流程、阶段文档、本地 Next.js 16.3.3 Client Component/Route Handler 文档和真实 Session 的脱敏事件结构。
2. 用完整 538、前 500、恢复 538 三段投影复现 `failed → running → failed`，确认 Client 把日志级 `lastSeq` 错当分页 cursor。
3. 先建立分页加载器 RED，覆盖 500、501、538、1000、1001、空页、无进展、间隙、错误 Session、稳定尾变化、网络错误和 abort。
4. 实现内部完整历史加载器，冻结稳定尾并用页尾 event seq 推进 cursor。
5. 先建立提交所有权与旧候选不得覆盖新 ledger 的 RED，再实现 generation ticket 和候选前缀校验。
6. 将 App Shell 历史加载与流结束协调改为后台候选构建和单次原子提交。
7. 通过 JsonlEventStore API 在 E2E 临时 dataDir 中构造 501/538/1001 条合法历史，完成终态、三页 cursor 与后续 run 竞态回归。
8. 冻结 HTTP `lastSeq` 日志级契约，运行 Client/Server 专项及 Agent、语言、Plan、审批、取消、恢复、删除邻接 E2E。
9. 执行全量 test、coverage、E2E 和双构建；精确清理阶段 23 构建产物与 Next 自动写入的隔离类型路径。
10. 完成安全、范围和 dirty worktree 审计，生成本文档并停止。
11. 用户在 Summary 待审批期间追加并批准 T23-09；重新打开 Summary，使用隔离 dataDir/workspace 和 `agent-browser` 完成一次 `deepseek-v4-flash` 全真运行。
12. 核对真实 run 的 durable 计数、工具结果、项目测试与刷新后详情，关闭浏览器/服务并精确清理临时数据，再次提交修订 Summary。

## 4. 核心实现

### 4.1 完整分页候选加载器

新增 `lib/client/history-reconciliation.ts`：

- 首页冻结 `stableLastSeq`，后续页必须保持相同 `page.lastSeq`。
- 每页要求 `recovery.lastStableSeq === stableLastSeq`。
- 下一页 cursor 只取当前非空页最后 event 的 `seq`，不再使用日志级 `lastSeq`。
- durable、Session 和 seq 必须逐项连续；事件合并复用 `mergeAgentEvents()` 的既有 Schema、ID 与冲突校验。
- `hasMore=true` 的空页、无进展、页尾越过稳定尾，以及最终页未到达稳定尾均返回有限可重试错误。
- 请求前、响应后和返回候选前均检查 AbortSignal；未知 source 异常映射为不含 cause 的有限中文 Client 错误。

### 4.2 原子提交与 generation 所有权

`HistoryLoadOwnership` 为每次恢复分配单调 generation ticket：

- 只有最新、Session 匹配且未取消的 ticket 可提交 ready/error。
- 路由切换、删除当前 Session、新任务和组件卸载会使旧 ticket 失效。
- `canCommitCompleteHistory()` 要求候选达到稳定尾，并完整包含当前可见 durable ledger 的相同前缀；更短或冲突候选不会覆盖现有视图。
- helper 保持模块内部导入，没有扩张 `lib/client` 公共 barrel 的运行时 export。

### 4.3 App Shell 协调

`app-shell-provider.tsx` 的历史恢复改为：

- 首次加载无 ready ledger 时显示有限 loading，完整候选完成后一次切换 ready。
- 同 Session 已有 ready ledger 时保持可见，在后台强制协调。
- 协调失败且已有 ready ledger 时保留 transcript/终态，只设置有限 run error；无旧 ledger 才进入可重试 history error。
- 流 `finally` 删除手工伪设 idle 和从空 ledger 重载的路径，改为显式 `recoverHistory(..., force=true)`。
- run transport、导航锁、submission lock、停止、审批与 Session 删除语义保持原样。

### 4.4 大历史与 HTTP 契约 fixture

E2E fixture 只使用 runtime manifest 的临时 `dataDir/workspace` 和现有 JsonlEventStore API：

- 538 条 failed 用例确认请求 `[0, 500]`，从不请求错误的 `after=538`。
- failed 历史显示后启动短假模型 run，并延迟协调第二页；等待期间旧尾部和新 completed 终态同时可见，协调后新最终正文只出现一次。
- 501 条矩阵覆盖 completed、cancelled、interrupted，以及 Store 初始报告为 open 的 orphan run；既有 Server recovery 按冻结契约把 orphan open 持久化为 interrupted，浏览器断言该恢复事实而不是永久伪 running。
- 1001 条用例确认三页 cursor `[0, 500, 1000]` 和最终尾部。
- HTTP 集成测试确认第一页尾为 500 时，日志级 `lastSeq/recovery.lastStableSeq` 可为 502 且 `hasMore=true`；额外一条是既有 open-run recovery 追加的 interrupted 终态，服务端实现未修改。

## 5. 实际文件变化

### 新增 Production

```text
lib/client/history-reconciliation.ts
```

### 修改 Production

```text
app/ui/shell/app-shell-provider.tsx
```

### 新增测试

```text
tests/unit/client/history-reconciliation.test.ts
tests/e2e/history-pagination.spec.ts
tests/e2e/support/history-fixture.ts
```

### 修改测试

```text
tests/integration/server/session-routes.test.ts
```

该 Server 测试文件包含进入阶段 23 前已有的 Session 删除改动；本阶段只新增分页契约用例，没有覆盖或重新归属既有内容。

### 文档

```text
docs/development/23-web-history-pagination-terminal-reconciliation-spec.md
docs/development/23-web-history-pagination-terminal-reconciliation-tasks.md
docs/development/23-web-history-pagination-terminal-reconciliation-summary.md
docs/development/README.md
```

没有阶段 23 Production diff 进入 `lib/storage/**`、`lib/server/**`、`app/api/**`、Agent、Model、Context、Terminal、工具、审批、公共 Domain/Event Schema、package、lock 或环境配置。

## 6. RED、失败、诊断与修正

1. 分页专项首次 RED 因 `history-reconciliation` 模块不存在而失败；实现后 500/501/538/1000/1001 cursor 与非法页测试转绿。
2. generation/候选提交 RED 首次因 `HistoryLoadOwnership` 和 `canCommitCompleteHistory` 不存在而失败；实现后旧 generation、短候选和冲突前缀均被拒绝。
3. App 集成后首次 typecheck 发现单元 fixture 使用宽类型 parser；改用 `DurableAgentEventSchema` 后通过，未放宽 Production 类型。
4. HTTP fixture 最初连续追加 `assistant.message`，Route 的 Agent 历史验证正确返回 `assistant_message_without_completion`；改用合法 run/user/compaction 序列后通过。
5. 大历史 E2E fixture 初版虽过 Event Schema，但压缩范围不满足 Context projector，后续 run 正确以 `AGENT_CONTEXT_FAILED` 收口；改为多段完整 run 和单调有效压缩区间后，新 run 正常 completed。
6. E2E 首次通过业务行为后，重复的“任务运行完成”触发 Playwright strict locator；定位改为最新终态，不减少事件或放宽业务断言。
7. 首次 lint 发现移除旧分页循环后残留未使用的 `mergeAgentEvents` import；精确删除后 lint 0 warning。
8. 首次沙箱内 `pnpm test` 为 966/991：23 项因 loopback/Unix socket `EPERM`，本阶段另有公共 barrel export 变化和重型 HTTP 测试 5 秒超时。helper 改为模块内直接导入、HTTP 用例单独设置 15 秒上限；在允许本地监听环境完整重跑为 991/991。
9. Webpack 首次构建因沙箱 DNS 无法访问 Google Fonts 失败；放行构建所需网络后成功。没有把远程字体失败伪写为通过。
10. Next 双构建自动向 `tsconfig.json` 追加阶段 23 隔离目录；只删除四条本阶段机械路径，并精确删除 `.next-stage23-webpack`、`.next-stage23-turbopack`，保留进入本阶段前已有的格式与 `.next-e2e` 路径。

没有删除、skip 或 only 测试，没有提高 page limit、改变 `lastSeq` 语义、降低 coverage 或隐藏错误来制造通过。

## 7. 验证结果

| 门禁 | 最终结果 |
| --- | --- |
| Client/Server 专项 | 6 files / 59 tests，通过 |
| 长历史专项 E2E | 6/6，通过；workers=1，retries=0 |
| 邻接 E2E | 28/28，通过 |
| `pnpm lint` | exit 0，0 warnings / 0 errors |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 117 files / 991 tests，通过 |
| `pnpm test:coverage` | 117 files / 991 tests，通过 |
| Statements | 88.45% |
| Branches | 82.67% |
| Functions | 91.03% |
| Lines | 90.22% |
| `pnpm test:e2e` | 47/47，通过；workers=1，retries=0 |
| Webpack build | Next.js 16.3.3，隔离 dist，通过 |
| Turbopack build | Next.js 16.3.3，隔离 dist，通过；保留既有动态文件系统 trace warning |
| `git diff --check` | exit 0 |
| 最终 lint/typecheck | 双构建清理后再次通过 |

Turbopack 对 `lib/storage/file-safety.ts` 动态路径给出“tracing whole project”警告；该文件与行为不在阶段 23 白名单，构建仍成功，本阶段未越界修改。

## 8. 修复后三段信号

合成 538 条回归对应原真实信号：

```text
首次完整恢复：durable=538，cursor=[0,500]，status=failed，terminal=run.failed
延迟协调第二页：旧 failed 尾部仍可见，新 run completed 实时终态仍可见，无 transcript 回退
协调完成：新 completed 终态只出现一次，旧 run 尾部保留，详情=status completed
```

本阶段没有重新读取、写入或修正真实 Session；真实 538 条证据仍只保留已批准 Spec 中的脱敏计数和状态。

## 9. 安全与范围审计

- 所有大历史均创建在 Playwright 自动生成的临时 data root 和 workspace，结束后由既有 E2E 环境精确清理。
- 未直接写 JSONL，所有事件经 JsonlEventStore 与 Event Schema 验证。
- 未读取或输出 `.env.local`、API Key、Authorization、provider body、真实工具参数或 private reasoning。
- 单元测试中的 secret/path/reasoning 哨兵只用于断言异常映射不会泄漏；浏览器、Summary 与 Production 错误不含哨兵值。
- 未修改真实 `.secode-data`、真实用户工作区或真实 Session；未运行真实 LongCat。
- T23-09 只运行一次真实 `deepseek-v4-flash`，使用进程环境覆盖模型名；没有读取、打印、复制或修改 `.env.local` 中的凭据。
- 未安装/升级依赖，未修改 package/lock，未 commit、push、发布或部署。
- dirty worktree 中阶段 13～22 和用户既有改动全部保留；未 reset、stash、checkout 或清理无关文件。

## 10. 与 Spec/Task 的偏差

公共语义、Production 范围和验收结论无偏差。有两项测试实现上的解释：

- orphan open run 在 Store inspection 时确实位于 `openRunIds`；通过 HTTP 首次恢复时，冻结的 Agent recovery 契约会追加 `run.interrupted`。因此浏览器矩阵验证“open 被识别并确定性恢复为 interrupted”，而不是要求刷新后的 orphan 永久显示 executing。真实 active open/run transport 继续由既有 E2E 覆盖。
- HTTP 契约最终日志尾为 502 而非构造前的 501，因为 `readEvents()` 按既有语义先恢复 open run 并追加 interrupted；关键断言仍是第一页页尾 500 小于日志级稳定尾 502，服务端无需修改。

这两项都遵守 Task 冻结的 Agent Runtime、Server 和 Store 行为，没有通过跨层改动适配测试。

## 11. 已知限制与剩余风险

- 完整候选在恢复期间与可见 ready ledger 同时驻留内存；这是原子可见性的预期成本，当前 1001 条浏览器回归通过，但尚未针对十万级事件做性能设计。
- 分页期间日志稳定尾变化会使候选有限失败并保留旧 ready ledger；当前不自动无限重试，用户可重试或由下一次明确协调恢复。
- `canCommitCompleteHistory()` 对当前前缀做逐事件 JSON 等价比较，优先正确性；若未来 Session 规模显著增加，可在不改变事实语义的独立阶段评估更高效的既有 ID/seq 索引。
- Turbopack 的动态文件系统 trace warning 属于既有 Storage 部署形态，不影响本地单用户运行，但若未来发布到受大小限制的平台需独立处理。

## 12. 反思与下一阶段影响

- 这次缺陷不是 Store 错误，而是跨层把“日志稳定尾”和“分页页尾”混为一谈；后续消费分页接口时应同时测试服务端正确契约与客户端 cursor 行为。
- 历史恢复不能逐页成为可见事实。候选构建、完整性校验、提交所有权和前缀覆盖应作为同一个协调单元测试。
- 仅通过 Event Schema 的 fixture 不一定满足 Agent/Context 语义；大历史 fixture 必须同时经过真实 Route、Context 和后续 run，才能避免浅层假绿。
- 原文档、视频与最终提交顺延为阶段 25。阶段 24 只处理完成证据纠正与失败终态呈现，仍需依次通过 Spec、Task 和 Summary 门禁。

## 13. T23-09 DeepSeek 全真浏览器验收

### 13.1 环境与入口

- 使用新建临时 dataDir、受限 picker root 和 `slug-project`，没有复用真实 `.secode-data` 或真实用户项目。
- fixture 为无外部依赖的 ESM 项目；初始 `node --test` 为 4 项中 2 项通过、2 项失败。
- 本地 Next.js 16.3.3 只绑定 loopback 端口；公开模型下拉明确显示 `DeepSeek · deepseek-v4-flash`。
- `agent-browser` 按 open → snapshot → interact → re-snapshot 操作。首次以 `127.0.0.1` 进入时 workspace mutation 被 Origin guard 403 拒绝；改用同一服务的 `localhost` 标准同源地址后成功，没有修改安全实现或关闭 guard。

### 13.2 真实 Agent 结果

Agent 完成了真实链路：

```text
读取 README / 实现 / 测试
  → 首次 list_directory 缺少 path，TOOL_ARGUMENTS_INVALID
  → 自主修正参数并补读根目录与 package.json
  → 只修改 src/slug.mjs
  → 运行 npm test
  → 中文最终总结
  → run.completed
```

隔离 JSONL 的脱敏事实：

| 事实 | 结果 |
| --- | --- |
| durable events | 42，最后 seq 42 |
| 模型请求 / 完成 | 5 / 5 |
| 工具请求 / 结果 | 8 / 8 |
| assistant messages | 5 |
| 失败工具 | 1 次 `list_directory / TOOL_ARGUMENTS_INVALID`，后续自主恢复 |
| 终态 | `run.completed` |
| 详情模型请求 | 5 |
| 详情工具调用 | 8 / 300 |
| 当前 run Token | 输入 20,431；输出 920；总计 21,351 |
| Provider cache | 命中 14,336；未命中 6,095；命中率 70.2% |
| Local Context Cache | cold/warm/invalidated = 1/4/0；命中率 80.0% |

实际实现变为 `value.trim().toLowerCase().replace(/\s+/g, "-")`。独立重跑 `node --test tests/*.test.mjs` 为 4/4 通过；测试文件保持原断言，未安装依赖、未提交 Git。

### 13.3 UI、终态与刷新恢复

- 实时页面最终显示“已完成”和“任务运行完成”，详情为 `status=completed`、phase normal、待审批均为 0。
- 流结束后用未提交草稿确认 composer 已解锁，随后清除草稿，没有发起第二次模型调用。
- 重新打开稳定 Session URL 后，5 次模型请求、工具卡片、最终中文正文和 `run.completed` 全部恢复；页面头部仍为“已完成”，详情仍为 `completed`，没有 transcript 回退或永久伪 `executing`。
- 保存了一张不含凭据的完成状态截图至系统临时目录；`agent-browser` Session、本地 Next 服务、隔离 dataDir/workspace 和阶段专用 `.next` 均已关闭或精确清理，Next 自动追加的两条阶段类型路径已从 `tsconfig.json` 精确移除。

### 13.4 如实记录的模型质量问题

- 最终总结称初始“4 个测试中 3 个失败”，实际预先运行的基线是 2 个失败；这是模型自然语言计数误差。
- 模型给出的最终 4/4、退出码 0、修改文件和实现内容均与独立核对一致，因此不影响本次系统链路验收，但最终文档不采信错误的初始失败数。

## 14. Summary 内部门禁

- [x] Spec 和 Task 均有明确用户批准记录。
- [x] T23-00～T23-09 全部完成。
- [x] 实现符合批准的 Production/测试白名单和冻结契约。
- [x] 最小验证、专项、邻接和全量门禁全部通过。
- [x] RED、失败、根因、修正和完整重跑均如实记录。
- [x] 无新秘密、越界写入、真实数据修改或未说明风险。
- [x] 反思、已知限制和阶段 24 影响已记录。
- [x] 开发索引已更新为“Summary 已批准，阶段完成”。

**审批记录：用户于 2026-08-30 回复“通过并同意”，阶段 23 Summary 已批准，阶段正式完成。阶段 24 仅获准进入只读观察和 Spec 编写；阶段 24 Spec 获批前不得编写 Task 或修改业务代码。**
