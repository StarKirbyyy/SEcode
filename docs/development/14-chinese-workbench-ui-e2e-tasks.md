# 阶段 14 Task：中文工作台、受限目录弹窗、海报视觉层与 UI E2E

## 1. 文档状态与审批链

- 当前状态：Summary 已批准，阶段 14 正式完成。
- 生成日期：2026-08-28。
- 已批准 Spec：[14-chinese-workbench-ui-e2e-spec.md](./14-chinese-workbench-ui-e2e-spec.md) 修订 2。
- Spec 审批记录：用户于 2026-08-28 明确批准。
- 字体决策：用户未提供 Orbit TTF/base64；按已批准 Spec 使用 Geist Sans、Georgia/Times 与 Geist Mono fallback，不下载或伪造字体。
- Task 审批记录：用户于 2026-08-28 明确批准。
- Summary 审批记录：用户于 2026-08-28 明确批准。
- 当前允许：进入阶段 15 的只读观察与 Spec 编写。
- 当前禁止：跳过阶段 15 Spec 审批、提前生成 Task 或实施、Git commit/push/deploy。
- 下一门禁：T14-00 基线全部通过后进入 T14-01；T14-18 全部门禁通过后生成 Summary 并再次等待审批。

审批链：

```text
阶段 14 Spec 修订 2（已批准）
  → 本 Task（已批准）
  → T14-00 基线与边界固定
  → T14-01～T14-03 picker contract/service/route
  → T14-04～T14-08 客户端协议、事件与 morph 纯模块
  → T14-09～T14-14 海报视觉层、工作台与可访问交互
  → T14-15～T14-17 隔离 E2E 环境与产品验收
  → T14-18 全仓门禁、人工检查与安全审计
  → T14-19 Summary
  → 用户审批 Summary
```

## 2. 实施目标

严格实现已批准 Spec 的完整浏览器闭环：

```text
受限目录弹窗
  → validate canonical workspace
  → create/fetch Session
  → POST NDJSON run
  → 实时事件时间线
  → approval / cancel / recovery
  → durable history reconciliation
```

同时将用户给出的 Orbit 海报视觉母版按已批准映射实现为 SEcode：固定 `#161616` 舞台、白/粉 SECODE 字标、两张指定百合、一次性入场、桌面 morph trail 和移动磨砂 sheet。视觉层不能改变 Agent 事实、安全策略或功能可用性。

## 3. 实施不变量

开发期间始终成立：

1. JSONL durable events 仍是历史唯一事实源；浏览器状态不形成第二套持久化任务真相。
2. 阶段 13 九个 API 和 `AgentEvent` Schema 不变；本阶段只新增 `POST /api/workspaces/browse`。
3. Browse 客户端只提交 relative segments；绝对路径只由服务端 canonical `realpath` 产生。
4. Picker root 只来自 `SECODE_WORKSPACE_PICKER_ROOT`，不自动扩大到 HOME、cwd parent、最近路径或文件系统根。
5. `lib/workspace/**` 安全语义不复制、不弱化、不修改；picker 服务复用既有 handle/resolve 边界。
6. Route Handler 显式 Node runtime，并复用阶段 13 host/origin/body/error/header 纪律。
7. Client runtime 不导入 `lib/server`、Node built-in、模型配置、存储或工具执行器。
8. 所有服务端 JSON、浏览器 JSON 和 NDJSON 都经 strict Zod/runtime schema 校验。
9. 同一标签页只维护一个 active stream；运行中不能切换或新建 Session。
10. HTTP/流故障不伪造 durable `run.failed`；结束后以 events API 协调。
11. 审批和停止只调用既有 API，不在 UI 复制风险判断或 Agent 取消逻辑。
12. Markdown 不启用 raw HTML，不自动加载模型提供的远程图片，不使用 `dangerouslySetInnerHTML`。
13. 只有两个指定 Higgsfield URL 可作为产品图片；模型、事件和 query 不能改变它们。
14. Canvas 只绘制白色 mask；不读取跨源图片像素，不接触工作区或 Agent 内容。
15. reduced-motion、coarse pointer 和 hidden document 必须停止 morph trail；组件卸载无残留 RAF/listener。
16. 页面 body 无滚动，长内容只在面板内部滚动；视觉层不遮挡输入、审批和停止。
17. 不新增 UI 库、状态库、图标库、字体或 Agent 框架；package/lock hash 应保持不变。
18. 自动测试只接触登记临时 root、独立 data dir 和 loopback 假模型，不读取真实 Key。
19. LongCat 真实冒烟继续为外部阻塞，不在本阶段冒充通过。
20. 任一公共接口、安全边界或验收语义必须变化时立即停止并回到 Spec；仅文件/顺序变化则修订 Task 后重新审批。

## 4. 精确文件边界

### 4.1 Task 编写阶段允许修改

```text
docs/development/14-chinese-workbench-ui-e2e-spec.md
docs/development/14-chinese-workbench-ui-e2e-tasks.md
docs/development/README.md
```

此时不得产生 production、test、config 或依赖变化。

### 4.2 Task 批准后允许新增：Production

```text
app/error.tsx
app/api/workspaces/browse/route.ts

app/ui/visual-stage/brand-stage.tsx
app/ui/visual-stage/morph-trail.tsx
app/ui/visual-stage/visual-stage.tsx

app/ui/workbench/composer.tsx
app/ui/workbench/event-entry.tsx
app/ui/workbench/icons.tsx
app/ui/workbench/markdown-message.tsx
app/ui/workbench/run-inspector.tsx
app/ui/workbench/session-sidebar.tsx
app/ui/workbench/sheet.tsx
app/ui/workbench/timeline.tsx
app/ui/workbench/tool-card.tsx
app/ui/workbench/use-workbench.ts
app/ui/workbench/workbench.tsx
app/ui/workbench/workspace-picker.tsx

lib/client/api-client.ts
lib/client/event-state.ts
lib/client/index.ts
lib/client/markdown.ts
lib/client/morph-trail.ts
lib/client/ndjson.ts
lib/client/schemas.ts
lib/client/types.ts
lib/client/view-model.ts

lib/server/workspace-picker.ts
```

### 4.3 Task 批准后允许修改：Production/config

```text
.env.example
app/globals.css
app/layout.tsx
app/page.tsx
lib/server/application.ts
lib/server/bootstrap.ts
lib/server/errors.ts
lib/server/index.ts
lib/server/schemas.ts
lib/server/types.ts
next.config.ts
playwright.config.ts
```

`package.json`、`pnpm-lock.yaml`、`tsconfig.json`、`vitest.config.mts` 和 `eslint.config.mjs` 不在白名单；若实现要求修改，停止并修订 Task。

### 4.4 Task 批准后允许新增：测试

```text
tests/unit/client/api-client.test.ts
tests/unit/client/event-state.test.ts
tests/unit/client/markdown.test.ts
tests/unit/client/morph-trail.test.ts
tests/unit/client/ndjson.test.ts
tests/unit/client/public-api.test.ts
tests/unit/client/schemas.test.ts
tests/unit/client/security.test.ts
tests/unit/client/view-model.test.ts

tests/unit/server/workspace-picker.test.ts
tests/integration/server/workspace-picker-route.test.ts

tests/e2e/fixtures.ts
tests/e2e/workspace-picker.spec.ts
tests/e2e/agent-workflow.spec.ts
tests/e2e/approval-cancel.spec.ts
tests/e2e/recovery-security.spec.ts
tests/e2e/responsive-visual.spec.ts
tests/e2e/support/fake-model-server.ts
tests/e2e/support/runtime-manifest.ts
tests/e2e/support/start-environment.ts
```

### 4.5 Task 批准后允许修改：既有测试

```text
tests/e2e/baseline.spec.ts
tests/integration/server/helpers.ts
tests/unit/server/application.test.ts
tests/unit/server/bootstrap.test.ts
tests/unit/server/errors.test.ts
tests/unit/server/public-api.test.ts
tests/unit/server/schemas.test.ts
tests/unit/server/security.test.ts
```

### 4.6 实施与总结文档

```text
docs/development/14-chinese-workbench-ui-e2e-tasks.md
docs/development/14-chinese-workbench-ui-e2e-summary.md
docs/development/README.md
```

### 4.7 明确禁止修改

```text
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
app/api/config/**
app/api/workspaces/recent/**
app/api/workspaces/validate/**
app/api/sessions/**
app/api/runs/**
package.json
pnpm-lock.yaml
tsconfig.json
vitest.config.mts
eslint.config.mjs
```

禁止删除既有测试、降低覆盖率阈值、加入 ignore pragma 隐藏真实失败、Git commit/push、安装依赖或修改真实用户项目。

## 5. 模块依赖方向

```text
app/page.tsx (Server Component)
  → app/ui/workbench/workbench.tsx (`use client` root)
      → lib/client/*
      → browser fetch / ReadableStream / AbortController

app/api/workspaces/browse/route.ts
  → lib/server public barrel
      → workspace-picker service
          → lib/workspace public boundary
          → node:fs/promises directory enumeration

visual-stage client subtree
  → lib/client/morph-trail pure math
  -X→ Agent reducer / server modules / workspace data
```

禁止依赖：

```text
lib/client -X→ lib/server / node:* / next/server
app/ui      -X→ raw tools / storage / model config
lib/server  -X→ React / app/ui
core        -X→ lib/client / app/ui / browse route
```

## 6. T14-00：实施前基线与工作树保护

### 输入

- 已批准 Spec 修订 2 与本 Task。
- 阶段 13 已批准服务端基线和当前文档 diff。

### 操作

1. 重读 Spec 第 6～18 节、本 Task 和 Next.js 16.3.3 本地 Route Handler、RSC、Image、font、error 与 hydration 文档。
2. 记录 `git status --short`，区分已有阶段 13/14 文档变化和本阶段实现变化。
3. 记录 `package.json`、`pnpm-lock.yaml` SHA-256，结束时必须一致。
4. 确认 `lib/client`、`app/ui`、browse route 和阶段 14 test 文件尚不存在。
5. 串行运行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

6. 基线失败时停止并记录；不得先写实现掩盖既有失败。

### 输出与完成条件

- 在本 Task 实施记录中写入命令结果、测试数量、现有 warning、hash 和 pre-existing diff。
- 五道基线 exit 0；无 production/test/config 变化。

### 覆盖

`NFR-001/002/008`、`COM-001/004`、`AC14-08`。

## 7. T14-01：Picker DTO、Schema、错误与公共边界

### 输入

- Spec 7.3、7.4、14、AC14-10。
- 阶段 13 server types/schemas/errors/public barrel。

### 先写失败测试

- 在 server schemas/errors/public-api/security tests 固定 Browse request/response DTO、五个错误码和 HTTP 映射。
- 覆盖 segments 0/64/65、单段 1/255/256、4096-byte 总长、Unicode 与所有禁止字符/语义。
- 固定 strict object 拒绝未知 key；public barrel 只增加 route/service 所需 exports，不导出测试 reset、fs adapter 或 workspace capability。

### 实现

- `lib/server/types.ts` 增加 `BrowseWorkspaceRequest/Response`、entry/root/current DTO 和 `ServerApplication.browseWorkspaces()`。
- `lib/server/schemas.ts` 增加 strict request schema、固定 64/255/4096/500 常量。
- `lib/server/errors.ts` 增加五个有限错误码和 400/403/500/503 映射，不改变既有 code 状态。
- `lib/server/index.ts` 精确导出 route 所需 DTO/Schema。

### 最小验证

```text
pnpm exec vitest run tests/unit/server/schemas.test.ts tests/unit/server/errors.test.ts tests/unit/server/public-api.test.ts tests/unit/server/security.test.ts
pnpm typecheck
```

### 输出与完成条件

- 公共 contract 与 Spec 逐字段一致；未知字段和越界输入稳定失败。
- 尚未读取文件系统、尚未新增 route。

### 覆盖

`FR-001`、`NFR-002/003`、`SEC-001/002/006`、`AC14-10`。

## 8. T14-02：Picker root 与目录枚举服务

### 输入

- T14-01 contract。
- 既有 `createWorkspaceHandle`、`resolveExistingWorkspacePath` 和 workspace error model。

### 先写失败测试

`tests/unit/server/workspace-picker.test.ts` 必须覆盖：

- env 缺失/空/相对/文件/文件系统根/不存在/不可读与 canonical symlink root。
- 空 segments 浏览根、嵌套 Unicode、dot-directory、固定 ignore、只列目录和字典序。
- 500 条上限、`truncated`、`blockedEntries`、`ignoredEntries`。
- internal symlink 标记；external symlink、断链、权限拒绝、当前路径变文件和 root identity 变化。
- 请求和枚举之间、枚举前后发生替换时不返回越界或陈旧路径。
- 未分类 fs error 只映射有限 picker error，不泄漏 cause/stack/root 外路径。

### 实现

- `lib/server/workspace-picker.ts` 定义 production service 与测试可注入 fs adapter。
- 初始化时只读取 `SECODE_WORKSPACE_PICKER_ROOT`，经现有 workspace handle 规范化并绑定 identity。
- 将已验证 segments 转为 POSIX relative path，再通过现有 workspace resolver 得到 current；不得直接信任 `path.join(root, clientValue)`。
- `readdir({withFileTypes:true})` 后逐个通过边界解析目录/symlink；固定 ignore，最多返回排序后前 500 项。
- 枚举前后复核 root/current identity；错误使用 T14-01 code。

### 最小验证

```text
pnpm exec vitest run tests/unit/server/workspace-picker.test.ts tests/unit/workspace/boundary.test.ts
pnpm typecheck
```

### 输出与完成条件

- 服务只能观察配置根内目录名，不能返回文件或越界 symlink。
- 不修改 `lib/workspace/**`。

### 覆盖

`FR-001`、`SEC-001/002/008`、`NFR-003`、`AC14-02/10`。

## 9. T14-03：Application 集成与 Browse Route Handler

### 输入

- T14-01 DTO/Schema、T14-02 service、阶段 13 HTTP facade。

### 先写失败测试

- 更新 application/bootstrap tests，固定同一进程复用 picker service，初始化失败不破坏历史 Session API。
- `workspace-picker-route.test.ts` 覆盖 POST success、strict body、Content-Type、8 MiB、loopback、Origin、no-store/nosniff、五种 error status 和并发 browse。
- 集成测试从 browse 选中 canonical workspace，经 validate/create Session；中间替换目录时 create 失败。
- public/security tests 确认 route 不含 raw path join、shell、tool、CORS、secret 或 debug log。

### 实现

- `ServerApplication` 组合 picker service；既有方法行为不变。
- `bootstrap.ts` 在共享 runtime 中惰性初始化 picker 状态；picker 不可用只影响 browse，不让 config/sessions/events 崩溃。
- 新增 `app/api/workspaces/browse/route.ts`，显式 `runtime="nodejs"`，只做 guard/body/schema/application/response 组合。
- `.env.example` 增加无真实用户路径的 picker 配置说明。

### 最小验证

```text
pnpm exec vitest run tests/unit/server tests/integration/server/workspace-picker-route.test.ts
pnpm typecheck
pnpm build
```

### 输出与完成条件

- 第十个 method contract 可用，已有九个 route 回归通过。
- 缺少 picker 配置时 sessions/events 仍可用，browse 返回有限 503。

### 覆盖

`FR-001/008`、`NFR-001/002/003`、`SEC-001/002/006`、`AC14-01/02/08/10`。

## 10. T14-04：浏览器 DTO Schema 与 JSON API Client

### 输入

- 阶段 13 九个响应、T14-01 browse response、`ErrorInfoSchema`。

### 先写失败测试

- `schemas.test.ts` 固定 config/recent/sessions/create/validate/events/browse/approval/cancel 的浏览器响应 Schema。
- `api-client.test.ts` 覆盖 success、非 2xx error envelope、错误 Content-Type、非 JSON、Schema mismatch、network error、AbortError 和 stale request abort。
- public/security tests 固定 client barrel 无 Node/server exports，不记录 header/body/stack/Key。

### 实现

- `lib/client/schemas.ts` 定义浏览器安全的 response schemas；event 使用 `AgentEventSchema`，不运行时导入 server barrel。
- `types.ts` 从 Schema 推断 client DTO、`UiError`、bootstrap/picker transport state。
- `api-client.ts` 实现 same-origin typed fetch functions，统一 `Accept`/`Content-Type`/AbortSignal 和有限错误。
- `index.ts` 只公开 UI 所需 surface。

### 最小验证

```text
pnpm exec vitest run tests/unit/client/schemas.test.ts tests/unit/client/api-client.test.ts tests/unit/client/public-api.test.ts tests/unit/client/security.test.ts
pnpm typecheck
```

### 输出与完成条件

- 每个 UI JSON 边界均有 runtime validation；无 React、Node 或副作用。

### 覆盖

`FR-001/002/006/007/008/009`、`NFR-002/003`、`SEC-006`、`AC14-01/02/06/08`。

## 11. T14-05：NDJSON 字节流解析器

### 输入

- AgentEvent Schema、服务端 8 MiB line limit、run response contract。

### 先写失败测试

- 对包含中文和多字节字符的合法 stream 在每个 byte boundary 切分并验证结果相同。
- 覆盖 LF/CRLF/空行、恰好 8 MiB、超限、非法 UTF-8/JSON/Event、非空残缺尾行、reader error 和 AbortError。
- 确认 parser 不保留无限 buffer，不吞掉最后合法行，不接受 private frame。

### 实现

- `lib/client/ndjson.ts` 使用 streaming `TextDecoder`、有界 line buffer 和 async iterator/callback。
- 每行 JSON.parse 后经 `AgentEventSchema`；EOF 与 cancel 语义区分。
- 错误只产生 `UI_STREAM_INVALID/UI_OPERATION_ABORTED` 等有限类型。

### 最小验证

```text
pnpm exec vitest run tests/unit/client/ndjson.test.ts
pnpm typecheck
```

### 输出与完成条件

- 任意 chunk 边界下每个合法 event 恰好输出一次。

### 覆盖

`FR-002/005`、`NFR-002/003`、`AC14-03/08`。

## 12. T14-06：事件账本、运行投影与工具分组

### 输入

- Durable/live AgentEvent、Spec 8 与事件生命周期。

### 先写失败测试

- durable id/seq 去重、重复分页、倒退、same seq different id、wrong session。
- live runId/streamSeq 去重、delta 顺序、durable assistant message 替代当前 delta、后续新 delta。
- run status/iteration/usage/context compaction/terminal projection。
- toolCallId 分组的 request→approval→start→result 全路径及不完整/拒绝路径。
- unresolved approval、latest terminal、continue eligibility 和 stream-close reconciliation cursor。

### 实现

- `event-state.ts` 提供纯 reducer、ledger merge、live buffer 和 derived run state。
- `view-model.ts` 提供 timeline rows、tool cards、pending approvals、状态/耗时/usage 格式化。
- 不在 reducer 中 fetch、读时间、访问 DOM 或生成 durable event。

### 最小验证

```text
pnpm exec vitest run tests/unit/client/event-state.test.ts tests/unit/client/view-model.test.ts
pnpm typecheck
```

### 输出与完成条件

- UI 可以仅由 API event 重建历史和运行视图，不维护第二事实源。

### 覆盖

`FR-005/006/007/008/010`、`NFR-003`、`AC14-03/04/05`。

## 13. T14-07：安全 Markdown、URL 与差异视图模型

### 输入

- 已安装 `react-markdown`/`remark-gfm`、Spec 12/14。

### 先写失败测试

- allow http/https/mailto 和安全相对链接；拒绝 javascript/data/vbscript/control-character 混淆。
- Markdown image 始终降级为 alt + 可检查安全链接，不触发图片组件。
- raw HTML 保持文本/被安全忽略，不产生执行 DOM 的配置。
- replace old/new、run_process argv/output/metadata、truncated/error 格式化不改变原始事实。

### 实现

- `lib/client/markdown.ts` 定义 URL policy 与受控 renderer helpers。
- `markdown-message.tsx` 使用 `react-markdown + remark-gfm`，不引入 rehypeRaw。
- `view-model.ts` 补充有限 replace 对照和 process 详情；不读取工作区生成额外 diff。

### 最小验证

```text
pnpm exec vitest run tests/unit/client/markdown.test.ts tests/unit/client/view-model.test.ts tests/unit/client/security.test.ts
pnpm lint
pnpm typecheck
```

### 输出与完成条件

- 模型文本可读但不能执行 HTML、危险 URL 或远程图片请求。

### 覆盖

`FR-005`、`SEC-006/008`、`AC14-04/06`。

## 14. T14-08：Morph trail 纯数学与生命周期控制

### 输入

- Spec 11.5 固定六个常量、噪声公式和降级条件。

### 先写失败测试

- 8px sampling、60 点 cap、hover/leave radius lerp、0.92 alpha、0.995 radius 和 0.01 清除。
- 24-point 3/5/2 harmonic noise、midpoint quadratic closed path，不退化为固定圆。
- stage→flower coordinate scale、resize、empty trail、deterministic seeded test。
- reduced-motion/coarse/hidden/unmount 停帧与 listener/RAF cleanup。

### 实现

- `lib/client/morph-trail.ts` 保存常量、trail update、blob points/path instructions 和坐标换算纯函数。
- React/canvas adapter 留在后续 `morph-trail.tsx`；纯模块不使用 DOM global。

### 最小验证

```text
pnpm exec vitest run tests/unit/client/morph-trail.test.ts
pnpm typecheck
```

### 输出与完成条件

- 数学行为完全由测试固定，后续 UI 不能替换为 CSS circle。

### 覆盖

`NFR-007`、`AC14-07/09`。

## 15. T14-09：Next.js 文档壳与海报视觉舞台

### 输入

- T14-08 pure math、Spec 11、已批准字体 fallback 和两个精确图片 URL。

### 操作

1. `layout.tsx` 设置 `lang="zh-CN"`、SEcode metadata、Geist/Geist Mono variables 和初始 `anim` class。
2. `page.tsx` 保持 Server Component，只渲染 Client Workbench root；不读取 browser API。
3. `error.tsx` 提供中文 unexpected render recovery，不显示 stack。
4. `next.config.ts` 仅允许两个精确 Higgsfield remote patterns。
5. `brand-stage.tsx/visual-stage.tsx` 实现星形、功能导航、胶囊、白/粉 SECODE、角落文案和双层百合。
6. 图片使用 `next/image` identity loader + `unoptimized`，最终 distinct src 恰为两个指定 URL；sizer 可重复 FRONT，不出现第三个 distinct source。
7. `morph-trail.tsx` 将 T14-08 math 接到两个 canvas mask layer，active RAF 更新，cleanup 完整。
8. `globals.css` 实现 `#161616` 固定舞台、z-order、精确 desktop coords、入场 keyframes/timing、280ms reduced-motion 和装饰加载失败降级。
9. `anim` 在最后 animationend 后删除，并有 6000ms safety；一次删除，不随状态重放。

### 最小验证

```text
pnpm exec vitest run tests/unit/client/morph-trail.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

### 输出与完成条件

- 默认 Next 模板内容完全移除；Server/Client boundary 和 Image/Font 规则通过 build。
- 无 Session 时已有可操作前景插槽，视觉层本身不依赖 Agent 数据。

### 覆盖

`NFR-001/007`、`SEC-006/008`、`AC14-01/06/07/08/09`。

## 16. T14-10：Workbench bootstrap 与工作区选择弹窗

### 输入

- T14-03 browse route、T14-04 API client、T14-09 shell。

### 操作

- `workbench.tsx/use-workbench.ts` 并行加载 config/recent/sessions，三者独立 loading/error/retry。
- `workspace-picker.tsx` 在打开时 browse `segments=[]`，处理 breadcrumb、row selection、double-click enter、up/cancel/select current、empty/blocked/truncated/error/stale response。
- 使用 AbortController 或 monotonically increasing request token 丢弃快速切换的陈旧 browse response。
- 选中 current 后关闭 modal，显示只读 canonical candidate，调用 validate；一致后才启用 create。
- picker 未配置时显示 `.env.local` 配置说明，不回退文本输入；recent 仅展示，不可直接创建。
- 模型只允许 `configured=true`；title 可选，create 成功选中新 Session。
- `sheet.tsx` 提供可复用 dialog/focus trap/inert/Escape/focus restore 基础，picker 与后续移动 sheet 共用。

### 最小验证

```text
pnpm exec vitest run tests/unit/client tests/unit/server/workspace-picker.test.ts tests/integration/server/workspace-picker-route.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

### 输出与完成条件

- 浏览器不出现可编辑绝对路径输入；从受限根选择并验证后可创建 Session。
- 任一 browse/validate error 不沿用旧 candidate。

### 覆盖

`FR-001/009`、`NFR-003/007`、`SEC-001/002/008`、`AC14-01/02/07/10`。

## 17. T14-11：Session 导航、历史分页与恢复

### 输入

- T14-06 ledger/projection、T14-10 bootstrap。

### 操作

- `session-sidebar.tsx` 显示新建、历史 Session、当前 canonical workspace/model 和最近路径信息。
- 默认选中最新 Session；选中时从 `after=0&limit=500` 循环分页到 `hasMore=false`，逐页 render loading。
- `timeline.tsx/event-entry.tsx` 以稳定 event key 显示 Session 起点、用户/助手/状态/错误 placeholder。
- recovery 中 tail repair、discarded bytes、open run/interrupted 只显示服务端事实。
- 自动滚动仅在接近底部；离开底部后显示“有新事件”。
- active run 时禁用会话切换和新建；历史加载 abort 后不污染新 Session。

### 最小验证

```text
pnpm exec vitest run tests/unit/client/event-state.test.ts tests/unit/client/view-model.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

### 输出与完成条件

- 刷新可从 durable pages 重建完整历史；无 localStorage event truth。

### 覆盖

`FR-005/008/010`、`NFR-003/007`、`AC14-03/07`。

## 18. T14-12：Run streaming、Composer、停止与协调

### 输入

- T14-05 parser、T14-06 reducer、阶段 13 run/cancel/events API。

### 操作

- `composer.tsx` 提供多行 prompt、Cmd/Ctrl+Enter 发送、显式发送/停止和 continue draft。
- POST 接受前保留草稿；首个 `user.message` 后清空。
- starting 阶段可 abort request；获得 `run.started` 后保存 runId。
- 已知 runId 停止调用 DELETE 并继续读流至 terminal/有限协调超时；显示 requested/already requested。
- terminal 或流错误后以 last durable seq 拉增量 events，去重协调。
- 无 terminal 的 EOF 显示 `UI_STREAM_ENDED_EARLY`，不伪造 Agent terminal。
- failed/cancelled/interrupted 时“继续”只填入可编辑中文提示，不自动 POST。
- unmount/page disconnect abort 当前 request，不留下 client reader。

### 最小验证

```text
pnpm exec vitest run tests/unit/client/ndjson.test.ts tests/unit/client/event-state.test.ts tests/integration/server/run-stream.test.ts tests/integration/server/approval-cancel.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

### 输出与完成条件

- 实时流、停止、早结束和 durable reconciliation 状态一致且可解释。

### 覆盖

`FR-002/005/007/008`、`NFR-003`、`AC14-03/05`。

## 19. T14-13：完整时间线、工具详情、审批与检查器

### 输入

- T14-06 view model、T14-07 Markdown、T14-12 live run。

### 操作

- `event-entry.tsx` 覆盖所有 durable/live event，不识别的合法状态以有限 fallback 显示。
- `tool-card.tsx` 按 toolCallId 合并 request/approval/start/result，默认折叠，显示参数、summary、output、metadata/error/truncated。
- replace 只显示 public old/new 对照；process 显示 program/argv/cwd/exit/signal/timeout/stdout/stderr。
- `run-inspector.tsx` 显示状态、迭代、usage、context.compacted、pending approval 和可信本地边界。
- approval allow/reject 可填 reason，提交一次，等待 `approval.resolved`；404/409 真实显示。
- `markdown-message.tsx` 渲染 intermediate/final/delta，final 替代 delta，无 raw HTML/remote image。
- `icons.tsx` 只提供 inline currentColor SVG，图标不作为唯一语义。

### 最小验证

```text
pnpm exec vitest run tests/unit/client tests/integration/server/approval-cancel.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

### 输出与完成条件

- 用户可检查模型消息、六种工具事实、审批、错误、上下文和终态；无 reasoning/secret。

### 覆盖

`FR-003/005/006/010`、`SEC-006/008`、`AC14-04/05/06`。

## 20. T14-14：响应式、可访问性与视觉收口

### 输入

- T14-09 海报、T14-10～13 功能 UI、Spec 11.8/13。

### 操作

- desktop ≥1180 三栏；901–1179/portrait 检查器 sheet；≤900 或 4:5 显示 burger/scrim/frosted sheet；<768 主区优先。
- 会话和检查器 sheet 复用 focus trap/inert/Escape/restore；body 保持 no-scroll。
- landmarks、可见 label、aria-describedby、aria-live、details/summary、focus-visible、非颜色状态全部复核。
- `h1 aria-label="SEcode"` 不重复朗读；只有 FRONT 暴露一次 alt，其余装饰隐藏。
- 动画/图片失败不能阻断功能；prefers-reduced-motion 无 trail 且只 280ms fade。
- 检查 1440×900 首屏、窄屏、长路径、长标题、长输出、空/错误/loading 状态。

### 最小验证

```text
pnpm lint
pnpm typecheck
pnpm build
```

### 输出与完成条件

- 桌面演示与移动核心流程可用，无 body 横向/纵向滚动或被遮挡操作。

### 覆盖

`NFR-007`、`SEC-008`、`AC14-01/07/09`。

## 21. T14-15：隔离的 Playwright 产品环境

### 输入

- 完整 production UI/API、阶段 13 fake model协议、Spec 15.3。

### 实现

- `fake-model-server.ts` 实现 loopback OpenAI-compatible streaming server 与测试专用 scenario reset endpoint；场景固定 slug-fix、approval allow/reject、slow cancel、provider failure、markdown security。
- `start-environment.ts` 创建登记的 OS temp root、picker root、slug fixture、data dir 和 runtime manifest；fake model 作为 wrapper 内的 loopback HTTP server 启动，Next dev 使用 `spawn(program,args,{shell:false})` 启动。
- wrapper 把 generic model env、`SECODE_DATA_DIR`、`SECODE_WORKSPACE_PICKER_ROOT` 注入 Next child；不用真实 provider env。
- SIGINT/SIGTERM/Next child exit 时先终止 Next child并关闭 wrapper 内 fake server，再只删除 manifest 登记的精确 temp root；不得 broad rm。
- `runtime-manifest.ts` 严格校验 manifest 路径、port 和 root identity，测试只读使用。
- `fixtures.ts` 扩展 Playwright：每例重置 scenario、拦截两个精确 Higgsfield URL并返回登记透明 fixture、记录 unexpected console/page errors。
- `playwright.config.ts` 使用 wrapper 作为唯一 webServer，`reuseExistingServer:false`、workers=1、非并行、固定 localhost；保留失败 trace/screenshot。

### 最小验证

```text
pnpm exec playwright test tests/e2e/baseline.spec.ts
```

### 输出与完成条件

- E2E 可重复启动/停止，无真实 Key、真实项目、残留 listener/server/process/temp root；图片拦截使用 `fixtures.ts` 内固定透明 PNG bytes，不新增第三张产品资产。

### 覆盖

`FR-001/002/008/009`、`NFR-001/003/007`、`COM-004`、`AC14-08/10`。

## 22. T14-16：Workspace 与完整 Agent 产品 E2E

### 输入

- T14-15 harness 与真实 production Agent/tool/API/UI。

### 实现与场景

- `baseline.spec.ts` 更新为中文 metadata、no-scroll、安全提示和默认模板消失。
- `workspace-picker.spec.ts` 验证根/面包屑/进入/返回/选择/validate/create、无文本路径、文件/ignore/external symlink、未配置/empty/truncated/stale response。
- `agent-workflow.spec.ts` 让假模型依次真实调用 read_file→replace_in_file→run_process；UI 看到 live/tool/final，fixture `pnpm test` 4/4 通过。
- 刷新后恢复 Session、durable messages/tool results/terminal，delta 不重复。
- 每个场景结束检查 fixture 仅发生预期源码变化、tests 未改、无依赖安装和 Git 操作。

### 最小验证

```text
pnpm exec playwright test tests/e2e/baseline.spec.ts tests/e2e/workspace-picker.spec.ts tests/e2e/agent-workflow.spec.ts
```

### 输出与完成条件

- 浏览器到真实 API/Agent/tool/JSONL 的修复闭环通过；不是 API mock。

### 覆盖

`FR-001/002/003/004/005/008/009`、`AC14-01/02/03/04/08/10`。

## 23. T14-17：审批、取消、恢复、安全与视觉 E2E

### 输入

- T14-16 产品环境、剩余 Spec Playwright 场景。

### 实现与场景

- `approval-cancel.spec.ts` 覆盖 allow、reject、重复点击防护、slow process cancel、terminal 与无残留进程。
- `recovery-security.spec.ts` 覆盖 provider failure、continue 只填草稿、reload/interrupted、raw HTML/javascript URL/remote Markdown image、DOM/console/trace 无 Key/reasoning。
- `responsive-visual.spec.ts` 覆盖 1440×900 三栏、两个 distinct URL、z-order、entrance once、两角同时、fine-pointer non-circle mask、leave decay、reduced-motion、mobile burger/sheet/focus trap。
- 图片请求由 fixture 拦截，断言请求 URL 精确；额外验证图片失败时创建/运行/审批仍可用。
- 对工作台主要交互执行键盘路径；检查 accessible names、landmarks、focus return 和无 body overflow。

### 最小验证

```text
pnpm exec playwright test tests/e2e/approval-cancel.spec.ts tests/e2e/recovery-security.spec.ts tests/e2e/responsive-visual.spec.ts
```

### 输出与完成条件

- 审批、取消、安全、视觉、响应式和可访问验收全部通过且无 flake 重试依赖。

### 覆盖

`FR-005/006/007/008/010`、`NFR-003/007`、`SEC-006/008`、`AC14-03/05/06/07/09`。

## 24. T14-18：全仓门禁、人工检查、反思与安全审计

### 输入

- T14-00～17 完整实现和全部首次失败记录。

### 固定验证顺序

串行执行，任何失败修复后从受影响最早门禁重跑：

```text
pnpm exec vitest run tests/unit/server tests/integration/server/workspace-picker-route.test.ts
pnpm exec vitest run tests/unit/client
pnpm test:coverage
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
git diff --check
```

### 审计

1. coverage statements/functions/lines ≥80%、branches ≥70%，不改阈值。
2. package/lock hash 与 T14-00 一致；无新增依赖。
3. `app/ui`/`lib/client` 无 Node/server import；client/build 无 baseUrl、Key env、Authorization、reasoning。
4. Browse route/service 无 raw shell、client absolute path、string prefix boundary、root auto expansion、文件内容输出。
5. Markdown 无 raw HTML、dangerouslySetInnerHTML、remote model image；产品图片 distinct URL 正好两个。
6. 所有 RAF/listener/stream/child/server/temp root 已收口；扫描无 `secode-stage14-*` 残留。
7. 手动以本地假模型执行一次桌面完整任务：picker→create→fix→test→summary→reload。
8. 手动用移动 viewport 执行 picker、Session 切换、审批、停止和 sheet keyboard 操作。
9. 记录远程百合真实网络可用/不可用表现；自动门禁不依赖外网。
10. 记录字体 fallback，不能写成 Orbit exact font。
11. 复核 Task 白名单、git status、无真实凭据、无真实用户项目改动。

### 输出与完成条件

- 所有固定门禁 exit 0；自动/人工检查、首次失败和修复事实完整写入 Task 实施记录。
- 若出现公共语义偏差，停止并重新审批，不用 Summary 掩盖。

### 覆盖

全部阶段 14 `FR/NFR/SEC/AC`。

## 25. T14-19：文档回写与 Summary

### 输入

- 已完成任务、命令输出、测试数量、coverage、构建 route graph、E2E trace 和审计结果。

### 操作

1. 逐项勾选 T14-00～18，写入真实实施时间、失败、诊断、修复和重跑结果。
2. 生成 `14-chinese-workbench-ui-e2e-summary.md`，包含批准链、架构、文件清单、接口、UI/视觉实现、测试、偏差、安全、限制和反思。
3. 明确 LongCat external block、Higgsfield 网络依赖、单 picker root、字体 fallback 和可信本地非强沙箱限制。
4. 更新开发索引为“Summary 待用户审批”。
5. 停止，不观察或编写阶段 15 Spec。

### 完成条件

- Summary 内部门禁全部通过并等待用户审批；阶段 14 未提前标记完成。

### 覆盖

`NFR-008`、全部 `AC14-*`。

## 26. 失败处理与回退策略

1. **基线失败**：T14-00 停止，不写实现；记录是 pre-existing 还是环境问题。
2. **Picker 安全失败**：停止 UI 工作，先修复 T14-01～03 并重跑 workspace/server 全集；不得隐藏/跳过目录。
3. **公共 contract 需变化**：停止并修订 Spec；本 Task 审批失效。
4. **仅文件/顺序变化**：停止并修订本 Task，重新等待批准。
5. **NDJSON/ledger 失败**：保留失败 fixture，修复纯模块后重跑 client + server run integration；不得在 React 组件临时补事实。
6. **视觉性能失败**：先查 RAF 空闲停止、canvas 尺寸和重复 data URL；不得把 morph 偷换为圆形 spotlight。若固定算法不可用，回到 Spec。
7. **图片网络失败**：验证纯色功能降级；自动测试继续使用 exact URL intercept，不下载替换产品图片。
8. **Next Image 不保留 exact URL**：先用批准的 identity loader/unoptimized 方案；若仍需 raw `<img>`，停止并修订 Task 明确 lint/安全例外。
9. **E2E flake**：用事件/HTTP/DOM 条件等待，不增加任意 sleep、不依赖 retries 掩盖竞态。
10. **取消残留**：保留登记 temp root 与进程证据，修复收口后重跑 cancel、全 E2E 和残留扫描。
11. **覆盖率下降**：补真实行为测试，不排除新 `lib/client`/server 文件，不降阈值。
12. **回退方式**：仅反向 apply 当前阶段明确 patch；不使用 `git reset --hard`、`git checkout --` 或删除用户已有变化。

## 27. 明确不执行

- 不提供可编辑绝对路径、原生 Finder/Explorer picker、File System Access API、文件上传或多 picker roots。
- 不创建/重命名/删除目录，不显示 picker root 内文件。
- 不修改核心 Agent、事件、工具、风险、存储、workspace 或 terminal。
- 不实现登录、云执行、Serverless、多用户、容器沙箱、MCP、多 Agent。
- 不实现 Session 删除/重命名/归档、历史搜索、虚拟列表、富文本编辑器。
- 不显示 private reasoning，不自动 Git commit/push/deploy。
- 不下载第三方字体，不伪造 Orbit 字体；没有用户 TTF 时固定 fallback。
- 不调用真实 DeepSeek/LongCat/generic 网络端点执行自动测试。
- 不录制最终视频、不编写最终 README.txt、不进入阶段 15。

## 28. Task 内部门禁

- [x] 已批准 Spec 修订 2 与审批日期已记录。
- [x] 任务按安全依赖顺序排列，最多一个实施任务进行中。
- [x] 每项包含输入、实现/验证、输出/完成条件和需求映射。
- [x] Browse contract、错误、配置、边界与测试不留公共决策。
- [x] 客户端协议、事件状态、视觉算法、工作台流程与 E2E 环境不留公共决策。
- [x] 新增/修改/禁止文件白名单明确。
- [x] package/lock 不变、字体 fallback、图片 URL 和 LongCat 限制明确。
- [x] 失败处理、回退和最终门禁明确。
- [x] 未修改任何 production、test、config 或依赖文件。
- [x] 开发索引已更新为“Task 已批准，开发进行中”。

**内部门禁结论：通过。当前状态：实施完成，Summary 待用户审批。**

## 29. 用户审批记录

- 审批结果：用户于 2026-08-28 明确批准。
- 已解锁：严格按 T14-00～T14-19 开发、验证和 Summary 生成。
- 当前实施位置：T14-19 已完成；阶段 15 未解锁。

## 30. 实施记录

### T14-00：实施前基线与工作树保护（已完成）

- 开始日期：2026-08-28。
- Next.js 文档：已核对本地 `node_modules/next/dist/docs` 中 Server/Client Components、Route Handlers、Image、Font 与 Error 文档；实现将遵循 Next.js 16.3.3 当前约定。
- 实施前工作树：仅存在阶段 13 审批文档修改、阶段 14 文档新增及开发索引修改；没有阶段 14 production、test 或 config 变化。
- `package.json` SHA-256：`5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13`。
- `pnpm-lock.yaml` SHA-256：`5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683`。
- 缺失边界确认：`app/ui`、`lib/client`、`lib/server/workspace-picker.ts`、`app/api/workspaces/browse`、`tests/e2e/support` 均不存在。
- `pnpm lint`：exit 0；0 error、2 个既有 coverage 产物 unused eslint-disable warning。
- `pnpm typecheck`：exit 0。
- `pnpm test`：exit 0；87 个测试文件、662 个测试全部通过。
- `pnpm build`：exit 0；Next.js 16.3.3 production build 成功；保留阶段 13 已存在的 `lib/storage/file-safety.ts` 动态文件系统 tracing warning。
- `pnpm test:e2e`：exit 0；1 个 Playwright Chromium 基线通过；记录既有 `NO_COLOR/FORCE_COLOR` 与 `allowedDevOrigins` dev warning。
- 完成结论：五道基线均通过，无 production/test/config 变化；T14-01 已解锁。

### T14-01：Picker DTO、Schema、错误与公共边界（已完成）

- 开始日期：2026-08-28。
- 首次失败：4 个测试文件中 7 项按预期失败，分别证明 Browse Schema/公共导出不存在以及 4 个新 HTTP 状态尚未映射。
- 实现：新增 Browse request/response DTO、64/255/4096/500 常量、strict segments Schema、五个有限错误码与状态映射；公共 barrel 只增加 route 所需 Schema 和类型。
- 验证：指定 4 个测试文件共 23 项通过；`pnpm typecheck` exit 0。
- 完成结论：未读取文件系统、未新增 route；T14-01 已完成。

### T14-02：Picker root 与目录枚举服务（已完成）

- 开始日期：2026-08-28。
- 首次失败：新增服务测试因目标模块尚不存在而按预期失败。
- 实现：新增惰性、单进程缓存的 picker service；复用 workspace handle/resolver，固定 ignore、目录-only、确定性排序、500 截断、symlink 边界和前后身份复核。
- 修正：首次 typecheck 发现 `ServerLayerError` 被误作 type-only import；修正后通过。竞态测试最初因 macOS `/var` canonical 化未触发，改为使用目录 basename 定位测试钩子并成功验证替换逃逸。
- 验证：picker 与既有 workspace boundary 共 35 项通过；`pnpm typecheck` exit 0。
- 完成结论：未修改 `lib/workspace/**`，T14-02 已完成。

### T14-03：Application 集成与 Browse Route Handler（已完成）

- 开始日期：2026-08-28。
- 首次失败：route 模块不存在，Application 尚未委托 picker，也未对 validate/create 执行选择范围复核。
- 实现：Application 组合 picker service；validate/create 对 canonical workspace 进行 root 内二次验证；bootstrap 创建惰性 picker；新增 Node.js browse route；`.env.example` 增加无真实路径配置说明。
- 验证：server unit 与 picker route integration 共 67 项通过；`pnpm typecheck` 与 `pnpm build` exit 0；build 仅保留既有 storage tracing warning。
- 完成结论：第十个 route 可用，既有九个 route contract 未变；T14-03 已完成。

### T14-04：浏览器 DTO Schema 与 JSON API Client（已完成）

- 开始日期：2026-08-28。
- 首次失败：4 个新增测试文件因 `lib/client` 不存在而按预期失败。
- 实现：新增九类 JSON response strict Schema、有限 `UiClientError` 与 same-origin typed API client；不导入 server/Node 能力。
- 修正：错误 `name` 属性最初被枚举，改为不可枚举；测试 fetch mock 参数推断导致 typecheck 失败，补齐显式签名。
- 验证：4 个测试文件共 12 项通过；`pnpm typecheck` exit 0。
- 完成结论：T14-04 已完成。

### T14-05：NDJSON 字节流解析器（已完成）

- 首次失败：`lib/client/ndjson.ts` 不存在。
- 实现：有界字节缓冲、fatal UTF-8、逐行 JSON/AgentEvent Schema、CRLF/空行/EOF/abort 区分。
- 修正：参数化测试回调元组签名导致首次 typecheck 失败，补齐标签参数后通过。
- 验证：9 项 NDJSON 测试（含每个 byte boundary 与 8 MiB 真边界）通过；typecheck exit 0。

### T14-06：事件账本、运行投影与工具分组（已完成）

- 首次失败：两个纯模块不存在；实现首跑进一步发现同 seq/id 但 payload 不同被错误去重，以及 pending approval 测试断言层级不一致。
- 实现：immutable durable/live ledger、冲突/倒退/会话校验、delta 替换、运行/usage/compaction/terminal 投影、工具 lifecycle 分组。
- 修正：重复判断增加完整 payload 一致性；测试按批准的数据模型读取嵌套 approval。
- 验证：2 个测试文件共 6 项通过；typecheck exit 0。

### T14-07：安全 Markdown、URL 与差异视图模型（已完成）

- 首次失败：Markdown 模块和 replace/process 格式器不存在。
- 实现：安全 URL allowlist、图片 inert 描述、replace preview 与 process facts 纯格式化；不生成额外文件事实。
- 验证：Markdown/view/security 3 个文件共 19 项、lint、typecheck 通过；lint 当时仅含既有 coverage 与随后已清理的开发期 warning。

### T14-08：Morph trail 纯数学与生命周期控制（已完成）

- 首次失败：纯数学模块不存在。
- 实现：固定 60/140/44/24/0.92/8 及 lerp/衰减常量、3/5/2 harmonic blob、midpoint quadratic path、坐标换算和停帧判定。
- 验证：6 项 morph 测试与 typecheck 通过。

### T14-09：Next.js 文档壳与海报视觉舞台（已完成）

- 开始日期：2026-08-28。
- 实现：页面保持 Server Component 外壳，加入中文 metadata、Geist 字体变量、中文错误边界、固定深色海报舞台、SECODE 字标、两张精确 Higgsfield 百合、一次性入场和双 canvas morph mask；`next.config.ts` 仅登记两个精确远程图片 pattern。
- 验证：morph 单元测试、lint、typecheck、build 全部 exit 0；lint 仅保留两个既有 coverage warning，build 仅保留既有 storage tracing warning。
- 完成结论：默认模板已移除，视觉层不读取 Agent/工作区事实；T14-09 已完成。

### T14-10：Workbench bootstrap 与工作区选择弹窗（已完成）

- 开始日期：2026-08-28。
- 实现：新增并行 config/recent/sessions bootstrap、受限目录 Sheet、breadcrumb/选择/进入/返回、陈旧请求丢弃、canonical validate、新建 Session 表单和无绝对路径输入的错误恢复。
- 首次门禁：功能实现后的 lint 报告两个 React Hooks 规则错误；重构 effect 内状态启动方式后，typecheck 又发现 `useRef` 缺少显式初值，补为 nullable ref 后通过。
- 验证：client/server picker 相关测试、lint、typecheck、build 全部通过；无 package/lock 变化。
- 完成结论：只能从服务端配置根选择工作区，不能回退为文本绝对路径；T14-10 已完成。

### T14-11：Session 导航、历史分页与恢复（已完成）

- 开始日期：2026-08-28。
- 实现：新增 Session 列表、durable events 分页恢复、稳定事件账本、恢复提示、近底部自动滚动和“有新事件”提示；active run 时禁止切换 Session。
- 首次门禁：lint 拒绝 effect 内同步触发历史加载，改为 microtask 启动；随后 typecheck 暴露 union narrowing 跨闭包失效，固定局部 session id 后通过。
- 验证：event-state/view-model 测试、lint、typecheck、build 全部通过。
- 完成结论：刷新和切换只从 JSONL API 重建历史；T14-11 已完成。

### T14-12：Run streaming、Composer、停止与协调（已完成）

- 开始日期：2026-08-28。
- 实现：API client 增加 NDJSON run 请求；Composer 支持多行输入、Cmd/Ctrl+Enter、发送、停止与继续草稿；运行流逐事件合并，终态或异常后从 durable history 协调。
- 首次失败：run client 测试先证明 `startRun` 不存在；实现后通过。
- 验证：NDJSON、event ledger、run-stream、approval-cancel 共 29 项通过；lint、typecheck、build exit 0。
- 完成结论：UI 不伪造终态，取消复用既有 DELETE API；T14-12 已完成。

### T14-13：完整时间线、工具详情、审批与检查器（已完成）

- 开始日期：2026-08-28。
- 实现：完整事件条目、按 toolCallId 合并的工具卡、replace/process 事实视图、审批 allow/reject、运行检查器以及跳过 raw HTML/远程图片的 Markdown 渲染。
- 验证：client 与 approval-cancel 共 54 项通过；lint、typecheck、build exit 0。
- 完成结论：模型消息、公开工具参数/结果、审批、错误、usage 和压缩状态均可审计；T14-13 已完成。

### T14-14：响应式、可访问性与视觉收口（已完成）

- 开始日期：2026-08-28。
- 实现：桌面三栏、中屏检查器收口、移动 burger/frosted Sheet、复用 focus trap/Escape/focus restore、内部滚动、focus-visible、aria-live 和 reduced-motion 降级。
- 验证：client + server integration 共 74 项通过；lint、typecheck、build exit 0；仅保留两个既有 coverage warning 与既有 storage tracing warning。
- 完成结论：T14-14 已完成，T14-15 已解锁。

### T14-15：隔离的 Playwright 产品环境（已完成）

- 开始日期：2026-08-28。
- 实现：新增 loopback OpenAI-compatible SSE 假模型、strict runtime manifest、单一 wrapper、登记临时 picker/data/slug fixture、generic-only 环境、固定 Higgsfield PNG 拦截、browser diagnostics 与 Chrome/localhost 单 worker webServer。
- 首次失败与修正：fixture 回调参数名 `use` 被 ESLint 误识别为 React Hook，重命名后 typecheck 又发现原生 `Response.ok` 被当成函数；均修正。首次 baseline 因本机未安装 Playwright Chromium，恢复阶段基线已验证的系统 Chrome channel。默认 Playwright SIGKILL 两次留下登记 temp root，加入 `gracefulShutdown: SIGTERM/10s`、幂等信号处理和 inode 校验的同步 exit 兜底后清理稳定。
- 验证：lint/typecheck exit 0；baseline 1/1 通过；结束后 manifest、`secode-stage14-e2e-*`、Next/fake-model 进程均为零。两次开发期残留均按其精确绝对路径删除，不可恢复且未触碰其他目录。
- 完成结论：无真实 Key、真实用户项目或外网图片依赖；T14-15 已完成。

### T14-16：Workspace 与完整 Agent 产品 E2E（已完成）

- 开始日期：2026-08-28。
- 实现：新增 picker canonical create、ignore/file/external-link/empty/500 truncation/stale-request 场景；假模型驱动真实 read_file→replace_in_file→run_process；验证 fixture 4/4、protected files、durable reload 与无重复 final。
- 首次失败与修正：全部 POST browse 先返回 403“跨源修改”，证据显示 Next dev 将 mutation request URL 规范为 localhost 而浏览器 origin 为 127.0.0.1；将 Playwright 浏览器 baseURL 固定为 `http://localhost:3100` 后安全同源校验通过，webServer 健康检查仍绑定 loopback 127.0.0.1。并发进入测试最初误认为 slug 项目无子目录，修正为断言真实 `src/tests` 目录而不改变生产逻辑。
- 验证：T14-16 指定集合中 baseline、Agent 闭环及 picker 主场景通过；修正后 picker 3/3 重跑通过，Agent 闭环单次 2.8 秒并在 fixture 内 `pnpm test` 4/4。
- 完成结论：浏览器→真实 Route Handler→Agent→本地工具→JSONL→刷新恢复闭环成立；T14-16 已完成，T14-17 已解锁。

### T14-17：审批、取消、恢复、安全与视觉 E2E（已完成）

- 开始日期：2026-08-28。
- 实现：新增 allow/reject/duplicate guard/slow cancel、provider failure/continue/reload、Markdown security、1440×900 visual、morph、reduced-motion、mobile focus、图片失败功能降级场景。
- 首次失败与修正：首跑 9 项通过 3 项。四项是断言范围错误（审批事件已合并进工具卡、实际有限错误码为 `MODEL_PROVIDER_UNAVAILABLE`、页面自身含 Next script），收紧为可见产品事实。另三项暴露真实行为：reduced-motion 仍等 6 秒 safety、移动菜单按钮打开后 disabled 导致焦点无法恢复、拒绝后的有限 tool.result 将状态覆盖为 `failed`；分别监听 `stage-fade`、保持被 inert 的触发按钮可聚焦、让明确拒绝优先于失败结果，并补单元回归。
- 验证：view-model 单元回归 3/3；拒绝专项 1/1；T14-17 全集 9/9 通过，workers=1、retries=0。
- 完成结论：审批、取消、安全、视觉、响应式、键盘与图片失败降级均通过；T14-17 已完成，T14-18 已解锁。

### T14-18：全仓门禁、人工检查、反思与安全审计（已完成）

- 开始日期：2026-08-28。
- 固定门禁：server 10 files/67 tests、client 9 files/50 tests、coverage 98 files/739 tests、lint、typecheck、全仓 98 files/739 tests、build、E2E 14/14、`git diff --check` 全部 exit 0。
- Coverage：statements 87.50%、branches 80.42%、functions 90.17%、lines 89.19%，均超过 80/70/80/80 阈值；未改 coverage 配置。
- Build：Next.js 16.3.3 成功生成 `/` 与 10 个 API routes；仅保留既有 `lib/storage/file-safety.ts` Turbopack 动态文件 tracing warning。lint 仅保留两个既有 coverage generated-file warning。
- 审计：package/lock hash 与 T14-00 完全一致；`app/ui`/`lib/client` 无 Node/server import、Key/baseUrl/Authorization/reasoning；无 raw HTML、`dangerouslySetInnerHTML` 或模型远程图片；production Higgsfield distinct URL 恰为 2；picker 无 shell/HOME/root expansion；无真实凭据、E2E manifest/temp root/fake server/slow process 残留。
- 人工检查：在 in-app browser 查看桌面海报与三栏，实际完成 picker→slug-project→canonical validate→create Session；远程 Higgsfield 图片当时可加载，纯色/图片失败降级另由 E2E 覆盖。尝试再启动隔离实例做人工完整 Agent 时，发现用户已有 `pnpm dev`（PID 72738、端口 3000）持有 Next dev lock；未终止或改变该进程。完整 read→replace→test→final→reload 已由真实产品路径 E2E 无 mock API 通过。
- 反思：E2E 首次失败实际发现同源 host、graceful shutdown、reduced-motion、Sheet focus restore 和 rejected status 优先级问题；均补回归并从受影响门禁重跑。测试报告与两次开发期登记残留均按精确路径清理，不可恢复且未触碰其他目录。
- 完成结论：T14-18 已完成；已生成 Summary，等待用户审批。

### T14-19：文档回写与 Summary（已完成）

- 完成日期：2026-08-28。
- 已逐项写回 T14-00～18 的实现、首次失败、诊断、修正和最终证据。
- 已生成 `14-chinese-workbench-ui-e2e-summary.md` 并更新开发索引为“Summary 待用户审批”。
- 已明确 LongCat external block、远程图片网络依赖、单 picker root、Orbit 字体 fallback 和可信本地非强沙箱限制。
- 当前停止：不得观察或编写阶段 15 Spec，直至用户明确批准本 Summary。
