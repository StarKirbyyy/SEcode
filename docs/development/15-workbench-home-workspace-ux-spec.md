# 阶段 15 Spec 修订 2：Claude Code Web 风格工作区与 Session 体验重构

## 1. 文档状态与审批门禁

- 当前状态：已批准。
- 当前修订：修订 2。
- 观察日期：2026-08-28（北京时间）。
- 前置阶段：[阶段 14 Summary](./14-chinese-workbench-ui-e2e-summary.md) 已批准，其 API、Agent、安全与测试事实继续有效。
- 被取代版本：本文件修订 1 的“海报主页 + Workspace Launch + 自定义 rail/inspector”布局已被用户明确要求放弃。
- 被取代交付草稿：[原阶段 15 最终交付 Spec](./15-documentation-video-final-submission-spec.md) 仅作为未来阶段 16 的历史输入。
- Spec 审批记录：用户于 2026-08-28 明确批准修订 2。
- 当前允许：根据本 Spec 生成和审阅阶段 15 Task 文档。
- 当前禁止：修改 production/test 代码、安装依赖、修改 API、生成 Summary、Git commit/push/deploy。
- 下一门禁：阶段 15 Task 获用户明确批准后才能开发。

审批链：

```text
阶段 14 Summary（已批准）
  → 阶段 15 Spec 修订 1（用户要求推翻布局）
  → 只读复核本地实现与 Claude Code Web 官方资料
  → 本 Spec 修订 2（已批准）
  → 阶段 15 Task
  → 用户审批 Task
  → 实施与验证
  → 阶段 15 Summary
  → 用户审批 Summary
  → 阶段 16 最终交付
```

## 2. 修订记录

| 修订 | 状态 | 主要决定 |
| --- | --- | --- |
| 修订 1 | 已被取代 | 独立海报主页；Workspace Drawer 内完成目录、模型、标题和 Session 启动；Session 使用自定义 rail + inspector overlay；纯文本 transcript |
| 修订 2 | 已批准 | 放弃上述布局，以 Claude Code Web 的新任务入口、Session 侧栏、中央对话工作区和按需详情为基准；保留底部上拉工作区选择与纯文本 transcript |

本次修订不是颜色和间距微调，而是重新定义工作区、任务创建和 Session 执行的主信息架构。

## 3. 阶段目标

将当前首屏三栏玻璃工作台重构为 Claude Code Web 风格的本地编程智能体界面：

```text
持久 App Shell
├── 左侧 Session 导航
└── 主内容
    ├── /                  新任务主页
    │   ├── 任务输入框
    │   ├── 工作区选择
    │   ├── 模型选择
    │   └── 安全策略说明
    └── /sessions/[id]     Session 执行页
        ├── Session 顶栏
        ├── 纯文本 Transcript
        ├── 工具与审批的渐进披露
        └── 底部 Composer

Workspace Drawer（全局 overlay）
└── 从底部上拉，负责最近目录与受限目录浏览
```

用户在新任务页输入目标，选择本机工作区与模型，一次提交即可创建并进入 Session。执行页始终以连续对话为主，历史 Session 在左侧切换，运行详情按需展开，不再永久占用第三列。

## 4. 需求追踪

- `FR-001`：从服务端允许区域中选择本机项目目录并绑定 Session。
- `FR-002`：输入自然语言任务并启动 Agent。
- `FR-005`：查看模型消息、工具事实、错误、状态与结果。
- `FR-006`：危险操作审批在当前任务上下文中可见且可操作。
- `FR-007`：运行期间停止操作始终可达。
- `FR-008`：Session 具有稳定 URL，刷新后恢复历史。
- `FR-009`：启动任务前选择可用模型。
- `NFR-001`：遵守 Next.js 16.3.3 App Router 约定。
- `NFR-002`：TypeScript strict 与 Zod 边界不弱化。
- `NFR-007`：中文优先、响应式、适合桌面演示。
- `NFR-008`：设计、实现和验证过程可追踪。
- `SEC-001`、`SEC-002`、`SEC-006`、`SEC-008`：工作区边界、symlink、秘密信息与可信本地边界不变。

## 5. 观察依据

### 5.1 当前本地实现

已只读复核以下边界：

- `app/page.tsx` 直接渲染 `Workbench`，不存在真正的新任务主页。
- `useWorkbench` 加载历史后自动选中第一条 Session，因此 `/` 不是稳定空状态。
- `SessionSidebar` 同时塞入目录选择、模型、标题、新建 Session、历史 Session 和最近目录。
- `Timeline` 把请求、响应、状态和消息逐项渲染为带框卡片。
- `RunInspector` 永久占用右列，即使没有运行数据。
- `WorkspacePicker` 使用居中通用 `Sheet`，与“从底部上拉选择工作区”的用户要求不符。
- `VisualStage`、巨型字标、两张百合与三栏工作台叠加，品牌和生产操作争夺首屏注意力。
- 现有 Client API、event ledger、workspace browse/validate、安全检查和 Route Handlers 已足以支撑本阶段；无需改变服务端公共协议。

### 5.2 Claude Code Web 官方参考

本 Spec 只采用公开的信息架构原则，不复制 Anthropic 代码、品牌、私有交互或云能力：

- [Claude Code Web 快速入门](https://code.claude.com/docs/en/web-quickstart) 将新任务组织为：在输入框附近选择 repository/branch、选择 permission mode、描述任务并提交；每个任务创建独立 Session。
- [Claude Code Web 使用说明](https://code.claude.com/docs/en/claude-code-on-the-web) 明确 Session 持久存在，并可从侧栏和 Session 菜单进行管理与恢复。
- [Claude Code 2026 Week 17 更新](https://code.claude.com/docs/en/whats-new/2026-w17) 说明新版 Web 使用 Session sidebar、可调整工作布局和重构后的可靠交互。

SEcode 是本机单用户产品，没有 GitHub repository、branch、云 VM、PR 和 permission mode 下拉，因此映射关系为：

| Claude Code Web 概念 | SEcode 映射 |
| --- | --- |
| Repository selector | 受 picker root 限制的本机 Workspace selector |
| 每个任务一个 Session | 每次首次提交创建一个本地 JSONL Session |
| Sessions sidebar | 按工作区组织的本地历史 Session 侧栏 |
| Permission mode | 不伪造模式选择；显示既有固定风险策略，危险操作仍逐次审批 |
| Chat/work area | 纯文本 Agent transcript + composer |
| Diff/PR/cloud controls | 本阶段不实现 |

### 5.3 Next.js 16 本地规范

实施前仍必须以仓库安装版本 `node_modules/next/dist/docs/` 为准。本 Spec 已核对 App Router page/layout、动态路由、Server/Client Component、Link/navigation 与 accessibility 约束：

- `/` 与 `/sessions/[id]` 使用真实页面边界。
- 动态 `params` 以异步值读取。
- App Shell 可以在共享 layout 中跨路由保留，页面业务数据仍由窄 Client runtime 管理。
- 每个页面有唯一 H1/title，使 route announcer 能正确播报。

## 6. 当前问题与根因

### 6.1 创建任务需要理解太多表单

用户现在必须先在左栏依次理解目录、模型、标题、创建 Session，再到中间输入任务。Session 是实现概念，却被暴露为任务开始前的额外手续。

### 6.2 没有 Claude Code Web 式“新任务”入口

首页一打开就自动落入历史 Session。任务输入、工作区、模型不在同一个明确的启动面上，无法形成“描述目标 → 选项目 → 提交”的自然流程。

### 6.3 三列一直存在，信息密度不随任务变化

历史、新建表单、Transcript、Inspector 与安全卡同时出现。无运行时右栏大量空值；有运行时中间正文反而过窄。

### 6.4 事件卡片破坏连续阅读

`model.requested`、`model.completed`、delta、工具和终态各自带框，导致一个模型回合被拆成多个矩形。长任务更像审计卡片墙，而不是可持续追问的编程对话。

### 6.5 海报成为功能布局而非品牌资产

视觉海报本身可以保留为品牌来源，但不应继续决定工作区网格、层级和可读性。用户最新要求“抛弃现在的工作区 UI 布局”，因此旧的 full-viewport poster 结构不再是产品界面的硬约束。

## 7. 设计原则

1. **新任务优先**：首次进入 `/` 即看到可输入任务的主界面，不自动打开历史。
2. **一次提交启动**：Workspace、模型和任务在同一个 composer 上下文内完成，Session 创建不再是单独表单步骤。
3. **Session 是主导航单位**：历史在左侧持续可见，点击后进入稳定 URL。
4. **正文优先**：Session 页面主要宽度给 transcript；详情按需打开。
5. **纯文本而非气泡墙**：消息、模型轮次和状态以排版层级组织，不为每一项画外框。
6. **真实流式**：打字效果只展示已收到的 `assistant.delta`，不伪造 reasoning 或生成内容。
7. **本地安全可见但不冒充模式**：既有风险分类不变，UI 只解释当前策略。
8. **最新要求覆盖旧海报布局**：SEcode 品牌保留，海报不再支配产品工作区。
9. **不做像素克隆**：借鉴 Claude Code Web 的任务流和密度，使用 SEcode 名称、中文文案、粉色强调和本地工作区能力。
10. **不扩大产品范围**：不新增 Git branch、PR、IDE、terminal pane、并行 Agent、云执行或拖拽窗格。

## 8. 目标信息架构

### 8.1 路由

```text
/                       新任务主页
/sessions/[id]          Session 执行页
```

Workspace Drawer 是全局 overlay，不使用 URL。绝对路径不得进入 URL/query/hash。

### 8.2 持久 App Shell

桌面默认：

```text
┌────────────── 264px Session Sidebar ──────────────┬──────────────────────── Main ────────────────────────┐
│ SEcode                                              │                                                    │
│ ＋ 新任务                                           │  /               新任务 Composer                  │
│                                                    │  /sessions/[id]  Transcript + Composer            │
│ 工作区                                             │                                                    │
│   secode                                            │                                                    │
│ 最近任务                                           │                                                    │
│   修复上下文压缩             运行中                │                                                    │
│   验证工具边界               已完成                │                                                    │
│                                                    │                                                    │
│ 配置状态 · 安全边界                                 │                                                    │
└────────────────────────────────────────────────────┴────────────────────────────────────────────────────┘
```

Sidebar 组成：

- 顶部：SEcode wordmark、折叠按钮。
- 主动作：`＋ 新任务`，导航到 `/` 并清空未提交的新任务状态。
- `工作区`：当前/最近项目入口；点击打开 Workspace Drawer，不在侧栏直接编辑绝对路径。
- `最近任务`：Session 标题、项目 basename、状态点；按最近顺序展示，可按 workspace 轻量分组。
- 底部：模型配置可用状态、安全说明入口；不显示 Key、base URL 或数据目录。

Sidebar 不再包含：模型表单、Session 标题输入、目录 breadcrumbs、运行 Inspector 或审批表单。

### 8.3 中屏与移动

- `>= 1100px`：264px Sidebar 常驻，可折叠为 56px icon rail。
- `720–1099px`：默认 icon rail；Session 列表以左侧 overlay 展开。
- `< 720px`：Sidebar 完全收起，顶部按钮打开全高导航 Drawer；主内容占满宽度。
- Workspace Drawer 始终从底部上拉，与 Session 导航 Drawer 区分。
- 不依赖 hover 才能完成核心操作。

## 9. 新任务主页规格

### 9.1 主内容

`/` 不再是全屏海报，也不自动打开历史。主区中心最大宽度约 820px：

```text
                         SEcode
                 今天想让智能体完成什么？

        ┌───────────────────────────────────────┐
        │ 描述要检查、修改或验证的任务……       │
        │                                       │
        │ [工作区 secode ▾] [DeepSeek ▾]   [↑] │
        └───────────────────────────────────────┘

        本机执行 · 文件操作限制在所选工作区 · 危险操作会询问
```

- Composer 是主页主焦点，支持多行输入、`Enter` 提交、`Shift+Enter` 换行。
- 空 prompt 禁止提交；提交中防重复点击。
- 用户可以先输入任务，再选择工作区；打开 Drawer 不丢失 draft。
- 没有 workspace 时点击发送，打开 Workspace Drawer 并保留 draft；完成选择后焦点返回 composer。
- 没有可用模型时发送禁用，并显示有限配置错误。
- 模型选择使用轻量 dropdown，只展示 `/api/config` 返回的脱敏 profile。
- 安全说明为只读事实，不新增假的 `Plan/Auto/Accept edits` 模式。

### 9.2 一次提交语义

首次提交按顺序：

1. 锁定当前 prompt、workspace 和 model，防止双击。
2. 使用现有 `POST /api/sessions` 创建 Session；标题默认取 prompt 首个非空行的前 40 个 Unicode grapheme，超出用省略号；为空时回退现有默认标题。
3. 将 URL 导航为 `/sessions/<id>`。
4. 由共享 Client runtime 对新 Session 调用现有 run API，并消费 NDJSON stream。
5. Session 页面立即显示用户消息和运行状态；失败时保留可重试事实。

共享 runtime 只持有当前浏览器连接的临时 stream、draft 和 projection，不持久化第二套真相。JSONL events 仍是恢复与审计唯一权威。页面刷新仍按既有语义中止连接，并从 durable history 恢复。

### 9.3 品牌处理

- 保留 SEcode 字标、粉色 accent 和高对比代码字体。
- 旧的巨大 `SECODE` 海报、两张百合叠层、morph trail、装饰编号与玻璃三栏不再作为运行时验收要求。
- 如实施时保留百合资产，只能作为低透明、不可交互、失败不影响功能的空状态背景；不得遮挡 composer、sidebar 或文本。
- 默认功能表面采用克制的中性色，而不是海报式高对比叠层。

上述处理是“抛弃当前布局”的具体含义；本 Spec 获批即视为用户同意最新要求覆盖阶段 14 的海报布局约束。

## 10. Workspace Drawer 规格

### 10.1 职责收敛

Workspace Drawer 只负责选择与验证目录，不再包含 Session 标题、模型选择、新建 Session 表单或现有 Session 启动列表。选择成功后返回主页 composer；Session 历史由左侧 Sidebar 管理。

### 10.2 空间与动效

- 桌面：贴底、宽 `min(960px, calc(100vw - 48px))` 或全宽受控容器，高 `min(72dvh, 760px)`。
- 移动：全宽、高度约 `90dvh`，保留 safe-area。
- 打开：底部 `translateY` 上拉；关闭反向；`prefers-reduced-motion` 立即出现或仅淡入。
- scrim、focus trap、background inert、Escape、close button 和 focus restore 全部保留。
- 可视把手不实现拖拽，避免首版滚动与手势冲突。

### 10.3 内容

- 顶部：`选择工作区`、当前 picker root 的安全标签、关闭按钮。
- 首屏：最近工作区，项目 basename 为主信息，折叠路径为次信息。
- 浏览：复用相对 segments、breadcrumbs、目录列表、返回上级、blocked/truncated 状态。
- 操作：`选择此文件夹` 后调用既有 validate，成功即更新 composer workspace pill 并关闭 Drawer。
- 失败：保留当前目录和选择，显示有限错误，可重试；不回显外部 symlink target。
- 最近目录同样必须重新 validate 和 `assertSelection`，不能作为可信 token。

## 11. Session 执行页规格

### 11.1 路由与顶栏

- 新增 `/sessions/[id]` 页面与 loading/error 状态。
- 动态 `params` 按 Next.js 16 异步读取。
- 顶栏保持单行、低高度，包含：Session 标题、workspace basename、模型、运行状态、详情按钮、停止按钮。
- 完整绝对路径默认不显示；需要时在详情内折叠展示。
- 不存在的 ID、metadata/events 失败显示有限错误和返回新任务入口，不泄露 storage path。

### 11.2 主布局

```text
┌──────────────────────── Session toolbar ────────────────────────┐
│                                                                 │
│             Transcript max-width 880px                          │
│                                                                 │
│             你                                                  │
│             请修复 slugify……                                   │
│                                                                 │
│             第 1 轮 · DeepSeek · tool_calls · 1.2s              │
│             ◆ read_file                          成功 · 8ms      │
│                                                                 │
│             智能体                                              │
│             我会先检查实现和测试。▍                             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│             Follow-up Composer                                  │
└─────────────────────────────────────────────────────────────────┘
```

- Transcript 居中且留出阅读宽度，不再被永久 Inspector 压缩。
- Composer 固定/粘附在主区底部，运行中可发送规则遵循现有单运行约束；不支持并行 run。
- 详情通过右侧 overlay/drawer 打开，展示 iteration、token、context、完整 workspace path 与事件审计，不常驻。
- 待审批在对应工具行内出现，并在顶栏给出明显状态；不能只藏在详情 Drawer。
- 停止按钮在 active run 时始终可达，不被 overlay 遮挡。

### 11.3 Sidebar Session 行为

- 点击 Session 使用真实 Link/Router 导航到 `/sessions/[id]`。
- 当前 Session 有明确 selected 状态，不只依赖颜色。
- 每项展示简短标题、workspace basename、运行/完成/失败状态；不重复完整路径。
- active run 时不允许切换到其他 Session、新任务或 Workspace；控件说明“请先停止当前任务”。
- 停止并收到 durable terminal event 后恢复导航。
- 首版不新增 Session 删除、重命名、归档、搜索或固定功能。

## 12. 纯文本 Transcript 与打字效果

### 12.1 View projection

新增纯 Client `buildTranscriptItems(events)`，输入仍是 durable/live `AgentEvent`，输出：

```ts
type TranscriptItem =
  | MessageItem
  | AssistantDraftItem
  | ModelRoundItem
  | ToolLifecycleItem
  | ApprovalItem
  | StatusItem;
```

- `model.requested` 与同 `runId + iteration` 的 `model.completed` 合并为一条 round line。
- 同一 tool call 的 requested/approval/started/result 合并为一个 disclosure 行。
- 同一 run 的 delta 按 `streamSeq` 聚合为唯一 draft。
- durable `assistant.message` 到达后原位接管 draft，不重复、不重新播放。
- unknown/incomplete lifecycle 仍显示有限 status，不静默丢事件。
- 只改变 Client 视图投影，不修改 JSONL、seq 或事件协议。

### 12.2 视觉规则

- user 与 assistant 正文无气泡、无圆角框、无半透明卡片。
- model round 使用小字号单行状态与细 divider；请求和完成不重复占两行卡片。
- run/context/session 状态使用 compact status line。
- 工具收起态为单行 disclosure；展开后参数、diff、stdout/stderr 和错误可以使用 code surface。
- error 允许红色文字和左侧细 rule；approval 允许有限边界/tint，因为它是必须操作的安全控件。
- Markdown 不启用 raw HTML，安全渲染规则不变。

### 12.3 打字效果

只用于当前 active run 新到达的 assistant draft：

1. delta 先进入 authoritative received buffer。
2. 单一 `requestAnimationFrame` scheduler 渐进释放 Unicode grapheme；优先 `Intl.Segmenter`，回退 `Array.from`。
3. 目标 30–60 grapheme/s，按 backlog 加速，可见落后不超过约 250ms。
4. tool call、durable final、run terminal、stream EOF 到达时立即 flush。
5. caret 只在 live draft 未 flush 时显示。
6. 历史恢复、user message、工具输出与状态不播放动画。
7. reduced-motion、document hidden 或测试禁用动画时立即显示全部。
8. typing container 不逐字 `aria-live`；完成后只播报一次有限状态。
9. 动画不得延迟工具、审批、错误或终态事实。

## 13. Client 架构与数据流

### 13.1 建议边界

```text
AppShellProvider
├── catalog: config / recent workspaces / session metadata
├── navigation: sidebar / active session
├── workspaceSelector: drawer / browse / validate / selection
└── runtimeManager: 当前 active run stream 与 cancel guard

NewTaskPage
└── draft / workspace / model / create-and-start

SessionPage(sessionId)
├── durable history ledger
├── live runtime subscription
├── transcript projection
└── composer / approval / cancel / inspector
```

- Provider 可跨 `/` 与 `/sessions/[id]` 路由保留一次提交过程，避免创建 Session 后页面卸载丢失 run stream。
- Provider 不写 localStorage，不成为历史真相；刷新只从 API/JSONL 恢复。
- catalog 与某 Session 的完整 events 分离；Sidebar 不为每个 Session 拉取历史。
- 同一浏览器界面只允许一个 active run，符合现有 runtime 约束。

### 13.2 API 不变量

预计复用 `GET /api/config`、`GET /api/workspaces/recent`、`POST /api/workspaces/browse`、`POST /api/workspaces/validate`、`GET/POST /api/sessions` 以及 session events/run、approval、cancel 路由。

本阶段默认禁止修改 `app/api/**`、`lib/server/**`、Agent、工具、事件或 storage。若 Task 观察证明稳定 Session URL 必须新增按 ID metadata API，应停止并修订 Spec，而不是实施时临时扩张。

## 14. 视觉系统

### 14.1 Claude Code Web 风格映射

- 应用背景：克制的暖中性或深中性色实色；不使用大面积玻璃叠层。
- Sidebar：与主区有轻微 surface 差异和 1px 分隔，不使用厚卡片边界。
- 主区：高留白、窄阅读列、正文优先。
- 控件：小圆角、低阴影、清晰 focus ring；避免海报式装饰编号。
- 字体：Geist Sans + Geist Mono；不新增字体依赖。
- 品牌：SEcode wordmark、粉色 accent、状态色；不使用 Claude 名称、logo 或橙色品牌复制。
- 工具/代码：等宽字体、可复制、支持横向滚动，输出上限和截断事实可见。

### 14.2 明确删除的布局元素

- 首屏固定三列 `SessionSidebar / Timeline / RunInspector`。
- 以百合和巨大字标作为功能区网格背景。
- 常驻新建 Session 表单。
- 常驻右侧 Inspector。
- 每个模型请求/响应/状态的独立外框卡片。
- Workspace 选择完成后再进入第二个 Launch 表单。

## 15. 可访问性

- `/` 与 `/sessions/[id]` 各有唯一 H1 和 title。
- Sidebar nav、new task、Session link、workspace button 使用正确语义。
- 移动导航 Drawer 和 Workspace Drawer 都具备 dialog 标题、focus trap、inert、Escape 与 focus restore，但二者不能同时打开。
- Workspace 目录列表支持键盘 active/selected/enter/back 行为。
- 所有 icon button 有中文 accessible name。
- selected、running、failed、approval 不只依赖颜色。
- 状态变化使用有限 `aria-live`；打字文本不逐字播报。
- reduced-motion 禁用上拉大位移、typing 和装饰动效，不移除功能反馈。
- Composer 在软键盘、移动视口与安全区内始终可达。

## 16. 安全与隐私不变量

1. Picker root 只来自 `SECODE_WORKSPACE_PICKER_ROOT`。
2. Browse 只发送 relative segments，不恢复任意绝对路径文本输入。
3. Recent workspace 每次重新 canonicalize、validate、`assertSelection`。
4. external/broken/unreadable symlink 继续阻止，目标路径不回传。
5. 创建 Session 前再次确认 canonical workspace 位于 picker root。
6. Client 不暴露 Key、Authorization、base URL、reasoning、storage path 或环境变量。
7. 完整绝对路径默认折叠，公开录制继续使用隔离工作区。
8. active run 导航不能通过组件卸载静默绕过 cancel 与 durable reconciliation。
9. Markdown、远程图片和输出渲染安全规则不变。
10. 产品仍声明为可信本地单用户应用级边界，不声称 OS 强沙箱。

## 17. 范围

### 17.1 范围内

- Claude Code Web 风格 App Shell、Sidebar、新任务页和 Session 页。
- 新任务 composer 内的 workspace/model 选择与一次提交创建流程。
- 从底部上拉的受限 Workspace Drawer。
- `/sessions/[id]` 深链接与刷新恢复。
- 纯文本 transcript、模型 round/tool lifecycle 视图合并和实时 typing。
- Inspector 改为按需 drawer。
- desktop/tablet/mobile、keyboard、reduced-motion 与 a11y。
- 相应 Client unit 和完整 E2E 更新。
- 阶段 15 Task/Summary、流程索引与阶段 16 衔接。

### 17.2 范围外

- Claude Code 品牌、账号、GitHub、repository/branch、云 VM、PR、diff review。
- 拖拽/任意排列窗格、terminal、editor、file tree、preview。
- 并行 Agent、并行 run、worktree 或后台断连后继续执行。
- 新的 permission mode；继续使用现有风险策略与审批。
- Session 删除、归档、重命名、搜索、固定。
- Native Finder/Explorer 选择器与任意绝对路径输入。
- 新 UI/state/animation/icon/font 依赖。
- README、视频、ZIP、commit、push、deploy；属于阶段 16。

## 18. 预计文件边界

### 18.1 Spec 审批前

只允许：

```text
docs/development/15-workbench-home-workspace-ux-spec.md
docs/development/README.md
```

### 18.2 Task 阶段预计文档

```text
docs/development/00-process.md
docs/development/15-workbench-home-workspace-ux-spec.md
docs/development/15-workbench-home-workspace-ux-tasks.md
docs/development/README.md
```

### 18.3 Task 批准后候选 production

```text
app/layout.tsx
app/page.tsx
app/sessions/[id]/page.tsx
app/sessions/[id]/loading.tsx
app/globals.css

app/ui/shell/**
app/ui/home/**
app/ui/navigation/**
app/ui/workbench/**
app/ui/visual-stage/**              # 删除运行时耦合或收敛为非关键品牌资产

lib/client/transcript.ts
lib/client/**
```

### 18.4 测试与总结候选

```text
tests/unit/client/**
tests/e2e/baseline.spec.ts
tests/e2e/workspace-picker.spec.ts
tests/e2e/agent-workflow.spec.ts
tests/e2e/approval-cancel.spec.ts
tests/e2e/recovery-security.spec.ts
tests/e2e/responsive-visual.spec.ts
tests/e2e/new-task-session-navigation.spec.ts

docs/development/15-workbench-home-workspace-ux-summary.md
docs/development/README.md
```

Task 必须把候选收敛为精确白名单。`package.json`、`pnpm-lock.yaml`、`app/api/**`、`lib/server/**` 默认禁止修改。

## 19. 测试与验收策略

### 19.1 Unit / Client

- `/` catalog 加载后不自动选 Session、不加载 events。
- Sidebar Session 按稳定顺序与 workspace 分组，selected/status 事实正确。
- prompt 首行 title 派生覆盖中文、emoji、空白和截断。
- Workspace Drawer recent/browse/validate/error/close 转移与 draft 保留。
- stale browse/validate response 不覆盖新选择。
- create-and-start 防双击、失败保留输入、成功绑定正确 Session。
- active run navigation guard。
- transcript round/tool/delta/final 投影不重复、不乱序。
- typing grapheme、backlog、flush、hidden/reduced-motion 和 cleanup。

### 19.2 E2E

1. 有历史时访问 `/` 仍显示新任务 composer，不自动进入第一 Session。
2. 点击 workspace pill 后 BottomSheet 从底部出现，非居中 modal；focus/inert/Escape/restore 正确。
3. recent workspace 重新验证；越界、stale、symlink、truncated 行为保持安全。
4. 先输入 prompt 再选 workspace，返回后 draft 完整。
5. 选择 workspace/model 后一次提交创建 Session，URL 变为 `/sessions/<id>` 并启动 run。
6. Sidebar 显示新 Session；刷新 URL 恢复同一历史，final 只出现一次。
7. `read → replace → test → final` 完整闭环保持通过。
8. approval allow/reject、cancel、provider failure 和 continue draft 行为不回归。
9. active run 时阻止新任务/切换 Session/换 workspace，停止始终可达。
10. model request/response 合为一个纯文本 round line，常规消息无外框。
11. live assistant 在唯一文本区域打字展开，final 后立即一致，刷新不重播。
12. desktop 1440×900、tablet、mobile、keyboard、reduced-motion 全流程可用。
13. 页面不暴露 Key、base URL、storage path、reasoning 或完整个人路径。

### 19.3 全仓门禁

必须串行执行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm test:e2e
git diff --check
```

要求：package/lock hash 不变；coverage 不降阈值；E2E `workers=1`、`retries=0`；不得用 skip/only、删测试或降低断言制造通过。

## 20. 可测试验收标准

| ID | 验收标准 |
| --- | --- |
| AC15-01 | `/` 是 Claude Code Web 风格新任务页；有历史也不自动打开 Session |
| AC15-02 | 左侧 Sidebar 统一承载新任务、工作区入口与历史 Session，不再承载创建表单或 Inspector |
| AC15-03 | prompt、workspace 和 model 在同一 composer 上下文中完成，一次提交创建并启动 Session |
| AC15-04 | Workspace selector 从底部上拉，只负责受限目录选择和验证，关闭后 draft 不丢失 |
| AC15-05 | Session 使用 `/sessions/[id]`，刷新恢复同一历史，不依赖列表第一项 |
| AC15-06 | Session 主区为居中纯文本 transcript + composer，无永久第三列 Inspector |
| AC15-07 | model round 与 tool lifecycle 视图合并；user/assistant/status 常规内容没有卡片外框 |
| AC15-08 | live delta 在唯一 draft 中有界打字展开；Unicode、flush、history no-replay、reduced-motion 与 a11y 正确 |
| AC15-09 | approval、tool 参数/输出/错误、context 与 run 终态仍完整可见，不因极简视觉被隐藏 |
| AC15-10 | active run 不能通过导航被静默丢弃；停止和待审批操作始终可达 |
| AC15-11 | picker root、realpath、symlink 与 recent revalidation 安全事实不变 |
| AC15-12 | UI 使用 SEcode 品牌，不复制 Claude 名称/logo；旧海报不再决定功能布局 |
| AC15-13 | desktop/tablet/mobile/keyboard/reduced-motion 流程通过 |
| AC15-14 | Agent/API/JSONL/tool/risk 语义不变，既有完整闭环 E2E 全部回归 |
| AC15-15 | lint/typecheck/test/coverage/build/E2E/diff 全通过且 package/lock 不变 |

## 21. 失败处理与回退

- 若共享 runtime 在 route transition 中丢失 stream：停止开发，修正 App Shell 生命周期；不得退回自动选中首个 Session。
- 若 create 成功但 run 启动失败：保留已创建 Session、prompt 和有限错误，允许在该 Session 重试；不得重复创建未知数量 Session。
- 若稳定 Session URL 必须改服务端公共协议：回到 Spec 修订并重新审批。
- 若 BottomSheet 与软键盘/目录滚动/focus trap 冲突：功能和可访问性优先，修正后重跑 desktop/mobile/keyboard。
- 若 typing 落后超过约 250ms：加速或 flush，不得阻塞工具、审批或终态。
- 若 durable final 与 live draft 不一致：以 durable message 为权威，不拼接两份文本。
- 若纯文本使错误或审批不醒目：只为安全动作增加有限 rule/tint，不恢复整页卡片墙。
- 若旧视觉 E2E 因被明确废弃的海报断言失败：用新 Spec 的用户行为与语义断言替换，同时保留安全/结果断言。
- 回退只作用于阶段 15 Task 白名单；禁止 `git reset --hard`、`git checkout --` 或覆盖用户已有修改。

## 22. 风险与明确决策

### 22.1 风险

1. App Shell、路由和 runtime 生命周期同时调整，必须通过一键提交、取消和刷新测试约束竞态。
2. 现有 E2E selector 大量绑定旧三栏结构，需要迁移为 role/name/URL/业务事实断言。
3. 纯文本 transcript 降低视觉边界后，tool、error 与 approval 的层级必须用排版和渐进披露重新建立。
4. 截止日前只允许完成参考风格的核心骨架，不实现 Claude Code Web 的云端和可拖拽 Pane 能力。

### 22.2 明确决策

- “Claude Code Web 风格”指新任务入口、Session 侧栏、中央工作区、渐进披露与高正文密度，不指像素复制。
- `/` 直接提供任务输入，不再是纯海报或只含“打开工作区”的落地页。
- Workspace Drawer 保留用户此前指定的底部上拉形式，但职责缩减为目录选择。
- Session 由第一次任务提交自动创建；不再要求用户先填写 Session 标题和点击“创建”。
- 固定风险策略不包装成 Claude 的 permission mode。
- 右侧 Inspector 默认不存在于布局流，只作为按需 Drawer。
- 不实现 drag-and-drop panes；SEcode 首版没有足够 Pane 类型，也不应为视觉相似引入无业务价值的复杂度。

## 23. 对阶段 14 与最终交付的影响

- 阶段 14 的 Agent Client、API、workspace 安全、event ledger、审批/取消和 E2E 业务事实继续复用。
- 阶段 14 的三栏玻璃工作台和海报运行时布局被最新用户要求覆盖，不再是必须保留的验收项。
- 原阶段 15 最终交付 Spec 继续冻结。
- 阶段 15 Summary 获批后，阶段 16 必须重新观察最终 UI、测试数量、README、两分钟视频镜头和仓库状态。
- 最终视频建议从新任务 composer 开始，打开底部 Workspace Drawer，提交一次真实任务，再在 Session transcript 中展示读、改、测、审批/取消和最终结果。

## 24. Spec 内部门禁与审批请求

- [x] 已复核阶段 14 当前 UI、状态、picker、安全与测试边界。
- [x] 已确认修订 1 与用户最新“放弃当前布局”要求冲突。
- [x] 已使用 Anthropic 官方资料核对 Claude Code Web 的新任务、repository selector、Session 与 Sidebar 原则。
- [x] 已将官方云端概念映射为 SEcode 本地能力，并明确不复制范围。
- [x] 已定义 App Shell、Sidebar、新任务页、Workspace Drawer、Session 页和详情 Drawer。
- [x] 已保留用户要求的纯文本 transcript 与真实打字效果。
- [x] 已保留 Agent/API/JSONL/security 不变量。
- [x] 已定义测试、验收、失败、回退和候选文件边界。
- [x] 当前未修改 production、tests、package、lockfile 或服务端协议。

**内部门禁结论：通过。当前状态：Spec 修订 2 已获用户批准。**

本次批准只解锁阶段 15 Task 文档编写；Task 获批前不得开始 UI 开发。
