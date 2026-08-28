# 阶段 12 Spec：终端测试与核心验收

## 1. 文档状态与审批链

- 当前状态：已批准
- 观察与生成日期：2026-08-28
- 前置流程：[00-process.md](./00-process.md)
- 前置需求：[01-requirements.md](./01-requirements.md)
- 已批准终端入口：[11-interactive-terminal-summary.md](./11-interactive-terminal-summary.md)
- 阶段 11 Summary 审批：用户于 2026-08-28 批准
- 当前允许：仅根据本 Spec 编写阶段 12 Task
- 当前禁止：Task 获批前创建验收夹具、调用真实模型、修改产品/测试代码、安装依赖或进入阶段 13

审批链：

```text
阶段 11 Summary（已批准）
  → 阶段 12 只读观察（已完成）
  → 本 Spec（已批准）
  → 阶段 12 Task（待生成）
  → 阶段 12 验收与受控修正（未开始）
  → 阶段 12 Summary（未生成）
```

只有用户明确批准本 Spec 后，才允许根据本文生成 Task。Task 再次获批前，仍不得运行正式真实模型验收、创建或修改测试夹具、修正代码。

## 2. 阶段目标

以阶段 11 已批准的 `pnpm agent` 人类交互终端为唯一人工入口，对阶段 03–11 的核心能力进行正式验收，形成从配置、模型调用、工具执行到恢复和审计的可追溯证据。

本阶段必须回答六个问题：

1. DeepSeek 和用户提供的 LongCat OpenAI-compatible 端点能否分别通过生产 ModelClient 完成真实流式响应与工具调用。
2. 六个本地工具能否在受控临时工作区中完成读取、搜索、创建、哈希保护替换和进程验证。
3. Agent 能否独立完成“观察/定位 → 看到失败 → 最小修改 → 再验证 → 最终总结”的真实临时 Git 项目闭环。
4. 审批允许、审批拒绝、运行取消、Session 恢复和结构化错误是否在人类终端中可操作、可理解且保持单一 durable 事实源。
5. 终端输出和 JSONL 是否不包含 API Key、Authorization、私有 reasoning、capability、控制序列或未批准的环境内容。
6. 真实验收暴露的问题究竟属于环境、模型行为、既有实现缺陷还是规格缺口，并能否在审批边界内修正。

阶段 12 是验收与缺陷收敛阶段，不增加产品功能。阶段 12 Summary 获批前，不得开始 Next.js Route Handlers 或 UI。

## 3. 需求追踪

| 需求 | 本阶段验收内容 | 主要证据 |
| --- | --- | --- |
| FR-001 | 绝对路径创建固定工作区 Session | 临时工作区 metadata、终端创建事件 |
| FR-002 | 人工提交自然语言任务 | `user.message`、`run.started`、终态 |
| FR-003 | 六工具通过真实 Agent 工具调用执行 | 六工具逐项事件与结果矩阵 |
| FR-004 | 真实模型—工具—结果反馈循环直至完成 | DeepSeek/LongCat 冒烟；核心修复闭环 |
| FR-005 | 终端可看到公开模型、工具、错误和状态 | 人工可读性检查；Web 展示仍留阶段 14 |
| FR-006 | 高风险操作暂停并允许/拒绝 | `approval.required/resolved` 两条轨迹 |
| FR-007 | `/cancel` 或 Ctrl+C 取消活动运行 | `run.cancelled`、子进程收口、后续可交互 |
| FR-008 | 退出后恢复 Session 和历史 | 同一 Session UUID 的重启恢复轨迹 |
| FR-009 | DeepSeek 与 LongCat profile 均可接入 | 两个生产 profile 的真实端点结果 |
| FR-010 | 压缩事件可恢复且原始 JSONL 保留 | 确定性 compaction 轨迹与存储检查 |
| NFR-001 | Node/Next 工程仍可构建 | Node/pnpm 版本、`pnpm build` |
| NFR-002 | 所有外部输入保持运行时校验 | 非法配置/工具参数既有测试与回归 |
| NFR-003 | 模型、工具和终端失败结构化 | 失败分类、错误码和恢复行为 |
| NFR-004 | 30 轮和 10 分钟限制不被入口覆盖 | `/status`、事件和源码/回归证据 |
| NFR-005 | 120 秒模型超时和有限工具输出保持有效 | 既有边界测试、真实输出元数据 |
| NFR-006 | 核心继续独立于 Web/React | 仅使用 CLI 与 Node 测试 |
| NFR-008 | 观察、Spec、Task、Summary 和真实结果可追踪 | 本文、后续 Task/Summary |
| SEC-001/002 | 穿越、绝对路径和 symlink 逃逸继续失败关闭 | 临时 sentinel/链接场景与既有测试 |
| SEC-003 | `run_process` 继续使用参数化 spawn、无 shell 默认 | 进程事件和源码/回归检查 |
| SEC-004 | 明显破坏性操作直接拒绝 | 风险策略精确测试；不以真实破坏命令试错 |
| SEC-005 | 未知程序需审批，验证命令自动允许 | `node --version` 审批；`pnpm test` 自动执行 |
| SEC-006 | Key 只进服务端进程且不进输出/JSONL | 模式扫描与同值扫描只报告计数 |
| SEC-007 | 覆盖/替换使用读取时 SHA-256 | `read_file → replace_in_file` 事件链 |
| SEC-008 | 继续声明可信本地单用户应用级边界 | help、验收说明和 Summary |
| COM-001–003 | 不使用 Agent 框架或托管工具，核心逻辑仍自研 | 依赖、import、源码与运行路径审计 |
| COM-004 | 凭据不进入仓库、文档或演示素材 | Git/文档/临时证据扫描 |

FR-005 的最终浏览器验收、NFR-007、Playwright 产品 E2E 和页面刷新恢复属于阶段 14，不在本阶段提前完成。

## 4. 只读观察范围与方法

### 4.1 已阅读的批准依据

- 阶段 00 的三级审批、终端优先顺序和变更回退规则。
- 阶段 01 的 FR/NFR/SEC/COM、可信本地单用户边界和最终验收定义。
- 阶段 03–10 中与真实事件、模型兼容、工作区、工具、审批、JSONL、Runtime 和 Context 相关的已批准约束。
- 阶段 11 Spec、Task、Summary 中固定的 TTY、Session、命令、环境、事件、取消、退出和阶段 12 输入。
- DeepSeek 官方 Chat Completions/tool calls 文档与 LongCat 官方仓库中已由阶段 04 采用的兼容性事实；不新增未经验证的厂商协议假设。

### 4.2 已检查的实现

- `cli/secode.ts` 和 `lib/terminal/**` 的 production bootstrap、命令、Session、renderer、writer 与退出路径。
- `lib/model/config.ts` 的 DeepSeek 默认项、LongCat/generic 可配置项和 URL 安全规则。
- `lib/context/system-prompt.ts` 的“先观察、最小修改、真实验证、不得虚构”策略。
- `lib/tools/**` 的六工具 Schema、哈希写入、输出限制和敏感路径规则。
- `lib/approval/process-policy.ts` 的自动允许、要求审批和直接拒绝分类。
- `lib/agent/**` 的 30 轮、10 分钟、连续三次相同工具错误和取消语义。
- `lib/storage/**` 的 Session metadata、`events.jsonl`、尾行恢复和分页读取。
- 终端单元/集成测试和当前 package scripts。

### 4.3 实际执行的只读命令

```text
pnpm exec vitest run tests/unit/terminal tests/integration/terminal
  Test Files  13 passed (13)
  Tests       66 passed (66)

pnpm lint
  通过，0 warning

pnpm typecheck
  通过

node --version
  v24.15.0

pnpm --version
  10.33.3
```

没有运行 build、真实模型、文件工具或用户项目；没有创建测试目录、安装依赖或修改业务代码。

### 4.4 环境观察

当前 Codex 进程未配置 DeepSeek、LongCat 或 generic 的模型环境变量。用户在独立终端中临时 `export` 的变量不会自动进入 Codex 进程，这是进程隔离的正常表现，不是产品缺陷。

用户在本阶段开始前报告：更换有效 DeepSeek API Key 后已经能够进入正常终端测试；此前无效 Key 被稳定映射为 `MODEL_AUTH_ERROR`。该报告用于识别现实使用路径，但不替代本阶段获批后在受控工作区产生的正式验收证据。

LongCat 的 endpoint、model ID 和可能需要的 Key 当前没有可由仓库安全推断的值。它们必须由用户在阶段 12 Task 执行时提供；仓库不得写死或代替用户选择第三方网关。

## 5. 当前事实与验收缺口

### 5.1 已经成立的事实

1. 生产终端可执行，支持创建/恢复 Session、自然语言任务、六命令和完整公开事件渲染。
2. fake ModelClient + production Store/Context/Runtime/Terminal 的 66 项终端测试通过。
3. 模型层已有 DeepSeek/LongCat/generic profile、原生 fetch、SSE、重试、超时、工具参数 string/object 归一化和 reasoning 隔离。
4. 六工具、工作区和审批策略已经有精确单元/集成测试。
5. JSONL 是唯一 durable 事实源，Terminal 不维护第二套任务真相。
6. 终端只支持人类 TTY；普通 stdin pipe 被明确拒绝。

### 5.2 尚未形成的正式证据

1. 没有受控、可审计的真实 DeepSeek 完整工具回合记录。
2. 没有真实 LongCat-compatible endpoint 的终端工具调用记录。
3. 没有一个真实模型在临时 Git 项目中完成失败测试到通过测试的完整记录。
4. 六工具虽有自动测试，但尚无统一人工逐项验收矩阵。
5. approval allow/reject、cancel、resume 的真实模型人类操作尚未形成 Summary 证据。
6. 真实终端/JSONL 的 Key、reasoning 和控制字符零泄漏尚未正式核销。
7. context compaction 已有确定性集成测试，但还需要在终端入口确认事件可见性和恢复行为。

### 5.3 本阶段成功不等于最终产品完成

本阶段只证明核心 Agent 经终端可用。它不证明 HTTP 流、浏览器状态、Markdown 安全渲染、响应式布局或 Playwright 产品流程；这些仍由阶段 13–14负责。

## 6. 范围

### 6.1 范围内

- 重跑全部既有核心与终端自动测试。
- 使用隔离临时目录建立无第三方依赖的最小 Git 测试项目。
- 通过 `pnpm agent` 正式测试 DeepSeek 和 LongCat-compatible profile。
- 人工逐项测试六工具、审批允许/拒绝、取消、恢复和终端状态。
- 至少一个真实 profile 完成完整代码修复闭环。
- 以确定性场景检查 `context.compacted` 的终端可见性和恢复。
- 对终端输出、JSONL、文档和 Git diff 做秘密/私有状态/控制字符审计。
- 对发现的问题进行分类，按已批准流程提出或实施受控修正。
- 最终执行 test、lint、typecheck、build、CLI help、冻结安装和 diff 检查。

### 6.2 范围外

- Next.js Route Handler、NDJSON、Server Action、页面或 React 组件。
- Playwright 产品 E2E；只保留现有页面基线，不把它作为阶段 12 核心证据。
- 自动下载、部署或启动 LongCat 权重、SGLang、vLLM 或云端网关。
- 购买额度、创建厂商账户、替用户生成/保存/轮换 API Key。
- 在真实用户项目、SEcode 仓库自身或非临时目录中让 Agent 写代码。
- 安装依赖、Git commit/push、迁移、格式化全仓库或发布。
- 为通过测试放宽工作区、审批、secret、reasoning 或错误边界。
- 增加 batch/pipe CLI、TUI、daemon、多 Agent 或新的产品工具。
- 把模型偶发不遵循提示直接包装成未经批准的新公共协议。

## 7. 验收原则

1. **生产路径唯一**：人工场景必须从 `pnpm agent` 进入，不直接调用 ModelClient、Runtime、工具或 EventStore 绕过终端。
2. **临时工作区唯一**：所有写入、进程和 Git 场景只能发生在本次创建并记录的临时根目录中。
3. **一场景一结论**：六工具、审批、取消、恢复、双模型和修复闭环分别记录，不能以一次模糊对话替代全部能力。
4. **事件优于口头总结**：成功必须有 `tool.requested/started/result`、approval 或 run terminal 事件；模型声称“已完成”不算证据。
5. **真实失败不隐藏**：初次失败、重试、模型偏离、环境缺失和人工误操作都记录原始分类，不通过删日志或只展示最终成功来掩盖。
6. **不强求模型犯错**：完整闭环要求观察到失败基线并最终通过；不故意诱导模型产生错误修改。若自然出现中间失败，记录其自我修正能力。
7. **成本有界**：真实 provider 不用来制造超长上下文、重复压测或模糊重试；确定性边界优先使用已有自动测试或受控兼容端点。
8. **审批最小化**：只批准已经完整显示且在临时工作区内无破坏的命令；原因中不放 Key、路径秘密或外部 token。

## 8. 外部前置条件与凭据规则

### 8.1 DeepSeek

正式执行需要：

- `DEEPSEEK_API_KEY`：用户在当前 TTY shell 中安全输入。
- 可选 `DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`、`DEEPSEEK_CONTEXT_WINDOW`：不设置时使用已批准默认值。

Key 只能通过不回显的 shell 输入进入环境，不放入 argv、任务 prompt、approval reason、`.env*`、测试文件、文档或终端截图。

### 8.2 LongCat-compatible

正式执行至少需要：

- `LONGCAT_BASE_URL`：用户确认的 OpenAI-compatible base URL。
- `LONGCAT_MODEL`：该端点接受的模型 ID。
- `LONGCAT_API_KEY`：端点要求鉴权时提供；本机无鉴权端点可缺省。
- 可选 `LONGCAT_CONTEXT_WINDOW` 和严格布尔 `LONGCAT_SUPPORTS_THINKING`。

非 loopback HTTP 地址必须被配置层拒绝；远端必须使用 HTTPS。base URL 不能包含 username、password、query 或 fragment。

### 8.3 可用性门禁

每个真实 profile 在运行前只输出以下脱敏信息：

```text
profileId
configured: true/false
provider
model
supportsThinking
```

不得输出 Key、Authorization、完整环境对象或带凭据 URL。

若用户不能提供 LongCat-compatible endpoint，本阶段可继续完成不依赖 LongCat 的工作，但 LongCat 场景状态必须记为 `blocked_external`，阶段 12 Summary 不能宣称双模型验收通过，也不能据此解锁阶段 13。

## 9. 临时 Git 项目规格

### 9.1 隔离结构

Task 获批后，为每次正式验收创建新的系统临时目录：

```text
<temp-root>/
  workspace/          # Agent 唯一工作区
    package.json
    README.md
    src/
    tests/
    notes/
    escape-link       # 可选，指向 workspace 外 sentinel
    .git/
  outside/
    sentinel.txt
  data/               # SECODE_DATA_DIR，必须在 workspace 外
```

要求：

- `<temp-root>` 必须由系统临时目录 API/`mktemp -d` 创建，不复用旧路径。
- `data` 不得位于 workspace 内，避免工具或 Git 把事件日志当项目文件。
- fixture 不安装依赖，只使用 Node 内置 `node:test`。
- 初始文件由操作者创建并完成一次 Git 基线提交；Agent 不执行 commit。
- 测试结束前保留临时目录供审计；用户批准 Summary 后再由用户决定是否移除。
- 文档只记录 `<temp-root>` 占位符和相对路径，不提交真实绝对路径。

### 9.2 缺陷项目

fixture 提供一个小型、确定性的纯 JavaScript 模块，例如字符串 slug 规范化：

- `README.md` 明确行为：去除两端空白、连续空白折叠为一个 `-`、转小写。
- `src/slug.mjs` 包含一个能通过简单输入、不能通过连续/边界空白的实现。
- `tests/slug.test.mjs` 同时覆盖简单输入和缺陷输入。
- `package.json` 只提供 `test` 与受控 `slow` 两个 script。
- 源码包含一个唯一搜索标记，便于验证 `search_text`。

初始 `pnpm test` 必须确定性失败；正确最小修复后必须确定性通过。fixture 自身在 Task 文档中给出精确内容与基线 SHA-256，避免执行时临时设计测试答案。

### 9.3 安全进程

- 自动允许成功场景：`pnpm test`、`git status --short`、`git diff --check`。
- 审批场景：`node --version`，参数完整展示后可批准或拒绝。
- 取消场景：`pnpm run slow`，脚本只启动一个 60 秒无副作用计时进程；批准后立即取消。
- 禁止真实执行安装、删除、shell payload、Git 写入、权限提升或系统控制。

## 10. 正式验收场景

### A12-01：基线与 profile 预检

1. 记录 Git 状态、Node/pnpm 版本和既有测试数量。
2. 确认临时 workspace/data 均 canonical 且互不包含。
3. 只检查 profile 脱敏快照和 required env 是否存在。
4. `pnpm agent -- --help` 必须不需要 Key、不创建 Session、退出 0。

通过条件：环境事实明确，无 secret 输出，无真实模型调用副作用。

### A12-02：DeepSeek 真实冒烟

使用全新 Session，提交一个只读且强制工具事实的任务：列出目录、读取指定小文件并依据内容回答。

必须观察：

```text
run.started
model.requested
tool.requested(list_directory/read_file 中至少一个)
tool.started
tool.result(ok=true)
model.requested（工具反馈后的下一轮）
assistant.message
run.completed
```

只有文字回答、没有实际工具事件，不算工具冒烟通过。最多允许一次相同 prompt 的受控重试；再次无工具调用记为 provider/model behavior failure，不无限改写提示。

### A12-03：LongCat-compatible 真实冒烟

使用独立 Session 和相同只读目标，要求至少一个真实工具回合与最终回答。验证重点：

- `/chat/completions` 路径拼接正确。
- 流式文本和终态可解析。
- tool arguments 无论厂商返回 JSON 字符串或对象都能归一化。
- tool call ID 能正确关联 tool result。
- reasoning 若存在不进入终端或 JSONL 公共字段。

缺少用户端点时标记 `blocked_external`，不得用 generic fake 或 DeepSeek 结果冒充 LongCat 通过。

### A12-04：六工具逐项验收

在一个专用 Session 中逐个提交窄任务，等待每次 run 终止后再开始下一项：

| 工具 | 动作 | 必须证据 |
| --- | --- | --- |
| `list_directory` | 有界列出 fixture | path/depth/数量元数据 |
| `read_file` | 读取 `src/slug.mjs` | 内容、行范围和 SHA-256 |
| `search_text` | 搜索唯一标记 | 精确相对路径和匹配行 |
| `write_file` | 创建 `notes/created.txt` | `operation=create`、`changed=true` |
| `replace_in_file` | 先读哈希，再唯一替换 notes 内容 | 前后 SHA、`replacedOccurrences=1` |
| `run_process` | 执行 `pnpm test` 或只读 Git | exit code、输出和未超时 |

每项必须看到真实 tool event，且除声明文件外没有额外 diff。模型选择了等价但不同工具时，该工具项仍未通过，应以更窄 prompt 重试一次。

### A12-05：真实修复闭环

使用全新的 fixture 副本和真实 profile，任务明确要求：

1. 先阅读需求和测试，不安装依赖。
2. 运行测试建立失败事实。
3. 定位根因并作最小修改。
4. 再次运行测试；若仍失败，基于真实错误继续修正。
5. 运行 `git diff --check` 并总结变更、验证与限制。
6. 不提交 Git、不删除测试、不降低断言。

通过条件：

- 初始测试非零且失败原因与 fixture 预期一致。
- 修改只触及预期源码；测试和需求文件不被弱化。
- 最终测试 exit 0，`git diff --check` exit 0。
- 最终回答与 durable 工具事实一致，不虚构命令或结果。
- 至少包含一次读取、一次工作区写入和一次验证进程。

如果 DeepSeek 和 LongCat 均可用，完整闭环至少由其中一个完成；另一个仍必须完成 A12-02/03 的真实工具冒烟。

### A12-06：审批拒绝与批准

使用无副作用的 `node --version` 作为未知程序：

1. 第一次在 `approval.required` 后输入 `/reject 人工验收拒绝`。
2. 确认没有对应 `tool.started`，模型收到结构化拒绝并安全结束。
3. 第二次重新请求；检查完整参数后输入 `/approve 已确认只读取版本`。
4. 确认本次才出现 `tool.started/result` 且 exit 0。

批准不能复用于下一次调用，终端不能缓存 capability。

### A12-07：取消和进程收口

请求 `pnpm run slow`，批准精确参数，在 `tool.started` 后立即执行 `/cancel 人工验收取消`。必须确认：

- 唯一终态是 `run.cancelled`。
- 子进程收到终止，不在后台继续。
- `/status` 不再显示 active run。
- 同一终端仍可提交后续只读任务。

可另用 active Ctrl+C 验证相同语义；不得用系统 `kill` 命令作为测试步骤。

### A12-08：Session 退出与恢复

1. 完成至少一个有工具结果的 run 后 `/exit`。
2. 用完整 UUID 或 setup `r N` 在同一 data root 恢复。
3. `/status` 确认 idle，提交一个依赖既有文件事实的只读任务。
4. 核对 Session 固定 workspace/profile 未变化，事件 seq 单调递增且无重复。

若退出时存在 active run，应先验证取消终态，再恢复；不能依靠进程残留继续执行。

### A12-09：工作区与敏感路径保护

在临时根中建立 workspace 外 sentinel 和指向它的 symlink。验证：

- `list_directory` 对逃逸链接显示 blocked/symlink，不递归进入。
- 对 `../outside/sentinel.txt`、绝对路径、链接逃逸和 `.git/**` 的读取失败关闭。
- workspace 外 sentinel 的 hash/mtime/内容不变。
- `.env`、私钥后缀和 `.secode-data` 不通过文件内容工具暴露。

优先使用现有确定性测试直接触发参数；不要求真实模型违反系统提示。如果模型主动拒绝危险请求，只能证明模型行为，不能替代安全层回归测试。

### A12-10：上下文压缩可见性

必须至少取得一次真实 Terminal renderer 的 `context.compacted` 输出，并在恢复后确认历史仍可使用。为控制成本，可选择：

1. 一个受控本机 OpenAI-compatible 测试端点；或
2. 用户同意的真实 profile，临时降低该 Session 启动进程中的 context-window 配置，并使用有限的重复小回合触发。

该场景不得修改生产 compaction 阈值、最近 8 回合或摘要协议。Task 必须给出确定性输入、最大回合数和停止条件；若硬保留集超预算，应记为真实失败而不是继续扩大调用。

同时重跑既有 production Store/Context/Runtime/Terminal compaction 集成测试，后者是算法正确性的权威证据；人工场景只验证入口可见性和恢复可操作性。

### A12-11：模型与终端错误

不故意撤销或暴露真实 Key。使用既有自动测试验证 401/429/5xx、超时、非法 SSE、非法工具参数和未知工具；正式真实端点若自然出现错误，则记录：

- public error code/message；
- provider/profile 与发生时间；
- 是否按已批准规则重试；
- 终端是否仍可继续或要求重启；
- 输出是否无响应头、Key、stack/cause 和私有 body。

真实 provider 的偶发 429/5xx 不通过无限重试掩盖；达到 client 既有限制后按失败记录。

### A12-12：秘密、reasoning 与控制字符审计

审计范围：

- 人工终端可见输出或经人工脱敏的临时 transcript。
- `<temp-root>/data/**/session.json` 和 `events.jsonl`。
- fixture Git diff。
- 阶段 12 文档与新增测试源码。

检查：

- Bearer、`sk-`、`*_API_KEY=` 和已知 Key 同值匹配数量均为 0。
- `reasoning_content`、continuation payload、opaque approval/capability 不出现。
- ESC/OSC/C0/C1 不以原始控制字节进入记录或终端。
- stack、cause、完整环境对象和真实绝对用户路径不进入提交文档。

扫描命令只输出文件名、规则和匹配计数；禁止输出疑似 secret 的原始匹配行。发现真实泄漏必须立即停止、撤销相关 Key、保留脱敏证据并回到相应安全 Spec。

### A12-13：全仓回归和最终门禁

顺序执行，避免阶段 11 已发现的并行资源竞争：

```text
pnpm exec vitest run tests/unit/terminal tests/integration/terminal
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm agent -- --help
pnpm install --frozen-lockfile
git diff --check
```

要求：无永久 skip、无降低断言、lint 0 warning、lockfile 不变化、无后台 Agent/fixture 进程和仓库内数据目录残留。

## 11. 验收证据模型

每个场景在 Summary 中记录一行结构化结果：

| 字段 | 规则 |
| --- | --- |
| `scenario` | 固定 A12-01～A12-13 |
| `status` | `passed` / `failed` / `blocked_external` / `not_run` |
| `profile` | deepseek/longcat/generic/none |
| `session` | 只记录短 ID，不记录 data 绝对路径 |
| `run` | 只记录短 ID |
| `events` | 关键 event type 顺序，不粘贴全部 JSONL |
| `changedPaths` | 仅 workspace-relative 路径 |
| `verification` | program、参数摘要、exit code、是否超时 |
| `approval` | required/approved/rejected/none；不记录 capability |
| `result` | 有限中文结论和公开错误码 |

规则：

- `blocked_external` 只用于凭据、额度、网络、LongCat endpoint 等仓库不能提供的外部条件。
- 模型没有按窄 prompt 使用工具属于 `failed` 或 provider behavior，不归入 `blocked_external`。
- 未执行的场景必须是 `not_run`，不能从既有单元测试推断为人工通过。
- 自动测试和人工证据分列，不能把 fake model 结果写成真实 provider 结果。
- 原始 transcript 默认不提交；必要片段先经 secret/control/路径脱敏后再写入 Summary。

## 12. 通过标准

阶段 12 Summary 可以提交审批的最低条件：

- [ ] A12-01 基线与 profile 预检通过。
- [ ] DeepSeek 真实工具冒烟通过。
- [ ] LongCat-compatible 真实工具冒烟通过；或明确 `blocked_external` 并停止阶段完成声明。
- [ ] 六工具每项至少一条成功事件链。
- [ ] 至少一个真实模型完成临时 Git 项目失败基线到最终通过的闭环。
- [ ] approval reject/approve 均通过且 authorization 不复用。
- [ ] `/cancel` 或 active Ctrl+C 产生唯一 cancelled 终态并终止子进程。
- [ ] Session 恢复保持 workspace/profile/seq 一致。
- [ ] 工作区逃逸和敏感路径确定性测试通过，outside sentinel 不变。
- [ ] compaction 的算法回归通过，Terminal 至少一次可见并可恢复。
- [ ] 模型错误和非法工具路径的既有自动测试通过。
- [ ] secret/reasoning/capability/control 审计零泄漏。
- [ ] 全仓 test/lint/typecheck/build/help/frozen install/diff check 通过。
- [ ] 所有失败、重试、修正和外部阻塞均如实写入 Summary。

阶段 12 正式完成并解锁阶段 13 的条件更严格：以上必选项必须全部通过，不能保留 `failed`、`blocked_external` 或关键 `not_run`。若 LongCat 外部条件缺失，Summary 可以作为进度文档提交审阅，但用户不能把阶段 12 批准为完成。

## 13. 失败分类与诊断顺序

出现失败时固定按以下顺序诊断：

```text
复现并记录公开事件
  → 检查 fixture/命令/人工输入
  → 检查 profile 脱敏配置和 endpoint 可达性
  → 区分 provider 响应与本地解析
  → 区分模型决策与工具执行
  → 检查 durable JSONL 与终端投影是否一致
  → 最小化为自动回归测试
  → 按变更级别决定 Task 修订或 Spec 回退
```

分类：

1. **外部环境**：Key 无效、余额、网络、endpoint 未提供、服务不可用。记录 `blocked_external` 或 provider error，不改代码规避。
2. **人工/fixture**：变量只在另一个 shell、路径变量为空、测试夹具内容错误。修正操作步骤并重新建立全新 fixture，不改产品行为。
3. **模型行为**：模型不调用工具、调用参数错误但本地正确反馈、任务质量不稳定。最多一次等价重试；需要改变 system prompt 时视为 Context 规格变化。
4. **实现符合性缺陷**：已批准行为明确，但代码实现偏离。先写最小回归测试，再按 Task 精确白名单修复。
5. **规格缺口/公共语义变化**：需要新增事件、错误码、命令、工具参数、权限、持久化字段或模型协议。立即停止，回到所属阶段 Spec 重新审批。

不得以扩大超时、提高轮数、禁用安全检查、手工改 JSONL、删除失败测试或换用未声明模型来制造通过结果。

## 14. 修正与重新审批边界

### 14.1 可在阶段 12 Task 中预先批准的工作

- 创建阶段 12 的确定性临时 fixture 说明或 test-only helper。
- 增加不依赖真实网络/Key 的回归测试。
- 更新阶段 12 Task、Summary 和开发索引。
- 对观察时已经明确、且不改变已批准公共语义的局部终端缺陷列出精确文件后修复。

### 14.2 必须先修订阶段 12 Task

- 验收中新发现的实现缺陷需要修改未列入 Task 的 `lib/terminal/**` 或测试文件。
- 需要调整 fixture、验收顺序、测试 helper 或文档证据格式，但不改变产品公共行为。
- 需要增加新的 test-only 本机兼容端点用于确定性 compaction 展示。

### 14.3 必须回到所属 Spec

- `lib/model/**`：提供方协议、重试、超时、reasoning、工具 ID/arguments 或公共错误变化。
- `lib/workspace/**`、`lib/tools/**`、`lib/approval/**`：路径、工具 Schema、写入语义、风险或授权变化。
- `lib/storage/**`：JSONL 格式、恢复、seq、事件大小或 durable 语义变化。
- `lib/agent/**`、`lib/context/**`：循环、终止、压缩、系统提示、回合投影或公共 API 变化。
- `lib/domain/**`：事件、Schema、错误或协议版本变化。
- CLI 新命令、非 TTY 协议、退出语义、自动 `.env` 加载或 argv Key。

回退到旧阶段 Spec 后，当前阶段 12 Task 审批失效；完成相应修订链后再回到阶段 12。

## 15. 安全约束

1. 真实 Key 只存在于用户当前 shell 和 ModelClient 内存；不由 Codex读取、复制或保存。
2. 不使用 `curl -v`、HTTP debug logger、环境 dump、shell tracing 或会显示 Authorization 的工具。
3. 真实模型 subprocess 继承只允许的模型变量；Agent 发起的 `run_process` 继续剥离 Key/token/secret/password 环境。
4. data root 与 workspace 分离，均位于明确临时根；不使用 SEcode 仓库或真实业务项目。
5. 任何审批只针对当前显示的 invocation，先核对 program、args、cwd，再作决定。
6. 不批准安装、删除、shell、Git 写入、迁移、格式化、下载运行器或路径限定未知程序。
7. 直接拒绝策略由自动测试验证，不用真实系统破坏命令做手工探测。
8. fixture 外 sentinel 在前后分别取 hash/mtime，证明没有逃逸副作用。
9. 原始 JSONL 只在临时目录保存到 Summary 审批结束；不得提交包含对话内容的真实 session data。
10. 如发现 secret 泄漏，立即停止测试并提醒用户撤销凭据；修复和重新验证必须重新审批。

## 16. 兼容性与质量约束

- 支持仓库声明的 Node `>=20.9.0` 和 pnpm 10；本机观察版本为 Node 24.15.0、pnpm 10.33.3。
- DeepSeek 使用当前已批准默认 profile，但 model ID 仍允许由用户环境覆盖。
- LongCat 只要求用户端点满足已批准的 OpenAI-compatible Chat Completions 子集，不假设统一云端地址。
- 真实 provider 的网络延迟、额度和输出不确定性不能进入自动单元测试。
- 自动测试必须继续使用 fake server/model、临时工作区和确定性时钟/UUID；不能读取真实环境 Key。
- 终端代码继续保持 Node-only；本阶段不读取 Next 本地指南，因为不编写 Next.js 代码。阶段 13 开始前再按 `AGENTS.md` 阅读 `node_modules/next/dist/docs/`。
- 不新增 Agent、模型、CLI、dotenv、日志或 HTTP 依赖。
- 不增加 permanent retry、sleep、snapshot 更新或模糊时间等待来隐藏竞态。

## 17. 建议文件边界

本 Spec 阶段只实际新增/修改：

```text
docs/development/12-terminal-core-acceptance-spec.md
docs/development/README.md
```

Spec 获批后的 Task 可规划但必须精确列出：

```text
docs/development/12-terminal-core-acceptance-tasks.md
docs/development/12-terminal-core-acceptance-summary.md
docs/development/12-terminal-core-acceptance-spec.md
docs/development/README.md
tests/integration/terminal/**          # 仅确定性验收/回归需要时
tests/manual/**                        # 仅 test-only fixture/helper 获批时
lib/terminal/**                        # 仅已确认且不改公共语义的缺陷
```

默认禁止：

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
package.json
pnpm-lock.yaml
next.config.ts
tsconfig.json
vitest.config.ts
eslint.config.mjs
.env*
.gitignore
```

需要修改默认禁止路径时，按第 14 节停止并重新审批，不得在 Task 中用通配符预授权未知核心修正。

## 18. Task 应采用的依赖顺序

本阶段尚不生成 Task。Spec 获批后，Task 应把工作拆成可单独停止的顺序：

```text
基线与证据模板
  → 确定性临时 fixture 和安全检查
  → 无真实 Key 的自动回归
  → DeepSeek profile 预检与真实冒烟
  → LongCat profile 预检与真实冒烟
  → 六工具逐项人工验收
  → 完整修复闭环
  → approval/cancel/resume
  → compaction 可见性
  → secret/reasoning/control 审计
  → 缺陷最小化与审批内修正（若有）
  → 全仓顺序门禁
  → Summary 与用户审批
```

Task 必须为每项写明输入、命令、人工动作、最大真实模型调用次数、停止条件、证据和允许文件；不能把“发现问题后自由修复”作为任务。

## 19. 风险与应对

### 19.1 LongCat 外部端点不可用

仓库不能推断或创建用户端点。应对：在正式测试前设置外部门禁；缺失时完成其他证据但阶段不宣称完成，也不以 generic/DeepSeek 冒充。

### 19.2 真实模型输出非确定

同一 prompt 可能不用工具或采取不同路径。应对：prompt 窄化、每项最多一次等价重试、以事件为证；重复偏离如实记录为兼容/模型行为问题。

### 19.3 真实调用成本与长上下文

反复制造 compaction 会放大 token 成本。应对：双模型只做最小真实冒烟；完整闭环至少一个 provider；compaction 优先受控本机兼容端点并设置最大回合数。

### 19.4 人工审批误操作

终端允许用户批准未知程序。应对：fixture 只设计无副作用高风险命令，Task 给出精确预期参数；出现任何偏差默认 `/reject`。

### 19.5 TTY 无法普通管道自动化

这是阶段 11 已批准边界。应对：人工场景由用户操作；确定性逻辑由 Vitest 覆盖。不得为方便验收增加未审批 batch 协议。

### 19.6 临时证据包含隐私

Terminal、JSONL 可能含任务文本、工作区绝对路径或厂商错误。应对：原件仅留临时目录，Summary 只写相对路径、短 ID、有限公开错误和脱敏片段。

### 19.7 验收中发现核心缺陷

修复可能跨越旧阶段边界。应对：先最小化和分类，再走 Task 修订或旧 Spec 回退；不能因截止时间临近而跳过审批。

### 19.8 Provider 临时故障造成假失败

401、402、429、5xx 含义不同。应对：记录 HTTP 对应 public error 和 client 已执行的有限重试；只有凭据/余额/网络等归为外部阻塞，解析或状态机不一致仍算实现失败。

## 20. 对阶段 13 的固定影响

阶段 12 Summary 获批后，阶段 13 才可开始 Route Handler 的只读观察与 Spec：

- HTTP 层只装配已通过终端验收的 Store/Model/Context/Runtime，不复制 Agent 循环。
- NDJSON 事件映射必须以阶段 12 已核销的公开 AgentEvent 为基础。
- API 取消、审批和 Session 恢复必须复用相同 Runtime 语义。
- Web 环境读取可使用 Next.js 服务端环境机制，但不得把 Key 放进客户端配置。
- 阶段 12 中未解决的 provider/core defect 不得推迟到 Route Handler 或 UI 层修补。
- 阶段 13 写任何 Next.js 代码前，必须按仓库 `AGENTS.md` 先阅读对应 `node_modules/next/dist/docs/` 指南。

## 21. 本次审批需确认的设计决策

用户批准本 Spec 即确认：

1. 阶段 12 使用 `pnpm agent` 作为唯一人工验收入口，不新增 batch CLI。
2. 所有写入和进程测试只在独立临时 Git 项目中进行，data root 位于 workspace 外。
3. DeepSeek 与 LongCat-compatible 都必须完成真实工具冒烟，LongCat 端点由用户提供。
4. 完整修复闭环至少由一个真实 profile 完成，另一个仍需完成最小工具回合。
5. 六工具、审批、取消、恢复、compaction 和安全审计分别验收，不以模型最终文字代替事件证据。
6. 不故意诱导模型做错误修改；初始失败基线到最终通过即可证明修复闭环。
7. 真实 profile 最多进行有界重试和调用，不为压缩/稳定性做无界成本测试。
8. LongCat 缺失记为外部阻塞，不能批准阶段 12 完成或进入阶段 13。
9. 核心公共语义缺陷必须回到所属 Spec；阶段 12 只可修正 Task 精确批准的符合性缺陷。
10. 不安装依赖、不修改真实项目、不自动 Git commit/push、不提交原始会话或凭据。
11. 全部结果使用 `passed/failed/blocked_external/not_run` 明确记录。
12. 阶段 12 Summary 获批前继续禁止 Route Handler 和 UI。

## 22. Spec 内部门禁

- [x] 已完成阶段 12 只读观察。
- [x] 已对照阶段 00、01 和阶段 03–11 的已批准边界。
- [x] 已检查 Terminal、Model、Context、Tool、Approval、Agent 和 Storage 的实际生产路径。
- [x] 已重跑 terminal 13 files / 66 tests、lint 和 typecheck，全部通过。
- [x] 已确认当前 Codex 进程无模型配置，未读取或输出用户 Key。
- [x] 已区分真实 provider、确定性自动测试和人工操作证据。
- [x] 已定义临时 Git fixture、双模型、六工具、闭环、审批、取消、恢复和 compaction 场景。
- [x] 已定义 secret/reasoning/control 审计与证据最小化规则。
- [x] 已定义外部阻塞、模型行为、符合性缺陷和规格缺口的处理方式。
- [x] 已给出建议文件边界、重新审批条件和阶段 13 门禁。
- [x] 未创建 Task/Summary/fixture，未安装依赖，未修改业务/测试代码。
- [x] 未调用真实模型、未访问真实项目、未创建 `.secode-data`。

**Spec 内部门禁：通过。当前状态：已批准。**

## 23. 用户审批项

请重点审阅：

1. 双模型是否都必须真实完成至少一个工具回合。
2. LongCat 端点缺失时不允许阶段完成是否符合预期。
3. 临时 Git fixture 和完整修复闭环是否足以代表真实项目核心能力。
4. 六工具、审批、取消、恢复、compaction 的人工/自动证据分工是否合理。
5. Key、reasoning、JSONL 和 transcript 的安全规则是否足够严格。
6. 缺陷修正必须按 Task 修订或旧 Spec 回退的边界是否可接受。
7. 是否批准本 Spec，并只解锁阶段 12 Task 文档编写。

## 24. 用户审批记录

- 当前审批结果：用户已于 2026-08-28 批准阶段 12 Spec。
- 本次批准解锁：只允许根据本 Spec 生成 `12-terminal-core-acceptance-tasks.md`。
- Task 再次获批后才解锁：创建临时 fixture、执行自动/人工验收和生成 Summary。
- 当前仍禁止：任何真实模型正式验收、代码或测试修改、依赖变更、Route Handler、NDJSON 或 UI。
- 若用户要求修订：只修改本 Spec 与开发索引，修订后重新等待审批。
