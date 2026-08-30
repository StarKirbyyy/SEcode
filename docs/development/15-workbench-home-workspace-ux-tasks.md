# 阶段 15 Task：Claude Code Web 风格工作区与 Session 体验重构

## 1. 文档状态与审批链

- 当前状态：已批准，实施完成；Summary 已批准，阶段完成。
- 生成日期：2026-08-28（北京时间）。
- 已批准 Spec：[15-workbench-home-workspace-ux-spec.md](./15-workbench-home-workspace-ux-spec.md) 修订 2。
- Spec 审批记录：用户于 2026-08-28 明确批准。
- Task 审批记录：用户于 2026-08-28 明确批准。
- Summary 审批：用户于 2026-08-28 明确回复“批准”。
- 当前禁止：超出白名单、安装依赖、修改公共 API/核心安全语义、Git commit/push/deploy。
- 审批结果：阶段 15 已正式完成，阶段 16 只读观察已解锁。

审批链：

```text
阶段 15 Spec 修订 2（已批准）
  → 本 Task（已批准）
  → T15-00 基线与边界固定
  → T15-01～T15-03 Client 纯模块
  → T15-04～T15-08 App Shell、主页、Workspace Drawer 与 Session
  → T15-09～T15-10 Transcript、详情与视觉响应式
  → T15-11～T15-13 Unit/E2E/全仓验证
  → T15-14 清理与安全审计
  → T15-15 Summary
  → 用户审批 Summary
```

## 2. 实施目标

严格实现已批准 Spec 的交互闭环：

```text
新任务主页输入 prompt
  → 选择受限本机 Workspace
  → 选择已配置模型
  → 一次提交创建 Session
  → 路由进入 /sessions/[id]
  → 保持 NDJSON stream 并呈现纯文本 Transcript
  → 工具 / 审批 / 取消 / 恢复
  → durable history 协调
```

布局采用 Claude Code Web 的任务入口、Session 侧栏、中央工作区和渐进披露原则，但使用 SEcode 品牌与既有本地安全模型。旧海报、三栏玻璃工作台、常驻 Session 创建表单、常驻 Inspector 与事件卡片墙退出产品主流程。

## 3. 实施不变量

开发期间始终成立：

1. JSONL durable events 仍是 Session 历史唯一事实源；App Shell state 只保存当前浏览器连接和未提交 draft。
2. 阶段 13/14 API、Zod Schema、`AgentEvent`、Agent、工具、审批、风险和 workspace 安全协议不变。
3. `/` 永远是新任务页，不读取任意 Session events，也不自动选中历史第一项。
4. `/sessions/[id]` 只恢复 URL 指定的 Session；不得回退为“找不到就打开第一项”。
5. Workspace Drawer 只浏览 picker root 内目录；最近目录也必须重新 validate。
6. prompt、workspace 和 model 在同一个新任务 composer 上下文内完成；首次发送自动创建 Session，不再暴露独立 Session 标题表单。
7. create-and-start 只能产生一次 Session；防双击、竞态和 route transition stream 丢失。
8. 同一标签页只允许一个 active run；active 时禁止新任务、Session 切换和 workspace 切换，停止始终可达。
9. `model.requested/completed`、tool lifecycle 和 delta 合并只发生在 Client 视图投影，不改写 durable events。
10. typing 只展示已收到的 delta，不生成字符、不显示 reasoning、不延迟 tool/approval/terminal 事实。
11. Markdown 不启用 raw HTML，不自动加载模型给出的远程图片，不使用 `dangerouslySetInnerHTML`。
12. API Key、Authorization、base URL、reasoning、storage path 与环境变量不进入 DOM、日志、URL 或 Client state。
13. 完整绝对路径只在必要详情中显示；Sidebar、视频主要界面使用 basename/折叠路径。
14. 不新增 dependency；`package.json`、`pnpm-lock.yaml` hash 在实施前后必须一致。
15. Vitest 继续使用 Node 环境；UI 行为用 Playwright，纯算法/投影用无 DOM 单测，不引入 jsdom/testing-library。
16. 不复制 Claude 名称、logo、品牌橙色、云端权限模式或私有交互。
17. 任务中发现公共协议、安全规则、一次提交语义或验收标准不可实现时回到 Spec；仅文件/顺序变化时修订 Task 并重新审批。
18. 不覆盖工作树中阶段 13/14 的既有改动；只修改本 Task 白名单文件。

## 4. 精确文件边界

### 4.1 Task 审批前允许修改

```text
docs/development/00-process.md
docs/development/15-workbench-home-workspace-ux-spec.md
docs/development/15-workbench-home-workspace-ux-tasks.md
docs/development/README.md
```

### 4.2 Task 批准后允许新增：Production

```text
app/sessions/[id]/page.tsx
app/sessions/[id]/loading.tsx

app/ui/home/new-task-page.tsx

app/ui/shell/app-shell.tsx
app/ui/shell/app-shell-provider.tsx
app/ui/shell/session-navigation.tsx

app/ui/workbench/bottom-sheet.tsx
app/ui/workbench/details-drawer.tsx
app/ui/workbench/session-workbench.tsx
app/ui/workbench/transcript.tsx
app/ui/workbench/typing-text.tsx

lib/client/catalog.ts
lib/client/transcript.ts
lib/client/typing.ts
```

### 4.3 Task 批准后允许修改：Production/config

```text
app/globals.css
app/layout.tsx
app/page.tsx

app/ui/workbench/composer.tsx
app/ui/workbench/icons.tsx
app/ui/workbench/markdown-message.tsx
app/ui/workbench/tool-card.tsx
app/ui/workbench/workspace-picker.tsx

lib/client/index.ts
lib/client/view-model.ts

next.config.ts
```

### 4.4 Task 批准后允许删除：被取代实现

仅在新实现完成、引用为零且相应测试已迁移后删除：

```text
app/ui/visual-stage/brand-stage.tsx
app/ui/visual-stage/morph-trail.tsx
app/ui/visual-stage/visual-stage.tsx

app/ui/workbench/event-entry.tsx
app/ui/workbench/run-inspector.tsx
app/ui/workbench/session-sidebar.tsx
app/ui/workbench/sheet.tsx
app/ui/workbench/timeline.tsx
app/ui/workbench/use-workbench.ts
app/ui/workbench/workbench.tsx

lib/client/morph-trail.ts
tests/unit/client/morph-trail.test.ts
```

若删除后仍存在有效业务需求，停止删除并在 Summary 说明；不得为了目录整洁误删可复用安全或事件逻辑。

### 4.5 Task 批准后允许新增：测试

```text
tests/unit/client/catalog.test.ts
tests/unit/client/transcript.test.ts
tests/unit/client/typing.test.ts

tests/e2e/new-task-session-navigation.spec.ts
```

### 4.6 Task 批准后允许修改：既有测试

```text
tests/unit/client/public-api.test.ts
tests/unit/client/security.test.ts
tests/unit/client/view-model.test.ts

tests/e2e/baseline.spec.ts
tests/e2e/fixtures.ts
tests/e2e/workspace-picker.spec.ts
tests/e2e/agent-workflow.spec.ts
tests/e2e/approval-cancel.spec.ts
tests/e2e/recovery-security.spec.ts
tests/e2e/responsive-visual.spec.ts
```

### 4.7 实施与总结文档

```text
docs/development/15-workbench-home-workspace-ux-tasks.md
docs/development/15-workbench-home-workspace-ux-summary.md
docs/development/README.md
```

### 4.8 明确禁止修改

```text
app/api/**
lib/server/**
lib/agent/**
lib/domain/**
lib/model/**
lib/context/**
lib/storage/**
lib/workspace/**
lib/tools/**
lib/approval/**
lib/terminal/**
cli/**

lib/client/api-client.ts
lib/client/event-state.ts
lib/client/markdown.ts
lib/client/ndjson.ts
lib/client/schemas.ts
lib/client/types.ts

tests/e2e/support/**
playwright.config.ts
package.json
pnpm-lock.yaml
tsconfig.json
vitest.config.mts
eslint.config.mjs
```

也禁止：安装依赖、修改真实 `.env`、触碰真实用户项目、删除/skip/only 测试、降低 coverage、Git commit/push、部署或生成最终视频/压缩包。

## 5. 模块依赖方向

```text
app/layout.tsx (Server Root Layout)
  → AppShellProvider (`use client`, 跨页面保留 catalog/runtime)
      → AppShell / SessionNavigation / WorkspacePicker
      → children
          ├── app/page.tsx → NewTaskPage
          └── app/sessions/[id]/page.tsx → SessionWorkbench

AppShellProvider
  → lib/client public API
  → browser fetch / ReadableStream / AbortController
  -X→ lib/server / node:* / Agent implementation

SessionWorkbench
  → durable EventLedger + live runtime subscription
  → buildTranscriptItems
  → Transcript / ToolCard / Approval / DetailsDrawer
```

禁止依赖：

```text
lib/client -X→ lib/server / node:* / next/server
app/ui      -X→ storage / tools / model provider config / raw filesystem
core        -X→ React / app/ui / lib/client
Sidebar     -X→ 每个 Session 的完整 events 拉取
```

## 6. T15-00：实施前基线与工作树保护

### 输入

- 已批准 Spec 修订 2 与已批准后的本 Task。
- 阶段 14 已批准 Summary 与当前 dirty worktree。

### 操作

1. 重读 Spec 第 7～24 节、本 Task、阶段 14 Summary。
2. 完整读取本机 Next.js 16.3.3 的 layout/page、dynamic segments、Link/navigation、Server/Client Component、accessibility 文档；记录实际路径和关键约束。
3. 记录 `git status --short`，把 pre-existing 阶段 13/14 改动与阶段 15 新改动分开。
4. 记录 `package.json`、`pnpm-lock.yaml` SHA-256。
5. 确认当前页面、Client API、event ledger、workspace picker 和 E2E 基线与 Spec 观察一致。
6. 串行运行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm test:e2e
git diff --check
```

### 完成条件

- 基线事实、测试数量、coverage、warning、hash 和 pre-existing diff 写入 Task 实施记录。
- 所有基线命令 exit 0；若失败，先记录并停止，不能用新实现掩盖基线失败。

### 覆盖

`NFR-001/002/008`、`AC15-14/15`。

## 7. T15-01：Catalog、标题与显示路径纯模块

### 输入

- Spec 8、9、11、AC15-01～05。
- `PublicSessionMetadata`、recent workspace 和 model config 现有 DTO。

### 先写失败测试

在 `catalog.test.ts` 固定：

- Session 稳定最近顺序和按 workspace 分组，不改变原 metadata。
- 当前 Session selected/state projection。
- workspace basename 与折叠路径不泄露不必要的个人目录段。
- prompt 首个非空行生成标题；最多 40 Unicode grapheme；中文、emoji、组合字符、空白、超长与空 fallback。
- configured model 默认选择；无可用模型返回显式不可提交状态。

### 实现

- `lib/client/catalog.ts` 提供纯函数和只读 view type。
- 不读取浏览器 location、filesystem 或环境变量。
- 不把折叠后的路径提交给 API；display label 与 canonical value 明确分开。
- 通过 `lib/client/index.ts` 精确导出 UI 需要的公共函数，安全测试固定无 server import。

### 最小验证

```text
pnpm exec vitest run tests/unit/client/catalog.test.ts tests/unit/client/public-api.test.ts tests/unit/client/security.test.ts
pnpm typecheck
```

### 完成条件

- 标题、分组、路径显示和模型默认值均为确定性纯逻辑。
- 不修改 API Schema、Session metadata 或 durable facts。

### 覆盖

`FR-008/009`、`SEC-006`、`AC15-01/02/03/05/12`。

## 8. T15-02：Transcript 纯视图投影

### 输入

- Spec 12、现有 `EventLedger`、`projectRun()`、`buildToolCards()`。

### 先写失败测试

在 `transcript.test.ts` 与必要的 `view-model.test.ts` 固定：

- user/assistant durable message 的稳定位置。
- 同 `runId + iteration` requested/completed 合为一个 round；只有 requested 时仍显示 running item。
- finish reason、duration、usage 只在已有事实时出现。
- tool requested/approval/started/result 按 `toolCallId` 合为一个 item，审批拒绝与不完整 lifecycle 不丢失。
- delta 按 `streamSeq` 形成唯一 draft；durable assistant 到达后 draft 消失且 final 只出现一次。
- context compacted、run terminal、unknown/incomplete 产生有限 status。
- 多 run、恢复分页合并和事件原顺序不串联。

### 实现

- `lib/client/transcript.ts` 定义 `TranscriptItem` 判别联合和 `buildTranscriptItems()`。
- 可以复用/收敛 `view-model.ts` 的 tool 逻辑，不复制 approval 映射。
- 投影不生成 seq、不改 event、不写持久化。

### 最小验证

```text
pnpm exec vitest run tests/unit/client/transcript.test.ts tests/unit/client/view-model.test.ts tests/unit/client/event-state.test.ts
pnpm typecheck
```

### 完成条件

- 每轮模型与每个 tool lifecycle 只有一个可渲染 item。
- durable 与 live 接管规则可由纯测试证明。

### 覆盖

`FR-005/006/008`、`AC15-06/07/09/14`。

## 9. T15-03：Unicode 打字调度纯模块

### 输入

- Spec 12.3、Transcript draft 数据。

### 先写失败测试

在 `typing.test.ts` 固定：

- `Intl.Segmenter` 与 fallback 都不拆中文、surrogate pair、emoji sequence 或组合字符。
- 30–60 grapheme/s 基础推进。
- backlog 增大时单帧释放多个 grapheme，视觉落后有界。
- tool/final/terminal/EOF 强制 flush。
- reduced-motion、hidden 和 test disabled 立即显示全部。
- repeated delta、较短 authoritative buffer 和 reset 不产生重复/越界。

### 实现

- `lib/client/typing.ts` 只提供 grapheme segmentation 与确定性推进 reducer/math。
- `typing-text.tsx` 后续只维护单一 rAF，不为每个 delta 创建 timer。
- 不在纯模块访问 React、DOM 或真实时间。

### 最小验证

```text
pnpm exec vitest run tests/unit/client/typing.test.ts
pnpm typecheck
```

### 完成条件

- 所有 animation policy 可被 Node 单测覆盖。
- 没有新增测试/动画依赖。

### 覆盖

`FR-005/008`、`NFR-007`、`AC15-08`。

## 10. T15-04：持久 App Shell Provider 与单运行 Runtime

### 输入

- T15-01～03 纯模块。
- 现有 `ApiClient`、NDJSON parser、EventLedger 与 run/approval/cancel 行为。

### 实现步骤

1. 新建 `AppShellProvider`，并在 `app/layout.tsx` 以 Client provider 包裹 Server children。
2. catalog 只加载 config、recent workspace、Session metadata；不得自动设 active Session 或读取 events。
3. 拆出新任务 draft、selected workspace/model、Drawer state、catalog refresh 和 active runtime。
4. 实现唯一 `createAndStart(prompt)`：锁定提交、创建一次 Session、把 metadata 加入 catalog、导航稳定 URL、启动 run stream。
5. runtime keyed by session ID；route child 订阅同一 ledger/transport，Provider 不因 `/ → /sessions/[id]` 卸载。
6. start/create/stream/error/final 均用有限状态；create 失败不导航、不清 draft；run start 失败保留已创建 Session 和可重试 prompt。
7. cancel、approval、stream reconciliation 复用现有语义；Provider 卸载/页面刷新 abort，随后由 durable history 恢复。
8. active 时统一提供 navigation guard，不能依赖每个按钮自行猜测。

### 最小验证

```text
pnpm typecheck
pnpm lint
pnpm exec vitest run tests/unit/client
```

### 完成条件

- `/` catalog 完成后保持无 active Session。
- create-and-start 有明确原子边界、防双击和失败恢复。
- route transition 不销毁 active stream owner。
- Client bundle 依赖扫描无 `lib/server`/`node:*`。

### 覆盖

`FR-002/006/007/008/009`、`SEC-006`、`AC15-01/03/05/10/14`。

## 11. T15-05：BottomSheet 与 Workspace Drawer

### 输入

- T15-04 Provider workspace state。
- 现有 picker browse/validate API 与 Stage 14 安全行为。

### 实现步骤

1. 新建通用 `bottom-sheet.tsx`，实现贴底几何、scrim、focus trap、background inert、Escape、close button、focus restore 与 reduced-motion。
2. 将 `workspace-picker.tsx` 收敛为 `WorkspaceDrawer`：只保留 recent、browse、validate、error 与选择。
3. Drawer 打开时不清空新任务 draft；选择成功设置 canonical workspace value，关闭并恢复 composer focus。
4. recent 点击仍重新 validate；browse 仍只发送 relative segments；stale request 使用 token/abort 忽略。
5. blocked/truncated/empty/root unavailable 使用有限中文状态；不回显 symlink target。
6. 删除 Launch 状态、Session 标题、模型和现有 Session 列表。

### 最小验证

```text
pnpm typecheck
pnpm lint
pnpm exec playwright test tests/e2e/workspace-picker.spec.ts --project=chromium
```

### 完成条件

- Desktop/移动 Sheet 均从底部出现而非居中。
- 键盘可完成打开、浏览、选择、关闭；业务安全断言不回归。
- draft 与 workspace canonical/display value 不混用。

### 覆盖

`FR-001`、`SEC-001/002/006`、`AC15-03/04/11/13`。

## 12. T15-06：App Shell、Session Sidebar 与响应式导航

### 输入

- T15-01 catalog 与 T15-04 Provider。

### 实现步骤

1. `app-shell.tsx` 建立 264px Sidebar + Main 的稳定布局。
2. `session-navigation.tsx` 渲染 SEcode、`新任务`、Workspace 入口、历史 Session 和有限配置/安全状态。
3. Session 用真实 URL 导航；selected 状态由 pathname/session ID 决定，不通过数组第一项推断。
4. active run 时拦截新任务、Workspace 和其他 Session，并显示“请先停止当前任务”。
5. 中屏折叠为 icon rail；移动以独立左侧/全高导航 Drawer 展开，不与 Workspace BottomSheet 或 details 混为一个 tab sheet。
6. Sidebar 不拉取任何 Session events，不显示完整绝对路径，不包含创建表单和 Inspector。

### 最小验证

```text
pnpm typecheck
pnpm lint
pnpm exec playwright test tests/e2e/new-task-session-navigation.spec.ts --project=chromium
```

### 完成条件

- Sidebar 只承载全局导航和 catalog。
- `/`、Session URL、desktop/tablet/mobile 导航语义稳定。
- active guard 由真实状态驱动且停止入口可达。

### 覆盖

`FR-007/008`、`NFR-001/007`、`AC15-01/02/05/10/13`。

## 13. T15-07：新任务主页与一次提交入口

### 输入

- T15-04 Provider、T15-05 Drawer、T15-06 Shell。

### 实现步骤

1. `app/page.tsx` 保持 Server Component，只渲染 `NewTaskPage` Client island。
2. 新任务主区提供唯一 H1、任务 textarea、workspace pill、model select、发送与固定安全说明。
3. 支持 Enter 发送、Shift+Enter 换行、IME composition，禁止空 prompt 与重复提交。
4. 未选择 workspace 时发送打开 Drawer 并保留 draft；无 configured model 时禁用并显示有限错误。
5. 调用 Provider `createAndStart()`，标题使用 T15-01 纯函数；成功导航 Session，失败保留 prompt/workspace/model。
6. 删除 full-viewport poster 在主流程的依赖；保留 SEcode wordmark/粉色 accent，不复制 Claude 品牌。

### 最小验证

```text
pnpm typecheck
pnpm lint
pnpm exec playwright test tests/e2e/new-task-session-navigation.spec.ts tests/e2e/baseline.spec.ts --project=chromium
```

### 完成条件

- 有历史访问 `/` 仍停留新任务页。
- 用户可以先写 prompt 再选 workspace，一次发送创建并启动正确 Session。
- 创建错误、模型错误和 workspace 错误不清空用户输入。

### 覆盖

`FR-001/002/009`、`NFR-007`、`AC15-01/03/04/12`。

## 14. T15-08：Session 路由、历史恢复与 Runtime 绑定

### 输入

- T15-04 Provider、现有分页 events API。

### 实现步骤

1. 新增 `app/sessions/[id]/page.tsx`，异步解析 `params: Promise<{ id: string }>`，只传 serializable ID。
2. 新增 `loading.tsx`，提供无布局跳变的有限骨架。
3. `session-workbench.tsx` 根据 URL ID 从 catalog 定位 metadata；找不到时在 catalog reload 后显示有限错误，不回退第一 Session。
4. 分页读取 durable events，保留 recovery facts 与 cursor 前进保护；切换 ID 时 abort 旧 history 请求。
5. 若 URL Session 正是 Provider active runtime，则合并 live stream；否则只显示 durable history。
6. 刷新、early EOF、network error 后调用既有 history reconciliation，不伪造 durable terminal event。
7. follow-up composer、continue draft、cancel 和 approval 保留既有请求语义。

### 最小验证

```text
pnpm typecheck
pnpm lint
pnpm exec playwright test tests/e2e/new-task-session-navigation.spec.ts tests/e2e/recovery-security.spec.ts --project=chromium
```

### 完成条件

- Session URL 可深链接和刷新恢复。
- 不同 ID 的 ledger、live delta、approval 和 run status 不串联。
- 缺失/错误 ID 不泄露 data path。

### 覆盖

`FR-005/006/007/008`、`NFR-001`、`SEC-006`、`AC15-05/09/10/14`。

## 15. T15-09：纯文本 Transcript、工具与审批

### 输入

- T15-02 transcript items、T15-03 typing、T15-08 Session runtime。

### 实现步骤

1. `transcript.tsx` 只消费 `TranscriptItem[]`，按稳定 item key 渲染连续文稿。
2. user/assistant/status/round 去除 card border/background；保留 label、time、divider 和状态词。
3. `typing-text.tsx` 使用单一 rAF 呈现 active draft；final/tool/terminal/EOF flush；history 不重播。
4. 将 `tool-card.tsx` 重构为 inline disclosure：收起单行，展开参数、replace diff、process argv/output、metadata、truncated/error。
5. approval form 内联于对应 tool item，保留 allow/reject/reason/loading/error；不能藏入 details。
6. `details-drawer.tsx` 按需展示 iteration、usage、context compact、完整路径和审计摘要；不常驻布局。
7. Markdown 安全 renderer 保持不启用 raw HTML/remote model image。

### 最小验证

```text
pnpm exec vitest run tests/unit/client/transcript.test.ts tests/unit/client/typing.test.ts tests/unit/client/view-model.test.ts tests/unit/client/markdown.test.ts
pnpm typecheck
pnpm lint
pnpm exec playwright test tests/e2e/agent-workflow.spec.ts tests/e2e/approval-cancel.spec.ts --project=chromium
```

### 完成条件

- 常规 transcript 无事件卡片墙；每轮和每个 tool lifecycle 只出现一次。
- 参数、输出、错误、审批与终态事实仍完整。
- live typing、final 接管和刷新 no-replay 由测试证明。

### 覆盖

`FR-005/006/007/008`、`AC15-06/07/08/09/10/14`。

## 16. T15-10：Claude Code Web 风格视觉、响应式与可访问性

### 输入

- T15-05～09 完成功能 DOM。

### 实现步骤

1. 重写 `app/globals.css` 的产品布局 token：克制中性色、轻分隔、264/56px Sidebar、880px transcript、紧凑控件与清晰 focus ring。
2. 移除玻璃三栏、巨大海报、装饰编号、常驻 Inspector 和 event card CSS。
3. 如 visual-stage 引用为零，按白名单删除组件、morph util/test，并从 `next.config.ts` 移除不再需要的远程图片 allowlist。
4. 定义 desktop/tablet/mobile/dvh/safe-area/soft-keyboard 布局；body 无滚动，Sidebar/Main/Transcript/Drawer 各自受控。
5. BottomSheet、navigation Drawer、details Drawer 互斥；背景 inert、focus restore、Escape 正确。
6. reduced-motion 禁用 Drawer 大位移和 typing；状态仍完整。
7. 页面 title/H1、route announcer、aria-live、selected/status 非纯颜色、icon accessible name 全部检查。

### 最小验证

```text
pnpm lint
pnpm typecheck
pnpm build
pnpm exec playwright test tests/e2e/responsive-visual.spec.ts tests/e2e/baseline.spec.ts --project=chromium
```

### 完成条件

- 产品主布局符合 Spec 8/9/11/14，而非旧海报三栏。
- 1440×900、tablet、mobile、keyboard、reduced-motion 均可操作。
- SEcode 品牌清晰且无 Claude logo/name/品牌复制。

### 覆盖

`NFR-001/007`、`SEC-006`、`AC15-01/02/04/06/12/13`。

## 17. T15-11：Client Unit 与静态安全回归

### 操作

1. 完整运行 `tests/unit/client`，确认新增纯模块覆盖分支。
2. 更新 public API 测试，仅导出 UI 需要的 catalog/transcript/typing；不导出内部 mutable state。
3. security test 扫描 Client source：无 `lib/server`、Node built-in、API Key/env、`dangerouslySetInnerHTML`、任意绝对路径输入和模型 remote image。
4. 确认删除 morph 后 coverage include 不产生未说明缺口。
5. 运行 coverage，不降低阈值、不加 ignore pragma。

### 验证

```text
pnpm exec vitest run tests/unit/client
pnpm test
pnpm test:coverage
pnpm typecheck
pnpm lint
```

### 完成条件

- Unit/integration 全通过；coverage 达到既有阈值。
- 新纯模块边界和 Client 安全依赖有自动证据。

### 覆盖

`NFR-002/008`、`SEC-006`、`AC15-07/08/11/14/15`。

## 18. T15-12：E2E 迁移与完整产品验收

### 测试迁移纪律

- 只更新因已批准信息架构变化而失效的 selector/入口。
- 优先 role/name/URL/status/tool fact，禁止用 CSS 几何代替业务断言。
- 旧海报视觉断言替换为新任务页/Sidebar/Transcript 视觉断言；安全、审批、取消、恢复与最终结果断言必须保留。
- 不修改 `tests/e2e/support/**` 假模型协议，不让假模型迁就 UI bug。

### 场景

1. `/` 新任务空态，有历史不自动选 Session。
2. prompt draft → bottom Workspace Drawer → browse/validate → draft 保留。
3. model/workspace/prompt 一次提交，单 Session、稳定 URL、run started。
4. Sidebar catalog/selected/navigation；active guard 与停止。
5. read/replace/test/final 完整闭环。
6. approval allow/reject、等待中 cancel。
7. refresh recovery、early EOF、provider failure、continue draft。
8. external symlink、stale response、truncated listing、Markdown/XSS/secret/path 隐私。
9. model round/tool lifecycle 单项渲染、typing/final/no-replay。
10. 1440×900、tablet、mobile、keyboard、reduced-motion。

### 验证

```text
pnpm test:e2e
```

要求：`workers=1`、`retries=0`，无 skip/only，所有项目使用隔离 picker root、data dir 和 loopback 假模型。

### 完成条件

- 全部既有及新增 E2E exit 0。
- 测试触碰的工作区均位于 fixture root，不读取真实 Key 或项目。

### 覆盖

`FR-001/002/005/006/007/008/009`、`NFR-007/008`、全部 `AC15-*`。

## 19. T15-13：全仓门禁与人工页面检查

### 自动门禁

串行执行并记录时间、exit code、测试数量、coverage 与 warning：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm test:e2e
git diff --check
```

重新计算 `package.json`、`pnpm-lock.yaml` SHA-256，与 T15-00 完全一致。

### 人工检查

在隔离 E2E 环境或无真实 Key 的本地页面检查：

- Desktop 1440×900：新任务页、Sidebar、Session transcript、details Drawer。
- Mobile：导航 Drawer、Workspace BottomSheet、Composer、审批与停止。
- Keyboard：从新任务到目录选择、发送、tool disclosure、审批、停止。
- Reduced motion：无位移/typing 强动画但信息完整。
- Network/image failure：功能不依赖海报或远程图。
- DOM/console/network：无 Key、base URL、reasoning、storage path、个人绝对路径泄露。

### 完成条件

- 自动门禁全部通过，人工检查没有阻断缺陷。
- 失败必须先记录真实现象、根因、修复和重跑结果；不得只写“最终通过”。

### 覆盖

全部 `NFR-*`、`SEC-*`、`AC15-*`。

## 20. T15-14：删除旧布局、文件边界与反思审计

### 操作

1. `rg` 确认旧 `Workbench`、`VisualStage`、event card、常驻 inspector、morph trail 和 remote lily 引用为零。
2. 删除 4.4 白名单中确认被取代的文件；不能删除仍被安全/事件实现引用的模块。
3. `rg --files` 与 `git status --short` 对照 4 节精确白名单，发现越界立即停止并恢复本阶段误改，不触碰用户已有变化。
4. 检查 `app/api/**`、`lib/server/**`、Agent/core、package/lock 无阶段 15 diff。
5. 检查 UI 未出现 Claude 名称/logo、伪 permission mode、任意路径输入、并行 run 或云能力暗示。
6. 对照 Spec 24 项门禁和 AC15-01～15，记录实现证据与验证证据。
7. 反思一次提交竞态、路由恢复、typing、响应式和测试迁移是否存在未覆盖风险。

### 最小验证

```text
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

### 完成条件

- 无死代码、越界文件、依赖变化或旧布局入口。
- 所有 Spec 条款有实现/测试证据或真实记录的限制。

## 21. T15-15：生成阶段 Summary 并停止

### 输出

生成：

```text
docs/development/15-workbench-home-workspace-ux-summary.md
```

Summary 必须包含：

- Spec/Task 审批记录。
- T15-00～T15-14 实际完成情况。
- 详细开发过程、关键状态与路由设计。
- 实际新增/修改/删除文件。
- 基线与最终 package/lock hash。
- 每条验证命令、exit code、测试数量和 coverage。
- 所有失败、诊断、修复与重跑。
- 与 Spec/Task 的偏差及原因。
- 安全/隐私/a11y/响应式检查。
- 人工页面检查结论、已知限制与阶段 16 影响。
- Summary 内部门禁与待用户审批状态。

同时更新 `docs/development/README.md` 为“阶段 15 Summary 待用户审批”。生成后立即停止，不开始阶段 16 观察。

## 22. 任务依赖顺序

```text
T15-00
  → T15-01 catalog/title
  → T15-02 transcript projection
  → T15-03 typing
  → T15-04 provider/runtime
  → T15-05 workspace drawer
  → T15-06 shell/sidebar
  → T15-07 new task
  → T15-08 session route/recovery
  → T15-09 transcript/tool/approval
  → T15-10 visual/responsive/a11y
  → T15-11 unit/security
  → T15-12 E2E
  → T15-13 full gates/manual
  → T15-14 cleanup/reflection
  → T15-15 Summary
```

不得跳过失败任务继续向后；可以在同一任务内并行运行互不写文件的检查，但验证命令最终按文档要求串行收口。

## 23. 失败处理与回退

- 基线失败：停在 T15-00，记录并请求用户决定是否扩大范围。
- 公共 API/事件/安全语义不足：停止实施，回到 Spec 修订，Task 审批失效。
- 仅文件白名单或任务顺序不足：修订本 Task，重新等待审批。
- create 成功/run 失败：保留单一 Session 和 retry UI；不得自动创建第二 Session。
- route transition 丢流：修复 Provider 生命周期，不退回单页内存 ID。
- history 与 live 冲突：durable event 权威，停止拼接并补回归测试。
- typing 阻塞事实：立即 flush/禁用动画，功能正确优先。
- Drawer focus/scroll 失败：保留安全选择流程，修正组件并完整重跑 keyboard/mobile。
- E2E 只因旧 selector 失败：迁移到新语义；业务结果失败必须修实现。
- 删除旧文件导致引用失败：只恢复确有用途的文件并在 Summary 记录，不恢复旧入口。
- 回退只使用 `apply_patch` 针对阶段 15 文件；禁止 `git reset --hard`、`git checkout --` 和覆盖整个 dirty worktree。

## 24. 明确不执行

- 不修改 Agent、模型、context、tools、approval、storage、workspace 或 Route Handler。
- 不新增 Session metadata/API/Event 字段。
- 不实现 Claude Code 的 GitHub、branch、PR、cloud、permission mode、drag-and-drop pane。
- 不实现 terminal、editor、diff、file tree、preview 或并行 Agent。
- 不实现 Session 删除、归档、重命名、搜索、固定。
- 不恢复绝对路径文本输入或 Native Finder/Explorer picker。
- 不新增依赖、字体、图标库、状态库或动画库。
- 不生成 README.txt、视频、ZIP，不 commit/push/deploy。
- 不执行真实 DeepSeek/LongCat 消费性冒烟；阶段 15 自动测试使用 loopback fake model，真实端点属于最终人工验收安排。

## 25. Task 内部门禁与审批请求

- [x] 已绑定 Spec 修订 2 和用户审批记录。
- [x] 已按依赖顺序拆分 pure model、runtime、UI、E2E、清理和 Summary。
- [x] 每项包含输入、操作、输出/完成条件、最小验证和需求覆盖。
- [x] 已固定精确新增、修改、删除和禁止文件边界。
- [x] 已固定 create-and-start、route stream、durable recovery 和 active navigation 纪律。
- [x] 已固定 Workspace Drawer、安全、Transcript、typing 与 a11y 验收。
- [x] 已定义基线、最小验证、全仓门禁、失败处理和回退。
- [x] 未修改 production、test、package、lockfile 或服务端协议。

**Task 编写内部门禁结论：通过。Task 已由用户批准并完成实施。**

## 26. 实施记录

实施日期：2026-08-28。用户批准 Task 后，已按依赖顺序完成：

- [x] `T15-00`：基线 lint/typecheck/test/coverage/build/E2E、hash 与既有 warning 固定。
- [x] `T15-01`：Session catalog、标题、workspace 显示路径与默认模型纯函数及测试。
- [x] `T15-02`：message、round、tool、status、live draft 的 Transcript 纯投影及测试。
- [x] `T15-03`：Unicode grapheme segmentation 与有界 typing 调度及测试。
- [x] `T15-04`：根布局持久 Provider、create-and-start、单 active runtime、取消/审批/协调。
- [x] `T15-05`：受限 Workspace BottomSheet、recent revalidate、browse stale abort、focus/inert。
- [x] `T15-06`：264px/72px App Shell、Session URL 导航、独立移动左侧 Drawer 与 active guard。
- [x] `T15-07`：`/` 新任务页、同一 Composer 的 prompt/workspace/model、一次提交与 IME 键盘规则。
- [x] `T15-08`：`/sessions/[id]`、异步 params、分页历史、稳定 URL、刷新恢复与 follow-up。
- [x] `T15-09`：纯文本 Transcript、模型轮次合并、tool disclosure、可见审批、typing 与详情 Drawer。
- [x] `T15-10`：浅暖中性 SEcode 视觉、响应式、safe-area、reduced-motion、a11y 与旧视觉移除。
- [x] `T15-11`：Client unit/public API/static security；11 files / 58 tests 通过。
- [x] `T15-12`：19 项 E2E 覆盖一次提交、真实工具闭环、审批、取消、恢复、安全与响应式。
- [x] `T15-13`：全仓 100 files / 747 tests、coverage、build、E2E、人工浏览器检查全部通过。
- [x] `T15-14`：旧海报/三栏/Inspector/morph/remote image 引用归零并删除，安全扫描为空。
- [x] `T15-15`：已生成阶段 Summary，并停止等待用户审批。

最终 hash 与基线一致：

```text
package.json     5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13
pnpm-lock.yaml   5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683
```

详细过程、失败修正、文件清单、验证与限制见 [15-workbench-home-workspace-ux-summary.md](./15-workbench-home-workspace-ux-summary.md)。
