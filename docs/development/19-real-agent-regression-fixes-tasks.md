# 阶段 19 Task：计划呈现、项目端口规避与真实写入顺序修复

> 实施本计划时必须逐项使用 TDD，并在完成声明前执行 verification-before-completion；遇到非预期失败先按 systematic-debugging 查明根因。仓库审批规则优先，本计划不授权 Git commit、push、发布、部署或多 Agent 执行。

## 1. 文档状态与审批门禁

- 当前状态：`T19-00～T19-06 已完成并展示自动结果；用户于 2026-08-30 明确改由阶段 20 重新 Spec，T19-07 已停止且不再等待执行`。
- 批准的 Spec：[19-real-agent-regression-fixes-spec.md](./19-real-agent-regression-fixes-spec.md)。
- Spec 审批：用户于 2026-08-30 回复“批准”，语义等价于“阶段 19 Spec 通过”。
- Task 审批：用户于 2026-08-30 回复“批准”，语义等价于“阶段 19 Task 通过”；本次审批解锁 T19-00～T19-06，不解锁 T19-07。
- 本 Task 将批准的 UI、System Prompt V7、端口规避、run 内观察账本、窄 preflight 和真实模型门禁拆分为可执行任务。
- 当前允许：审阅 T19-00～T19-06 结果，以及审阅阶段 20 新 Spec。
- 当前禁止：启动 T19-07、生成阶段 19 Summary，或在阶段 20 Spec/Task 获批前修改产品代码和测试。
- 流程重定向：原 T19-07 真实模型门禁被阶段 20 的新规格与 `AC20-12` 取代；阶段 19 保持未完成，不把自动结果伪装成 Summary 或阶段完成。

## 2. 目标、架构与技术边界

**目标：** 修复 durable 计划的 Markdown/尾字呈现、Agent 新项目端口冲突和空工作区写入依赖顺序，并以事件级真实模型回归证明修复有效。

**架构：** UI 将 durable `plan.proposed` 直接交给现有安全 Markdown 渲染器，真实 `assistant.delta` 继续通过带小数余量的字形时钟动画。Context 升级为 System Prompt V7，明确 3000 保留端口和无 Shell 语义。Agent Runtime 增加仅存于当前 run 的目录观察账本，在文件执行器之前拒绝 fresh 事实已知缺失的父目录，并抑制同批等价写入。

**技术栈：** Next.js 16.3.3 App Router、React 19、TypeScript、React Markdown + remark-gfm、Vitest、Playwright、现有六工具与 JSONL 事件协议。

### 2.1 全局约束

1. 不新增依赖、工具、durable 事件、Route Handler、公共 API 或 JSONL 迁移。
2. 不改变 `run_process` 环境继承、审批、取消、service 生命周期、readiness 或进程组清理。
3. 不让 `write_file` 隐式创建父目录，不绕过真实路径、symlink、越界或 SHA-256 校验。
4. 3000 是 SEcode 默认保留端口；新项目使用项目专用端口变量和非 3000 默认值，既有项目只在实际冲突且任务授权范围内最小修改。
5. 计划、Prompt、固定错误与工具说明使用简体中文；代码、命令、路径、字段名和真实 stdout/stderr 不翻译。
6. 所有测试只操作临时工作区；不得读取 `.env.local`、API Key、真实 Session 以外的秘密或用户项目。
7. 修改 Next.js/React UI 前必须重新阅读本地 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` 与 `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`。

## 3. 文件结构与接口冻结

### 3.1 计划呈现与动画

- 修改 `app/ui/workbench/plan-approval.tsx`：计划正文改用现有 `MarkdownMessage`，不再把 durable 计划交给 `TypingText`。
- 修改 `lib/client/typing.ts`：`advanceTyping` 改为显式返回字形位置与未消费时间余量。
- 修改 `app/ui/workbench/typing-text.tsx`：保存余量并仅为真实 draft 动画；flush 条件保持 authoritative。
- 修改 `tests/unit/client/typing.test.ts`、`tests/e2e/support/fake-model-server.ts`、`tests/e2e/plan-mode.spec.ts`。

冻结内部接口：

```ts
export interface TypingProgress {
  visible: number;
  remainderMs: number;
}

export interface AdvanceTypingInput {
  visible: number;
  total: number;
  elapsedMs: number;
  remainderMs?: number;
  rate?: number;
  maximumLagMs?: number;
  flush?: boolean;
  reducedMotion?: boolean;
  hidden?: boolean;
  disabled?: boolean;
}

export function advanceTyping(input: AdvanceTypingInput): TypingProgress;
```

`remainderMs` 只累计不足一个字形的时间；catch-up、flush、total 缩短和完成态必须把返回值规范化为有限非负值。

### 3.2 System Prompt V7 与工具说明

- 修改 `lib/context/system-prompt.ts`：`SYSTEM_PROMPT_VERSION` 从 6 提升至 7；新增 3000 保留端口、新项目专用端口变量、配置一致性和无 Shell 规则。
- 修改 `lib/tools/schemas.ts`：只强化 `run_process` 描述，不新增参数或改变 Schema。
- 修改 `tests/unit/context/model-language.test.ts`、`tests/unit/context/token-estimator.test.ts`、`tests/unit/tools/schemas.test.ts`、`tests/integration/terminal/execution-precision.test.ts` 中版本与固定契约断言。

V7 必须包含以下可验证语义：

- “3000 是 SEcode 默认保留端口”；
- 新项目的后端/前端长期服务选择非 3000 端口；
- Node.js 新项目使用 `SERVER_PORT` 等项目专用变量，不以通用 `PORT` 作为唯一配置；
- 监听、代理、README、API 检查和 readiness 使用同一端口；
- `run_process` 不解释管道、连接符、重定向、`$VAR` 或命令替换。

### 3.3 run 内观察账本与写入 preflight

- 新增 `lib/agent/workspace-observations.ts`：纯内部、无 I/O 的观察记录与判断模块。
- 修改 `lib/agent/runtime.ts`：ActiveRun 初始化账本；工具结果后更新/失效观察；执行写工具前应用 preflight；同批同父目录错误只保留一个根诊断，其余工具调用仍产生配对的有限 `tool.result`。
- 新增 `tests/unit/agent/workspace-observations.test.ts`。
- 修改 `tests/unit/agent/runtime-tools.test.ts`、`tests/unit/agent/runtime-plan-mode.test.ts` 和 `tests/integration/terminal/execution-precision.test.ts`。

冻结内部接口：

```ts
export interface WorkspaceObservationState;

export type WriteDependencyDecision =
  | Readonly<{ kind: "allow" }>
  | Readonly<{ kind: "known_missing_parent"; parent: string }>;

export function createWorkspaceObservationState(): WorkspaceObservationState;

export function evaluateWriteDependency(
  state: WorkspaceObservationState,
  invocation: PreparedLocalToolInvocation,
): WriteDependencyDecision;

export function updateWorkspaceObservations(
  state: WorkspaceObservationState,
  invocation: PreparedLocalToolInvocation,
  result: ToolResult,
): void;
```

实现规则：

1. 只接受成功、未截断的 `list_directory` 作为“缺失”证据；被阻止、忽略、超限或截断范围不得推断不存在。
2. planning phase 的同 run listing 在计划批准后继续有效；计划审批本身不使事实失效。
3. 任意 `run_process` 完成后清空目录缺失事实；写入/替换结果使目标及相关父级事实按最小范围更新或失效；`FILE_STALE`、路径冲突和未知错误不产生新鲜事实。
4. preflight 仅处理 `write_file`；未知事实返回 `allow`，由真实工具决定。已知父目录缺失时不进入授权或文件执行器，使用既有 `WORKSPACE_PARENT_NOT_FOUND` 语义返回有限可恢复结果。
5. 同一 completion 中多个目标共享同一已知缺失父目录时，每个 tool call 仍有 requested/result 配对，但只有首项给出根诊断，其余使用“同批写入因相同缺失父目录未执行”的有限摘要。

## 4. 任务清单

### T19-00：实施前基线、文档与 RED 证据

**输入：** 已批准 Spec、本 Task、当前脏工作树和本地 Next.js 16.3.3 文档。

**允许文件：** 本任务只读取；失败测试在各功能任务中编写。

- [x] 运行 `git status --short`，记录并保留所有既有修改，不 reset、stash、清理或覆盖无关文件。
- [x] 阅读本 Task 2.1 指定的两份 Next.js 本地文档，确认 `PlanApproval`/`TypingText` 保持 Client Component 边界，E2E 使用现有 Playwright 基础设施。
- [x] 运行当前专项基线：`pnpm exec vitest run tests/unit/client/typing.test.ts tests/unit/client/transcript.test.ts tests/unit/context/model-language.test.ts tests/unit/tools/schemas.test.ts tests/unit/agent/runtime-tools.test.ts tests/unit/agent/runtime-plan-mode.test.ts`。
- [x] 记录当前真实缺口：连续 16ms 尾字测试不存在、长 Markdown 计划 E2E 不存在、V7 断言不存在、known-missing-parent preflight 不存在。

**完成条件：** 只有只读基线记录；没有产品或测试文件修改。

### T19-01：durable 计划 Markdown 与真实 delta 动画 TDD

**覆盖：** AC19-01、AC19-02。

**文件：**

- 修改：`lib/client/typing.ts`
- 修改：`app/ui/workbench/typing-text.tsx`
- 修改：`app/ui/workbench/plan-approval.tsx`
- 修改：`tests/unit/client/typing.test.ts`
- 修改：`tests/e2e/support/fake-model-server.ts`
- 修改：`tests/e2e/plan-mode.spec.ts`

- [x] 先在 `typing.test.ts` 增加 RED：以 45 字形/秒连续调用 120 次、每次 16ms，从 `visible=0` 推进短尾部，断言最终到达 `total` 且余量有限；增加 catch-up 后最后 12 字形会继续出现、flush 清零余量、total 缩短不倒退越界。
- [x] 运行 `pnpm exec vitest run tests/unit/client/typing.test.ts`，确认旧返回类型或尾字停滞导致失败。
- [x] 按 3.1 冻结接口实现 `TypingProgress` 与余量消费；更新 `TypingText` 的 ref/state，不用 `setInterval`、任意 sleep 或每帧最少一字形的速率偷换。
- [x] 将 `PlanApproval` 的 `<pre><TypingText /></pre>` 替换为 `<MarkdownMessage content={item.content} />`；保持批准按钮、错误、aria 标题和状态逻辑不变。
- [x] 为 fake model 新增 `plan-long-markdown`：正文至少 1948 字符，含唯一二级标题、GFM 表格、列表、代码块和末尾标记 `计划尾部在批准前完整可见`。
- [x] 在 `plan-mode.spec.ts` 增加 RED/GREEN E2E：批准前断言末尾标记、heading、table、code 全部可见；点击批准只改变状态，不改变正文文本；刷新历史不重播动画。
- [x] 运行 `pnpm exec vitest run tests/unit/client/typing.test.ts tests/unit/client/transcript.test.ts` 和目标 Playwright 用例，确认通过。

**完成条件：** durable 计划不使用动画并正常渲染 Markdown；真实 delta 在 16ms 帧下最终完整显示。

### T19-02：System Prompt V7、3000 端口规避与无 Shell 契约 TDD

**覆盖：** AC19-03、AC19-04。

**文件：**

- 修改：`lib/context/system-prompt.ts`
- 修改：`lib/tools/schemas.ts`
- 修改：`tests/unit/context/model-language.test.ts`
- 修改：`tests/unit/context/token-estimator.test.ts`
- 修改：`tests/unit/tools/schemas.test.ts`
- 修改：`tests/integration/terminal/execution-precision.test.ts`

- [x] 先把相关测试期望升级为 V7，并增加 3.2 的五组语义断言；断言 normal/planning/executing 和全部 provider 请求都只含一份相同基础策略。
- [x] 运行目标 Vitest，确认因版本仍为 6、端口/无 Shell 文本缺失而失败。
- [x] 最小修改 `system-prompt.ts`：保留现有安全、语言、warning、write_file 与 service 规则，加入端口和无 Shell 顺序，不删除或弱化任何 V6 契约。
- [x] 最小强化 `run_process` 工具与参数描述，明确 `|`、`&&`、重定向和 `$VAR` 只作为普通参数，不新增 `env` 或 shell 字段。
- [x] 增加确定性轨迹：在模型请求中验证 V7；假模型先生成 `SERVER_PORT || 3001`、前端代理 3001、readiness 3001 的一致调用事实，且请求捕获中不出现 Shell 伪参数。
- [x] 运行 `pnpm exec vitest run tests/unit/context/model-language.test.ts tests/unit/context/token-estimator.test.ts tests/unit/tools/schemas.test.ts tests/integration/terminal/execution-precision.test.ts`。

**完成条件：** System Prompt V7 和工具 Schema 对三个 phase、所有 provider 一致；没有公共参数变化。

### T19-03：观察账本与 known-missing-parent preflight TDD

**覆盖：** AC19-05、AC19-06。

**文件：**

- 新增：`lib/agent/workspace-observations.ts`
- 新增：`tests/unit/agent/workspace-observations.test.ts`
- 修改：`lib/agent/runtime.ts`
- 修改：`tests/unit/agent/runtime-tools.test.ts`
- 修改：`tests/unit/agent/runtime-plan-mode.test.ts`

- [x] 先为纯模块写 RED：完整空 listing 推断直接子目录缺失；非空完整 listing 区分存在/缺失；truncated、blocked、ignored 或不覆盖父级时返回 `allow`；路径只使用规范化相对形式。
- [x] 写 RED：planning listing 在 plan approval 后可复用；`run_process` 结果清空缺失事实；成功目录创建后的重新 listing 允许写；未知事实不阻止工具。
- [x] 运行 `pnpm exec vitest run tests/unit/agent/workspace-observations.test.ts`，确认模块不存在而失败。
- [x] 实现 3.3 的纯内部接口；解析 list 输出时只接受现有稳定标签 `目录`、`文件`、`符号链接`、`已阻止`，并结合 metadata 的 `path/depth/truncated/ignoredEntries/blockedEntries/unsupportedEntries` 决定能否证明缺失。
- [x] 在 Runtime 写 RED：空根 listing 后同一 completion 六个 `server/...` 写调用都产生 requested/result，但授权器和文件执行器调用次数为 0；首项是 `WORKSPACE_PARENT_NOT_FOUND`，后五项为相同父目录的有限抑制结果。
- [x] 写 RED：mkdir 的 `run_process` 完成后旧缺失事实失效，重新 listing 后写入进入正常授权/执行；plan approval 不清空账本；旧 Session 恢复不恢复内存账本。
- [x] 最小接入 `runtime.ts`，保持 tool budget、串行顺序、审批、错误 streak、无进展保护和 assistant/tool 配对不变。
- [x] 运行 `pnpm exec vitest run tests/unit/agent/workspace-observations.test.ts tests/unit/agent/runtime-tools.test.ts tests/unit/agent/runtime-plan-mode.test.ts tests/unit/agent/recovery.test.ts`。

**完成条件：** fresh 事实已知缺失的写入不进入授权/执行；未知事实和真实安全检查保持原行为。

### T19-04：跨层空工作区确定性轨迹与安全回归

**覆盖：** AC19-03～AC19-06。

**文件：**

- 修改：`tests/integration/terminal/execution-precision.test.ts`
- 按需要修改：`tests/unit/agent/runtime-language-policy.test.ts`
- 按需要修改：`tests/unit/tools/registry.test.ts`
- 按需要修改：`tests/unit/tools/run-process.test.ts`（只做兼容回归，不修改环境继承）

- [x] 新增确定性 Plan Mode 轨迹：规划列空根、计划批准、显式 `mkdir -p server/... client/...`、重新 listing、批量写文件、安装、service readiness；断言首次写入前父目录已存在且零 `parent_not_found`。
- [x] 在夹具宿主设置 `PORT=3000`，生成后端固定使用 `SERVER_PORT || 3001`；断言 readiness URL 和代理均为 3001，不断言或修改 `run_process` 对 `PORT` 的继承。
- [x] 增加负轨迹：假模型仍对已知缺失父目录直接写时，preflight 有界拒绝且下一轮可通过 mkdir/list/write 恢复；没有重复副作用或第二个 run。
- [x] 增加无 Shell 参数检查：请求不得把 `|`、`&&`、`$PORT`、`>`、`$()` 作为诊断命令参数；原始文件内容中的这些字符不受影响。
- [x] 运行 `pnpm exec vitest run tests/integration/terminal/execution-precision.test.ts tests/unit/agent/runtime-language-policy.test.ts tests/unit/tools/registry.test.ts tests/unit/tools/run-process.test.ts`。

**完成条件：** 正确轨迹零可预防写入错误；错误轨迹被有限收口；端口配置跨文件一致。

### T19-05：Web 长计划 E2E 与恢复验证

**覆盖：** AC19-01、AC19-02、AC19-07。

**文件：**

- 修改：`tests/e2e/plan-mode.spec.ts`
- 修改：`tests/e2e/language-policy.spec.ts`（仅必要回归）
- 修改：`tests/e2e/support/fake-model-server.ts`
- 修改：`app/globals.css`（仅当 Markdown 计划复用现有样式后确有局部布局缺口）

- [x] 在桌面与 390×844 视口验证长计划：末尾、表格和代码块批准前可见；正文不会因按钮状态重新挂载或跳字；按钮仍可键盘操作。
- [x] 验证恶意 HTML 仍由 `skipHtml` 抑制，危险 URL 不进入可点击链接，计划正文不引入新的 HTML 渲染路径。
- [x] 验证批准、拒绝、刷新恢复、Plan Mode 开关锁定、独立危险工具审批和同 run ID 行为无回归。
- [x] 运行 `pnpm test:e2e -- --grep "Plan Mode|长计划|计划"`；若仓库脚本不转发筛选参数，改用 `pnpm exec playwright test tests/e2e/plan-mode.spec.ts tests/e2e/language-policy.spec.ts`，记录实际命令。

**完成条件：** 浏览器真实呈现满足 AC19-01/02，安全 Markdown 与审批行为不回归。

### T19-06：全量自动门禁、临时夹具与真实模型前停止点

**覆盖：** AC19-07；为 AC19-08 准备但不执行真实模型。

**文件：**

- 新增：`tests/manual/stage19-fixture.ts`
- 新增：`docs/development/19-real-agent-regression-terminal-acceptance.md`
- 修改：`docs/development/README.md`（只同步中间门禁状态）

- [x] 编写夹具脚本：仅在系统临时目录创建新的 `secode-stage19.*` 根、`.secode-stage19-marker` 和空工作区；不读取环境变量、不安装依赖、不初始化 Git、不复用任何阶段 17/18 或用户项目目录。
- [x] 运行夹具自检并记录绝对临时路径仅供本次人工操作；文档中只记录脱敏 basename/marker，不写 API Key 或完整环境。
- [x] 依次运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:coverage`、`pnpm test:e2e`、`pnpm build`、`git diff --check`；失败必须记录症状、根因、修正和完整重跑，不降低断言或跳过测试。
- [x] 在验收文档列出 AC19-01～07 的命令、通过数、失败修正、宿主限制和未运行项；执行秘密扫描，确认无 `.env.local` 值、Token、Cookie 或真实凭据进入 diff/日志。
- [x] 展示全部自动结果并立即停止，明确请求用户单独批准 T19-07；不得在同一回复中顺带启动真实模型任务。

**完成条件：** 自动门禁结果完整可审计，真实模型仍锁定。

### T19-07：独立授权后的真实模型回归与 Summary（已停止）

**停止记录：** 用户于 2026-08-30 在新的真实运行诊断后明确要求“新开一个阶段重新 Spec”。本任务不再接受单独授权，不得执行；其中仍有效的真实回归目标由阶段 20 Spec 的 `AC20-12` 重新定义。

**覆盖：** AC19-08。

**文件：**

- 修改：`docs/development/19-real-agent-regression-terminal-acceptance.md`
- 新增：`docs/development/19-real-agent-regression-fixes-summary.md`
- 修改：`docs/development/README.md`

- [ ] 只使用 T19-06 新建且 marker 校验通过的临时工作区创建新 Session，开启 Plan Mode，提交“实现轻量级前后端分离 Web 项目”的真实任务；不得把具体工具参数直接告诉模型。
- [ ] 计划待批时人工检查长 Markdown 的 heading/table/code/tail 已全部出现，再批准计划；计划审批不授权后续危险工具。
- [ ] 按需逐项审批目录创建、依赖安装、构建和 service 命令；不启用自动全权绕过本验收的独立审批观察。
- [ ] 验收事件不变量：目录创建先于首次写文件；正常路径零 `WORKSPACE_PARENT_NOT_FOUND`；没有 Shell 伪参数；新项目不用 3000；后端/前端端口各自一致；install/build/readiness/API/页面结果分别可追溯。
- [ ] 若真实模型失败，只按批准 Task 范围诊断；公共接口、安全边界或验收标准需要变化时立即回退 Spec，任务顺序或文件范围变化时回退 Task，不连续堆叠猜测修复。
- [ ] 回归完成后生成 Summary，记录实现文件、全部验证、失败修正、真实事件序号、剩余风险和阶段 20 影响；更新 README 为“Summary 待审批”并停止。

**完成条件：** 不再适用。阶段 19 不生成 Summary、不标记完成；后续以阶段 20 的审批链为准。

## 5. 验收映射

| 验收标准 | 任务 |
| --- | --- |
| AC19-01 | T19-01、T19-05 |
| AC19-02 | T19-01、T19-05 |
| AC19-03 | T19-02、T19-04、T19-07 |
| AC19-04 | T19-02、T19-04、T19-07 |
| AC19-05 | T19-03、T19-04、T19-07 |
| AC19-06 | T19-03、T19-04 |
| AC19-07 | T19-05、T19-06 |
| AC19-08 | T19-07 |

## 6. 文件边界

允许修改：

- `lib/client/typing.ts`、`app/ui/workbench/typing-text.tsx`、`app/ui/workbench/plan-approval.tsx`，以及确有必要时的局部计划样式；
- `lib/context/system-prompt.ts`、`lib/tools/schemas.ts`；
- `lib/agent/runtime.ts` 和新增纯内部 `lib/agent/workspace-observations.ts`；
- 对应 `tests/unit`、`tests/integration/terminal`、`tests/e2e`、`tests/manual`；
- 阶段 19 Task、验收、Summary 与开发索引。

禁止修改：

- Domain durable 事件、Storage、Model wire、Route Handler、审批公共接口、六工具名称/参数、`run_process` 环境继承；
- `.env.local`、用户项目、真实 Session 历史、依赖与锁文件、Git 历史、部署或发布配置；
- 与本 Spec 无关的 UI、Agent 能力、警告清理或架构重构。

## 7. 失败处理与回退

1. UI RED 不符合预期时先确认计划是 durable 事件而非 delta；不得通过延长等待时间掩盖尾字停滞。
2. V7 导致 token 预算或请求捕获失败时精简重复措辞，不删除 V6 安全契约或放宽语言门。
3. 观察账本无法安全证明缺失时必须返回 `allow`，交给真实工具检查；不得猜测不存在。
4. preflight 若破坏 assistant/tool 配对、审批或恢复，停止并修正内部接入，不新增第二套事件。
5. 真实模型三次独立修复仍在不同位置暴露相同架构耦合时停止并回到 Spec，不尝试第四个补丁。
6. 所有回退通过最小补丁完成，不 reset、stash、删除用户改动或降低测试断言。

## 8. Task 审批门禁

审批结果：用户于 2026-08-30 回复“批准”，阶段 19 Task 已通过。

T19-00～T19-06 已完成；T19-07 已由用户明确停止。阶段 19 保持未完成，后续只按阶段 20 Spec 审批链推进。
