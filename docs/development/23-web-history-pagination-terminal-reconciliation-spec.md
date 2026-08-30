# 阶段 23 Spec：Web 长历史分页与终态协调修复

## 1. 文档状态与审批门禁

- 当前状态：`已批准`。
- 立项记录：用户于 2026-08-30 报告 20:03:54～20:21:24 真实 Agent 运行中出现对话停止更新、详情长期显示 `executing`，以及多次失败后 transcript 突然回退；只读诊断完成后，用户明确同意另开修复阶段并将最终交付顺延。
- 本次同意只授权生成本 Spec 和同步阶段索引，不等价于批准本 Spec。
- Spec 获批前不得生成阶段 23 Task，不得修改产品代码、测试、配置或真实 Session。
- 原“文档、视频与最终提交”顺延为阶段 24；阶段 19～22 的失败事实、未生成 Summary 与既有门禁状态均不追认、不覆盖。

## 2. 阶段目标与需求映射

本阶段修复 Web 工作台在 Session durable 事件超过单页上限时的历史恢复缺页、可见 transcript 回退和终态投影错误，使 JSONL 中已经存在的 `run.completed`、`run.failed`、`run.cancelled` 或 `run.interrupted` 能在流结束协调、刷新和后续 run 后稳定呈现。

| 需求 ID | 本阶段解释 |
| --- | --- |
| FR-005 | 用户看到的模型消息、工具、错误与运行状态必须覆盖完整 durable 历史，不能因分页跳过尾部。 |
| FR-008 | 页面刷新、流结束协调和服务重启后的 Session 恢复必须读取全部连续事件。 |
| NFR-007 | 中文工作台在长任务和桌面演示中不能出现大段 transcript 回退或永久伪 `executing`。 |
| NFR-008 | 真实缺陷、修复边界和超过 500 条事件的验证证据必须进入阶段文档。 |
| NFR-011 | Web 对 run 阶段、状态和终态的投影必须与核心 durable 事件一致。 |
| SEC-006 | 回归 fixture、错误和 UI 不得暴露 `.env.local`、API Key 或 provider 私有内容。 |

本阶段不新增需求 ID，不改变上述已批准需求的含义。

## 3. 只读观察与可重复事实

### 3.1 观察范围

- `docs/development/00-process.md`、`README.md` 与阶段 08、14、15、20、22 的最新文档。
- `.secode-data/sessions/82b8d34a-2d3a-41dc-b47b-44492ab00abf/events.jsonl` 的脱敏事件元数据，仅检查 seq、时间、类型、runId、有限错误码和正文长度；未读取或记录凭据。
- `app/ui/shell/app-shell-provider.tsx`、`lib/client/event-state.ts`、`lib/client/transcript.ts`、events Route Handler、JSONL store 和 Context Provider 的分页实现与测试。
- Next.js 16.3.3 本地 Route Handler 文档，确认当前 GET events 路由按请求执行且问题不来自 Route Handler 缓存。

### 3.2 真实 Session 时间线

- Session 于 `2026-08-30T12:03:54.662Z`（Asia/Shanghai 20:03:54）创建。
- 目标 run `14e21d92-82d7-49d2-8aa4-c370efc08dff` 于 20:03:55 开始，共写入 537 条 run-scoped durable 事件。
- 用户观察到停止更新的 20:21:24 对应 seq 490～494；核心随后仍持续写入 seq 495～538。
- run 于 20:21:47 以 `run.failed / AGENT_COMPLETION_EVIDENCE_MISSING` 持久化收口，并非 Runtime 永久卡在 executing。
- 该 run 包含 73 次 `model.requested/model.completed`、95 次 `tool.requested/tool.result` 和 70 条 `assistant.message`；这些规模使 Session 首次跨过默认 500 条事件页边界。

### 3.3 确定性回放信号

使用同一真实 JSONL 只回放事件结构，得到：

```text
完整 seq 1–538：durable=538，transcript items=244，status=failed，terminal=run.failed
仅 seq 1–500：durable=500，transcript items=224，status=running，terminal=none
恢复 seq 1–538：durable=538，transcript items=244，status=failed，terminal=run.failed
```

该信号同时复现用户报告的两个表象：从完整实时 ledger 切换到第一页会让 transcript 减少 20 项；第一页缺少 seq 501～538 的终态，因此详情重新投影为运行中。

### 3.4 已确认根因

阶段 08 冻结的 `EventPage.lastSeq` 是“整个日志的最后稳定序号”，不是当前页最后事件的 seq。Store 和既有测试正确保持该语义；Context Provider 也使用 `page.events.at(-1).seq` 推进页游标。

Web `loadHistory()` 当前在 `hasMore=true` 时执行 `after = page.lastSeq`。当第一页返回 events 1～500、`lastSeq=538`、`hasMore=true` 时，下一请求错误地使用 `after=538`，永久跳过 501～538。流结束后的 `finally` 又从空 ledger 重载并逐页发布，因此先把完整实时视图替换成不完整第一页。后续 run 可以通过实时流追加更大 seq，但每次终态协调都会再次发生相同回退和缺页。

### 3.5 测试缺口

- Store 测试明确覆盖“当前页 `[1,2]`、日志级 `lastSeq=3`”，证明存储契约没有漂移。
- Client ledger 测试覆盖 seq 去重、冲突和倒退，但不驱动 `loadHistory()` 的多页循环。
- 现有 E2E Session 历史均未超过默认 500 条，未覆盖“日志级尾序号大于当前页尾序号”的正确 cursor。
- 相关现有最小测试共 19 项通过；通过结果不能反证这个跨层缺口。

## 4. 范围

### 4.1 范围内

1. 修正 Web 历史分页 cursor，使其只由当前非空页最后一条 event 的 `seq` 推进。
2. 在同一次恢复中冻结并校验日志级稳定 `lastSeq`、事件连续性、页进展、Session 一致性和 recovery 状态。
3. 将多页历史构建为候选 ledger；完整读取并验证成功前，不得用不完整页覆盖当前可见 ledger。
4. 首次进入 Session 时可以显示有限 loading 状态；不得把尚未完整恢复的第一页冒充 ready 历史。
5. 同一 Session 的重复/并发恢复必须 single-flight、generation token 或等价受控；abort、陈旧响应和旧 Session 请求不得覆盖更新 ledger。
6. 流结束后的协调必须保留已经看到的完整视图，候选历史确认覆盖相同或更高连续 durable seq 后才能原子替换。
7. 对超过 500 条和超过 1000 条事件的 completed/failed/cancelled/interrupted、刷新、流结束协调与后续 run 建立确定性回归。
8. 保持 transcript、详情抽屉、composer 可继续状态与 durable 最新 run 一致。

### 4.2 范围外

- 不改变 `EventPage.lastSeq`、`hasMore`、`recovery`、events API、JSONL 格式或默认/最大 page limit。
- 不修改 Agent Runtime、Model、Context、Terminal、工具、审批、完成证据、语言门、Token 或 cache 算法。
- 不增加数据库、索引文件、WebSocket、SSE 重连协议、后台轮询服务或第二事实源。
- 不修正该真实 run 的 `AGENT_COMPLETION_EVIDENCE_MISSING`、工具失败或模型行为；它们是 durable 业务事实，不是本次 UI 截断根因。
- 不修改真实 Session、真实用户工作区或 `.env.local`，不再次运行真实 LongCat。
- 不安装/升级依赖，不 commit/push，不发布部署，不进入阶段 24 最终交付。

## 5. 设计规格

### 5.1 分页契约

每次历史恢复维护两个不同概念，不得混用：

- `stableLastSeq`：首次页响应中的日志级 `page.lastSeq`，用于验证本次快照最终应到达的稳定尾部。
- `afterSeq`：已经并入候选 ledger 的最后一条 event seq，用于请求下一页。

固定循环：

```text
afterSeq = 0
candidate = empty ledger
stableLastSeq = undefined

读取 page(afterSeq)
  → 校验 Session、durable、连续 seq、recovery
  → 首页冻结 stableLastSeq；后续页要求 page.lastSeq 相同
  → 将 page.events 合入 candidate
  → hasMore=false 时要求 candidate 最后 seq == stableLastSeq，然后提交
  → hasMore=true 时要求 page.events 非空且页尾 seq > afterSeq
  → afterSeq = page.events.at(-1).seq
```

不得再用日志级 `page.lastSeq` 直接推进 `afterSeq`。若分页期间日志尾部变化、seq 不连续、空页却声明 hasMore、recovery 不一致或候选尾部未到达稳定尾部，本次候选不得提交；错误保持有限、中文、可重试。

### 5.2 原子可见协调

1. 恢复过程只更新内部候选 ledger 和有限 loading/error 状态，不逐页替换 ready transcript。
2. 已有 ready ledger 时继续显示它；成功候选必须包含相同 Session 的连续 durable 前缀，且不能比当前可见 durable seq 更旧。
3. 完整候选一次提交后，transcript、run projection 和 Session observability 同步切换，不能出现 transcript 已回退而详情仍使用另一份状态。
4. 初次加载没有旧 ledger 时，在完整候选提交前显示“正在从本地事件恢复历史”，不显示不完整 transcript。
5. live `assistant.delta` 仍不进入 JSONL 恢复；durable authoritative message/terminal 到达后既有清理规则不变。

### 5.3 并发、取消与陈旧响应

- 同一 Session 同时只能有一个拥有提交权的历史恢复；重复调用可复用同一 promise 或使旧 generation 失去提交权。
- 路由切换、组件卸载和 AbortSignal 取消后不得提交 loading、ready 或 error 到新 Session。
- 流终态 `finally` 发起的显式协调与 Session 页面 effect 不得互相启动无限重复恢复。
- 旧候选完成晚于新候选时不得覆盖更高 durable seq，也不得把 `failed/completed` 降回 `running/executing`。
- 现有 active run 导航保护、submission lock 和取消行为保持不变。

### 5.4 错误与恢复体验

- 网络、协议或分页完整性失败时保留最后一个已验证 ready ledger；若没有 ready ledger，再显示历史恢复错误。
- 错误应允许用户重试，但一次点击只创建一个有提交权的恢复。
- `runTransport` 的流错误与 durable run 终态是不同事实；详情状态由最新完整 durable ledger 投影，composer 可用性继续结合 transport 与 run projection，不能用缺页推测执行中。
- 不把未知终态伪造成成功；也不因单页缺失长期展示伪 executing。

## 6. 兼容性与安全边界

1. JSONL 是唯一 durable 真相源；不迁移、不截断、不改写既有 Session。
2. events Route Handler 保持 Node.js Runtime、`no-store` 和现有 Zod 响应 Schema。
3. `lastSeq` 的日志级语义保持向后兼容；Context Provider、append seq 分配和 recovery 不因 Web 修复变化。
4. 候选 ledger 只含现有公开 AgentEvent；不得缓存 API Key、provider body、私有 reasoning、审批能力或工具执行句柄。
5. 测试使用合成事件和临时数据目录，不复制真实用户消息、工具参数、绝对工作区路径或 `.env.local`。
6. 不削弱 Session 删除、工作区隔离、危险审批、Plan Mode 只读、取消或进程清理边界。

## 7. 验收标准

| ID | 验收标准 |
| --- | --- |
| AC23-01 | events 第一页为 seq 1～500、日志级 `lastSeq=538`、`hasMore=true` 时，Web 下一页请求使用 `after=500`，最终连续取得 1～538；不得请求 `after=538` 来跳页。 |
| AC23-02 | 超过 500 条的 failed run 在刷新和流结束协调后稳定显示 `run.failed`，详情不再停留 `running/executing`，错误码与终态 transcript 可见。 |
| AC23-03 | 已显示完整实时 ledger 时，多页恢复期间 transcript 项数和可见 durable seq 不下降；候选完整后原子协调，不出现第一页回退。 |
| AC23-04 | 超过 1000 条、恰好 500/1000 条、末页 1 条、空错误页、hasMore 无进展、seq 间隙和日志尾部变化均有确定结果；合法历史完整恢复，非法候选不提交。 |
| AC23-05 | completed、failed、cancelled、interrupted 四类终态以及没有终态的真实 open run 均按 durable 事实投影，不把 open 伪终止，也不把 terminal 降回 executing。 |
| AC23-06 | 同 Session 并发恢复、流 `finally` 与页面 effect 重叠、路由切换、AbortSignal 和晚到旧响应不会覆盖更新 ledger、进入恢复循环或留下永久 loading。 |
| AC23-07 | 网络/Schema/完整性失败保留最后一个已验证 ledger；无旧历史时显示有限可重试错误，重试成功后恢复完整 transcript。 |
| AC23-08 | 后续 run 从正确历史尾部继续，旧 run 尾部和 Session usage/context/cache 投影不丢失，新终态只出现一次。 |
| AC23-09 | events API、Store `lastSeq` 语义、JSONL 字节、Agent/Model/Context/Terminal/工具/审批行为和 package/lock 保持不变。 |
| AC23-10 | Client 单元、Server 契约、合成大历史 E2E、既有 E2E、lint、typecheck、全量 test、coverage、webpack/Turbopack build 与 `git diff --check` 按 Task 如实执行并记录。 |

## 8. 测试策略

### 8.1 RED 与最小正确 seam

Task 必须先建立能稳定复现本次真实模式的 RED，而不是只测试 `mergeAgentEvent()`：

1. 构造 538 条连续 durable 事件，第一页返回 500 条但 `lastSeq=538`，捕获后续 `getEvents` 的 after 参数。
2. 从“当前完整 failed ledger”触发协调，断言任何中间可见状态都不减少 durable 数量或丢失 terminal。
3. 构造两个可控 promise 反转完成顺序，证明旧恢复不能覆盖新 ledger。
4. E2E 在临时 Session 中生成超过 500 条合成公开事件，刷新 `/sessions/[id]` 后断言终态、最后消息、工具事实和详情一致。

若当前 App Shell 内嵌实现无法在不伪造 React 行为的 seam 测试，应在 Task 中把纯分页/协调状态机提取为 Client 内部模块；不得因此改公共 API或建立第二事实源。

### 8.2 回归矩阵

- 页边界：499、500、501、999、1000、1001、538。
- 终态：completed、failed、cancelled、interrupted、open。
- 入口：首次访问、刷新、流正常结束、流提前结束后的 durable 协调、后续 run。
- 竞态：重复 load、effect + finally、abort、路由切换、旧慢请求晚到。
- 展示：transcript 数量/顺序、详情状态、composer、usage/context/cache 累计、无历史动画。
- 安全：fixture 与错误中注入 secret/path/reasoning 哨兵，浏览器、测试输出和持久文档不可见。

### 8.3 完整门禁

具体命令、顺序、超时和允许文件由获批后的 Task 冻结。至少包括专项 Client/E2E、全量既有测试、coverage、lint、typecheck、webpack build、Turbopack build 与 `git diff --check`。不得用 skip/only、缩小断言、提高 page limit 或修改 Store 契约掩盖问题。

本阶段修复的是确定性客户端恢复逻辑，不要求再次消耗真实模型；若 Task 认为必须运行真实 LongCat，需在自动门禁后另行说明新增价值并取得独立用户授权。

## 9. 风险与选定决策

| 风险/决策 | 选定边界 |
| --- | --- |
| 直接把 Store `lastSeq` 改成页尾可快速让 Web 工作 | 禁止；这会破坏阶段 08 契约、append/recovery/Context 语义。只修复错误消费者。 |
| 多页完成前不展示第一页可能增加首次加载等待 | 接受有限 loading，以完整且不倒退的历史优先；已有 ready ledger 始终保留。 |
| 分页期间日志继续追加 | 当前 active run 使用 NDJSON，历史加载受运行/导航门保护；若仍检测到尾部变化，候选失败或受控重试，绝不混合快照。 |
| 原子候选会暂时持有两份 ledger | 首版 Session 事件本就由 Client 投影；Task 应避免额外深拷贝和无限缓存，但不能用逐页可见回退换内存。 |
| 真实 Session 含用户内容 | 只保留脱敏元数据和数值证据；正式测试使用合成 fixture。 |
| 阶段 22 未成功收口即进入阶段 23 | 这是用户针对 T22-09 后新发现 Web 跨层缺口的明确流程重定向；阶段 22 保留失败事实和无 Summary 状态。 |

## 10. Spec 审批门禁

**当前状态：已批准。**

- 审批记录：用户于 2026-08-30 在收到本 Spec、范围、根因和停止点后回复“批准”，语义等价于“阶段 23 Spec 通过”。
- 本次批准只解锁 `23-web-history-pagination-terminal-reconciliation-tasks.md` 的编写，不构成 Task 批准或开发授权。
- Task 再次获批前，不得修改 `app/ui/**`、`lib/client/**`、测试或其他产品文件。
- Task 编写完成后必须再次停止等待审批；Task 获批后才能按 TDD 实施。
- 自动验证完成后生成 Summary 并再次等待批准；阶段 23 Summary 获批前不得进入阶段 24。
