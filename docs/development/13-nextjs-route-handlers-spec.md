# 阶段 13 Spec：Next.js Route Handlers

## 1. 文档状态与阶段门禁

- 当前状态：已批准。
- 观察日期：2026-08-28。
- 前置事实：[阶段 12 进度 Summary](./12-terminal-core-acceptance-summary.md) 已获用户批准；LongCat-compatible 真实冒烟仍为 `blocked_external`。
- 范围豁免：用户于 2026-08-28 明确要求跳过 LongCat 测试并直接进入阶段 13；该决定只解除阶段推进阻塞，不代表 LongCat 测试通过。
- 当前允许：严格依据本 Spec 生成和修订阶段 13 Task 文档。
- 当前禁止：阶段 13 Task 获批前创建 `app/api/**`、编写 `lib/server/**`、修改配置或测试、开发 UI。
- 下一步门禁：阶段 13 Task 获用户明确批准后，才能开始实际开发。

审批链：

```text
阶段 12 进度 Summary（已批准）
  → LongCat 真实冒烟范围豁免（用户明确批准）
  → 阶段 13 只读观察（已完成）
  → 本 Spec（已批准）
  → 阶段 13 Task（尚未生成）
  → 实际开发（未开始）
```

## 2. 阶段目标

在不复制 Agent、存储、工作区或审批逻辑的前提下，为现有本地单用户核心增加 Next.js 16.3.3 App Router HTTP 边界，使后续阶段 14 的 Client Component 能够：

1. 获取脱敏模型配置、最近工作区和历史会话。
2. 验证工作区并创建固定工作区/模型的 Session。
3. 分页恢复 durable 事件。
4. 提交任务并通过 NDJSON 实时接收完整 `AgentEvent`。
5. 在独立请求中批准/拒绝当前危险操作。
6. 取消当前运行，并在断线时安全停止 Agent。

阶段 13 只完成 Node.js API 与服务端组合，不改变默认页面，不实现中文工作台。

## 3. 需求追踪

| 需求 | 本阶段覆盖 | 验收证据 |
| --- | --- | --- |
| FR-001 | 工作区验证与 Session 创建 API | Route Handler 集成测试 |
| FR-002 | Session run 提交与 NDJSON 响应 | 流式集成测试 |
| FR-003 | HTTP 复用已验收的六工具 Agent | 假模型完整轨迹测试 |
| FR-004 | 复用 Agent 决策循环并流式暴露事件 | 读→改→测→总结集成测试 |
| FR-005 | 向阶段 14 提供消息、工具、错误和状态事件 | 事件协议/NDJSON 测试 |
| FR-006 | 独立审批 Route Handler | 允许、拒绝、重复决定测试 |
| FR-007 | DELETE 取消与断线 AbortSignal | 取消/断线竞态测试 |
| FR-008 | 会话列表、事件分页和重启恢复 | 临时 JSONL 恢复测试 |
| FR-009 | 脱敏配置与固定 profile 选择 | 配置和 Session 创建测试 |
| FR-010 | 原样传输 `context.compacted` durable 事件 | 事件恢复/流测试 |
| NFR-001 | Next.js 16.3.3 App Router、Node.js Runtime | 路由结构与 build |
| NFR-002 | strict TypeScript、Zod HTTP 输入边界 | Schema 和 typecheck |
| NFR-003 | 有限、结构化 HTTP 错误 | 错误映射测试 |
| NFR-004/005 | 不突破现有 Agent、工具和模型限制 | 透传限制测试 |
| NFR-006 | 核心仍不依赖 React/浏览器 | 依赖边界测试 |
| NFR-008 | Spec/Task/Summary 与验证证据 | 文档门禁 |
| SEC-001/002 | workspace validate 复用同一 factory | 临时路径/symlink 测试 |
| SEC-003/004/005 | 路由不执行 raw tool，不复制风险判断 | 依赖/行为测试 |
| SEC-006 | Key 仅在服务端组合读取，响应和流无 Key | 配置/秘密扫描 |
| SEC-007 | HTTP 不绕过文件工具的 SHA 契约 | 完整 Agent 轨迹测试 |
| SEC-008 | API 明示可信本地单用户边界 | 配置响应与文档检查 |
| COM-001/002/003 | 使用原生 Route Handler/Web Streams，自研组合 | 依赖和代码审查 |
| COM-004 | 无凭据、请求日志或真实 Session 入库 | Git/秘密扫描 |

阶段 14 负责 `NFR-007` 和浏览器产品 E2E；阶段 15 负责最终提交材料。

## 4. 只读观察范围与方法

### 4.1 已核对文档

- [阶段开发与三级审批规范](./00-process.md)。
- [需求、范围与验收标准](./01-requirements.md)。
- [工程基线](./02-engineering-baseline.md)。
- 阶段 03、05、06、07、08、09、10 已批准 Spec 中面向 HTTP/NDJSON 的后续契约。
- [阶段 12 进度 Summary 与范围豁免](./12-terminal-core-acceptance-summary.md)。

### 4.2 已核对本地 Next.js 16.3.3 文档

遵循仓库 `AGENTS.md`，本次在任何 Next.js 编码前阅读了安装包内的权威文档：

```text
node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md
node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md
```

确认事实：

1. Route Handler 位于 `app/**/route.ts`，使用 Web `Request`/`Response`。
2. `GET/POST/DELETE` 均受支持；Route Handler 默认不缓存。
3. Next.js 16 动态路由 `params` 是 Promise，必须 `await`。
4. Node.js 是默认 Runtime；Edge Runtime 已弃用，且本项目依赖 `fs`、子进程和进程内能力，不能使用 Edge。
5. 原生 Web `ReadableStream` 可用于 LLM 流式响应，`Response` 正文必须产生 `Uint8Array`。
6. Route Handler 是公开端点，必须验证输入、限制 payload 并避免公开内部错误。
7. Serverless/多实例环境不能可靠共享进程内运行和审批能力；本项目已明确只在本地持久 Node 进程运行。

### 4.3 已观察代码与测试

- `app/` 只有默认页面、布局和样式，没有 `app/api/**`。
- `lib/storage` 已公开 `listSessions()`、`listRecentWorkspaces()`、`createSession()`、`readEvents()` 和 `inspectSession()`。
- `lib/workspace` 已公开唯一工作区 factory `createWorkspaceHandle()`。
- `lib/model` 已公开 `createModelClient()` 与脱敏 `getConfigSnapshot()`；API Key 不在快照中。
- `lib/agent` 已公开 `recoverSession()`、`startRun()`、`cancelRun()`、`resolveApproval()` 和 `getActiveRun()`。
- `AgentRunControls` 已支持 `signal` 与 `onEvent`，durable event 在 fsync 成功后才交给 sink；`assistant.delta` 仅实时发布。
- `lib/terminal/bootstrap.ts` 已证明 store → model → context → runtime 的组合顺序，但它是每个 CLI 进程私有的，不能直接充当跨 Route Handler 共享实例。
- JSONL 是唯一可恢复事实；active run、pending approval、continuation 和 authorization 只存在当前进程内。
- 当前 Vitest 配置覆盖 `lib/**/*.ts`，但尚未设置阈值。
- 当前工作树已有阶段 11/12 文档及阶段 12 测试资产变更；阶段 13 必须保留并避免归属混淆。

### 4.4 覆盖率只读基线

执行 `pnpm test:coverage`，结果为 75 files / 607 tests 全通过：

| 指标 | 当前值 |
| --- | ---: |
| Statements | 86.56% |
| Branches | 79.86% |
| Functions | 89.36% |
| Lines | 88.19% |

命令只生成已忽略的 `coverage/`，没有修改受版本控制文件。阶段 02 遗留的“阶段 13 设置覆盖率阈值”因此已有真实基线。

## 5. 当前差距

现有核心已经能在终端完整运行，但 Web 边界仍缺少：

1. 多个 Route Handler 共用的进程级 store/model/context/runtime 组合实例。
2. HTTP 请求、query、动态 path 参数和 Content-Type 的 strict Schema。
3. 统一 JSON 成功响应与有限 `ApiErrorEnvelope`。
4. Session 创建前的 workspace/profile 服务端协调。
5. 兼容 `assistant.delta` 与 durable event 的 NDJSON 字节流桥。
6. 流断开、`request.signal`、`ReadableStream.cancel()` 与 Agent 取消的接线。
7. 审批和取消请求访问同一 active runtime 的进程内协调。
8. 服务重启后 open run 在事件读取时转为 `run.interrupted` 的恢复入口。
9. 本地来源限制、同源 mutation 防护、payload 大小限制和无缓存响应头。
10. Route Handler 单元/集成测试与全局覆盖率阈值。

## 6. 范围边界

### 6.1 范围内

- 八组计划中的 `/api` Route Handlers。
- Node-only 服务端 application facade 与惰性进程级组合。
- HTTP DTO、Zod Schema、错误映射和安全响应头。
- 原生 `ReadableStream<Uint8Array>` NDJSON 编码、背压和取消。
- 同一 Node 进程内的 active run/Session 协调。
- 临时数据根、临时工作区和假模型的 API 集成测试。
- `vitest.config.mts` 全局覆盖率阈值。
- 阶段 13 Task、实现和 Summary（均需各自门禁批准）。

### 6.2 范围外

- `app/page.tsx`、布局、样式、中文工作台和任何 Client Component；属于阶段 14。
- Markdown、差异卡片、抽屉、会话侧栏和浏览器完整产品 E2E；属于阶段 14。
- Server Action、Pages API Route、Edge Runtime、WebSocket、SSE 或第三方流库。
- 登录、多用户、远程访问、CORS 开放、CSRF token 和强 OS 沙箱。
- Serverless、无状态部署、多进程共享运行、分布式锁或后台任务队列。
- 修改 Agent/事件/工具/审批公共语义或协议版本。
- 真实 DeepSeek/LongCat 网络调用；阶段 13 只使用假模型。
- Git commit/push、安装依赖、改变模型超时/Agent 限制或清理阶段 12 临时证据。

## 7. 总体架构

```text
Browser（阶段 14）
  │ JSON / application/x-ndjson
  ▼
app/api/**/route.ts                只处理 Web Request/Response 与 async params
  │
  ▼
lib/server                         Node-only HTTP application facade
  ├─ strict input/query/path schemas
  ├─ public DTO + error/status mapping
  ├─ bounded NDJSON byte bridge
  ├─ active run/session coordination
  └─ process-global lazy composition
       ├─ JsonlEventStore
       ├─ ModelClient
       ├─ AgentContextProvider
       └─ AgentRuntime
            ├─ workspace factory
            ├─ approval gateway
            └─ six local tools
```

固定原则：

1. Route Handler 必须薄；不解析 JSONL、不执行 raw 工具、不判断命令风险。
2. `lib/server` 可依赖核心公共 barrel 和 Node/Web 标准 API，不依赖 React。
3. 核心 `lib/agent`、`lib/storage`、`lib/tools` 不反向依赖 `lib/server` 或 `next/*`。
4. HTTP 事件只序列化既有 `AgentEvent`，不建立第二套事件协议。
5. 进程内 registry 只协调不可持久化能力；历史事实仍以 JSONL 为准。
6. 每个 Route Handler 使用可静态分析的 `export const runtime = "nodejs"`，不依赖 Edge。

## 8. 服务端组合与生命周期

### 8.1 进程级惰性单例

所有 Route Handler 必须调用同一个 `getServerApplication()`。该入口使用 `globalThis` 上带版本的私有 key 缓存初始化 Promise，保证 Next 开发模式模块重载和不同 route module 在同一 Node 进程内共享：

- 一个已初始化的 `JsonlEventStore`。
- 一个由服务端环境创建的 `ModelClient`。
- 一个复用 store/model 的 `AgentContextProvider`。
- 一个 `AgentRuntime`，因此 approval/cancel 能找到 run 的 opaque capability。
- 一个有限 active run 协调表。

并发首次请求只能进行一次初始化。失败初始化不得留下半可用对象；失败 Promise 从缓存清除，使后续请求可重新尝试。生产 public barrel 不导出测试依赖注入或全局重置函数。

### 8.2 环境与密钥

- store 继续由 `SECODE_DATA_DIR` 或默认 `.secode-data` 决定。
- model client 只在服务端读取现有 DeepSeek/LongCat/generic 环境变量。
- 浏览器不能提交 `baseUrl`、model id、环境变量名或 API Key 来临时改变 server profile。
- 进程启动后的环境变化不热更新；修改配置后重启本地 Next 进程。
- 配置、错误、日志、事件和测试快照均不得包含 API Key、Authorization header 或 private reasoning。

### 8.3 单进程限制

运行、pending approval 和 continuation 无法跨进程恢复。因此阶段 13 明确支持：

```text
一个本地 Next Node 进程 + 一个可信本地用户 + 一个 JSONL data root
```

不支持多 worker、Serverless 或两个 Next 进程同时写同一数据根。重启后旧 active run 不能继续，下一次 Session 恢复必须追加 `run.interrupted`。

## 9. 服务端 application facade

Route Handler 只能通过以下语义调用服务端 facade；最终命名可在 Task 中排版，但行为不得改变：

```ts
interface ServerApplication {
  getConfig(): PublicConfig;
  listRecentWorkspaces(limit?: number): Promise<readonly string[]>;
  validateWorkspace(rootPath: string): Promise<{ workspacePath: string }>;
  listSessions(): Promise<readonly PublicSessionMetadata[]>;
  createSession(input: CreateSessionInput): Promise<CreatedSessionResponse>;
  readEvents(sessionId: SessionId, query: EventPageQuery): Promise<EventPage>;
  startRun(
    input: AgentRunRequest,
    controls: AgentRunControls,
  ): Promise<AgentRunHandle>;
  resolveApproval(
    runId: RunId,
    approvalId: ApprovalId,
    decision: ApprovalDecision,
  ): Promise<AgentApprovalResolution>;
  cancelRun(runId: RunId, reason?: string): CancelRunResult;
}
```

### 9.1 Session 创建顺序

1. strict 校验请求。
2. 从 server snapshot 找到 `configured=true` 的 profile。
3. 调用 `createWorkspaceHandle()` 获取规范真实根路径。
4. 标题缺失时使用规范根目录 basename；空 basename 回退 `SEcode Session`。
5. 只把规范路径、profile id 和有限标题交给 store。
6. 返回已提交的 Session 与 `session.created` 事件。

profile 不可用或 workspace 校验失败时不得创建 Session，也不得加入最近工作区。

### 9.2 恢复与 active run

- `startRun()` 继续由 Agent runtime 完成历史恢复和 open run 中断处理。
- `readEvents()` 在当前进程没有该 Session active run 时，先调用 `recoverSession()`；这样重启后第一次恢复历史会追加 `run.interrupted`。
- 若恢复与新 run 竞态导致 `AGENT_SESSION_BUSY`，按“当前 active”处理并直接读取 durable events，不能中断仍在运行的任务。
- facade 的 active map 只保存本进程由 HTTP 启动的 handle 关联，并在 completion settle 后删除；不得用它替代 JSONL 状态。

## 10. HTTP 通用协议

### 10.1 JSON 请求边界

- `POST` 和带 body 的 `DELETE` 只接受 `Content-Type: application/json`。
- body 先按 UTF-8 字节读取并限制为 8 MiB，再执行 `JSON.parse` 与 Zod strict Schema。
- 空 body 只在取消接口允许，并解释为默认取消原因。
- 未知字段、非法 JSON、超长字符串、非整数 query 和非法 UUID 均在进入核心前拒绝。
- 不使用 `request.json()` 直接读取无界 body。

### 10.2 本地与同源约束

所有 `/api` 请求只接受 URL hostname 为 `localhost`、`127.0.0.1`、`::1` 或 `[::1]` 的本地请求，不信任 `Forwarded`/`X-Forwarded-*` 扩大范围。

所有 mutation（`POST`/`DELETE`）还必须满足：

- `Origin` 缺失：允许本机 CLI/curl 和测试。
- `Origin` 存在：必须与 `request.url` 的 origin 完全一致。
- 不发送 `Access-Control-Allow-Origin`，不开放跨域调用。

这不是登录或强认证；它是符合“本地可信单用户”范围的最小网络边界。

### 10.3 通用响应头

JSON 与 NDJSON 均设置：

```text
Cache-Control: no-store, no-transform
X-Content-Type-Options: nosniff
```

JSON 使用 `application/json; charset=utf-8`；流使用 `application/x-ndjson; charset=utf-8`。不得把请求 header 整体复制到响应。

### 10.4 错误 envelope

所有非流式失败，以及 run 开始前的失败，统一返回：

```ts
interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    recoverable: boolean;
    details?: JsonObject;
  };
}
```

不返回 `name`、`stack`、`cause`、内部绝对数据路径、环境变量值、请求 body、prepared invocation 或 authorization。

固定 HTTP 分类：

| HTTP | 场景 |
| ---: | --- |
| 400 | JSON/Schema/query/path 参数非法、无效 workspace 输入 |
| 403 | 非 loopback、跨 origin mutation |
| 404 | Session 不存在、active run 不存在 |
| 409 | Session busy、approval 不匹配/已处理/当前无 pending |
| 413 | body 超过 8 MiB |
| 415 | mutation Content-Type 非 JSON |
| 422 | profile 存在但当前未配置或 thinking 与 profile 不兼容 |
| 500 | 历史损坏、未分类内部错误 |
| 503 | store/model 初始化或暂时 I/O/模型配置不可用 |

核心 `ErrorInfo` 的 code/message/recoverable 优先保留；HTTP 层只决定 status 和是否进一步收窄 details。

## 11. 公开 API 契约

### 11.1 `GET /api/config`

返回：

```ts
{
  models: Array<{
    id: string;
    label: string;
    provider: "deepseek" | "longcat" | "generic";
    model: string;
    contextWindow: number;
    supportsThinking: boolean;
    configured: boolean;
  }>;
  issues: Array<{ profileId: string; code: string; message: string }>;
  agentLimits: {
    defaultMaxIterations: 30;
    maximumIterations: 30;
    defaultMaxDurationMs: 600000;
    maximumDurationMs: 600000;
  };
  securityBoundary: {
    mode: "trusted_local_single_user";
    operatingSystemSandbox: false;
  };
}
```

明确省略 API Key、Authorization、`apiKeyEnv`、归一化 endpoint 和 `baseUrl`。`configured` 只表示 server 是否具备当前 profile 的必要配置。

### 11.2 `GET /api/workspaces/recent?limit=<n>`

- `limit` 可省略，默认 20，最大 100。
- 返回 `{ workspaces: string[] }`。
- 结果来自 store 的 Session 元数据去重，不在列表阶段重新验证存在性。

### 11.3 `POST /api/workspaces/validate`

请求：`{ "path": "/absolute/local/path" }`。

返回：`{ "workspacePath": "/canonical/real/path" }`。

只调用 `createWorkspaceHandle()`；不得在 route 中自行 `resolve`/`realpath` 或弱化符号链接规则。

### 11.4 `GET /api/sessions`

返回：

```ts
{
  sessions: Array<{
    id: string;
    title: string;
    workspacePath: string;
    modelProfileId: string;
    createdAt: string;
  }>;
}
```

顺序沿用 store 的 `createdAt` 降序与 id 稳定次级排序。列表不伪造实时 status；阶段 14 通过事件和当前流重建状态。

### 11.5 `POST /api/sessions`

请求：

```ts
{
  workspacePath: string;
  modelProfileId: string;
  title?: string;
}
```

成功返回 HTTP 201：`{ session: SessionRecord, event: SessionCreatedEvent }`。

一个 Session 永久固定规范工作区和 profile。切换路径或模型必须创建新 Session。

### 11.6 `GET /api/sessions/[id]/events?after=<seq>&limit=<n>`

- `params` 按 Next.js 16 Promise 语义异步读取并用 UUID Schema 校验。
- `after` 默认 0，对应 store 的 `afterSeq`。
- `limit` 默认 500，最大 1000。
- 未知 query key 拒绝。
- 返回 `{ events, lastSeq, hasMore, recovery }`，只包含 durable events。
- `assistant.delta` 不持久化，因此刷新后由最终 `assistant.message` 恢复。

### 11.7 `POST /api/sessions/[id]/runs`

请求：

```ts
{
  prompt: string;
  limits?: {
    maxIterations?: number;
    maxDurationMs?: number;
  };
  thinking?: {
    enabled: boolean;
    effort?: "low" | "high" | "max";
  };
}
```

path Session id 注入现有 `AgentRunRequest` 后再次通过 Agent Schema；调用者只能降低现有限制，不能突破 30 轮/10 分钟。

成功响应是 NDJSON。每一行均为一个完整、可由 `AgentEventSchema` 解析的 JSON 对象：

```text
{AgentEvent JSON}\n
{AgentEvent JSON}\n
...
```

- durable event 只有在 JSONL 提交成功后才能入流。
- `assistant.delta` 保留 `durable:false` 和每 run `streamSeq`。
- 不增加私有 reasoning、内部 status frame 或自定义 done frame。
- run terminal event 发送完成且 handle completion settle 后关闭流。
- startRun 返回前发生的校验/恢复/配置错误使用普通 JSON error，不创建半流。

### 11.8 `POST /api/runs/[id]/approvals/[approvalId]`

请求：`{ "approved": boolean, "reason"?: string }`。

- 两个动态参数都异步读取并校验 UUID。
- 只把 decision 交给当前共享 Agent runtime。
- 成功返回 `{ runId, approvalId, status: "resolved", approved }`。
- approval 不存在、不匹配、已处理或当前无 pending 返回 409。
- 客户端不能提交 toolCallId、invocation、authorization、“永久允许”或策略覆盖。

### 11.9 `DELETE /api/runs/[id]`

- body 可为空，或为 `{ "reason"?: string }`。
- active run 首次取消返回 HTTP 202：`{ runId, status: "cancellation_requested" }`。
- 已收到取消但尚在收尾时保持幂等，仍返回 202，status 为 `already_requested`。
- 不存在于当前进程 active registry 的 run 返回 404；历史 run 不可通过该接口重放或改变。

## 12. NDJSON 流桥与背压

### 12.1 编码

- 使用单个 `TextEncoder` 把 `JSON.stringify(event) + "\n"` 编码为 `Uint8Array`。
- 每行独立、只有 LF 分隔，不输出 BOM、空行或多行 pretty JSON。
- 编码前后均不修改 event；编码失败视为 sink failure。
- 单行上限 8 MiB；超限不截断合法事件，而是拒绝 sink 并取消 run。

### 12.2 有界队列

`startRun()` 会在 Route Handler 返回 `Response` 前提交 `run.started`，因此流桥必须允许至少一个预缓冲事件，不能等待浏览器 pull 而死锁。

固定要求：

- 最大排队字节 16 MiB。
- 保持严格 FIFO。
- 达到上限时 event sink 等待 consumer pull，提供真正背压。
- consumer 取消、controller 关闭或写入失败时，所有等待 producer 被拒绝。
- 不允许无界数组积累整个 10 分钟运行输出。

### 12.3 取消与关闭

以下两条独立路径都连接到同一 Agent 取消语义：

1. `request.signal` → `AgentRunControls.signal`。
2. `ReadableStream.cancel()` → `handle.cancel("HTTP 事件消费者已断开")`。

只记录第一个取消来源；重复 abort/cancel 幂等。断线时不得继续产生用户看不到的工具副作用。terminal event 已发送后正常 close，不再追加控制行。

## 13. 安全与隐私约束

1. Route Handler 不直接 import raw tool executor、文件系统或 `child_process`。
2. workspace 校验和 Session 创建只使用公共 workspace factory。
3. approval 只使用 Agent runtime 的 public resolve API，不复制风险策略。
4. HTTP body/query/path 全部 strict 校验；未知字段不静默忽略。
5. mutations 限 loopback 和同源；不配置宽松 CORS。
6. 配置 API 不返回 Key、endpoint、base URL 或 API Key 环境字段。
7. HTTP helper 不记录 body/header；错误不序列化 `cause`/`stack`。
8. NDJSON 只包含已脱敏 `AgentEvent`；private reasoning 永不进入 API。
9. Session/workspace 绝对路径只对本地可信用户展示；不得宣称远程多租户安全。
10. 测试只用 `mkdtemp` 临时 data/workspace，不触碰真实用户项目或真实 `.secode-data`。
11. 不接受浏览器提供的数据根、模型 endpoint、环境变量、shell、绝对工具路径或执行权限。
12. 不使用 Server Action 处理长运行，不使用 Edge Runtime。

## 14. 错误与竞态语义

### 14.1 同 Session 并发 run

第二个 run 返回 409 `AGENT_SESSION_BUSY`。不能排队、覆盖或取消第一个 run。

### 14.2 审批与取消竞态

- 取消先到：pending 被丢弃，后续审批返回 409，不执行工具。
- 有效审批先到且 durable `approval.resolved` 已提交：按 Agent 既有语义继续；随后取消仍停止后续流程。
- 重复审批不能产生第二份 authorization。

### 14.3 流断开与工具提交竞态

若工具副作用已经由核心判定提交，HTTP 层不能伪装为“未执行”；恢复以 durable 事件为准。若断开发生在 `tool.started` 前，取消不得开始工具。

### 14.4 进程重启

- active registry、stream、pending approval 和 continuation 丢失。
- durable JSONL 保留。
- 第一次 Session 恢复追加 `run.interrupted`，不重放工具、不恢复审批。
- 旧 run id 的 approval/cancel 返回 404/409，用户可基于历史发起新任务。

### 14.5 初始化和存储故障

- store 初始化失败不创建 runtime。
- `EVENT_COMMIT_UNCERTAIN` 不自动重试写入或工具。
- 单个损坏 Session 的读取失败不得泄漏事件原文；其他 Session 列表是否可用沿用 store 既有严格语义，不在 HTTP 层跳过损坏伪造完整列表。

## 15. 建议文件边界

Task 应在本 Spec 批准后精确化，预计新增：

```text
lib/server/index.ts
lib/server/types.ts
lib/server/schemas.ts
lib/server/errors.ts
lib/server/application.ts
lib/server/bootstrap.ts
lib/server/ndjson.ts
lib/server/http.ts

app/api/config/route.ts
app/api/workspaces/recent/route.ts
app/api/workspaces/validate/route.ts
app/api/sessions/route.ts
app/api/sessions/[id]/events/route.ts
app/api/sessions/[id]/runs/route.ts
app/api/runs/[id]/approvals/[approvalId]/route.ts
app/api/runs/[id]/route.ts

tests/unit/server/**
tests/integration/server/**
```

预计修改：

```text
vitest.config.mts
docs/development/13-nextjs-route-handlers-tasks.md
docs/development/13-nextjs-route-handlers-summary.md
docs/development/README.md
```

默认不修改 `lib/agent/**`、`lib/domain/**`、`lib/storage/**`、`lib/tools/**`、`lib/approval/**`、`lib/workspace/**`、`app/page.tsx`、package/lock。若实施观察证明必须改变这些公共接口，停止并回到本 Spec 重新审批。

## 16. 测试设计

### 16.1 单元测试

- body 字节上限、非法 JSON、Content-Type、strict unknown fields。
- loopback hostname、Origin 缺失/同源/跨源矩阵。
- UUID、`after`、`limit` 和未知 query key。
- 错误码到 HTTP status 映射及 details 收窄。
- config DTO 不含 baseUrl、endpoint、Key/env 字段。
- NDJSON 单行编码、Unicode、LF、FIFO、16 MiB 背压、consumer cancel、producer failure 和 close-once。
- singleton 并发初始化一次、失败后可重试、不同 route consumer 共享 runtime。
- public barrel 不导出测试 factory、全局 reset 或内部 active handle。

### 16.2 Route Handler 集成测试

全部使用临时 workspace/data root 和注入式假模型：

1. validate workspace → create Session → list/recent。
2. events `after` 分页、稳定 `lastSeq/hasMore`、损坏尾行恢复。
3. 假模型“读文件 → 修改 → 运行测试 → 最终总结”的 NDJSON 完整轨迹。
4. 流中同时出现 `assistant.delta` 与 durable events，刷新历史只恢复 durable 最终消息。
5. 同 Session 第二个 run 返回 409。
6. approval required → allow 后执行；reject 不出现 `tool.started`；重复决定 409。
7. DELETE 取消模型请求、工具进程和审批等待，唯一 `run.cancelled`。
8. 取消/审批/terminal/断线竞态 close once，无晚到工具结果。
9. 模拟 consumer cancel 和 request AbortSignal，确认 Agent 停止。
10. 模拟进程重启，open run 变为 `run.interrupted`，历史可继续读取。
11. 401/429/500/超时等模型失败仍由现有结构化 terminal event 表达。
12. workspace traversal/symlink escape、未配置 profile、非法 thinking 和 Session 不存在。

### 16.3 Next.js 契约检查

- 所有动态 route context 的 `params` 都是 Promise 并显式 `await`。
- Route Handler 使用 Node.js runtime，不导入 Edge-only API。
- route 不与同 segment `page.tsx` 冲突。
- GET 不依赖静态缓存；响应显式 `no-store`。
- `pnpm build` 能完成 Next 类型生成和路由编译。

### 16.4 覆盖率阈值

阶段 13 在 `vitest.config.mts` 设置全局最低阈值：

```text
include:    lib/**/*.ts + app/api/**/*.ts
statements: 80
branches:   70
functions:  80
lines:      80
```

当前 `lib/**/*.ts` 基线分别为 86.56/79.86/89.36/88.19；阶段 13 把 `app/api/**/*.ts` 一并纳入统计。该阈值能阻止明显退化，同时给新增 HTTP 竞态分支保留合理余量。不得通过排除 `lib/server/**`、`app/api/**`、降低阈值或跳过测试制造通过。

## 17. 预计验证顺序

Task 获批并实施后，按最小到全量顺序：

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

另执行静态审计：

- `app/api/**` 不直接 import raw tool/fs/child_process。
- 响应/测试快照不含凭据、Authorization、baseUrl、endpoint、stack/cause。
- 无 `.only`、永久 `.skip`、阈值下降、真实 Session 或 `.env*` 入库。
- package/lock 不变，无 Agent SDK、AI SDK 或第三方流框架。

## 18. 验收标准

阶段 13 实施完成必须同时满足：

1. 八组 API 均符合本 Spec 的 method、path、Schema、status、DTO 和安全头。
2. Route Handler 是薄适配层，核心 Agent/工具/审批/JSONL 语义未复制或弱化。
3. 所有 route 共享同一 Node 进程 application/runtime，审批和取消可操作当前 run。
4. NDJSON 每行都是合法 `AgentEvent`，顺序、持久提交、delta 和 terminal 语义正确。
5. request abort、stream cancel、DELETE cancel 均安全收口且只有一个终态。
6. 页面刷新/事件分页可恢复 durable 历史；重启 open run 转为 interrupted，不重放能力。
7. 配置接口和所有失败响应不暴露 Key、endpoint、reasoning、stack 或内部能力。
8. loopback、same-origin、Content-Type、body size、UUID 和 strict Schema 防护通过。
9. 假模型完成真实文件工具闭环，approval allow/reject 和 cancel 路径通过。
10. 覆盖率达到 80/70/80/80，且全量 lint/typecheck/test/build/E2E/diff check 通过。
11. 不修改 UI，不新增依赖，不调用真实模型，不把 LongCat 豁免写成通过。
12. 生成详细阶段 13 Summary 并停在用户审批门禁；阶段 14 不得提前开始。

## 19. 风险、假设与应对

### 19.1 Next 开发模式与 route module 隔离

普通模块级 `const singleton` 可能因热重载或独立 route bundle 重复。应对：使用 `globalThis` 私有版本 key 和 Promise memoization，并用跨 route 测试证明共享。

### 19.2 断线检测不完全一致

不同客户端/Node 版本触发 `request.signal` 的时机可能不同。应对：同时实现 request signal 和 stream cancel 两条路径，sink 失败作为第三重核心保护。

### 19.3 大事件与慢消费者

无界 push stream 会积累内存。应对：8 MiB 单行、16 MiB 总队列和 producer 背压；溢出/consumer 失败取消 run，不静默丢事件。

### 19.4 本地 API 仍是公开 HTTP 端点

无登录不能防御拥有本机访问权的恶意进程。应对：loopback + same-origin mutation + no CORS + trusted local 声明；强认证不在首版范围。

### 19.5 多进程与无状态部署

approval capability 不可序列化。应对：明确禁止 Serverless/多 worker；阶段 15 README 必须说明只能以持久本地 Node 进程运行。

### 19.6 LongCat 真实端点未验收

本阶段配置 API 仍支持 LongCat profile，但没有真实端点证据。应对：只宣称适配器自动测试和可配置能力；最终限制持续记录，不使用 generic 冒充 LongCat。

### 19.7 绝对工作区路径可见

Session 协议需要本地用户查看绑定路径。应对：只在 loopback API 返回，错误和日志仍收窄；不把该 API 暴露到远程部署。

## 20. 反思与修正

### 20.1 观察后修正的初始想法

1. 不能为每个 Route Handler 各自创建 runtime，否则 approval/cancel 永远无法访问发起 run 的能力；规格改为进程级共享 application。
2. 不能只在断线时依赖 event sink throw；规格同时连接 `request.signal` 和 `ReadableStream.cancel()`。
3. 不能把流当作唯一历史；规格保持 NDJSON 实时、JSONL durable、events API 恢复三者分工。
4. 不能在 Session 列表伪造 status；规格要求 UI 后续依据事件重建。
5. 不能直接 `request.json()` 读取无限 body；规格加入 8 MiB 字节上限和 strict Content-Type。
6. 不能只设置模块级 singleton；规格针对 Next 开发热重载采用 process-global versioned key。
7. 当前 Next 文档说明 GET Route Handler 默认动态，因此不增加过时或不必要的缓存 workaround，只设置响应 `no-store`。

### 20.2 保留限制

- 本地网络边界不是身份认证或 OS 沙箱。
- HTTP 断开后的最后一个已提交副作用只能按事件事实解释，不能回滚。
- 多进程、跨设备和远程部署不受支持。
- LongCat 真实端点冒烟仍未执行。

## 21. 待用户确认的规格决策

批准本 Spec 即确认：

1. 阶段 13 只实现 API/NDJSON，不修改默认页面或开发 UI。
2. 使用 `lib/server` 作为 Node-only application/HTTP 组合层，Route Handler 保持薄适配。
3. 使用 `globalThis` 私有版本 key 共享单进程 runtime，并明确不支持 Serverless/多 worker。
4. mutation 只允许 loopback 与同源 Origin；不开放 CORS。
5. JSON body 上限 8 MiB，NDJSON 单行 8 MiB、队列 16 MiB。
6. NDJSON 行直接使用现有 `AgentEvent`，不增加 done/status/reasoning 私有协议。
7. Session 列表不伪造 status；历史和 UI 状态继续以事件为事实源。
8. 配置 API 省略 baseUrl/endpoint/apiKeyEnv，只返回脱敏 profile 能力。
9. 全局覆盖率最低阈值设为 statements 80、branches 70、functions 80、lines 80。
10. LongCat A12-03 保持 `blocked_external`；阶段 13 不调用真实 provider，不宣称该测试通过。

## 22. Spec 内部门禁

- [x] 阶段 12 范围豁免已如实记录，没有伪造 LongCat 成功。
- [x] 已阅读流程、需求、阶段 03–12 的相关批准文档。
- [x] 已按 `AGENTS.md` 阅读本地 Next.js 16.3.3 Route Handler 指南。
- [x] 已观察 app、核心公共 API、测试、配置、Git 状态和覆盖率基线。
- [x] 目标、范围、API、数据流、错误、安全、竞态和测试标准已明确。
- [x] 未创建 Route Handler、server 模块、测试、Task 或 Summary。
- [x] 未修改业务代码、配置、依赖、package/lock 或 UI。
- [x] 当前只生成 Spec 并更新文档状态。

**内部门禁结论：通过。当前状态：已批准。**

## 23. 用户审批记录

- 审批结果：用户已于 2026-08-28 明确批准本 Spec。
- 本次批准解锁：依据本 Spec 生成和修订 `13-nextjs-route-handlers-tasks.md`。
- 当前仍禁止：在阶段 13 Task 获批前编写 Route Handler、server 模块、测试或修改配置；阶段 14 UI 始终未解锁。
