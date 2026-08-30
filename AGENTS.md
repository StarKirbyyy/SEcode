<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SEcode 仓库协作规则

## 1. 指令与事实来源

开始任何工作前，按以下顺序确认约束：

1. 用户当前请求，以及用户已经明确批准的范围。
2. 本文件。
3. `docs/development/00-process.md` 的阶段开发与审批规范。
4. `docs/development/README.md` 的阶段索引，以及当前阶段最新的 Spec、Task、Summary 和人工验收文档。
5. `docs/development/01-requirements.md` 的需求、安全与验收条目。
6. 实际代码、测试、Git 状态和本机运行结果。

后续修订会取代同一文档中的旧版本结论。不得只根据文件名、聊天中的历史计划或过期索引判断当前授权；必须阅读最新状态、审批记录和停止点。发现文档互相矛盾时，先只读核对并报告，不得自行选择一个版本继续开发。

## 2. 文档驱动与逐步审批

SEcode 严格采用以下阶段生命周期：

```text
只读观察
  → 编写 Spec
  → 用户批准 Spec
  → 编写 Task
  → 用户批准 Task
  → 按 Task 开发与验证
  → 编写 Summary
  → 用户批准 Summary
  → 进入下一阶段
```

- 阶段开始只能观察并生成 `docs/development/NN-topic-spec.md`；Spec 获批前不得生成 Task 或修改业务代码。
- Spec 获批后只能生成或修订 `NN-topic-tasks.md`；Task 获批前不得开始开发。
- Task 获批后必须按依赖顺序实施，每项任务先对照 Spec/Task，再做最小验证。
- 开发完成后生成 `NN-topic-summary.md`，如实记录实现、验证、失败、修正、偏差和风险；Summary 获批前不得进入下一阶段。
- 每次生成待审文档或到达人工验收门禁后立即停止。不得把自动测试通过、内部检查通过或含糊的历史回复写成用户已经批准。
- 用户要求修订当前产物时，只修改当前等待审批的产物。公共接口、安全边界、范围或验收标准发生变化时回退到 Spec；任务顺序或实现文件范围变化时回退到 Task，并重新等待审批。
- 若已批准 Task 内另设“终端人工验收”等中间门禁，必须先获得该门禁要求的明确确认，才能继续后续 HTTP、UI、E2E 或 Summary 工作。
- 审批状态和解锁范围必须同步写回相应文档；阶段总状态同步写入 `docs/development/README.md`。

详细字段、文档状态和门禁清单以 `docs/development/00-process.md` 为准。

## 3. 项目目标与架构边界

SEcode 是 Next.js 16.3.3、React 19 和 TypeScript 构建的本地单用户编程智能体。核心链路由项目自行实现，不引入 LangChain、Vercel AI SDK、OpenAI Agents SDK 或其他 Agent 框架。

主要边界：

- `lib/agent`：运行状态机、计划门禁、预算、取消和失败恢复。
- `lib/context`：系统提示词、历史投影、上下文压缩、摘要和语言策略。
- `lib/model`：原生 `fetch`、OpenAI-compatible 流式协议及 DeepSeek/LongCat/Generic 归一化。
- `lib/tools`：六个本地工具及统一结果结构。
- `lib/workspace`、`lib/approval`：工作区隔离、风险分级与审批。
- `lib/storage`：JSONL 事件真相、会话恢复与删除安全。
- `lib/server`、`app/api`：Node.js Route Handlers；长任务不使用 Server Action 或 Edge Runtime。
- `lib/client`、`app/ui`：只消费服务端事件和 API，不复制 Agent 业务状态机。
- `cli`、`lib/terminal`：核心能力的首要可交互验收入口。

服务端持有 API Key、文件系统和子进程能力。浏览器不得获得密钥或任意本机路径访问能力。事件日志是会话和运行状态的唯一可审计事实来源，UI 不维护第二套不可追溯状态。

## 4. Agent 行为契约

- 每个会话固定绑定一个工作区和模型配置；更换工作区应创建新的 Session，不能混用上下文。
- 普通模式直接执行用户任务。Plan Mode 由用户逐任务选择；开启后先使用只读能力生成完整计划，等待用户明确批准，再在同一 run 中执行。
- 计划审批与危险工具审批是两种独立能力，不得共享 ID、事件或历史授权。
- planning phase 同时通过工具定义过滤和 Runtime 二次检查保持只读；模型伪造写工具也不能获得执行能力。
- 模型请求数与工具调用数分别统计。一次模型响应中的多个工具调用仍属于一次模型请求，并按顺序执行，不能把每次工具调用误称为一轮。
- 遵守已批准的模型请求预算、工具预算、总时限、重复错误和无进展保护；取消、重试和中文重述共享原 run 的预算、超时和 `AbortSignal`。
- 工具调用串行执行。任何重述、恢复或上下文压缩都不得导致工具重复执行。
- 上下文只能按完整 assistant/tool 回合压缩；保留初始目标、摘要、近期完整回合和未解决错误，原始 JSONL 事件不得因压缩而删除。
- 不向用户展示或记录模型私有推理内容。只能展示最终正文、工具调用、工具事实和可解释状态。

## 5. 模型可见内容与语言

- 所有由 SEcode 固定编写并发送给模型的自然语言必须使用简体中文，包括系统提示词、上下文包装、摘要指令、计划决定、工具及参数描述、固定校验和能力错误。
- 新产生的 assistant 计划、过程说明和最终回答必须通过中文合规门；不合规正文不能展示、持久化为 assistant 事实或作为成功结果。
- `stop` 分支最多进行两次同 run 中文重述；仍不合规则结构化失败。带工具调用的不合规叙述只抑制正文，原工具调用最多执行一次。
- 中文化不得翻译或改写用户输入、历史模型正文、代码、命令、路径、URL、JSON、哈希、仓库内容、真实 stdout/stderr、模型 ID、工具名、字段名、事件类型、状态和错误码。
- 语言拒绝事件只能记录必要的原因、计数、长度和摘要哈希，不能泄露被拒绝正文。

## 6. 工具与安全纪律

首版只提供 `list_directory`、`read_file`、`search_text`、`write_file`、`replace_in_file` 和 `run_process` 六个自研工具。

- 所有路径都必须落在当前工作区内；拒绝绝对目标路径、`..` 穿越和符号链接逃逸。写入前再次验证真实父目录。
- 文件覆盖必须使用此前读取到的 SHA-256；替换要求目标唯一匹配并采用原子更新。
- `run_process` 使用 `spawn(program, args)`，默认不开 shell，不把模型参数拼接成命令字符串。
- 读取、搜索、测试、构建、类型检查及 `git status/diff` 可按既有风险策略自动执行；未知程序、shell、依赖安装、全仓格式化、迁移、删除和 Git 写操作依照已批准策略审批或拒绝。
- 直接拒绝越界访问、`sudo`、宽泛递归删除、系统控制和 `git reset --hard` 等明显破坏性操作。
- Session 删除只能删除事件仓库中经过 UUID、真实路径和标记校验的 Session 目录，绝不能删除绑定工作区。
- 不提交或输出 API Key、Token、Cookie、真实凭据及含秘密的日志。真实值只能位于被 Git 忽略的本地环境中。
- 本项目是可信本地单用户应用，不宣称具有恶意代码安全沙箱；不要在实现或文档中扩大该安全承诺。

## 7. Next.js 与前端约束

- 修改任何 Next.js 代码前，先阅读 `node_modules/next/dist/docs/` 中与当前变更直接相关的本地文档；动态路由 `params`、缓存和运行时行为以该版本文档为准。
- App Router 页面提供服务端外壳；需要交互的工作台使用 Client Component。长时间流式运行使用 Node.js Route Handler 和 NDJSON 事件流。
- `/` 是 Claude Code Web 风格的新任务入口，即使存在历史会话也不自动跳转。
- 主要信息架构是 Session 侧栏、居中对话工作区和按需详情；不恢复永久三栏 Inspector 或海报式工作台。
- 工作区选择器从底部上拉，只浏览服务器允许的指定根目录和最近工作区；不让用户直接在主界面编辑任意绝对路径，关闭选择器不能丢失任务草稿。
- Session 时间线使用连续纯文本 transcript。模型请求/响应不为每一项绘制卡片外框；工具、错误和审批通过排版、有限底色及渐进披露体现层级。
- 打字效果只能消费真实 `assistant.delta`，不得伪造 reasoning 或生成内容；历史恢复不重播动画，积压时及时加速或 flush，不能延迟工具、审批、错误和终态。
- 保持中文优先、桌面演示清晰、响应式、键盘可用、合理 `aria-live` 和 `prefers-reduced-motion`。借鉴 Claude Code Web 的任务流和信息密度，但不复制其品牌或云端能力。

## 8. 开发与验证纪律

- 工作区可能长期包含用户和先前阶段的未提交修改。开始前运行 `git status --short`，只修改已批准范围，不 reset、stash、覆盖或清理无关改动。
- 搜索优先使用 `rg`/`rg --files`。手工编辑使用补丁方式；避免会意外重写大量文件的命令。
- 默认使用 `pnpm`。常用验证命令为：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
git diff --check
```

- 每项实现先运行最小相关测试，再按 Task 要求扩大验证范围。失败必须记录真实症状、根因、修正和重跑结果；不得降低断言、跳过或删除测试来制造通过。
- Agent 行为先通过 Terminal 和临时工作区验证，再进入 HTTP/UI；所有自动测试只能操作临时工作区，不能触碰真实用户项目或真实 Session 数据。
- 真实 DeepSeek/LongCat 冒烟测试必须由用户提供本地凭据，输出不得包含密钥。没有 LongCat 端点时记录外部阻塞或用户明确豁免，不伪造成功。
- 未经用户明确要求，不执行 Git commit、push、发布或部署，也不改写已推送历史。
- 完成回应应先说明结果、验证和剩余门禁，并链接实际文档或关键文件；不要声称未执行的测试已经通过。

- 默认不新增 hash、冻结 contract、baseline 或 gate。只有能明确说出一个具体失败场景，并说明 Git、版本号、主键、事务、唯一约束、类型和普通测试为什么不足时，才允许加入。
同时保留安全边界：不删除已有安全措施；认证、数据安全、不可逆操作和正式发布等高风险环节，仍然按照项目要求处理

- 测试时请使用 agent-browser 进行真实环境的测试

## 9. 开始任务时的固定检查

每次新任务至少完成以下检查：

1. 阅读 `docs/development/README.md` 和当前阶段最新文档，确认允许动作与停止点。
2. 检查 `git status --short`，识别并保留已有修改。
3. 若涉及 Next.js，阅读本地对应版本文档。
4. 将请求映射到已有需求、当前已批准 Task 或新的阶段观察；没有授权时只做只读分析或文档产出。
5. 在进入下一门禁前更新相应文档状态，并等待用户明确审批。
