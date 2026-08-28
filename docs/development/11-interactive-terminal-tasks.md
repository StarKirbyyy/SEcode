# 阶段 11 Task：可交互终端入口

## 1. 文档状态与审批链

- 当前状态：已批准，阶段 11 正式完成
- 生成日期：2026-08-28
- 已批准 Spec：[11-interactive-terminal-spec.md](./11-interactive-terminal-spec.md)
- Spec 审批记录：用户于 2026-08-28 明确批准
- Task 审批记录：用户于 2026-08-28 明确批准
- 当前允许：阶段 12 只读观察与 Spec 审阅
- 当前禁止：未经阶段 12 Spec/Task 审批继续修改实现、超出白名单、修改阶段 03–10 核心协议或进入阶段 13
- 下一步门禁：阶段 12 Spec 获批后只解锁阶段 12 Task 编写

审批链：

```text
阶段 11 Spec（已批准）
  → 本 Task（已批准）
  → T11-00～T11-14（已完成）
  → 阶段 11 Summary（已批准）
```

## 2. 任务目标

在不修改阶段 03–10 核心协议、不进入真实模型验收和 Web 开发的前提下，实现一个可通过 `pnpm agent` 启动的中文人类交互 TTY。

最终产物应具备：

- `--workspace + --model` 创建固定 Session，`--session` 恢复既有 Session，无参数进入 TTY setup。
- 严格 argv/命令/环境边界和有限 `TERMINAL_*` 错误。
- 生产 store/model/context/runtime 的单点装配。
- 全 `AgentEvent` 中文渲染、assistant delta 去重和终端控制字符安全转义。
- 串行 writer、单输入循环和受控 completion observer。
- help/status/approve/reject/cancel/exit 六命令。
- Ctrl+C、EOF、退出、writer 失败和 commit uncertain 的安全收口。
- fake model + 临时 store/workspace 的生产核心集成测试。
- `tsx` 开发依赖、可复现 lockfile 和 CLI 子进程验证。
- 阶段 11 Summary 中的基础人工操作说明。

## 3. 批准后的执行总顺序

```text
T11-00 基线、范围与 Next/Node 约束复核
  → T11-01 tsx、脚本和依赖锁定
  → T11-02 Terminal 契约、Schema 与错误
  → T11-03 argv、命令与 environment
  → T11-04 终端文本安全与事件 renderer
  → T11-05 serialized writer 与 Node readline I/O
  → T11-06 Session setup、新建与恢复
  → T11-07 应用循环、任务启动、status 与 completion
  → T11-08 审批、取消、Ctrl+C、EOF 与退出
  → T11-09 production bootstrap、barrel 与 CLI 入口
  → T11-10 生产 Runtime/Context 终端集成
  → T11-11 子进程、公共 API 与安全收口
  → T11-12 人工测试准备与可操作性检查
  → T11-13 全量验证、差异审查与反思修正
  → T11-14 Summary、索引与用户审批门禁
```

所有任务严格按顺序执行。当前任务的最小验证失败时不进入下一任务；需要改变 TTY、命令、依赖、公共接口、安全、退出或阶段边界时立即停止并回到 Spec 修订。

## 4. 文件白名单

### 4.1 生产终端文件

实现阶段只允许新增：

```text
cli/secode.ts
lib/terminal/types.ts
lib/terminal/schemas.ts
lib/terminal/errors.ts
lib/terminal/arguments.ts
lib/terminal/environment.ts
lib/terminal/text-safety.ts
lib/terminal/event-renderer.ts
lib/terminal/writer.ts
lib/terminal/node-io.ts
lib/terminal/session.ts
lib/terminal/application.ts
lib/terminal/bootstrap.ts
lib/terminal/index.ts
```

职责固定：

- `cli/secode.ts`：极薄进程入口，只调用公共 terminal main 并设置 `process.exitCode`。
- `types.ts`：launch/command/frame/I/O/application/bootstrap 类型和常量。
- `schemas.ts`：不含 capability 的 strict 数据边界。
- `errors.ts`：10 个有限 `TERMINAL_*` 错误码和安全格式。
- `arguments.ts`：argv/命令解析、help/command 文本。
- `environment.ts`：批准的模型变量复制和 dataDir 选择。
- `text-safety.ts`：canonical JSON、secret redaction 后终端控制字符转义和短 ID。
- `event-renderer.ts`：穷举 `AgentEvent` 到 frame，并管理单 run delta 排版状态。
- `writer.ts`：所有 frame 串行写入、一次失败和 flush。
- `node-io.ts`：唯一直接接触 `process.stdin/stdout/stderr`、`readline` 和 SIGINT 的适配器。
- `session.ts`：TTY setup、新建/恢复选择和 workspace/profile preflight。
- `application.ts`：单输入循环、任务、命令、active handle 和 completion observer。
- `bootstrap.ts`：生产 store/model/context/runtime/session/I/O 装配、错误到 exit code 和清理。
- `index.ts`：仅导出 CLI 所需 main、批准常量和装配测试所需类型。

若实现证明某文件应合并或新增职责文件，必须先修订本 Task 并重新审批；不能边开发边改变白名单。

### 4.2 测试文件

实现阶段只允许新增：

```text
tests/unit/terminal/helpers.ts
tests/unit/terminal/schemas.test.ts
tests/unit/terminal/arguments.test.ts
tests/unit/terminal/environment.test.ts
tests/unit/terminal/text-safety.test.ts
tests/unit/terminal/event-renderer.test.ts
tests/unit/terminal/writer.test.ts
tests/unit/terminal/session.test.ts
tests/unit/terminal/application.test.ts
tests/unit/terminal/bootstrap.test.ts
tests/unit/terminal/public-api.test.ts
tests/unit/terminal/security.test.ts
tests/integration/terminal/helpers.ts
tests/integration/terminal/runtime.test.ts
tests/integration/terminal/process.test.ts
```

所有 helper 必须使用 deterministic fake I/O/model、临时 data root 和合成 workspace；清理只能删除 helper 自己创建的精确临时目录。

### 4.3 依赖与脚本文件

允许修改：

```text
package.json
pnpm-lock.yaml
```

只允许：

- 新增一个 `tsx` devDependency。
- 新增一个 `"agent": "tsx cli/secode.ts"` script。
- 由 pnpm 对应更新 lockfile。

禁止升级、删除或重排无关依赖，禁止改变 Node/pnpm engines、Next/React/TypeScript/Vitest/Playwright 版本或其他 script。

### 4.4 文档文件

允许修改：

```text
docs/development/11-interactive-terminal-spec.md
docs/development/11-interactive-terminal-tasks.md
docs/development/11-interactive-terminal-summary.md
docs/development/README.md
```

Spec 只能记录真实审批状态。实现需要改变 Spec 时必须停止并重新审批，不能回写规格掩盖偏差。

### 4.5 明确禁止修改

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
README.txt
```

若需要修改任一禁止路径，立即停止并回到对应已批准 Spec；不得以终端兼容或测试修复为由越界。

## 5. 固定内部契约

本节把 Spec 的建议收紧为实现期不再临时决定的接口语义。具体 TypeScript readonly 修饰和字段排序可在不改变含义时调整。

### 5.1 Launch 联合

```ts
type TerminalLaunch =
  | { mode: "help" }
  | { mode: "setup"; dataDir?: string }
  | {
      mode: "create";
      workspacePath: string;
      modelProfileId: string;
      title?: string;
      dataDir?: string;
    }
  | { mode: "resume"; sessionId: string; dataDir?: string };
```

- `--help` 必须是唯一 flag。
- `--workspace` 与 `--model` 必须成对；`--title` 只能随 create。
- `--session` 与 create 字段互斥。
- `--data-dir` 可用于 setup/create/resume。
- 无业务 flag 为 setup。
- 所有路径在解析层只验证 absolute/NUL/长度，canonical workspace 由 Workspace 层完成。

### 5.2 Command 联合

```ts
type TerminalCommand =
  | { kind: "task"; content: string }
  | { kind: "empty" }
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "approve"; reason?: string }
  | { kind: "reject"; reason?: string }
  | { kind: "cancel"; reason?: string }
  | { kind: "exit" };
```

- 输入以 `/` 开头时必须匹配六个精确小写命令；未知 slash 输入是 `TERMINAL_COMMAND_INVALID`，不能作为任务。
- 普通内容 trim 后非空且复用 Agent prompt 最大 1048576 字符。
- approval/cancel reason 是命令后的整段 trim 文本，最大 4096 字符。
- `/help extra`、`/status extra`、`/exit extra` 无效。

### 5.3 Frame 与 I/O

```ts
type TerminalFrame = Readonly<{
  channel: "stdout" | "stderr";
  mode: "line" | "append";
  text: string;
}>;

interface TerminalIO {
  readonly interactive: boolean;
  readonly input: AsyncIterable<string>;
  write(frame: TerminalFrame): Promise<void>;
  onInterrupt(listener: () => void): () => void;
  close(): Promise<void>;
}
```

- `mode=line` 由 adapter 追加一个换行；`append` 不追加。
- 所有 text 在 writer 中再次经过 terminal-safe 规范化，renderer 不能绕过 writer。
- setup 与 application 共享同一个 `AsyncIterator<string>`，不得并发消费 input。
- `onInterrupt` 返回幂等 disposer。
- fake I/O 可显式触发 line、interrupt、EOF 和 write failure。

### 5.4 应用结果

```ts
type TerminalExitCode = 0 | 1 | 2 | 130;

interface TerminalApplicationResult {
  exitCode: TerminalExitCode;
  reason: "normal" | "usage" | "fatal" | "interrupted";
}
```

CLI main 捕获并返回结果，不调用 `process.exit()`；极薄入口只设置 `process.exitCode`，使 finally、writer flush 和 Runtime completion 有机会完成。

### 5.5 错误码

固定且只允许以下 10 个：

```text
TERMINAL_ARGUMENT_INVALID
TERMINAL_TTY_REQUIRED
TERMINAL_COMMAND_INVALID
TERMINAL_MODEL_UNAVAILABLE
TERMINAL_SESSION_UNAVAILABLE
TERMINAL_WORKSPACE_UNAVAILABLE
TERMINAL_NO_ACTIVE_RUN
TERMINAL_NO_PENDING_APPROVAL
TERMINAL_IO_ERROR
TERMINAL_INTERNAL_ERROR
```

recoverable 映射按 Spec 第 16 节。Terminal error 的 cause 不可枚举，公开 error 必须通过 `ErrorInfoSchema`；details 只允许 field、reason、profileId、sessionId、runId、approvalId、command 和有限计数，不含 argv 原文、路径、prompt、事件、env、output 或 secret。

### 5.6 Environment 白名单

只复制 Spec 第 15.1 节的 14 个模型变量；`SECODE_DATA_DIR` 独立读取，不传给 ModelClient。dataDir 优先级：launch flag > 非空 `SECODE_DATA_DIR` > undefined/default。

不得调用 dotenv、Next env loader、`process.loadEnvFile()` 或枚举后整体 spread `process.env` 到 ModelClient。

## 6. T11-00：实施前基线与批准范围复核

### 输入

- 已批准阶段 11 Spec 和本 Task（获批后）。
- 阶段 00/01 与阶段 04–10 批准文档。
- 当前 `AGENTS.md`、Git 状态、依赖和测试基线。

### 操作

1. 逐项对照 Spec 第 5–23、26 节和本 Task。
2. 记录实现前 `git status --short`，区分用户/前序阶段已有内容。
3. 确认 `cli/secode.ts`、`lib/terminal`、terminal tests 尚不存在。
4. 再读 `node_modules/next/dist/docs` 的项目结构和 TypeScript 指南，确认 CLI 仍受当前 strict tsconfig/build 检查，但不进入 App Router。
5. 核对 Node 官方 TypeScript/paths 结论和当前 `tsx` 不存在事实。
6. 运行：

```text
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

7. 记录测试文件数、测试数、warning、构建结果和 package/lock diff。

### 完成条件

- 基线全部通过；既有失败则停止并报告。
- 未安装依赖或创建实现文件。
- 白名单、唯一新增依赖和禁止路径仍与批准内容一致。

### 覆盖

- NFR-001/006/008、COM-001/003。

## 7. T11-01：`tsx`、package script 与依赖锁定

### 涉及文件

```text
package.json
pnpm-lock.yaml
```

### 操作

1. 使用 pnpm 新增 `tsx` 为唯一 devDependency，不手写 lockfile。
2. 新增且只新增 `"agent": "tsx cli/secode.ts"` script。
3. 检查 `tsx` package engines 支持仓库 Node >=20.9；如不支持，停止并回到 Spec，不提高 Node engine。
4. 检查 lockfile 只含 `tsx` 及其正常传递依赖，无 Agent SDK/TUI/dotenv/网络客户端。
5. 不运行 `pnpm dlx`，不添加 postinstall 或二进制下载步骤。
6. 在 CLI 文件尚未创建前只验证执行器本身，不运行 agent script。

### 最小验证

```text
pnpm exec tsx --version
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
```

- `git diff -- package.json pnpm-lock.yaml` 精确审查。
- `pnpm list --depth 0` 仅新增 `tsx`。

### 完成条件

- package 与 lockfile 可复现。
- 现有依赖/脚本/engines 未变。
- 没有实现 Agent/终端业务逻辑的第三方包。

### 覆盖

- NFR-001/006、COM-001–003。

## 8. T11-02：Terminal 契约、strict Schema 与错误

### 涉及文件

```text
lib/terminal/types.ts
lib/terminal/schemas.ts
lib/terminal/errors.ts
tests/unit/terminal/helpers.ts
tests/unit/terminal/schemas.test.ts
```

### 操作

1. 固定第 5 节 Launch、Command、Frame、I/O、结果和错误类型。
2. 固定 10 个错误码、recoverable 表和 exit code 常量。
3. 为 JSON-compatible launch、command、frame、application result 建 strict Zod Schema。
4. AbortSignal、AsyncIterable、writer function、Runtime 和 store 等 capability 只做 TypeScript/手工验证，不进入 Zod/JSON。
5. `TerminalLayerError` 的 cause 不可枚举；公开 error 经过 `ErrorInfoSchema`。
6. details 用明确字段白名单和 secret redaction，不使用会误伤普通计数的通用 key 猜测。
7. helper 提供 deterministic fake I/O、deferred、fake runtime/store/model、event factory 和精确临时目录清理。

### 最小测试

- 10 错误码和 recoverable 表精确。
- launch/command/frame/result 额外 key 拒绝。
- text/path/UUID/长度/exit code 边界。
- error JSON 无 cause、stack、argv、prompt、path、event、env、output 或 secret。
- capability 不可序列化且不出现在 public error。

```text
pnpm exec vitest run tests/unit/terminal/schemas.test.ts
pnpm typecheck
```

### 完成条件

- 后续任务无需改变公共/内部核心联合和错误码。
- 类型层不提供模型、工具、append 或审批 capability 后门。
- 无 I/O、process、readline、store 或模型调用。

### 覆盖

- NFR-002/003/006、SEC-006、COM-003。

## 9. T11-03：argv、命令与 environment

### 涉及文件

```text
lib/terminal/arguments.ts
lib/terminal/environment.ts
lib/terminal/schemas.ts
lib/terminal/types.ts
tests/unit/terminal/arguments.test.ts
tests/unit/terminal/environment.test.ts
```

### 操作

1. 手工逐 token 解析 argv，不使用 shell parser 或第三方 CLI 框架。
2. 实现 help/setup/create/resume 联合和所有互斥/必需/重复规则。
3. `--help` 只允许单独使用；返回静态中文帮助，不触发任何依赖。
4. workspace/data-dir 只检查绝对/NUL/4096 bytes；不展开 `~`、变量、glob 或 substitution。
5. model/profile/title/UUID 长度和 trim 按批准 Schema。
6. 命令解析固定六命令和 task/empty；slash 未知失败而非任务。
7. `/approve`、`/reject`、`/cancel` reason 取余下整行，空白省略，最大 4096。
8. 环境函数按常量数组逐项复制 14 个模型变量，trim 后空值仍交模型配置层按既有规则处理。
9. dataDir 实现 flag > `SECODE_DATA_DIR` > default；相对 env/flag 都失败关闭。
10. help/错误文本只列变量名和用法，不包含 Key 值示例。

### 最小测试

- help/setup/create/resume 合法表。
- 互斥、重复、未知、缺值、额外位置参数、相对/NUL/超长路径。
- 禁止 `--api-key`、`--base-url`、`--model-id` 等未批准入口。
- 任务、空行、六命令、大小写、额外参数、reason 0/4096/4097。
- 14 变量精确复制；额外 secret 丢弃；dataDir 三层优先级。
- 输入值不进入错误/帮助。

```text
pnpm exec vitest run tests/unit/terminal/arguments.test.ts tests/unit/terminal/environment.test.ts
pnpm typecheck
```

### 完成条件

- argv/命令为确定性纯函数。
- 不调用 shell、动态 import、文件系统、模型、store 或 process exit。
- Key 不能从 argv 进入应用。

### 覆盖

- FR-001/002/009、NFR-002/003、SEC-006、COM-001/003。

## 10. T11-04：终端文本安全与事件 renderer

### 涉及文件

```text
lib/terminal/text-safety.ts
lib/terminal/event-renderer.ts
lib/terminal/types.ts
tests/unit/terminal/text-safety.test.ts
tests/unit/terminal/event-renderer.test.ts
```

### 操作

1. 实现稳定 JSON：对象 key 递归排序，数组顺序保持，只接受公开 JSON value。
2. 所有动态文本先复用 secret redaction，再规范 CRLF/CR，最后转义 ESC、C0/C1、backspace 和其余控制字符；只保留 `\n`、`\t` 和普通 Unicode。
3. 转义采用可见 `\\uXXXX` 形式，不能删除控制字符导致文本拼接伪造。
4. 提供稳定 UUID 短标识，不能把任意非 UUID 当 ID。
5. renderer 对 `AgentEvent` 全联合使用 exhaustive switch，不用原始 JSON dump。
6. 实现 Spec 第 12.2 节逐事件映射；context summary 默认不打印正文。
7. ToolResult 只显示 ok/summary/public output/metadata/error；arguments 使用 publicArguments 和 argumentsTruncated。
8. usage 只显示 prompt/completion/total，不能反射 unknown/reasoning 字段。
9. 实现 per-run delta state：首 delta 前缀、append、事件切行、durable assistant 去重、终态收行。
10. renderer 无 I/O，只返回 frame + 新排版状态；输入不可修改。

### 最小测试

- 中文、emoji、换行、tab、CRLF 正常。
- ESC CSI/OSC、BEL、NUL、backspace、裸 CR、C1 和组合攻击可见转义。
- secret 与终端控制混合仍无原值/控制字节。
- stable JSON key/array 和非 JSON 失败。
- 全部 durable/live event 映射、channel/mode/字段精确。
- delta 0/1/N、有工具切换、final/intermediate、failed/cancelled 去重。
- ToolResult 成功/失败/output/metadata/truncated。
- context.compacted 无 summary 正文；错误无 stack/cause。
- compile-time exhaustive helper 和运行时 unknown fail closed。

```text
pnpm exec vitest run tests/unit/terminal/text-safety.test.ts tests/unit/terminal/event-renderer.test.ts
pnpm typecheck
```

### 完成条件

- 所有模型/工具/错误动态文本不能注入终端控制序列。
- renderer 只消费 public `@/lib/domain` AgentEvent。
- 无 process/readline/fs/model/store/runtime 副作用。

### 覆盖

- FR-005/010、NFR-002/003/006、SEC-006/008。

## 11. T11-05：Serialized writer 与 Node readline I/O

### 涉及文件

```text
lib/terminal/writer.ts
lib/terminal/node-io.ts
lib/terminal/text-safety.ts
lib/terminal/types.ts
tests/unit/terminal/writer.test.ts
tests/unit/terminal/helpers.ts
```

### 操作

1. Writer 以单 promise tail 串行处理所有 frame，调用顺序即输出顺序。
2. 每个 frame 在最终 write 前再次执行 terminal-safe 转换；line 恰好一个尾换行，append 不添加。
3. 首次 write failure 固定 `TERMINAL_IO_ERROR`，writer 进入 failed；后续普通 write 返回同一有限错误，不重复底层写。
4. 提供 `flush()` 等待已排队写入；不使用未处理的 fire-and-forget promise。
5. stderr fallback 只能尝试一次，不能递归进入已失败 stdout writer。
6. Node adapter 是唯一读取 `process.stdin.isTTY/stdout.isTTY` 的模块；interactive 需两者都 true。
7. 使用 Node `readline` 提供单 AsyncIterable；不并发 question。
8. SIGINT/readline interrupt 分发给当前 listener；disposer/close 幂等。
9. stdout/stderr backpressure 和 callback/error 转为 Promise；EPIPE/closed stream 结构化失败。
10. close 不关闭用户进程的全局 stdout/stderr，只关闭 readline 与本模块 listener。

### 最小测试

- 并发 enqueue 仍严格顺序。
- append/line/empty/Unicode/长文本。
- 控制字符在 writer 第二防线被转义。
- 第 N 次失败后底层调用次数、同一错误、flush settle。
- stdout failure + stderr fallback failure 无递归/悬挂。
- fake interrupt 多 listener/移除/重复 close。
- EOF 结束 iterator；close 后无 line。
- Node adapter source 之外无 direct process stream import。

```text
pnpm exec vitest run tests/unit/terminal/writer.test.ts
pnpm lint
pnpm typecheck
```

### 完成条件

- writer 故障可被 event sink 感知。
- 无 unhandled rejection、重复 listener 或进程流误关闭。
- 终端核心可完全用 fake I/O 测试。

### 覆盖

- FR-005/007、NFR-003/006、SEC-006。

## 12. T11-06：Session setup、新建与恢复

### 涉及文件

```text
lib/terminal/session.ts
lib/terminal/types.ts
lib/terminal/errors.ts
tests/unit/terminal/session.test.ts
tests/unit/terminal/helpers.ts
```

### 操作

1. 定义只含公共 store、workspace factory、model snapshot、runtime recover 和 input/writer 的 Session 依赖。
2. Setup 先列最近 Session：序号、短 ID、title、model、workspace basename、createdAt；不显示完整事件或 endpoint。
3. Setup 选择恢复或新建；每步消费共享 iterator 的一行，并走同一 argv Schema/验证函数。
4. 新建严格按 workspace handle → configured profile → canonical root → createSession。
5. 默认 title 取 canonical workspace basename；空/根/超长时使用有限安全 fallback/截断并通过 store Schema。
6. create commit uncertain 不猜测 ID，不重试 create；返回 fatal 恢复提示。
7. 恢复读取 metadata，重新创建 workspace handle，检查固定 profile configured，再调用 `runtime.recoverSession()`。
8. 只显示 public snapshot：lastSeq/status/last run；不手写 `run.interrupted`。
9. 没有 configured profile 时显示 profile issue 的 code/profileId/变量名型 message，不显示 env 值。
10. Setup Ctrl+C/EOF 在 createSession 前退出；已创建后 EOF 按正常应用退出，不删除 Session。

### 最小测试

- argv create/resume 和无参数 setup 三路径。
- workspace raw/canonical 不同，store 只收到 canonical。
- configured/unconfigured/missing profile。
- recent Sessions 0/1/N 和选择边界。
- title basename/fallback/256 边界。
- create 成功、already exists、commit uncertain 零重试。
- resume metadata/workspace/model/recover 错误映射。
- open run 只由 runtime recover；terminal 层 append 0 次。
- setup EOF/interrupt 零 Session 创建。
- 输出无 API Key、endpoint credential、完整事件、stack/cause。

```text
pnpm exec vitest run tests/unit/terminal/session.test.ts
pnpm typecheck
```

### 完成条件

- Session/工作区/模型在进入应用前固定。
- 终端不修改既有 Session metadata 或自行修复 JSONL。
- 所有失败不遗留第二份终端状态。

### 覆盖

- FR-001/008/009、NFR-002/003、SEC-001/002/006。

## 13. T11-07：应用循环、任务启动、status 与 completion

### 涉及文件

```text
lib/terminal/application.ts
lib/terminal/arguments.ts
lib/terminal/event-renderer.ts
lib/terminal/writer.ts
lib/terminal/types.ts
tests/unit/terminal/application.test.ts
tests/unit/terminal/helpers.ts
```

### 操作

1. 应用接收固定 Session、公共 AgentRuntime、共享 input iterator、writer 和 interrupt registration。
2. 启动时显示可信本地边界、Session 短 ID、canonical workspace、profile 和 `/help` 提示；动态路径经安全文本处理。
3. 单 `for await`/iterator 循环解析每行；空行只 prompt，idle task 调用 `startRun()`。
4. `startRun()` 只传 sessionId、完整任务和 `onEvent`；不覆盖 Runtime limits/thinking。
5. onEvent 使用 renderer + awaited writer；writer 失败必须 reject sink。
6. handle 建立后立即保存并启动唯一 completion observer，不阻塞输入。
7. active 时普通 task 明确拒绝且不调用第二次 startRun。
8. `/help` 返回静态命令；`/status` 从 `runtime.getActiveRun()` 读取 status/iteration/pending，idle 显示最近 outcome。
9. completion resolve：显示 public outcome、仅当仍是同一 handle 时清空 active、回到 idle。
10. ordinary completed/failed/cancelled 都不退出应用；run.failed 只显示公开 error。
11. completion reject：映射有限错误、标记 fatal/closing、禁止新任务，等待退出。
12. observer/renderer/write 全部 catch，不能产生 unhandled rejection。

### 最小测试

- welcome/help/status/empty。
- idle task start 参数与 sink。
- active 第二 task 零 start。
- event frame 顺序和 prompt。
- completed/failed/cancelled 后继续第二任务。
- completion resolve 与新旧 handle 竞态。
- completion reject 关闭且无后续 task。
- getActiveRun undefined/pending/status 各分支。
- startRun preflight error 不创建 active，应用继续或按错误类型提示。
- 所有 deferred/observer 在测试结束 settle。

```text
pnpm exec vitest run tests/unit/terminal/application.test.ts
pnpm lint
pnpm typecheck
```

### 完成条件

- 输入在 run active 时仍响应控制命令。
- Runtime/JSONL 是唯一业务真相，terminal 只持有当前 handle/排版/closing。
- 无任务队列、模型调用或工具直接执行。

### 覆盖

- FR-002/004/005、NFR-003/004/006、COM-003。

## 14. T11-08：审批、取消、Ctrl+C、EOF 与退出

### 涉及文件

```text
lib/terminal/application.ts
lib/terminal/types.ts
lib/terminal/errors.ts
tests/unit/terminal/application.test.ts
tests/unit/terminal/helpers.ts
```

### 操作

1. `/approve`/`/reject` 前从 `getActiveRun(handle.runId)` 重新取唯一 pending。
2. 调用 `resolveApproval(runId, approvalId, { approved, reason? })`；不缓存 pending/capability，不重试 invalid。
3. 没有 active/pending 分别返回有限可恢复错误，零 Runtime resolve。
4. `/cancel` 调用当前 handle.cancel；reason 默认中文固定值，重复 false 只提示已请求/无 active。
5. active Ctrl+C 与 `/cancel` 同语义，但固定原因“用户通过 Ctrl+C 取消运行”，应用保持打开等待 terminal。
6. idle/setup Ctrl+C 返回 130；setup 由 T11-06 handler 使用同 interrupt 端口。
7. idle EOF 返回 0；active EOF 或 `/exit` 先 cancel，再等待唯一 completion observer settle。
8. `/exit` active 不伪造 cancelled、不直接 close writer；completion settle 后退出。
9. approval wait 中 cancel 不自动调用 reject/resolve。
10. writer failed 时让 event sink reject并标 fatal；Runtime 既有 sink 失败取消路径负责 terminal，应用等待后 exit 1。
11. durable commit uncertain completion reject 退出 1并提示新进程恢复；不接受后续输入。
12. finally 以固定顺序 disposal：interrupt → input/readline close → completion settle → writer flush → 清 UI 引用。

### 最小测试

- approve/reject reason 无/有/4096、pending ID 精确。
- stale/invalid/重复 approval 零重复副作用。
- no active/no pending 可恢复错误。
- cancel 命令、active Ctrl+C、重复 Ctrl+C 单 cancel。
- idle/setup Ctrl+C 130。
- idle EOF 0；active EOF/exit cancel 后 settle。
- approval wait Ctrl+C 无 resolve。
- writer failure → sink reject → cancel/fatal/exit1。
- completion reject 后输入 ignored、listener 清理。
- cancel/complete、approve/cancel、exit/terminal 竞态只依据 Runtime outcome。

```text
pnpm exec vitest run tests/unit/terminal/application.test.ts
pnpm typecheck
```

### 完成条件

- 审批只经过公共 Runtime API。
- 所有取消/退出路径无双终态、悬挂 promise 或提前进程退出。
- 输出失败后不存在不可观察的继续执行。

### 覆盖

- FR-006/007、NFR-003/004、SEC-003–006。

## 15. T11-09：Production bootstrap、公共 barrel 与 CLI 入口

### 涉及文件

```text
lib/terminal/bootstrap.ts
lib/terminal/index.ts
lib/terminal/node-io.ts
lib/terminal/session.ts
cli/secode.ts
tests/unit/terminal/bootstrap.test.ts
tests/unit/terminal/public-api.test.ts
tests/unit/terminal/helpers.ts
```

### 操作

1. `runTerminalMain({ argv, environment, io? })` 返回 exit result/exit code，不抛未处理错误、不调用 `process.exit()`。
2. help 在 TTY、store、model、env secret extraction前短路；只允许安全 help 文本。
3. 非 help 先验证 `io.interactive`，失败 2且 store/model 0 调用。
4. 按 flag/env/default 解析 dataDir，create/init store，再创建 model client/snapshot。
5. 调用 Session 层完成 create/resume/setup；随后创建 context provider 和 Agent runtime。
6. 无论新建/恢复都调用一次 `runtime.recoverSession()`；新 Session 返回 idle且零写入。
7. 进入 application，最后执行 I/O close/writer flush；错误映射到 1/2/130。
8. environment 只通过 `environment.ts` 白名单传给 model client。
9. `@/lib/terminal` runtime value 只导出 `runTerminalMain`、错误码/exit code/环境名常量；类型只导出入口装配需要项。
10. 不导出 renderer state、writer internals、Session selector、fake dependencies、process streams 或 Runtime capability。
11. `cli/secode.ts` 只导入 `@/lib/terminal`，传 `process.argv.slice(2)` 和 process env source，设置 `process.exitCode`；catch 只输出固定安全 fallback。
12. 入口不读取 `.env*`，不使用 shebang 下载器、shell、eval 或动态 import。

### 最小测试

- help/TTY failure 的初始化调用次数均为 0。
- create/resume/setup 装配顺序。
- dataDir 三优先级。
- model/workspace/session/store/terminal 错误到 exit code。
- main finally 只 close/flush 一次。
- public runtime exports 精确白名单和 forbidden symbol。
- CLI source 极薄，无模型/tool/store internals。

```text
pnpm exec vitest run tests/unit/terminal/bootstrap.test.ts tests/unit/terminal/public-api.test.ts
pnpm lint
pnpm typecheck
```

### 完成条件

- `pnpm agent` 的生产装配只使用阶段 04–10公共 barrels。
- help 和非 TTY 零 durable/network 副作用。
- 无环境/Key/内部能力泄露。

### 覆盖

- FR-001/002/008/009、NFR-001–003/006、SEC-001/002/006、COM-001–003。

## 16. T11-10：Production Runtime/Context 终端集成

### 涉及文件

```text
tests/integration/terminal/helpers.ts
tests/integration/terminal/runtime.test.ts
lib/terminal/application.ts
lib/terminal/bootstrap.ts
```

只有测试暴露批准范围内的终端缺陷时，才允许修改列出的生产文件。

### 操作

1. helper 建立 temp data root、temp workspace、production store/context/runtime/terminal 和 queue fake ModelClient。
2. fake model snapshot 与 Session profile 一致；complete 不访问网络且支持 delta/tool_calls/deferred abort。
3. 完成新 Session 两次连续文本任务，验证 Session 固定、事件持久化和终端回到 idle。
4. 完成 read_file → tool result → final，验证公开 arguments/result/assistant delta。
5. 高风险安全临时进程分别 reject 和 approve；approve 目标必须无破坏、限定 temp workspace、无 shell。
6. active model deferred 时输入 cancel，验证单 run.cancelled 和应用继续/退出。
7. 创建新 terminal/runtime 实例恢复同 Session，验证 interrupted/历史后继续任务。
8. 构造长历史触发 context.compacted，验证终端显示范围但不打印 summary 全文。
9. 所有轨迹检查 stdout/stderr/events 无 Key、stack、cause、reasoning、continuation、capability 和控制字节。
10. 测试结束等待全部 completion、writer、readline fake 和清理 promise。

### 最小测试

```text
pnpm exec vitest run tests/integration/terminal/runtime.test.ts
pnpm typecheck
```

- final、tool、approval reject/approve、cancel、recover、compaction 七条轨迹。
- store 事件顺序与 Runtime 既有协议一致。
- fake model 请求通过 context messages，不由 terminal 构造。
- 测试前后真实用户项目和默认 `.secode-data` 不变。

### 完成条件

- 用户可观察/控制完整生产核心循环。
- Terminal 不复制 Agent/Context 或直接执行工具。
- 全部副作用局限于 helper 临时目录并精确清理。

### 覆盖

- FR-001–010、NFR-003–006、SEC-001–008、COM-001–003。

## 17. T11-11：子进程、公共 API 与安全收口

### 涉及文件

```text
tests/integration/terminal/process.test.ts
tests/unit/terminal/security.test.ts
tests/unit/terminal/public-api.test.ts
cli/secode.ts
lib/terminal/index.ts
```

只有测试暴露批准缺陷时才允许修改两个生产入口文件。

### 操作

1. 使用参数化 `spawn` 执行本地 pnpm/tsx，不开启 shell，不拼接用户输入。
2. 验证 `pnpm agent -- --help` exit 0、输出帮助、无 `.secode-data`、无模型/store副作用。
3. 验证非 TTY create/resume/setup exit 2和 `TERMINAL_TTY_REQUIRED`，不创建 data root。
4. 验证非法 argv exit 2、无 stack/env/secret/unhandled rejection。
5. source scan 禁止 Next/React/browser、Agent SDK/TUI/dotenv、child_process 在生产 terminal、shell/eval/dynamic code、direct model.complete、store.append、tool prepare/execute、approval gateway/capability、context internal。
6. 只允许 `node-io.ts` 使用 process streams/readline，只允许 `cli/secode.ts` 使用 argv/exitCode/env source。
7. 扫描 package 只新增 tsx，无禁止依赖/脚本。
8. 扫描输出 fixtures 无真实绝对用户路径、Key、Bearer、ANSI/OSC raw bytes、stack/cause/private fields。
9. 检查 public barrel 精确导出和阶段 13 不依赖 terminal internal。
10. 子进程超时/kill 后必须清理，不遗留后台进程或临时数据。

### 最小测试

```text
pnpm exec vitest run tests/unit/terminal/public-api.test.ts tests/unit/terminal/security.test.ts tests/integration/terminal/process.test.ts
pnpm agent -- --help
pnpm lint
pnpm typecheck
```

### 完成条件

- 支持的 Node 环境可真实启动 TypeScript CLI。
- 非 TTY/非法参数 fail closed且零业务副作用。
- 生产 terminal 无 Agent/工具/审批绕过出口。

### 覆盖

- NFR-001–003/006、SEC-003–006/008、COM-001–003。

## 18. T11-12：人工测试准备与可操作性检查

### 涉及文件

```text
docs/development/11-interactive-terminal-summary.md（仅在 T11-14 正式生成；本任务先记录素材）
```

本任务不提前创建 Summary，只整理待写证据。

### 操作

1. 在无真实 Key 情况运行 help，核对中文启动、flags、环境变量名、六命令和安全边界。
2. 使用 integration fake 证据整理未来人工步骤：export env → 选择临时工作区 → 启动 → task → status → cancel/approval → exit → resume。
3. 明确 Stage 11 可做的基础人工操作与 Stage 12 正式双模型验收差异。
4. 核对命令可复制、路径引号适用于包含空格的目录、Key 不出现在命令参数。
5. 核对高风险人工示例默认使用 reject；approve 示例留阶段 12 受控临时项目。
6. 不调用真实 DeepSeek/LongCat、不读取用户 `.env*`、不修改真实项目。

### 最小验证

- help 内容 snapshot/行为测试已覆盖。
- 手册命令与实际 argv parser 一致。
- 文档素材无真实 Key/路径、无超出本阶段的成功声明。

### 完成条件

- Summary 可给用户准确、低风险、可执行的手动测试方法。
- 不把 fake 自动测试写成真实模型验收。
- 不提前进入阶段 12。

### 覆盖

- NFR-008、SEC-006/008。

## 19. T11-13：全量验证、差异审查与反思修正

### 操作

1. 运行 terminal 精确测试：

```text
pnpm exec vitest run tests/unit/terminal tests/integration/terminal
```

2. 运行全仓门禁：

```text
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm agent -- --help
pnpm install --frozen-lockfile
git diff --check
```

3. 对照 Spec 第 18–21、26 节和本文每项测试点逐项核销。
4. 对照精确白名单，确认阶段 03–10源码/测试、app/config/env/.gitignore 无本阶段差异。
5. 检查 package/lock 只有 tsx/script，依赖 tree 无 Agent/TUI/dotenv/禁止包。
6. 检查无 `.secode-data`、真实 workspace fixture、临时目录、后台进程或测试报告残留。
7. 扫描 Key/Bearer/env dump/stack/cause/reasoning/continuation/capability/raw arguments/terminal control字节/真实绝对路径。
8. 专项反思：
   - help/TTY 是否真正在初始化前短路。
   - delta/tool/command 并发输出是否严格排序。
   - control character 是否在 renderer 和 writer 双层处理。
   - active completion 与新输入/exit/Ctrl+C 是否竞态安全。
   - writer failure 是否确实让 sink reject并停止不可观察执行。
   - approval 是否每次重新读取 pending，未缓存 capability。
   - completion reject 是否阻止 Session 继续。
   - finally 是否等待所有 observer/flush/disposer。
9. 记录每次失败的命令、症状、原因、修正、重跑范围和结果。
10. 只在批准文件/接口内修正；需要设计变化则停止并回到 Spec/Task。

### 完成条件

- terminal unit/integration/process 精确测试全部通过。
- 全仓 test/lint/typecheck/build/help/frozen install/diff check 通过，lint 0 warning。
- 无越界文件、依赖、秘密、控制注入、真实数据或后台进程。
- 不删除/降低断言、不添加永久 skip、不调用真实模型。

### 覆盖

- 本阶段全部 FR/NFR/SEC/COM。

## 20. T11-14：Summary、索引与用户审批门禁

### 涉及文件

```text
docs/development/11-interactive-terminal-summary.md
docs/development/11-interactive-terminal-tasks.md
docs/development/README.md
```

### 操作

1. 更新本 Task 实际完成状态，不改写批准范围。
2. 生成 Summary，记录审批链、逐任务完成、架构、文件、依赖、验证、失败修正、规格一致性、安全、限制和阶段 12 影响。
3. 提供手动测试方法，明确：
   - 安全设置环境变量但不把 Key 放 argv。
   - 创建/恢复 Session 命令。
   - task/status/cancel/approve/reject/exit 示例。
   - 默认使用临时工作区，危险操作优先 reject。
   - Stage 11 仅证明入口，真实双模型结论留 Stage 12。
4. 更新索引为“阶段 11 Summary 待用户审批”。
5. 检查链接、围栏、空白、白名单、秘密和 `git diff --check`。
6. 立即停止，不开始阶段 12 观察、真实模型或项目任务。

### 完成条件

- Summary 如实反映全部开发与失败过程。
- 手动步骤与最终 CLI 完全一致且不泄露 Key。
- 用户批准前阶段 11 未正式完成，阶段 12 未解锁。

### 覆盖

- NFR-008、SEC-006/008。

## 21. 需求—任务追踪矩阵

| 需求 | 主要任务 | 关键证据 |
| --- | --- | --- |
| FR-001 | T11-03/06/09/10 | create args、canonical workspace、temp store Session |
| FR-002 | T11-03/07/10 | task command、startRun、连续任务 |
| FR-004 | T11-07/10 | production Runtime/Context fake model 闭环 |
| FR-005 | T11-04/05/07/10 | 全事件 renderer、delta、工具/错误输出 |
| FR-006 | T11-08/10 | pending 重新读取、allow/reject 轨迹 |
| FR-007 | T11-05/08/10 | cancel、Ctrl+C、EOF、writer failure |
| FR-008 | T11-06/09/10 | list/resume/recover/restart |
| FR-009 | T11-03/06/09 | environment/profile configured 选择 |
| FR-010 | T11-04/10 | context.compacted 范围输出 |
| NFR-001 | T11-00/01/09/11/13 | Node >=20.9、tsx、Next build |
| NFR-002/003 | T11-02–09 | strict Schema、有限错误、退出码 |
| NFR-004 | T11-07/08/10 | 不覆盖 Runtime limits、取消闭环 |
| NFR-006 | T11-04/05/09/11 | Node-only、源码扫描 |
| NFR-008 | T11-00/12/14 | 审批和详细文档 |
| SEC-001/002 | T11-06/09/10 | Workspace canonical handle |
| SEC-003–005/007 | T11-07/08/10/11 | Runtime 唯一工具/审批入口 |
| SEC-006 | T11-02–05/09/11/14 | env 白名单、脱敏、控制转义 |
| SEC-008 | T11-07/12/14 | 可信本地边界和手动说明 |
| COM-001–003 | T11-01/07/09/11/13 | 仅 tsx、无框架、无循环复制 |

## 22. 测试分层

| 层次 | 使用对象 | 禁止对象 | 主要验证 |
| --- | --- | --- | --- |
| 纯单元 | Schema、argv、command、env、text、renderer | process、磁盘、网络、真实时间 | 边界、确定性、安全转义 |
| I/O 单元 | fake streams/lines/interrupt/writer | 真实 stdin、模糊 sleep | 顺序、故障、清理 |
| 应用单元 | fake AgentRuntime/store/model/workspace | 真实工具/网络 | 命令、active、审批、取消、退出 |
| 核心集成 | production store/context/runtime/terminal + fake model | 用户目录、真实 Key/网络 | 完整业务轨迹和事件可见性 |
| 子进程 | local pnpm/tsx、help/invalid/non-TTY | shell、真实 Session/模型 | 可执行入口和退出码 |
| 全仓回归 | Vitest/lint/typecheck/build/frozen install | skip、降断言 | 不破坏阶段 03–10/Next |

阶段 11 不执行正式真实 DeepSeek/LongCat、真实项目修改验收、HTTP、UI 或 Playwright 产品 E2E。

## 23. 失败处理与回退

### 23.1 实现失败

- 记录失败命令、错误、触发输入和当前任务。
- 只修改当前或此前阶段 11 白名单文件。
- 修正后先跑最小测试，再跑受影响 terminal 测试。
- 不删除测试、降低断言、吞掉异常或添加永久 skip。

### 23.2 必须回到 Spec

- 需要修改阶段 03–10 公共协议或新增 durable/live event。
- 需要 Terminal 直接调用 model/tool/append/approval gateway。
- 需要增加/删除命令、支持非 TTY 协议或改变 Ctrl+C/exit code。
- 需要自动加载 `.env*`、接受 argv Key 或改变 environment 白名单。
- 需要除 `tsx` 外的新依赖或提高 Node engine。
- 需要改变 writer failure、commit uncertain、Session 固定或真实模型阶段边界。

### 23.3 必须修订 Task

只需调整 `lib/terminal` 内部文件拆分、测试文件或任务顺序但仍符合 Spec 时，停止实现、修订本 Task 并重新等待 Task 批准。

### 23.4 工作树保护

- 不使用 `git reset --hard`、`git checkout --` 或递归删除。
- 不覆盖阶段 07–10 和用户已有修改。
- package/lock 只用 pnpm 进行批准变更，发现无关 diff 立即停止。
- 临时目录和子进程只清理由本阶段 helper 创建/启动的精确对象。

## 24. 明确不执行

- 不修改 AgentRuntime、Context、Model、Tool、Approval、Workspace、Storage 或 Domain。
- 不调用真实 DeepSeek/LongCat/generic 端点，不读取/打印真实 Key。
- 不访问、修改或运行真实用户项目；集成测试只用 temp workspace。
- 不创建 Route Handler、Server Action、NDJSON、React/UI 或产品 Playwright。
- 不支持非 TTY batch、JSON protocol、TUI、ANSI color、Markdown renderer 或 daemon。
- 不自动读取 `.env*`、Keychain、shell history 或配置文件。
- 不增加 dotenv、CLI/TUI framework、Agent SDK、模型 SDK 或进程工具依赖。
- 不自动 commit、push、发布、部署或改写 Git 历史。
- 不提前创建阶段 12 Spec/Task/实现或声称真实模型已验收。
- 不修复与本阶段无关的既有代码/文档差异。

## 25. 实施逐项门禁

每开始任务前确认：

- [ ] Spec/Task 仍为已批准且未被取代。
- [ ] 前置任务最小验证通过。
- [ ] 文件位于精确白名单。
- [ ] 不需要新公共接口、依赖、安全或交互决策。
- [ ] 既有 Git 修改已识别并保留。

每完成任务后确认：

- [ ] 输出和完成条件满足。
- [ ] 最小测试/typecheck/lint 通过。
- [ ] 失败与修正已登记给 Summary。
- [ ] 无真实模型/项目/API/UI 或阶段 12 工作。

## 26. Task 内部门禁

- [x] 已链接已批准 Spec 并记录 2026-08-28 审批。
- [x] 已按依赖顺序拆分 T11-00～T11-14。
- [x] 每项任务包含操作、文件、测试、完成条件和需求覆盖。
- [x] 已锁定 14 个生产文件、15 个测试文件、package/lock 和文档白名单。
- [x] 已固定 Launch、Command、Frame、I/O、exit 和 10 错误码。
- [x] 已覆盖 argv、env、Session、event、control safety、writer、应用、审批、取消、bootstrap 和子进程。
- [x] 已定义全量验证、失败回退、手动测试素材和 Summary 门禁。
- [x] 已明确唯一新增依赖为 `tsx`，无真实模型/API/UI。
- [x] 未安装依赖、修改 package/lock、创建实现/测试或 Summary。

**Task 内部门禁：通过。当前状态：已批准。**

## 27. 用户审批项

批准本 Task 即确认：

1. 按 T11-00～T11-14 顺序实施。
2. 允许新增第 4 节的 14 个生产文件和 15 个测试文件。
3. 允许用 pnpm 新增唯一 `tsx` devDependency、`agent` script 和对应 lock diff。
4. 固定第 5 节内部契约，不在实现时临时增加命令或能力。
5. 自动测试只使用 fake model、temp store/workspace 和安全进程。
6. 每项最小验证通过后才能进入下一项。
7. 全量通过后只生成阶段 11 Summary，不进入真实模型阶段 12。

- 当前审批结果：用户已于 2026-08-28 批准阶段 11 Task。
- 本次批准解锁：严格按 T11-00～T11-14 开发并生成 Summary。
- 当前仍禁止：超出批准白名单、真实模型、阶段 12、API 或 UI。
- 用户要求修订时：只修改本 Task 和索引，修订后重新等待审批。

## 28. 实施完成记录

- T11-00～T11-13 已于 2026-08-28 按批准顺序完成。
- T11-14 已生成并完成 [11-interactive-terminal-summary.md](./11-interactive-terminal-summary.md) 审批，索引已更新为“阶段 11 已批准”。
- 实际变更严格位于第 4 节白名单：14 个生产终端文件、15 个测试/helper 文件、`package.json`、`pnpm-lock.yaml` 和本阶段文档。
- 唯一新增直接依赖为 `tsx 4.23.12`，唯一新增 script 为 `agent`。
- 最终 terminal 精确测试：13 个测试文件、66 项测试通过。
- 最终全仓测试：74 个测试文件、599 项测试通过。
- `pnpm lint` 0 warning，`pnpm typecheck`、`pnpm build`、`pnpm agent -- --help`、`pnpm install --frozen-lockfile` 和 `git diff --check` 全部通过。
- 未调用真实 DeepSeek/LongCat、未修改真实用户项目、未进入阶段 12/API/UI。
- Summary 已于 2026-08-28 获用户批准；阶段 11 正式完成，仅解锁阶段 12 的只读观察与 Spec 编写。
