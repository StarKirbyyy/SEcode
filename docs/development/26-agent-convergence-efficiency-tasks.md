# 阶段 26 Task：Agent 测试、验收与启动收敛效率

> **状态：被 Spec 修订 2 取代。** 用户于 2026-08-31 明确要求回退；原 Task 审批和实施授权失效。以下内容只保留历史实施记录，不授权继续修改代码、测试或 requirements。Spec 修订 2 已获批，新的 Task 修订 2 正在独立等待审批。

**目标：** 修复最新真实 run 在主体实现后又消耗 38 次模型请求仍失败的问题：前置最小 RED，精确收敛完成证据，向模型提供去重的有限收敛视图，批量执行独立 validator，并在 service ready 后直接 final。

**Spec：** [`26-agent-convergence-efficiency-spec.md`](./26-agent-convergence-efficiency-spec.md)（修订 2 已批准；本原 Task 审批已失效）。

## 1. 状态与审批门禁

- 当前状态：`被 Spec 修订 2 取代；原审批失效`。
- 原 Spec 审批：用户于 2026-08-31 曾回复“批准”，当时只解锁本 Task 编写；现已被 Spec 修订 2 取代。
- 原 Task 审批：用户随后曾再次回复“批准”，当时解锁 T26-00～T26-07；现审批失效，T26-08 从未解锁。
- 当前只允许审阅/修订 Task 修订 2 和同步阶段状态；不得依据本原 Task 修改 requirements、Production、测试、配置或真实 Session。
- Task 修订 2 另行获批前不得继续实施。
- 阶段 27、真实 provider、真实凭据、Git 写入、发布和部署均未授权。

## 2. 全局约束

1. 保留现有所有用户和阶段 25 未提交修改，不 reset、stash、覆盖或清理无关文件。
2. 核心仍只有六个本地工具；工具串行执行，不引入 Agent 框架、并行执行或通用工作流引擎。
3. 不提高 30 分钟、300 工具调用或其他通用预算来掩盖低效；效率阈值只用于阶段 fixture 与真实验收判定。
4. 不新增持久化事件类型、服务注册表、Session 迁移或第二事实源；收敛视图只由 run-local 现有状态派生。
5. 不信任 stdout 中的 PASS/ready 文本；HTTP 200/readiness 不替代 lint/typecheck/test/build。
6. 不把普通 `node server.js` 识别为 test；direct-script 证据只覆盖刚写入且明确命名为 test/spec/check/verify/smoke 的脚本自身。
7. 不新增 TDD 自然语言评分器或启发式写拦截；TDD 顺序通过 phase prompt、确定性事件顺序和真实验收约束。
8. 生成端口只要求避开 3000；不规定固定替代端口、`strictPort` 或冲突重试次数。
9. 自动测试仅操作临时 workspace/dataDir/loopback 端口，不写真实 `.secode-data`、用户工作区或读取 `.env.local`。
10. 本阶段不修改 Next.js Production 页面或 Route Handler；若实施中发现必须修改，停止并回退 Spec，不以测试文件为理由绕过本地 Next.js 文档要求。

## 3. 锁定接口与语义

### 3.1 完成证据

在 `lib/agent/completion-evidence.ts` 内保持现有公共入口，允许增加纯辅助函数，不新增 durable schema：

```ts
recordCompletionEvidenceToolResult(
  state: CompletionEvidenceState,
  seq: number,
  invocation: PreparedLocalToolInvocation,
  result: ToolResult,
): number;
```

锁定规则：

- `isRelevantMutationPath` 对 basename 精确等于 `.gitignore` 返回 false；不顺带忽略 `.eslintignore`、`package.json` 或构建配置。
- direct script 仅识别 `program` basename 为 `node`、首个参数为无 `..` 的工作区相对 `.js/.cjs/.mjs` 路径、归一化 `cwd + args[0]` 精确命中 pending mutation，且 basename 由分隔符边界命中 `test|spec|check|verify|smoke`。成功 oneshot 只删除该脚本 pending，并记录 `test` evidence；额外参数允许，`node -e`、flag-first 和普通 `server.js` 不识别。
- 根协调 metadata 初版只认 basename `package.json`。一次成功认可 validator 正常覆盖其 `cwd` 后，若协调文件位于该 `cwd` 的祖先目录、mutation 早于 validator、且该协调目录下已无其他 pending 非协调文件，则同次收敛该 `package.json`。若 sibling Production 仍 pending，不收敛。
- coordinator 只在成功 validator 后归并；后续再次写 root `package.json` 必须等待新的成功 validator，不能复用旧事实立即清空。
- 原有最大 8 条 validation facts、12 条 uncovered paths 和脱敏/截断规则保持。

### 3.2 Service 与收敛视图

新增 `lib/agent/convergence-view.ts`：

```ts
export interface ConvergenceView {
  pendingScopes: string[];
  pendingPaths: string[];
  validEvidence: Array<Readonly<{
    kind: VerificationKind;
    cwd: string;
    seq: number;
  }>>;
  readyUrls: string[];
  lastServiceFailure?: Readonly<{
    code: string;
    cwd: string;
  }>;
}

export function createConvergenceView(
  completion: CompletionEvidenceState,
  services: ServiceHandoffState,
): Readonly<ConvergenceView>;

export function fingerprintConvergenceView(
  view: ConvergenceView,
): string;

export function renderConvergenceMessage(
  view: ConvergenceView,
): string | undefined;
```

锁定规则：

- 复用完成证据的 bounded paths 和 service 的脱敏 URL；最多 12 paths、8 evidence、8 URLs。
- fingerprint 只基于上述公开有限字段，确定性排序，不包含 stdout、PID、绝对路径、环境、program args 或 secret。
- 无 mutation、无 evidence、无 service 时不生成消息。
- pending 非空时说明仍需验证的相对范围；pending 为空且存在 ready URL 时明确“复用事实并直接 final，不再重复 health/HTML/list_directory”。
- `ActiveRunState` 只保存 `lastDeliveredConvergenceFingerprint?: string`。每次模型请求前计算当前 view；fingerprint 与上次已发送值不同时注入一次并更新，状态不变时不重复生成不同文本。
- `ServiceHandoffState` 增加有限 `lastFailure`；只保留 `error.code`、相对 `cwd`。一次成功 service 清除 lastFailure。
- 同一 `cwd` 后续成功 service 取代该 `cwd` 的旧 ready fact，final 只要求最新 URL；不同 cwd 的 ready facts 并存，最多 8 条。

### 3.3 同批 validator 短路

不引入依赖图。`processToolCalls` 使用以下精确规则：

1. 所有 `tool.requested` 仍按模型原批次顺序先写入，toolCalls 计数语义不变。
2. 成功或失败 validator 由现有 `classifyVerificationCommand` 判定。
3. 某个 oneshot validator 返回 `ok: false` 后，只跳过同一批次中后续、同一归一化 `cwd`、同样属于 validator 的调用；不同 `cwd` 的 sibling validator 继续串行执行。
4. skipped 调用不进入授权、不产生 `tool.started`，但产生配对的 `tool.result`：

```ts
{
  ok: false,
  summary: "同批后续验证已跳过",
  error: {
    code: "VALIDATION_BATCH_SKIPPED",
    message: "同一目录的前置验证失败",
    recoverable: true,
    details: { cwd: string, blockedByToolCallId: string }
  },
  metadata: { skipped: true, reason: "prior_validator_failed" }
}
```

5. skipped 不形成 completion evidence，不进入 validation-repair episode，不增加重复工具错误或无进展读取 streak；用户仍能从 durable tool result 审计原因。
6. 安装、写入、service、read/search 和未知命令不参与该短路；不得推断它们与 validator 的依赖。

### 3.4 Prompt V12

- `SYSTEM_PROMPT_VERSION` 升为 12，并同步所有版本断言。
- Planning phase 首要顺序：最小 test → 有效 RED → 最小 Production → 同测 GREEN；计划不得写成“实现 + 测试”的无序合并项。
- Executing phase 首条重复该顺序；空项目允许最小 package、测试入口和父目录脚手架。
- 选择轻量技术栈时，已有纯 JS/WASM 方案满足目标则避免已知原生 addon 安装风险；必须使用原生 addon 时先最小安装/导入探测。
- 独立 validator 可在一次响应批量提交；同 cwd 依赖验证按 typecheck/test/build 顺序，失败后等待结果并局部修复。
- 读取 `PORT`/`SERVER_PORT` 时值 3000 不得直接采用；显式选择非 3000 端口，并确保绑定 host/port/readiness/final 同源。
- service ready 与一次需求 smoke 后复用收敛视图，直接 final，不追加等价 HTTP、HTML、目录或总健康检查。
- `run_process` 参数描述补充包管理器脚本参数必须经 `--` 透传、service 显式绑定 `127.0.0.1` 和同一 port；不写死 Vite 或替代端口。

## 4. 依赖顺序

```text
T26-00 审批基线与需求修订
  → T26-01 完成证据精确收敛
  → T26-02 service 最新事实与 ConvergenceView
  → T26-03 Runtime 去重注入与 ready 后 final
  → T26-04 同批 validator 短路
  → T26-05 Prompt V12、前置 RED、端口/readiness
  → T26-06 完整效率 fixture、Terminal/E2E/agent-browser
  → T26-07 全量门禁、审计与 Summary
  → T26-08 可选真实 provider 回归（独立授权）
```

## 5. 任务清单

### T26-00：审批基线、需求与范围锁定

**修改文件：**

- `docs/development/01-requirements.md`
- `docs/development/26-agent-convergence-efficiency-spec.md`（只写审批记录）
- `docs/development/26-agent-convergence-efficiency-tasks.md`（只写实施记录）
- `docs/development/README.md`
- `docs/development/00-process.md`

**RED / 基线：**

1. 记录 `git status --short`，确认阶段 25 与用户修改全部保留。
2. 运行：

```text
pnpm exec vitest run tests/unit/agent/completion-evidence.test.ts tests/unit/agent/service-handoff.test.ts tests/unit/agent/runtime-completion.test.ts tests/unit/context/model-language.test.ts tests/integration/terminal/execution-precision.test.ts
```

3. 记录当前测试通过不代表 AC26-01～AC26-09 已覆盖；不得改写为 RED 已存在。

**实现：**

- `FR-012` 从 Prompt V11 修订为 V12，并增加前置 RED、validator 批处理、端口继承拒绝与 ready 后 final。
- 新增 `FR-025`：Runtime 向模型提供有限、去重、run-local 的收敛视图，复用验证与 service 事实。
- `NFR-018` 明确行为任务 RED→GREEN 顺序和最小验证。
- 新增 `NFR-022`：可比 fake 轨迹从首个 validator 到 completed ≤16 次请求、ready 后 ≤1 次；真实 provider 阈值只作为阶段验收，不成为通用 Runtime 强制预算。
- `NFR-021` 补充状态未失效时不重复 validator、health 或目录盘点。
- 新增 `SEC-018`：收敛视图和 skipped 结果不得包含 stdout、PID、绝对路径、环境、参数秘密；不削弱审批与工具串行。

**最小验证：** `git diff --check -- docs/development/01-requirements.md docs/development/26-agent-convergence-efficiency-*.md docs/development/README.md docs/development/00-process.md`。

### T26-01：完成证据精确收敛

**修改文件：**

- `lib/agent/completion-evidence.ts`
- `tests/unit/agent/completion-evidence.test.ts`

**RED：**

1. 增加冻结最新 run 关键轨迹：server Production、client Production、root `package.json`、`.gitignore`、server test、client build、`smoke-api.js` 写入与直接执行；断言期望 0 pending，当前实际 3，确认失败。
2. 增加负向用例：删除 client build 后 client 与 root package 保持 pending；普通 `node server.js` 不覆盖；root package 在旧 validation 后再次写入仍 pending。
3. 单独断言 `.gitignore` 当前错误触发 pending；direct smoke 当前不识别。

**GREEN：**

- 按 3.1 锁定规则实现精确 ignore、direct script 与协调 metadata 收敛。
- 不改变 HTTP/readiness/普通 Node 负向语义。

**最小验证：**

```text
pnpm exec vitest run tests/unit/agent/completion-evidence.test.ts
```

**完成条件：** AC26-01～AC26-03 全部有正负测试；真实轨迹回放为 0 pending，任一必要验证缺失时稳定失败。

### T26-02：Service 最新事实与有限 ConvergenceView

**新增/修改文件：**

- Create: `lib/agent/convergence-view.ts`
- Create: `tests/unit/agent/convergence-view.test.ts`
- Modify: `lib/agent/service-handoff.ts`
- Modify: `tests/unit/agent/service-handoff.test.ts`

**RED：**

1. 同一 cwd 两次 service 成功时，当前 final 错误要求旧、新两个 URL；期望只保留新 URL。
2. service 失败后当前没有有限 code/cwd 事实；期望 view 包含脱敏 lastFailure。
3. pending、evidence、ready URL 同时存在时当前没有有界收敛消息。
4. 注入 secret-like args、stdout、绝对路径和 PID，断言 view/message 不包含。

**GREEN：**

- 按 3.2 新增纯派生模块并修正 service cwd 最新事实。
- fingerprint 对输入顺序稳定、字段有界；空状态返回 undefined message。

**最小验证：**

```text
pnpm exec vitest run tests/unit/agent/service-handoff.test.ts tests/unit/agent/convergence-view.test.ts
```

### T26-03：Runtime 去重注入与 ready 后直接 final

**修改文件：**

- `lib/agent/runtime.ts`
- `tests/unit/agent/runtime-completion.test.ts`
- `tests/unit/agent/runtime-cancellation.test.ts`

**RED：**

1. mutation 后下一请求收到 pending view；状态不变的再下一请求不重复新增 view；新 validator 后收到更新 view。
2. server/client validation 与两个 service ready 后，下一请求必须看到“直接 final”及最新 URLs，模型返回含链接 final 后 completed；不得再出现额外工具。
3. service failure view 只含 code/cwd，随后成功清除 failure；final 仍只要求最新每 cwd URL。
4. 失败、取消与 readiness timeout 继续清理进程；completed 不 abort 最终 service。

**GREEN：**

- `ActiveRunState` 增加 fingerprint；模型请求构建时计算和条件注入 view。
- 保留 completion evidence → service handoff → final 的 stop 门顺序。
- 不新增 durable event；不把 view 写为 assistant 事实或修改 Context 历史。

**最小验证：**

```text
pnpm exec vitest run tests/unit/agent/convergence-view.test.ts tests/unit/agent/runtime-completion.test.ts tests/unit/agent/runtime-cancellation.test.ts
```

### T26-04：同批 validator 失败短路与 sibling 保留

**修改文件：**

- `lib/agent/runtime.ts`
- `lib/agent/errors.ts`（若 ToolResult code 类型需要）
- `tests/unit/agent/runtime-completion.test.ts`
- `tests/unit/agent/schemas.test.ts`（仅错误码集合需要）
- `tests/integration/server/run-stream.test.ts`

**RED：**

1. 一个模型响应依次返回 `server typecheck`（失败）、`server test`、`client typecheck`；当前三个均执行。期望 server test skipped、client typecheck 执行成功。
2. skipped 有 requested/result 配对、无 started/approval/执行副作用，不形成 evidence 或 validation-repair。
3. 后续模型修复 server 并批量重跑时，client 成功事实保持，不要求重跑。
4. 写入、安装、service 与未知命令即使同 cwd 也不被 validator 失败短路。

**GREEN：**

- 在 `processToolCalls` 批次局部保存 `failedValidatorByCwd`；按 3.3 生成 `VALIDATION_BATCH_SKIPPED`。
- skipped 不调用 `updateToolErrorStreak` / `updateNoProgressReadStreak`，但保持 toolCalls 和事件配对。

**最小验证：**

```text
pnpm exec vitest run tests/unit/agent/runtime-completion.test.ts tests/unit/agent/schemas.test.ts tests/integration/server/run-stream.test.ts
```

### T26-05：Prompt V12、前置 RED、低风险依赖与端口/readiness

**修改文件：**

- `lib/context/system-prompt.ts`
- `lib/tools/schemas.ts`（仅 `run_process` 工具描述；`LOCAL_TOOL_DEFINITIONS` 的唯一事实源）
- `tests/unit/context/model-language.test.ts`
- `tests/unit/context/token-estimator.test.ts`
- `tests/unit/tools/registry.test.ts`
- `tests/integration/terminal/execution-precision.test.ts`

**RED：**

1. Prompt 版本仍为 11，Planning 未要求把 RED 明确排在 Production 前。
2. 空项目 fake 轨迹先写 Production 后测试仍可完成；期望 fixture 锁定 test write → failing test → Production → same test GREEN。
3. 宿主 `PORT=3000`/`SERVER_PORT=3000` 时旧生成轨迹直接采用 3000；期望显式非 3000 绑定和匹配 readiness。
4. service 参数描述缺少 `--` 透传与 loopback host/port 同源提示。

**GREEN：**

- 按 3.4 升级 V12；保持所有固定模型自然语言为简体中文。
- 不要求固定替代端口或框架；不新增 provider 特例。
- 确定性 fixture 的 Production 首次写入必须晚于有效 RED，GREEN 后只保留相关 validator、一次需求 smoke 和最终 service。

**最小验证：**

```text
pnpm exec vitest run tests/unit/context/model-language.test.ts tests/unit/context/token-estimator.test.ts tests/unit/tools/registry.test.ts tests/integration/terminal/execution-precision.test.ts
```

### T26-06：完整效率 fixture、E2E 与 agent-browser

**新增/修改文件：**

- `tests/e2e/support/fake-model-server.ts`
- `tests/e2e/service-handoff.spec.ts`
- 可选 Create: `tests/e2e/convergence-efficiency.spec.ts`
- `tests/e2e/agent-workflow.spec.ts`（仅共享终态等待需要）

**RED：**

1. 新增 `convergence-efficient-web`：空临时项目按有效 RED、最小 server/client、独立批量 validators、一次 API smoke、双 service、直接 final 运行。
2. 在 fixture 中记录模型请求与工具序列；先将阈值设为 AC26-09，确认旧轨迹因重复检查或请求数超限失败。
3. 负向 fixture 缺 client validator 时必须收到 pending view，不能靠 server test/root metadata 误 completed。

**GREEN：**

- 断言首个认可 validator 到 completed ≤16 模型请求；双 service ready 后只允许 1 次模型请求。
- 断言无等价重复 health/HTML、final 前目录盘点、相同 service 重试或相同 uncovered paths 二次拒绝。
- 页面 final 含两个最新可点击 URL、真实启动命令、验证与限制；run completed 后两个 service 可访问。
- 使用 `agent-browser` 启动隔离 SEcode，打开前端 URL，检查核心交互、API、console/network、刷新和 final 链接；精确停止本次 PID/端口并记录。

**最小验证：**

```text
pnpm exec playwright test tests/e2e/service-handoff.spec.ts tests/e2e/convergence-efficiency.spec.ts tests/e2e/agent-workflow.spec.ts
```

若未新增独立 spec，则命令移除不存在文件，并在 Task 实施记录说明断言放置位置；不得创建空测试文件。

### T26-07：全量门禁、审计与 Summary

**修改/新增文件：**

- `docs/development/26-agent-convergence-efficiency-tasks.md`
- Create: `docs/development/26-agent-convergence-efficiency-summary.md`
- `docs/development/README.md`

**验证顺序：**

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
npm run build
SECODE_NEXT_DIST_DIR=.next-gate-turbo pnpm exec next build
git diff --check
```

环境外写入导致的 loopback、socket、tsx IPC 等 `EPERM` 只能在确认是权限原因后用相同命令申请获准重跑；不得修改测试规避。

**审计：**

- `rg -n "\.only\(|\.skip\(|describe\.skip|test\.skip|it\.skip" tests`
- `rg -n "VALIDATION_BATCH_SKIPPED|ConvergenceView|SYSTEM_PROMPT_VERSION" lib tests docs/development`
- 检查无依赖变化、无真实 `.secode-data`/用户工作区写入、无 `.env.local` 读取、无凭据、无 Git 写入、无 T26-08 调用。
- 核对旧 JSONL fixture、审批、取消、语言、service 清理、完成证据负向与 61+ 模型请求无通用上限测试均通过。

**Summary：** 如实记录每项 RED/GREEN、失败根因、修正、验证、调用数、agent-browser、偏差、安全和 T26-08 状态。更新索引为“Summary 待用户审批”后立即停止。

### T26-08：可选真实 provider + agent-browser 回归

**门禁：** T26-07 自动结果展示后，向用户说明 provider、一次调用成本、临时目录、端口、敏感边界和一次性停止点；只有用户再次明确批准才执行。

**新增文件：**

- Create: `docs/development/26-agent-convergence-efficiency-acceptance.md`
- 可选 Create: `tests/manual/stage26-fixture.ts`

**验收：**

1. 在全新带 marker 的临时根执行一次与原 run 可比的轻量前后端任务；不复用原 task-board。
2. 事件顺序必须为最小 test → 有效 RED → 对应 Production → GREEN；不得先批量完成全部 Production。
3. 总模型请求 ≤50；首个认可 validator 到终态 ≤20；全部 service ready 后 ≤1。超限即失败，不自动重试或放宽。
4. 无继承 3000、无同形 service 重试、无重复 health/HTML/目录盘点、无 completion evidence 同路径二次拒绝。
5. 双 service ready、final 含最新命令与 URL；用 agent-browser 检查看板核心交互、API、console/network 和刷新。
6. 运行一次后立即停止，如实记录 provider、模型 ID、token/cache、模型/工具请求、审批、耗时、失败与资源清理；不记录密钥。

## 6. 验收追踪

| 验收 | Task |
| --- | --- |
| AC26-01～AC26-03 | T26-01 |
| AC26-04、AC26-07 | T26-05、T26-06 |
| AC26-05 | T26-02、T26-03 |
| AC26-06 | T26-04 |
| AC26-08～AC26-09 | T26-03、T26-06 |
| AC26-10、AC26-12 | T26-07 |
| AC26-11 | T26-08（独立授权） |

## 7. 明确不执行

- 不把阶段效率阈值加入通用 `AgentRunLimits` 或作为所有任务的硬失败预算。
- 不增加第七个工具、并行工具、shell、自动端口扫描或未知进程清理。
- 不增加通用依赖图、测试覆盖率推断或自然语言任务分类器。
- 不把 HTTP/readiness/stdout 当 lint/typecheck/test/build。
- 不修改 UI 信息架构、Session 存储格式、模型协议或 Context 压缩算法。
- 不执行真实 provider、Git commit/push、发布或部署。

## 8. 回退策略

- coordinator 归并若出现 sibling 误覆盖，回退 T26-01 实现并保持阶段未完成，不通过扩大 ignore 列表绕过。
- convergence message 若破坏 Context cache、泄密或重复注入，回退 T26-02/T26-03；保留纯函数测试与现有 completion correction。
- validator short-circuit 若跳过不同 cwd 或非 validator，回退 T26-04；工具仍按当前串行全执行，不新增隐式依赖推理。
- Prompt 真实轨迹仍不遵守 TDD，不增加启发式写拒绝；如实在 T26-08 失败并回退 Spec 决策。
- 真实 provider 超限不回滚已通过的自动代码，也不自动重试；记录失败并等待用户处置。

## 9. Task 审批

**当前状态：被 Spec 修订 2 取代；原实施记录保留但不再等待成功 Summary 审批。**

用户于 2026-08-31 曾明确批准原 Task；同日因 T26-05 把工具描述文件误写为 `lib/tools/registry.ts`，修正为实际唯一事实源 `lib/tools/schemas.ts`，用户再次明确回复“批准”。该修订当时只更正实施文件，没有改变 Prompt V12 需求、接口、安全边界或验收标准；T26-00～T26-07 随后完成，T26-08 未获授权。

后续真实 run 仍因 completion evidence 局部硬预算在 28 次模型请求后无 final 失败，且 readiness 两次各等待 60 秒并得到无法归因的 404。用户据此明确要求回退。原 Task 不再授权任何后续实施；下方记录仅作为修订 2 的历史证据。

### T26-00 实施记录

- 开始前 `git status --short` 已记录，阶段 25 与用户未提交修改全部保留。
- 基线专项命令通过：5 个测试文件，54/54 测试通过；这只证明既有基线稳定，不代表 AC26-01～AC26-09 已覆盖。
- 已按批准 Task 修订 `FR-012`、`NFR-018`、`NFR-021`，新增 `FR-025`、`NFR-022`、`SEC-018`；T26-01 Production 尚未修改。

### T26-01～T26-07 实施记录

- T26-01：冻结回放、`.gitignore`、direct script 与 root coordinator 正负例先产生 4 个 RED；完成证据专项后为 24/24 GREEN。
- T26-02～T26-03：新增有界、脱敏 `ConvergenceView`，同 cwd service 仅保留最新成功事实，Runtime 只在 fingerprint 改变时注入；相关 34/34 通过。
- T26-04：同批同 cwd validator 前项失败后生成 `VALIDATION_BATCH_SKIPPED`，sibling cwd 与非 validator 仍执行；相关 43/43 通过。
- T26-05：Prompt 与工具描述先形成 10 个 RED；V12 后专项 29/29 与 typecheck 通过，三种 phase 均低于 1700 token。
- T26-06：新增 `convergence-efficient-web`，9 次模型请求完成双 cwd RED/GREEN、一次 smoke、双 service 和直接 final；首跑因 smoke 需独立审批而失败，仅修正 E2E 审批驱动后通过。agent-browser 实测交互、API、刷新和 durable final 链接通过，临时 PID/端口/目录已精确清理。
- T26-07：lint、typecheck、1029 unit/integration、coverage、50 E2E、双 build 和 diff check 全部通过。全量 E2E 首跑唯一失败是旧 harness 仍期待 direct verify 被纠正；更新旧合同后全量重跑 50/50 通过。
- 已生成 `26-agent-convergence-efficiency-summary.md`；T26-08 真实 provider、Git 写入、发布与部署仍未授权。
