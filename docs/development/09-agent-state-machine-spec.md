# 阶段 09 Spec：Agent 状态机

## 1. 文档状态与阶段门禁

- 当前状态：已批准
- 观察日期：2026-08-27
- 上一阶段：[08-jsonl-event-store-summary.md](./08-jsonl-event-store-summary.md) 已获用户批准
- 当前允许：依据本 Spec 生成和修订阶段 09 Task
- 当前禁止：Task 获批前编写 `lib/agent`、新增 Agent 测试、实现上下文压缩、终端、Route Handler 或 UI
- 下一步门禁：阶段 09 Task 获得用户批准后才能开始实现

审批链：

```text
阶段 08 Summary（已批准）
  → 阶段 09 只读观察（已完成）
  → 本 Spec（已批准）
  → 阶段 09 Task（已解锁）
  → Agent 实现与测试（禁止提前开始）
```

## 2. 阶段目标

本阶段建立一个与 Next.js、React、浏览器和具体终端界面解耦的本地 Node.js Agent 运行时。它把阶段 04–08 已批准的模型、工作区、工具、审批和 JSONL 存储能力编排为一个可取消、可审批、可恢复、可验证的单 Agent 决策循环。

阶段完成后，核心运行时应能够在注入的上下文提供器和模型客户端下完成：

```text
恢复 Session
  → 运行前校验
  → run.started / user.message
  → 构建模型上下文
  → model.requested / model.completed
  → 文本终止，或顺序处理工具调用
  → 自动执行 / 拒绝 / 等待审批
  → 工具结果反馈下一轮
  → completed / failed / cancelled
```

本阶段不提供最终用户可操作入口。真实历史上下文由阶段 10 实现，可交互终端由阶段 11 实现；因此基础人工对话测试仍要等阶段 10 和阶段 11 完成。

## 3. 覆盖需求

| 需求 | 本阶段覆盖方式 | 本阶段验证方式 |
| --- | --- | --- |
| FR-004 | 自研模型—工具—反馈循环、终止条件和串行工具调度 | 假模型完整轨迹测试 |
| FR-005 | 统一 durable/live 事件发布和运行快照 | 事件顺序、内容和状态投影测试 |
| FR-006 | 审批等待、允许、拒绝和一次性授权编排 | 审批生命周期测试 |
| FR-007 | 运行、模型、工具和审批等待统一取消 | Abort 路径测试 |
| FR-008 | JSONL 重放、open run 中断恢复、事件事实驱动 | 恢复与非法历史测试 |
| FR-009 | 按 Session 固定的 profile 调用模型 | 模型配置运行前校验测试 |
| FR-010 | 为阶段 10 提供上下文端口，并唯一负责追加压缩事实 | fake provider 与 compaction 事件测试 |
| NFR-002 | 运行输入、审批输入、上下文输出和公共结果严格校验 | Zod 与类型检查 |
| NFR-003 | 状态机错误结构化、有限、可解释，不泄露内部 cause | 错误映射测试 |
| NFR-004 | 默认 30 次模型迭代、10 分钟总时限 | 边界和假时钟测试 |
| NFR-006 | `lib/agent` 为 Node-only 核心，不依赖框架和 UI | 导入扫描与 Node Vitest |
| NFR-008 | Spec / Task / Summary 三级文档证据 | 文档门禁检查 |
| SEC-001/002 | 每次运行重新建立工作区能力，工具继续受 workspace 边界保护 | workspace preflight 与 temp workspace 测试 |
| SEC-003/004/005 | 工具执行必须经过阶段 07 gateway，状态机无审批绕过出口 | gateway 顺序与禁止路径测试 |
| SEC-006 | prompt、delta、消息、错误、审批原因均脱敏；私有 reasoning 和 Key 不进入事件 | 跨 chunk 脱敏与源码扫描 |
| SEC-008 | 延续可信本地单用户、单进程应用边界 | 规格和限制审查 |
| COM-001/003 | Agent 循环、状态投影、终止和错误恢复全部自行实现 | 依赖和源码扫描 |

## 4. 观察范围与方法

本次观察严格只读，检查了：

1. `00-process.md` 的三级审批和终端优先顺序。
2. `01-requirements.md` 的功能、非功能、安全和题目合规要求。
3. 阶段 03 的领域消息、运行状态、16 类 durable 事件和唯一 live 事件。
4. 阶段 04 的 `ModelClient`、continuation、流式 delta、错误和配置快照。
5. 阶段 05 的 `WorkspaceHandle` 与恢复时重新验证约束。
6. 阶段 06 的六个工具、prepared invocation、结构化结果和专用取消异常。
7. 阶段 07 的风险判定、pending approval、一次性 authorization 和 gateway 公共出口。
8. 阶段 08 的 JSONL store、draft 所有权、分页重放、open run 报告和提交不确定语义。
9. 当前 `package.json`、测试布局、Git 状态和 `lib` 公共 barrel。
10. 仓库 `AGENTS.md` 的 Next.js 16.3.3 本地文档约束。

观察期间未运行会重写文件的命令，未安装依赖，未创建 Agent Task、代码或测试。

## 5. 观察事实与当前差距

### 5.1 已具备的前置能力

- `ModelClient.complete()` 已统一 DeepSeek、LongCat 和 generic OpenAI-compatible 模型。
- 模型层已将工具调用归一化为合法或非法联合；模型重试和单请求 120 秒超时已在阶段 04 内部完成。
- 模型 continuation 是仅进程内的 opaque capability，不能序列化或从事件重建。
- 六个本地工具只有 `prepareLocalToolCall()` 是公共准备入口；执行必须经过审批层。
- 审批层的 pending 和 authorization 均为 opaque、一次性、仅进程内能力。
- JSONL store 拥有 durable event 的 ID、seq、Session、时间和 fsync 提交。
- storage 能报告 open run，但有意不验证 run/model/tool/approval 的业务生命周期。
- `assistant.delta` 是唯一 live event，不能写入 JSONL。

### 5.2 尚不存在的能力

- 当前没有 `lib/agent` 或等价状态机模块。
- 没有运行注册表、Session 互斥、审批等待器或取消协调器。
- 没有跨事件生命周期投影与非法历史检测。
- 没有把模型 completion 转换为 durable/live 事件的编排器。
- 没有串行执行多工具调用、把结果反馈模型或连续错误终止的逻辑。
- 没有把 open run 转换为 `run.interrupted` 的恢复入口。
- 没有阶段 10 的真实上下文构建与压缩实现。
- 没有阶段 11 的可交互终端，因此本阶段完成后仍不能直接人工聊天。

### 5.3 现有协议形成的硬约束

1. 事件只能通过 `JsonlEventStore.appendEvent()` 落盘，Agent 不能制造 seq、ID 或时间。
2. successful run 必须且只能有一个 final `assistant.message` 和一个 `run.completed`。
3. 需要审批的工具必须先持久化批准事实，再出现 `tool.started`。
4. 拒绝审批的工具不得出现 `tool.started`，而要直接产生失败 `tool.result`。
5. `ModelAbortError` 与 `LocalToolExecutionAbortedError` 是控制流，不能伪装成模型可重试的工具结果。
6. continuation、pending、authorization、prepared invocation 均不能持久化或恢复。
7. `EVENT_COMMIT_UNCERTAIN` 后不能盲目重复追加或重复执行工具。
8. storage 只保证物理日志正确，阶段 09 必须补全业务不变量。
9. 当前 `model.completed` 不记录 tool-call 数量；崩溃后无法仅凭日志证明一次模型工具计划是否完整写入。
10. 当前阶段没有 Next.js 文件变更；根据 `AGENTS.md`，真正编写 Next.js 代码前仍需在阶段 13 阅读 `node_modules/next/dist/docs/` 的相关指南。

## 6. 范围边界

### 6.1 范围内

- Agent 公共类型、strict Schema、错误模型和限制常量。
- 纯事件生命周期 projector/reducer。
- Session 恢复和 open run 中断事实追加。
- 单进程 active-run 注册表与同 Session 单运行约束。
- 运行前 Session、历史、workspace、model profile 校验。
- 模型循环、continuation 持有、实时文本事件发布。
- 合法、非法、未知和参数错误工具调用的统一事件轨迹。
- 工具风险 gateway、审批等待、允许、拒绝和一次性执行。
- 总时限、最大迭代、连续相同工具错误、取消和终止。
- durable 事件提交后发布、live 事件只发布不持久化。
- 面向阶段 10 的 `AgentContextProvider` 端口。
- 依赖注入、假模型、临时工作区和故障注入单元测试。

### 6.2 范围外

- 真实历史选择、token 估算、75% 阈值和摘要生成；属于阶段 10。
- 终端命令、TTY、stdin/stdout 审批交互；属于阶段 11。
- 真实模型人工冒烟、示例项目完整修复和终端集成验收；属于阶段 12。
- Next.js Route Handler、NDJSON HTTP、断线信号接线；属于阶段 13。
- React 工作台、Markdown、差异卡片和 Playwright 产品 E2E；属于阶段 14。
- Git commit/push、发布、部署、依赖升级、协议版本升级。
- 多 Agent、多进程协调、跨进程锁、后台任务队列和强操作系统沙箱。

## 7. 总体设计

```text
AgentRuntime
  ├── Session lifecycle projector
  ├── Active run registry / Abort coordinator
  ├── AgentContextProvider port ──→ 阶段 10 实现
  ├── ModelClient ──→ 阶段 04
  ├── Tool prepare ──→ 阶段 06
  ├── Approval gateway ──→ 阶段 07
  ├── Workspace factory ──→ 阶段 05
  ├── JsonlEventStore ──→ 阶段 08
  └── AgentEventSink ──→ 阶段 11/13 消费
```

设计原则：

- JSONL durable event 是唯一可恢复事实，active registry 只保存不可序列化的运行能力。
- projector 是纯函数；runtime 负责副作用，二者不得混为一体。
- 所有工具调用串行；同一 Session 同时最多一个 active run。
- Agent 不实现第二套模型重试。`ModelClient` 重试耗尽后，运行按结构化模型错误结束。
- 上下文提供器只计算投影，不能直接追加事件；所有 durable 写入仍由 runtime 单点排序。
- 事件消费者不是事实源。即使实时消费者断开，恢复仍以 JSONL 为准。

## 8. 固定限制与常量

| 常量 | 固定值 | 说明 |
| --- | ---: | --- |
| `DEFAULT_MAX_AGENT_ITERATIONS` | 30 | 一次 run 最多发起 30 次模型请求 |
| `MAX_AGENT_ITERATIONS` | 30 | 调用者只能降低，不能突破 |
| `DEFAULT_AGENT_DURATION_MS` | 600000 | 默认总时限 10 分钟 |
| `MAX_AGENT_DURATION_MS` | 600000 | 调用者只能降低，不能突破 |
| `MIN_AGENT_DURATION_MS` | 1000 | 防止无意义配置 |
| `MAX_PROMPT_CHARACTERS` | 1048576 | 与 `user.message` 领域上限一致 |
| `MAX_PROMPT_PREVIEW_CHARACTERS` | 4096 | 与 `run.started` 一致 |
| `MAX_CONSECUTIVE_IDENTICAL_TOOL_ERRORS` | 3 | 第三次落盘后终止 |
| `INVALID_TOOL_CALL_NAME` | `invalid_tool_call` | 合法的领域占位工具名 |
| `MAX_STREAM_REDACTION_PREFIX` | 256 bytes | 跨 chunk 脱敏的最大待判定前缀 |

迭代计数定义为已经成功提交 `model.requested` 的次数。恰好第 30 次请求仍可正常返回 final 并完成；只有准备发起第 31 次时才触发迭代上限。

总时限从运行前置校验完成、准备提交 `run.started` 前开始，覆盖 durable 写入、上下文构建、模型调用、工具执行、审批等待和终态写入。运行前 Session/历史/workspace/model 配置校验不消耗该时限。

## 9. 公共输入与运行句柄

建议公共输入：

```ts
interface AgentRunRequest {
  sessionId: SessionId;
  prompt: string;
  limits?: {
    maxIterations?: number;
    maxDurationMs?: number;
  };
  thinking?: ModelThinkingOptions;
}

interface AgentRunControls {
  signal?: AbortSignal;
  onEvent?: AgentEventSink;
}
```

要求：

- `AgentRunRequestSchema` 为 strict object，拒绝额外字段。
- prompt 去除首尾空白后必须非空，但正文内部格式保留。
- limits 缺省使用固定默认值，只允许降低上限。
- `AbortSignal` 和回调不可 JSON 化，因此不进入 Zod 请求体和 durable 事件。
- thinking 仍由模型 profile 能力校验；Agent 不伪造不支持的推理模式。

`startRun()` 在完成前置校验并成功提交 `run.started` 后返回：

```ts
interface AgentRunHandle {
  readonly sessionId: SessionId;
  readonly runId: RunId;
  readonly completion: Promise<AgentRunOutcome>;
  cancel(reason?: string): boolean;
}
```

返回句柄不表示 run 已完成，只表示运行事实已经建立。后续失败通过 terminal event 和 `completion` 体现；若 durable 提交无法确认，`completion` 拒绝并要求重新加载。

`AgentRunOutcome`：

```ts
type AgentRunOutcome =
  | { status: "completed"; runId: RunId; iterations: number; durationMs: number }
  | { status: "failed"; runId: RunId; iterations: number; error: ErrorInfo }
  | { status: "cancelled"; runId: RunId; iterations: number; reason: string };
```

正常 terminal event 提交成功时 `completion` resolve；terminal event 自身无法确认提交时 reject `AgentLayerError`，不能伪造一个已持久化 outcome。

## 10. AgentRuntime 公共职责

建议公共能力：

```ts
interface AgentRuntime {
  recoverSession(sessionId: SessionId): Promise<SessionAgentSnapshot>;
  startRun(
    request: AgentRunRequest,
    controls?: AgentRunControls,
  ): Promise<AgentRunHandle>;
  cancelRun(runId: RunId, reason?: string): boolean;
  resolveApproval(
    runId: RunId,
    approvalId: ApprovalId,
    decision: ApprovalDecision,
  ): Promise<AgentApprovalResolution>;
  getActiveRun(runId: RunId): ActiveAgentRunView | undefined;
}
```

约束：

- `recoverSession()` 可重复调用；没有 open run 时不写事件。
- `startRun()` 自动执行相同恢复检查，调用方不能绕过。
- `cancelRun()` 和 handle.cancel 是同一控制源，重复取消返回 false，不重复 terminal event。
- `resolveApproval()` 只接受当前 active run 的当前 pending approval。
- 运行时视图是当前进程的便利信息，不作为恢复事实，不写第二份状态文件。
- 公共 barrel 不导出 active registry、raw executor、prepared invocation 构造器或 capability 存储。

## 11. 上下文提供器边界

阶段 09 只定义端口，不实现阶段 10 的真实算法：

```ts
interface AgentContextRequest {
  sessionId: SessionId;
  runId: RunId;
  iteration: number;
  signal: AbortSignal;
}

interface AgentContextResult {
  messages: readonly ChatMessage[];
  compaction?: {
    throughSeq: number;
    summary: string;
    retainedRange: { fromSeq: number; toSeq: number };
  };
}

interface AgentContextProvider {
  buildContext(request: AgentContextRequest): Promise<AgentContextResult>;
}
```

锁定规则：

1. provider 根据已经提交的事件构建消息，不接收 storage 写权限。
2. provider 若发生压缩，只返回 compaction draft；runtime 校验并提交 `context.compacted` 后才可发起模型请求。
3. `messages` 必须逐项通过 `ChatMessageSchema`，且至少包含系统约束和当前任务所需内容。
4. provider 抛错或返回非法结果时，运行以 `AGENT_CONTEXT_FAILED` 结束，不向模型发送半成品上下文。
5. 阶段 09 测试只注入 deterministic fake provider；不得提前实现 token 估算、摘要模型调用或历史窗口策略。
6. 阶段 10 可以新增具体 provider，但不得改变本阶段批准的 runtime 调用顺序和单点事件写入原则；若必须改变公共接口，需回到 Spec 重新审批。

## 12. 纯生命周期投影器

投影器按 seq 接收 durable events，输出 `SessionAgentSnapshot` 和可选 active `RunSnapshot`。它不得访问磁盘、时钟、模型、工具或审批 capability。

### 12.1 Session 级不变量

- 第一条必须是无 runId 的 `session.created`；后续不得再次出现。
- 同一时刻最多一个未终止 run。
- 新 `run.started` 只能出现在 idle 或前一 run 已终止后。
- run-scoped 事件必须属于当前 active run，不能回写已终止 run。
- 每个 run 最多一个 terminal event，terminal 后不能再出现该 run 的任何事件。

### 12.2 Run 起始和用户消息

- `run.started` 后、第一次 `model.requested` 前必须且只能有一个 `user.message`。
- `user.message` 不得出现在模型循环中间。
- 运行限制由 `run.started` 固定，后续不能漂移。
- `run.interrupted` 可终止合法但不完整的 open run。

### 12.3 模型回合

- iteration 从 1 开始严格连续。
- 同 iteration 必须先 `model.requested`，再且只能有一个 `model.completed`。
- 上一个模型回合的全部已记录工具请求必须已有结果，才允许下一次 `model.requested`。
- `model.completed.finishReason = stop` 后只能产生一个 final message，再 `run.completed`；不能再请求工具或下一轮模型。
- `model.completed.finishReason = tool_calls` 后可以先有最多一个 intermediate assistant message，再出现工具请求；不能直接完成 run。
- usage 仅投影 prompt/completion/total tokens；模型私有 reasoning token 和内容均不写事件。

### 12.4 工具调用

- `toolCallId` 在一个 run 内唯一。
- 同一次模型 completion 的全部 `tool.requested` 必须先按模型顺序提交，再开始第一个工具的审批或执行。
- 每个工具请求最多一个 `approval.required`、一个 `approval.resolved`、一个 `tool.started` 和一个 `tool.result`。
- prepare 失败、policy denied、approval rejected 都允许从 requested 直接到 result。
- 自动允许的工具从 requested 到 started，再到 result。
- 需审批工具必须 requested → required → resolved(approved) → started → result。
- resolved(rejected) 后不得 started，必须直接产生 `TOOL_APPROVAL_REJECTED` result。
- approved 事实不等于可恢复 capability；open run 重启后必须 interrupted。
- 下一工具只能在前一工具 result 后开始，以保证串行副作用。

### 12.5 压缩事件

- `context.compacted` 只允许出现在稳定回合边界、下一次 `model.requested` 之前。
- `throughSeq` 必须小于压缩事件自身 seq。
- retained range 必须有序并指向已有稳定历史。
- 完整工具回合、摘要内容和 75% 阈值由阶段 10 进一步验证。

### 12.6 终态

- `run.completed` 前必须有且只有一个 final assistant message，不得有未完成模型请求、工具请求或审批。
- `run.completed.iterations` 必须等于已提交的 model request 数量。
- `run.failed`、`run.cancelled`、`run.interrupted` 可以从任意合法未终态位置结束，以表达失败或崩溃；它们不要求补造未执行工具结果。
- failed/cancelled 的 iterations 必须等于已提交的 model request 数量。
- interrupted 的 `lastStableSeq` 必须等于追加该事件前 inspection 得到的稳定末序号。

投影器应允许“合法但尚未完成”的 open history，供当前 runtime 继续；但进程重启后不能继续，因为 capability 已丢失，只能追加 interrupted。

## 13. Session 恢复算法

每次显式恢复或新 run 前：

1. `inspectSession(sessionId)`，由 storage 完成不完整尾行修复并取得 `lastStableSeq/openRunIds`。
2. 通过分页 `readEvents(afterSeq, limit)` 增量喂给纯 projector，不把整份事件对象永久保存在 runtime。
3. 如果业务不变量非法，抛 `AGENT_HISTORY_INVALID`，不猜测、不跳事件、不写新 run。
4. 如果没有 open run，返回当前 idle/terminal snapshot，不写事件。
5. 如果恰有一个 open run 且历史合法，追加固定、脱敏原因的 `run.interrupted`；`lastStableSeq` 使用步骤 1 的值。
6. 重新读取并投影，确认 Session 已回到可启动状态。
7. 如果报告多个 open run 或出现交叠 run，视为非法历史，不逐个补 terminal。

恢复不需要模型配置和工作区可用，因为中断事实只描述进程能力丢失。恢复绝不：

- 重建 continuation。
- 从 approved 事件重建 authorization。
- 从 required 事件重建 pending approval。
- 重新执行可能已经开始但未记录结果的工具。
- 直接编辑 `events.jsonl` 或 data root。

若中断事件提交返回 `EVENT_COMMIT_UNCERTAIN`，本次恢复失败；调用方必须重新加载，不能重复同一 draft。

## 14. 新运行前置校验

严格顺序：

1. 解析 `AgentRunRequestSchema`，在创建 runId 前拒绝非法输入。
2. 检查外部 signal；已取消则返回 `AGENT_START_ABORTED`，不创建运行事实。
3. 获取该 Session 的进程内互斥；已有 active run 则返回 `AGENT_SESSION_BUSY`。
4. 执行第 13 节恢复和生命周期校验。
5. 读取不可变 Session metadata。
6. 用 metadata.workspacePath 重新调用 `createWorkspaceHandle()`，不能把字符串当 capability。
7. 从 `ModelClient.getConfigSnapshot()` 查找 metadata.modelProfileId，确认 profile 存在且 `configured=true`。
8. 确认 context provider 已注入。
9. 对 prompt 执行秘密脱敏；脱敏后的完整 prompt 同时用于模型上下文和 durable `user.message`，原始 prompt 不进入模型、不落盘、不长期保留。
10. 生成 runId，建立 linked AbortController、总时限 timer 和 active registry entry。
11. 提交 `run.started`，成功后返回 handle，并继续后台循环。

步骤 1–8 失败时没有 run.started，因此直接抛结构化 `AgentLayerError`。步骤 10 以后发生的普通运行错误必须尽量写 terminal event；任何不能确认的 durable 提交按第 23 节处理。

## 15. 事件提交与发布规则

### 15.1 Durable event

统一使用：

```text
构造最小 draft
  → 领域/Agent 语义校验
  → eventStore.appendEvent
  → projector 接收已提交完整事件
  → onEvent 发布完整事件
```

- 只有 `appendEvent()` 成功返回后，事件才可发布给终端/API。
- sink 看到的 durable event 必须与 JSONL 中事实一致，不能先发临时 seq。
- 同 run 的事件发布严格串行并 await，保证 backpressure 和顺序。
- sink 失败后立即禁用该 sink，并触发运行取消源 `event_consumer_disconnected`；后续 terminal 仍尝试落盘，但不再次调用失败 sink。
- 阶段 13 HTTP 断线还应显式 abort controls.signal；sink 失败不是替代 HTTP AbortSignal 的唯一机制。

### 15.2 Live delta

`assistant.delta`：

- 由 Agent 生成 UUID、时间和每 run 从 1 开始连续的 `streamSeq`。
- 只在收到非空、已脱敏片段时发布，绝不调用 store。
- model client 不提供 reasoning delta；Agent 不访问 continuation 内部。
- 一个 model completion 内的 live 文本只对应该 completion 的公开 content。
- durable final/intermediate message 必须再次对完整 content 脱敏和校验；页面以后以 durable 完整消息校正流式显示。

### 15.3 跨 chunk 流式脱敏

不能简单对每个 chunk 独立调用正则，因为 `Bearer`、`sk-` 或 `_API_KEY=` 可能跨 chunk。阶段 09 必须实现一个增量脱敏器：

- 只保留尚不能判定的有限前缀，不缓存整段回答。
- 对既有 `redactSecrets()` 支持的三类模式产生等价结果。
- 一旦确认敏感 token，先输出固定 `[REDACTED]`，再丢弃其余 token 字符直到边界。
- 待判定环境变量名最多保留 256 bytes；超过上限时保守替换，而不是原样泄露。
- completion 正常结束时 flush 非敏感尾部；取消或错误时丢弃未确认尾部。
- 任意 chunk 切分下，拼接后的 live 文本不得包含测试哨兵秘密，并应与完整内容脱敏结果一致。

## 16. Agent 模型循环

后台循环固定为：

1. 成功提交一次且仅一次 `user.message`。
2. 检查取消、总时限和下一 iteration 是否超过上限。
3. 调用 context provider。
4. 如 provider 返回 compaction，先提交 `context.compacted`。
5. 提交 `model.requested`，迭代计数加一。
6. 调用 `ModelClient.complete()`，传入 profile、messages、`LOCAL_TOOL_DEFINITIONS`、linked signal、thinking、上轮 continuation 和流式回调。
7. 将 completion.continuation 只保存在 active run 内存中，供下一轮调用。
8. 提交 `model.completed`；usage 丢弃 reasoningTokens。
9. 根据 finish reason 进入文本完成或工具路径。

若 finish reason 为 `stop`：

1. content 必须非空且满足领域大小限制。
2. 提交一个 `assistant.message(kind=final)`。
3. 提交 `run.completed`，iterations 使用模型请求计数，duration 使用单调时钟。
4. 清理 timer、listeners、continuation、pending、authorization 和 registry。

若 finish reason 为 `tool_calls`：

1. 若 content 非空，先提交一个 `assistant.message(kind=intermediate)`。
2. 验证所有工具 ID 在本 completion 和当前 run 内唯一。
3. 将所有调用按模型顺序归一为可持久 `tool.requested` 并全部提交。
4. 再按同一顺序逐个 prepare、授权、执行和提交 result。
5. 每个 result 更新连续错误 streak。
6. 所有请求都已有 result 后，回到下一轮模型请求。

不得并行执行多个工具，也不得在全部 requested 事实提交前执行第一个副作用。

## 17. 工具调用归一化

### 17.1 合法调用

对 `{ok: true, call}`：

1. 调用 `prepareLocalToolCall(call)`。
2. 使用返回的 `publicArguments/argumentsTruncated` 构造 `tool.requested`。
3. prepared invocation 只留在当前工具槽位内存中，不能放入事件、错误 details 或 snapshot。

### 17.2 模型层判定为非法的调用

对 `{ok: false, id, name, rawArgumentsPreview, error}`：

- 保留模型层生成的稳定 UUID 作为 toolCallId。
- 使用固定合法名称 `invalid_tool_call`。
- publicArguments 只包含经过 `createPublicToolArguments()` 处理的原始名称、有限参数预览和错误码。
- `argumentsTruncated` 固定为 true，表明不是可执行的完整参数。
- 提交 `tool.requested` 后直接提交失败 `tool.result`，错误沿用有限的 `MODEL_INVALID_TOOL_CALL` 信息。
- 结果进入下一轮上下文，让模型有一次自我修正机会。

### 17.3 unknown 或参数校验失败

合法名称但未注册、或 Zod 参数失败，由 `prepareLocalToolCall()` 返回有限 ToolResult：

- 仍先提交 `tool.requested`。
- 不进入风险评估，不产生 `tool.started`。
- 直接提交 `tool.result` 并反馈模型。

### 17.4 非法 ID 复用

如果 toolCallId 在当前 run 已出现，不能覆盖旧槽位或生成新 ID。`model.completed` 已是事实，随后运行以 `AGENT_MODEL_OUTPUT_INVALID` 失败，不能执行任何本 completion 的工具。

## 18. 风险、审批与执行

### 18.1 prepare 失败

```text
tool.requested
  → tool.result(failed)
```

### 18.2 policy denied

```text
tool.requested
  → requestLocalToolAuthorization
  → denied
  → tool.result(TOOL_POLICY_DENIED)
```

### 18.3 自动允许

```text
tool.requested
  → authorized capability
  → tool.started
  → executeAuthorizedLocalTool
  → tool.result
```

`tool.started` 必须成功提交后才消费 authorization 并执行。即使执行失败或取消，authorization 也不能复用。

### 18.4 需要审批

```text
tool.requested
  → approval.required
  → runtime status = awaiting_approval
  → 等待 resolveApproval / cancel / timeout
```

active registry 只保存一个当前 `PendingToolApproval` 和其 promise resolver。对外只暴露 `PendingToolApprovalView`。

### 18.5 批准

1. 按 runId + approvalId 找到当前 pending。
2. 对 decision 执行 strict Schema 和秘密脱敏。
3. 先调用 `resolveLocalToolApproval()` 得到一次性 authorization；invalid 不写事件，pending 保持。
4. 提交 `approval.resolved(approved=true)`。
5. 只有步骤 4 成功后，唤醒工具循环并提交 `tool.started`。
6. 消费 authorization 执行并提交 result。

若批准事实提交失败，丢弃内存 authorization，不执行工具；不能通过重试 resolve 重建能力。

### 18.6 拒绝

1. gateway 返回 rejected ToolResult。
2. 提交 `approval.resolved(approved=false)`。
3. 不提交 `tool.started`。
4. 提交 gateway 提供的 `TOOL_APPROVAL_REJECTED` result。
5. 清理 pending，继续下一工具或下一模型轮。

### 18.7 错误审批请求

- run 不存在、不是 active、没有 pending、approvalId 不匹配或已经处理，都返回结构化 control error。
- invalid resolve 不追加 `approval.resolved`，不改变 pending，不终止 run。
- 重复批准/拒绝不能执行第二次。
- 用户审批 reason 先脱敏并限制 4096 字符，原始值不进入 gateway cause 或事件。

## 19. 取消、超时与终止来源

每个 active run 使用一个内部 AbortController，链接：

- 调用方 `controls.signal`。
- `handle.cancel()` / `runtime.cancelRun()`。
- 总运行时限 timer。
- event sink 失败。

只记录第一个终止来源，后续 abort 幂等。分类：

| 来源 | terminal | 说明 |
| --- | --- | --- |
| 用户/调用方取消 | `run.cancelled` | reason 脱敏、有限；默认“用户取消运行” |
| event consumer 断开 | `run.cancelled` | 固定原因，不记录 callback 错误 |
| 10 分钟总时限 | `run.failed` | `AGENT_RUN_TIMEOUT` |
| 模型内部 120 秒超时 | `run.failed` | 保留 `MODEL_TIMEOUT`，不是用户取消 |
| 迭代上限 | `run.failed` | `AGENT_ITERATION_LIMIT` |
| 连续工具错误 | `run.failed` | `AGENT_REPEATED_TOOL_ERROR` |

`ModelAbortError` 或 `LocalToolExecutionAbortedError` 到达 runtime 时，必须查询内部终止来源：

- 有用户/sink abort：cancelled。
- 有总时限：failed timeout。
- 没有 Agent abort 来源却收到专用 abort：视为 `AGENT_INTERNAL_ERROR`，防止静默误分类。

取消审批等待时必须 reject/唤醒等待 promise，清空 pending，且不得产生 approval.resolved 或 tool.result。`run.cancelled` 可以直接终止未完成工具槽位。

## 20. 连续相同工具错误终止

每次成功提交 `tool.result` 后计算 streak：

```text
signature = toolName
  + error.code
  + SHA-256(canonical JSON(publicArguments))
```

canonical JSON 必须递归排序 object keys，数组保持顺序，使用已持久化 publicArguments，不读取敏感 invocation。

- result.ok=true：streak 清零。
- 失败 signature 与上一次相同：streak +1。
- 失败 signature 不同：streak=1 并替换当前 signature。
- 第三次相同连续失败的 result 必须先落盘，再提交 `run.failed(AGENT_REPEATED_TOOL_ERROR)`。
- 第三次后不再请求模型，也不执行同一 completion 中尚未开始的后续工具。
- 恢复投影能够从当前 run 已有 tool.result 重建 streak；但重启后的 open run仍直接 interrupted，不继续执行。

## 21. 运行状态派生

状态只由事件事实和当前进程内等待位置派生：

| 条件 | `RunStatus` |
| --- | --- |
| run.started、稳定回合边界、工具间隙 | `queued` |
| model.requested 尚无 completed | `requesting_model` |
| approval.required 尚无 resolved | `awaiting_approval` |
| tool.started 尚无 result | `executing_tool` |
| run.completed | `completed` |
| run.failed | `failed` |
| run.cancelled | `cancelled` |
| run.interrupted | `interrupted` |

`queued` 不是后台队列承诺，只表示 run 已存在但当前不在模型请求、审批等待或工具执行的稳定边界。

## 22. 错误模型

新增 `AgentLayerError`，公共字段仍是阶段 03 `ErrorInfo`，原始 cause 不可枚举且不进入 durable event。

建议稳定 Agent 错误码：

| 错误码 | recoverable | 使用位置 |
| --- | --- | --- |
| `AGENT_INPUT_INVALID` | false | run/approval 公共输入非法 |
| `AGENT_START_ABORTED` | true | run.started 前 signal 已取消 |
| `AGENT_SESSION_BUSY` | true | 同 Session 已有 active run |
| `AGENT_HISTORY_INVALID` | false | 跨事件业务历史损坏 |
| `AGENT_WORKSPACE_UNAVAILABLE` | true | Session workspace 无法重建 |
| `AGENT_MODEL_UNAVAILABLE` | true | 固定 profile 缺失或未配置 |
| `AGENT_CONTEXT_FAILED` | true | provider 抛错或输出非法 |
| `AGENT_RUN_NOT_FOUND` | true | cancel/approval 找不到 active run |
| `AGENT_APPROVAL_NOT_PENDING` | true | 当前没有该 pending approval |
| `AGENT_APPROVAL_INVALID` | true | approval resolve 生命周期非法 |
| `AGENT_ITERATION_LIMIT` | false | 准备超过迭代上限 |
| `AGENT_RUN_TIMEOUT` | true | 总运行时限 |
| `AGENT_REPEATED_TOOL_ERROR` | false | 三次连续相同失败 |
| `AGENT_MODEL_OUTPUT_INVALID` | true | 重复 tool ID 等跨调用非法输出 |
| `AGENT_ASSISTANT_MESSAGE_TOO_LARGE` | false | 可见消息超过领域事件上限 |
| `AGENT_INTERNAL_ERROR` | false | 未分类内部错误 |

下层结构化错误的处理：

- 模型请求期间的 `ModelLayerError.error` 原样作为 `run.failed.error`，不改写为模糊 Agent 错误。
- workspace/model 配置的前置失败包装为有限 Agent preflight error，cause 不公开。
- 普通 ToolResult 错误作为工具事实反馈模型，不直接失败 run，除非触发三连规则。
- EventStoreError 不复制路径、原始记录或 errno cause。
- approval control error 不进入 run.failed，除非真正破坏 active loop。
- 未知异常转换为固定 `AGENT_INTERNAL_ERROR`，不记录 stack、对象 dump 或输入正文。

## 23. Durable 提交失败与不确定提交

这是运行时最高优先级失败边界：

1. 每次副作用前必须先提交相应 started/approved 事实。
2. `EVENT_COMMIT_UNCERTAIN` 后立即停止模型和工具循环，abort active work，清理 capability。
3. 不自动重试同一事件，不追加 run.failed，不重复执行工具。
4. `completion` reject 包含有限 EventStoreError；Session 保留 open 状态。
5. 下一次 `recoverSession/startRun` 重新读取磁盘：若事件已提交则投影它，若未提交则以最后稳定事实为准，然后为 open run 追加 interrupted。
6. terminal event 自身提交失败或不确定时，不返回伪造的 completed/failed/cancelled outcome。
7. 其他 storage 错误发生在 run.started 后同样停止并 reject，统一留给下一次恢复中断，避免在存储异常期间递归追加另一个事件。

这意味着某些磁盘故障不会立即拥有 durable `run.failed`，但不会谎称成功；调用入口必须展示 completion rejection，并在重新加载后展示 interrupted 事实。

## 24. 并发和内存能力生命周期

- AgentRuntime 单进程内按 Session 串行 start/recover，避免两个调用同时消费同一 open run。
- active registry 同时建立 `sessionId → runId` 和 `runId → state` 索引。
- 不同 Session 可并行；同 Session 严格单 run。
- tool calls 在 run 内严格串行。
- pending approval 同一 run 最多一个，因为工具串行。
- terminal 提交成功或 completion reject 后，必须在 finally 清理 timer、Abort listeners、sink、continuation、workspace handle、prepared、pending、authorization 和 registry。
- 清理不能删除 JSONL 或用户工作区文件。
- 进程崩溃时所有 capability 丢失，后续只走 interrupted 恢复。

## 25. 依赖注入与可测试性

runtime factory 至少注入：

- `JsonlEventStore`
- `ModelClient`
- `AgentContextProvider`

内部默认适配器使用已批准公共入口：

- `createWorkspaceHandle`
- `prepareLocalToolCall`
- `requestLocalToolAuthorization`
- `getPendingToolApprovalView`
- `resolveLocalToolApproval`
- `executeAuthorizedLocalTool`
- `LOCAL_TOOL_DEFINITIONS`

测试可注入：

- monotonic `now()`。
- UUID factory。
- timer scheduler 或 Vitest fake timers。
- workspace factory。
- 对已批准 gateway 公共函数的薄适配器。

内部 dependency 类型不从公共 barrel 导出。测试不得使用真实用户目录、真实 API Key 或真实网络。

## 26. 建议文件边界

Task 阶段可在不改变公共设计的前提下细化，但生产范围建议限制为：

```text
lib/agent/types.ts
lib/agent/schemas.ts
lib/agent/errors.ts
lib/agent/dependencies.ts
lib/agent/projection.ts
lib/agent/redaction.ts
lib/agent/events.ts
lib/agent/approval-wait.ts
lib/agent/runtime.ts
lib/agent/index.ts
```

测试建议：

```text
tests/unit/agent/helpers.ts
tests/unit/agent/schemas.test.ts
tests/unit/agent/projection.test.ts
tests/unit/agent/recovery.test.ts
tests/unit/agent/runtime-completion.test.ts
tests/unit/agent/runtime-tools.test.ts
tests/unit/agent/runtime-approval.test.ts
tests/unit/agent/runtime-cancellation.test.ts
tests/unit/agent/runtime-limits.test.ts
tests/unit/agent/events.test.ts
tests/unit/agent/security.test.ts
tests/unit/agent/public-api.test.ts
```

本 Spec 不批准修改 `lib/domain`、`lib/model`、`lib/workspace`、`lib/tools`、`lib/approval`、`lib/storage` 或 `app`。若 Task 拆分发现必须改变前置公共协议，应停止并修订本 Spec，而不是在实现中绕行。

## 27. 测试规格

### 27.1 Schema 和公共 API

- strict run input、limits 边界、空 prompt、额外 key。
- runtime-only signal/sink 不进入 JSON schema。
- Agent 错误码、recoverable 语义、非枚举 cause。
- barrel 只导出批准的 runtime、Schema、类型和常量。

### 27.2 Projector

- 完整文本成功轨迹。
- 单工具、多工具、自动允许、拒绝和审批轨迹。
- repeated run、错误 runId、重复 terminal、terminal 后事件。
- user message 缺失/重复/位置错误。
- iteration 缺口、重复 request/completed、下一轮过早。
- 重复 toolCallId、result 先于 request、重复 started/result。
- approval ID 错配、未批准 started、拒绝后 started。
- completed 前无 final、多个 final、仍有 pending。
- failed/cancelled/interrupted 从各合法中间态结束。
- compaction 非稳定边界和非法 retained range。

### 27.3 恢复

- 无 open run 时幂等且零写入。
- 一个 open run 追加一次 interrupted 并再次投影。
- 重复 recover 不产生第二个 interrupted。
- 多 open/交叠 run 失败关闭。
- 不重建 pending、authorization 或 continuation。
- interrupted 提交不确定时不重试。

### 27.4 完成和工具循环

- fake context + fake model 的 stop/final/completed。
- tool_calls → result → 下一轮 → final。
- 一次 completion 多工具时先全部 requested，再严格串行 started/result。
- intermediate content 的事件位置。
- invalid normalized tool call 的占位 requested/result 和模型反馈。
- unknown 工具、非法参数、policy denied 的直接 result。
- toolCallId 复用导致 run.failed 且无执行。
- continuation 仅在同 run 下一轮传递，事件中不可见。

### 27.5 审批

- required 后运行状态和 pending view。
- 正确批准后 resolved → started → result。
- 正确拒绝后 resolved → result，无 started。
- 错 approvalId、重复决定、无 pending 不写事件。
- approval resolved 提交失败后不执行。
- 等待期间取消和超时。

### 27.6 取消、限制和错误

- start 前 signal 已 abort，不创建 run。
- model、tool、approval wait 各位置取消。
- sink 失败禁用 sink、取消运行且 terminal 仍落盘。
- 总时限与模型自身 timeout 分类不同。
- 第 30 次可以成功，第 31 次不发请求。
- 第三次相同工具失败先落 result 再 failed。
- 成功或不同 signature 重置 streak。
- ModelLayerError 无 Agent 二次重试。
- context 错误、assistant 太大、unexpected error 的有限终态。
- terminal 提交失败时 completion reject。

### 27.7 安全和流式事件

- prompt 中 Bearer、`sk-*` 和 `*_API_KEY=` 在模型请求和 durable 事件中均被替换。
- 三类秘密在每个可能 chunk 边界切分时都不进入 live event。
- live streamSeq 连续、非空、从 1 开始且不在 JSONL。
- private reasoning、环境 key、prepared/pending/authorization、stack 和 raw cause 不出现在事件或公共 snapshot。
- 所有工作区使用登记式 temp fixture；不触碰真实用户项目。

## 28. 可测试验收标准

阶段 09 Summary 提交审批前必须满足：

- [ ] `lib/agent` 完全自研，无 Agent framework、Next.js、React 或浏览器依赖。
- [ ] strict Schema、错误表、projector、runtime 和最小公共 barrel 完成。
- [ ] 合法历史可稳定投影，非法业务历史失败关闭。
- [ ] open run 在新任务前只追加一次 interrupted。
- [ ] fake model 能完成文本和工具闭环。
- [ ] 多工具先全部 requested 后严格串行执行。
- [ ] 审批允许、拒绝、错误决定、取消和超时全部符合事件顺序。
- [ ] 30 次/10 分钟/三连错误限制有精确边界测试。
- [ ] continuation 和审批 capability 只存在当前 active run 内存。
- [ ] durable 提交不确定时不重试、不执行、不伪造 terminal。
- [ ] prompt、delta、message、approval reason 和错误完成脱敏验证。
- [ ] Agent 精确测试、全量 `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build` 和 `git diff --check` 全部通过。
- [ ] 未创建终端、Route Handler、UI、真实上下文算法或真实用户数据。
- [ ] 生成详细阶段 09 Summary 并停在用户审批门禁。

## 29. 安全约束

1. Agent 只能使用 workspace handle 调工具，不能直接拼接路径或调用 fs/spawn。
2. Agent 不直接调用工具 raw executor，所有成功 prepared invocation 都必须经过 approval gateway。
3. `tool.started` durable 提交成功前不得产生副作用。
4. approved event 不能恢复 authorization，重启后不能继续原工具。
5. 原始 prompt 的已知秘密先脱敏，再进入模型和日志。
6. 模型私有 reasoning 永不发布、持久化或写入错误。
7. 事件只包含 publicArguments 和 ToolResult，不包含 invocation/capability。
8. sink、模型、工具和存储异常的公共信息必须有限且脱敏。
9. 测试仅操作显式创建并登记的临时目录。
10. 本地工具执行仍是可信单用户的应用级边界，不是恶意代码强沙箱。

## 30. 风险、假设与应对

### 30.1 `model.completed` 缺少工具数量

日志无法在崩溃后证明 tool requested 是否完整。应对：运行中先收集并顺序提交全部 requested；任何重启 open run 一律 interrupted，不尝试继续该 completion。本阶段不修改已批准事件协议。

### 30.2 事件消费者断开

继续执行会产生用户看不到的副作用。应对：sink 第一次失败即禁用并取消；阶段 13 还必须链接 HTTP request AbortSignal。

### 30.3 提交不确定与副作用重放

如果 started/result 是否落盘不确定，自动重试可能重复执行。应对：立即停止、清理能力、重新加载后 interrupted，永不自动 replay 工具。

### 30.4 跨 chunk 秘密

逐 chunk 正则会泄露被切开的 token。应对：实现有界增量状态机并穷举 chunk 边界测试。

### 30.5 上下文阶段依赖

没有真实 provider 就不能人工聊天。应对：阶段 09 用明确端口和 fake 验证编排；阶段 10 只补生产 provider；阶段 11 再提供手动测试入口。

### 30.6 单进程限制

active registry 和 storage mutex 不能协调两个 Node 进程。应对：首版明确只支持一个本地服务进程；多进程锁不在范围内。

### 30.7 长日志投影成本

恢复需要遍历完整事件。应对：分页增量 reduce，只保留状态摘要，不整份缓存；索引/checkpoint 需未来单独规格化。

## 31. 对后续阶段的固定影响

### 阶段 10：上下文管理

- 实现本 Spec 的 `AgentContextProvider`，不直接写 store。
- 按完整工具回合压缩，并返回唯一 compaction draft。
- 不改变 runtime 工具/审批/终止顺序。

### 阶段 11：可交互终端

- 只消费 `AgentRuntime`、`AgentRunHandle`、event sink 和 approval API。
- 不复制 Agent 循环或直接执行工具。
- 可在终端观察事件、输入审批、取消并等待 completion。

### 阶段 12：终端验收

- 在阶段 09/10/11 均获批准后进行真实模型和示例项目测试。
- 发现公共状态机设计问题必须回到对应 Spec，不在终端层打补丁。

### 阶段 13/14：API 和 UI

- Route Handler 将 request signal 接入 controls.signal，并把事件转换为 NDJSON。
- UI 只从事件和快照重建展示，不维护第二套运行真相。

## 32. 本次审批需确认的设计决策

用户批准本 Spec 即确认：

1. 阶段 09 只实现 Agent runtime 和 fake context 测试，真实上下文留到阶段 10。
2. 本阶段完成后仍不能直接人工聊天；基础人工对话测试在阶段 11 进行。
3. 同一 Session 同时只允许一个 run，不同 Session 可并行。
4. open run 重启后一律 interrupted，不恢复 continuation、pending 或 authorization。
5. 多工具调用先全部持久化 requested，再严格串行执行。
6. sink 失败会取消运行，防止不可观察的后台副作用。
7. 原始 prompt 的已知秘密在进入模型前就脱敏。
8. `EVENT_COMMIT_UNCERTAIN` 后 completion reject，不补 run.failed、不重试工具。
9. 第三次连续相同工具错误先持久化 result，再 failed。
10. `AgentContextProvider` 只能返回消息和 compaction draft，所有事件仍由 runtime 追加。
11. 不修改阶段 03–08 已批准公共协议；如实现需要修改，先修订 Spec 并重新审批。

## 33. Spec 内部门禁

- [x] 已完成只读观察。
- [x] 已对照阶段 00、01 和 03–08 已批准文档。
- [x] 已检查当前公共接口、依赖、测试布局和 Git 状态。
- [x] 已记录现状、差距、范围内外和后续阶段边界。
- [x] 已定义 runtime、context port、projector、恢复、循环、审批和终止语义。
- [x] 已定义错误、提交不确定、流式脱敏和 capability 安全边界。
- [x] 已给出可测试验收标准、风险和待确认决策。
- [x] 未创建 Task、Agent 代码、测试、终端、API 或 UI。

**Spec 内部门禁：通过。当前状态：已批准。**

## 34. 用户审批记录

- 当前审批结果：用户已于 2026-08-27 批准阶段 09 Spec。
- 本次批准解锁：仅生成 `09-agent-state-machine-tasks.md`。
- 当前仍禁止：在 Task 再次获批前编写 Agent 代码或测试。
- 若用户要求修订：只修改本 Spec 和开发索引，修订后重新等待审批。
