# 阶段 26 Spec：Agent 测试、验收与启动收敛效率

## 1. 状态与审批门禁

- 当前状态：`修订 2 已批准`。
- 观察日期：2026-08-31（北京时间）。
- 立项授权：用户检查最新真实 Agent run 后指出，主题功能约 25 次模型调用内已经完成，但随后 38 次模型调用仍未完成测试、验收和启动，效率过低，并明确允许新开阶段定位和修复。
- 阶段 25 v2 的自动实施记录继续保留；最新真实回归失败，不生成或批准成功 Summary。未获审批的阶段 25 v3 草案已整体并入本阶段，不再形成并行待审门禁。
- 本 Spec 只授权只读诊断、规格编写和索引同步；用户批准 Spec 后只解锁 Task 编写，不直接授权代码、测试、真实 provider、Git 写入、发布或部署。
- 原审批记录：用户于 2026-08-31 回复“批准”，原 Spec 获批并完成原 Task 实施；该审批已被同日最新真实运行与用户明确“回退”取代。
- 回退记录：用户检查 Session `ffe26448-2883-48a6-9bc3-5429852e6bb0` / run `942835ca-be49-42f7-b168-f6dfe0b64ac8` 后，明确指出 Agent 防御性编程过重、普通项目应在约 25～30 次模型调用内完成编码、简单测试和启动，并认为“变更后缺少完成证据”不应频繁把 run 截断；随后明确回复“回退”。原 Task 审批因此失效，原 Summary 不再等待成功审批。
- 原“文档、视频与最终提交”顺延为阶段 27。

审批链：

```text
阶段 25 真实回归失败（历史事实保留）
  → 阶段 26 只读诊断（已完成）
  → 本 Spec 修订 2（已批准）
  → Task 修订 2（待用户独立审批）
  → 比例化实施与自动验证
  → 真实 provider + agent-browser（仍需独立授权）
  → Summary 修订 2（重新实施后才可生成与独立审批）
  → 阶段 27 最终交付
```

## 2. 目标

本阶段不是简单提高模型请求上限，也不是在超时前更早失败，而是让 Agent 在主体实现完成后快速、可解释地收敛：尽早暴露依赖和类型问题，只修复直接原因，复用已经成功的验证与 service 事实，并在满足完成条件后立即给出最终交付。

完成后应满足：

1. 功能/缺陷任务从首个最小 RED 开始，而不是先批量写完 Production 再统一测试。
2. 独立的安装、测试、类型检查和构建能在一次模型响应中成组发出；存在依赖或失败时仍按顺序局部修复。
3. 已成功的 lint/typecheck/test/build、smoke 脚本和 service readiness 形成有限 run-local 收敛视图，模型无需重复检查。
4. `.gitignore`、项目根协调 metadata 和已实际执行的 smoke/check 脚本不会让完成证据门误拒绝。
5. 生成项目不会继承值为 3000 的 `PORT`/`SERVER_PORT`；服务绑定参数与 readiness URL 一致。
6. 最后一个必要验证和全部 service readiness 成功后，下一次模型响应应直接 final，不再追加目录盘点、重复 HTTP 健康检查或“最终确认”。
7. 对同等空工作区前后端任务，自动轨迹和真实 provider 轨迹的收敛请求数显著下降，并有明确上限与失败记录。

## 3. 真实运行事实

### 3.1 观察对象

```text
.secode-data/sessions/e804e0e7-43ec-4c84-96b5-6fbd0c3fc21a/events.jsonl
runId: ab562cd1-c1a4-496b-9cb0-86e7c1cf92b6
时间: 2026-08-31T06:09:14.104Z ～ 06:17:05.717Z
```

观察未读取 `.env.local`、API Key、provider 私有 body 或模型私有推理。

| 指标 | 结果 |
| --- | ---: |
| 总模型请求 | 63 |
| 总工具请求 / 失败 | 73 / 8 |
| 写入或替换 | 38 |
| `run_process` | 27 |
| 危险审批 | 19 |
| service 尝试 / 成功 | 5 / 2 |
| Context 压缩 | 1 |
| 最终 assistant 消息 | 0 |
| 终态 | `AGENT_COMPLETION_EVIDENCE_MISSING` |

### 3.2 调用阶段拆账

| 模型请求 | 阶段 | 事实 | 结论 |
| --- | --- | --- | --- |
| 1～3 | 观察与 Plan | 两次目录观察、一次计划 | 基本必要。 |
| 4～20 | 主体生成 | 目录、后端、前端、根配置共 33 次工具请求；用户可见主体基本就位 | 17 次模型调用完成主要功能，但 Production 早于有效 RED。 |
| 21～28 | 后端依赖换轨 | `better-sqlite3` 安装失败，改写为 `sql.js`，清理后重装 | 8 次；计划已预见原生模块风险却仍选择高风险首选，且测试仍未先行。 |
| 29～32 | 后端验证修复 | typecheck 成功；test 暴露 delete 缺陷；修复后 GREEN | 4 次，属于必要收敛，但发生过晚。 |
| 33～42 | 前端安装与类型修复 | 安装、typecheck 失败、两次局部修复、补类型依赖、typecheck/build 成功 | 10 次；批量 Production 后才第一次类型检查，扩大了修复链。 |
| 43～50 | 后端启动与 API smoke | 继承 `PORT=3000` 失败；改端口、重建、启动；smoke 父目录失败后补建并执行 | 8 次；端口和目录依赖各产生可预防往返。 |
| 51～54 | 前端 service | 两次 readiness 超时，第三种启动形状成功 | 4 次模型请求、约 122 秒等待；启动参数与 readiness host 未一次对齐。 |
| 55～60 | 重复验收与收尾 | 代理 health、tasks、HTML、目录盘点、三 URL 总检查、README | 6 次；API smoke 和 readiness 已提供大部分事实，存在重复确认。 |
| 61～63 | 完成门纠正 | 两次 stop 被相同 uncovered paths 拒绝，第三次结构化失败 | 3 次纯浪费；最终还清理了已 ready 服务。 |

以用户指出的第 25 次模型调用为分界，后续确有 38 次模型请求。即使把首次安装、server/client 验证、两项 service 和一次 API 行为验收视为必要，依赖换轨、晚验证修复、启动参数试错、重复 HTTP/目录确认及完成门误拒仍占据主要收敛成本。

### 3.3 确定性反馈环

使用当前 `completion-evidence.ts` 回放以下关键事实：

```text
write server Production
write client Production
write root package.json
write .gitignore
server npm test 成功
client npm run build 成功
write scripts/smoke-api.js
node scripts/smoke-api.js 成功
```

当前稳定得到：

```json
{
  "pending": true,
  "paths": [
    "task-board/.gitignore",
    "task-board/package.json",
    "task-board/scripts/smoke-api.js"
  ]
}
```

该回放是阶段 26 的首个 RED。另以冻结 fake-model 轨迹统计“首个认可 validator 到 run 终态”的模型请求数，作为效率反馈环；不得只用总墙钟，因为安装网络和 service timeout 会掩盖模型往返问题。

## 4. 根因

### 4.1 流程根因：验证被推迟到批量 Production 之后

System Prompt V11 的 TDD 规则位于执行可靠性第 8 条，Planning policy 又没有把 RED 顺序写成计划的硬检查点。真实计划虽提到“最小测试”，执行仍先完成全部后端和前端源文件。结果是：

- 原生依赖兼容问题直到第 21 次请求才暴露；
- 后端行为缺陷直到第 30 次请求才暴露；
- 前端类型错误直到第 34 次请求才暴露；
- 每个失败都发生在大批改动之后，需要更多读取、替换和重跑。

### 4.2 状态根因：Runtime 只在 final 时暴露未覆盖路径

Runtime 已保存 validation facts，但模型在常规收敛过程中只看到已成功事实，没有一个同时包含“仍缺哪些范围、哪些事实可复用、哪些 service 已 ready”的有限视图。Agent 因此自行追加 HTTP、目录和总健康检查；直到第一次 stop 才收到 uncovered paths，时机过晚。

### 4.3 证据根因：路径覆盖模型过窄

- validator 只覆盖其 `cwd` 自身及后代；server/client 均通过后，根聚合 `package.json` 仍悬空。
- `.gitignore` 被当成代码或配置变更。
- 成功直接执行的、刚写入的 `smoke-api.js` 被当成未知 Node 脚本。
- correction 虽列出路径，却不能表达“所有子项目已经验证，只有协调 metadata 的归并规则错误”。

### 4.4 启动根因：端口和 service 参数契约不够具体

- “最终端口不得为 3000”没有说明宿主 `PORT=3000`/`SERVER_PORT=3000` 必须被拒绝或覆盖。
- Vite 第一次只监听 `localhost`，readiness 固定探测 `127.0.0.1`；第二次命令参数形状错误；第三次显式 host/port 才成功。
- ready service facts 没有在后续请求中明确告诉模型“无需再次健康检查，直接用于 final”。

### 4.5 选择与批处理根因

- 计划已识别 `better-sqlite3` 在当前 Node 版本可能编译失败，却仍把它作为轻量任务首选，产生一次完整依赖换轨。
- 初始生成能在同一模型响应中发出 2～4 个独立写调用；进入验证后却几乎每个命令消耗一次模型请求。Prompt 没有明确要求把相互独立、失败互不影响的 validator 放入同一响应，也没有明确禁止成功事实后的重复检查。

## 5. 选定设计

### 5.1 前置最小 RED 与计划顺序

1. Planning phase 必须把每个行为垂直切片写成“最小 test → 运行并确认目标缺失 → 最小 Production → 重跑同一 test”；不得把“实现后端 + 最小测试”写成无顺序合并项。
2. Executing phase 的首条规则重复上述顺序；空项目只允许先建立最小包清单、测试入口和必要父目录。
3. 纯文档、样式、静态资源和无行为配置不强制 RED；不得新增启发式 Runtime 写拦截或自然语言评分器，以免误拒合法任务。
4. 轻量任务若候选依赖含原生 addon 且已有满足需求的纯 JS/WASM 方案，优先低安装风险方案；若必须使用原生 addon，先用最小安装/导入检查暴露兼容性，再写依赖它的主体实现。

### 5.2 run-local 收敛视图

在既有 `CompletionEvidenceState` 与 `ServiceHandoffState` 之上生成一个只读、有限、run-local 的收敛视图，不新增 durable 事件类型或第二事实源：

```ts
interface ConvergenceView {
  pendingScopes: string[];
  pendingPaths: string[];
  validEvidence: Array<{ kind: VerificationKind; cwd: string; seq: number }>;
  readyUrls: string[];
  lastServiceFailure?: { code: string; cwd: string };
}
```

约束：

- 路径、数组和字节数沿用完成证据的有界/脱敏规则；不包含 stdout、PID、绝对路径、环境、secret 或命令私有参数。
- 视图只在状态变化后注入下一次模型请求；相同状态不重复追加新文本，避免扩大 Context 与缓存 miss。
- 有 pending scope 时给出最近可执行验证范围；全部覆盖且 service ready 时明确“直接 final，复用现有事实，不再目录盘点或健康检查”。
- service 失败只给结构化 code/cwd 和上次 readiness URL；要求下一次尝试针对原因改变 host、port 或命令形状中的一个，不进行无变化重试。

### 5.3 完成证据有限收敛

1. `.gitignore` 等纯忽略清单不触发代码完成门；不扩大到 `package.json`、构建配置或源代码。
2. 只对本 run 待验证、名称明确含 `test/spec/check/verify/smoke` 的相对脚本，在成功 oneshot 直接执行后标记脚本自身为 `test` 覆盖；不信任 stdout 的 PASS 文本，不把普通 `node server.js`、HTTP 200 或 readiness 当 test。
3. 根协调 metadata 只在其下所有仍相关、已修改的 Production 子范围分别取得认可 validator 后收敛。server test 不得覆盖尚未验证的 client Production；移除任一子范围验证必须恢复失败。
4. 最后 mutation、validator 或 service 改变状态后刷新收敛视图；相同成功 validator 未被相关 mutation 失效时不得要求重复运行。
5. completion correction 次数保持两次上限，不通过增加请求预算掩盖错误覆盖。

### 5.4 验证批处理与失败短路

1. 模型可在一个响应中发出多个相互独立的 validator，Runtime 继续串行执行并分别记录事实。
2. 同一组件的 typecheck → test → build 若后项依赖前项，必须按序；前项结构化失败后，不在同一批继续执行依赖它的后项，剩余调用返回明确的 run-local skipped 结果且不计成功证据。
3. server test 与 client typecheck 等互不依赖验证可在同一响应中提交；一项失败不撤销另一项真实结果。
4. 修复后只重跑被相关 mutation 失效的 validator；不重跑仍有效的 sibling 验证。
5. 不把固定 validator 数、零 warning、全仓 build 或额外 baseline 设为普通任务完成条件。

### 5.5 端口、readiness 与 final

1. 生成服务读取 `PORT`/`SERVER_PORT` 时，值为 3000 必须改用项目选择的非 3000 端口，或由显式 CLI 参数覆盖；仍不规定固定替代端口、`strictPort` 或冲突重试次数。
2. service 命令的 host/port 与 readiness URL 必须来自同一事实。对 package script 传参时使用包管理器真实的参数透传形状；工具参数描述提供一个非框架绑定的 `--host 127.0.0.1 --port <port>` 示例，但不硬编码 Vite。
3. readiness 成功已经证明服务可访问；功能 API/UI 可以再做一次与需求直接相关的 smoke，之后不得重复相同 health、HTML 或总 URL 检查。
4. 所有 pending scopes 清空且要求的 service 均 ready 后，下一次 `stop` 必须进入 service handoff/final；缺 URL 仍只纠正一次。

### 5.6 收敛效率预算

预算用于暴露回归，不用于把未完成任务伪装成成功：

- 自动 fake-model 完整前后端轨迹：从首个认可 validator 请求到 `run.completed` 最多 16 次模型请求；全部 service ready 后最多再有 1 次模型请求。
- 冻结真实轨迹的修正版确定性回放：不得出现重复同形 service、重复等价 HTTP health、final 前目录盘点或 completion evidence 二次同路径拒绝。
- 经独立授权的真实 provider 可比任务：总模型请求目标不超过 50；从首个认可 validator 到终态不超过 20；若超限即验收失败并记录真实原因，不自动放宽预算或追加重试。
- 既有全局 30 分钟、300 工具调用、重复错误和无进展保护保持不变。

## 6. 范围

### 6.1 范围内

- 阶段 25 v3 已诊断的完成证据、TDD、宿主 3000 和 service 参数修复。
- System Prompt Planning/Executing/Completion 收敛规则。
- `completion-evidence` 路径相关性、direct smoke/check 和根协调 metadata。
- 基于既有状态生成有限 `ConvergenceView`，以及模型请求中的去重注入。
- 多 validator 批处理的依赖失败短路和 sibling 事实保留。
- fake-model、Terminal、Web E2E、agent-browser 与可选真实 provider 的调用数和事件顺序验收。

### 6.2 范围外

- 提高全局模型请求、工具或墙钟预算来掩盖低效。
- 并行执行工具；工具仍串行。
- 新增 Agent 框架、通用工作流引擎、自然语言评分器或自动任务分解器。
- 删除审批、工作区、symlink、原子写、中文合规或秘密保护。
- 把任意 Node/HTTP/readiness/stdout 当作 test。
- 固定生成项目替代端口、固定 service 重试次数、扫描端口或杀未知进程。
- 跨 SEcode 重启的服务管理器、部署、Git commit/push。
- 未经独立授权调用真实 provider 或读取真实凭据。

## 7. 预期影响文件

Task 获批后可细化但不得无理由扩张：

- `lib/context/system-prompt.ts`
- `lib/agent/completion-evidence.ts`
- `lib/agent/service-handoff.ts`
- `lib/agent/runtime.ts`
- 可选新增 `lib/agent/convergence-view.ts`
- `lib/agent/types.ts`、`lib/agent/errors.ts`（仅批处理 skipped/error 需要时）
- 对应 unit/integration/terminal/E2E fake-model 测试
- `docs/development/01-requirements.md`、阶段 26 Task/Summary/acceptance 与索引

不修改 Next.js 页面视觉或路由；若 Task 最终涉及 Next.js Production，实施前必须先读本地 16.3.3 对应文档。

## 8. 验收标准

| ID | 验收标准 |
| --- | --- |
| AC26-01 | 冻结最新 run 的完成证据回放由 3 个 uncovered paths 变为 0；删除 server、client 或 smoke 中任一真实验证会稳定失败。 |
| AC26-02 | `.gitignore` 不触发门；直接成功执行刚写入的 test/spec/check/verify/smoke 脚本只覆盖自身；普通 Node、HTTP/readiness 仍被拒绝。 |
| AC26-03 | 根协调 metadata 只有在全部相关已修改子范围分别验证后收敛，不发生 sibling 误覆盖。 |
| AC26-04 | Planning 与 Executing 确定性轨迹先取得有效 RED，再写对应 Production 并 GREEN；纯文档/样式不伪造 RED。 |
| AC26-05 | `ConvergenceView` 有界、脱敏、状态不变不重复注入；能同时展示 pending、有效验证、ready URL 和最后结构化 service 失败。 |
| AC26-06 | 两个独立 validator 可在一个模型响应中串行执行并各自记账；依赖前项失败后后项跳过且不形成成功证据，sibling 成功保留。 |
| AC26-07 | 宿主 `PORT=3000`、`SERVER_PORT=3000` 下生成项目仍监听非 3000；host/port/readiness/final 一致。 |
| AC26-08 | service ready 与一次需求 smoke 后，轨迹不再重复 health、HTML、目录盘点或等价总检查；下一模型响应直接 final。 |
| AC26-09 | fake-model 轨迹从首个 validator 到 completed ≤16 个模型请求，全部 service ready 后 ≤1 个请求；无降低断言或省略真实验证。 |
| AC26-10 | 全量 lint、typecheck、unit/integration、coverage、E2E、双 production build 与 diff check 通过；调用数断言纳入回归。 |
| AC26-11 | 经独立授权的真实 provider 可比任务总请求 ≤50、首个 validator 后 ≤20，双 service 与 agent-browser 验收通过；超限如实失败，不自动重试。 |
| AC26-12 | 旧 JSONL 无迁移恢复，既有 service、完成证据、取消、预算、审批、语言与安全回归通过。 |

## 9. RED 与验证策略

Task 必须先形成以下 RED：

1. 最新 run 的完成证据回放稳定留下 3 个路径。
2. server test 会错误地无法收敛已完成 sibling 后的根 metadata；同时负向 sibling 未验证用例必须保持失败。
3. 成功执行刚写入的 `smoke-api.js` 当前不被识别，普通 `node server.js` 负向用例保持不认可。
4. 当前 Prompt 允许计划把 Production 写在 RED 前，并允许 `PORT=3000` 被直接继承。
5. 当前模型请求在所有 validators/service ready 后仍缺少“直接 final”收敛视图。
6. 当前批量工具计划在依赖 validator 失败后仍可能继续执行后项，或无法表达结构化 skipped。
7. 当前 fake-model 效率 fixture 超过 AC26-09 请求上限，或无法断言重复 HTTP/目录检查。

分层验证：

- 纯单元：路径覆盖、脚本识别、根 metadata、收敛视图、批处理短路、service 事实。
- Runtime：Prompt 注入去重、validator 失效、stop/final 顺序、失败/取消清理。
- Terminal/E2E：空临时工作区完整 TDD、双 scope 验证、双 service、final 链接与请求数。
- agent-browser：真实页面核心交互、API、console/network、刷新和 final 链接。
- 全量门禁：现有仓库命令与 secret/skip/真实数据审计。

所有自动测试只使用临时 workspace、dataDir 和隔离 loopback 端口，不写真实 `.secode-data` 或用户项目。

## 10. 风险与取舍

| 风险 | 处理 |
| --- | --- |
| 收敛视图成为新的冗长仪式 | 只在状态变化后注入，有界且无 stdout；完成后明确直接 final。 |
| 根 metadata 自动收敛过宽 | 必须等待所有相关已修改子范围分别验证；负向删除任一验证测试锁定。 |
| 脚本名启发式伪造 test | 仅覆盖本 run 待验证脚本自身，要求成功直接执行，不信任输出，不覆盖 Production。 |
| 批处理失败短路隐藏信息 | 返回结构化 skipped 原因；独立 sibling 继续，依赖后项不执行。 |
| 请求上限导致复杂真实任务被误判 | 上限只用于可比阶段 fixture/真实验收，不替代现有通用 Runtime 预算；超限记为验收失败而非产品强制终止。 |
| Prompt 仍不能数学保证 TDD | 不引入高误报写拦截；以阶段首要规则、确定性事件顺序和真实 provider 验收共同约束。 |
| provider 随机性影响一次验收 | 只执行一次已授权回归，不自动重试；事件按必要/浪费阶段拆账并如实记录。 |

## 11. 审批结果

原 Spec 选择“前置 RED + 有限收敛视图 + 精确证据归并 + validator 批处理 + ready 后立即 final”。最新真实运行证明：有限视图和批处理虽降低了确定性 fixture 的调用数，但强制 RED、路径级完成硬门和局部纠正硬失败仍会把已经基本完成的普通任务截断，因此该选择被修订 2 取代。

**当前状态：修订 2 已批准。**

用户于 2026-08-31 明确要求回退到 Spec，随后回复“批准”，语义等价于“阶段 26 Spec 修订 2 通过”。该批准只解锁 Task 修订 2 编写；Task 独立获批前不得修改 requirements、Production 或测试，也不得执行真实 provider、Git 写入、发布或部署。

## 12. 修订 2：比例化验证、软完成证据与 30 请求收敛

本节是阶段 26 的最新有效规格；与第 2～10 节冲突时以本节为准。原章节保留为已实施但未通过真实运行检验的历史设计，不继续作为新 Task 的授权依据。

### 12.1 新增真实运行事实

```text
.secode-data/sessions/ffe26448-2883-48a6-9bc3-5429852e6bb0/events.jsonl
runId: 942835ca-be49-42f7-b168-f6dfe0b64ac8
时间: 2026-08-31T07:44:27.121Z ～ 07:48:46.094Z
工作区: /Users/starkirby/Codes/test/web
```

观察未读取 `.env.local`、API Key、provider 私有 body 或模型私有推理。

| 指标 | 结果 |
| --- | ---: |
| 总模型请求 | 28 |
| 总工具请求 / 未执行校验失败 | 28 / 3 |
| 成功单元测试 | 6/6 |
| service readiness 尝试 / 成功 | 2 / 0 |
| 单次 readiness 等待 | 60 秒 |
| completion correction | 1 次 |
| 最终 assistant 消息 | 0 |
| 终态 | `AGENT_COMPLETION_EVIDENCE_MISSING` |

主体文件、单元测试和可启动服务已在 28 次模型请求内基本形成。Agent 在 `server/server.js` 的局部修正后没有取得新的认可 validator；Runtime 从第一次 `completion.evidence.rejected` 起按“4 次模型请求或 8 次工具调用”计算局部预算。随后四次请求分别用于读文件、第二次 service、再读文件和一次未通过 Schema 的测试文件写入，下一循环直接失败，没有机会纠正工具参数、运行 HTTP 测试或给出诚实 final。

两次 readiness 均记录服务已监听 `127.0.0.1:8080`，但由 SEcode 进程内全局 `fetch` 轮询所得最后状态为 404。运行后以同一磁盘代码分别在随机 loopback 端口和 8080 实测 `/` 均为 200；原 Agent 关于 `path.join` 丢弃 `PUBLIC_DIR` 的判断也不成立。现有探针只保存最后状态码并丢弃响应来源，不能把该 404 归因于生成项目路由。修订 2 必须先以不受 Next.js 全局 `fetch` 包装影响的 Node HTTP 客户端建立可复现诊断。

### 12.2 修订目标

1. 可比的轻量空工作区项目，以总计 25～30 次模型请求完成必要观察、编码、一个简单相关测试、项目启动和 final；该目标不是 Runtime 对所有任务的通用硬上限。
2. 测试与验证按风险和改动比例选择。普通功能允许先生成最小实现与简单测试，再一次执行；不强制为每个垂直切片额外制造 RED 往返。
3. 完成证据继续向模型提示未验证范围，但默认不再把“没有新的 lint/typecheck/test/build”升级为不可恢复 `run.failed`。
4. 已实现但验证不完整时必须产生可见 final，明确区分已完成、已运行验证、未验证项和启动状态；不得无 final 截断。
5. 真正的失败测试、构建失败、readiness 失败和工具校验失败保持结构化事实，但允许 Agent 局部修正或诚实交付未完成状态，不因固定的 4 请求局部预算突然终止。
6. readiness 必须直连 loopback、绕开 Next.js 扩展或 HMR fetch cache，并在超时结果中提供足以区分连接失败、非预期状态和子进程退出的有限诊断。
7. 工作区、symlink、原子写、危险审批、取消、总时限、秘密保护和中文合规仍是硬边界，不随效率策略放宽。

### 12.3 比例化开发与验证策略

- Prompt 从“每个功能必须 test → RED → Production → GREEN”改为“尽早建立最小可执行反馈环”。现有项目优先复用最近相关测试；空项目可在同一或连续少量响应中创建最小实现与简单测试，然后执行一次。
- 纯样式、文档、小型静态资源和显然不改变运行行为的配置不要求测试；选择 lint、typecheck、build、静态检查或人工说明中最匹配的一项即可。
- 普通轻量项目默认只要求：一个覆盖核心行为的简单测试或等价 validator、一次实际启动 readiness，以及必要时一次需求 smoke。不得为了凑齐 lint/typecheck/test/build 四类而重复执行。
- 最后一次小范围修复只使与其直接相关的验证变为“需要复核”；此前 sibling 验证仍保留。Runtime 可以提示最小复核命令，但不把路径账本当作成功许可证。
- 用户明确要求“全部测试通过”、仓库指令指定门禁或任务涉及认证、数据安全、不可逆操作和正式发布时，Agent 仍必须执行相应严格验证；这类要求来自用户/仓库/风险事实，而不是通用路径启发式。

### 12.4 完成证据改为软门

1. `CompletionEvidenceState` 与 `ConvergenceView` 保留为 run-local 建议事实，不再决定普通 `stop` 是否可以进入 `run.completed`。
2. 首次 `stop` 若存在相关未验证 mutation，最多注入一次有界纠正，要求优先运行最小相关 validator，或在无法/不值得继续时立即返回带未验证说明的 final。
3. 不再使用 `correctionBaselineModelRequests + 4` 或 `correctionBaselineToolCalls + 8` 触发 `AGENT_COMPLETION_EVIDENCE_MISSING`。固定重复错误、无进展、总时限、取消和显式全局预算继续负责真正的失控保护。
4. 纠正后的 `stop` 即使仍有 pending path 也接受完成，但 final 必须含固定、可见、脱敏的“验证未完整”说明及有限相对路径/范围；若模型遗漏，Runtime 可附加确定性提示，不再追加模型请求。
5. 既有 `AGENT_COMPLETION_EVIDENCE_MISSING` 仅用于旧 JSONL 恢复与展示兼容，不再作为新普通 run 的完成门终态；不迁移或改写历史事件。
6. 失败 validator 不能被表述为通过；final 必须明确列出真实失败。`run.completed` 在此表示 Agent 已正常交付最终结果，不等价于所有需求已经自动验收成功。

### 12.5 readiness 修订

- `probeHttp` 不再调用 Next.js 进程内的全局 `fetch`；使用 `node:http` 对 Schema 已批准的 `http://127.0.0.1:<high-port>` 发起 GET，禁用代理、重定向和缓存语义。
- 每次探测关闭或消费响应，保持 AbortSignal、总 timeout 和进程树清理；不得扩大到任意 host、HTTPS、凭据或重定向。
- 结构化 metadata 至少区分：最后 HTTP 状态、探测次数、是否曾连接成功，以及有限错误类别；不记录 response body、headers、绝对路径或环境。
- Prompt 对轻量本地服务优先使用较短 readiness 窗口；一次失败后只有在 host、port、命令形状或已定位代码原因发生变化时才重试。不得用两次完整 60 秒同形轮询代替诊断。
- readiness 成功只证明 URL 可访问；一次与需求直接相关的 smoke 足够，不要求重复 health、HTML 和目录盘点。

### 12.6 收敛与终态策略

- 可比轻量 fixture 从首个请求到 final 的目标为 ≤30 次模型请求，service ready 后 ≤1 次；原“首个 validator 后 ≤16”和真实 provider ≤50 的宽松阈值被取代。
- 在约第 20 次请求后，Prompt/收敛视图明确进入收尾：只允许最小相关测试、一次启动、一次必要 smoke 和 final；不再开展非必要重构、补充文档或重复盘点。
- 工具 Schema 校验失败、父目录恢复或一次可解释 service 失败只触发针对性修正，不与完成证据共享硬截止计数。
- 达到显式模型预算、总时限或不可恢复基础设施错误时，仍按真实失败终止；只要模型仍能产生 final，应先展示已完成内容、失败事实和继续方式，不伪造成功。

### 12.7 修订 2 验收标准

| ID | 验收标准 |
| --- | --- |
| AC26-R2-01 | 冻结最新 28 请求轨迹回放时，`server/server.js` 缺少变更后 validator 不再触发 `run.failed`；产生可见 final，并明确标注未验证范围。 |
| AC26-R2-02 | 首次 pending stop 最多纠正一次；第二次 stop 接受并确定性补齐验证警告，不再产生新的 `AGENT_COMPLETION_EVIDENCE_MISSING`。 |
| AC26-R2-03 | 真实失败的 test/build 在 final 中保持失败事实；不得显示为已通过，也不得因软门而绕过用户或仓库明确要求的严格门禁。 |
| AC26-R2-04 | 简单空项目轨迹允许最小实现与简单测试成组生成，不强制逐切片 RED；核心测试、启动和 final 均存在，总模型请求 ≤30。 |
| AC26-R2-05 | 第 20 次请求后的确定性轨迹只剩最小验证、一次 readiness、至多一次需求 smoke 和 final；无重复目录、等价 HTTP 或非必要文档扩写。 |
| AC26-R2-06 | readiness 使用 `node:http` 而非全局 `fetch`；同一测试服务重复探测不会复用陈旧状态，200/404/连接拒绝/超时/取消均有结构化结果并无孤儿进程。 |
| AC26-R2-07 | 同形 readiness 失败不连续等待两次完整 60 秒；有变化的修复可重试一次，未定位时快速返回可解释结果。 |
| AC26-R2-08 | 一次写工具参数校验失败不会因完成证据局部预算导致 run 截断；模型可修正一次或直接给出带限制 final。 |
| AC26-R2-09 | 安全边界、危险审批、Plan Mode 只读、取消、总时限、重复错误、无进展、中文合规和旧 JSONL 恢复回归不变。 |
| AC26-R2-10 | lint、typecheck、unit/integration、coverage、E2E、双 build、diff check 和 agent-browser 通过；真实 provider 仍须独立授权且只执行一次。 |

### 12.8 范围与停止点

修订 2 预计涉及 `lib/agent/completion-evidence.ts`、`lib/agent/runtime.ts`、`lib/agent/errors.ts`、`lib/agent/types.ts`、`lib/agent/projection.ts`、`lib/agent/convergence-view.ts`、`lib/context/system-prompt.ts`、`lib/tools/dependencies.ts`、`lib/tools/run-process.ts` 及对应测试和 requirements。若决定新增 durable completion warning 字段或事件类型，必须在 Task 前再次回到 Spec 明确兼容方案；当前优先复用既有事件和确定性 final 文案，不新增迁移。

本 Spec 修订 2 已于 2026-08-31 获用户明确批准。现只解锁 Task 修订 2 编写；原 Task、原 Summary 和已存在代码不构成继续实施授权。Task 修订 2 生成后必须立即停在独立审批门。
