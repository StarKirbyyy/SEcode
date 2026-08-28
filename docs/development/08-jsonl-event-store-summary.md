# 阶段 08 Summary：JSONL 事件存储

## 1. 文档状态与审批链

- 当前状态：已批准
- 完成日期：2026-08-27
- 已批准 Spec：[08-jsonl-event-store-spec.md](./08-jsonl-event-store-spec.md)
- 已批准 Task：[08-jsonl-event-store-tasks.md](./08-jsonl-event-store-tasks.md)
- Spec 审批：用户于 2026-08-27 批准
- Task 审批：用户于 2026-08-27 批准
- 当前门禁：本 Summary 已获批准，阶段 09 只读观察与 Spec 已解锁

审批链：

```text
阶段 08 Spec（已批准）
  → 阶段 08 Task（已批准）
  → T08-00～T08-09（已完成）
  → 本 Summary（已批准）
  → 阶段 09 观察与 Spec（已解锁）
```

## 2. 完成结论

阶段 08 已实现一个独立于 Next.js、React 和浏览器的本地 Node.js JSONL 事件仓库。

最终形成：

- 10 个 `lib/storage` 生产模块。
- 10 个 storage 测试文件和 1 个安全 fixture helper。
- 16 个稳定存储错误码。
- 55 项 storage 精确测试。
- 全仓 41 个测试文件、408 项测试全部通过。
- lint、typecheck、生产 build 和差异检查全部通过。

已完成的数据流：

```text
SECODE_DATA_DIR / 默认目录
  → 显式 initialize
  → 原子创建 Session + session.created(seq 1)
  → DurableEventDraft 串行追加 + fsync
  → 字节流 JSONL 重放
  → 结构/序号/身份校验
  → 不完整尾部截断 + fsync
  → 分页事件、Session 列表、最近工作区、open run 报告
```

本阶段没有实现 Agent 状态机，也没有把审批历史恢复成执行能力。

## 3. 实际任务完成情况

| 任务 | 状态 | 实际产物 | 最小验证 |
| --- | --- | --- | --- |
| T08-00 基线 | 已完成 | 文档、框架运行时和工作树基线 | 原有 31 files / 353 tests、lint、typecheck 通过 |
| T08-01 契约 | 已完成 | 常量、类型、strict Schema、错误模型 | schemas tests、typecheck |
| T08-02 配置安全 | 已完成 | data root、依赖注入、文件身份检查 | config/security tests |
| T08-03 FIFO | 已完成 | keyed 进程内串行器 | mutex tests |
| T08-04 JSONL | 已完成 | 有界序列化、字节流解析、尾部修复 | jsonl/recovery tests |
| T08-05 Session | 已完成 | 显式初始化、原子 Session 创建 | session/config tests |
| T08-06 追加 | 已完成 | 连续 seq、逐事件 sync、并发与不确定提交 | append/jsonl tests |
| T08-07 查询恢复 | 已完成 | 分页、inspection、列表、open run | read/recovery/security tests |
| T08-08 公共收口 | 已完成 | 最小 barrel、框架/能力/秘密边界 | public API、源码扫描 |
| T08-09 总体验证 | 已完成 | 全量门禁、本 Summary、开发索引 | 408 tests、lint、typecheck、build、diff |

任务未跳过、未合并，也未提前开始阶段 09。

## 4. 关键实现说明

### 4.1 配置与显式初始化

`createJsonlEventStore()` 只解析配置并创建内存对象，不触发磁盘写入。调用者必须显式执行 `initialize()`。

配置优先级：

1. factory `dataDir`。
2. 服务端 `SECODE_DATA_DIR`。
3. 创建 store 时捕获的 `<cwd>/.secode-data`。

相对路径以 factory 时的 cwd 固定解析。数据根可以是显式配置的 symlink，但只保存一次 realpath；其内部 `sessions`、Session 目录和两个固定文件全部拒绝 symlink。

新建目录使用 `0700`，新建文件使用 `0600`。现有权限不被自动重写。

### 4.2 Session 磁盘格式

实际布局与 Spec 一致：

```text
<dataRoot>/sessions/<session UUID>/
  session.json
  events.jsonl
```

`session.json` 只保存：

```text
storageVersion
id
title
workspacePath
modelProfileId
createdAt
```

没有 `status.json`、`nextSeq` 或 `recent-workspaces.json`。状态与更新时间仍留给后续事件投影；最近工作区从不可变 Session 元数据派生。

### 4.3 原子 Session 创建

创建事务：

1. 在 `sessions` 下创建严格 `.creating-*` 临时目录。
2. exclusive 创建、写入并同步 `session.json`。
3. exclusive 创建、写入并同步仅含 seq 1 的 `events.jsonl`。
4. 原子 rename 为最终 UUID 目录。
5. 在当前 macOS 平台同步父目录。

最终目录 rename 前不会进入 Session 列表。失败清理只针对本次调用登记的精确临时目录；启动时不会删除残留未知内容。

### 4.4 事件 draft 与信封所有权

`DurableEventDraft` 以分布式联合从领域 `DurableAgentEvent` 派生，排除：

- `protocolVersion`
- `durable`
- `id`
- `seq`
- `sessionId`
- `createdAt`
- 整个 `session.created` 事件

store 在 Session 锁内生成 UUID、时间、Session ID 和下一序号。draft 先由 strict Schema 校验，完整事件再由 `DurableAgentEventSchema` 校验。

实时 `assistant.delta`、未知事件、额外信封字段和外部 `session.created` 都不能落盘。

### 4.5 JSONL 提交语义

每条事件使用：

```text
JSON.stringify(event) + LF
```

并满足：

- UTF-8，无 BOM、无 pretty-print、无空行。
- 固定 LF，不兼容 CRLF。
- 单条记录包含换行最大 8 MiB。
- 在打开 append 文件前完成 Schema、序列化和大小检查。
- 完整写入后执行 `FileHandle.sync()`，关闭后才返回成功。

append write/sync/close 发生可能提交的不确定故障时返回 `EVENT_COMMIT_UNCERTAIN`，不在当前调用自动重试。

### 4.6 并发与序号

内部 `KeyedFifoExecutor` 提供：

- 同一 Session 严格 FIFO。
- 前一任务失败后队列继续。
- 不同 Session 可并行。
- 无等待任务时释放 key。

同一 Session 的追加、读取、inspection 和尾部修复共用一个锁。Session 创建/列表使用根锁。

当前实现每次追加前重新扫描该 Session 日志以重建 `lastSeq` 和事件 ID 集合，没有维护可漂移的 nextSeq 文件或跨调用磁盘缓存。该选择优先保证正确性，代价记录在第 11 节。

### 4.7 流式重放

事件日志使用 `createReadStream` 和已验证 FileHandle 按字节处理：

- 以实际 `0x0A` 切行。
- 支持 UTF-8 多字节字符跨任意 chunk。
- 测试可以将 chunk 缩小到 1 字节。
- 在换行前执行 8 MiB 限制。
- 不使用 `readFile(events.jsonl)`。
- 页面只保留 `limit + 1` 个候选事件。

为精确验证重复事件 ID，单次扫描临时保存 UUID Set；不保存全部事件对象。

### 4.8 重放不变量

storage 已验证：

- 首条为无 runId 的 `session.created`。
- seq 从 1 开始严格连续。
- Session ID 全部一致。
- 事件 ID 在 Session 内唯一。
- 后续不能再出现 `session.created`。
- 每条记录均是 protocol 1 的 durable event。
- metadata 与首事件 Session 身份一致。
- 初始状态为 idle，初始 createdAt 等于 updatedAt。

storage 没有验证：

- model requested/completed 配对。
- tool requested/started/result 配对。
- approval required/resolved 生命周期。
- 单 run 唯一终态。
- final assistant message 与 completed 的关系。

这些仍严格属于阶段 09。

### 4.9 尾部恢复

只有文件末尾未以 LF 结束的字节可恢复：

1. 扫描时不把尾部解释为事件，即使它恰好是可解析 JSON。
2. 记录最后稳定字节偏移和丢弃字节数。
3. 用重新验证身份的 `r+` FileHandle truncate。
4. sync 后返回 `tailRepaired: true`。

完整坏 JSON、BOM、CRLF、空行、完整超大行、序号冲突、错误 Session 和重复 ID 全部失败关闭，不跳行继续。

truncate/sync 无法证明提交时返回 `EVENT_COMMIT_UNCERTAIN`。

### 4.10 open run 与审批能力边界

扫描仅收集 `run.started` 和四类终态事件，返回按首次出现排序的 `openRunIds`。

storage 不追加 `run.interrupted`。阶段 09 必须在接受新任务前消费该报告并追加中断事实。

`approval.required` 和 `approval.resolved` 可作为历史读取，但公共结果只包含领域事件。`PendingToolApproval`、`AuthorizedLocalToolInvocation`、prepared invocation 或执行函数均不在 storage 类型、磁盘或公共导出中。

### 4.11 文件身份与错误边界

每次固定文件打开前后执行：

- Session UUID 路径拼装。
- lstat 拒绝 symlink。
- 类型检查。
- realpath containment。
- FileHandle fstat 的 dev/ino 身份对比。

错误统一为 `EventStoreError` 和既有 `ErrorInfo` 结构。公共 details 只允许字段、原因、Session ID、行号、偏移、序号和有限类型信息；原始事件、配置值、errno.path 和堆栈不进入公共 message/details。

## 5. 公共 API 结果

`@/lib/storage` 导出：

- `createJsonlEventStore`
- `EventStoreError`
- 6 个 strict Schema
- 10 个格式和查询常量
- `EVENT_STORE_ERROR_CODES`
- 已批准的 store、metadata、draft、page、inspection、recovery 和错误码类型

最终 store 方法：

```text
initialize
createSession
getSessionMetadata
listSessions
listRecentWorkspaces
appendEvent
readEvents
inspectSession
```

未从公共 barrel 导出：

- 注入 factory 和原生 fs dependencies。
- FIFO executor。
- JSONL parser、tail repair 和 write helper。
- 文件身份检查与真实路径组合器。

公共返回对象和数组在返回前深冻结。

## 6. 实际文件变更

### 6.1 新增生产文件

```text
lib/storage/types.ts
lib/storage/schemas.ts
lib/storage/errors.ts
lib/storage/dependencies.ts
lib/storage/config.ts
lib/storage/file-safety.ts
lib/storage/mutex.ts
lib/storage/jsonl.ts
lib/storage/event-store.ts
lib/storage/index.ts
```

### 6.2 新增测试文件

```text
tests/unit/storage/helpers.ts
tests/unit/storage/schemas.test.ts
tests/unit/storage/config.test.ts
tests/unit/storage/mutex.test.ts
tests/unit/storage/jsonl.test.ts
tests/unit/storage/session.test.ts
tests/unit/storage/append.test.ts
tests/unit/storage/read.test.ts
tests/unit/storage/recovery.test.ts
tests/unit/storage/security.test.ts
tests/unit/storage/public-api.test.ts
```

### 6.3 文档变更

```text
docs/development/08-jsonl-event-store-spec.md
docs/development/08-jsonl-event-store-tasks.md
docs/development/08-jsonl-event-store-summary.md
docs/development/README.md
```

阶段 07 Summary 的审批状态修改在阶段 08 开始前已经存在，本阶段实现没有覆盖或重写它。

### 6.4 未修改

- `lib/domain/**`
- `lib/model/**`
- `lib/workspace/**`
- `lib/tools/**`
- `lib/approval/**`
- `app/**`
- package、lockfile、TypeScript、Vitest、ESLint、Next.js 配置
- `.env.example`、`.gitignore`
- 既有测试文件

没有新增、删除或升级依赖。

## 7. 测试覆盖结果

### 7.1 Schema 和错误

已覆盖：

- strict options、Session、metadata、draft、page 和 recent query。
- extra key、非法 UUID/时间、相对 workspace、limit 越界。
- session.created、assistant.delta、额外信封和非法 event data。
- 16 个错误码与固定 recoverable 语义。
- 非枚举 cause 和有限错误 details。

### 7.2 配置和安全

已覆盖：

- 默认/显式/环境配置优先级。
- cwd 捕获。
- 空白和 NUL 配置。
- 非目录 data root。
- 幂等初始化和 POSIX mode。
- 外部 data root symlink 允许、内部 sessions symlink 拒绝。
- UUID Session、metadata、events symlink 拒绝。
- lstat/open 间文件 identity 改变拒绝。
- errno 私有路径不进入公共错误。

### 7.3 JSONL 和损坏

已覆盖：

- 单字节 chunk 和中文 UTF-8。
- 合法 JSON 但无 LF 的尾部仍丢弃。
- truncate + sync。
- truncate sync 故障为 commit uncertain。
- BOM、CRLF、空行、坏 JSON 和完整超大行。
- seq 缺口、重复 ID、错误 Session、重复 session.created。
- 未知协议和 live event 记录。

### 7.4 Session 和追加

已覆盖：

- 初始化门禁优先于参数错误。
- metadata、SessionRecord 和 seq 1 一致。
- 原子目录、文件内容、mode 和深冻结。
- UUID Session 冲突不覆盖。
- 父目录 sync 故障后的提交不确定。
- 非法注入时钟结构化错误。
- 同 Session 12 个并发追加的连续 seq。
- 不同 Session 的独立 seq。
- event ID 冲突。
- append sync 故障、磁盘重新加载和不自动重试。
- 8 MiB 超限在 append 打开前拒绝。

### 7.5 查询和恢复

已覆盖：

- afterSeq、limit、hasMore 和日志级 lastSeq。
- 空后续页和冻结结果。
- Session 排序、最近工作区去重和 limit。
- metadata 漂移和超大 metadata。
- 重启后尾部恢复。
- open run 和 terminal run。
- 审批事实重放但无 capability。
- 完整坏行失败关闭。

## 8. 验证命令与最终结果

### 8.1 实施前基线

```text
pnpm test
```

结果：31 个测试文件、353 项测试全部通过。

```text
pnpm lint
pnpm typecheck
```

结果：全部通过。

### 8.2 storage 精确验证

```text
pnpm exec vitest run tests/unit/storage
```

最终结果：10 个测试文件、55 项测试全部通过。

### 8.3 全量验证

```text
pnpm test
```

结果：41 个测试文件、408 项测试全部通过。

```text
pnpm lint
```

结果：通过，0 error、0 warning。

```text
pnpm typecheck
```

结果：通过。

```text
pnpm build
```

结果：Next.js 16.3.3 Turbopack 生产构建通过；路由仍只有 `/` 和 `/_not-found`，本阶段未新增 Route Handler。

```text
git diff --check
```

结果：通过。

### 8.4 源码和安全扫描

以下扫描均无命中：

- `lib/storage` / storage tests 的 Next.js、React、window、document、Web Storage 使用。
- storage 对 pending、authorization、prepared invocation 或 private reasoning 的引用。
- `lib/storage` 对 events.jsonl 的整文件 `readFile`。
- storage 生产和测试文件中的常见 API Key/Bearer 模式。
- package、lockfile、配置、`.env.example` 和 `.gitignore` 差异。

仓库根未生成 `.secode-data`；全部测试使用登记式临时目录。

## 9. 失败、诊断与修正记录

### 9.1 Task 文档检查命令语法错误

现象：Task 生成后的空白检查条件语句出现 zsh `parse error near fi`。

原因：条件关键字被错误加引号。

修正：改为标准多行 `if ...; then ... fi`，重新执行文档、白名单和状态检查后通过。

影响：仅检查命令未执行；没有文件副作用。

### 9.2 首次 storage typecheck 的四类错误

现象：首次 T08-01 typecheck 报告：

- Node 20 类型不接受 FileHandle 直接作为 `createReadStream` path。
- `Stats` 从错误模块导入。
- Zod draft Schema 与分布式联合的输出类型不能直接断言。
- Zod 4 根对象 default 需要完整输出值。

修正：

- 使用空 path + 已验证 `fd` 创建 stream，并保持 `autoClose: false`。
- 从 `node:fs` 导入 `Stats`。
- 在运行时完整校验不变的前提下使用 `unknown` 中转受控类型断言。
- 根 default 改为完整默认对象。

重新验证：typecheck 通过。

### 9.3 run.started 类型可选性

现象：JSONL 恢复索引首次 typecheck 认为 `event.runId` 可能为 undefined。

原因：现有领域联合的 TypeScript 推导比单个运行时 Schema 更宽。

修正：在领域 Schema 校验后仍显式检查 `runId !== undefined`，不使用非空断言。

重新验证：typecheck 通过。

### 9.4 首次收口扫描引号错误

现象：组合多个 rg 模式的 zsh 命令报告 unmatched quote。

原因：单引号模式和 JSON 命令字符串混用。

修正：拆为独立命令并行执行，分别记录退出状态。

结果：四类禁止模式均无命中。

### 9.5 lint 的两个未使用 type warning

现象：第一次收口 lint 为 0 error、2 warning。

原因：`event-store.ts` 留有两个未使用 type import。

修正：删除未使用导入。

重新验证：lint 0 error、0 warning。

### 9.6 父目录同步故障测试未命中

现象：新增的 Session parent-sync 故障测试第一次期望 reject，但创建成功。

原因：macOS 临时目录的输入路径是 `/var/...`，初始化后的真实路径是 `/private/var/...`，测试按未解析绝对字符串匹配，故障没有注入到目标 handle。

修正：只对固定 basename 为 `sessions` 的目录 handle 注入同步故障。

重新验证：该测试通过，完整 storage 55 项通过。

所有失败均通过修正实现或测试夹具解决；没有放宽 Schema、跳过 symlink、取消 sync、接受坏行或删除断言。

## 10. 与 Spec/Task 的一致性和偏差

### 10.1 一致项

- 数据格式、版本、文件名和目录布局一致。
- 每事件 fsync 和 LF 提交语义一致。
- 8 MiB 记录上限、500/1000 page limit、20/100 recent limit 一致。
- 仅无 LF 尾部可修复，完整坏行失败关闭。
- metadata 不保存 status/updatedAt，最近工作区没有第二文件。
- storage 只报告 open run，不追加中断。
- 审批事实不恢复能力。
- 单进程写入、Node-only 和无新依赖一致。
- 生产与测试文件全部在 Task 白名单内。

### 10.2 实现选择

Task 允许“载入或重建”Session 一致性状态。实际选择每次追加前完整流式重建，而不是维护跨调用 `lastSeq` 缓存。

原因：

- 不产生缓存失效与磁盘事实漂移。
- 提交不确定后自然重新读取。
- 首版本地单用户事件量有限。

这不改变批准的公共 API、文件格式或提交语义，不属于 Spec 偏差。

### 10.3 实际偏差

无需要重新审批的 Spec 或 Task 偏差。

## 11. 已知限制和遗留风险

1. **单进程限制**：两个 Node.js 进程共享同一 data root 仍可能破坏序号；未实现跨进程锁。
2. **追加复杂度**：每次 append 前完整扫描日志，长期大 Session 会产生 O(n) 读取成本。
3. **重复 ID 内存**：精确重复检测需要单次扫描维护 O(n) UUID Set；事件对象分页仍是有界的。
4. **临时目录残留**：崩溃留下的 `.creating-*` 被忽略但不自动删除，磁盘空间由用户管理。
5. **磁盘容量**：事件只追加、不轮转、不压缩；磁盘容量管理不在首版。
6. **TOCTOU**：lstat/realpath/fstat 缩小文件替换窗口，但不能对抗具有相同本机用户权限的恶意进程。
7. **目录 sync 平台差异**：当前 macOS 实际执行目录 sync；Windows 仅对明确不支持 errno 降级。
8. **业务损坏后置**：storage 可以物理重放具有重复终态或无请求 tool.result 的日志；阶段 09 必须拒绝这些业务不变量。
9. **中断尚未落事实**：open run 只报告，阶段 09 前不会自动出现 `run.interrupted`。
10. **工作区路径不是能力**：metadata 中的路径必须在恢复时重新经过阶段 05 workspace factory。

这些限制都在已批准的可信本地单用户边界内，没有宣称强沙箱或多租户安全。

## 12. 安全检查

- [x] Session ID 只作为已验证 UUID 固定路径组件。
- [x] 内部目录和文件 symlink 被拒绝。
- [x] 文件打开前后验证类型和 dev/ino identity。
- [x] 不跟随 JSONL 中的数据执行操作。
- [x] 不持久化实时 delta、私有 reasoning 或环境变量。
- [x] 不持久化 pending/authorization/prepared invocation。
- [x] append 参数在打开写文件前完成 Schema 和大小验证。
- [x] 可能提交的失败不自动重试。
- [x] 完整坏行不跳过。
- [x] 测试只删除登记的临时目录。
- [x] 未创建真实用户数据目录。
- [x] 未修改依赖、配置或安全前置层。

## 13. 需求追踪证据

| 需求 | 实现证据 | 验证证据 |
| --- | --- | --- |
| FR-001 | metadata、原子 Session、列表 | schemas/config/session/read tests |
| FR-005 | append、page、完整事件重放 | append/read/jsonl tests |
| FR-006 | 审批事实持久化且无 capability 导出 | recovery/public API/scan |
| FR-008 | fsync、tail repair、restart inspection | session/append/recovery tests |
| FR-010 | 只追加 JSONL、无删除/压缩 API | JSONL 源码和 read tests |
| NFR-002 | strict Schema、完整事件二次 parse | schemas/append/typecheck |
| NFR-003 | 16 错误码、故障注入、提交不确定 | config/session/append/recovery tests |
| NFR-006 | Node-only `lib/storage` | import scan、Node Vitest |
| NFR-008 | Spec、Task、本 Summary | 文档索引和门禁审查 |
| SEC-006 | 有限事件/错误、能力与秘密扫描 | security/recovery/public API tests |
| SEC-008 | 单用户、单进程、TOCTOU 限制 | Spec 与本 Summary |
| COM-001/003 | 自研 JSONL、恢复、mutex 和错误 | package diff、源码审查、测试 |

## 14. 反思与下一阶段影响

### 14.1 有效做法

1. 先锁定完整行提交规则，使“可解析但无 LF”不会产生模糊恢复。
2. 把 storage 的物理不变量与 Agent 业务不变量拆开，避免双状态机。
3. 用真实 FileHandle 和故障代理测试 sync 后的不确定提交，而不只测试普通成功路径。
4. 让 store 拥有 seq/ID/time，使后续状态机不能伪造历史顺序。
5. 不创建 recent/status/nextSeq 辅助文件，减少崩溃事务面。

### 14.2 可改进点

1. 首轮就应按 realpath 写故障注入匹配，避免 macOS `/var` 路径差异。
2. Zod union 与现有领域类型的可选 runId 差异应在编码前做独立类型 spike。
3. 扫描命令应从一开始拆成独立模式，避免 shell 引号噪声。
4. 长期若 Session 日志显著增长，应单独规格化校验索引或 checkpoint，不能在本阶段暗加缓存文件。

### 14.3 阶段 09 必须遵守

- 只能通过 `JsonlEventStore.appendEvent` 追加事实。
- 会话加载时先 `inspectSession`，消费 `openRunIds`。
- 接受新任务前为 open run 追加 `run.interrupted`。
- 验证 run、model、tool 和 approval 跨事件生命周期。
- 不从 approved 历史重建执行授权。
- `EVENT_COMMIT_UNCERTAIN` 后先重新加载，不能盲目重试业务动作。
- 不直接读取或写入 data root 文件。

## 15. Summary 内部门禁

- [x] Spec 和 Task 均有用户批准记录。
- [x] T08-00 至 T08-09 全部完成。
- [x] 实现与批准 Spec/Task 一致。
- [x] 只修改批准白名单；前置阶段已有修改被保留。
- [x] storage 55 项和全仓 408 项测试通过。
- [x] lint、typecheck、build 和 diff check 通过。
- [x] 所有已发生失败、诊断和修正已记录。
- [x] 无依赖、配置、领域协议或框架耦合变化。
- [x] 无秘密、真实数据目录、能力恢复或越界清理。
- [x] 已知限制、反思和阶段 09 约束已记录。
- [x] Summary 提交审批时，开发索引已更新为“Summary 待用户审批”。
- [x] Summary 获批前未开始阶段 09。

内部检查已经通过；用户批准后阶段 08 正式完成。

## 16. 用户审批记录

- 当前审批结果：用户已于 2026-08-27 批准。
- 本次批准结果：阶段 08 正式完成，已解锁阶段 09 的只读观察与 Spec。
- 用户要求修订时：只处理本阶段批准范围内的实现、测试、Summary 和索引；修订后重新执行受影响验证并等待审批。
- 阶段 09 后续仍须独立执行 Spec、Task、开发和 Summary 三级审批门禁。
