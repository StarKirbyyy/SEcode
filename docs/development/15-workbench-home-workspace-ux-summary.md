# 阶段 15 Summary：Claude Code Web 风格工作区与 Session 纯文本体验重构

## 1. 文档状态与审批门禁

- 当前状态：已批准，阶段完成。
- 完成日期：2026-08-28（北京时间）。
- 前置 Spec：[15-workbench-home-workspace-ux-spec.md](./15-workbench-home-workspace-ux-spec.md) 修订 2，用户于 2026-08-28 明确批准。
- 前置 Task：[15-workbench-home-workspace-ux-tasks.md](./15-workbench-home-workspace-ux-tasks.md)，用户于 2026-08-28 明确批准。
- 用户审批：用户于 2026-08-28 明确回复“批准”。
- 阶段边界：本 Summary 获批后不再追加阶段 15 功能；后续需求进入新的 Spec/Task/Summary 门禁。
- 审批结果：阶段 15 正式完成，已解锁阶段 16 的只读观察与 Spec 编写。

## 2. 阶段目标与最终结论

阶段 15 已将阶段 14 的“海报 + 三栏玻璃工作台”完整替换为本地 SEcode 品牌的 Claude Code Web 式任务工作流：

```text
持久 App Shell
├── Session / Workspace 导航
└── Main
    ├── /                  新任务主页
    │   └── prompt + workspace + model + 一次提交
    └── /sessions/[id]     稳定 Session 页面
        ├── 纯文本 Transcript
        ├── inline tool / approval
        ├── 按需运行详情
        └── follow-up Composer

Workspace BottomSheet：只选择和验证目录
Mobile Navigation：独立左侧全高 Drawer
```

核心 Agent、模型、工具、审批、工作区安全、Route Handler、Zod DTO 与 JSONL 协议没有改变。JSONL durable events 仍是历史唯一事实源；Provider 只拥有 catalog、未提交输入和当前流连接。

最终结论：全部 `T15-00`～`T15-15` 完成；100 个 Vitest 文件、747 项测试、19 项 Playwright E2E、lint、typecheck、coverage、生产构建和静态安全扫描通过；package/lock hash 未变化；阶段 15 没有阻断缺陷。

## 3. 实际开发顺序

1. 固定阶段 14 基线、package/lock hash、Next.js 16.3.3 本地文档和文件白名单。
2. 测试先行实现 catalog/title/path/model、Transcript 投影和 Unicode typing 三组纯模块。
3. 在根布局建立持久 Client Provider，使 `/ → /sessions/[id]` 路由变化不销毁 active NDJSON stream。
4. 实现 BottomSheet、Workspace Drawer、Session Sidebar、desktop rail 与独立 mobile navigation Drawer。
5. 实现 `/` 新任务主页及 prompt/workspace/model 的一次提交 create-and-start。
6. 实现动态 Session 路由、分页 durable history、live ledger 绑定、刷新/EOF 协调和 follow-up。
7. 实现纯文本 Transcript、模型轮次单行、tool lifecycle disclosure、可见审批与实时打字效果。
8. 重写视觉和响应式 CSS，删除旧海报、三栏、常驻 Inspector、事件卡片与 morph 资源。
9. 迁移/新增 E2E，完成安全、响应式、人工浏览器和全仓门禁。
10. 对照 Task 反思时发现移动导航曾复用 BottomSheet，立即改为独立左侧全高 Drawer，再完整重跑。

开发顺序与已批准 Task 的依赖顺序一致，没有修改公共协议或扩大产品范围。

## 4. 关键架构与状态设计

### 4.1 持久 App Shell Provider

`AppShellProvider` 位于根 layout，跨页面导航保持实例：

- config、recent workspace 和 Session metadata 独立加载；`/` 不自动选择第一条历史。
- `history` 只保存当前 URL Session 的 `EventLedger` 和 recovery facts。
- `activeSessionId`、`activeRunId`、`runTransport` 和唯一 `AbortController` 保证单标签单运行。
- `submissionLock` 同时阻止新建 Session 双击和并行 run。
- `createAndStart()` 先创建一次 Session、合并 `session.created`、导航稳定 URL，再在同一 Provider 启动流。
- create 失败不导航、不清 prompt；run start 失败保留已经创建的 Session 和可重试 prompt。
- `user.message` 到达后才清 draft；terminal/EOF 后重新读取 durable history 协调。
- active 时统一拒绝新任务、Workspace 和其他 Session 导航，停止与审批仍可达。

### 4.2 路由与恢复

- `app/page.tsx` 保持 Server Component，只渲染新任务 Client island。
- `app/sessions/[id]/page.tsx` 按 Next.js 16 约定异步 `await params`，只向 Client 传 serializable ID。
- `loading.tsx` 提供有限骨架；页面按 URL ID 查找 metadata，不回退第一 Session。
- events API 从 `after=0` 分页恢复并保持游标前进保护；切换 ID 时 abort 旧请求。
- 当前 URL 若对应 active runtime，就消费 Provider 的 live + durable ledger；否则只显示恢复的 durable facts。

### 4.3 新任务与 Workspace

- 根路径始终显示新任务 H1、textarea、workspace pill、model select 和固定本地安全说明。
- Enter 发送、Shift+Enter 换行；composition 期间不误提交中文 IME。
- 未选择 workspace 时发送会打开 Drawer，并保留 prompt；没有 configured model 时显示有限错误并禁用发送。
- 标题取 prompt 第一条非空行，最多 40 个 Unicode grapheme。
- Workspace Drawer 从底部上拉，只包含 recent、受限目录 browse、validate 和错误事实。
- recent 也重新 validate；browse 只发送 relative segments；stale response 用 request ID 和 AbortController 丢弃。
- Sidebar 主界面只显示 basename/折叠路径；完整 canonical path 只在 Workspace Drawer 或运行详情中出现。

### 4.4 Transcript 与 typing

- `buildTranscriptItems()` 将 requested/completed 按 `runId + iteration` 合成一个 round。
- tool requested/approval/started/result 按 `toolCallId` 合成一个 tool item。
- durable user/assistant message 保持事件位置；live delta 按 `streamSeq` 合成唯一 draft；final 到达后 draft 消失。
- 常规消息、round、status 均无对话框外框；tool 使用单行 `details/summary` 渐进披露。
- approval form 位于 tool item 外层，不因 disclosure 收起而隐藏。
- `TypingText` 使用单一 rAF、`Intl.Segmenter`/fallback grapheme、45 grapheme/s 和约 250ms 最大视觉落后。
- final/tool/terminal/EOF、hidden、reduced-motion 和 disabled 立即 flush；刷新后的历史消息不重播。

## 5. 视觉、响应式与可访问性

- 使用浅暖中性色、轻分隔、紧凑控件和 SEcode 粉色强调，不复制 Claude 名称、logo、品牌橙色或云能力。
- desktop 为 264px Sidebar；tablet 为 72px icon rail；mobile 使用独立左侧全高会话 Drawer。
- Transcript 最大 880px 居中；body 无滚动，Sidebar、Transcript、BottomSheet、Details 各自受控。
- Workspace 使用底部 Sheet；运行详情使用右侧 Drawer；移动导航不与二者混为 tab sheet。
- overlay 均提供 scrim、`aria-modal`、background inert、focus trap、Escape 和 focus restore。
- H1/title、landmark、label、`aria-current`、`aria-live`、非颜色状态、icon accessible name 均已实现。
- `100dvh`、safe-area 和移动底部 Composer 已适配；reduced-motion 禁用大位移和 typing caret 动画。
- 长消息和 tool item 使用 CSS `content-visibility` 降低长历史首屏渲染成本。

## 6. 实际文件变化

### 新增 Production

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

### 修改 Production/config

```text
app/globals.css
app/layout.tsx
app/page.tsx
app/ui/workbench/composer.tsx
app/ui/workbench/icons.tsx
app/ui/workbench/tool-card.tsx
app/ui/workbench/workspace-picker.tsx
lib/client/index.ts
next.config.ts
```

### 新增/修改测试

```text
tests/unit/client/catalog.test.ts
tests/unit/client/transcript.test.ts
tests/unit/client/typing.test.ts
tests/unit/client/public-api.test.ts
tests/unit/client/security.test.ts
tests/e2e/new-task-session-navigation.spec.ts
tests/e2e/fixtures.ts
tests/e2e/baseline.spec.ts
tests/e2e/workspace-picker.spec.ts
tests/e2e/agent-workflow.spec.ts
tests/e2e/approval-cancel.spec.ts
tests/e2e/recovery-security.spec.ts
tests/e2e/responsive-visual.spec.ts
```

### 删除（引用归零后）

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

未修改 `app/api/**`、`lib/server/**`、Agent/core、client DTO/API/event/NDJSON/Markdown 安全模块、package、lock、tsconfig、Vitest/Playwright 基础配置或 E2E support fake-model 协议。

## 7. 测试与验证结果

### 基线

- Node `v24.15.0`，pnpm `10.33.3`。
- `pnpm lint`：exit 0；0 errors，2 个 coverage 生成文件既有 warning。
- `pnpm typecheck`：exit 0。
- `pnpm test`：98 files / 739 tests，通过。
- `pnpm test:coverage`：Statements 87.50%，Branches 80.42%，Functions 90.17%，Lines 89.19%。
- `pnpm build`：通过，保留既有 `lib/storage/file-safety.ts` Turbopack 动态文件 tracing warning。
- `pnpm test:e2e`：14/14，通过。

### 最终

| 门禁 | 结果 |
| --- | --- |
| Client 指定集 | 11 files / 58 tests，通过 |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0；0 errors，2 个既有 coverage warning |
| `pnpm test` | 100 files / 747 tests，通过 |
| `pnpm test:coverage` | 100 files / 747 tests，通过 |
| Statements | 87.70% |
| Branches | 80.66% |
| Functions | 90.37% |
| Lines | 89.28% |
| `pnpm test:e2e` | 19/19，通过；workers=1，retries=0 |
| `pnpm build` | Next.js 16.3.3，通过；`/`、`/sessions/[id]` 与 10 个 API route |
| client security `rg` | 无 server/Node/Key/env/raw HTML/Claude/旧视觉引用 |
| `git diff --check` | exit 0 |

最终 hash 与基线完全一致：

```text
package.json     5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13
pnpm-lock.yaml   5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683
```

## 8. 失败、诊断、修正与重跑

1. 基线首次 E2E 遇到已有 Next dev lock（记录 PID 93691）；准备在用户允许后处理时进程已自行结束，未终止用户进程；重跑 14/14 通过。
2. Transcript 首次 typecheck 暴露 Zod 推断 `runId` 可选；对无 runId 的异常 durable 事件显式降级为有限 status，避免非空断言。
3. 新 Provider/typing 初次 lint 命中 React 19 `set-state-in-effect`，并发现 ref 初始化与 exact optional typing；bootstrap 改为直接异步回调、history 用 microtask 启动、typing 的即时 flush 进入同一 rAF，typecheck/lint 重跑通过。
4. 首轮新 E2E 为 16/19：取消终态实际为“任务运行已取消”而测试仍断言旧文案；Session 数量在 catalog 异步完成前取基线；浏览器把 `0.01ms` 规范化为 `1e-05s`。均按可见语义/数值事实修正，针对性 3/3 与完整 19/19 通过。
5. 最终 Task 对照发现移动会话导航错误复用了 BottomSheet，不符合“独立左侧全高 Drawer”。在 `app-shell.tsx` 和 CSS 内改为独立 portal、left geometry、focus trap/inert/Escape；首次针对性测试仅因 dialog accessible name 从“会话导航”变为 H2“会话与任务”失败，修正 role/name 断言后完整 19/19 与 build 再通过。

没有通过降低业务断言、跳过测试、改变假模型或修改公共 API 制造通过结果。

## 9. 安全、隐私与边界审计

- Client source 无 `lib/server`、Node built-in、`process.env`、Key 名称、Authorization、base URL、reasoning 或 `dangerouslySetInnerHTML`。
- Sidebar/Composer 只展示 basename、折叠路径或“已验证”；完整路径只在目录选择与运行详情的必要上下文出现。
- Workspace recent 不能绕过 validate；browse 继续使用 relative segments，越界/symlink 事实仍由既有服务端安全层裁决。
- Markdown 继续 `skipHtml`，javascript URL 被移除，模型远程图片不实例化为 `<img>`。
- Provider 不保存 localStorage/sessionStorage，不写 durable 事件，不生成伪 terminal 或并行 run。
- 删除了仅服务旧百合图片的 Next remote allowlist，产品不再发起远程视觉资源请求。
- package/lock 无变化；没有真实 DeepSeek/LongCat 调用、API Key、真实测试项目写入、依赖安装或 Git 外部操作。

## 10. 人工页面检查

使用本地 `pnpm dev` 和浏览器控制完成：

- Desktop 默认视口：主页视觉层级、264px Sidebar、workspace/model/prompt、no-scroll。
- Workspace BottomSheet：recent、当前路径、目录列表、scrim、底部几何和动作区可见。
- 既有 Session：URL 导航、selected 状态、纯文本记录、详情按钮和底部 Composer。
- Mobile 390×844：48px 顶栏、Session header、Transcript、底部 Composer；独立移动导航由 E2E 验证 focus/Escape。
- reduced-motion、1440×900、mobile、详情 Drawer 由 E2E 验证。

开发模式左下角的 Next.js Dev Tools 浮标会与极窄移动 Composer 边缘接近；它不进入 production build，不是产品元素或生产缺陷。

## 11. 与 Spec/Task 的偏差

最终实现没有公共语义偏差。实施中发现的移动导航 BottomSheet 偏差已在 Summary 生成前修正，并完成全量回归。

局部实现选择：

- Task 建议 desktop/tablet 为 264/56px；最终 tablet 使用 72px rail，以保证图标按钮 38px、focus ring 和触控间距不拥挤。信息架构、折叠语义和响应式验收不变。
- App Shell 使用 root Suspense 包裹 `usePathname` Client 壳，符合本地 Next.js 16 动态路由文档；没有把 pathname 或 Session state下沉到服务端。

这些选择不改变需求、API、安全边界或验收结果，不需要回退 Spec。

## 12. 已知限制与后续阶段影响

- 仍只适用于可信本地单用户，没有 OS 强沙箱或恶意代码安全承诺。
- 一个标签页只运行一个 Agent；没有并行任务、Session 删除/改名/搜索/归档、文件树、编辑器、diff pane 或 terminal pane。
- Workspace picker 仍是单个服务端配置 root，不是 Native Finder/Explorer。
- 超长 Transcript 使用 `content-visibility` 而非窗口虚拟化；极端多年历史仍可能需要后续虚拟列表，但当前 64 KiB 工具输出与事件分页边界可控。
- 生产构建仍有阶段 14 已记录的 `file-safety.ts` 动态文件 tracing warning；本阶段未越权修改 storage 或隐藏 warning。
- LongCat 真实端点仍由用户明确跳过；阶段 15 只使用 loopback generic fake model，不宣称 LongCat 冒烟通过。
- 最终交付阶段需要基于新主页/Session 录制两分钟视频并更新最终 README/README.txt；不能继续使用阶段 14 海报截图或三栏脚本。用户后续增加 Session 删除阶段后，最终交付现顺延为阶段 17。

## 13. 反思

- 根 Provider 是本次最关键的正确性边界：如果 stream owner 放在 Session page，创建后导航会卸载请求；当前设计用稳定 root owner 避免该竞态。
- “create 成功、run 失败”不是事务回滚场景；保留已创建 Session 和 prompt 比自动再建 Session 更可审计。
- Transcript 投影必须保持事件不可变，并对 missing requested/completed、未知/不完整生命周期提供有限显示；纯函数测试比 JSX 快照更可靠。
- typing 是展示层，任何 final/tool/approval/terminal 事实都必须优先 flush；动画不能成为状态真相。
- 视觉重构后仍需逐条对照 Task；仅靠 E2E 可通过却仍可能存在几何语义偏差，移动导航问题正说明文档反思门禁有实际价值。

## 14. Summary 内部门禁与审批请求

- [x] Spec 修订 2 和 Task 均有明确用户批准记录。
- [x] `T15-00`～`T15-15` 全部完成。
- [x] 实现与 Spec/Task 的功能、安全和信息架构一致。
- [x] 单元、集成、coverage、lint、typecheck、build、19 项 E2E 和人工检查通过。
- [x] 所有失败、原因、修正和重跑已如实记录。
- [x] package/lock hash 不变，无秘密、真实端点消费或越界生产改动。
- [x] 旧海报/三栏/morph/remote image 死代码已删除。
- [x] 已记录已知限制、反思与阶段 16 影响。
- [x] 文档索引已更新为“阶段 15 已批准，阶段完成”。

**内部门禁结论：通过。用户审批结论：阶段 15 Summary 已批准，阶段正式完成。**

用户已批准本 Summary；阶段 15 到此归档，后续工作遵循新的阶段门禁。
