# 阶段 13 Summary：Next.js Route Handlers

## 1. 文档状态与审批门禁

- 当前状态：已批准。
- 完成日期：2026-08-28。
- 前置 Spec：[13-nextjs-route-handlers-spec.md](./13-nextjs-route-handlers-spec.md)，用户已于 2026-08-28 批准。
- 前置 Task：[13-nextjs-route-handlers-tasks.md](./13-nextjs-route-handlers-tasks.md)，用户已于 2026-08-28 批准。
- 当前允许：阶段 14 只读观察与 Spec 编写。
- 当前禁止：阶段 14 Task 与 UI 开发，直至对应 Spec/Task 分别获批。
- 下一门禁：阶段 14 Spec 生成后等待用户明确批准。

## 2. 阶段目标与结论

阶段 13 已在不修改核心 Agent、工具、存储、模型协议、UI、package 或 lockfile 的前提下，完成 Node-only Next.js Route Handler 服务层。浏览器或本机 HTTP 客户端现可通过九个 method contracts 完成：读取脱敏配置、验证工作区、创建/恢复 Session、启动 NDJSON Agent run、审批危险工具和取消运行。

最终结论：阶段 13 的实现、测试、覆盖率、安全审计和 Next.js 构建门禁均通过；阶段 14 尚未开始。LongCat 真实端点仍为外部阻塞，不被本阶段假模型测试替代。

## 3. 实际执行顺序

1. T13-00：记录既有阶段 12 文档变化、冻结 package/lock hash，运行 607 项基线测试。
2. T13-01：实现公开 DTO、strict Zod Schema、HTTP/NDJSON 固定常量与 public barrel。
3. T13-02：实现 loopback、Origin、有限 JSON body、错误 envelope 和安全响应头。
4. T13-03：实现 application facade、配置脱敏、Session 创建顺序、恢复和 active handle 表。
5. T13-04：实现版本化 process-global 惰性 singleton，固定并发初始化与失败重试。
6. T13-05：实现有界 NDJSON bridge、AgentEvent 校验、FIFO 背压、关闭和取消。
7. T13-06：实现 config、recent workspace、workspace validate、Session GET/POST。
8. T13-07：实现 events 分页、异步 params 和 open run interrupted 恢复。
9. T13-08：实现 run NDJSON route，并通过真实本地工具修复 slug fixture。
10. T13-09：实现 approval 与 cancel route，验证 allow/reject/repeat 和三条取消路径。
11. T13-10：补齐恢复、provider failure、thinking、Origin 与泄漏矩阵。
12. T13-11：审计 route/依赖边界并用 Next.js 16.3.3 build 验证 route graph。
13. T13-12：把 `app/api/**/*.ts` 纳入覆盖率，执行固定九道全仓门禁。
14. T13-13：复核失败历史、白名单、秘密、临时目录、后台任务与 LongCat 状态。
15. T13-14：写回 Task、生成本 Summary、更新开发索引并停止。

执行顺序未改变已批准 Task；未并行运行可能竞争全局 singleton、JSONL 或构建产物的完整门禁。

## 4. 实现架构

### 4.1 Server facade

`lib/server` 是 Route Handler 与既有核心之间唯一新增边界：

```text
app/api/**
  → lib/server public barrel
      → HTTP guards / Schema / error mapping / NDJSON
      → ServerApplication
          → JsonlEventStore
          → ModelClient
          → AgentRuntime
          → createWorkspaceHandle
```

Route 文件只做请求 guard、参数校验、facade 调用和响应编码。静态审计确认 `app/api/**` 不含 `node:fs`、`child_process`、raw tool executor、`request.json()`、CORS 放行或 reasoning 字段；核心目录也没有反向依赖 `lib/server`、`app/api` 或 Next.js。

### 4.2 生命周期与事实源

`getServerApplication()` 使用 `Symbol.for("secode.server.application.v1")` 在 `globalThis` 缓存初始化 Promise。同一 Node 进程中的 routes 共享一个 store、model client、context provider、runtime 和 active-run 协调表；20 路并发首次加载测试证明只初始化一次。初始化 Promise 失败会按 identity 清除，下一次请求可重试。

JSONL 仍是 durable 历史的唯一事实源。active map 只保存不可持久化的 handle 关联，completion 成功或异常都会按 handle identity 清理。events API 在本进程无 active run 时先恢复 Session，open run 只追加一个 `run.interrupted`。

### 4.3 HTTP 与流边界

- 仅接受 `localhost`、`127.0.0.1` 和 IPv6 loopback；不信任 forwarded headers。
- mutation 的 Origin 缺失时允许本机 CLI；存在时必须与 request origin 完全一致。
- JSON body 按字节流读取，最大 8 MiB；验证 Content-Type、实际字节数、UTF-8、JSON 和 strict Schema。
- JSON/NDJSON 均为 `no-store, no-transform` 与 `nosniff`，不返回 CORS、Cookie 或 Authorization。
- NDJSON 每行只包含一个经 `AgentEventSchema` 验证的事件，最大 8 MiB；Web Stream 使用 byte-size queuing strategy 将排队容量固定为 16 MiB。
- `request.signal` 和 `ReadableStream.cancel()` 都连接既有 Agent cancel；无私有 done/status/reasoning frame。

## 5. 公开路由

| Method | Path | 结果 |
| --- | --- | --- |
| GET | `/api/config` | 脱敏模型、Agent limits、安全边界 |
| GET | `/api/workspaces/recent` | 最近规范工作区 |
| POST | `/api/workspaces/validate` | 规范真实工作区路径 |
| GET | `/api/sessions` | 不伪造运行状态的 Session 列表 |
| POST | `/api/sessions` | 201 Session 与 `session.created` |
| GET | `/api/sessions/[id]/events` | durable events 分页与恢复信息 |
| POST | `/api/sessions/[id]/runs` | `application/x-ndjson` AgentEvent 流 |
| POST | `/api/runs/[id]/approvals/[approvalId]` | 解析 pending approval |
| DELETE | `/api/runs/[id]` | 首次/重复取消或 404 |

八个 route files 均显式导出 `runtime = "nodejs"`；四个动态 route 均按 Next.js 16 Promise 语义 `await context.params`。

## 6. 完整工具闭环证据

集成测试创建独立 `secode-server-*` 临时工作区和 data root，假模型只提供模型 completion，不直接修改 fixture。实际 production Agent/tool path 依次执行：

```text
read_file src/slug.mjs
  → 使用真实 SHA 调用 replace_in_file
  → run_process(program="pnpm", args=["test"])
  → 4/4 fixture tests 通过
  → final assistant.message
  → 唯一 run.completed
```

所有 NDJSON 行均通过 `AgentEventSchema`；durable stream events 与 JSONL 的 id、seq 和内容深相等；`assistant.delta` 仅存在于实时流。测试只修改临时 fixture 的 source，未修改 tests、未安装依赖、未执行 Git 操作。

## 7. 审批、取消、恢复与故障证据

- 未识别的 `pnpm run slow` 参数形状先产生 `approval.required`；allow 后才出现 `tool.started`。
- reject 产生 resolved/tool result，但不出现 `tool.started`；重复决定得到 404/409 且没有第二次执行。
- DELETE 首次返回 202 `cancellation_requested`；可控收尾窗口内重复返回 202 `already_requested`；未知 run 返回 404。
- DELETE、stream cancel 和 request abort 均各自产生唯一 `run.cancelled`；并发第二个 Session run 返回 409，不影响第一个。
- 合法 open run 第一次读取 events 时追加唯一 `run.interrupted`，再次读取不重复。
- `MODEL_RATE_LIMITED` 被持久化为唯一有限 `run.failed`，响应和流中没有 stack、cause、Bearer 或 reasoning。
- 既有 Agent、approval、workspace、storage 和 tool 全仓测试继续覆盖长进程收口、路径穿越、符号链接逃逸、JSONL 尾行修复和错误竞态。

## 8. 文件清单

新增 production：

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

新增 routes：

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

新增测试：

```text
tests/unit/server/*.test.ts                         8 files
tests/integration/server/helpers.ts
tests/integration/server/*.test.ts                  4 files
```

修改：`vitest.config.mts`、本 Task、开发索引。新增本 Summary。没有删除文件；阶段 12 既有文档变化被原样保留。

明确未修改：`lib/agent/**`、`lib/domain/**`、`lib/model/**`、`lib/context/**`、`lib/storage/**`、`lib/workspace/**`、`lib/tools/**`、`lib/approval/**`、`lib/terminal/**`、`cli/**`、UI、package、lockfile 和其他工程配置。

## 9. 最终验证结果

最终一轮按批准顺序串行执行：

| 门禁 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/server` | 8 files / 40 tests，通过 |
| `pnpm exec vitest run tests/integration/server` | 4 files / 15 tests，通过 |
| `pnpm test:coverage` | 87 files / 662 tests，通过 |
| Statements | 87.21%，阈值 80% |
| Branches | 80.19%，阈值 70% |
| Functions | 89.85%，阈值 80% |
| Lines | 88.79%，阈值 80% |
| `pnpm lint` | exit 0，0 errors；2 个既有 coverage generated-file warnings |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 87 files / 662 tests，通过；比 607 基线增加 55 |
| `pnpm build` | Next.js 16.3.3 route graph 构建通过 |
| `pnpm test:e2e` | Chromium 1/1，通过 |
| `git diff --check` | exit 0 |

Build 保留一条 Turbopack warning：既有 `lib/storage/file-safety.ts` 的动态本地文件访问会扩大 tracing 范围。这是本地编程智能体的既有动态 data root 行为；阶段 13 没有权限修改核心 storage 或通过 ignore 注释隐藏警告。E2E 的 dev server 还报告 127.0.0.1 静态资源跨 origin 提示，但基线页面测试通过；阶段 13 没有修改 `next.config.ts`。

package/lock 最终 hash 与 T13-00 一致：

```text
package.json     5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13
pnpm-lock.yaml   5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683
```

两者 diff 为 0，无新增依赖。

## 10. 首次失败、诊断与修正

1. Schema 初次 typecheck 把 transform 后 query 默认值写成 string。根据 Zod output 类型改为 number，随后 typecheck 通过。
2. NDJSON 初版用 `highWaterMark: 0` 阻止预拉取；unit reader 可工作，但 `Response.text()` 在完整 run 后不继续消费。事件日志证明 Agent 已完成，问题定位到 Web Stream 拉取策略。改为以 `chunk.byteLength` 计量、16 MiB high-water mark 的内部队列，既恢复 Response 消费，也保持真实字节背压。
3. macOS `mkdtemp` 返回路径与 workspace realpath 的系统规范前缀不同。测试 fixture 改为记录 canonical workspace，验证的正是生产规范化语义。
4. 取消测试最初在后台 run 落盘前删除临时 data root，触发预期外 `EVENT_STORE_IO_ERROR`。新增 terminal-event barrier，确保每个登记目录只在运行收口后删除。
5. public barrel 精确导出测试因排序期望错误失败；修正期望后通过，未改变 public surface。
6. 反思阶段将 completion cleanup 从 `finally()` 返回的潜在 rejected Promise 改为成功/失败共用 cleanup callback，避免异常 completion 产生未处理拒绝。
7. 补强审批测试后，Vitest 通过但 `tsc` 发现 event helper 未按判别字段收窄。helper 改为泛型 `Extract<DurableAgentEvent, { type: TType }>`，并从第一道门禁重新执行。

所有修正均在已批准白名单和公共语义内，没有修改 Spec、Task 范围或核心协议。

## 11. 安全、秘密与残留审计

- production/API 扫描没有真实 Key、Bearer、Authorization 值、endpoint、`apiKeyEnv`、private reasoning、debug log、TODO 或 raw execution。
- config DTO 明确省略 `baseUrl`；issue message 使用固定通用中文，不含环境变量名。
- JSON error 只保留有限 `ErrorInfo`；未知异常统一变成 `API_INTERNAL_ERROR`，不序列化 stack/cause/body/header。
- 测试从不读取真实 provider Key；所有 model 都是进程内 QueueFakeModel。
- 临时目录只用已登记的 `secode-server-*` root，最终扫描无残留目录、后台 server、listener 或子进程。
- `git status` 中阶段 13 路径全部属于批准白名单；阶段 12 两份文档变化为 T13-00 已记录的 pre-existing diff。
- package/lock 无差异；核心和 UI 无阶段 13 diff。

## 12. 偏差、限制与阶段 14 固定输入

没有需要重新审批的 Spec/Task 偏差。两项非阻断输出与批准文档的理想描述不同，但均已在基线或范围约束内解释：lint 有 2 个 coverage 生成文件 warning；build 有 1 个动态文件系统 tracing warning。二者 exit code 均为 0，没有通过降阈值、ignore pragma 或越权修改隐藏。

仍存在的产品限制：

- 只支持一个本地可信用户和单 Node 进程；不支持多 worker、Serverless、远程租户或 OS 强沙箱。
- 进程重启后 pending approval/continuation 不恢复，只通过 durable JSONL 形成 `run.interrupted`。
- 当前阶段只交付 HTTP/API 与测试，没有中文工作台、浏览器事件时间线、抽屉、Markdown 或 UI E2E。
- LongCat 因暂无用户端点继续为 `blocked_external`；本阶段没有调用 DeepSeek、LongCat 或 generic 真实网络服务。

阶段 14 可以稳定依赖：九个 method contracts、统一 JSON error、AgentEvent NDJSON、durable events paging、202 cancel 状态、approval response、脱敏 config 和 no-store headers。阶段 14 不应绕过这些 API 直接访问核心模块。

## 13. 审批请求

用户已于 2026-08-28 明确批准本 Summary。阶段 13 正式完成，解锁阶段 14 的“只读观察 → Spec”步骤；阶段 14 Task 与 UI 开发仍未授权。
