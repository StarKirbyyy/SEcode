# 阶段 11 Summary：可交互终端入口

## 1. 文档状态与审批链

- 当前状态：已批准
- 完成日期：2026-08-28
- 已批准 Spec：[11-interactive-terminal-spec.md](./11-interactive-terminal-spec.md)
- 已批准 Task：[11-interactive-terminal-tasks.md](./11-interactive-terminal-tasks.md)
- Spec 审批：用户于 2026-08-28 批准
- Task 审批：用户于 2026-08-28 批准
- Summary 审批：用户于 2026-08-28 批准
- 当前门禁：阶段 11 已正式完成；只解锁阶段 12 的“观察 → Spec”，阶段 12 Task、开发、HTTP 和 UI 均未解锁

审批链：

```text
阶段 11 Spec（已批准）
  → 阶段 11 Task（已批准）
  → T11-00～T11-13（已完成）
  → T11-14 本 Summary（已批准）
  → 阶段 12 观察与 Spec（已解锁）
```

## 2. 完成结论

阶段 11 已实现 `pnpm agent` 启动的中文人类交互 TTY。它不复制 Agent 状态机，而是把阶段 04–10 的 production Model、Workspace、JSONL Store、Context Provider 和 AgentRuntime 装配为一个可观察、可审批、可取消、可恢复的终端入口。

最终形成：

- 14 个生产终端文件，共 1202 行。
- 15 个测试/helper 文件，共 1138 行。
- 10 个固定 `TERMINAL_*` 错误码和 4 个退出码。
- 13 个 terminal 测试文件、66 项精确测试全部通过。
- 全仓 74 个测试文件、599 项测试全部通过。
- lint 0 warning、typecheck、Next.js 16.3.3 build、CLI help、冻结安装与差异检查全部通过。
- 唯一新增直接依赖为 `tsx 4.23.12`；唯一新增脚本为 `"agent": "tsx cli/secode.ts"`。
- 未调用真实模型、未访问真实用户项目、未创建默认 `.secode-data`、未修改阶段 03–10 核心源码或 `app/**`。

生产路径如下：

```text
pnpm agent
  → argv strict parser / TTY 前置门禁
  → 14 项模型环境变量白名单 / dataDir 选择
  → JSONL Store + ModelClient + ContextProvider + AgentRuntime
  → setup / create / resume 固定 Session
  → 单输入循环
      ├── 普通任务 → AgentRuntime.startRun()
      ├── /status → Runtime active view
      ├── /approve / /reject → Runtime.resolveApproval()
      ├── /cancel / Ctrl+C → AgentRunHandle.cancel()
      └── /exit / EOF → 安全收口
  → AgentEvent renderer → serialized writer → Node stdout/stderr
```

## 3. 实际任务完成情况

| 任务 | 状态 | 实际产物 | 验证证据 |
| --- | --- | --- | --- |
| T11-00 基线与范围 | 已完成 | Next 本地指南、白名单、工作树和 61/533 基线复核 | 隔离复跑与顺序全量通过 |
| T11-01 tsx 与脚本 | 已完成 | `tsx 4.23.12`、`pnpm agent`、正常 lockfile 传递依赖 | version、frozen install、依赖树 |
| T11-02 契约与错误 | 已完成 | Launch/Command/Frame/I/O/result、strict Schema、10 错误码 | extra key、边界、cause/details 脱敏测试 |
| T11-03 argv/命令/env | 已完成 | 手工 token parser、六命令、14 变量白名单、dataDir 优先级 | 合法表、互斥、长度和 secret 丢弃测试 |
| T11-04 文本与 renderer | 已完成 | stable JSON、控制字符可见转义、全事件映射、delta 去重 | ESC/OSC/C0/C1/裸 CR、全部事件测试 |
| T11-05 writer 与 Node I/O | 已完成 | 串行 promise tail、故障锁存、readline/SIGINT/stream adapter | 顺序、二次防线、单错误测试 |
| T11-06 Session | 已完成 | setup/create/resume、canonical workspace、profile preflight、recover | 新建/恢复/EOF/失败映射测试 |
| T11-07 应用循环 | 已完成 | 单输入、单 active handle、event sink、status、completion observer | 连续任务、第二任务拒绝、普通终态继续 |
| T11-08 审批与取消 | 已完成 | pending 重新读取、approve/reject、cancel、Ctrl+C、EOF/exit | 审批 ID、取消单终态、idle 130、fatal wake |
| T11-09 bootstrap/CLI | 已完成 | production 单点装配、最小 barrel、极薄 CLI | help/TTY 零业务副作用、公共导出测试 |
| T11-10 核心集成 | 已完成 | production Store/Context/Runtime + queue fake model | 文本、read_file、approval reject、cancel、Ctrl+C |
| T11-11 进程与安全 | 已完成 | 参数化 pnpm/tsx 子进程、源码/依赖扫描 | help 0、非 TTY/非法 argv 2、零数据副作用 |
| T11-12 人工测试准备 | 已完成 | 本文第 8 节低风险手动步骤 | 与最终 parser/help 对照 |
| T11-13 全量与反思 | 已完成 | 全仓门禁、范围/残留/secret 审计、竞态修正 | 599 tests、0 warning、build/frozen/diff |
| T11-14 Summary | 已完成，已批准 | 本 Summary、Task 实施记录、索引状态 | 用户于 2026-08-28 批准 |

任务严格按批准顺序实施，没有进入真实双模型、Route Handler 或 UI。

## 4. 关键实现说明

### 4.1 启动、参数与环境边界

`arguments.ts` 逐 token 解析，不使用 CLI 框架或 shell parser。支持：无参数 setup、`--workspace + --model` 新建、`--session` 恢复、可选 `--data-dir` 和唯一 `--help`。为满足 Task 中固定的 `pnpm agent -- --help` 命令，只在首位接受一个 pnpm 传输分隔符 `--`；其他位置参数、重复 flag、相对路径、NUL、超长值和未批准的 Key/base URL 参数全部失败关闭。

bootstrap 只逐项复制批准的 14 个模型变量。`SECODE_DATA_DIR` 单独用于 storage，优先级为 flag、非空环境变量、store 默认。不会调用 dotenv、Next env loader 或 `process.loadEnvFile()`，也不会把整个 `process.env` 传给模型。

help 在 TTY、store 和 model 初始化前短路；非 TTY 在任何 durable/network 初始化前以 2 退出。CLI 不调用 `process.exit()`，只设置 `process.exitCode`。

### 4.2 Session 固定与恢复

setup 使用与应用相同的唯一 `AsyncIterator<string>`，列出最近 Session 的序号、短 ID、title、profile、工作区 basename 和创建时间。用户可输入 `n` 新建或 `r <序号>` 恢复。

新建顺序固定为：profile configured 检查、Workspace canonical handle、使用 canonical root 创建 JSONL Session、调用一次 `runtime.recoverSession()`。默认 title 来自 canonical workspace basename，并限制为 256 字符。恢复始终读取 Session 固定 metadata，再检查固定 workspace/profile，最后让 Runtime 处理 interrupted 历史；Terminal 不 append 或修复事件。

### 4.3 单输入应用与 AgentRuntime 所有权

应用只有一个输入读取循环、一个 active handle 和一个 completion observer。任务只向 `startRun()` 传 `sessionId`、完整 prompt 和 `onEvent`，不覆盖 Runtime 的 iteration、duration 或 thinking 限制。active 时第二任务明确拒绝，不排队。

`/status` 每次读取 `runtime.getActiveRun()`；`/approve` 和 `/reject` 每次重新读取唯一 pending approval ID，再调用公共 `resolveApproval()`；Terminal 不缓存 capability。`/cancel` 和 active Ctrl+C 只调用 handle.cancel，不伪造终态。普通 completed/failed/cancelled 后继续保持交互。

completion reject 会设置 fatal、唤醒正在等待输入的循环、禁止后续任务并以 1 收口。`/exit` 或 active EOF 先取消，再等待唯一 observer settle。idle Ctrl+C 返回 130，idle EOF 和正常退出返回 0。

### 4.4 全 AgentEvent 可观察性

renderer 对公开 `AgentEvent` 判别联合做 exhaustive switch，覆盖 Session、run、user、model、assistant、tool、approval、compaction 和四类终态。它不 dump 原始对象：

- 工具参数只显示 `publicArguments` 和截断标记。
- 工具结果只显示公开 summary/output/metadata/error。
- usage 只显示 prompt/completion/total token。
- `context.compacted` 只显示 throughSeq 和 retainedRange，不显示 summary 正文。
- error 只显示公开 code/message，不显示 stack/cause。

per-run delta state 在首片段输出“智能体：”，后续使用 append；工具/命令/终态前先收行。若 durable assistant 内容与已流式内容完全相同则不重复输出。

### 4.5 文本与 I/O 安全

所有动态文本先经过既有 secret redaction，再把 CRLF 规范为 LF；裸 CR、ESC、BEL、NUL、backspace、DEL、其他 C0/C1 均转换为可见 `\\uXXXX`。正常中文、emoji、LF 和 tab 保留。renderer 生成 frame 后，writer 在底层写入前再次执行同一安全转换，形成第二防线。

writer 以单 promise tail 串行输出。首次底层写失败后锁存同一个 `TERMINAL_IO_ERROR`，后续调用不再触碰底层流；flush 等待已排队操作。Node adapter 是唯一读取 stdin/stdout TTY 和 readline/SIGINT 的生产模块，write callback/error 被转换为 Promise，close/disposer 幂等且不关闭全局 stdout/stderr。

### 4.6 生产装配与公共 API

`bootstrap.ts` 只通过阶段 04–10 公共 barrel 创建 ModelClient、WorkspaceHandle、JsonlEventStore、ContextProvider 和 AgentRuntime。Terminal 不直接调用 `model.complete()`、工具 prepare/execute、approval gateway 或 store.appendEvent()。

`@/lib/terminal` 的 runtime value 精确为：

```text
runTerminalMain
TERMINAL_ERROR_CODES
TERMINAL_EXIT_CODES
TERMINAL_MODEL_ENVIRONMENT_NAMES
```

renderer state、writer、Session selector、Node streams 和测试依赖均未从公共 barrel 导出。

## 5. 实际文件与依赖变更

### 5.1 新增生产文件

```text
cli/secode.ts
lib/terminal/application.ts
lib/terminal/arguments.ts
lib/terminal/bootstrap.ts
lib/terminal/environment.ts
lib/terminal/errors.ts
lib/terminal/event-renderer.ts
lib/terminal/index.ts
lib/terminal/node-io.ts
lib/terminal/schemas.ts
lib/terminal/session.ts
lib/terminal/text-safety.ts
lib/terminal/types.ts
lib/terminal/writer.ts
```

### 5.2 新增测试文件

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

### 5.3 修改文件

```text
package.json
pnpm-lock.yaml
docs/development/11-interactive-terminal-tasks.md
docs/development/11-interactive-terminal-summary.md
docs/development/README.md
```

`package.json` 只新增一个 `agent` script 和一个 `tsx` devDependency；lockfile 只增加 tsx/esbuild 正常传递依赖及 pnpm peer snapshot 更新。没有新增 Agent SDK、模型 SDK、CLI/TUI framework、dotenv 或网络库。

工作树中的阶段 07 Summary、阶段 08–10 文档/源码/测试和 `test-results/.last-run.json` 均为阶段 11 开始前已有内容，本阶段未覆盖、清理或据为己有。

## 6. 验证结果

### 6.1 实施前基线

```text
pnpm test
  Test Files  61 passed (61)
  Tests       533 passed (533)

pnpm lint
  通过，0 warning

pnpm typecheck
  通过

pnpm build
  Next.js 16.3.3 通过
```

### 6.2 Terminal 精确测试

```text
pnpm exec vitest run tests/unit/terminal tests/integration/terminal
  Test Files  13 passed (13)
  Tests       66 passed (66)
```

覆盖 Schema、argv、command、env、文本安全、全部事件、writer、Session、应用、审批、取消、Ctrl+C、bootstrap、公共 API、安全扫描、production Runtime/Context、工具和真实子进程。

### 6.3 全仓最终门禁

```text
pnpm test
  Test Files  74 passed (74)
  Tests       599 passed (599)

pnpm lint
  通过，0 warning

pnpm typecheck
  通过

pnpm build
  Next.js 16.3.3 / Turbopack production build 通过
  / 与 /_not-found 静态生成通过

pnpm agent -- --help
  exit 0；中文帮助通过

pnpm install --frozen-lockfile
  通过；lockfile 无变化

git diff --check
  通过
```

pnpm 在冻结安装时提示 `esbuild@0.28.2` 的 install script 被安全策略忽略；`pnpm exec tsx --version`、CLI help、单元/集成测试均能正常执行，因此未运行 `pnpm approve-builds`，也未增加批准范围外配置。

## 7. 开发中失败、原因与修正

### 7.1 基线并行负载超时

实施前把 test/lint/typecheck/build 并行运行时，既有 `runtime-limits` 一项测试超过 5 秒。未修改既有测试；目标文件单独复跑 5/5、完整测试顺序复跑 533/533，确认是并行资源竞争。后续门禁全部顺序执行。

### 7.2 pnpm 参数分隔符

初版 parser 把 `pnpm agent -- --help` 传入的首位 `--` 当作非法位置参数，CLI 以 2 退出。Task 明确固定了该命令，因此 parser 只剥离首位单个传输分隔符，并新增回归测试；真实命令随后 exit 0。

### 7.3 控制字符规格复核

初版把 CRLF 和裸 CR 都规范为 LF。对照批准 Spec 第 11.2 节后确认裸 CR 必须可见转义，修正为仅 CRLF → LF、裸 CR → `\\u000D`，并重跑文本、renderer、writer 测试。

### 7.4 completion reject 唤醒竞态

反思发现 completion observer 若在应用等待下一行时 reject，仅设置 closing 无法唤醒 pending input。新增独立 close signal 进入同一 `Promise.race`，fatal completion 能立即收口；补充“永不返回的 input + completion reject”测试，确认 exit 1 且不泄露私有 cause。

### 7.5 安全测试误报

首轮源码扫描用简单子串 `ink`，误命中 `thinking`；改为真实 package import 模式。非法 argv 子进程首轮经 pnpm script 启动，pnpm 自己在命令标题回显故意传入的假 secret；改用参数化 `pnpm exec tsx` 直接测试应用输出，确认 CLI 不回显 secret、stack 或 unhandled rejection。生产代码未因此放宽。

### 7.6 全仓审批集成同步竞态

Terminal 精确测试通过后，首轮全仓为 598/599：approval reject 轨迹的 1 秒等待在并行 fsync 负载下超时。单纯延长等待后仍暴露更准确原因：测试在“审批事件已经显示”时立刻输入 `/reject`，但该时刻可能早于应用保存 handle。同步条件改为同时确认 durable `approval.required`、终端输出和 `runtime.getActiveRun(...).pendingApproval`，再输入命令；测试保留完整断言并给该多轮 fsync 场景 10 秒总上限。目标 6/6、全仓 599/599 随后通过。

## 8. 手动测试方法

阶段 11 已证明入口和 fake-model 生产核心闭环。你可以手动检查 help、TTY setup 和命令交互；若配置真实 Key 并发送任务，会实际调用模型，结果应作为阶段 12 的正式验收素材，而不是本 Summary 的已完成结论。

### 8.1 无凭据安全检查

```zsh
pnpm agent -- --help
```

预期：输出中文用法、14 个环境变量名、六条命令和安全边界；exit 0，不创建 `.secode-data`。

非 TTY 失败关闭已由自动子进程测试覆盖；不要用 pipe 模式提交任务，因为首版只支持人类 TTY。

### 8.2 准备隔离的临时工作区

```zsh
SECODE_MANUAL_ROOT="$(mktemp -d /tmp/secode-manual.XXXXXX)"
mkdir -p "$SECODE_MANUAL_ROOT/workspace"
export SECODE_DATA_DIR="$SECODE_MANUAL_ROOT/data"
```

不要把真实项目作为第一次测试工作区。临时目录包含空格时始终给路径加双引号。

### 8.3 安全录入模型凭据

DeepSeek 示例（输入不会写入 shell history）：

```zsh
read -rs "DEEPSEEK_API_KEY?DeepSeek API Key: "
export DEEPSEEK_API_KEY
echo
```

LongCat/generic 还需按 help 设置对应 `BASE_URL` 与 `MODEL`。Key 只能通过环境变量提供，不能放在 argv、任务文本或 `/approve` reason 中。本应用不会自动读取 `.env`。

### 8.4 创建并操作 Session

```zsh
pnpm agent -- --workspace "$SECODE_MANUAL_ROOT/workspace" --model deepseek --title "手动测试"
```

进入后可依次输入：

```text
/help
/status
请先列出当前工作区文件并总结，不要安装依赖
/status
/cancel 手动验证取消
/exit
```

运行已经结束时 `/cancel` 会返回可恢复的 `TERMINAL_NO_ACTIVE_RUN`，终端仍保持可用。

若出现危险操作审批，首次人工测试优先：

```text
/reject 首次测试拒绝危险操作
```

只有在阶段 12 的受控临时项目中确认参数安全后才使用 `/approve`。Ctrl+C 在 active 时请求取消并保持终端；idle 时 Ctrl+C 以 130 退出。

### 8.5 恢复 Session

退出后重新运行：

```zsh
pnpm agent
```

在 setup 列表中输入 `r 1` 恢复最近 Session。若已知完整 UUID，也可：

```zsh
pnpm agent -- --session <完整 Session UUID>
```

恢复后先输入 `/status`，再提交一个只读任务，确认历史和固定 workspace/profile 保持一致。

### 8.6 测试结束

退出终端并取消导出凭据：

```zsh
unset DEEPSEEK_API_KEY LONGCAT_API_KEY OPENAI_COMPAT_API_KEY
```

临时目录由你确认不再需要后自行移除；本阶段实现和自动测试不会删除用户指定目录。

## 9. 规格一致性与安全核销

- Launch、Command、Frame/I/O、result 和错误码与 Task 第 5 节一致。
- help/setup/create/resume、六命令、Ctrl+C/EOF/exit code 均有测试。
- 工作区在 createSession 前 canonicalize；所有文件/工具/进程仍只经既有 Runtime。
- Session/JSONL 是唯一 durable 真相；Terminal 不持久化第二份 UI 状态。
- approval 每次重新读取 pending，不持有 authorization capability。
- model env 精确 14 项，dataDir 独立；无 dotenv、env dump 或 argv Key。
- renderer/writer 双层脱敏和控制字符转义；无 ANSI color、raw HTML 或 TUI。
- help/非法参数/非 TTY 均在 durable/network 初始化前短路。
- writer failure、completion reject、cancel、EOF 和 Ctrl+C 有界收口，无 unhandled rejection。
- package/lock 只有 tsx/script；生产源码无 child_process、shell、eval、动态代码或 Agent framework。
- 自动测试只使用 fake model、精确临时 workspace/data root 和参数化安全子进程。
- 未修改批准禁止路径，未读取 `.env*`，未调用真实模型或触碰真实项目。

## 10. 反思与已知限制

### 10.1 已达到

- 用户现在可在真实 TTY 中创建或恢复固定 Session，并观察 production Agent 的模型、工具、审批和终态事件。
- 输入在模型运行和审批等待时仍可响应 status、cancel、approve、reject 和 exit。
- 事件渲染既保留调试价值，又不暴露 reasoning、continuation、capability、raw arguments、stack/cause 或 secret。
- 核心可完全用 fake I/O/model 测试；真实 CLI 子进程可执行。

### 10.2 明确限制

- 阶段 11 没有正式调用 DeepSeek、LongCat 或 generic 端点；双模型结果属于阶段 12。
- setup 只提供文本序号选择，不提供原生目录选择器或配置文件。
- 只支持 human TTY，不支持 pipe、batch JSON、daemon、TUI 或多用户并发。
- 应用级路径/审批边界不是强操作系统沙箱，不能安全执行恶意模型生成的任意本机代码。
- Terminal 没有 diff 专用视图或 Markdown/ANSI 渲染；这些属于后续 Web UI。
- 本阶段没有 Route Handler、NDJSON、React 工作台或 Playwright 产品 E2E。
- pnpm 的 ignored esbuild build-script warning 保留原安全默认；当前平台已经存在可工作的 esbuild/tsx 二进制。

### 10.3 对阶段 12 的固定输入

若本 Summary 获批，阶段 12 观察应以当前终端入口为唯一人工核心测试界面，重点验证：

- 真实 DeepSeek 与 LongCat-compatible profile 各一次完整任务。
- read → edit → process/test → final 的真实临时 Git 项目闭环。
- approval allow/reject、cancel、恢复和模型错误的人类可操作性。
- 输出、JSONL 和命令日志无 Key/reasoning/control sequence。

阶段 12 如需改变命令、公共 terminal API、安全、退出语义或阶段 03–10 协议，必须重新走 Spec/Task 审批，不能在验收中顺手修改。

## 11. 用户审批项

请审阅并确认：

1. T11-00～T11-14 是否按已批准 Task 完成。
2. `pnpm agent` 的启动、Session、命令、审批、取消和恢复边界是否符合预期。
3. 终端文本、secret、环境、工作区、writer 和进程安全是否可以接受。
4. 66 项 terminal 测试和 599 项全仓测试是否足以作为阶段 11 自动验证证据。
5. 第 8 节手动测试步骤是否清晰且风险可控。
6. 是否批准本 Summary，并解锁阶段 12 的“观察 → Spec”步骤。

用户已于 2026-08-28 明确批准本 Summary。阶段 11 正式完成，仅解锁阶段 12 的只读观察与 Spec 编写；阶段 12 Task、开发修正、Route Handler 和 UI 仍需分别等待后续审批。
