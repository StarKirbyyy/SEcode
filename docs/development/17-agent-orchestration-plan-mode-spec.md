# 阶段 17 Spec 修订 6：大型工具输出分页、上下文有界投影与毒化历史恢复

## 1. 文档状态与审批门禁

- 当前状态：修订 6 已获用户批准；仅解锁 Task 修订 7 的编写，Task 获批前禁止修改产品代码或测试。
- 观察日期：2026-08-28（北京时间）。
- 修订 4 观察日期：2026-08-29（北京时间）。
- 修订 5 观察日期：2026-08-29（北京时间）。
- 修订 6 观察日期：2026-08-29（北京时间）。
- Spec 修订 3 审批日期：2026-08-29（北京时间）。
- 上一阶段：[`16-session-deletion-summary.md`](./16-session-deletion-summary.md) 已获用户批准。
- 修订 1：计划模式、同 run 审批执行和运行预算已经完成实现、自动验证及人工验收。
- 修订 2：固定 System Prompt、Context、Summary 和工具描述中文化已经完成实现、自动验证及人工验收；其 Summary 修订 2 尚未获用户最终审批。
- 修订 3 原因：用户在 Summary 修订 2 审批前报告真实 DeepSeek 交互仍持续输出英文；只读诊断证明现有“默认中文”只是软提示，Runtime 没有语言合规门，且仍有应用生成的英文工具标记。
- 修订 4 原因：用户在 Summary 修订 3 审批前指出默认模型请求次数上限不符合当前主流 coding agent 设计，并要求研究 Codex 与 Claude Code 后优化相关逻辑。只读研究和代码核对确认：当前默认 60 次请求会在仍有进展时提前失败，而项目已有工具预算、总时限、重复错误、无进展保护和上下文压缩，可以在不依赖默认请求次数门的情况下保持有界运行。
- 审批回退：修订 3 将改变模型响应接收、流式展示、有限重试和失败语义，属于 Agent 循环与用户可见行为的实质变化，因此依据 `00-process.md` 回到 Spec 门禁；修订 2 的 Task 授权不覆盖本次修正。
- 当前允许：编写并审阅 Task 修订 7，以及同步 Spec/Task/索引审批状态。
- 当前禁止：Task 修订 7 获批前修改产品代码或测试；禁止继续消费真实模型额度、修改/删除真实失败事件或临时样例、开始阶段 18、commit、push 或部署。
- 下一门禁：Task 修订 7 待用户明确批准；批准前不得开发。
- Spec 修订 1 审批：用户于 2026-08-28 明确回复“批准”。
- 修订 1 中间验收：用户于 2026-08-28 明确回复“阶段17终端人工验收通过”。
- Spec 修订 2 审批：用户于 2026-08-28 明确回复“批准”。
- 修订 2 中文终端验收：用户于 2026-08-28 回复“验证通过”。
- 修订 3 诊断结论：用户于 2026-08-28 回复“批准”，同意撤回 Summary 审批并进入 Spec 修订流程；该回复不是对尚未产出的 Spec 修订 3 的审批。
- Spec 修订 3 审批：用户于 2026-08-29 明确回复“批准”。
- 修订 3 实施结果：Task 修订 4、终端人工验收、全量验证和 Summary 修订 3 均已完成；Summary 尚未获批。
- 修订 4 审批回退：本次会改变运行预算公共接口、durable `run.started` 限制字段、Runtime 终止条件和 UI/Terminal 展示语义，依据 `00-process.md` 回到 Spec；Task 修订 4 的既有实现保留为基线，但不授权本次修改，Summary 修订 3 的审批等待撤回。
- 修订 4 用户调整：用户于 2026-08-29 要求把默认工具调用预算及其可配置硬上限统一调整为 300。
- Spec 修订 4 审批：用户于 2026-08-29 在要求上述确定性修订后明确表示“随后批准该 spec”；调整完成后该批准生效。
- 修订 4 实施结果：Task 修订 5、自动验证与 Summary 修订 4 均已完成；Summary 原处于待审批状态。
- 修订 5 审批回退：用户使用真实 LongCat Session 测试多文件 Next.js 登录系统后要求检查并“修复”。真实事件证明已批准验收未覆盖上下文摘要超时后的续跑、复杂任务墙钟预算、仓库指令/步骤顺序遵守和开发服务器就绪验证；这些变化会影响 Context/Runtime、公共预算、durable event、System Prompt 和 `run_process` 契约，依据 `00-process.md` 回到 Spec。
- Summary 修订 4 状态：审批等待已撤回；其实现与自动验证记录保留为历史基线，不再代表阶段 17 可验收完成。
- Spec 修订 5 审批：用户于 2026-08-29 在完整 Spec 生成后明确回复“批准”。
- 修订 5 实施结果：Task 修订 6 的 R5-01～R5-07 自动验证通过；R5-08 真实 LongCat 多文件回归因大型工具输出使 Context 在摘要选择前超过预算而未通过 `AC17-31`。
- 修订 6 审批回退：用户在看到真实失败 Summary 后要求“继续观察修复方案”。诊断证明修复需要改变 `read_file` 默认范围和模型可见工具结果投影语义，属于公共工具与 Context 契约变化，因此 Summary 修订 5 的审批等待撤回、Task 修订 6 不授权本次修改，流程回到 Spec。
- Summary 修订 5 状态：保留为真实失败与 R5 实施基线，不再处于最终审批门禁。
- Spec 修订 6 审批：用户于 2026-08-29 在完整诊断与方案提交后明确回复“批准”。
- 审批结果：本 Spec 修订 6 已批准，仅解锁 Task 修订 7 的编写。

审批链：

```text
阶段 17 修订 1 Plan Mode（实现与验收完成）
  → 修订 2 固定模型上下文中文化（实现与验收完成）
  → Summary 修订 2（因真实英文输出问题撤回审批）
  → 中文输出只读诊断（已完成）
  → 本 Spec 修订 3（已获用户批准）
  → Task 修订 4（已获批准并实施完成）
  → 中文输出强制实现与终端验收（已完成）
  → Summary 修订 3（已完成，因新预算需求撤回审批）
  → Codex / Claude Code 官方资料与本地实现只读研究（已完成）
  → 本 Spec 修订 4（已获用户批准）
  → Task 修订 5、运行预算优化实现与 Summary 修订 4（已完成）
  → 真实多文件 Agent 运行验收（失败并完成只读诊断）
  → 本 Spec 修订 5（已获用户批准）
  → Task 修订 6、R5-01～R5-08 与 Summary 修订 5（已执行；真实回归失败）
  → 大型工具输出只读重放与单变量诊断（已完成）
  → 本 Spec 修订 6（已获用户批准）
  → Task 修订 7（当前待用户审批）
```

### 1.1 修订 2 只读观察事实

本次只读检查覆盖 `lib/context`、`lib/tools`、`lib/agent`、`lib/approval`、`lib/model`、`lib/server` 和 `app` 的生产代码，并排除测试夹具和文档示例。观察期间未修改运行代码、未调用真实模型、未读取凭据。

发现的固定模型可见自然语言如下：

| 类别 | 当前状态 | 证据 |
| --- | --- | --- |
| 身份、安全、证据、完成策略 | 英文 | `lib/context/system-prompt.ts` |
| normal / planning / executing phase policy | 英文 | `lib/context/system-prompt.ts` |
| workspace、目标、摘要、计划决定和诊断包装标签 | 英文 | `lib/context/system-prompt.ts` |
| 上下文摘要 system/user 指令 | 英文；仅要求结果为中文 | `lib/context/system-prompt.ts`、`summary-generator.ts` |
| 计划批准/拒绝后注入的 user message | 英文 | `lib/context/message-renderer.ts` |
| 六个工具的 function description | 英文 | `lib/tools/schemas.ts` |
| 工具参数 description | 缺失 | Zod Schema 未设置字段级 `.describe()` |
| 工具 Schema 内部自定义校验文本 | 英文，但当前被 Registry 收敛为中文固定工具错误，不直接发送原文 | `lib/tools/schemas.ts`、`lib/tools/registry.ts` |
| planning phase 工具拒绝结果 | 中英混合 | `lib/agent/runtime.ts` |
| 工具执行摘要、风险原因和审批摘要 | 主要为中文 | `lib/tools/*`、`lib/approval/*` |

模型适配层没有额外注入其他 system message；它只映射 Context 生成的消息和工具定义。因此中文化入口可以集中在 Context、Tools 和 Runtime，不需要修改 DeepSeek、LongCat 或 Generic OpenAI 传输协议。

### 1.2 “所有模型可见内容”的固定边界

本修订把用户要求解释为：**所有由 SEcode 应用固定编写并发送给模型的自然语言说明必须使用中文**。范围包括 System Prompt、动态上下文包装、摘要指令、计划决定注入、工具/参数描述以及应用生成并回送模型的固定校验或能力错误。

以下内容必须保持原始事实，不得为追求表面全中文而翻译：

- 用户输入和用户填写的审批理由。
- 模型此前生成并持久化的 assistant/plan 正文。
- 工作区文件内容、搜索命中、命令 stdout/stderr 和外部服务原始响应。
- 文件路径、程序名、命令参数、符号名、哈希、版本号和模型 ID。
- 工具名、JSON 字段名、事件类型、phase/status、错误码及其他稳定协议标识。

这些原始事实可能包含英文，但不属于“SEcode 固定生成的自然语言描述”。擅自翻译会破坏代码、日志、哈希、可审计性或 OpenAI-compatible 工具协议。

### 1.3 修订 3 只读诊断事实

本次只读诊断没有修改代码、测试、会话或工作区文件。诊断使用当前生产代码、自动测试和真实 `.secode-data` 历史建立反馈环，并确认：

1. `lib/context/system-prompt.ts` 已为 V3，包含“默认使用中文”，但这是模型可违反的自然语言提示。
2. 真实 DeepSeek Session `0a7d326e-815f-45f6-87bd-862e0c90e668` 创建于 V3 更新之后；新 Session 的第一条 assistant 内容即以 `I'll start by understanding...` 开头，排除“只有旧历史导致首条英文”的假设。
3. 同一 Session 的五条 intermediate assistant 消息和计划提案均以英文自然语言开头；计划批准后的 executing 响应仍以英文开头。
4. Runtime 在 provider delta 到达时立即发布 `assistant.delta`，完成后只校验非空、大小与秘密脱敏，不检查输出语言。
5. 英文 assistant 内容被持久化并由 Context 和 provider continuation 原样带入下一次请求，形成英文自我强化。
6. 现有测试只证明固定 Prompt/Schema 含中文；确定性假模型本身固定返回中文，没有覆盖“真实模型先返回英文”的失败轨迹。
7. `list_directory` 的 `file/directory/symlink/blocked`、`run_process` 的 `[stdout]/[stderr]` 和输出截断标记属于应用新增且模型可见的英文，修订 2 将其错误归类为原始事实或稳定协议。
8. 工作区文件内容、搜索结果、真实 stdout/stderr、路径、命令、代码、模型 ID、工具名、JSON key、事件类型和错误码仍必须保持原样；它们可能合法包含英文，不属于本缺陷。

诊断后的根因排序：

| 排名 | 根因 | 结论 |
| --- | --- | --- |
| 1 | 中文要求只有软提示，Runtime 无语言合规门 | 已证实，是首条英文和最终英文可被接受的直接原因 |
| 2 | 英文 assistant 历史与 continuation 强化后续语言 | 已证实，是后续持续英文的重要放大因素 |
| 3 | 原始仓库/命令事实含大量英文 | 已证实，会影响模型但不能通过翻译解决 |
| 4 | 应用固定英文工具标记遗漏 | 已证实，范围有限但必须修正 |
| 5 | 仅由旧 Session 历史导致 | 已否证；全新 Session 第一条响应已为英文 |

## 2. 用户需求的固定解释

用户在每次提交任务前选择是否开启 Plan Mode：

```text
Plan Mode 关闭（默认）
  → 正常模式
  → Agent 观察、修改、验证并总结

Plan Mode 开启
  → Agent 进入 planning phase
  → 只能使用只读工具检查项目
  → 生成一份完整计划
  → 暂停，等待用户审批
      ├── 用户同意 → 同一个 run 进入 execution phase
      │               → 解锁正常工具、修改、验证并总结
      └── 用户拒绝 → 当前 run 安全取消，不执行计划
```

关键语义：

1. Plan Mode 是一个布尔开关，不是让用户在 `plan` 与 `execute` 两种独立 run 之间切换。
2. 开启后，规划和执行属于同一个 run、同一个用户目标和同一条可审计事件链。
3. 完整计划生成后必须暂停；没有用户同意事件，写文件和进程工具永远不能执行。
4. 用户同意计划后自动恢复同一 run 的 Agent 循环，不要求再次输入“请执行”，也不创建第二个 Session/run。
5. 关闭 Plan Mode 时维持现有正常 Agent 行为，不增加计划审批等待。
6. 首版拒绝计划会安全结束当前 run；计划修改、多轮协商可通过新任务继续，不在本阶段实现计划版本编辑器。

## 3. 阶段目标

本阶段把当前 Agent 升级为：

- 具有版本化、可组合、可测试且中文强制的 System Prompt V4。
- 所有由应用固定生成的模型可见自然语言使用中文，新 assistant 可见叙述通过 Runtime 合规门。
- 六个工具同时具有中文功能描述和中文参数级说明，减少参数误用。
- 具有用户可选的 Plan Mode 审批门禁。
- 规划阶段在能力层严格只读，而不只依赖模型遵守提示词。
- 用户批准后在同一 run 内安全切换到正常执行阶段。
- 分别统计模型请求和工具调用，不再把模型请求误称为“任务轮次”。
- 通过模型请求预算、工具预算、总时限、重复错误和无进展保护限制循环。
- 保持阶段 03–16 的 JSONL 历史可恢复，不重写旧数据。

本阶段继续自行实现所有编排，不引入 LangChain、AI SDK、OpenAI Agents SDK 或其他 Agent 框架。

## 4. 新增需求标识

| ID | 需求 |
| --- | --- |
| FR-012 | 每次业务模型请求注入版本化 System Prompt，明确事实、工具、修改、验证、失败恢复和完成规则；修订 3 将版本升级为 V4。 |
| FR-013 | 用户可为每个任务开启或关闭 Plan Mode；开启后 Agent 先生成完整计划，用户批准前不得执行写入或进程工具。 |
| FR-014 | 用户批准计划后，同一个 run 自动进入执行阶段；拒绝或取消时不执行计划。 |
| FR-015 | 分别记录模型请求数和工具调用数，不再把模型请求显示为含混的“任务轮次”。 |
| FR-016 | 所有由 SEcode 固定生成并发送给模型的自然语言说明使用中文；修订 3 不再提供自然语言方式的英文输出豁免。 |
| NFR-010 | 既有 JSONL 的 `iteration/iterations/maxIterations` 必须继续解析、恢复和展示，不做破坏性迁移。 |
| NFR-011 | 计划开关、审批、阶段、预算和进度在终端、HTTP、Web 与恢复投影中语义一致。 |
| NFR-012 | 核心和终端自动/人工验收通过后才能开发 Web Plan Mode UI。 |
| NFR-013 | 六个工具的功能描述、参数级说明和模型可见固定校验文本必须使用中文，并在 normal/planning 与全部模型提供方间保持一致。 |
| SEC-010 | planning phase 使用工具定义过滤和 Runtime 二次能力校验，模型伪造写工具也不能获得执行或审批能力。 |
| SEC-011 | 计划批准是独立于危险工具审批的显式用户决定，不得复用历史工具批准或自动批准。 |
| SEC-012 | 中文化不得翻译或改写用户输入、历史模型正文、仓库内容、进程输出、路径、命令、哈希或稳定协议标识。 |

本 Spec 修订 3 获批后的 Task 修订 4 必须把 `FR-017`～`FR-018`、`NFR-014`、`SEC-013` 写入 `01-requirements.md` 并建立实现与验收追踪。

## 5. 观察范围、方法与基线

### 5.1 只读观察范围

检查了：

1. `00-process.md` 与阶段 09、10、11、12、15、16 的已批准文档。
2. `lib/context/system-prompt.ts`、message renderer、history projector、summary 和 token 预算。
3. `lib/agent` 请求 Schema、Runtime 循环、工具编排、审批等待、恢复、投影和限制测试。
4. `lib/domain/event.ts` 的 strict durable event Schema。
5. Terminal 命令和状态、Server run DTO、Client event projection、Transcript 和 Details Drawer。
6. 当前依赖 hash、测试和 dirty worktree。

### 5.2 观察验证

```text
pnpm exec vitest run \
  tests/unit/agent \
  tests/unit/context \
  tests/unit/terminal \
  tests/unit/client/event-state.test.ts \
  tests/unit/client/transcript.test.ts
```

结果：33 个测试文件、192 项测试全部通过。阶段 16 最终全量基线为 102 个 Vitest 文件 / 767 项测试、24 项 E2E。

```text
package.json     5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13
pnpm-lock.yaml   5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683
```

观察和本次修订未修改业务代码、未安装依赖、未调用真实模型、未读取 API Key，也未生成 Task 或 Summary。

## 6. 当前实现事实与缺口

### 6.1 System Prompt 已存在但不完整

当前固定 policy 已覆盖单工作区、工具事实、结构化工具、危险审批、最小修改、验证、秘密保护和最终总结，并与动态 workspace memory 分开注入。

缺少：

- 正常模式的自主完成协议。
- planning/execution phase 的不同约束。
- 完整计划输出格式。
- 用户批准计划的可信事件含义。
- 首次验证失败后的继续诊断要求。
- 禁止盲目重复和避免过早结束的规则。
- 多文件任务的范围、验证和完成检查。

### 6.2 Plan Mode 不存在

当前没有：

- `planningEnabled` 请求字段。
- planning/execution phase。
- durable 计划提案与计划审批事件。
- `awaiting_plan_approval` 状态。
- 规划阶段的只读工具集合和能力门。
- 计划同意/拒绝的 Runtime API、Terminal 命令、HTTP endpoint 或 Web 控件。
- 计划批准后在同一个 run 内继续执行的上下文投影。

所有任务目前都直接进入正常执行循环。

### 6.3 当前 iteration 的真实语义

Runtime 每次 durable 提交 `model.requested` 后将 `active.iterations` 加一；它表示业务模型请求数。一次模型响应可以包含多个 tool call，这些调用都属于同一个 iteration，并按顺序执行；工具完成后下一次模型请求再增加 iteration。

例如：

```text
模型请求 1 → read_file
模型请求 2 → final
```

当前 UI/终端称其为“2 轮”，容易被误解为两个任务步骤；Details Drawer 还固定显示 `/30`。上下文摘要模型调用不计入 iteration，这是正确行为。

### 6.4 历史兼容硬约束

1. `run.started.limits.maxIterations`、`model.*.iteration` 和终态 `iterations` 已进入 JSONL。
2. Agent、Context、Storage、Client、Terminal 和测试依赖这些字段恢复连续性。
3. durable data 使用 strict Zod Schema；直接删改字段会破坏历史 Session。
4. iteration 仍适合作为模型请求配对序号，不能改成工具数、计划数或用户任务数。
5. 工具调用数可以从 `tool.requested`/投影集合得出。
6. Plan Mode 会改变执行能力，必须在 `run.started` 中 durable 记录，不能只保存在 UI。
7. 用户计划审批与危险工具审批含义不同，不能共用 approvalId、pending capability 或历史授权。

## 7. 范围边界

### 7.1 范围内

- System Prompt V4 的组合、版本、中文强制契约和测试。
- Context memory、summary prompt 与计划决定 synthetic message 中文化。
- 六工具 function/parameter descriptions 与固定校验文本中文化。
- 每个任务的 `planningEnabled` 开关。
- 同一 run 的 `planning → awaiting_plan_approval → executing` 生命周期。
- durable 计划提案、批准/拒绝事件及恢复投影。
- planning phase 只读工具定义和 Runtime 二次拒绝。
- 用户批准后自动恢复同一 Agent 循环。
- 模型请求、工具调用和无进展预算。
- 历史 wire 字段兼容与准确 UI 文案。
- Domain、Agent、Context、Terminal、Server、Client、Web 的一致接线。
- Terminal 优先人工验收，再开发 Web UI/E2E。
- 中文化实现限定在 `lib/context`、`lib/tools`、必要的 `lib/agent/runtime.ts` 与对应测试；除非 Task 证明存在新的模型消息入口，否则不修改 UI、Route 或模型传输。

### 7.2 范围外

- 独立 plan run 与 execute run。
- 计划文件、第二数据库、Markdown artifact 或工作区写入。
- 用户直接编辑计划、计划版本树、多轮 plan revision 或逐项打勾。
- 未经批准自动执行计划。
- 多 Agent、子 Agent、并行工具或分布式任务队列。
- 新工具、OS 沙箱、容器、Git commit/push、部署。
- 修改模型传输、SSE、工具具体实现或危险操作风险等级。
- 安装生产依赖或 Agent SDK。
- 阶段 18 README.txt、视频和最终提交。

## 8. 核心状态模型

### 8.1 用户输入契约

```ts
interface AgentRunRequest {
  sessionId: SessionId;
  prompt: string;
  planningEnabled?: boolean; // default false
  limits?: AgentRunLimits;
  thinking?: ModelThinkingOptions;
}
```

默认 `false` 保持现有正常模式。该值属于 run，不固定在 Session；每次新任务或 follow-up 都可重新选择。

### 8.2 Runtime phase

```ts
type AgentRunPhase =
  | "normal"
  | "planning"
  | "awaiting_plan_approval"
  | "executing";
```

- `normal`：Plan Mode 关闭，现有观察/修改/验证流程。
- `planning`：Plan Mode 开启，只读观察并生成计划。
- `awaiting_plan_approval`：计划已 durable 提交，Agent 循环暂停。
- `executing`：用户已批准，完整工具能力解锁，同一 run 执行已批准计划。

外部 `RunStatus` 增加 `awaiting_plan_approval`；其余 requesting/approval/tool/terminal 状态继续使用。phase 和 status 是不同概念：executing phase 内仍会出现 `requesting_model`、`awaiting_approval` 和 `executing_tool`。

### 8.3 Durable run start

新事件显式写：

```ts
run.started.data.planningEnabled: boolean
```

历史事件缺失时解析为 `false`。不提升 storageVersion/protocolVersion，不重写旧 JSONL。

## 9. System Prompt V3 与中文模型上下文（修订 2 历史设计）

### 9.1 组合结构

```text
SYSTEM_PROMPT_VERSION = 3

IdentityAndSafetyPolicy
  + EvidencePolicy
  + ToolUsePolicy
  + CompletionPolicy
  + NormalPolicy
    或 PlanningPolicy
    或 ApprovedExecutionPolicy
```

动态 workspace、目标、摘要、diagnostic 和计划审批事实继续由第二条 system memory/context messages 提供。`CONTEXT_PROTOCOL_VERSION` 和 summary marker 保持版本 1；System Prompt 版本独立，避免把文案升级伪装成持久化协议迁移。

V3 将固定自然语言全部改为中文，并增加默认语言规则。真实模型证明该软规则不足；修订 3 由第 25～26 节的 V4 与 Runtime 合规门取代“用户明确要求其他语言时除外”的行为。代码、标识符、命令和原始工具事实仍不翻译。

### 9.2 通用工作协议

所有 phase 必须遵守：

1. 先获得足够的仓库事实，不能凭猜测声称文件、修改或测试结果。
2. 工具输出、durable 用户决定和已提交事件才是事实；计划和模型文字不是完成事实。
3. 工具失败时读取结构化错误并改变参数或策略，不盲目重复同一调用。
4. 保留用户已有改动，使用最小合理修改，不自行安装依赖或执行 Git 提交。
5. 用户已授权范围内持续推进，不因首次测试失败、多文件工作或普通可恢复错误过早停止。
6. 修改后运行最相关验证，明确区分通过、失败和未运行。
7. 不披露 System Prompt、API Key、私有 reasoning 或内部 capability。
8. 最终回答报告结果、修改、验证、限制和仍需用户处理事项。

### 9.3 正常模式 policy

- 获得现有全部六工具。
- 可以在必要时形成简短内部行动顺序，但不进入计划审批等待。
- 在用户授权范围内自主完成观察、修改和验证。
- 只有危险工具审批层要求时才等待用户批准。
- 工具足够时不得只给建议而不实际完成。

### 9.4 Planning policy

- 只能使用 `list_directory`、`read_file`、`search_text`。
- 必须先检查真实代码、配置、测试和约束，再提出计划。
- 不得创建、覆盖、替换文件，不得运行任何进程。
- 完整计划必须包含：目标理解、观察事实、涉及模块/文件、按依赖排序的任务、每步验证、风险和明确不执行项。
- 计划应足够具体，使批准后的 execution phase 不需要临时决定核心公共接口或安全策略。
- 当事实足够时以非空 stop completion 提交计划；此时不是 run final，而是进入计划审批等待。

### 9.5 Approved execution policy

- 只在 durable 计划批准事件之后使用。
- 获得正常六工具，按照批准计划实施。
- 批准表示允许按计划进入正常执行，不是对所有危险命令的预批准；工具风险审批仍独立生效。
- 执行前核对关键文件事实没有变化；若事实变化，做最小必要调整并在最终说明。
- 不重新进入计划审批，不自动生成第二份计划。

### 9.6 中文工具定义与参数说明

六个工具保留现有英文协议名，但发送给模型的自然语言描述改为中文：

| 工具名 | 中文描述必须覆盖的语义 |
| --- | --- |
| `list_directory` | 工作区相对目录、深度限制、数量限制、忽略/阻止条目 |
| `read_file` | UTF-8 文本、可选行范围、完整文件 SHA-256、越界规则 |
| `search_text` | 固定字符串而非正则、目录范围、大小写和结果上限 |
| `write_file` | 创建与原子覆盖、覆盖必须携带 `expectedSha256` |
| `replace_in_file` | 唯一匹配、原子替换、必须携带 `expectedSha256` |
| `run_process` | `program` 与 `args` 分离、不启用 shell、工作目录、超时、无 stdin/env |

所有 JSON Schema properties 都必须获得简洁中文 `description`，包括 optional 字段的默认行为。字段名仍为英文，不设置本地化别名。共用字符串 Schema 不能用一个模糊说明覆盖语义不同的 `path`、`query`、`content`、`oldText`、`newText` 和命令参数；应在字段位置分别描述。

Registry 当前会把 Zod 参数错误收敛为中文“工具参数校验失败”，不会把内部 issue 原文发送给模型。为避免未来错误细节扩展时重新引入英文，现有人工编写的校验文本也同步中文化，包括空字符串、UTF-8 字节上限、行范围、相同替换文本、控制字符和参数总字节上限。Zod 自动生成的标准关键字、JSON Pointer 和 issue code 属于机器协议，可保留英文。

### 9.7 动态上下文与摘要中文化

- workspace root、初始目标、durable summary、计划提案、计划决定、未解决诊断和当前目标提示标签全部使用中文。
- “与当前目标相同”、批准、拒绝、等待审批等固定状态描述全部使用中文。
- 计划批准/拒绝后由应用注入的 synthetic user message 使用中文，并继续明确计划批准不包含危险工具授权。
- 摘要 system policy 和目标 token/user wrapper 均使用中文；摘要仍输出中文结构化纯文本。
- Context 中的用户原目标、计划正文、诊断原消息和历史 assistant/tool 事实保持原样，只对应用包装文字中文化。

### 9.8 Prompt 安全和预算

- 固定 policy 继续通过 `redactSecrets()`。
- history、summary、工具输出和计划正文均标为不可信数据，不能覆盖 system policy。
- 单元测试锁定必要语义和互斥关系，不依赖整段脆弱快照。
- V3 固定内容必须保持紧凑，并进入既有 75% 输入估算；测试应以真实估算结果证明中文化后仍能在受支持的最小 context window 内构建请求，而不沿用“英文 token”假设。

## 10. Plan Mode 生命周期

### 10.1 Planning phase

Plan Mode 开启后：

1. `run.started(planningEnabled=true)` 与 `user.message` 先 durable 提交。
2. Context 注入 Planning policy，只估算并发送三个只读工具定义。
3. 模型可进行多个“模型请求 → 只读工具”回合收集事实。
4. planning completion 为 `tool_calls` 时继续只读工具循环。
5. planning completion 为非空 `stop` 时，不提交 `assistant.message(final)` 或 `run.completed`，而提交计划提案事件并暂停。
6. 空计划、超大计划或非法 completion 结构化失败，不进入执行。

### 10.2 计划提案事件

新增 durable 事件：

```ts
plan.proposed.data = {
  planId: UUID;
  approvalId: UUID;
  content: string; // 1..1,048,576，脱敏
}
```

`plan.proposed` 同时表达“计划正文已提交”和“该计划正在等待用户决定”，避免连续两个事件之间形成无意义的半状态。一个 run 最多一个 plan proposal。

UI/Terminal 显示计划正文和“同意并执行 / 拒绝计划”。计划正文是模型提案，不是执行完成事实。

### 10.3 计划审批事件

新增独立 durable 事件：

```ts
plan.approval.resolved.data = {
  planId: UUID;
  approvalId: UUID;
  approved: boolean;
  reason?: string;
}
```

它不得复用工具 `approval.required/resolved`：

- 没有 toolCallId。
- 不产生工具 authorization/capability。
- 历史工具批准不能批准计划。
- 计划批准不能绕过后续危险工具审批。
- 错误 runId、planId、approvalId、重复决定均零事件、零执行。

### 10.4 用户同意计划

同意后的顺序固定：

```text
验证 active pending plan
  → durable plan.approval.resolved(approved=true)
  → 清除 planning completion continuation
  → phase = executing
  → 重新构建 durable context
  → 注入 ApprovedExecutionPolicy + 已批准计划事实
  → 请求模型并继续同一个 run
```

必须先 durable 提交批准，再暴露写/进程工具。若批准事件提交失败，不切换 phase、不执行任何工具。

清除 provider continuation，确保执行请求完全依据 durable messages 重建，而不是依赖 planning stop 后的私有 provider 状态。模型上下文应把 plan proposal 映射为 assistant plan，再把用户批准映射为有限 user/system 事实。

### 10.5 用户拒绝计划

拒绝顺序：

```text
plan.approval.resolved(approved=false, reason?)
  → run.cancelled(reason="用户拒绝执行计划")
```

拒绝后没有写工具、进程、工具审批或自动重规划。用户可在下一条任务中补充意见并重新开启 Plan Mode。

### 10.6 取消、超时和连接

- planning、等待计划审批和 executing 都响应同一 AbortSignal。
- 等待计划审批计入现有 10 分钟总时限；超时按 `AGENT_RUN_TIMEOUT` 结束。
- 用户取消、HTTP stream 断开或关闭页面按既有取消语义结束。
- 进程重启仍按既有策略把 open run 标为 interrupted；首版不跨进程恢复 pending plan capability。
- plan proposal 和决定事件仍可在历史中审计；interrupted plan 不能事后继续批准。

## 11. Planning 能力边界

### 11.1 工具集合

```text
planning phase → list_directory, read_file, search_text
normal/executing phase → 全部六工具
```

planning 不开放 `write_file`、`replace_in_file` 或 `run_process`。即使命令看似只读，package scripts、hook 和未知 executable 仍可能写入，所以首版不允许任何进程能力。

### 11.2 双层阻断

1. 模型请求只包含 phase 允许的工具 definitions。
2. Runtime 在 prepare/approval 前再次检查 phase。

模型伪造禁用调用时返回结构化 `TOOL_PHASE_DENIED` ToolResult：

- 不调用 prepare。
- 不产生 `approval.required` 或 `tool.started`。
- 不获得 authorization。
- 不调用 executor。
- 计入工具调用预算和重复错误保护，并反馈给模型修正。

计划批准后的 phase 切换必须发生在 durable resolved 之后；只修改 UI state 不能解锁工具。

## 12. 运行预算与进度语义

### 12.1 独立预算

```ts
interface AgentRunLimits {
  maxModelRequests?: number;
  maxToolCalls?: number;
  maxDurationMs?: number;
}

interface AgentRunProgress {
  modelRequests: number;
  toolCalls: number;
  repeatedNoProgressReads: number;
}
```

- `modelRequests`：当前 run 的业务模型请求，包括 planning 和 executing；上下文摘要请求不计入。
- `toolCalls`：模型返回的每个归一化调用，包括非法、未知、phase 拒绝和参数错误调用。
- `maxDurationMs`：完整 run 总时限，包括等待计划审批。
- `repeatedNoProgressReads`：连续得到相同稳定事实的相同只读调用次数。

“任务轮次”不再作为公共计数概念；planning 与 executing 是 phase，计划条目不是安全预算。

### 12.2 默认和硬上限

| 预算 | 默认 | 硬上限 |
| --- | ---: | ---: |
| 业务模型请求 | 60 | 120 |
| 工具调用 | 120 | 240 |
| 总时限 | 600000ms | 600000ms |
| 相同只读无进展 | 3 | 3 |
| 相同工具错误 | 3 | 3 |

Plan Mode 的规划和执行共享同一组总预算，不在批准后重置，防止一个逻辑任务获得两倍无限循环空间。

### 12.3 历史 wire 兼容

既有 durable 字段保留：

```text
model.requested.data.iteration
model.completed.data.iteration
run.*.data.iterations
run.started.data.limits.maxIterations
```

这些字段继续表示模型请求序号/数量。代码内部和 UI 使用 `modelRequests` 术语，在 durable 边界映射。新 `run.started.limits` 增加 `maxToolCalls`；旧历史缺失时按旧模型预算和默认工具预算恢复。

HTTP 新输入使用：

```json
{
  "planningEnabled": true,
  "limits": {
    "maxModelRequests": 60,
    "maxToolCalls": 120,
    "maxDurationMs": 600000
  }
}
```

`maxIterations` 暂作为 `maxModelRequests` 的废弃输入别名；两者同时出现返回 400。公开 config 返回准确的新字段。

### 12.4 工具批次原子限制

模型完成后先检查整个 tool-call batch。若当前工具数加 batch size 超限：

- 不提交该批任何 `tool.requested`。
- 不 prepare、审批或执行其中任何调用。
- 以 `AGENT_TOOL_CALL_LIMIT` 失败。
- 保留已经 durable 的 `model.completed(tool_calls)` 事实。

不得只执行预算内的批次前半部分。

### 12.5 无进展保护

保留连续三次相同工具错误规则，并增加只读成功无进展保护：

- 只用于 `list_directory/read_file/search_text`。
- 签名包含 tool name、canonical public arguments 和去除易变 metadata 后的稳定 result。
- 完全相同签名连续三次时以 `AGENT_NO_PROGRESS_LIMIT` 失败。
- 参数、文件 hash、输出变化或任何写/进程工具都会重置 streak。

### 12.6 展示语义

- Transcript 把“第 N 轮”改为“模型请求 N”。
- Terminal `/status` 显示 Plan Mode/phase、模型请求 `x/y`、工具调用 `a/b`。
- Web Details Drawer 使用事件中的实际预算，不硬编码 30。
- terminal outcome 显示“模型请求 N 次、工具调用 M 次”。
- 旧历史也使用“模型请求”术语。

## 13. 分层接口设计

### 13.1 Domain / Agent

- `planningEnabled`、phase、计划事件 Schema 和新错误码。
- Projection 验证 proposal 唯一、审批匹配、批准前零写工具、拒绝后终态。
- Runtime 独立 plan waiter 和 resolve API，不复用工具 approval waiter。
- phase 对应工具 definitions 和 Runtime gate。
- planning stop 转 proposal；approved 后继续同 run；rejected 后取消。
- 模型/工具预算与无进展保护。
- Snapshot/outcome 暴露 planning、phase、modelRequests、toolCalls 和实际上限。

### 13.2 Context

- Context request/history 携带 `planningEnabled`、phase 和 plan facts。
- System Prompt V4 根据 normal/planning/approved execution 选择唯一中文 overlay，并在 Memory 后追加唯一输出语言 system policy。
- planning 时 token 估算只包含三个工具；normal/executing 包含六工具。
- proposal 映射为 assistant plan；approved decision 映射为有限用户批准事实。
- summary/compaction 保留计划、批准/拒绝和未完成状态，不能把计划写成完成。

### 13.3 Terminal 优先

空闲时：

```text
/plan on
/plan off
```

等待计划审批时：

```text
/approve-plan [原因]
/reject-plan [原因]
```

- Plan Mode 默认 off，只影响下一次任务。
- active run 期间不能切换 `/plan on|off`。
- `/approve`、`/reject` 继续只用于危险工具审批，不能处理计划。
- `/status` 显示开关、phase、pending plan 和两类预算。
- 自动测试和临时工作区人工验收通过前，不进入 HTTP/Web 实现。

### 13.4 Server / HTTP

- Run DTO 增加 `planningEnabled` 与新预算字段/旧别名冲突校验。
- Run NDJSON stream 在 `awaiting_plan_approval` 期间保持打开。
- 新 endpoint：

```text
POST /api/runs/[runId]/plans/[approvalId]
body: { approved: boolean, reason?: string }
```

- Server Application 校验 active run/pending plan，并调用独立 Runtime plan resolution。
- 错误 run/approval/repeat 为有限 404/409；Host/Origin/size guard 与工具审批 route 一致。
- 计划 endpoint 不返回计划全文、路径、capability 或秘密。

### 13.5 Client / Web

- Home 和 Session Composer 增加“先规划后执行”开关，默认关闭。
- 提交后 active 期间开关禁用，不能改变已开始 run。
- `plan.proposed` 在纯文本 Transcript 中显示完整计划和独立审批区。
- 按钮为“同意计划并开始执行”和“拒绝计划”。
- 同意只调用计划审批 endpoint；不能创建第二 run 或伪造用户消息。
- resolved approved 到达后 UI 显示执行已开始，继续消费同一 NDJSON stream。
- 工具审批仍显示在相应 tool item，不与计划审批混合。
- 刷新/断线按 durable history 协调；若 run 已因断线取消/interrupted，则按钮禁用并显示真实状态。

## 14. 错误模型

| 错误码 | recoverable | 触发 |
| --- | --- | --- |
| `AGENT_PLAN_OUTPUT_INVALID` | true | planning stop 缺少有效非空计划或超过上限 |
| `AGENT_PLAN_APPROVAL_NOT_PENDING` | true | 当前 run 没有等待中的计划 |
| `AGENT_PLAN_APPROVAL_INVALID` | true | planId/approvalId/重复决定不匹配 |
| `AGENT_TOOL_CALL_LIMIT` | false | 下一完整工具批次超过工具预算 |
| `AGENT_NO_PROGRESS_LIMIT` | false | 相同只读调用连续三次返回相同稳定事实 |
| `TOOL_PHASE_DENIED` | true | planning phase 请求写、replace 或 process 工具 |

非法 `planningEnabled`、预算冲突或越界使用现有 `AGENT_INPUT_INVALID` / `API_REQUEST_INVALID`。错误 details 只保留 phase、ID、计数、上限和工具名，不包含 prompt、计划全文、路径全文、输出或秘密。

## 15. 数据流

### 15.1 正常模式

```text
run request(planningEnabled=false)
  → run.started
  → NormalPolicy + 六工具
  → model/tool loop
  → final + terminal
```

### 15.2 Plan Mode

```text
run request(planningEnabled=true)
  → run.started + user.message
  → phase planning
  → PlanningPolicy + 三只读工具
  → model/read-only-tool loop
  → stop plan
  → plan.proposed
  → phase awaiting_plan_approval
      ├── reject
      │     → plan.approval.resolved(false)
      │     → run.cancelled
      └── approve
            → plan.approval.resolved(true)
            → phase executing
            → ApprovedExecutionPolicy + 六工具
            → model/tool loop
            → final + terminal
```

## 16. 验收标准

### AC17-01：System Prompt V4

- 每个业务请求包含中文通用 V4 policy、当前 phase 唯一中文 overlay 和最后一条输出语言 policy。
- normal、planning、approved execution 不会同时注入。
- prompt 明确事实、自治、验证、错误恢复和完成规则。
- prompt 明确新 assistant 可见自然语言必须使用简体中文，不提供自然语言英文豁免。
- summary 请求不获得业务工具或 plan approval capability。

### AC17-02：开关语义

- 默认关闭时行为与当前正常模式一致，不等待计划批准。
- 开启时必须先产生 plan proposal，批准前没有写/进程调用。
- active run 不能修改开关。
- `run.started` durable 记录开关；旧历史默认关闭。

### AC17-03：规划阶段只读

- 模型只收到三个只读工具 definitions。
- 伪造 write/replace/process 时零 prepare、approval、started 和 executor。
- 临时工作区全树 hash 在 plan proposal 前后不变。
- 计划包含观察事实、模块/文件、任务顺序、验证和风险。

### AC17-04：批准后同 run 执行

- proposal 后 run 状态为 `awaiting_plan_approval`，没有 terminal。
- 用户批准先 durable resolved，再出现下一次模型请求或工具调用。
- runId、原目标和累计预算不变化、不重置。
- execution 获得六工具，完成真实修改、验证和 final。
- 批准计划不预批准危险工具。

### AC17-05：拒绝与取消

- 拒绝产生 resolved(false) 和唯一 cancelled terminal。
- 拒绝后零写工具、零 process、零自动重规划。
- planning/等待/执行期间取消和总超时都形成唯一终态。

### AC17-06：计划审批身份

- 错误 runId、approvalId、重复批准、工具 approvalId 均不能批准计划。
- 计划批准 API 不泄露 capability 或计划全文。
- durable 提交失败时不切换 execution。

### AC17-07：模型请求与工具计数

- 一个模型响应含两个工具：modelRequests +1，toolCalls +2。
- 工具后 final：模型请求总数为 2，UI 不称“2 轮任务”。
- planning 和 executing 共享累计计数。
- context summary 不增加业务 modelRequests。

### AC17-08：独立预算

- 默认/最大模型请求为 60/120，工具调用为 120/240。
- 精确允许最后一次请求和完整工具批次；下一次/下一批失败。
- 工具批次跨限时整批零执行。
- UI/Terminal 使用实际上限，不硬编码 30。

### AC17-09：无进展保护

- 连续三次相同只读稳定事实停止。
- 参数、hash、输出变化或写/进程工具重置 streak。
- 既有连续三次相同错误规则保持。

### AC17-10：历史兼容

- 阶段 09–16 的旧 JSONL 可读取、恢复和展示。
- 旧历史 `planningEnabled=false`，iteration 显示为模型请求。
- 不重写 JSONL、不提升 storageVersion、不破坏 tool pairing/compaction。

### AC17-11：终端优先

- `/plan on|off`、`/approve-plan`、`/reject-plan`、`/status` 可人工测试。
- 自动临时 fixture 证明批准前 hash 不变、批准后按计划修改和测试。
- Terminal Summary 获人工结果记录后才允许开发 HTTP/Web。

### AC17-12：Web E2E

- 开关关闭的原 Agent workflow 无回归。
- 开关开启时先出现计划和审批按钮。
- 同意后同一 run 开始执行；拒绝后安全结束。
- active 锁定、刷新事实、移动端键盘和两种审批不混淆。

### AC17-13：全量质量门禁

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
git diff --check
```

package/lock hash不变；没有真实 Key、真实用户项目写入、依赖安装、Agent SDK、Git push 或部署。

### AC17-14：固定模型上下文中文覆盖

- 身份/安全、证据/完成、normal/planning/executing policy 的固定自然语言全部为中文。
- workspace memory、摘要包装、计划状态、诊断标签和计划决定 synthetic message 的固定自然语言全部为中文。
- 摘要 system message 与 user wrapper 全部为中文，摘要仍只输出中文结构化纯文本。
- planning phase 能力拒绝的 summary/message 不再中英混合。
- 生产代码中所有应用自有的模型消息入口都有测试清单；新增入口必须显式登记语言契约。

允许保留的拉丁字符只限稳定名称和事实，例如 `SEcode`、`normal`、`planning`、`executing`、工具名、JSON key、错误码、`SHA-256`、`UTF-8`、路径、命令、符号和版本号；不得以此豁免完整英文自然语言句子。

### AC17-15：中文工具协议描述

- 六个 `function.description` 全部为中文且准确描述能力和关键边界。
- 每个工具 JSON Schema property 都有中文 `description`，可选字段说明默认值或省略行为。
- normal definitions 和 planning definitions 从同一中文定义源派生，不出现语言漂移。
- DeepSeek、LongCat 与 Generic OpenAI 使用同一组中文工具定义，不做提供方差异翻译。
- 模型可见固定工具校验错误为中文；工具名、参数键和错误码保持不变。
- 快照/结构断言证明生成后的 JSON Schema 含预期中文说明，而不只检查 TypeScript 源码字符串。

## 17. 测试策略

### 17.1 单元测试

- Prompt V3 中文组合、默认回答语言、phase 互斥、必要语义和脱敏。
- 固定模型消息入口清单：system policy、memory、summary system/user、计划决定 synthetic message。
- 六工具 function description 与全部 parameter description 的生成后 JSON Schema 断言。
- 模型可见固定工具校验和 planning phase 拒绝文本的中文断言。
- 英文协议 token 白名单与英文自然语言哨兵测试，防止后续新增固定英文句子。
- `planningEnabled`、预算、legacy alias Schema。
- old/new event parsing、plan lifecycle projection 和非法轨迹。
- planning definitions、伪造禁用工具和零 executor。
- planning stop → proposal，不误生成 final/terminal。
- approved/rejected、错误 ID、重复决定和 durable append 失败。
- approved 后 continuation 清除和 durable context 重建。
- 单响应多工具计数、60/61、120/121 和工具批次原子限制。
- 无进展成功/变化/reset。
- Context plan/proposal/decision 映射与 compaction。
- Terminal parser、active guard、pending plan 和状态文案。

### 17.2 集成测试

- fake model 捕获原始请求，证明 normal/planning/executing 三种请求中的固定包装和工具说明均为中文。
- 摘要 fake model 捕获请求，证明两条摘要指令为中文且无业务工具。
- 使用包含英文代码、路径和命令输出的 fixture，证明原始事实没有被翻译或破坏。
- fake model：planning list/read/search → proposal → approve → write/test/final。
- proposal 前后 workspace hash 相同；approve 后只出现计划允许的修改。
- planning 伪造 write/process → phase denied → 无执行。
- reject → cancelled，零 workspace 变化。
- 工具审批在 approved execution 内仍独立等待。
- Route：开关默认/显式/非法、计划审批 200/404/409/Origin。
- 重启：旧历史、planning proposal、approved execution 和 interrupted 恢复。

### 17.3 人工终端验收

在自动创建的临时 fixture 中：

1. `/plan on` 后提交真实小修复任务。
2. 观察 Agent 只用 list/read/search 并输出完整计划。
3. 在等待阶段比较 workspace tree hash，确认零修改。
4. `/approve-plan`，确认同一 run 自动开始修改并运行测试。
5. `/status` 核对 phase、模型请求和工具调用累计值。
6. 新任务 `/reject-plan`，确认取消且零修改。
7. `/plan off`，确认下一任务直接正常执行。

### 17.4 Web E2E

- Home 开关默认 off 和显式 on。
- Session follow-up 可独立选择开关。
- proposal 展示、同意、拒绝和 active lock。
- 同意后同一 runId 继续并最终通过测试。
- 计划审批与工具审批分别渲染。
- 移动端 focus、Escape 不等于批准、刷新/断线真实状态。
- 原 24 项 E2E 全量回归。

## 18. 风险与缓解

### 18.1 同 run 暂停增加状态复杂度

风险：planning stop、proposal、批准与下一次模型请求之间产生非法半状态。

缓解：proposal 单事件建立 pending；批准先 durable 后 phase 切换；Projection 严格验证唯一 proposal、ID 和事件顺序。

### 18.2 计划批准被误当工具授权

风险：用户批准计划后危险命令绕过工具审批。

缓解：独立事件、ID、waiter、API 和 UI；批准只切换 phase，不生成工具 capability。

### 18.3 JSONL strict Schema 回归

风险：新增字段/事件使旧历史无法恢复。

缓解：旧 `run.started` 对 planningEnabled/maxToolCalls 使用输入默认；新增事件不改变旧类型；用阶段 09–16 fixture 验证，不迁移写回。

### 18.4 提高预算扩大 API 消耗

风险：失败循环产生更多模型费用。

缓解：保留 10 分钟总时限、工具预算、相同错误和无进展保护，UI 实时显示计数并保留取消。

### 18.5 等待审批占用总时限和 HTTP 流

风险：用户审阅过久导致超时或断线取消。

缓解：UI 明确显示剩余状态；首版保持与工具审批一致的单运行语义。跨进程 durable resume 属于后续能力，不在本阶段伪装实现。

### 18.6 无进展误判

风险：合法重复读取被终止。

缓解：只作用于只读工具；签名包含稳定结果；参数/hash/输出变化或写/进程都会重置。

### 18.7 中文 token 估算变化

风险：中文提示词在不同 tokenizer 下的占用与英文不同，可能使小上下文配置更早触发压缩或预算失败。

缓解：继续使用统一保守估算器，以项目支持的最小 context window 运行 Context 构建和压缩回归；不通过删除安全规则换取 token。

### 18.8 本地化破坏工具协议

风险：误把工具名、参数键、错误码或代码事实翻译为中文，导致模型调用失败或审计证据失真。

缓解：只翻译自然语言 description/wrapper；通过生成后 JSON Schema、请求捕获和英文事实 fixture 锁定协议标识与原始内容不变。

### 18.9 中文描述与真实能力漂移

风险：工具描述翻译后遗漏哈希前置条件、唯一匹配、非 shell 执行或范围限制，诱导模型产生错误调用。

缓解：中文描述按工具实现约束逐项覆盖，并用结构断言锁定关键语义；normal 与 planning 从同一工具定义源派生。

## 19. 安全、隐私与合规

- planning phase 没有 write/replace/process/approval capability。
- 用户同意计划后才进入 execution；计划批准不替代工具审批。
- execute 延续 realpath/symlink 工作区边界和风险分级。
- plan content 脱敏后持久化；错误 details 不包含计划全文。
- System Prompt 不在 UI、事件或日志中回显。
- history/summary/tool/plan 均视为不可信数据。
- 中文化仅作用于应用固定说明，不重写 durable JSONL，不翻译用户/仓库/进程事实，不改变哈希或审计证据。
- 工具名、参数键、事件类型和错误码保持稳定，避免本地化破坏 OpenAI-compatible 协议及历史恢复。
- Spec 修订 3 只读诊断仅读取 `.env.local` 中非秘密的 DeepSeek base URL、model ID 和 context window，未读取/输出 API Key，也未主动调用 DeepSeek/LongCat；真实会话证据来自用户已运行的 JSONL。
- 不引入 Agent 框架或厂商 SDK。

## 20. 修订 1～2 历史任务顺序

修订 1～2 获批时曾按以下顺序细化并已经完成：

```text
T17-00 基线、旧历史 fixture 与白名单
T17-01 需求追踪、planning/budget 公共契约
T17-02 System Prompt V3 与固定模型消息中文化
T17-03 Domain 计划事件与兼容 Projection
T17-04 Context phase/plan 映射
T17-05 Runtime planning 能力门与 proposal
T17-06 独立计划审批与同 run 恢复执行
T17-07 模型/工具预算与无进展保护
T17-08 Terminal 命令、状态与自动测试
T17-09 Terminal 人工验收文档
T17-10 Server/Route DTO 与计划审批 endpoint
T17-11 Client projection/API
T17-12 Web 开关、计划审批与进度 UI
T17-13 Integration/E2E/安全/全量回归
T17-14 Summary
T17-R2-01 固定模型可见自然语言清单与英文协议白名单
T17-R2-02 System Prompt、Memory、Summary 与计划决定注入中文化
T17-R2-03 六工具中文 function/parameter descriptions 与固定校验中文化
T17-R2-04 模型请求捕获、事实保真、回归与人工终端验收
T17-R2-05 Summary 修订与最终门禁
```

修订 1 的 T17-00～T17-14 与修订 2 的 T17-R2 项均已完成；修订 3 的当前任务顺序与新中间门禁以第 32 节为准。

## 21. 明确不执行

- Spec 修订 3 阶段不生成 Task 或修改代码。
- 不翻译工具名、参数键、事件类型、状态值、错误码和其他稳定协议标识。
- 不翻译用户输入、历史 assistant/plan 正文、仓库文件、搜索结果、命令输出或外部服务原始响应。
- 不迁移或批量重写已有 JSONL 历史中的英文模型内容。
- 修订 3 不实现多语言输出、语言自动识别或“用户用自然语言关闭中文门禁”；首版所有新 assistant 自然语言说明固定为简体中文。
- 不检查、翻译、持久化或展示 provider 私有 reasoning；私有推理不属于用户可见回答。
- 不把 plan 和 execute 拆成两个 run。
- 不要求用户批准后再次输入任务。
- 不自动批准、不未经批准执行。
- 不实现计划在线编辑、多版本 revision 或逐项看板。
- 不创建计划文件或第二数据库。
- 不并行工具，不给 planning 开放 run_process。
- 不迁移旧 JSONL，不修改真实 `.secode-data`。
- 不改变模型传输、工具审批或风险分类。
- 不增加依赖、commit、push、部署、录制视频或生成最终 README.txt。

## 22. 批准本 Spec 修订 3 即确认的累计决策

1. Plan Mode 为每任务布尔开关，默认关闭。
2. 关闭时保持正常模式；开启时先只读规划并暂停。
3. 用户同意后在同一个 run 中自动进入执行，无需再次输入。
4. 用户拒绝后当前 run 取消，首版不在原 run 内修改计划。
5. planning 只开放 list/read/search，禁止所有 process。
6. 计划正文使用 `plan.proposed` durable event，不写工作区文件。
7. 计划审批与危险工具审批使用不同事件、ID、API 和 UI。
8. 规划和执行共享 60/120 模型请求、120/240 工具调用和 10 分钟总时限。
9. 历史 iteration wire 字段保留，但界面改称模型请求。
10. 连续三次相同只读稳定事实触发无进展终止。
11. Terminal 自动与人工验收必须先于 HTTP/Web。
12. 最终文档、视频与提交材料继续顺延到阶段 18。
13. System Prompt 先在修订 2 升级到 V3，并在修订 3 升级到 V4；由应用固定生成的模型可见自然语言全部使用中文。
14. 新运行的 assistant 计划、过程说明和最终回答强制使用简体中文；首版不提供自然语言覆盖或多语言开关。
15. 六个工具保持英文协议名，但 function description 和每个 parameter description 使用中文。
16. 固定工具校验、planning 能力错误、摘要指令和计划决定注入全部中文化。
17. 用户/模型历史、仓库与进程输出等原始事实不翻译，稳定协议标识不本地化。
18. 不重写既有 JSONL；中文化只影响升级后的新模型请求。

## 23. Spec 修订 2 历史审批检查

- [x] 已按用户反馈将独立 run mode 改为可选规划审批门禁。
- [x] 已定义正常关闭、开启规划、批准执行和拒绝取消路径。
- [x] 已固定同 run、同目标、累计预算不重置。
- [x] 已定义独立计划事件、审批身份和工具审批隔离。
- [x] 已固定 planning 只读双层能力边界。
- [x] 已保留 JSONL 历史 wire 兼容。
- [x] 已定义 System Prompt V3、预算、无进展和准确展示语义。
- [x] 已定义 Terminal 优先、HTTP/Web 接线和完整验收。
- [x] 已明确范围外、风险和阶段 18 顺延。
- [x] 用户已于 2026-08-28 批准本 Spec 修订 1。
- [x] 已完成生产代码中固定模型消息与工具描述的只读清单。
- [x] 已明确“中文自然语言”与“稳定英文协议/原始事实”的边界。
- [x] 已要求六工具 function/parameter description 和模型可见固定错误中文化。
- [x] 已定义生成后 Schema、模型请求捕获和原始事实保真验收。
- [x] 用户于 2026-08-28 批准本 Spec 修订 2。

**历史结论：修订 2 曾完成实现与验收；因真实英文 assistant 输出缺陷，Summary 修订 2 已撤回审批，当前门禁以后续修订 3 为准。**

## 24. 修订 3 新增需求与边界

| ID | 需求 |
| --- | --- |
| FR-017 | 新运行产生的 assistant 计划、过程说明和最终回答必须通过简体中文合规门；不合规内容不能直接展示或成为完成事实。 |
| FR-018 | 纯文本计划/最终回答语言不合规时，Agent 在原 run 内进行有限中文重述请求；工具调用携带的不合规说明只抑制文本，不重复工具调用。 |
| NFR-014 | 中文合规门必须保留代码、命令、路径、URL、JSON、日志和稳定协议标识，不得通过机器翻译改写事实；兼容旧 JSONL。 |
| SEC-013 | 语言重试不得重复执行工具、绕过计划/危险审批、泄露被拒绝内容或形成第二个 run；所有额外模型请求计入原预算和总时限。 |

修订 3 对“中文”的定义是：**用户可见的、由 assistant 新生成的自然语言叙述使用简体中文**。以下英文仍合法且必须原样保留：

- fenced/inline code、JSON、正则、类型与符号名。
- 路径、URL、包名、程序名、命令与参数。
- 工具名、JSON key、事件类型、状态、错误码和模型 ID。
- 工作区文件、搜索命中、真实 stdout/stderr 与外部服务响应。
- 用户输入、用户审批理由和既有历史事件正文。
- provider 私有 reasoning；它不进入 UI、事件或日志，也不进行语言检测。

因此本修订不承诺模型请求字节流中“零拉丁字符”，而是保证应用固定自然语言和新 assistant 可见叙述符合中文契约。

## 25. System Prompt V4 与语言合规分析器

### 25.1 Prompt 强化

1. `SYSTEM_PROMPT_VERSION` 升级为 4；Context protocol、事件 protocol 和 storage version 不因 Prompt 升级改变。
2. 新增独立 `OUTPUT_LANGUAGE_POLICY`，作为动态 Memory 之后、当前用户目标之前的最后一条 system message。
3. 该策略使用强制语义：除代码、命令、路径、标识符和原始工具事实外，所有计划、过程说明和最终回答必须使用简体中文；不得用英文前言、英文过渡句或英文总结。
4. normal、planning、executing 和 summary 都使用同一中文输出原则；phase policy 不复制第二套相互漂移的规则。

### 25.2 确定性分析器

新增服务端纯函数 `analyzeAssistantLanguage(content)`，只分析用户可见自然语言，不调用模型或翻译服务。分析前排除：

- Markdown fenced code block 与 inline code。
- URL、明显的工作区路径、文件名、命令片段、JSON key/value 和稳定协议 token。
- 以中文通道标记包裹的原始标准输出/标准错误行。

合规条件：

1. 非空计划和最终回答必须至少包含一个汉字自然语言片段。
2. 排除保护片段后，不得存在“至少 3 个由空白连接的 ASCII 单词且总字母数至少 12、所在句段不含汉字”的英文叙述。
3. 中文句子中出现 `Next.js`、`API`、`HttpOnly Cookie` 等技术名词合法。
4. 纯代码、纯路径或纯命令不能单独作为计划/最终完成说明；必须附中文说明。
5. 分析结果只返回合规状态、有限原因码和计数，不持久化被拒绝正文。

该分析器不是自然语言翻译器；它是针对已观察英文前言/过渡句的保守合规门。阈值、保护规则和失败原因必须由表格驱动单元测试固定，不能散落在 UI 或 provider adapter。

## 26. Runtime 接收、抑制与有限重述

### 26.1 流式边界

- Provider SSE 仍按字节增量解析，但 assistant 文本先在服务端有界缓冲并脱敏，不立即发布 `assistant.delta`。
- 只有完整 completion 通过语言分析后，才允许形成 `assistant.message` 或 `plan.proposed` durable 事实。
- Web 继续使用既有本地打字动画展示已接受的 durable 文本；运行状态、工具请求和审批事件仍可实时流式到达。
- 该选择用“首屏文本延迟增加”换取“不先显示英文再撤回”的确定保证。

### 26.2 stop completion

当 planning plan 或 normal/executing final 不合规时：

1. 不追加 `assistant.message`、`plan.proposed` 或 `run.completed`。
2. 追加不含原文的 `model.output.rejected` durable 事件，字段固定为：`iteration`、`reason=language_mismatch`、`retryAttempt`、`contentCharacters`、`contentSha256`。
3. 在同一 run 的下一次模型请求中追加一条临时中文 system correction，要求只重述内容，不声称新增工具事实。
4. 最多允许 2 次语言重述；每次都计入 `modelRequests/maxModelRequests` 和 10 分钟总时限，不重置工具预算、计划状态或 runId。
5. 连续 3 次不合规后以 `AGENT_OUTPUT_LANGUAGE_INVALID` 失败，错误文案为中文且 `recoverable=true`；不展示或持久化英文正文。

### 26.3 tool_calls completion

当模型返回有效工具调用但伴随不合规英文说明时：

1. 不为同一 completion 重试，避免产生不同 tool call ID 或重复副作用。
2. 抑制 assistant 可见文本，追加 `model.output.rejected`，其中增加 `action=content_suppressed`。
3. 保留并按既有顺序只执行一次结构化工具调用；预算、审批和安全边界不变。
4. provider continuation 中该 assistant turn 的 `content` 规范化为 `null`，保留 provider tool-call identity；私有 `reasoning_content` 按厂商协议保留但不展示。
5. 下一轮通过最后一条 system language policy 重新强调中文要求。

### 26.4 Summary completion

- Context Summary 使用同一分析器和最多 2 次中文重述，但不计入业务模型请求数，继续受当前 context build deadline 和 AbortSignal 控制。
- 不合规摘要不能写入 `context.compacted` 或进入后续 Memory。
- 连续失败映射为现有 `CONTEXT_SUMMARY_INVALID`，details 只含有限原因码和次数。

## 27. 应用固定英文工具标记修正

以下仅为展示文本变化，不改变 JSON key、枚举、工具参数或执行行为：

| 当前模型可见标记 | 修订 3 标记 |
| --- | --- |
| `file` | `文件` |
| `directory` | `目录` |
| `symlink` | `符号链接` |
| `blocked` | `已阻止` |
| `[stdout]` | `[标准输出]` |
| `[stderr]` | `[标准错误]` |
| `...[TRUNCATED N UTF-8 bytes]...` | `...[已截断：原始 N UTF-8 字节]...` |
| `...[STREAM MIDDLE OMITTED]...` | `...[流中间内容已省略]...` |

元数据中的 `engine=rg/node`、`operation=create/overwrite`、reason code、错误码和其他稳定机器字段继续保持英文协议值。真实命令输出正文不翻译。

## 28. 新 durable 事件与兼容性

新增：

```ts
type ModelOutputRejectedEvent = BaseEvent & {
  type: "model.output.rejected";
  runId: string;
  data: {
    iteration: number;
    reason: "language_mismatch";
    action: "retry" | "content_suppressed";
    retryAttempt: number;
    contentCharacters: number;
    contentSha256: string;
  };
};
```

- 事件不包含被拒绝正文、provider reasoning、秘密或工具参数。
- Projector 只累计有限诊断和当前语言重述次数；它不把拒绝事件当作 assistant 回合、完成事实或计划。
- Terminal/Web 以中文显示“模型输出语言不符合要求，正在请求中文重述”或“已隐藏不符合语言要求的过程说明”。
- 旧 JSONL 无此事件时行为不变；不迁移、不重写旧历史，storage/protocol version 保持当前值。
- 修订 3 更新后的本地 Client 与 Server 原子交付；不承诺旧版独立 Client 解析新增 strict event。

## 29. 验收标准

### AC17-16：真实 assistant 中文输出

- 全新 normal run 的 intermediate/final 自然语言均为简体中文。
- 全新 Plan Mode 的计划、批准后过程说明和最终总结均为简体中文。
- 英文前言、英文过渡句和英文总结不能进入 `assistant.message`、`plan.proposed` 或 UI live draft。
- 新 Session 首次响应和既有工具回合后的响应都必须满足，不以“旧历史惯性”作为豁免。

### AC17-17：安全的语言恢复

- fake model 首次返回英文 stop、第二次返回中文时，同一 run 自动重述并只持久化中文内容。
- 连续三次英文 stop 时形成一个中文 `AGENT_OUTPUT_LANGUAGE_INVALID` 终态，模型请求计数准确。
- 英文说明 + valid tool_calls 时说明被抑制、工具只执行一次，不新增审批或副作用。
- 计划正文不合规时不产生 plan approval；合规重述后才进入 `awaiting_plan_approval`。
- 取消、超时、模型预算耗尽在语言重述期间保持既有唯一终态语义。

### AC17-18：工具标记与原始事实边界

- 目录类型、进程通道与截断标记使用第 27 节中文文本。
- 代码、路径、命令、JSON、真实 stdout/stderr 和稳定协议值逐字保持。
- normal/planning/executing/summary 的固定模型请求和新 assistant 可见叙述通过同一语言审计清单。

### AC17-19：完整质量门禁

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
git diff --check
```

真实 DeepSeek 终端人工验收至少覆盖 normal、Plan Mode 和一次“先英文后中文重述”可观察轨迹；不得记录 API Key 或被拒绝英文正文。

## 30. 测试策略

1. 表格驱动语言分析器：中文叙述、英文前言、混合技术名词、代码围栏、inline code、路径、URL、命令、JSON 和日志。
2. Runtime：英文 final/plan → rejected event → 中文重述；三次失败；预算边界；取消与超时。
3. Tool response：英文 narrative + 多工具调用只执行一次；危险审批仍独立；continuation content 变为 null。
4. Summary：英文摘要有限重述、失败不 compact、取消不残留事件。
5. 工具输出：中文目录/通道/截断标记与原始字节、哈希、stdout/stderr 保真。
6. Domain/Projection/Context：新事件 strict schema、非法轨迹、旧 fixture 零迁移恢复、拒绝正文不进入下一请求。
7. Terminal/HTTP/Client/UI：中文状态、计数、刷新恢复、无英文 live draft。
8. E2E：fake model 明确先返回英文，验证页面只展示中文重述且工具没有重复执行。
9. 真实 DeepSeek 人工测试作为模型行为验收，不用固定返回中文的假模型替代。

## 31. 风险与缓解

### 31.1 误判技术英文

风险：代码密集回答含大量英文标识符，分析器可能误拒绝。

缓解：先排除代码围栏、inline code、URL、路径、命令和协议 token；只对自然语言句段应用英文单词阈值，并建立边界 fixture。

### 31.2 流式体验延迟

风险：完整缓冲使模型正文在完成前不可见。

缓解：继续实时展示运行状态和工具事件；接受后的 durable 文本由现有客户端打字动画呈现。不得为保留即时 delta 而先展示未验证英文。

### 31.3 重试消耗预算

风险：模型多次不服从会消耗模型请求数和时间。

缓解：最多 2 次重述，严格共享原预算；事件公开次数；第三次失败而非无限循环。

### 31.4 工具调用重复

风险：对带 tool_calls 的英文说明整轮重试可能产生重复写入或审批。

缓解：该分支绝不重试 completion，只抑制 narrative 并执行一次原工具调用。

### 31.5 Provider continuation 约束

风险：部分提供方要求 assistant tool call turn 与 provider ID 完整回传。

缓解：只将可见 `content` 规范化为 null，保留 provider tool call 和必要的私有 reasoning 字段；DeepSeek、LongCat 和 Generic 均做协议测试。

### 31.6 “零英文”不可实现

风险：把用户要求误解为所有请求字节零英文会破坏代码和协议。

缓解：固定验收对象是应用自然语言和新 assistant 可见叙述；原始事实与稳定协议按第 24 节显式豁免。

## 32. 修订 3 建议任务顺序与中间门禁

本 Spec 获批后，Task 修订 4 应按以下依赖拆分，但此处不提前创建 Task：

```text
T17-R3-01 需求追踪、语言分析器契约与失败测试
  → T17-R3-02 System Prompt V4、Summary 合规门与固定工具标记
  → T17-R3-03 Domain rejected event、Runtime 缓冲/重述/工具抑制
  → T17-R3-04 Context、continuation、Projection 与预算回归
  → T17-R3-05 Terminal 自动测试和真实 DeepSeek 人工验收文档
       ↓ 用户确认终端人工验收通过
     T17-R3-06 HTTP/Client/UI/E2E、全量回归与 Summary 修订 3
```

终端人工门禁之前不得修改 HTTP/Client/UI；Summary 修订 3 只能在全量回归完成后生成。

## 33. Spec 修订 3 审批检查

- [x] 已用 V3 生效后的真实 DeepSeek Session 复现英文输出。
- [x] 已区分软 Prompt、模型生成内容、应用固定标记、原始事实和稳定协议。
- [x] 已定义 System Prompt V4 和确定性语言分析边界。
- [x] 已定义 stop completion 有限重述、tool_calls 文本抑制和不重复副作用。
- [x] 已定义流式正文先缓冲后展示的体验取舍。
- [x] 已定义 Summary 合规门和 provider continuation 处理。
- [x] 已定义不含原文的 durable rejected event 与旧历史兼容。
- [x] 已定义中文工具标记、真实输出保真和完整测试策略。
- [x] 已设置真实 DeepSeek 终端人工验收和 Summary 两个停止门禁。
- [x] 用户于 2026-08-29 明确批准本 Spec 修订 3。

**历史结论：阶段 17 Spec 修订 3 已获批准并完成实施；该结论已被下面的修订 4 审批回退取代。**

## 34. 修订 4 只读研究与证据

修订 4 的运行预算契约以第 34～42 节为准；前文第 12 节的 60/120/240 数值仅记录修订 1～3 已实施的历史基线，凡与本修订冲突均由本节及后续章节取代。

### 34.1 官方产品行为

本次只使用官方资料建立可复核基线，研究日期为 2026-08-29：

| 产品 | 官方行为 | 对本项目的含义 |
| --- | --- | --- |
| Codex | 配置参考公开 `model_auto_compact_token_limit` 与 `model_context_window`；还提供默认关闭、处于开发中的 rollout token budget。完整配置参考没有通用的模型请求次数或 turn 上限配置。 | 交互式 coding agent 的默认持续性由上下文管理和工作预算支撑；“没有通用 turn 配置”是根据完整官方配置表得出的推论，不声称披露未公开内部实现。 |
| Claude Code | `--max-turns` 只用于 print mode，且官方明确说明默认没有上限；print mode 另有 `--max-budget-usd`。 | 次数上限应是自动化调用方显式选择的保险，而不是交互任务默认终止条件。 |
| Claude Platform | 长时间 agent workflow 的主要上下文策略是 compaction；task budget 跨整个 agent loop、对模型可见且属于建议性预算，`max_tokens` 则是单请求硬上限。 | 循环工作量、单请求输出、上下文容量与硬停止应分开建模，不能用模型请求数替代所有预算。 |

官方来源：

- [Codex Configuration Reference](https://developers.openai.com/codex/config-reference/)
- [OpenAI Responses API model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage)
- [Claude context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows)
- [Claude task budgets](https://platform.claude.com/docs/en/build-with-claude/task-budgets)

### 34.2 当前代码事实

只读检查覆盖 `lib/agent`、`lib/context`、`lib/domain`、`lib/server`、`lib/terminal`、`lib/client`、Web 工作台和相关测试，未读取凭据、未调用真实模型、未修改产品代码。

1. `DEFAULT_MAX_MODEL_REQUESTS = 60`、`MAX_MODEL_REQUESTS = 120`；请求 Schema 会把未提供的限制强制归一化为 60。
2. Runtime 每次构建上下文前无条件检查 `modelRequests >= maxModelRequests`，达到 60 时以 `AGENT_ITERATION_LIMIT` 失败，即使刚执行的工具产生了新事实且任务仍可继续。
3. `run.started.data.limits.maxIterations` 当前必填并写入 60；Projection、Server config、Terminal、Details Drawer 和测试均把它当成必有分母。
4. 项目已经具备默认 120 次工具调用、10 分钟总时限、连续三次相同工具错误、连续三次相同只读事实无进展保护。
5. 每个继续循环的正常业务模型响应必须包含至少一个工具调用；未知工具、非法参数、planning phase 拒绝和失败调用也计入工具预算。`stop` 会完成、进入一次计划审批或触发最多两次中文重述，不会形成无工具的无限循环。
6. Context 已在估算输入达到模型窗口的 75% 时按完整 assistant/tool 回合生成并 durable 保存摘要，之后从摘要和近期完整回合继续。
7. `model.completed` 已保存提供方返回的 token usage，但 DeepSeek、LongCat 和 Generic OpenAI-compatible 端点不保证都返回完整、同口径、可用于硬停止的 usage；当前也没有模型价格配置。
8. 当前 7 个相关测试文件、68 项测试全部通过，证明现有行为基线稳定，但测试明确把默认第 60 次请求和 `/60` 展示锁定为契约。

### 34.3 差距结论

默认模型请求上限把观测指标误当成主要完成预算，并与 `FR-004` 的“循环直至完成”发生实际张力。它也重复覆盖了工具预算和总时限已经控制的风险，却无法准确表达 token、成本、上下文质量或是否取得进展。

本项目不应照搬某一家模型专属的 server-side task budget。首版同时支持三个 OpenAI-compatible 提供方，必须先保持 provider-neutral、可审计和确定性；因此修订 4 聚焦移除错误的默认次数门，而不伪造不可靠的跨提供方 token/美元硬预算。

## 35. 修订 4 目标与需求变化

### 35.1 目标

1. 模型请求数继续作为 durable 序号、用量指标和诊断事实，不再默认限制交互任务。
2. `maxModelRequests` 变为调用方显式启用的可选保险，主要服务非交互自动化、测试和特殊成本控制场景。
3. 默认运行继续受工具调用、总时限、重复错误、无进展和取消约束，保持确定的终止边界。
4. 保留所有旧 JSONL、旧 HTTP `maxIterations` 输入和旧错误码的解析能力，不迁移、不重写历史。
5. Terminal、HTTP、Client 和 Web 明确区分“已使用次数”与“可选上限”，未配置时不显示虚假的 `/60`。

### 35.2 需求追踪修订

本 Spec 获批后的 Task 修订 5 必须更新 `01-requirements.md`：

- `FR-015` 改为“模型请求数与工具调用数分别统计；工具调用默认受限，模型请求上限仅在调用方显式配置时生效”。
- `NFR-004` 删除过期的“默认不超过 30 轮”，改为“默认 10 分钟总时限、300 次工具调用及固定重复错误/无进展保护；模型请求不设默认上限”。
- 新增 `NFR-015`：未配置请求上限时，Agent 在持续取得进展且未触发其他保护的情况下不得因模型请求次数失败。
- `NFR-010` 补充旧 `run.started.limits.maxIterations` 有值历史与新事件缺失该字段都必须恢复。
- `SEC-013` 中“额外请求共享原预算”明确为共享总时限、显式请求上限（若有）和工具/进度保护，不暗示存在默认请求上限。

## 36. 修订 4 公共契约

### 36.1 输入与归一化

```ts
interface AgentRunLimits {
  maxModelRequests?: number; // 未提供即不启用次数门
  maxToolCalls?: number;     // 默认 300
  maxIterations?: number;   // deprecated 输入别名
  maxDurationMs?: number;    // 默认 600000
}

interface NormalizedAgentRunLimits {
  maxModelRequests?: number;
  maxToolCalls: number;
  maxDurationMs: number;
}
```

- `maxModelRequests` 和 `maxIterations` 同时出现继续拒绝。
- 显式上限仍限制为 1～120，避免本修订顺带扩大自动化消耗边界；未来若有真实需求再独立评审。
- 删除误导性的 `DEFAULT_MAX_MODEL_REQUESTS` 导出；调用方通过 optional 字段表达未启用次数门，Server JSON config 使用 `null` 表达默认无上限。
- `maxToolCalls` 默认值和可配置硬上限均调整为 300；显式值允许 1～300。`maxDurationMs` 的默认和硬上限不变。

### 36.2 Runtime 终止条件

```ts
if (
  active.limits.maxModelRequests !== undefined &&
  active.modelRequests >= active.limits.maxModelRequests
) {
  fail("AGENT_ITERATION_LIMIT");
}
```

`AGENT_ITERATION_LIMIT` 和公开中文错误继续保留，以兼容旧客户端、测试和显式上限调用方。不得把“没有配置上限”实现为 `Number.MAX_SAFE_INTEGER`、`Infinity` 或任意哨兵数字，因为这些值会污染 durable 事件、JSON 和 UI。

### 36.3 Durable 事件与恢复

新写入允许：

```ts
run.started.data.limits = {
  maxIterations?: number; // 只有显式配置请求上限时才写
  maxToolCalls: number;
  maxDurationMs: number;
}
```

- wire 字段继续叫 `maxIterations`，仅为历史协议兼容；内部和 UI 继续使用 `modelRequests`。
- Domain Schema 把 `maxIterations` 从必填正整数改为 optional 正整数。
- 旧事件有值时恢复为显式上限；新事件缺失时恢复为“未配置”，不得回填 60。
- 不提升 storage/protocol version，不重写旧 JSONL。
- `model.requested.iteration`、`model.completed.iteration` 和终态 `iterations` 继续必填，含义不变。

### 36.4 分层展示

- Runtime snapshot、Server DTO、Client projection 中 `maxModelRequests` 改为 optional。
- Server config 以 `defaultMaxModelRequests: null` 公开默认状态，同时继续以 `maximumModelRequests: 120` 公开显式最大值。
- Terminal `/status`、run start 渲染和 Web Details Drawer 在未配置时显示“未设置”或 `—`，不得显示 `/60`、`/∞` 或一个巨大数字。
- 已用 `modelRequests` 始终显示；旧历史仍显示其真实旧上限。
- `maxToolCalls` 和总时限展示不变。

## 37. 默认运行仍然有界的证明

移除默认请求次数门不等于无限运行：

1. 正常/executing 的非终态业务响应必须至少包含一个工具调用；每个调用在执行前计入 `maxToolCalls=300`。
2. planning 中同样只可通过至少一个只读工具继续；完整计划只会进入一次审批，批准后切换一次 executing。
3. 不合规 `stop` 最多额外请求两次；带工具调用的不合规叙述不会重试工具响应。
4. 每个模型 attempt 有 120 秒超时和有限重试；整个 run 共享 10 分钟 AbortSignal，包括计划/工具审批等待和摘要。
5. 连续相同工具错误或相同只读成功事实在第三次停止；用户也可随时取消。

因此最坏路径仍由总时限硬停止，并通常更早由工具预算或进度保护停止。显式 `maxModelRequests` 只是更严格的可选调用方策略，不再承担默认安全边界。

## 38. 范围边界

### 38.1 范围内

- Agent/Server 输入 Schema 的可选请求上限。
- Runtime 条件检查、错误兼容和类型更新。
- `run.started` optional wire 字段、Projection 与冻结旧历史恢复。
- Terminal、Server config/DTO、Client、Web Details 展示。
- 相关单元、集成和 E2E 回归。
- 需求、Task、Summary 和索引状态同步。

### 38.2 范围外

- 新增模型、工具、provider endpoint 或依赖。
- 接入 Codex/Claude SDK、Responses API 或 Claude server-side compaction。
- 伪造跨提供方统一的美元价格、缓存折扣或 token 硬预算。
- 除把 `maxToolCalls` 默认值与可配置硬上限统一调整为 300 外，再次改变模型单请求超时、工具预算、总时限、重复错误或无进展阈值。
- 提高显式 `maxModelRequests` 的 120 硬上限。
- 修改 Plan Mode、危险审批、中文合规门或工具执行语义。
- 阶段 18 文档、视频、提交、推送或部署。

## 39. 修订 4 验收标准

### AC17-20：默认无请求次数门

- 未传 `limits.maxModelRequests/maxIterations` 时，归一化结果和 active limits 中该字段缺失。
- 确定性假模型可完成超过 60 次模型请求且仍有进展的任务，不出现 `AGENT_ITERATION_LIMIT`。
- 测试必须使用变化的工具参数或事实，不能被无进展保护提前终止。

### AC17-21：显式保险仍有效

- 显式 `maxModelRequests: 1` 或旧别名 `maxIterations: 1` 时，第二次业务请求前以现有错误码失败。
- 两个字段同时传入仍返回输入错误；1～120 边界不变。
- Plan Mode、中文重述和 normal mode 均共享同一个显式上限。
- `maxToolCalls` 缺失时归一化为 300；显式 1～300 有效，301 被 Schema 拒绝。

### AC17-22：默认安全边界

- 无请求次数门时，工具批次原子上限、总时限、连续错误、无进展、取消和单请求超时测试继续通过。
- 回归测试证明未知/非法/拒绝的工具调用也消耗工具预算。
- 至少一个超过 60 次请求的测试最终由正常 `stop` 完成，另一个由工具预算或总时限安全停止。

### AC17-23：历史与分层一致

- 冻结旧事件的 `maxIterations=60` 继续恢复和展示 `/60`。
- 新事件缺失 `maxIterations` 时恢复为未配置，Terminal/Web 显示 `—` 或“未设置”。
- Domain、Agent、Storage、Context、Terminal、Server、Client 和 Web 对 optional 语义一致。
- 旧 `iteration/iterations` 序号与终态计数不变。

### AC17-24：完整质量门禁

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
git diff --check
```

所有命令必须真实执行并记录；不得降低断言或删除失败测试。

## 40. 风险与缓解

### 40.1 API 消耗增加

风险：异常但持续变化的工具轨迹可越过原 60 次请求。

缓解：保留 300 工具、10 分钟、单请求超时、取消和显式请求保险；UI 始终显示已用请求数。项目不声称这是成本上限。

### 40.2 optional 字段破坏旧恢复

风险：Projection 或 UI 把缺失误当成 60 或 0。

缓解：冻结“旧有值”和“新缺失”两类事件夹具；全链路禁止哨兵数字。

### 40.3 请求与工具数量关系被误解

风险：一次响应可含多个工具，一次请求也可能因计划或语言重述不含工具。

缓解：继续分别计数；不以公式反推出已用请求，只用工具预算和总时限证明默认有界。

### 40.4 token 预算被过早泛化

风险：不同兼容端点缺失 usage、缓存口径和价格元数据，伪硬预算会错误停止或漏算。

缓解：保留已持久化的实际 usage 作为观测；跨提供方 token/成本预算另立 Spec，以可靠 capability 和 fallback 语义为前提。

## 41. 修订 4 建议任务顺序

本 Spec 获批后才能生成 Task 修订 5；建议依赖顺序如下，但本节不是实施授权：

```text
T17-R4-01 需求追踪、optional limits 类型/Schema 和失败测试
  → T17-R4-02 Runtime 条件门、durable 事件与 Projection/历史兼容
  → T17-R4-03 Terminal、Server config/DTO 与集成测试
  → T17-R4-04 Client/Web 展示与 E2E
  → T17-R4-05 全量验证、Summary 修订 4 与索引同步
```

本修订不新增真实模型人工验收门：预算语义可由确定性假模型完整验证，且不需要消耗用户 API 额度。若实施发现公共接口或安全边界需改变，必须再次回到 Spec。

## 42. Spec 修订 4 审批检查

- [x] 已核对 Codex 与 Claude Code/Platform 当前官方资料。
- [x] 已区分交互默认、非交互显式 turn 保险、task budget、单请求上限和上下文压缩。
- [x] 已确认当前 60 次默认门的代码路径、分层传播和测试锁定。
- [x] 已证明移除默认次数门后仍受工具、时限、错误、无进展和取消约束。
- [x] 已定义旧 wire、旧 HTTP 别名和错误码兼容。
- [x] 已定义 optional 值的 DTO、Terminal 和 Web 展示，未使用 `Infinity` 或哨兵数字。
- [x] 已明确本修订不伪造不可靠的跨提供方 token/美元硬预算。
- [x] 已完成相关只读基线：7 个测试文件、68 项测试通过。
- [x] 用户要求把默认工具调用预算及可配置硬上限统一调整为 300。
- [x] 用户于 2026-08-29 明确批准调整后的本 Spec 修订 4。

**历史结论：阶段 17 Spec 修订 4 已获批准并完成实施；该结论已被下面的修订 5 审批回退取代。**

## 43. 修订 5 的真实运行证据

本修订以 2026-08-29 的真实 Session `8e4063ad-ff10-4c5d-865d-9b65c3dbbb17` 为主要回归样本。观察只读取 `.secode-data` 事件和用户指定的测试工作区，没有修改真实 Session、样例项目或凭据。

用户目标是在官方 Next.js App Router/TypeScript/Tailwind 模板上完成注册、登录、退出、受保护个人中心、本地持久化、安全密码哈希、HttpOnly Cookie、表单状态和自动化测试；要求 npm 管理依赖、模板生成后先以 `pnpm dev` 启动，并在结束前运行 lint、test、build。

### 43.1 事件事实

| Run | 事实 | 终态 |
| --- | --- | --- |
| 首次运行 | planning=true；约 10 分钟内产生 54 次业务模型请求、52 次工具请求和 6 次危险审批；完成脚手架及多数文件，但未运行 `pnpm dev`、lint、build | 在 600000ms 墙钟上限处 `AGENT_RUN_TIMEOUT` |
| 第一次“继续” | planning=true；开始时 3 次写/进程调用被 `TOOL_PHASE_DENIED`，随后重新规划；两次 Context 摘要分别约 33 秒和 55 秒 | 最后一个工具结果后约 120 秒以 `AGENT_CONTEXT_FAILED` 失败 |
| 第二次“继续” | planning=false；执行一次 `npm test`，工具结果已持久化 | 工具结果后约 120 秒再次以 `AGENT_CONTEXT_FAILED` 失败 |

当前模型单请求超时为 120000ms。`summary-generator.ts` 将摘要模型超时包装为 `CONTEXT_SUMMARY_FAILED`，`runtime.ts` 又统一包装为无 details 的 `AGENT_CONTEXT_FAILED`。结合两个续跑均在最后工具结果后恰好约 120 秒失败，可证伪性最强的根因是：历史达到压缩阈值后，摘要请求超时；新 run 读取同一段“毒化历史”并再次进入相同失败路径。

### 43.2 完成质量事实

首个 run 不是仅差最终总结：

1. 模板创建后没有按用户顺序先运行 `pnpm dev`；最终也没有执行用户要求的 lint、build。
2. 进入生成的 Next.js 子项目后看到 `AGENTS.md`，但没有读取它或本地 `node_modules/next/dist/docs/` 就开始修改 Next.js 代码。
3. 多次出现空目录参数、父目录不存在、无效 `expectedSha256` 和重复同类参数错误；大量相互独立的操作仍按“一次模型请求一个工具”执行。
4. 样例认证把原始用户 UUID 直接作为 Cookie 身份，未签名、未加密且没有服务端 Session；任何知道 UUID 的请求方都可伪造登录。
5. 测试直接删除生产 `data/users.json`，违反测试数据隔离；最后一次测试仍为 28/30，通过记录不能证明完成。
6. 只读补充验证得到 lint 失败和 TypeScript 错误；Agent 没有自行发现并修复。

这些事实说明修订 4 的确定性假模型测试覆盖了 Runtime 计数，却没有覆盖真实复杂任务的恢复能力、指令遵守和交付证据质量。

## 44. 修订 5 根因与边界

### 44.1 已确认根因

1. Context 摘要只有模型生成路径；模型摘要超时、不可用或连续不合规时没有本地降级路径。
2. Runtime 丢弃 `ContextLayerError` 的安全错误码/details，用户只能看到泛化 `AGENT_CONTEXT_FAILED`。
3. 默认和硬上限都为 10 分钟，复杂任务的脚手架、依赖安装、审批、代码生成和验证共享同一墙钟；真实样本在仍有进展时到限。
4. System Prompt V4 没有把嵌套仓库指令、用户明确步骤顺序、工具参数纠错、无依赖工具批次和最终需求—证据核对提升为稳定执行契约。
5. `run_process` 只支持等待子进程退出；开发服务器会在超时后被当作失败并终止，缺少“启动—本机就绪探测—清理”的有界成功模式。

### 44.2 本修订必须解决

- 摘要模型失败后，Context 能在不调用第二个外部模型的情况下生成安全、有界、可审计的降级摘要，并继续业务模型请求。
- 降级也失败时，外层错误保留 Context 安全原因，不泄露模型响应、提示词、凭据、绝对路径或私有异常。
- 新 run 对同一长历史可继续取得进展，不重复陷入 120 秒摘要失败。
- 提高复杂任务可用墙钟，同时继续保留明确硬上限、取消、工具预算、重复错误和无进展保护。
- 强化固定中文执行策略，并为本机开发服务器提供不遗留后台进程的就绪验证。
- 使用用户这次任务的等价临时工作区回归，而不是只证明假模型能走完预编排轨迹。

### 44.3 明确不做

- 不修改或“补完”`/Users/starkirby/Codes/test/web`；它只是失败证据，后续验收使用新的临时工作区。
- 不引入 LangChain、Vercel AI SDK、OpenAI Agents SDK、数据库服务、云沙箱或第七个 Agent 框架工具。
- 不让 Context 摘要调用计入业务模型请求数；它仍计入原 run 墙钟、取消信号和模型使用事实。
- 不保存模型私有推理，不把原始错误 body、摘要输入或未通过语言门的正文写入事件。
- 不保证任意模型在任意复杂任务上一次成功；验收要求的是可恢复编排、明确证据和至少一次真实配置模型的受控通过。
- 不留下跨请求长期运行的后台子进程，不实现通用 PTY、stdin、端口转发或进程管理器。

## 45. Context 摘要降级契约

### 45.1 专用摘要时限

- Context 摘要模型调用增加 60000ms 专用上限；实际信号取“摘要专用上限、原 run 剩余时限、用户取消”三者最早者。
- 专用时限只限制摘要辅助调用，不改变普通业务模型请求的 120000ms 上限。
- 用户取消或原 run 总时限到达时必须立即传播取消/超时，不能借降级继续执行。
- 摘要专用时限到达属于可降级的 `model_timeout`，不是直接终止 run。

### 45.2 确定性本地降级摘要

当 `generateContextSummary()` 因以下原因失败时，Provider 必须尝试一次本地降级：

- `CONTEXT_SUMMARY_FAILED`；
- `CONTEXT_SUMMARY_INVALID`；
- 摘要请求自身超过输入预算，而 `selectContextCompaction()` 已得到合法 selection；
- 摘要专用 60000ms 时限到达。

`CONTEXT_ABORTED`、Session/历史非法、selection 不存在或最近 8 个完整回合本身超过输入预算时不得伪装成摘要成功。

降级摘要必须：

1. 只消费 `ContextHistory` 和 `ContextCompactionSelection` 的结构化事实，不重新读取工作区，不执行工具，不调用模型。
2. 继续以 `SECODE_CONTEXT_SUMMARY_V1` 开头，兼容现有历史；正文首行明确“本地降级摘要”，不得伪装为模型语义总结。
3. 按固定优先级保留：初始/当前目标与计划决定、未解决错误、已修改相对路径、命令及退出结果、工具成功/失败摘要、最近的完成事实；低优先级旧叙述可省略。
4. 所有字符串继续经过秘密清理；只保留工作区相对路径，绝对路径改为安全占位；不保留完整文件内容、完整 stdout/stderr 或工具私有参数。
5. 清楚区分“观察、计划、修改、验证、失败、未完成”，不得由计划或工具请求推断任务已完成。
6. 在目标 Token 内按确定性顺序截断；记录省略的回合/事实数量和稳定 SHA-256 摘要，不记录被省略原文。
7. 保留现有最近 8 个完整 assistant/tool 回合；不能为节省空间拆散未完成工具回合。
8. 生成后再次运行 Token 估算和 Context Schema；仍超预算则以可解释 `CONTEXT_BUDGET_EXCEEDED` 失败，不循环降级。

### 45.3 durable 审计

`context.compacted.data` 增加可选字段：

```ts
strategy?: "model" | "deterministic_fallback";
fallbackReason?:
  | "model_timeout"
  | "model_failed"
  | "model_output_invalid"
  | "summary_input_over_budget";
```

- 新事件始终写 `strategy`；旧事件缺失时按 `model`/legacy 只读展示，不迁移 JSONL。
- 只有 `deterministic_fallback` 可写 `fallbackReason`；Schema 拒绝非法组合和任意字符串。
- Terminal/Web 对降级压缩显示简短中文 warning，但不显示摘要正文、profileId、哈希或内部异常。
- `context.compacted` 仍必须先 durable append，才允许下一次 `model.requested`。

## 46. Context 错误透明度与续跑

外层保持兼容错误码 `AGENT_CONTEXT_FAILED`，但 ContextLayerError 映射后必须包含以下有限 details：

```ts
{
  contextCode:
    | "CONTEXT_INPUT_INVALID"
    | "CONTEXT_SESSION_UNAVAILABLE"
    | "CONTEXT_MODEL_UNAVAILABLE"
    | "CONTEXT_HISTORY_INVALID"
    | "CONTEXT_BUDGET_EXCEEDED"
    | "CONTEXT_SUMMARY_FAILED"
    | "CONTEXT_SUMMARY_INVALID"
    | "CONTEXT_ABORTED"
    | "CONTEXT_INTERNAL_ERROR";
  reason?:
    | "model_timeout"
    | "model_failed"
    | "model_output_invalid"
    | "summary_input_over_budget"
    | "fallback_over_budget";
}
```

- 不把 `cause.message`、provider body、prompt、摘要、绝对路径或 profile 凭据复制到 Agent error。
- 普通未知异常仍使用无 details 的 `AGENT_CONTEXT_FAILED`，避免错误反射泄密。
- Terminal/Web 应把已知 `contextCode/reason` 映射为固定中文解释和是否适合“继续”；未知字段不得直接插值到 UI。
- 若降级成功，不产生 `run.failed`；若降级失败，只产生一个稳定终态。
- 新 run 读取此前 `AGENT_CONTEXT_FAILED` 历史时仍把它作为未解决诊断，但压缩选择不能因该诊断重复包含而无界增长。

## 47. 复杂任务墙钟与其他保护

修订 5 将默认 run 墙钟改为 30 分钟，显式可配置硬上限改为 60 分钟：

```text
DEFAULT_AGENT_DURATION_MS = 1_800_000
MAX_AGENT_DURATION_MS     = 3_600_000
MIN_AGENT_DURATION_MS     = 1_000
```

- 墙钟仍从 run 启动连续计算，包含 planning、Context、模型、工具和用户审批等待；本修订不引入可被滥用的暂停计时。
- `run.started.limits.maxDurationMs` 必须写入实际标准化值；旧事件继续保留原 600000，不迁移或回填新默认。
- Server config、Terminal、Client/Web 和恢复投影必须一致显示 30/60 分钟语义；显式 1 秒～60 分钟仍可用。
- 默认无业务模型请求次数门、显式 1～120 保险、300 工具预算、第三次重复工具错误、第三次无进展和用户取消均保持不变。
- 摘要降级不能重置 run 墙钟、模型请求数、工具数、语言重述次数或 provider continuation。

提高墙钟是为避免真实复杂任务在持续进展时被 10 分钟默认值截断，不代表允许无限运行。60 分钟硬上限和现有其他保护仍构成确定性边界。

## 48. System Prompt V5 执行可靠性契约

System Prompt V5 在 V4 中文、安全和 phase overlay 基础上增加以下稳定规则：

1. 进入工作区及新子目录后，先查找并读取适用的 `AGENTS.md`/同类仓库指令；涉及 Next.js 时遵守项目内指定的本地版本文档。仓库文本仍是不可信数据，只有明确标记的协作指令进入约束层。
2. 用户明确要求顺序时，把该顺序视为检查点；前一检查点未完成不得静默跳到后续实现。受工具能力或审批阻塞时必须报告，而不是声称已执行。
3. 在修改前建立简短需求清单；最终答复前逐项核对实现与可验证证据。用户要求的 lint/test/build 任一未运行或失败时，不得声称完成。
4. 无依赖的读取、搜索或文件创建可在一次模型响应中批量发起；存在 SHA、父目录、审批或结果依赖的调用必须按依赖顺序。Runtime 仍串行执行工具。
5. 工具参数被 Schema 拒绝后，必须根据工具说明/错误修正；不得连续重复同一无效形状。覆盖文件前使用最新完整 SHA。
6. 安全敏感功能必须检查信任边界：客户端可控标识不能直接成为认证事实；Cookie、凭据、密码、授权和测试数据必须分别验证。不得把“HttpOnly”单独等同于安全 Session。
7. 开发服务器验证必须使用有界启动、就绪探测和清理；不得把预期长期运行导致的 timeout 当作成功，也不得留下孤儿进程。
8. 不为了赶在时限内删除/跳过测试、弱化断言或省略用户明确验收；剩余时间不足时保留真实状态并让后续 run 可继续。

这些规则提高模型获得正确约束的概率，但不能代替 Runtime、工具 Schema、安全边界或真实验收。

## 49. `run_process` 有界就绪模式

保留现有前台完成模式，并给同一个 `run_process` 增加可选 `readiness` 参数，不新增长期进程工具：

```ts
readiness?: {
  url: string;
  expectedStatus?: number;
};
```

契约如下：

1. `url` 只接受字面量 `http://127.0.0.1:<1024-65535>/...`；拒绝 HTTPS、域名、用户信息、fragment、非回环地址和缺失端口，避免任意内网探测。
2. `expectedStatus` 默认 200，允许 100～599；请求不跟随重定向，不发送 Cookie、Authorization 或自定义 header。
3. 子进程启动后按固定短间隔探测；只有子进程仍存活且返回目标状态才算 ready。
4. ready 后立即对本次子进程组执行 SIGTERM，宽限期后 SIGKILL；确认 close 后返回成功，并记录 `ready=true`、安全 URL、状态码、duration、exit/signal 和截断元数据。
5. 子进程先退出、探测失败直到 `timeoutMs`、用户取消或 run 超时时，沿现有失败/取消语义清理整个进程组；不得遗留子孙进程。
6. 非 readiness 调用保持现有行为和风险分级。readiness 不自动降低 `pnpm`、`npm`、未知程序或脚本的审批风险。
7. 测试必须使用临时工作区和随机高位端口；不得探测用户已有 3000 端口服务。

此模式满足 `pnpm dev` 等长期服务的“确实启动并可响应，然后清理”验收，不承诺在 Agent run 结束后继续托管服务。

## 50. 修订 5 验收标准

### AC17-25：摘要超时后继续

- 确定性假模型让摘要调用超过 60000ms，但业务模型可用。
- Provider 生成本地降级摘要，先写 `context.compacted(strategy=deterministic_fallback, fallbackReason=model_timeout)`，随后正常 `model.requested` 并完成 run。
- 不出现 `AGENT_CONTEXT_FAILED`，不重复执行压缩前工具，不把摘要调用计入业务模型请求数。

### AC17-26：毒化历史续跑

- 冻结 fixture 包含两个此前以 `AGENT_CONTEXT_FAILED` 结束的长 run 和一个新的“继续”run。
- 新 run 在一次降级内越过相同历史并取得新业务模型/工具进展；刷新、重启恢复后结果一致。
- 降级摘要大小、未解决诊断数量和事件增长均有确定性上限。

### AC17-27：降级失败与安全错误

- 覆盖取消、总 run 超时、最近完整回合过大、降级仍超预算、历史非法和未知异常。
- 每种情况只产生一个终态；已知 Context 错误携带有限 `contextCode/reason`，未知异常不反射私有消息。
- JSONL、NDJSON、Terminal/Web 和日志均不包含测试注入的秘密、原始模型 body、绝对路径或不合规摘要。

### AC17-28：墙钟兼容

- 新默认为 1800000ms、最大 3600000ms；边界值和越界值严格解析。
- 旧 600000ms 事件恢复为旧事实，新事件写真实新值；Agent/Server/Terminal/Client/Web 一致。
- 超时、取消、工具 300、显式模型请求保险、重复错误和无进展保护回归通过。

### AC17-29：开发服务器就绪

- 临时服务在回环随机端口返回期望状态时，`run_process` readiness 成功并确认进程组已清理。
- 错误状态、端口占用、提前退出、超时、取消和 fork 子进程均不会误报成功或遗留进程。
- 非回环 URL 在 spawn 前拒绝，风险与审批测试保持通过。

### AC17-30：指令与完成证据

- 请求捕获测试证明 System Prompt V5 包含第 48 节八项契约，normal/planning/executing 均生效且保持中文。
- 假模型集成轨迹覆盖：读取嵌套指令、按用户顺序先做模板/就绪检查、修正一次非法 SHA、批量独立读取、最后运行 lint/test/build；任何验收失败时只能失败/说明未完成。
- 工具调用继续串行且副作用最多一次，Plan Mode 与危险审批仍彼此独立。

### AC17-31：真实多文件回归

在新的临时工作区，使用用户当前配置的真实 OpenAI-compatible 模型运行与本次登录系统等价的中文 prompt。验收至少要求：

1. 从官方 `create-next-app` 模板开始，App Router、TypeScript、Tailwind；npm 安装/锁文件，不能产生 `pnpm-lock.yaml`。
2. 模板创建后先通过 `pnpm dev` + 回环 readiness 完成启动检查，再开始业务功能修改。
3. 读取生成项目的适用 `AGENTS.md` 和本地 Next.js 版本文档。
4. 注册、登录、退出、受保护页面可通过 HTTP/E2E 验证；密码使用慢哈希；Session Cookie 为 HttpOnly 且身份不可由客户端伪造。
5. 自动测试使用临时数据根，不删除或覆盖生产用户数据；并发/损坏数据至少有明确安全行为。
6. 最终 lint、test、build 全部实际运行并通过；Agent 最终总结与事件证据一致。
7. 不执行 Git commit/push，不修改 SEcode 自身或其他真实用户项目。

真实模型验收是阶段 17 Summary 修订 5 的门禁。没有可用凭据、模型外部故障或依赖源不可用时必须记录外部阻塞，不能用假模型通过替代真实验收结论。

## 51. 建议测试层次与文件边界

Spec 获批后的 Task 修订 6 应按以下层次拆分，并给每项列出精确白名单：

```text
T17-R5-01 需求追踪、公共 Schema 与红灯 fixture
  → T17-R5-02 摘要专用时限、确定性降级与安全错误映射
  → T17-R5-03 durable/projection/Server/Terminal/Client 展示与新旧恢复
  → T17-R5-04 墙钟 30/60 分钟契约
  → T17-R5-05 System Prompt V5 与工具使用回归
  → T17-R5-06 run_process readiness 与进程组清理
  → T17-R5-07 全量自动验证
  → T17-R5-08 新临时工作区真实模型验收与 Summary 修订 5
```

预计生产范围仅限：

- `lib/context` 的 errors/types/provider/summary/fallback/token 相关文件；
- `lib/agent` 的 types/schemas/runtime/errors/projection；
- `lib/domain/event.ts`；
- `lib/model` 仅限复用父/子 AbortSignal 所需的最小辅助，不能改变 provider wire；
- `lib/tools` 的 run-process schema/types/executor/dependencies；
- Server、Terminal、Client 和 Details/Transcript 中受公共事件、预算或 warning 直接影响的文件；
- 需求、阶段 17 Task/Summary/人工验收与索引。

若实现需要新依赖、第七个工具、通用后台进程管理、数据迁移、修改模型协议或扩张工作区安全边界，必须停止并再次回到 Spec。

## 52. 修订 5 风险与防护

| 风险 | 防护 |
| --- | --- |
| 本地降级摘要遗漏语义 | 仅作为显式标记的应急事实摘要；固定高优先级、保留最近 8 回合、真实模型后续自检；不声称完成 |
| 降级掩盖长期模型故障 | durable strategy/reason warning；业务模型随后仍失败时保留真实 Model 错误 |
| 30 分钟默认值放大成本 | 300 工具、显式请求保险、60 分钟硬上限、取消、重复错误和无进展保护保持有效 |
| 错误 details 泄密 | 有限枚举映射；不复制 cause/message/body/path；事件 Schema 与注入秘密测试 |
| readiness 探测本机其他服务 | 只允许显式 127.0.0.1 高位端口、子进程存活校验、随机端口测试、不跟随重定向 |
| 子进程或孙进程泄漏 | 独立进程组、成功/失败/取消/超时统一清理，测试后验证 PID/端口均释放 |
| Prompt 规则被误当硬安全边界 | 安全仍由 Runtime、Schema、审批和测试保证；真实模型回归单独记录 |
| 新旧 JSONL 不兼容 | 新字段 optional；旧缺失按 legacy 展示；不迁移、不重写历史 |

## 53. Spec 修订 5 审批检查

- [x] 已记录真实 Session 三个 run 的可复核失败事实与样例交付缺口。
- [x] 已区分摘要模型超时、外层错误掩盖、墙钟不足、Prompt 执行纪律和开发服务能力缺口。
- [x] 已定义 60000ms 摘要专用时限和一次确定性本地降级，不允许无限重试。
- [x] 已定义 durable strategy/reason、新旧事件兼容及安全错误 details。
- [x] 已把默认/最大墙钟明确为 30/60 分钟，并保留其他运行保护。
- [x] 已定义 System Prompt V5 的指令、顺序、工具纠错、安全和完成证据契约。
- [x] 已定义 `run_process` 回环 readiness 与进程组清理边界，不引入通用后台托管。
- [x] 已定义确定性测试、冻结毒化历史和新的真实多文件回归门禁。
- [x] 已明确不修改失败样例、不读取凭据、不提交、不开始阶段 18。
- [x] 用户于 2026-08-29 明确批准本 Spec 修订 5。

**历史结论：阶段 17 Spec 修订 5 已获批准并完成实施；该结论已被下方 Spec 修订 6 的审批回退取代。**

## 54. 修订 6 真实证据与诊断方法

### 54.1 观察边界

本轮使用 `diagnose` 的“反馈循环 → 复现 → 多假设 → 单变量验证”方法，只读取 R5-08 已保留的脱敏 JSONL、Context/Tools 代码、阶段 10/17 文档和测试。未修改产品代码/测试，未调用真实模型，未读取 Key，未修改或删除临时样例。

只读重放脚本第一次因 `tsx -e` 的 CJS 输出不支持顶层 `await` 而退出；包入异步函数后重跑成功。该脚本错误没有进入产品路径，也没有改变诊断输入。

### 54.2 精确重放

使用真实事件在各次 `run.failed` 前的稳定 seq 重建 `ContextHistory`，以 LongCat `contextWindow=64000`、75% 输入预算和当前六工具定义重新估算：

| 切面 | 完整回合 | 估算 Token | 输入预算 | `selectContextCompaction()` 结果 |
| --- | ---: | ---: | ---: | --- |
| 首次失败前 | 9 个 tools round | 52326 | 48000 | 淘汰最老 1 回合后最近 8 回合仍无法容纳摘要 |
| 同 Session“继续”失败前 | 9 个 tools round | 53308 | 48000 | 同一毒化历史重复失败，0 次业务模型请求 |
| 第二 Session 失败前 | 5 个 tools round | 68615 | 48000 | 少于硬保留 8 回合，直接拒绝 |
| readiness 后实现 run 失败前 | 7 个 round | 73426 | 48000 | 少于硬保留 8 回合，直接拒绝 |

现有 `tests/unit/context/compaction.test.ts` 的“最近 8 回合超预算时失败”用例稳定通过，证明这不是实现偶发回归，而是阶段 10 和修订 5 已批准的硬失败契约。

### 54.3 输出尺寸事实

- 主要单次输出是 `authentication.md`：1658 行、55785 UTF-8 字节。
- 另有 `data-security.md` 23848 字节、多个 Server Actions/Cookie 文档约 12KiB，以及目录列表 9～15KiB。
- `MAX_TOOL_OUTPUT_BYTES=64KiB` 是单次工具限制，不限制一次模型响应中的多个工具结果，也不与当前模型输入预算联动。
- `read_file` 的模型说明明确写着“省略 `endLine` 可读取到文件末尾”；LongCat 的行为符合当前工具契约，即使它违反了用户的软提示。
- 认证文档按连续 200 行分页时，前三页分别约 7220、6354、6849 字节，足以覆盖常规文档片段且不会形成 55KiB 单次结果。

### 54.4 单变量验证

仅减少保留回合数不能完整修复：第二 Session 最新一个工具回合估算 49063 Token，实现 run 最新一个工具回合估算 55143 Token，单回合已经超过 48000。

在内存副本中只限制模型上下文里的每个工具 `output`，不改变事件、参数、摘要、错误和元数据：

| 每个工具 output 上限 | 首次失败 | 同 Session 继续 | 第二 Session | 实现 run |
| ---: | ---: | ---: | ---: | ---: |
| 16384 字节 | 31287 | 32269 | 47576 | 48400（仍失败） |
| 8192 字节 | 26802 | 27784 | 36244 | 33468 |
| 4096 字节 | 23356 | 24338 | 25548 | 24816 |

8192 字节在四个真实切面全部低于预算，并保留比 4096 字节更多的近期事实，因此作为单结果最大值候选；仍需总量预算，防止一次响应或最近 8 回合包含任意数量的 8KiB 结果。

## 55. 排名假设与结论

1. **已确认：最近 8 回合硬保留发生在摘要/fallback 之前。** 预测是少于或等于 8 个大回合时不会调用摘要；真实 5/7 回合与源码均吻合。
2. **已确认：单个/单批大工具结果是直接载荷。** 预测是只缩短 `result.output` 即可让同一事件历史低于预算；8192 字节内存变体四例全部成立。
3. **已确认：`read_file` 默认读至 EOF 放大了模型的错误策略。** 预测是200行连续页显著小于整篇；真实文档数据成立。
4. **已确认：同 Session 新 run 会重放旧大输出。** 预测是没有 durable compaction 时“继续”在模型请求前重复失败；真实事件为0次请求，重放估算更高。
5. **排除为主因：75% 阈值或 Token 估算误差。** 三个切面分别超出预算20326～25426 Token，不是边界舍入；只有先对工具输出建立有界模型投影，调整阈值才有意义。

根因链为：

```text
read_file 默认 EOF + 单工具 64KiB + 一次响应可含多个工具
  → durable ToolResult 合法但模型上下文载荷无总量上限
  → 最近 8 完整 round 硬保留
  → compaction selection 在摘要/fallback 前失败
  → 新 run 重放同一历史并在 0 次模型请求时再次失败
```

## 56. 修订 6 目标、需求与范围

### 56.1 新增需求

- `FR-021`：`read_file` 省略或请求过大行范围时返回连续、有界、可继续的页面，并继续返回完整文件 SHA-256。
- `FR-022`：Context 对 durable 工具结果生成确定性、预算感知的模型可见投影；不得改写原始事件或破坏 assistant/tool 配对。
- `NFR-019`：合法工具输出的模型可见总量必须与 Session 固定 `contextWindow` 联动，不能只依赖每工具 64KiB 上限。
- `NFR-020`：旧毒化历史在不迁移 JSONL、不重复工具副作用的情况下，可由同 Session 新 run 恢复并取得业务模型进展。
- `SEC-016`：投影不得恢复私有参数或秘密；省略标记只含有限计数/哈希/相对事实，不反射绝对路径或原始内容。

### 56.2 范围内

- `read_file` 连续行分页和可继续元数据。
- 模型上下文中的工具结果二级投影、动态总量预算和确定性分配。
- baseline、压缩选择、摘要 transcript 与最终消息使用同一投影视图。
- 旧 JSONL、失败 run、新 run 恢复、Terminal/HTTP 错误提示和真实 LongCat 回归。
- 针对真实尺寸/批量形状的确定性 sanitized fixture；不复制真实文档正文或凭据。

### 56.3 范围外

- 不删除、迁移或重写已有 JSONL；不降低时间线/详情页可查看的 durable ToolResult。
- 不拆散 assistant/tool 消息，不删除工具调用 ID，不伪造工具重执行。
- 不增加第七个工具、Tokenizer/Agent SDK/外部摘要服务、数据库或云沙箱。
- 不把用户 prompt、assistant 正文或工具参数做静默语义摘要；本修订只二级限制公开 ToolResult 的 `output` 字段。
- 不修改 R5-08 失败样例，不继续使用 `/Users/starkirby/Codes/test/web`。

## 57. `read_file` 连续分页契约

### 57.1 行范围

- `startLine` 继续默认1；`endLine` 继续可选且必须大于等于 `startLine`。
- 每次最多返回从 `startLine` 开始的200个连续完整行；用户显式请求更远 `endLine` 时也只返回当前页，不以 Schema 错误惩罚可恢复的大范围请求。
- 有效结束行为：`effectiveEndLine = min(requestedEndLine ?? totalLines, startLine + 199, totalLines)`。
- 输出不使用“文件头 + 文件尾”冒充连续页。若页面仍命中既有64KiB UTF-8上限，保留现有安全截断并标记 `pageByteTruncated=true`；超长单行是明确限制，不伪造可无损续页。

### 57.2 元数据

在保留现有 `relativePath/startLine/endLine/totalLines/sha256/truncated/originalBytes/returnedBytes` 基础上增加：

```ts
hasMore: boolean;
nextStartLine?: number;
pageLimited: boolean;
pageByteTruncated?: boolean;
```

- `hasMore=true` 时 `nextStartLine=endLine+1`，模型可用相同 path 和新 startLine 继续。
- `sha256` 始终对应完整原始文件，不是当前页；写入/替换的并发保护语义不变。
- `truncated` 在页面限制或字节限制任一发生时为 true；`originalBytes` 表示用户原请求范围的 UTF-8 字节数，`returnedBytes` 表示实际页输出。
- 工具中文描述必须明确“默认最多200行、根据 `nextStartLine` 继续”，删除“省略 endLine 读取到文件末尾”的诱导语义。

### 57.3 兼容性

这是有意的模型工具行为变更：旧调用仍通过同一参数 Schema，短文件结果不变；长文件省略 `endLine` 不再一次返回 EOF。没有 durable Schema 迁移，旧 ToolResult 仍可解析和展示。

## 58. 模型上下文工具输出投影

### 58.1 两层事实

```text
durable ToolResult（最多64KiB，JSONL/Terminal/Web事实）
  → Context-only projection（有界 output + 完整状态/摘要/错误/元数据）
  → provider-independent tool ChatMessage
```

投影只影响下一次模型请求，不修改 `ContextHistory`、事件或 UI。工具 `ok`、`summary`、有限 `error`、metadata、approval 和 `argumentsTruncated` 原样保留；只有 `result.output` 可被二级截断。

### 58.2 单结果与总量预算

- 单个模型可见工具 output 最大8192 UTF-8字节。
- 本轮所有 retained tool output 的总预算为：

```text
min(32768, floor(inputBudgetTokens * ESTIMATED_UTF8_BYTES_PER_TOKEN * 0.25))
```

- 总预算只计 output 与省略标记；结构化状态、工具配对和 JSON 开销仍进入最终 `estimateContextTokens()`。
- 从最近 round 到最老 round 分配；同一 round 内各工具公平分配，不能让批量读取中的第一个结果耗尽全部额度。
- 小输出在单项和总量预算内逐字保留。大输出使用 UTF-8 安全的头/尾摘录与固定中文标记，至少包含原始/返回字节数；可选稳定 SHA-256 只计算已脱敏的省略内容。
- 预算耗尽的旧输出保留合法 tool message、状态、摘要、错误和 metadata，`output` 只显示“模型上下文已省略；durable 事实未删除”的固定标记。

### 58.3 一致性

- baseline估算、`selectContextCompaction()` 的retained估算、最终消息和摘要模型transcript必须消费同一个投影视图，禁止估算短视图却发送长视图。
- 完整工具回合继续表示 assistant tool_calls 与全部对应 tool messages 结构成对；不再等同于把每个 durable output 的全部字节原样重放给模型。
- deterministic fallback 本来只保留工具摘要/状态，不增加完整output；行为保持。
- provider continuation 不得绕过投影重新附加旧工具输出；工具副作用仍最多一次。

## 59. 毒化历史恢复与错误模型

1. 新run读取修订6前的64KiB ToolResult时直接使用新投影，不迁移事件；R5-08的同Session“继续”重放必须低于预算并产生新的`model.requested`。
2. 投影后若历史超过阈值，仍按最老完整round连续前缀压缩并保留最近8个结构完整round。
3. 投影后最近8回合、当前/初始目标、未解决错误或非工具正文仍无法容纳时，继续安全失败；不得静默删除goal、assistant正文、工具配对或安全诊断。
4. `CONTEXT_BUDGET_EXCEEDED`增加有限reason：`projected_recent_rounds_over_budget`；Runtime/Terminal/Web用固定中文解释“工具输出已二级限制但近期上下文仍过大，重复继续预计无效”。不输出估算详情、原始内容或路径。
5. 投影本身是确定性纯函数，不调用模型、不计业务模型请求、不产生工具调用或新durable事件；相同JSONL、profile和代码版本得到相同消息。

## 60. 修订 6 验收标准

### AC17-32：`read_file` 分页

- 1～200行短文件省略`endLine`时内容、SHA和行号保持兼容。
- 1658行/约56KiB fixture首次只返回1～200行、`hasMore=true`、`nextStartLine=201`；顺序读取全部页面可覆盖每个完整行且没有重叠/跳行。
- 显式大`endLine`同样分页；越界start、敏感文件、取消、UTF-8和超长单行行为有确定测试。

### AC17-33：有界模型投影

- 小ToolResult模型消息逐字不变；大结果只限制output，状态、摘要、错误、metadata、approval、toolCallId和配对不变。
- 单结果不超过8192字节；总量满足动态预算，批量工具公平且最新round优先。
- 原始事件、History对象和Terminal/Web DTO不变；秘密、绝对路径和私有参数扫描通过。

### AC17-34：真实事件形状回归

- 用sanitized fixture重建R5-08的9/5/7回合、55KiB单读、3个并行大读和失败后“继续”形状。
- 64K profile下四个切面全部低于48000输入预算；同Session新run先取得`model.requested`，不重复模板安装/readiness或其他已执行工具。
- 同一fixture禁用投影时必须稳定复现`CONTEXT_BUDGET_EXCEEDED`，证明测试命中原缺陷。

### AC17-35：合法失败与兼容

- 超大goal、assistant正文、工具参数或投影后仍过大的最近回合继续单次失败，并带有限`projected_recent_rounds_over_budget`。
- 75%阈值、最近8个结构完整回合、旧compaction、模型/本地摘要、取消、30/60分钟墙钟、300工具预算和语言门全部回归。
- 旧JSONL零迁移恢复；没有新事件类型或第七个工具。

### AC17-36：完整与真实回归

- 先运行Context/Tools/Agent/Terminal/HTTP/Client专项，再运行lint、typecheck、test、coverage、E2E、build、diff check。
- 使用保留的R5-08脱敏事件做只读重放；随后在新临时根重新执行一次`AC17-31`等价LongCat多文件任务。
- 真实任务必须完成认证、安全、隔离测试及lint/test/build；否则继续如实失败，不允许用投影测试或假模型替代。

## 61. 建议任务层次与文件边界

Spec获批后的Task修订7应按以下顺序细化：

```text
R6-01 需求追踪、真实尺寸 sanitized 红灯 fixture
  → R6-02 read_file 连续分页、元数据与工具描述
  → R6-03 Context-only 工具输出投影与预算分配
  → R6-04 compaction/summary/恢复/有限错误跨层回归
  → R6-05 全量自动验证
  → R6-06 新临时根真实 LongCat AC17-31 回归与 Summary 修订 6
```

预计生产范围仅限`lib/tools/read-file.ts`、file content/output/schema/types/registry的直接相关代码，`lib/context`的message renderer、provider、compaction、summary transcript、types/schema/error，以及Agent/Terminal/Server/Client的有限错误映射。测试只覆盖对应单元、集成、E2E和受控人工fixture。若需要durable新事件、依赖、模型wire改动或UI重新设计，必须回到Spec再审批。

## 62. 风险与防护

| 风险 | 防护 |
| --- | --- |
| 二级投影隐藏关键错误行 | 最新优先、头尾摘录、保留summary/error/metadata；模型可按`nextStartLine`重读 |
| 200行改变旧Agent预期 | 工具描述明确、短文件兼容、hasMore/nextStartLine、真实模型回归 |
| 动态预算算法与估算不一致 | 所有估算与实际消息共用同一投影视图；最终发送前再次估算 |
| 多工具批次中结果饥饿 | 同round公平分配，不能按第一个工具独占；专项测试顺序与确定性 |
| durable事实与模型视图混淆 | 固定投影标记明确“原事件未删除”；Timeline/Details继续展示durable结果 |
| 只修新工具无法恢复旧Session | Context投影覆盖所有旧ToolResult，不依赖read_file新元数据 |
| 投影被误当无限恢复 | 非工具硬保留仍可明确失败；有限reason告知重复继续无效 |
| 真实模型继续忽略分页 | 工具默认行为硬限制，不只依赖Prompt；Context总量预算作为第二防线 |

## 63. Spec 修订 6 审批检查

- [x] 已用真实事件seq重放并复现相同错误码与预算位置。
- [x] 已提出并验证5个可证伪假设，排除阈值舍入为主因。
- [x] 已证明只减回合数不足、16KiB不足、8KiB单结果变体覆盖四个真实切面。
- [x] 已定义read_file连续200行分页、完整SHA和继续元数据。
- [x] 已定义不改事件的模型上下文投影、单项/总量预算、公平分配和最新优先。
- [x] 已保持工具配对、最近8个结构完整回合、JSONL真相、取消/预算/审批和安全边界。
- [x] 已定义sanitized原缺陷红灯、旧Session恢复、合法失败、全量与真实LongCat回归。
- [x] 已明确无Task/代码授权、无凭据、无样例修改、无commit/push/deploy、阶段18锁定。
- [x] 用户于2026-08-29明确批准Spec修订6。

**当前结论：修复方案已经通过真实事件重放和单变量内存实验收敛；本Spec修订6已获批准，仅解锁Task修订7的编写，未开始任何产品实现。**
