# 阶段 11 Spec：可交互终端入口

## 1. 文档状态与审批链

- 当前状态：已批准
- 观察与生成日期：2026-08-28
- 前置流程：[00-process.md](./00-process.md)
- 前置需求：[01-requirements.md](./01-requirements.md)
- 已批准 Agent：[09-agent-state-machine-summary.md](./09-agent-state-machine-summary.md)
- 已批准 Context：[10-context-management-summary.md](./10-context-management-summary.md)
- 阶段 10 Summary 审批：用户于 2026-08-28 批准
- Spec 审批：用户于 2026-08-28 批准
- 当前允许：根据本 Spec 生成阶段 11 Task 文档
- 当前禁止：Task 获批前安装依赖、修改 `package.json`、编写终端代码、调用真实模型或进入阶段 12

审批链：

```text
阶段 10 Summary（已批准）
  → 阶段 11 只读观察（已完成）
  → 本 Spec（已批准）
  → 阶段 11 Task（待生成）
  → 阶段 11 开发（未开始）
```

只有用户明确批准本 Spec 后，才允许根据本文生成 Task；Task 再次批准前仍不允许实现。

## 2. 阶段目标

为已经完成的模型、工作区、工具、审批、JSONL、AgentRuntime 和 Context Provider 提供一个本地中文交互终端，使用户可以先于 Web API/UI：

- 选择或恢复一个绑定工作区与模型的 Session。
- 输入自然语言编程任务。
- 实时看到模型、工具、审批、压缩、错误和终态事件。
- 在危险工具暂停时允许或拒绝单次操作。
- 在运行中通过命令或 Ctrl+C 取消任务。
- 在同一 Session 中继续提交后续任务。
- 退出后重新启动并恢复历史状态。

本阶段只建设和自动验证入口，不执行真实 DeepSeek/LongCat 验收任务。阶段 11 Summary 获批后，基础人工对话入口可用；真实模型双提供方冒烟、真实项目修复和核心终端验收属于阶段 12。

## 3. 需求追踪

| 需求 | 本阶段覆盖 | 验证证据 |
| --- | --- | --- |
| FR-001 | 终端用绝对路径创建固定工作区 Session | 参数、工作区和创建 Session 测试 |
| FR-002 | 空闲时输入自然语言并启动运行 | 交互应用测试 |
| FR-004 | 通过生产 Runtime/Context 完成模型—工具—反馈循环 | fake model 终端集成轨迹 |
| FR-005 | 终端显示模型消息、公开工具参数、结果、错误与状态 | 事件渲染穷举测试；Web 展示仍留阶段 14 |
| FR-006 | `approval.required` 后可允许或拒绝 | 审批命令与单次决定测试 |
| FR-007 | `/cancel`、Ctrl+C 和退出时取消 active run | 取消与单终态测试 |
| FR-008 | 启动时列出/恢复 JSONL Session 和 interrupted run | Session 恢复测试 |
| FR-009 | 新 Session 从已配置 DeepSeek/LongCat/generic profile 中选择 | 配置选择测试；真实端点留阶段 12 |
| FR-010 | 终端显示 `context.compacted` 事实 | renderer 与集成轨迹测试 |
| NFR-002 | 参数、命令、Session/模型选择严格校验 | Zod/解析测试、typecheck |
| NFR-003 | 配置、命令、运行和 I/O 错误结构化显示 | 错误映射和退出码测试 |
| NFR-004 | 不覆盖 Runtime 的 30 轮/10 分钟限制 | 源码扫描和生产 Runtime 接线 |
| NFR-006 | 终端保持 Node-only，不依赖 Next/React/browser | Node 测试和依赖扫描 |
| NFR-008 | Observation/Spec/Task/Summary 审批证据 | 本文和开发索引 |
| SEC-001–005/007 | 不绕过工作区、工具与审批层 | 只消费公共 Runtime；禁止直接工具执行扫描 |
| SEC-006 | Key 只进 ModelClient，终端不输出 env/Key | 环境白名单、错误/输出安全测试 |
| SEC-008 | 启动说明可信本地用户边界 | 欢迎信息、帮助和文档测试 |
| COM-001–003 | 不引入 Agent 框架，不复制 Agent 循环 | 依赖、import 和能力扫描 |

## 4. 只读观察范围与方法

### 4.1 阅读的批准文档

- 阶段 00 的三级审批与终端优先顺序。
- 阶段 01 的 FR/NFR/SEC/COM 和可信本地单用户范围。
- 阶段 04 的模型配置、DeepSeek/LongCat/generic profile 和原生 fetch client。
- 阶段 05–07 的工作区、六工具、风险和一次性审批能力。
- 阶段 08 的 JSONL Session、分页读取、恢复和数据目录。
- 阶段 09 的 Runtime、event sink、审批、取消、终态和恢复。
- 阶段 10 的事件上下文、compaction 显示和公共装配要求。

### 4.2 检查的实现与环境

- `@/lib/agent`、`@/lib/context`、`@/lib/model`、`@/lib/storage`、`@/lib/workspace`、`@/lib/approval` 公共 barrel。
- `AgentRuntime`、`AgentRunHandle`、`AgentEvent`、Session 和模型配置的实际类型。
- `package.json`、`tsconfig.json`、`.gitignore`、当前依赖和脚本。
- 当前 Node.js、pnpm、`tsx` 可用性和 Git 工作树。
- Node.js 官方 TypeScript 运行限制。

### 4.3 观察基线

```text
pnpm test
  Test Files  61 passed (61)
  Tests       533 passed (533)

pnpm lint
  通过，0 warning

pnpm typecheck
  通过

Node.js
  当前机器 v24.15.0
  仓库最低要求 >=20.9.0

pnpm
  10.33.3

tsx
  当前未安装
```

观察未运行模型、工具或真实工作区任务，未安装依赖，未修改业务代码或配置。工作树中的阶段 07–10 内容均已识别并保留。

## 5. 当前事实

### 5.1 核心闭环已经完成

现有生产代码已经提供终端所需全部业务能力：

```text
createJsonlEventStore()
  initialize / createSession / listSessions / readEvents

createModelClient({ env })
  getConfigSnapshot / complete

createAgentContextProvider({ eventSource, modelClient })
  buildContext

createAgentRuntime({ eventStore, modelClient, contextProvider })
  recoverSession / startRun / cancelRun
  resolveApproval / getActiveRun
```

终端无需、也不得访问 `lib/agent` 内部 dependency overrides、projector、prepared invocation、authorization、raw executor 或 Context 内部 history/summary 算法。

### 5.2 AgentRuntime 已提供交互控制面

`startRun()` 返回 `AgentRunHandle`，包含 run/session ID、`completion` 和 `cancel()`。`controls.onEvent` 可接收 durable 事件与 live `assistant.delta`。`getActiveRun()` 提供状态、iteration 和有限 pending approval view；`resolveApproval()` 接受 runId、approvalId 和 `{ approved, reason? }`。

Runtime 保证事件先落盘后通知 sink。若 sink 抛错，Runtime 会禁用 sink并取消运行，防止用户无法观察的后台副作用。因此终端 writer 的错误处理是安全边界的一部分，不能随意吞掉输出失败后继续执行。

### 5.3 事件协议足以驱动终端

终端可只按 `AgentEvent` 判别联合展示：

- `assistant.delta`：实时模型文本片段，不持久化。
- `model.requested/completed`：iteration、finish reason 和公开 usage。
- `assistant.message`：intermediate/final 完整消息。
- `tool.requested/started/result`：公开参数、执行开始和有界结构化结果。
- `approval.required/resolved`：待审批信息和决定事实。
- `context.compacted`：摘要范围与 durable memory 事实。
- `run.completed/failed/cancelled/interrupted`：单一终态。

Key、private reasoning、continuation、prepared invocation 和 authorization 均不在事件中。

### 5.4 Session 与模型配置已可复用

JSONL store 默认写入被忽略的 `.secode-data`，也支持显式 data directory。Session 元数据固定保存 canonical workspacePath 和 modelProfileId，工作区/模型切换应创建新 Session，不能改写原 Session。

模型 registry 从显式 environment 对象读取：

- `DEEPSEEK_*`
- `LONGCAT_*`
- `OPENAI_COMPAT_*`

Snapshot 只暴露脱敏 profile 和配置问题，不暴露 API Key。新 Session 只能选择 `configured: true` 的 profile；恢复 Session 时继续使用原 profile。

### 5.5 当前没有可执行 TypeScript 终端脚本

`package.json` 没有 Agent/terminal script，依赖中也没有 `tsx` 或同类 TypeScript 执行器。项目最低支持 Node 20.9，当前源码广泛使用 `@/*` tsconfig path alias。

不能把当前机器的 Node 24 原生 TypeScript 当作项目方案。Node 官方文档明确说明原生 type stripping 不读取 `tsconfig.json`，不支持 `paths`，而仓库最低 Node 20.9 也不能假设具备相同原生 TypeScript行为。Node 官方为完整 tsconfig 支持给出的方案之一是安装 `tsx` 开发依赖并用它执行 `.ts` 文件：[Node.js TypeScript 官方文档](https://nodejs.org/dist/latest/docs/api/typescript.html)。

### 5.6 当前入口缺口

- 没有 CLI 参数或交互命令 Schema。
- 没有 stdin/stdout 抽象、序列化 writer 或 TTY 生命周期。
- 没有 Session 新建/恢复选择流程。
- 没有事件到中文终端输出的映射。
- 没有 active run、pending approval 和命令协调器。
- 没有 Ctrl+C、EOF、输出断开和退出码策略。
- 没有 `pnpm agent` 脚本或终端自动化测试。

## 6. 范围

### 6.1 范围内

- Node.js 中文交互终端，不依赖 Next/React/browser。
- `pnpm agent` 本地启动命令。
- 新 Session 创建和既有 Session 恢复。
- 已配置模型列表与固定 profile 选择。
- 自然语言任务输入和同 Session 多轮任务。
- durable/live Agent 事件的实时可观察输出。
- 单 pending approval 的允许、拒绝和可选理由。
- `/cancel`、Ctrl+C、EOF 和 `/exit` 生命周期。
- 终端参数、命令、输出 renderer、应用协调和 bootstrap 自动测试。
- 基础人工操作说明；真实模型正式验收仍在阶段 12。

### 6.2 范围外

- 修改 AgentRuntime、Context、事件、JSONL、工具或审批公共协议。
- 自行调用模型、执行工具、判断风险或写 Agent durable 事件。
- 真实 DeepSeek/LongCat 网络请求和真实项目修复验收。
- Next.js Route Handler、Server Action、NDJSON、浏览器或 React UI。
- Markdown/ANSI 富文本、全屏 TUI、鼠标、终端窗口管理或第三方 TUI 框架。
- 自动读取/解析 `.env*`、Keychain 或系统凭据存储。
- shell history 管理、自动 commit/push、发布或部署。
- 多进程协调、多 Agent、多 Session 并行运行和后台 daemon。
- 脚本化非 TTY 批处理协议；阶段 11 是人工交互入口。

## 7. 建议架构

```text
cli/secode.ts
  │
  ▼
Terminal bootstrap
  ├── allowlisted environment
  ├── JsonlEventStore.initialize()
  ├── ModelClient + profile snapshot
  ├── Session create / recover
  └── Context Provider + AgentRuntime
          │
          ▼
Terminal application coordinator
  ├── one readline input loop
  ├── command parser
  ├── active run / pending view coordination
  ├── Ctrl+C / EOF / exit cleanup
  └── serialized writer
          ▲
          │ AgentEvent
       event renderer
```

建议内部职责：

```text
cli/secode.ts                 极薄进程入口，只调用 main 并设置 exitCode
lib/terminal/types.ts         I/O、参数、命令、应用依赖和有限状态类型
lib/terminal/schemas.ts       strict 参数/命令边界
lib/terminal/errors.ts        TERMINAL_* 错误与安全格式
lib/terminal/arguments.ts     argv 解析、帮助文本和互斥规则
lib/terminal/environment.ts   模型 env 白名单和 SECODE_DATA_DIR
lib/terminal/event-renderer.ts AgentEvent → 中文输出 frame
lib/terminal/session.ts       新建/恢复选择和 preflight
lib/terminal/application.ts   单输入循环、运行、审批、取消和退出
lib/terminal/bootstrap.ts     生产依赖装配与资源清理
lib/terminal/index.ts         仅入口所需最小内部 barrel
```

精确文件白名单、是否合并小文件和测试文件名由获批后的 Task 固定；不得借内部拆分新增公共协议。

## 8. TypeScript 运行方式与依赖决策

### 8.1 建议新增 `tsx` 开发依赖

建议在阶段 11 实现时：

```text
devDependencies: tsx
scripts.agent: tsx cli/secode.ts
```

理由：

1. 支持仓库最低 Node 20.9，不依赖 Node 22/24 的版本差异。
2. 读取现有 `tsconfig.json` 和 `@/*` path alias。
3. 不需要生成第二份 build 输出或修改核心 import。
4. 只负责执行 TypeScript；不是 Agent/模型/工具/流程框架。
5. 终端仍通过 `pnpm typecheck` 做静态检查，不能把运行时转译当类型检查。

不建议：

- 直接 `node cli/secode.ts`：最低 Node 不保证支持，且原生 TS 不解析 tsconfig paths。
- 编写自定义 ESM loader：增加难以测试的模块解析与安全表面。
- 使用 Next.js 私有编译器路径：内部 API 不稳定，且把终端与 Web 框架耦合。
- `pnpm dlx tsx`：每次运行可能访问网络，版本和可复现性差。

`tsx` 是本 Spec 唯一建议新增依赖。Task 获批前不安装；实现时必须由 pnpm 更新 package 与 lockfile，并执行秘密/依赖审计。

### 8.2 不自动加载 `.env*`

终端生产 bootstrap 只读取当前进程 environment 中的批准变量，不自行解析 `.env.local`，避免新增 dotenv 依赖、重复 Next 环境规则或意外加载不可信文件。

阶段 12 人工测试时，用户在当前 shell 中导出所需变量后启动；终端帮助只显示变量名和配置状态，绝不回显值。Web 阶段继续使用 Next.js 自身的服务端环境加载。

## 9. 启动参数设计

### 9.1 统一命令

```text
pnpm agent -- [options]
```

建议支持：

| 参数 | 语义 |
| --- | --- |
| `--help` | 打印帮助并以 0 退出；不初始化 store/model/runtime |
| `--workspace <absolute-path>` | 创建新 Session 的工作区 |
| `--model <profile-id>` | 新 Session 固定模型；与 workspace 一起使用 |
| `--title <text>` | 新 Session 可选标题；省略时由工作区 basename 生成 |
| `--session <uuid>` | 恢复既有 Session；与 workspace/model/title 互斥 |
| `--data-dir <absolute-path>` | 可选覆盖 JSONL 数据目录，便于隔离人工/测试数据 |

规则：

- `--session` 与新建参数互斥。
- 指定 `--workspace` 时必须指定 `--model`。
- 所有 flag 禁止重复；未知 flag、缺值、空值和额外位置参数失败。
- workspace/data-dir 要求绝对路径，不展开 `~`，不执行 shell substitution。
- model ID 必须存在且 configured；不接受 base URL、model 或 Key 作为命令行值，避免 shell history 泄密。
- title trim 后 1–256 字符；错误消息不回显完整危险输入。
- 数据目录优先级固定为 `--data-dir` > `SECODE_DATA_DIR` > store 默认 `.secode-data`。

### 9.2 无 Session 参数的 TTY setup

若既没有 `--session` 也没有 `--workspace`，在真实 TTY 中进入引导：

1. 初始化 store 并列出最近 Session 的 ID、标题、模型、工作区 basename 和创建时间。
2. 用户输入 Session 序号恢复，或选择新建。
3. 新建时依次询问绝对工作区、显示 configured profiles 并选择模型、询问可选标题。
4. 每个输入走与 argv 相同的 Schema 和 workspace/profile 校验。

引导不显示 API Key、完整模型 endpoint query、任意环境变量或事件内容。没有 configured profile 时列出有限配置问题和需要的变量名，然后以配置错误退出。

### 9.3 TTY 要求

除 `--help` 外，stdin 和 stdout 必须是交互 TTY。非 TTY 启动返回 `TERMINAL_TTY_REQUIRED`，不创建 Session 或运行。原因：审批和取消需要持续交互，阶段 11 不定义不完整的管道批处理协议。

自动测试通过注入 fake I/O 测试应用，通过子进程只验证 `--help` 和参数失败，不依赖 CI 伪 TTY。

## 10. Session 新建与恢复

### 10.1 初始化顺序

```text
解析 argv / TTY 预检
  → 提取允许的环境变量
  → createJsonlEventStore + initialize
  → createModelClient + registry snapshot
  → 新建或读取 Session
  → workspace/profile preflight
  → createAgentContextProvider
  → createAgentRuntime
  → recoverSession
  → 进入交互循环
```

`--help` 必须在任何存储或模型初始化前返回。

### 10.2 新建 Session

1. `createWorkspaceHandle()` 验证、realpath 和规范化工作区。
2. 从 model snapshot 选择 configured profile。
3. 使用 canonical `handle.rootPath` 和 profile ID 调用 store `createSession()`。
4. Session 创建成功后才显示 ID；提交不确定时不猜测成功，要求重新启动并列出 Session。
5. 同一终端进程只绑定当前 Session，不允许用命令改写 workspace/model。

### 10.3 恢复 Session

1. `getSessionMetadata()` 读取固定 workspace/model。
2. 重新创建 workspace handle并确认模型仍 configured。
3. 调用 `runtime.recoverSession()`，让生产 Runtime 处理 open run 的单次 `run.interrupted`。
4. 展示恢复后的 lastSeq、last run 状态和 Session 信息。
5. 恢复失败不手工追加或修复事件；只显示有限错误并退出。

## 11. 交互命令设计

### 11.1 命令集合

| 输入 | 可用状态 | 行为 |
| --- | --- | --- |
| 普通非空文本 | idle | 作为新任务调用 `startRun()` |
| `/help` | 任意 | 显示命令和当前输入规则 |
| `/status` | 任意 | 显示当前 Session、run 状态、iteration 和 pending 摘要 |
| `/approve [reason]` | awaiting approval | 批准当前唯一 pending 操作 |
| `/reject [reason]` | awaiting approval | 拒绝当前唯一 pending 操作 |
| `/cancel [reason]` | active run | 请求取消；不伪造立即完成 |
| `/exit` | 任意 | active 时先取消并等待 settle，再关闭 |

规则：

- 命令使用 ASCII `/` 前缀、命令名大小写敏感。
- reason 是命令名后的整段文本，trim 后可省略，最大 4096 字符并复用审批 Schema。
- active run 期间普通文本不排队，明确提示先等待或取消。
- 没有 pending 时 approve/reject 零写入、零副作用。
- 重复 cancel 显示“已请求或没有活动运行”，不制造第二终态。
- 未知命令只返回命令错误，交互循环继续。
- 空行只重绘 prompt，不启动 run。

### 11.2 输入与运行并发

应用只有一个 `for await` 输入循环，不同时调用多个 `readline.question()`。任务提交后不阻塞读取命令；`handle.completion` 在受控后台 promise 中更新 UI 状态，因此用户可以在模型、工具或审批等待期间输入 `/status`、`/cancel` 或审批命令。

同一 Session 同时最多一个 active run，终端不维护任务队列。Runtime active registry 是业务真相；终端仅保存当前 handle、显示状态和 delta 排版状态。

### 11.3 Approval 处理

收到 `approval.required` 后显示：

- tool summary。
- 有限 reason。
- approvalId/toolCallId 的短标识。
- `/approve [reason]`、`/reject [reason]`、`/cancel` 提示。

执行命令前从 `runtime.getActiveRun(runId).pendingApproval` 重新读取当前 pending，不能仅相信旧事件缓存。决定必须调用 `runtime.resolveApproval()`；终端不接触 pending/authorization opaque capability。invalid 或重复决定只显示错误，不重试执行工具。

## 12. 事件渲染与输出

### 12.1 输出原则

- 中文优先、普通行式文本，不引入 ANSI/TUI 依赖。
- stdout：欢迎信息、事件、Agent 文本、状态和正常帮助。
- stderr：参数、配置、存储、运行和 I/O 错误。
- 不使用 `console.log(object)` 或 `util.inspect` 直接转储内部对象。
- 只读取判别联合批准字段，unknown/default 分支在编译期穷举失败。
- 所有 writer 操作串行化，避免 live delta、工具事件和命令反馈交错破坏行。
- 所有不可信动态文本在写入前经过终端安全转义：保留正常 Unicode、换行和 tab，规范化 CRLF；将 ESC、C0/C1 控制字符、backspace 和裸 carriage return 转为可见转义，禁止 ANSI/OSC 注入、伪造 prompt 或改写既有输出。

### 12.2 事件映射

| 事件 | 终端展示 |
| --- | --- |
| `session.created` | Session 已创建、短 ID、模型和工作区 basename |
| `run.started` | run 短 ID、限制和开始标记 |
| `user.message` | 不重复全文，只确认任务已记录 |
| `model.requested` | iteration、profile、请求中状态 |
| `assistant.delta` | 原样追加已脱敏文本，保持实时流 |
| `model.completed` | finish reason 和公开 usage；无 reasoning 字段 |
| `assistant.message` | 无 delta 时输出完整内容；已有 delta 时只收尾，避免重复 |
| `tool.requested` | 工具名、canonical public arguments、截断标记 |
| `approval.required` | 高亮式纯文本审批块和命令提示 |
| `approval.resolved` | 已允许/拒绝及有限理由 |
| `tool.started` | 工具名和开始状态 |
| `tool.result` | ok、summary、公开 output、metadata 或结构化 error |
| `context.compacted` | throughSeq、retained range 和压缩完成；默认不重复打印整份 summary |
| `run.completed` | iteration、duration 和成功终态 |
| `run.failed` | code、message、recoverable 和有限 details |
| `run.cancelled/interrupted` | 原因、iteration/lastStableSeq 和终态 |

ToolResult output 已受工具层 64 KiB 上限约束，终端可以完整显示；metadata 通过稳定 JSON renderer 输出。任何 stack、cause、raw arguments、environment、Authorization、private reasoning 和 continuation 均禁止渲染。

### 12.3 Delta 去重

每个 run 记录是否已经输出 live delta：

- 第一个 delta 前输出 `Agent>` 前缀。
- 后续 delta 只追加 content。
- assistant durable message 到达时，若已流式显示同一消息，只补换行和 kind 标记，不重复全文。
- 若模型没有产生 delta，则从 durable assistant.message 输出完整文本。
- run failure/cancel 或输出切换到工具事件前先安全结束未闭合 delta 行。

该状态只服务排版，不用于恢复业务历史。

## 13. Ctrl+C、EOF 与退出

### 13.1 Ctrl+C

- active run：第一次 Ctrl+C 调用当前 handle `cancel("用户通过 Ctrl+C 取消运行")`，保留终端并等待 durable terminal；重复 Ctrl+C 不重复取消。
- idle：Ctrl+C 关闭 readline，以退出码 130 结束。
- setup 阶段：Ctrl+C 不创建 Session，清理资源并以 130 结束。
- approval 等待属于 active run，Ctrl+C 取消整个 run，不自动拒绝审批或生成 tool result。

### 13.2 EOF 与 `/exit`

- idle EOF：正常退出 0。
- active EOF 或 `/exit`：请求取消，等待 completion settle，再关闭。
- ordinary completed/failed/cancelled outcome 后终端返回 idle，可继续下一任务。
- completion 因 durable commit uncertain 而 reject 时，当前 Session 不再接受新任务；打印安全恢复提示并以 1 退出，要求新进程重读 JSONL。

### 13.3 资源清理

finally 必须移除 SIGINT/listener、关闭 readline、等待 writer 队列、清除 active handle/pending/delta UI 状态。终端不删除 Session、JSONL、工作区文件或用户任务产生的合法修改。

## 14. I/O 与并发模型

### 14.1 依赖注入端口

终端应用核心不得直接散布 `process.stdin/stdout/stderr`。建议定义最小端口：

```ts
interface TerminalIO {
  readonly interactive: boolean;
  lines(): AsyncIterable<string>;
  write(frame: TerminalFrame): Promise<void>;
  onInterrupt(listener: () => void): () => void;
  close(): Promise<void>;
}
```

生产适配器使用 Node `readline` 和 process streams；测试适配器用确定性队列。具体签名由 Task 固定，但必须支持无真实 TTY 的单元/集成测试。

### 14.2 Serialized writer

所有输出进入单 promise chain，保持调用顺序。单次 write 失败后：

1. 标记 writer failed，不再接受普通输出。
2. 让 event sink reject，使 Runtime 触发既有 `event_consumer_disconnected` 取消。
3. 尽力向 stderr 输出一次有限错误；不得递归写同一失败流。
4. completion settle 后以 1 退出。

不得用未 await 的大量写操作淹没 stdout，也不得让渲染异常中断后 Agent 继续执行。

### 14.3 Background completion

每个 run 只有一个受控 completion observer。它必须捕获 resolve/reject、更新当前 handle、输出终态/恢复提示并重新显示 idle prompt，不产生 unhandled rejection。退出时等待该 observer settle。

## 15. 环境与凭据

### 15.1 Environment 白名单

bootstrap 只复制以下变量给 ModelClient：

```text
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL
DEEPSEEK_MODEL
DEEPSEEK_CONTEXT_WINDOW

LONGCAT_API_KEY
LONGCAT_BASE_URL
LONGCAT_MODEL
LONGCAT_CONTEXT_WINDOW
LONGCAT_SUPPORTS_THINKING

OPENAI_COMPAT_API_KEY
OPENAI_COMPAT_BASE_URL
OPENAI_COMPAT_MODEL
OPENAI_COMPAT_CONTEXT_WINDOW
OPENAI_COMPAT_SUPPORTS_THINKING
```

`SECODE_DATA_DIR` 只用于存储 bootstrap，不传给模型。终端不枚举或输出整个 `process.env`。

### 15.2 Key 安全

- API Key 不能作为 argv、交互命令或 Session 元数据输入。
- 帮助只列变量名，不给出真实值示例。
- profile 输出只显示 id、label、provider、model、contextWindow 和 configured。
- 模型/终端错误只显示既有结构化 ErrorInfo，不显示 cause、headers 或 response body 原文。
- 测试使用明显假 secret 哨兵并断言 stdout/stderr/events 均无原值。

## 16. Terminal 错误模型

建议固定有限错误码：

| 错误码 | recoverable | 语义 |
| --- | --- | --- |
| `TERMINAL_ARGUMENT_INVALID` | false | argv/flag 组合无效 |
| `TERMINAL_TTY_REQUIRED` | false | 非交互输入/输出 |
| `TERMINAL_COMMAND_INVALID` | true | 未知命令或命令参数无效 |
| `TERMINAL_MODEL_UNAVAILABLE` | true | 没有可用 profile 或固定 profile 失效 |
| `TERMINAL_SESSION_UNAVAILABLE` | true | Session 不存在、损坏或恢复失败 |
| `TERMINAL_WORKSPACE_UNAVAILABLE` | true | 工作区无效或已变化 |
| `TERMINAL_NO_ACTIVE_RUN` | true | cancel 时没有 active run |
| `TERMINAL_NO_PENDING_APPROVAL` | true | approve/reject 时没有 pending |
| `TERMINAL_IO_ERROR` | false | stdin/stdout/readline 失败 |
| `TERMINAL_INTERNAL_ERROR` | false | 未分类终端协调错误 |

Terminal error 使用既有 `ErrorInfoSchema` 形状，cause 不可枚举。底层 Model/Storage/Workspace/Agent 错误保留其公开 code/message/recoverable/details，不包装或展开内部 cause。

建议进程退出码：

| exit code | 语义 |
| --- | --- |
| 0 | `--help`、idle EOF 或 `/exit` 正常完成 |
| 1 | bootstrap、I/O、durable 不确定或内部失败 |
| 2 | 参数、TTY 或模型配置不满足启动要求 |
| 130 | idle/setup 阶段 Ctrl+C |

单次 Agent run 的普通 failed/cancelled outcome 不决定进程退出码；终端仍可保持 idle 接受后续任务。

## 17. 状态与真相来源

终端允许保存的短期 UI 协调状态：

- 当前 Session ID/显示元数据。
- 当前 `AgentRunHandle`。
- 当前 run 的 delta 行是否打开。
- 正在关闭/writer failed 标记。

终端不能保存第二份业务状态机。显示 status/pending 时优先读取 `runtime.getActiveRun()`；恢复历史只调用 store/runtime；durable 真相只来自 JSONL。终端不创建自己的 Session 状态文件、审批文件或消息历史。

## 18. 测试设计

### 18.1 参数与命令

- help 零副作用和 exit 0。
- new/resume 参数合法组合。
- 互斥、重复、未知、缺值、相对路径和过长值拒绝。
- Key/base URL 不能作为 CLI 参数。
- 普通任务、6 个命令、reason、空行和未知命令。
- 命令文本不进入 shell 或动态 import。

### 18.2 Environment 与 bootstrap

- 只复制批准变量；额外 secret 不传入 model client。
- 配置 profile 列表、无 configured profile 和固定 profile 失效。
- dataDir flag、`SECODE_DATA_DIR` 和默认目录优先级固定。
- workspace canonical path 后再 createSession。
- `--help` 不初始化 storage/model。
- 创建提交不确定、Session 不存在、workspace 变化和 recover failure。

### 18.3 Event renderer

- 对全部 durable/live event type 做穷举映射。
- delta 有/无时 assistant 完整消息不重复。
- 单/多工具、argumentsTruncated、成功/失败 ToolResult。
- approval required/resolved。
- context.compacted 只显示范围，不泄露整份请求。
- completed/failed/cancelled/interrupted。
- usage 不含 reasoning，错误不含 stack/cause。
- Key/Bearer/path/private reasoning/capability 哨兵不出现。
- ESC/OSC、backspace、裸 carriage return 和其他控制字符被稳定转义，普通中文、emoji、换行和 tab 保持可读。

### 18.4 应用交互

- idle 普通文本启动 run；active 普通文本不排队。
- event sink 与命令反馈顺序稳定。
- approve、reject、invalid 和重复决定。
- `/cancel`、active Ctrl+C、idle Ctrl+C、EOF、`/exit`。
- ordinary run failure 后可继续下一任务。
- completion reject 后安全关闭且无 unhandled rejection。
- writer 失败触发 run 取消，终端不继续不可观察执行。
- listener/readline/writer/completion 全部 settle。

### 18.5 生产核心集成

使用临时 data root、合成 workspace、fake ModelClient、生产 store/context/runtime/terminal，覆盖：

1. 新 Session → 文本任务 → final → 再次任务。
2. read_file 工具 → result → final。
3. 高风险进程 → approval required → reject → result → final。
4. 高风险但无破坏的临时命令 → approve → started/result → final。
5. active run cancel → 单 `run.cancelled`。
6. 重启新 bootstrap → recover same Session → 历史继续。
7. 长历史产生 `context.compacted` 并在终端可见。

所有文件/进程测试只在 helper 创建的临时工作区内；不访问用户真实目录、不调用网络、不读取真实 Key。

### 18.6 子进程与人工测试

自动子进程只验证：

- `pnpm agent -- --help` 可执行并退出 0。
- 非 TTY/非法参数安全失败。
- 输出无 stack、环境值或 unhandled rejection。

阶段 11 实现完成后，Summary 提供基础人工步骤：配置一个本地或真实兼容 profile、选择临时工作区、提交只读任务、观察事件、取消和审批拒绝。真实 DeepSeek/LongCat 的正式结果不计入本阶段验收，留阶段 12 单独审批与记录。

## 19. 可测试验收标准

- [ ] `pnpm agent -- --help` 在支持的 Node 版本可执行，且无 store/model 副作用。
- [ ] 新建 Session 必须先验证绝对工作区和 configured profile。
- [ ] `--session` 可恢复 JSONL Session，并由 Runtime 处理 open run。
- [ ] 空闲时自然语言输入能启动生产 AgentRuntime。
- [ ] active 时仍可输入 status、approval、cancel 和 exit 命令。
- [ ] 所有 AgentEvent 都有中文、有限、确定性的 renderer。
- [ ] assistant delta 实时显示且 durable message 不重复。
- [ ] tool public arguments、result、error 和 context.compacted 可观察。
- [ ] 审批只通过 Runtime public API，允许/拒绝均不接触 capability。
- [ ] `/cancel`、Ctrl+C、EOF 和 `/exit` 最终只有一个 run terminal。
- [ ] 普通 run failure 后可继续；commit uncertain/writer failure 要求重启。
- [ ] Session/workspace/model 在终端进程内固定，不可原地切换。
- [ ] API Key、environment、stack、cause、private reasoning 和 capability 不进入输出。
- [ ] 终端不直接调用模型 complete、工具 prepare/execute、store append 或 Context internal。
- [ ] 非 TTY 不创建 Session 或运行。
- [ ] 自动测试只使用 fake model、临时 store/workspace 和安全进程。
- [ ] `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build`、CLI 子进程和 `git diff --check` 通过。
- [ ] 阶段 11 Summary 详细记录实现、人工方法、失败和限制，并在用户批准前不进入阶段 12。

## 20. 安全约束

1. 终端只经 AgentRuntime 发起业务操作，不直接调用 ModelClient.complete 或工具执行器。
2. 新 Session 工作区必须使用 Workspace 层 canonical handle；不信任 argv 原路径。
3. approval 命令只传 decision 给 Runtime，opaque pending/authorization 不导出、不缓存。
4. active run 期间不允许第二任务或隐式排队。
5. event sink/writer 断开必须触发安全取消，不能静默后台执行。
6. argv 不接受 Key；环境只提取批准字段且绝不打印值。
7. 不使用 shell 拼接、`eval`、动态代码、原始事件 JSON dump 或环境 dump。
8. 终端输出只使用已批准 public event/result/error 字段。
9. 测试进程目标固定在临时工作区，禁止安装、Git 写入、删除和系统命令。
10. 欢迎/帮助持续说明可信本地单用户边界和获批进程仍可能有外部副作用。

## 21. 兼容性与质量约束

- 支持 `package.json` 声明的 Node >=20.9.0 和 pnpm 10。
- 不修改 Next.js 版本、App Router、React 页面或构建配置。
- CLI `.ts` 文件仍被当前 strict tsconfig、ESLint 和 Vitest 覆盖。
- 生产终端代码不导入 Next/React/DOM/browser API。
- 不依赖 ANSI、Unix-only shell 解析或 macOS-only TTY API。
- 路径输入由 Node path/workspace 层处理；终端命令不自行规范化文件工具路径。
- 中英文、emoji、长行和无换行 delta 必须保持 UTF-8 正确。
- 不给已完成公共 barrel 新增仅为终端测试服务的后门。

## 22. 风险与应对

### 22.1 readline 输出与 live delta 交错

异步事件可能在用户输入时输出，破坏 prompt。应对：单输入循环、serialized writer 和明确 prompt 重绘；不引入全屏 TUI。自动测试验证 frame 顺序，人工测试验证可读性。

### 22.2 Event sink 输出失败会取消运行

这是阶段 09 的安全语义。应对：writer 失败只报告一次、让 sink reject、等待 Runtime terminal/拒绝，并关闭当前进程；不吞错继续执行。

### 22.3 Ctrl+C 竞态

Ctrl+C 可能与 completed、approval resolve 或 tool started 同时发生。应对：终端只调用 Runtime cancel/resolve API，最终竞争由 Runtime 处理；终端不预先打印伪终态。

### 22.4 API Key 出现在 shell history

若用户把 Key 写在命令行赋值中，shell 可能保存。应对：CLI 不提供 `--api-key`；帮助建议通过当前 shell 的安全环境管理方式设置，且不回显值。仓库无法控制用户 shell 配置。

### 22.5 非 TTY 自动化需求

未来可能需要脚本式 Agent。当前审批/取消需要双向协议，草率支持 stdin pipe 会造成歧义。应对：阶段 11 明确 fail closed；若未来需要 JSON/NDJSON CLI，单独 Spec，不复用人类文本协议。

### 22.6 进程崩溃

SIGKILL、机器断电无法运行 finally。应对：JSONL 已 fsync；下一次启动调用 `recoverSession()` 将合法 open run 标记 interrupted。终端不承诺后台继续。

### 22.7 `tsx` 增加供应链表面

应对：仅 devDependency、由 lockfile 固定、只执行仓库本地入口；实现阶段检查依赖树、license/安全告警和 lock diff，不使用远程 `dlx`。

### 22.8 真模型行为尚未验证

阶段 11 自动测试使用 fake model，不能证明 DeepSeek/LongCat 实际配置和工具调用质量。应对：只把入口可用性作为本阶段结论；阶段 12 单独执行并记录真实双模型和示例项目验收。

## 23. 建议文件边界

本 Spec 建议阶段 11 只新增或修改：

```text
cli/secode.ts
lib/terminal/**
tests/unit/terminal/**
tests/integration/terminal/**
package.json
pnpm-lock.yaml
docs/development/11-interactive-terminal-spec.md
docs/development/11-interactive-terminal-tasks.md
docs/development/11-interactive-terminal-summary.md
docs/development/README.md
```

建议明确禁止修改：

```text
app/**
lib/domain/**
lib/model/**
lib/workspace/**
lib/tools/**
lib/approval/**
lib/storage/**
lib/agent/**
lib/context/**
tests/unit/domain/**
tests/unit/model/**
tests/unit/workspace/**
tests/unit/tools/**
tests/unit/approval/**
tests/unit/storage/**
tests/unit/agent/**
tests/unit/context/**
next.config.ts
tsconfig.json
vitest.config.ts
eslint.config.mjs
.env*
.gitignore
```

若实现证明必须修改已完成核心协议或禁止文件，停止阶段 11，回到对应 Spec 重新审批，不能在终端层打补丁。

## 24. 实施顺序建议

获批后 Task 应按以下依赖拆分，但本阶段尚不生成 Task：

```text
契约/错误/参数
  → Environment 与 production bootstrap
  → Session 创建/恢复
  → Event renderer 与 serialized writer
  → 命令解析和应用状态协调
  → 审批/取消/Ctrl+C/退出
  → 生产 Runtime/Context 集成
  → 可执行脚本与人工说明
  → 全量验证、反思和 Summary
```

每个子任务必须先对照本 Spec、列出白名单并执行最小测试。安装 `tsx`、修改 package script 和实现代码只能在 Task 获批后进行。

## 25. 对阶段 12 的固定影响

阶段 12 只进行终端测试与核心验收修正：

- 使用阶段 11 的 `pnpm agent`，不复制或绕过终端应用。
- 配置真实 DeepSeek 和 LongCat compatible profile。
- 在受控临时 Git 项目完成“定位 → 修改 → 测试失败 → 修正 → 通过 → 总结”。
- 人工验证事件可读性、审批、取消、恢复和 context compaction。
- 若暴露终端展示/交互缺陷，可在阶段 12 Spec 中修订终端层。
- 若暴露 Agent/Context/Model/Tool 公共语义缺陷，必须回到对应阶段 Spec，不在测试脚本里规避。
- 阶段 12 Summary 获批前仍不得进入 Next.js Route Handler。

## 26. 本次审批需确认的设计决策

用户批准本 Spec 即确认：

1. 阶段 11 是人类交互 TTY，不支持 pipe/JSON 批处理。
2. 新增一个 `tsx` devDependency 和 `pnpm agent` script，以支持 Node >=20.9 与现有 tsconfig paths。
3. CLI Key 只来自当前进程环境，不提供 `--api-key`，也不自动解析 `.env*`。
4. 新建使用 `--workspace + --model`，恢复使用 `--session`；无参数时进入 TTY setup。
5. 同一终端进程固定一个 Session，不在 active 时排队第二任务。
6. 命令集合固定为 help/status/approve/reject/cancel/exit。
7. event renderer 显示公开工具参数、结果、错误和 compaction，但不打印 raw/private/capability。
8. Ctrl+C 在 active 时取消 run，在 idle/setup 时退出 130。
9. writer/sink 失败时安全取消并关闭，不允许不可观察后台执行。
10. ordinary run failure 后终端可继续；durable commit uncertain 要求重启恢复。
11. 阶段 11 自动测试不调用真实模型或真实用户项目，正式终端验收在阶段 12。
12. 不修改阶段 03–10 核心公共协议、Next API 或 UI。

## 27. Spec 内部门禁

- [x] 已完成阶段 11 只读观察。
- [x] 已对照阶段 00、01、04–10 已批准文档。
- [x] 已核对 Agent/Context/Model/Storage/Workspace/Approval 实际公共接口。
- [x] 已记录 61 files / 533 tests、lint、typecheck 基线。
- [x] 已确认 `tsx` 未安装和 Node 原生 TS/paths 限制。
- [x] 已定义参数、TTY、Session、命令、事件、审批、取消、I/O 和退出语义。
- [x] 已定义凭据、安全、错误、测试、风险和后续阶段边界。
- [x] 已给出建议文件范围和禁止修改路径。
- [x] 未生成阶段 11 Task、Summary、实现或测试。
- [x] 未安装依赖、修改 package/config、调用真实模型或访问真实项目。

**Spec 内部门禁：通过。当前状态：已批准。**

## 28. 用户审批记录

- 当前审批结果：用户已于 2026-08-28 批准阶段 11 Spec。
- 本次批准解锁：只允许根据本 Spec 生成阶段 11 Task 文档。
- Task 再次获批后才解锁：安装 `tsx`、修改 package/lockfile、实现终端和测试。
- 当前仍禁止：任何终端实现、真实模型测试、阶段 12、Route Handler 或 UI。
- 若用户要求修订：只修改本 Spec 与开发索引，修订后重新等待审批。
