# 阶段 13 Task：Next.js Route Handlers

## 1. 文档状态与审批链

- 当前状态：实施完成，Summary 待用户审批。
- 生成日期：2026-08-28。
- 已批准 Spec：[13-nextjs-route-handlers-spec.md](./13-nextjs-route-handlers-spec.md)。
- Spec 审批记录：用户于 2026-08-28 明确批准。
- 当前允许：审阅阶段 13 实现、Task 实施记录与 Summary。
- 当前禁止：白名单外文件、真实 provider、核心协议变更、依赖变更、UI、Git 外部操作和阶段 14。
- 下一步门禁：用户明确批准阶段 13 Summary 后，才能开始阶段 14 观察与 Spec。

审批链：

```text
阶段 13 Spec（已批准）
  → 本 Task（已批准）
  → T13-00 基线与边界固定
  → T13-01～T13-09 实现与最小验证
  → T13-10～T13-12 集成、覆盖率与全仓门禁
  → T13-13 反思与审计
  → T13-14 Summary（已生成）
  → 用户审批 Summary（当前门禁）
```

## 2. 实施目标

严格实现已批准 Spec 中的八组 Next.js API、Node-only application facade、进程级共享 runtime、有限 NDJSON 流和 HTTP 安全边界，并用临时 workspace/data root 与假模型证明：

```text
validate workspace
  → create Session
  → start run
  → stream AgentEvent
  → approval / cancel
  → durable events recovery
```

本 Task 不授权 UI、真实 provider 调用、核心 Agent 协议变更或依赖变更。

## 3. 实施不变量

实现期间始终成立：

1. JSONL durable event 是唯一可恢复事实；NDJSON 只是实时传输。
2. `assistant.delta` 只在当前流中出现，不写 JSONL。
3. Route Handler 不解析 JSONL、不调用 raw tool、不复制风险策略。
4. 所有 Route Handler 使用同一 Node 进程内 application/runtime。
5. 动态 `params` 类型为 Promise，并在访问前 `await`。
6. 每个 route 显式导出 `runtime = "nodejs"`。
7. 所有 HTTP 输入先经过本地/同源、大小、Content-Type 和 Zod strict 校验。
8. request abort、stream cancel 和 DELETE cancel 最终进入同一个 Agent 取消语义。
9. Key、baseUrl、endpoint、private reasoning、stack、cause 和 capability 不进入响应。
10. Session 固定规范 workspace 与 profile；切换只能创建新 Session。
11. 同一 Session 同时最多一个 run；不新增后台队列。
12. 不支持 Serverless、多 worker、远程多用户或强 OS 沙箱。
13. LongCat A12-03 继续为 `blocked_external`，不在阶段 13 冒充通过。
14. 所有测试只接触登记的系统临时目录。

## 4. 精确文件边界

### 4.1 Task 编写阶段实际修改

```text
docs/development/13-nextjs-route-handlers-spec.md
docs/development/13-nextjs-route-handlers-tasks.md
docs/development/README.md
```

此时不得存在任何阶段 13 production/test/config 变化。

### 4.2 Task 获批后的新增白名单

Production server：

```text
lib/server/index.ts
lib/server/types.ts
lib/server/schemas.ts
lib/server/errors.ts
lib/server/http.ts
lib/server/application.ts
lib/server/bootstrap.ts
lib/server/ndjson.ts
```

Next.js Route Handlers：

```text
app/api/config/route.ts
app/api/workspaces/recent/route.ts
app/api/workspaces/validate/route.ts
app/api/sessions/route.ts
app/api/sessions/[id]/events/route.ts
app/api/sessions/[id]/runs/route.ts
app/api/runs/[id]/approvals/[approvalId]/route.ts
app/api/runs/[id]/route.ts
```

Unit tests：

```text
tests/unit/server/schemas.test.ts
tests/unit/server/errors.test.ts
tests/unit/server/http.test.ts
tests/unit/server/application.test.ts
tests/unit/server/bootstrap.test.ts
tests/unit/server/ndjson.test.ts
tests/unit/server/public-api.test.ts
tests/unit/server/security.test.ts
```

Integration tests：

```text
tests/integration/server/helpers.ts
tests/integration/server/session-routes.test.ts
tests/integration/server/run-stream.test.ts
tests/integration/server/approval-cancel.test.ts
tests/integration/server/recovery-security.test.ts
```

### 4.3 Task 获批后的修改白名单

```text
vitest.config.mts
docs/development/13-nextjs-route-handlers-tasks.md
docs/development/13-nextjs-route-handlers-summary.md
docs/development/README.md
```

### 4.4 明确禁止修改

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
app/page.tsx
app/layout.tsx
app/globals.css
package.json
pnpm-lock.yaml
next.config.ts
tsconfig.json
playwright.config.ts
```

若实施证明必须触及上述文件，不得直接修改：公共语义变化回到 Spec，纯任务文件边界变化修订本 Task，并重新等待批准。

## 5. 目标模块与内部依赖方向

```text
app/api/**
  → @/lib/server public barrel
      → server/http + server/ndjson
      → server/application
      → server/bootstrap
          → @/lib/agent
          → @/lib/context
          → @/lib/model
          → @/lib/storage
          → @/lib/workspace
```

禁止反向依赖：

```text
agent/domain/model/context/storage/workspace/tools/approval/terminal
  -X→ lib/server
  -X→ app/api
  -X→ next/*
```

`lib/server` 不导入 React、React DOM、Server Action 或 Edge-only API。Route files 只组合 Web `Request`/`Response`，不导入 `node:fs`、`node:child_process`、raw tool/approval capability。

## 6. T13-00：实施前基线与工作树保护

### 输入

- 已批准阶段 13 Spec。
- 当前阶段 11/12 文档和 test-only 资产变化。
- 当前 package/lock 和 75 files / 607 tests 覆盖率基线。

### 操作

1. 重读 Spec 第 7～18、21～23 节和本 Task 全文。
2. 记录 `git status --short`，区分已有阶段 11/12 变化与阶段 13 新变化。
3. 记录 `package.json`、`pnpm-lock.yaml` SHA-256；实施结束必须一致。
4. 确认 `app/api`、`lib/server`、`tests/unit/server`、`tests/integration/server` 尚不存在。
5. 确认本地 Next.js 版本仍为 16.3.3，相关安装包文档仍存在。
6. 运行现有基线：

```text
pnpm test
pnpm lint
pnpm typecheck
```

7. 若基线失败，停止；不得把既有失败归因于阶段 13 或先写实现绕过。

### 输出

- 基线命令和 hash 记录写入本 Task 实施记录。
- 明确的 pre-existing/phase-13 diff 边界。

### 完成条件

- 既有 607 tests、lint、typecheck 通过。
- package/lock hash 固定。
- 未产生新文件或实现变化。

### 覆盖需求

`NFR-001/002/006/008`、`COM-001/004`。

### 实施记录（2026-08-28）

- 状态：完成。
- 实施前工作树：阶段 12 两份文档和开发索引已有修改；阶段 13 Spec/Task 为未跟踪文档。除此之外没有阶段 13 production、route、test 或 config 变化。
- `package.json` SHA-256：`5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13`。
- `pnpm-lock.yaml` SHA-256：`5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683`。
- `app/api`、`lib/server`、`tests/unit/server`、`tests/integration/server`：实施前均不存在。
- Next.js：`16.3.3`；本地安装包文档已按仓库 `AGENTS.md` 要求核对。
- `pnpm test`：通过，75 files / 607 tests。
- `pnpm lint`：通过，0 errors；仅报告既有 `coverage/**/block-navigation.js` 的 2 个 unused-disable warnings。
- `pnpm typecheck`：通过。
- 结论：基线满足，允许进入 T13-01；package/lock 哈希作为阶段结束不变性基准。

## 7. T13-01：公共 DTO、Schema 与稳定常量

### 先写失败测试

在 `tests/unit/server/schemas.test.ts` 固定：

- 8 MiB body、8 MiB NDJSON line、16 MiB queue 常量。
- workspace validate、Session create、run、approval、cancel strict body。
- UUID path 参数。
- recent `limit`、events `after/limit` 与未知 query key。
- run limits 不能超过现有 30/600000，partial limits 使用核心默认值。
- title、reason、prompt 和 thinking 复用核心上限。

在 `tests/unit/server/public-api.test.ts` 固定 public barrel 只导出生产 Route Handler 需要的 DTO、Schema/helper/application loader；不得导出测试依赖、全局 reset、内部 handle、prepared invocation 或 capability。

### 实现

`lib/server/types.ts` 定义：

- `PublicModelProfile`、`PublicModelIssue`、`PublicConfig`。
- `PublicSessionMetadata`、`CreatedSessionResponse`。
- `ApiErrorEnvelope`、`CancelRunResult`。
- `ServerApplication` 与 Route Handler context 类型。

`lib/server/schemas.ts` 定义并导出：

```text
WorkspaceValidateRequestSchema
CreateSessionRequestSchema
RunRequestBodySchema
ApprovalRequestSchema
CancelRequestSchema
RecentWorkspaceSearchSchema
EventPageSearchSchema
RouteUuidSchema
```

Schema 必须使用 `z.strictObject()`，并通过已有 Agent/approval/storage/domain Schema 组合，不复制更宽松的数值或字符串上限。

### 最小验证

```text
pnpm exec vitest run tests/unit/server/schemas.test.ts tests/unit/server/public-api.test.ts
pnpm typecheck
```

### 完成条件

- 非法/未知输入在核心调用前失败。
- public 类型完全 JSON-safe。
- 无新的领域事件或协议版本。

### 覆盖需求

`FR-001/002/006/007/008/009`、`NFR-002/003`、`SEC-006`。

## 8. T13-02：HTTP 安全、有限 body 与错误映射

### 先写失败测试

`tests/unit/server/http.test.ts` 覆盖：

- hostname：`localhost`、IPv4/IPv6 loopback 成功；LAN、域名、畸形 URL 拒绝。
- mutation Origin：缺失、同源成功；跨源、畸形 Origin 拒绝。
- 不信任 `Forwarded` 与 `X-Forwarded-*`。
- JSON Content-Type 含 charset 成功；非 JSON 返回 415。
- Content-Length 提前超限与实际 stream 超限均返回 413。
- 分 chunk UTF-8 body、非法 UTF-8、非法 JSON、空 body 规则。
- JSON/NDJSON 的 `Cache-Control`、`X-Content-Type-Options` 与 Content-Type。
- 响应不复制 Authorization、Cookie 或自定义请求 header。

`tests/unit/server/errors.test.ts` 覆盖已批准 HTTP status 表，至少逐类固定：

```text
400 API_REQUEST_INVALID / workspace input
403 API_HOST_FORBIDDEN / API_ORIGIN_FORBIDDEN
404 SESSION_NOT_FOUND / AGENT_RUN_NOT_FOUND
409 AGENT_SESSION_BUSY / approval conflict
413 API_REQUEST_TOO_LARGE
415 API_CONTENT_TYPE_UNSUPPORTED
422 API_MODEL_PROFILE_UNAVAILABLE / thinking incompatible
500 corrupt history / API_INTERNAL_ERROR
503 initialization / transient store or model unavailable
```

### 实现

`lib/server/errors.ts`：

- 新增 `ServerLayerError`，内部 `cause` 不可枚举。
- 稳定 API code：

```text
API_REQUEST_INVALID
API_HOST_FORBIDDEN
API_ORIGIN_FORBIDDEN
API_REQUEST_TOO_LARGE
API_CONTENT_TYPE_UNSUPPORTED
API_MODEL_PROFILE_UNAVAILABLE
API_STREAM_FAILED
API_INTERNAL_ERROR
```

- 从已知 layer error 读取合法 `ErrorInfo`，未知 error 统一收窄。
- details 只保留 Schema/核心已经公开的有限 JSON；不得加入 body/path/stack/cause。

`lib/server/http.ts`：

- `assertLocalRequest()`、`assertMutationOrigin()`。
- 有界 `readJsonBody()`，逐 chunk 计数，不直接 `request.json()`。
- URLSearchParams → strict plain object helper，保留重复 key 检查。
- `jsonResponse()`、`apiErrorResponse()`、route guard。
- 统一无缓存和 nosniff headers。

### 最小验证

```text
pnpm exec vitest run tests/unit/server/http.test.ts tests/unit/server/errors.test.ts
pnpm lint
pnpm typecheck
```

### 完成条件

- 所有公开失败为 `ApiErrorEnvelope`。
- 8 MiB 上限对真实流字节生效，不能只信 Content-Length。
- 无请求 header/body/secret 泄漏。

### 覆盖需求

`NFR-002/003/005`、`SEC-006/008`、`COM-004`。

## 9. T13-03：Server application facade 与 Session 语义

### 先写失败测试

`tests/unit/server/application.test.ts` 使用 fake/in-memory-shaped dependencies 固定：

1. config profile 省略 `baseUrl`、endpoint、apiKeyEnv；issue message 不包含环境变量名。
2. configured、unconfigured、缺失 profile 的 Session 创建结果。
3. workspace factory 成功后只把 canonical root 交给 store。
4. workspace/profile 失败不调用 `createSession()`。
5. 默认标题使用 canonical root basename，并限制 256 字符。
6. listSessions 保留 store 排序且不伪造 status。
7. recent workspace 原样调用 store 的 limit 规则。
8. readEvents 在无 active run 时恢复；active/busy 时不误追加 interrupted。
9. startRun 注册 run/session，completion 后按 handle identity 清理。
10. cancel 首次、重复收尾、不存在三种结果。
11. resolveApproval 只转发 runId、approvalId、decision。

### 实现

`lib/server/application.ts`：

- 定义内部 `ServerApplicationDependencies`，包含 store、modelClient、runtime、workspace factory。
- 实现 internal factory；不从 public barrel 导出测试依赖类型。
- active maps 仅保存 `runId ↔ sessionId/handle`，不保存或序列化 pending capability。
- `handle.completion.finally()` 只删除仍匹配同一 handle 的项，避免旧 completion 清除新 run。
- `readEvents()` 对 `AGENT_SESSION_BUSY` 只按 active race 处理，其他恢复错误照常公开。
- config issue 使用固定通用中文：缺 Key、缺 base URL、缺 model、值无效；不返回具体 env name。

### 最小验证

```text
pnpm exec vitest run tests/unit/server/application.test.ts
pnpm typecheck
```

### 完成条件

- Session 创建顺序和失败无副作用契约固定。
- active map 不成为第二事实源。
- 不修改任何核心模块。

### 覆盖需求

`FR-001/006/007/008/009`、`SEC-001/002/006/008`。

## 10. T13-04：进程级惰性组合与 Next 热重载边界

### 先写失败测试

`tests/unit/server/bootstrap.test.ts` 使用全新 fake global object 和 dependency counters，覆盖：

- 并发 20 次首次获取只初始化一次。
- store 必须先 initialize，再创建可用 application。
- store → model → context → runtime 组合使用同一实例。
- 初始化失败不留下半对象；同一 key 的下一次调用可重试。
- 两个 consumer 取得同一 application/runtime。
- 不同版本 key 不误复用旧形状。
- production public barrel 没有 reset singleton API。

### 实现

`lib/server/bootstrap.ts`：

1. 用 `Symbol.for("secode.server.application.v1")` 或等价私有版本 key。
2. production `getServerApplication()` 只接受零参数。
3. 内部 loader factory 接受 dependencies、global target 和 key，供单元测试使用；只能从内部模块路径导入。
4. production 组合严格复用：

```text
createJsonlEventStore() → initialize()
createModelClient({ env: process.env })
createAgentContextProvider({ eventSource: store, modelClient })
createAgentRuntime({ eventStore: store, modelClient, contextProvider })
createServerApplication(...)
```

5. rejected Promise 只有在仍是当前缓存值时才清除，避免并发覆盖成功重试。

### 最小验证

```text
pnpm exec vitest run tests/unit/server/bootstrap.test.ts tests/unit/server/public-api.test.ts
pnpm typecheck
```

### 完成条件

- 单 Node 进程跨 consumer 共享 opaque runtime。
- 失败初始化可安全重试，无重复半初始化。
- 不导出真实 model environment 或 data root。

### 覆盖需求

`FR-006/007/008`、`NFR-001/006`、`SEC-006`。

## 11. T13-05：有界 NDJSON 字节流

### 先写失败测试

`tests/unit/server/ndjson.test.ts` 必须覆盖：

1. 一个 event 对应一行 UTF-8 `Uint8Array`，仅 LF，无 BOM/空行。
2. 中文、emoji、转义换行 round-trip 后通过 `AgentEventSchema`。
3. durable/live events 顺序不变，输入 event 不被修改。
4. 单行恰好上限成功，超过 8 MiB 返回 `API_STREAM_FAILED`。
5. `run.started` 可在 consumer 首次 pull 前预缓冲，不死锁。
6. 16 MiB 内连续排队；达到容量后 producer 等待。
7. pull 释放容量后 producer 恢复，严格 FIFO。
8. close 等待队列排空后只调用一次 controller.close。
9. cancel/error 拒绝所有等待 producer，释放引用并只调用一次 onCancel。
10. cancel 在 run handle 绑定前发生，绑定后仍能立即取消 handle。
11. publish-after-close、double close、close/error/cancel 竞态均确定性结算。

### 实现

`lib/server/ndjson.ts`：

- 单个 `TextEncoder`。
- `AgentEventSchema` boundary validation。
- 最多 8 MiB/line、16 MiB queued bytes。
- FIFO queue、producer waiters、pull 驱动 drain。
- `ReadableStream<Uint8Array>` 的 `pull`、`cancel` 和 close/error 状态机。
- 公开给 run route 的最小 bridge：`stream`、`publish`、`close`、`fail`、`bindRunHandle`。
- bridge error 不编码为伪 AgentEvent；有 durable terminal 时仍正常 close。

### 最小验证

```text
pnpm exec vitest run tests/unit/server/ndjson.test.ts
pnpm lint
pnpm typecheck
```

### 完成条件

- 不存在无界事件数组。
- pre-response event 不造成 handler deadlock。
- transport 失败能触发 Agent sink/cancel 收口。

### 覆盖需求

`FR-002/004/005/007`、`NFR-003/004/005`、`SEC-006`、`COM-003`。

## 12. T13-06：只读配置、工作区和 Session Route Handlers

### 实现顺序

按以下顺序创建 thin route：

1. `GET /api/config`。
2. `GET /api/workspaces/recent`。
3. `POST /api/workspaces/validate`。
4. `GET /api/sessions` 与 `POST /api/sessions`。

每个 route：

- `export const runtime = "nodejs"`。
- 先执行 local request guard；mutation 再执行 Origin guard。
- 使用 server HTTP helper 和 `getServerApplication()`。
- 不使用 `NextResponse` 特有状态；优先标准 `Response`，避免无必要 Next 耦合。
- 不设置 CORS、不缓存、不记录请求。

### 先写/同步集成测试

`tests/integration/server/helpers.ts` 提供：

- `mkdtemp` 登记 root、data、workspace 与精确 cleanup。
- 可配置 `QueueFakeModel`、ModelContinuation 和唯一 tool-call ID 生成。
- production store/context/runtime/application 组合 factory。
- `http://localhost` Request 构造、JSON 响应解析和 secret scan helper。
- 不读取 `process.env` 中真实 provider Key。

`tests/integration/server/session-routes.test.ts` 覆盖：

- config DTO 与缺失 provider 配置。
- validate canonical path、相对/不存在/根目录/symlink 边界。
- create → list → recent 的 status、排序、去重和 HTTP headers。
- title 默认/显式、profile 不可用、unknown fields。
- 跨 Origin、非 loopback、错误 Content-Type、超大 body。
- Session 创建失败后 events/data 中无半 Session。

### 最小验证

```text
pnpm exec vitest run tests/integration/server/session-routes.test.ts
pnpm exec vitest run tests/unit/server
pnpm typecheck
```

### 完成条件

- 四组 API response 与批准 Spec 完全一致。
- config 不含 base URL、endpoint 或 env name。
- route files 不含业务判断或 Node raw execution。

### 覆盖需求

`FR-001/008/009`、`NFR-001/002/003`、`SEC-001/002/006/008`。

## 13. T13-07：事件恢复 Route Handler

### 实现

创建 `GET /api/sessions/[id]/events`：

- context 明确为 `{ params: Promise<{ id: string }> }` 并 `await params`。
- `id` 使用 UUID Schema。
- URLSearchParams 只允许 `after`、`limit`，重复/未知 key 拒绝。
- 调用 application `readEvents()`，不直接调用 store。
- 返回 store page 的 `events/lastSeq/hasMore/recovery`。
- 只返回 durable event；不伪造 delta 或 status。

### 测试

扩展 `session-routes.test.ts`：

- after=0、页中/页尾、空增量页、limit 边界。
- invalid UUID、负数、小数、超限、重复/未知 query。
- open run 的首次恢复追加唯一 `run.interrupted`。
- 当前 active Session 读取不被错误 interrupt。
- 不完整最后一行按 store 规则修复；中间坏行返回有限 500。
- 恢复响应中无 stack/cause/raw corrupt line。

### 最小验证

```text
pnpm exec vitest run tests/integration/server/session-routes.test.ts
pnpm exec vitest run tests/unit/storage/recovery.test.ts tests/unit/agent/recovery.test.ts
pnpm typecheck
```

### 完成条件

- refresh/restart durable 恢复语义成立。
- HTTP 层未复制 JSONL scanner/projector。

### 覆盖需求

`FR-005/008/010`、`NFR-003`、`SEC-006`。

## 14. T13-08：Run NDJSON Route Handler 与完整工具闭环

### 实现

创建 `POST /api/sessions/[id]/runs`：

1. local/origin/content/body/path/body Schema 全部通过后创建 NDJSON bridge。
2. 把 path Session id 与 run body 组合为既有 `AgentRunRequest`。
3. `onEvent` 直接绑定 bridge `publish`。
4. `request.signal` 直接传入 `AgentRunControls.signal`。
5. `startRun()` 成功后绑定 handle；completion outcome settle 后 close bridge。
6. completion 意外 reject 时 `fail()`，不得编码私有错误行。
7. startRun 失败时销毁 bridge 并返回普通 JSON error，不能返回半个 NDJSON response。
8. 成功 Response 使用 NDJSON headers，不设置 Content-Length。

### 完整闭环假模型

`tests/integration/server/run-stream.test.ts` 使用独立临时 slug fixture：

```text
README contract
src/slug.mjs（初始缺陷）
tests/slug.test.mjs（初始 2 pass / 2 fail）
package.json（pnpm test）
```

假模型必须通过真实 production Agent/tool path 依次：

1. `read_file` 读取 source 并取得 SHA。
2. `replace_in_file` 使用真实 SHA 做唯一替换。
3. `run_process` 执行 `pnpm test`。
4. 返回 final summary。

不得直接从测试修改 fixture 冒充工具结果。测试断言：

- NDJSON 每行通过 `AgentEventSchema`。
- event 顺序包括 run/user/model/tool/terminal。
- live delta 有 `streamSeq`，不出现在 events API。
- durable stream events 与 JSONL 同 ID/seq/deep equality。
- fixture 测试从 2/2 变为 4/4，只有 source 被修改。
- final assistant message 与 `run.completed` 唯一。
- Session 第二个并发 run 返回 409，不影响第一个。

### 最小验证

```text
pnpm exec vitest run tests/integration/server/run-stream.test.ts
pnpm exec vitest run tests/unit/server/ndjson.test.ts tests/unit/agent/runtime-tools.test.ts
pnpm typecheck
```

### 完成条件

- HTTP 完整闭环通过，且所有工具仍经 workspace/approval gateway。
- 实时和 durable 事实精确对应。

### 覆盖需求

`FR-002/003/004/005/008/010`、`NFR-004/005/006`、`SEC-001/003/005/007`、`COM-001/002/003`。

## 15. T13-09：审批与取消 Route Handlers

### 实现

创建：

```text
POST /api/runs/[id]/approvals/[approvalId]
DELETE /api/runs/[id]
```

审批 route：

- `params` 为 Promise，并在一次 await 后同时校验两个 UUID。
- body 只能是 `approved/reason`。
- 只调用 application/runtime resolve API。
- success 200；run 不存在 404；no pending/mismatch/repeated 409。

取消 route：

- 空 body 或 strict `{ reason? }`。
- 第一次 202 `cancellation_requested`。
- active 但已收到 cancel 为 202 `already_requested`。
- 当前进程无 active run 为 404。
- 不扫描 JSONL 寻找并改变历史 run。

### 测试

`tests/integration/server/approval-cancel.test.ts` 覆盖：

1. unknown process 产生 `approval.required`，allow 后才 `tool.started`。
2. reject 产生 resolved + rejected result，不出现 started。
3. 错 approvalId、非法 body、重复决定无副作用。
4. cancel 审批等待后唯一 `run.cancelled`，审批随后 409。
5. cancel 阻塞模型请求，request signal 被模型观察。
6. cancel 长进程，直接子进程收口，无晚到 `tool.result`。
7. stream cancel 与 request abort 各自触发取消。
8. DELETE/stream/request 三取消竞态只有一个 terminal event。
9. approval 先提交与 cancel 后到的事件顺序符合 Agent 既有语义。
10. 所有 response 无 invocation、authorization、stack/cause。

### 最小验证

```text
pnpm exec vitest run tests/integration/server/approval-cancel.test.ts
pnpm exec vitest run tests/unit/agent/runtime-approval.test.ts tests/unit/agent/runtime-cancellation.test.ts
pnpm typecheck
```

### 完成条件

- 审批/取消访问同一 runtime capability。
- 重复、错 ID 和竞态不会执行第二次工具。

### 覆盖需求

`FR-006/007`、`NFR-003/004/005`、`SEC-004/005/006`。

## 16. T13-10：恢复、安全与故障集成矩阵

### 测试

`tests/integration/server/recovery-security.test.ts` 固定：

1. application A 留下合法 open run 事件；application B 首次 events 恢复追加一个 interrupted。
2. 重启后旧 approval/cancel 不恢复 capability；新 run 可继续。
3. workspace traversal、绝对工具 path、外部 symlink 仍为结构化 tool/error 事实。
4. 未配置 profile、thinking 不兼容、Session 不存在的 HTTP status。
5. fake model 抛 auth/rate-limit/provider/timeout/protocol error，流中得到对应唯一 `run.failed`。
6. store 初始化失败、Session metadata/log corrupt、commit uncertain 映射有限。
7. cross-origin/non-loopback 对所有 mutation 的表驱动覆盖。
8. 伪 Key/Bearer/path/stack/cause/reasoning 不出现在 config、JSON、NDJSON 或测试 snapshot。
9. body 8 MiB、line 8 MiB、queue 16 MiB 边界和资源释放。
10. cleanup 只删除登记的 `secode-server-*` 临时根，无后台 process/listener。

### 约束

- 不启动真实 DeepSeek/LongCat/generic HTTP 服务。
- 不读取真实环境 Key；测试 env 使用空/假值且不写日志。
- 不手改 JSONL 制造成功；坏日志只用于错误/恢复 fixture。

### 最小验证

```text
pnpm exec vitest run tests/integration/server/recovery-security.test.ts
pnpm exec vitest run tests/integration/server
pnpm lint
pnpm typecheck
```

### 完成条件

- failure/abort/restart/security 矩阵无未分类行为。
- 临时资源全部收口。

### 覆盖需求

`FR-007/008/009`、`NFR-002/003/005`、`SEC-001/002/006/008`、`COM-004`。

## 17. T13-11：Next.js 路由与依赖边界审计

### 操作

1. 对八个 route 文件逐一确认：
   - method 与 path 正确。
   - `runtime = "nodejs"`。
   - dynamic params Promise + await。
   - no-store/nosniff。
   - 无 `page.tsx` 同 segment 冲突。
2. 静态扫描 `app/api/**`：

```text
不得出现 node:fs
不得出现 child_process
不得出现 executePreparedLocalTool
不得出现 executeAuthorizedLocalTool
不得出现 request.json()
不得出现 Access-Control-Allow-Origin
不得出现 reasoning
```

3. 扫描核心模块无 `@/lib/server`、`app/api` 或 `next/*` 反向依赖。
4. 运行 actual route exports 的 integration tests，不能只测试复制的 helper。
5. 运行 `pnpm build`，以 Next.js 16 类型生成验证所有 route context。

### 最小验证

```text
pnpm exec vitest run tests/integration/server
pnpm typecheck
pnpm build
```

### 完成条件

- Next route graph 编译通过。
- actual route files 被测试并纳入覆盖率。
- 无核心反向依赖或 raw execution。

### 覆盖需求

`NFR-001/002/006`、`SEC-003/005/006`、`COM-001/002/003`。

## 18. T13-12：覆盖率阈值与全仓顺序门禁

### 覆盖率配置

只修改 `vitest.config.mts`：

```text
coverage.include = ["lib/**/*.ts", "app/api/**/*.ts"]
coverage.thresholds.statements = 80
coverage.thresholds.branches = 70
coverage.thresholds.functions = 80
coverage.thresholds.lines = 80
```

保留 provider、reporter 和现有 test include。不得排除 `lib/server/**` 或 `app/api/**`。

### 首次覆盖率反馈

先运行 `pnpm test:coverage`。若失败：

- 记录真实低覆盖文件/分支。
- 只增加行为测试，不加无断言调用。
- 不降低阈值、不添加 ignore pragma、不移除 app/api include。
- 修正后重跑 server unit/integration 和完整 coverage。

### 全仓固定顺序

```text
pnpm exec vitest run tests/unit/server
pnpm exec vitest run tests/integration/server
pnpm test:coverage
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
git diff --check
```

不得并行运行完整 Vitest、coverage、lint、typecheck、build 或 E2E，避免进程/fsync 竞争。

### 完成条件

- 阈值 80/70/80/80 全部通过。
- 全仓测试数量不低于基线 607 + 新增有效测试。
- 默认页面 E2E 仍通过；本阶段不以 E2E 声明 UI 完成。
- package/lock hash 与 T13-00 一致。

### 覆盖需求

全部阶段 13 需求及 `NFR-008`、`COM-001/004`。

## 19. T13-13：反思、秘密与残留审计

### 审计

1. 对照 Spec 12 项验收标准和本 Task T13-00～T13-12 逐项打勾。
2. `git diff --name-status` 只能出现白名单路径和已有阶段 11/12 变化。
3. package/lock diff 为 0，hash 不变。
4. 扫描：

```text
真实 API Key / Bearer / Authorization 值
baseUrl / endpoint / apiKeyEnv 的响应字段
stack / cause / private reasoning
.only / 永久 .skip / coverage ignore
真实 .secode-data / Session / 临时 workspace path
后台 server / child process / open listener
```

5. 检查每个测试 cleanup 的确切目录登记和 prefix。
6. 检查 LongCat 仍为未真实测试限制。
7. 反思所有首次失败、诊断、修正和重验；不得只记录最终成功。

### 偏差分类

- 已批准语义内的局部实现/测试缺陷：最小修正并重跑相关门禁，Summary 记录。
- 文件范围或任务顺序需改变：停止，修订本 Task 并重新审批。
- API、错误、安全、流、单例、核心协议或范围需改变：停止，回到 Spec 修订。
- 需要新增依赖、真实 provider、UI 或核心模块修改：停止，默认不授权。

### 完成条件

- 审计全零或所有例外都有批准来源。
- 无未解释 diff、secret、后台进程和真实数据。
- 可以生成 Summary，但仍不能进入阶段 14。

## 20. T13-14：生成 Summary 并停止

### 操作

1. 更新本 Task 每项实际状态与验证结果，不改写原批准内容。
2. 生成 `docs/development/13-nextjs-route-handlers-summary.md`，至少包含：
   - Spec/Task 审批链。
   - T13-00～T13-14 实际执行顺序。
   - 详细模块、路由和数据流说明。
   - 新增/修改/删除文件清单。
   - 单元、集成、coverage、lint、typecheck、test、build、E2E、diff 结果。
   - 首次失败、诊断、修正和重验。
   - API/安全/流/取消/审批/恢复证据。
   - 与 Spec/Task 偏差、限制和阶段 14 固定输入。
   - LongCat 范围豁免仍未变成测试通过。
3. 更新开发索引为“阶段 13 Summary 待用户审批”。
4. 运行文档链接、状态、围栏、秘密、绝对临时路径和 `git diff --check`。
5. 立即停止，不开始阶段 14 观察或 UI。

### 完成条件

- Summary 可审计且等待用户批准。
- 未创建任何阶段 14 文件或 UI 变化。

## 21. 任务依赖图

```text
T13-00 基线
  → T13-01 DTO/Schema
      → T13-02 HTTP/error
          → T13-03 application
              → T13-04 singleton bootstrap
          → T13-05 NDJSON
              → T13-06 config/workspace/session routes
                  → T13-07 events route
                      → T13-08 run stream
                          → T13-09 approval/cancel
                              → T13-10 recovery/security matrix
                                  → T13-11 Next route audit/build
                                      → T13-12 coverage/full gates
                                          → T13-13 reflection/audit
                                              → T13-14 Summary
```

T13-04 与 T13-05 的纯实现可在逻辑上独立，但本阶段仍按编号串行开发和验证，避免共享工作树竞态。

## 22. API 到任务映射

| API | 实现任务 | 主要测试 |
| --- | --- | --- |
| `GET /api/config` | T13-03/04/06 | config redaction、headers |
| `GET /api/workspaces/recent` | T13-03/06 | limit、排序、去重 |
| `POST /api/workspaces/validate` | T13-02/03/06 | canonical、symlink、Origin |
| `GET /api/sessions` | T13-03/06 | stable list、no fake status |
| `POST /api/sessions` | T13-01/03/06 | profile/workspace/create atomicity |
| `GET /api/sessions/[id]/events` | T13-01/03/07 | async params、paging、interrupted |
| `POST /api/sessions/[id]/runs` | T13-05/08 | NDJSON、full loop、abort |
| `POST /api/runs/[id]/approvals/[approvalId]` | T13-03/09 | allow/reject/repeat/race |
| `DELETE /api/runs/[id]` | T13-03/09 | first/repeat/missing/cancel race |

`app/api/sessions/route.ts` 同时承载 GET/POST，因此 Spec 所称“八组 Route Handlers”对应八个 route files、九个 method contracts。

## 23. 需求到任务追踪矩阵

| 需求 | 任务 |
| --- | --- |
| FR-001 | T13-01/03/06 |
| FR-002 | T13-01/05/08 |
| FR-003/004 | T13-08 |
| FR-005 | T13-05/07/08 |
| FR-006 | T13-03/04/09 |
| FR-007 | T13-05/09/10 |
| FR-008 | T13-03/07/10 |
| FR-009 | T13-03/06/10 |
| FR-010 | T13-05/07/08 |
| NFR-001 | T13-04/06–12 |
| NFR-002/003 | T13-01/02/06–12 |
| NFR-004/005 | T13-05/08–10 |
| NFR-006 | T13-03/04/11 |
| NFR-008 | T13-00/12–14 |
| SEC-001/002 | T13-03/06/10 |
| SEC-003/004/005 | T13-08/09/11 |
| SEC-006 | T13-02–13 |
| SEC-007 | T13-08 |
| SEC-008 | T13-02/06/10/14 |
| COM-001/002/003 | T13-05/08/11–13 |
| COM-004 | T13-00/02/10/12–14 |

## 24. 每步验证纪律

1. 每个 T13 任务开始前重读其对应 Spec 节和本 Task 节。
2. 先写能在缺失行为上失败的测试，再做最小实现；不写与验收无关的抽象。
3. 每完成一项立即运行该节最小验证，失败不得继续后续任务。
4. 修正后重跑失败测试、所属目录测试和类型检查。
5. route 与 application 测试必须调用 production exports，不复制 production 逻辑到测试 helper。
6. 不用 snapshot 代替关键字段/事件顺序断言。
7. 不通过延长 sleep 隐藏竞态；使用可控 promise/signal/barrier。
8. 不用真实用户目录、默认 `.secode-data` 或真实模型环境。
9. 不并行执行可能共享全局 singleton、data root 或进程的 integration tests，除非 fixture 明确隔离。
10. 完整门禁固定串行，任何失败先记录再修复。

## 25. 错误处理与回退策略

### 25.1 可在已批准 Task 内修正

- `lib/server/**` 私有函数排版、内部状态机 bug。
- 已列测试文件中的 fixture、等待屏障和断言完善。
- route thin wrapper 的 HTTP status/header/params 接线错误。
- coverage 不足时补充真实行为测试。

修正必须保持 Spec 的 API、限制、status、安全和流语义不变，并记录首次失败。

### 25.2 必须修订本 Task

- 新增/改名白名单文件。
- 调整 T13 编号依赖顺序。
- 需要修改 `vitest.config.mts` 之外的工程配置。
- 实现需要额外 test-only helper 文件。

### 25.3 必须回到 Spec

- 改 API path/method/body/response/status。
- 放宽 loopback、Origin、Content-Type 或 size 限制。
- 改 8/8/16 MiB、30 轮、10 分钟或 coverage 阈值。
- 增加 done/status/reasoning NDJSON frame。
- 不再 cancel 断开的运行。
- 改为 SSE/WebSocket/Server Action/Edge。
- 改 Session 固定 workspace/profile、JSONL 事实源或 approval capability 生命周期。
- 支持多进程/Serverless/远程用户。
- 需要修改核心公共接口或事件协议。

### 25.4 默认拒绝

- 新增依赖、Agent/AI SDK、第三方 stream/routing framework。
- 真实模型/外网调用。
- 读取或记录真实 Key。
- UI、页面、样式、Markdown 或 Playwright 产品流程实现。
- Git commit/push、部署、清理阶段 12 证据。

## 26. 预期验证结果

实施完成预期至少得到：

| 验证 | 预期 |
| --- | --- |
| Server unit | 全部通过；Schema/HTTP/application/bootstrap/NDJSON/security |
| Server integration | 全部通过；九个 method contracts |
| Full fake-agent loop | 真实工具修改临时 fixture，测试转绿 |
| Approval/cancel | allow/reject/repeat/abort/race 全部通过 |
| Recovery | open run → unique interrupted，durable history 可读 |
| Coverage | statements≥80、branches≥70、functions≥80、lines≥80 |
| Lint | exit 0，0 warnings |
| Typecheck | exit 0 |
| Full test | 607 基线 + 新测试全部通过 |
| Build | Next.js 16.3.3 route graph 构建通过 |
| E2E | 基线页面仍可用；不声明 UI 完成 |
| Secret audit | Key/endpoint/reasoning/stack/cause 泄漏 0 |
| Package/lock | hash 不变、diff 0 |
| Diff check | exit 0 |

## 27. 实施后总门禁清单

- [x] Spec 与 Task 均有用户批准记录。
- [x] T13-00 基线通过且 pre-existing diff 已固定。
- [x] DTO/Schema、HTTP/error、application、bootstrap、NDJSON 均完成最小验证。
- [x] 八个 route files、九个 method contracts 与 async params 完成。
- [x] config/workspace/session/events/run/approval/cancel 集成通过。
- [x] 完整假模型工具闭环通过，durable/live 事件一致。
- [x] approval allow/reject/repeat 与三类 cancel/竞态通过。
- [x] restart interrupted、workspace/security/failure matrix 通过。
- [x] app/api 无 raw fs/process/tool/approval 执行或 CORS。
- [x] coverage include 和 80/70/80/80 阈值通过。
- [x] lint/typecheck/test/build/E2E/diff check 全部通过。
- [x] package/lock 不变，无新增依赖。
- [x] 无 secret、reasoning、stack/cause、真实数据或后台进程。
- [x] LongCat 未冒充测试通过。
- [x] Summary 已生成并更新索引为待审批。
- [x] 阶段 14 未开始。

### 27.1 实施结果记录（2026-08-28）

| 任务 | 状态 | 主要产物与证据 |
| --- | --- | --- |
| T13-00 | 完成 | 冻结工作树、package/lock hash；75 files / 607 tests 基线通过 |
| T13-01 | 完成 | JSON-safe DTO、strict Schema、8/8/16 MiB 常量、public barrel 测试 |
| T13-02 | 完成 | loopback/Origin、有限 UTF-8 JSON body、统一错误 envelope/status |
| T13-03 | 完成 | application facade、配置脱敏、Session 规范化、active handle identity 清理 |
| T13-04 | 完成 | `globalThis` 版本化惰性 singleton、并发一次初始化、失败可重试 |
| T13-05 | 完成 | AgentEvent 边界校验、字节计量 NDJSON 队列、背压/取消/关闭状态机 |
| T13-06 | 完成 | config、workspace、Session 四组 API |
| T13-07 | 完成 | durable events 分页与 open run 唯一 interrupted 恢复 |
| T13-08 | 完成 | run NDJSON API；真实 read → replace → pnpm test → final 假模型闭环 |
| T13-09 | 完成 | approval allow/reject/repeat 与 DELETE/stream/request cancel 路径 |
| T13-10 | 完成 | provider failure、thinking、missing Session、Origin、恢复与 secret matrix |
| T13-11 | 完成 | 八个 route 均为 Node runtime；async params；无 raw execution；Next build 通过 |
| T13-12 | 完成 | 87 files / 662 tests；覆盖率 87.21/80.19/89.85/88.79；全门禁通过 |
| T13-13 | 完成 | 白名单、反向依赖、secret、残留、package/lock 与 LongCat 状态审计 |
| T13-14 | 完成 | [阶段 13 Summary](./13-nextjs-route-handlers-summary.md) 已生成，等待用户审批 |

最终补充说明：`pnpm lint` exit 0、0 errors，但会扫描 coverage 生成物并报告与 T13-00 基线相同的 2 个 unused-disable warnings；阶段 13 未修改 ESLint 配置或 coverage 产物。`pnpm build` exit 0，并保留 Turbopack 对既有动态本地文件访问的 1 条 tracing 警告；未越权修改 `lib/storage/**`。

## 28. Task 内部门禁

- [x] 已链接并记录阶段 13 Spec 批准。
- [x] 已逐条覆盖 Spec 的 API、架构、NDJSON、安全、错误、竞态和测试决策。
- [x] 已固定 production、route、test、config 和 docs 白名单。
- [x] 已按依赖顺序拆分 T13-00～T13-14。
- [x] 每项任务包含输入/操作/输出或实现、最小验证、完成条件和需求覆盖。
- [x] 已定义真实工具闭环、审批、取消、恢复和故障测试。
- [x] 已固定覆盖率 include、阈值和全仓命令顺序。
- [x] 已定义 Task 修订、Spec 回退和默认拒绝条件。
- [x] 未创建任何 production、route、test、config 或 Summary 文件。
- [x] 未修改 package/lock、核心模块或 UI。

**Task 内部门禁结论：通过。实施已完成，当前等待阶段 13 Summary 用户审批。**

## 29. 用户审批项

批准本 Task 即确认：

1. 按 T13-00～T13-14 严格串行实施，每项先测试后最小实现并立即验证。
2. 只允许第 4 节白名单；核心模块、UI、package/lock 和工程配置默认不变。
3. 使用 `lib/server`、八个 route files 和九个 method contracts。
4. process-global singleton、8 MiB body/line、16 MiB queue 与断线取消语义不变。
5. 所有测试使用临时 data/workspace 与假模型，不调用真实 provider。
6. 将 `lib/**/*.ts` 和 `app/api/**/*.ts` 纳入 80/70/80/80 覆盖率门禁。
7. 发现公共接口或安全语义变化时停止并回到 Spec；不自行扩大范围。
8. 完成后只生成阶段 13 Summary 并等待审批，不进入阶段 14 UI。

## 30. 用户审批记录

- 审批结果：用户于 2026-08-28 明确批准。
- 已解锁：T13-00～T13-14 的白名单实施、验证和 Summary 生成。
- 批准后仍禁止：真实 provider、LongCat 替代、核心协议变更、依赖变更、UI、Git 外部操作和阶段 14。
