# 阶段 08：JSONL 事件存储 Task

## 1. 文档状态与审批链

- 当前状态：已批准
- 生成日期：2026-08-27
- 批准的 Spec：[08-jsonl-event-store-spec.md](./08-jsonl-event-store-spec.md)
- Spec 审批结果：用户已于 2026-08-27 批准
- 本文档作用：把已批准的 JSONL 存储规格拆成可直接实施和验证的任务
- 当前禁止：Task 获批前不得修改业务代码、测试、配置或依赖

审批链：

```text
阶段 08 Spec（已批准）
  → 本 Task（已批准）
  → 实际开发与验证（已完成）
  → 阶段 08 Summary（待用户审批）
```

用户批准本 Task 后只授权本文件白名单和任务顺序内的开发；不授权阶段 09 Agent 状态机、终端、API 或 UI。

## 2. 实施目标

实现一个框架无关、Node.js-only 的本地事件仓库：

```text
EventStore 配置
  → 安全初始化数据根
  → 原子创建 Session + seq 1
  → 串行追加 DurableEventDraft
  → 完整事件 Schema 校验 + fsync
  → 流式重放 + 物理不变量校验
  → 不完整尾部截断
  → Session/最近工作区/未结束 run 报告
```

实现完成后，后续模块只能通过 `@/lib/storage` 创建会话和追加持久事件，不应直接操作 `.secode-data` 文件。

## 3. 批准规格的不可变约束

开发期间不得自行改变：

1. 磁盘布局固定为 `sessions/<uuid>/session.json` 与 `events.jsonl`。
2. `session.json` 只保存 `storageVersion: 1` 和不可变 Session 身份。
3. `session.created` 只能由 store 生成，是 `seq: 1` 且不含 `runId`。
4. 外部追加输入不包含信封字段，且不能提交实时事件或 `session.created`。
5. 每个 Session 的 `seq` 从 1 开始严格连续；同 Session 操作使用进程内 FIFO 串行化。
6. 每条成功事件以 UTF-8 单行 JSON 写入，并在返回前 `FileHandle.sync()`。
7. 单条记录上限 8 MiB；不得整文件读取事件日志。
8. 只有没有最终换行的尾部字节可以截断；任意完整坏行必须失败关闭。
9. 重放校验 Schema、协议、连续序号、事件 ID、Session ID 和首事件身份。
10. storage 只报告 `openRunIds`，不追加 `run.interrupted`，不验证完整 Agent 生命周期。
11. `approval.resolved` 等历史只代表事实，不能恢复 pending、authorization 或工具执行。
12. 最近工作区从 Session 元数据派生，不新增独立最近记录文件。
13. 内部固定目录和文件拒绝 symlink；数据根显式 symlink 只在初始化时解析一次。
14. 首版仅支持单 Node.js 进程写同一数据根，不实现跨进程锁。
15. 不新增依赖，不修改 `protocolVersion`、现有事件类型或字段。
16. 不实现 Agent、上下文、终端、Route Handler、NDJSON 或 UI。

若实现需要改变磁盘格式、提交语义、公共安全边界、恢复规则或上述任一项，立即停止并回到 Spec 修订审批。

## 4. 公共常量与类型锁定

### 4.1 常量

`@/lib/storage` 最终导出：

```ts
STORAGE_VERSION = 1
DEFAULT_DATA_DIRECTORY_NAME = ".secode-data"
SESSION_METADATA_FILE_NAME = "session.json"
SESSION_EVENTS_FILE_NAME = "events.jsonl"
MAX_SESSION_METADATA_BYTES = 64 * 1024
MAX_EVENT_LINE_BYTES = 8 * 1024 * 1024
DEFAULT_EVENT_PAGE_LIMIT = 500
MAX_EVENT_PAGE_LIMIT = 1000
DEFAULT_RECENT_WORKSPACE_LIMIT = 20
MAX_RECENT_WORKSPACE_LIMIT = 100
EVENT_STORE_ERROR_CODES
```

临时目录前缀和内部 chunk 大小不属于公共 API，只在内部模块定义。

### 4.2 Session 元数据

固定磁盘结构：

```ts
interface StoredSessionMetadata {
  storageVersion: 1;
  id: SessionId;
  title: string;
  workspacePath: string;
  modelProfileId: string;
  createdAt: string;
}
```

`StoredSessionMetadataSchema` 为 strict Zod Schema，复用领域层 UUID、时间和字符串上限。`workspacePath` 还必须通过当前平台的 `path.isAbsolute()`；它不重新访问或验证真实工作区。

### 4.3 Store 配置与创建输入

```ts
interface JsonlEventStoreOptions {
  dataDir?: string;
  cwd?: string;
}

interface CreateStoredSessionInput {
  title: string;
  workspacePath: string;
  modelProfileId: string;
}
```

- 两个输入均使用 strict Schema。
- `dataDir` 优先级高于 `SECODE_DATA_DIR`；二者均无值时使用 `<cwd>/.secode-data`。
- `cwd` 默认在 factory 调用时捕获 `process.cwd()`，必须是绝对路径。
- 环境变量对象不进入公共 API；测试通过内部 dependencies 注入环境读取结果。

### 4.4 事件 draft

```ts
type DurableEventDraft =
  DurableAgentEvent extends infer TEvent
    ? TEvent extends DurableAgentEvent
      ? TEvent["type"] extends "session.created"
        ? never
        : Omit<
            TEvent,
            | "protocolVersion"
            | "durable"
            | "id"
            | "seq"
            | "sessionId"
            | "createdAt"
          >
      : never
    : never;
```

要求：

- 保持判别联合，不导出宽化的 `{type, data}` 类型。
- 所有可追加事件当前都必须有 `runId`。
- `DurableEventDraftSchema` 拒绝额外信封字段、`session.created`、未知/实时 type 和非法 data。
- 最终事件仍必须再通过 `DurableAgentEventSchema`，不能只信任 draft Schema。

### 4.5 查询与结果

```ts
interface EventPageQuery {
  afterSeq?: number;
  limit?: number;
}

interface RecentWorkspaceQuery {
  limit?: number;
}

interface SessionRecoveryReport {
  tailRepaired: boolean;
  discardedTailBytes: number;
  lastStableSeq: number;
  openRunIds: readonly RunId[];
}

interface EventPage {
  events: readonly DurableAgentEvent[];
  lastSeq: number;
  hasMore: boolean;
  recovery: SessionRecoveryReport;
}

interface SessionInspection {
  metadata: StoredSessionMetadata;
  lastSeq: number;
  recovery: SessionRecoveryReport;
}

interface CreatedStoredSession {
  metadata: StoredSessionMetadata;
  session: SessionRecord;
  event: Extract<DurableAgentEvent, { type: "session.created" }>;
}
```

查询默认值和上限严格使用第 4.1 节常量。所有结果对象、数组和嵌套记录在公共边界深冻结，调用方修改不能污染 store 状态。

## 5. 公共 API 锁定

`@/lib/storage` 最终导出：

```ts
createJsonlEventStore(
  options?: JsonlEventStoreOptions,
): JsonlEventStore

interface JsonlEventStore {
  initialize(): Promise<void>;

  createSession(
    input: CreateStoredSessionInput,
  ): Promise<CreatedStoredSession>;

  getSessionMetadata(
    sessionId: SessionId,
  ): Promise<StoredSessionMetadata>;

  listSessions(): Promise<readonly StoredSessionMetadata[]>;

  listRecentWorkspaces(
    query?: RecentWorkspaceQuery,
  ): Promise<readonly string[]>;

  appendEvent(
    sessionId: SessionId,
    draft: DurableEventDraft,
  ): Promise<DurableAgentEvent>;

  readEvents(
    sessionId: SessionId,
    query?: EventPageQuery,
  ): Promise<EventPage>;

  inspectSession(
    sessionId: SessionId,
  ): Promise<SessionInspection>;
}
```

公共 barrel 同时导出第 4 节的常量、Schema、类型、`EventStoreError` 和错误码；不导出：

- 原生 fs dependencies。
- 依赖注入 factory。
- mutex registry。
- JSONL parser/writer 原语。
- 真实数据根内部路径拼装器。
- 尾部 truncate helper。
- 文件 identity snapshot。

所有方法在磁盘操作前验证公共输入。`initialize()` 前调用其他方法固定返回 `EVENT_STORE_NOT_INITIALIZED`；不隐式初始化。

## 6. 错误模型锁定

### 6.1 错误码

固定错误码：

```text
EVENT_STORE_CONFIG_INVALID
EVENT_STORE_NOT_INITIALIZED
EVENT_STORE_IO_ERROR
EVENT_COMMIT_UNCERTAIN
EVENT_STORE_SYMLINK_DENIED
EVENT_STORE_PATH_CONFLICT
SESSION_ALREADY_EXISTS
SESSION_NOT_FOUND
SESSION_METADATA_CORRUPT
SESSION_ID_MISMATCH
EVENT_LOG_CORRUPT
EVENT_TOO_LARGE
EVENT_SEQUENCE_CONFLICT
EVENT_ID_DUPLICATE
EVENT_TYPE_FORBIDDEN
EVENT_SESSION_MISMATCH
```

不得在实现时用临时字符串替代稳定错误码。Schema 或 JSON 解析失败必须映射到最接近的固定码。

### 6.2 recoverable 固定语义

| 错误码 | recoverable |
| --- | --- |
| `EVENT_STORE_CONFIG_INVALID` | false |
| `EVENT_STORE_NOT_INITIALIZED` | true |
| `EVENT_STORE_IO_ERROR` | true |
| `EVENT_COMMIT_UNCERTAIN` | false |
| `EVENT_STORE_SYMLINK_DENIED` | false |
| `EVENT_STORE_PATH_CONFLICT` | false |
| `SESSION_ALREADY_EXISTS` | false |
| `SESSION_NOT_FOUND` | true |
| `SESSION_METADATA_CORRUPT` | false |
| `SESSION_ID_MISMATCH` | false |
| `EVENT_LOG_CORRUPT` | false |
| `EVENT_TOO_LARGE` | true |
| `EVENT_SEQUENCE_CONFLICT` | false |
| `EVENT_ID_DUPLICATE` | false |
| `EVENT_TYPE_FORBIDDEN` | true |
| `EVENT_SESSION_MISMATCH` | false |

### 6.3 Error 类型与 details

```ts
class EventStoreError extends Error {
  readonly error: ErrorInfo;
  readonly cause: unknown; // non-enumerable
}
```

允许的公共 details 仅为下列可选字段：

```text
field
reason
sessionId
line
byteOffset
expectedSeq
actualSeq
eventId
expectedKind
actualKind
```

details 使用独立 strict Schema。公共 message/details 不包含：

- 原始配置值或 data root 路径。
- 完整事件行、消息、工具参数或工具输出。
- Error stack、`errno.path` 或任意内部绝对文件路径。
- 环境变量、API Key 或 Authorization。

`EVENT_COMMIT_UNCERTAIN` 用于 write/sync/rename 已可能产生可见结果、但当前调用无法证明持久提交的情况；不得自动降级为可重试普通 I/O。

## 7. 内部依赖与文件安全锁定

### 7.1 依赖注入

`lib/storage/dependencies.ts` 定义内部 `EventStoreDependencies`，至少封装：

- `randomUUID()`
- `now()`
- `cwd()`
- `readEnvironment(name)`
- 所需 `fs/promises` 能力
- 创建可配置 chunk 大小的只读文件流
- `platform`

生产 factory 使用 Node 原生实现。测试 factory 可直接从内部模块导入，但不得从 `@/lib/storage` 导出。

依赖注入只为确定性与故障测试，不允许替换领域 Schema 或跳过安全校验。

### 7.2 文件身份验证

`lib/storage/file-safety.ts` 负责：

1. 验证固定组件名，不接收任意相对路径。
2. 用 `lstat` 拒绝 symlink。
3. 验证目录或普通文件类型。
4. 用 `realpath` 验证对象仍位于已固定的 data root/sessions root 内。
5. 打开文件后用 `FileHandle.stat()` 对比打开前的 `dev`/`ino`；不一致则关闭并拒绝。

读、append 和 truncate 使用已验证的文件句柄。若平台不提供稳定 inode 信息，仍执行 lstat/realpath/fstat 类型检查，并在 Summary 记录平台降级；不得取消 symlink 检查。

### 7.3 初始化

初始化顺序：

1. 解析显式 dataDir、环境值和 cwd。
2. 创建或验证 data root，解析并固定真实路径。
3. 创建或验证非 symlink 的 `sessions` 目录。
4. 在支持平台使用新建目录 mode `0700`。
5. 标记 store 已初始化。

重复 `initialize()` 成功且不重建目录。首次失败不能把 store 标为已初始化。

## 8. JSONL 原语锁定

### 8.1 序列化

`serializeDurableEvent(event)`：

- 先用 `DurableAgentEventSchema` 校验。
- 使用 `JSON.stringify(event) + "\n"`。
- 转成单一 UTF-8 Buffer。
- 包含换行的 Buffer 不超过 `MAX_EVENT_LINE_BYTES`。
- 返回 Buffer，不直接写盘。

### 8.2 流式解析

内部 parser 输入已验证的 `FileHandle` 或只读流和期望 Session ID，输出逐条记录及物理统计。实现要求：

- 以字节 `0x0A` 切行，不先按字符串 chunk 切行。
- 使用流式 `TextDecoder` 解析完整行，正确拒绝非法 UTF-8。
- 每行保留行号、起止 byte offset。
- 换行前立即执行 8 MiB 上限。
- 不允许 BOM、空行或 CRLF；JSONL 固定只使用 LF。若 LF 前出现 `0x0D`，parser 必须在 JSON 解析前显式拒绝，不把它当作可忽略空白。
- 每条 JSON 先解析，再通过 `DurableAgentEventSchema`。
- 不调用 `readFile(events.jsonl)`。

重放时临时保存事件 ID Set 以精确发现重复，扫描完成后除 store 需要的轻量一致性缓存外不保存完整事件对象。若缓存存在，提交失败后必须整体失效。

### 8.3 物理不变量

parser/replay 固定检查：

- 第一条 `seq === 1` 且 type 为 `session.created`。
- 后续 `seq === previous + 1`。
- 全部 `sessionId` 与目标 Session 一致。
- 全部事件 ID 唯一。
- 后续不能再次出现 `session.created`。
- 首事件无 `runId`。

事件的模型、工具和审批关联关系不在此处检查。

### 8.4 尾部修复

扫描结束后：

- 没有剩余字节：`tailRepaired: false`。
- 有未换行字节：记录其长度，不解析为记录。
- 以 `r+` 打开并复验同一文件 identity。
- truncate 到最后稳定换行偏移并 `sync()`。
- 成功后报告 `tailRepaired: true`。

空 `events.jsonl`、没有任何有效换行记录、完整坏行或超大尾行均按 Spec 处理。超大且未换行的最终尾部仍应在超过上限时停止缓冲并记为可截断尾部；实现不得分配完整超大 Buffer。

truncate/sync 失败不能报告修复成功；若截断可能已发生但同步失败，返回 `EVENT_COMMIT_UNCERTAIN`。

## 9. Session 创建事务锁定

### 9.1 临时目录

临时目录名固定使用内部前缀加本次 Session UUID和独立 nonce，必须：

- 不匹配纯 UUID Session 目录名。
- 只在当前 `sessions` 目录直接创建。
- 使用 exclusive/non-recursive 创建和 `0700` mode。
- 不通过公共 API 暴露。

残留临时目录在 list 时忽略；本阶段不自动清理。

### 9.2 文件写入

- `session.json` 使用 `JSON.stringify(metadata) + "\n"`，不 pretty-print、不写 BOM。
- metadata Buffer 上限为 64 KiB。
- 两个文件都使用 exclusive create 和 `0600` mode。
- 分别完整写入并 `sync()`。
- `events.jsonl` 初始内容只含 store 生成的 `session.created`。
- 文件和目录全部关闭后才 rename 临时目录。

SessionRecord 固定：

```text
status = idle
createdAt = updatedAt = 本次注入时钟产生的同一个值
```

### 9.3 重命名和父目录同步

- 最终目录是 `sessions/<session id>`。
- rename 前验证目标不存在；rename 的目标冲突统一映射 `SESSION_ALREADY_EXISTS`。
- rename 后在支持的平台打开并同步 `sessions` 目录。
- macOS/Linux 目录 sync 失败按提交位置判断并重新检查最终目录。
- Windows 不支持的目录 sync 错误只允许对明确的已知不支持 errno 降级，并由测试覆盖；其他错误不能吞掉。

创建失败时不得递归删除未知路径。实现可以清理本次调用在内存登记且仍严格位于 sessions 根下的临时目录，但清理失败不能覆盖主错误；测试 helper 的清理规则更严格。

## 10. 追加事务锁定

每次 `appendEvent` 在 Session FIFO 锁内：

1. 校验 Session ID 和 draft。
2. 验证 Session 目录及两个固定文件身份。
3. 载入或重建该 Session 的一致性状态。
4. 生成 UUID，发现已存在时返回 `EVENT_ID_DUPLICATE`，不反复猜新 ID。
5. 生成一次 ISO 时间。
6. 分配 `lastSeq + 1`。
7. 构造并校验完整事件。
8. 在打开文件前完成序列化和大小检查。
9. append 完整 Buffer，验证写入字节数并 `sync()`。
10. 关闭后更新缓存并返回深冻结事件。

若任何 write/sync/close 错误发生在可能写入之后：

- 立即删除该 Session 缓存。
- 不在当前调用里再次 append。
- 重新读取只用于判断能否确定记录完整存在；无法证明同步结果时仍返回 `EVENT_COMMIT_UNCERTAIN`。
- 下一次调用必须先完整重放并处理尾部。

不同 Session 可以并发；同 Session 的 `readEvents`、`inspectSession`、tail repair 和 append 共用同一 FIFO 锁。

## 11. 重放、检查与派生锁定

### 11.1 metadata 加载

- 先验证 Session ID 是 UUID，再拼固定路径。
- Session 目录不存在映射为 `SESSION_NOT_FOUND`。
- `session.json` 必须是非 symlink 普通文件。
- 以有界方式读取，超过 64 KiB 直接 `SESSION_METADATA_CORRUPT`。
- 只接受一个以 LF 结束的 JSON 对象；拒绝 BOM、空文件、额外非空内容和未知字段。
- 验证目录名、metadata.id 和首事件 Session ID 一致。

### 11.2 Session identity

首条 `session.created.data.session` 必须：

- 与 metadata 的 id/title/workspacePath/modelProfileId/createdAt 完全相等。
- `status === "idle"`。
- `updatedAt === createdAt`。

不一致映射为 `SESSION_METADATA_CORRUPT` 或 `SESSION_ID_MISMATCH`，不得选择一方覆盖另一方。

### 11.3 recovery report

扫描事件时只按 `runId` 收集：

- `run.started` 加入首次开始顺序。
- 四类 terminal event 将该 run 标记为已有终态。
- 扫描结束后返回 started 减 terminal 的 `openRunIds`。

storage 不拒绝多次 started、重复终态或 terminal-before-start；阶段 09 验证这些业务语义。

`lastStableSeq` 是修复尾部后的最后完整事件序号。Session 没有合法 seq 1 时失败，不返回 0 的正常 inspection。

### 11.4 分页

- 完整扫描并验证日志，但只把 `afterSeq < seq` 的前 `limit + 1` 条候选事件保留。
- 返回前丢弃多取的一条，并据此计算 `hasMore`。
- `lastSeq` 始终是日志最后稳定序号。
- `afterSeq >= lastSeq` 时返回空 events、`hasMore: false`。
- 本次扫描用于重复 ID 检查的 Set 在结果产生后释放或进入受控缓存，不返回调用方。

### 11.5 Session 列表

- 枚举 `sessions` 的直接子项。
- 纯 UUID 目录才是 Session 候选。
- 临时目录、普通无关文件和非 UUID 目录忽略。
- 名称为 UUID 的 symlink 或非目录是安全冲突，整个调用失败。
- 每个候选只加载 metadata；列表不扫描 events。
- 任一候选 metadata 损坏时整个调用失败，不能静默隐藏已存在 Session。
- 按 `createdAt` 降序，时间相同时按 `id` 升序。

### 11.6 最近工作区

- 复用 `listSessions()` 结果。
- 保持 Session 排序，按字符串完全相等去重 workspacePath。
- 达到 limit 立即停止。
- 不访问工作区文件系统，不过滤已不存在目录。

## 12. 文件变更白名单

### 12.1 允许新增的生产文件

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

### 12.2 允许新增的测试文件

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

### 12.3 允许修改的现有文件

```text
docs/development/08-jsonl-event-store-spec.md
docs/development/08-jsonl-event-store-tasks.md
docs/development/README.md
```

开发完成后允许新增：

```text
docs/development/08-jsonl-event-store-summary.md
```

### 12.4 明确禁止修改

- `lib/domain/**`
- `lib/model/**`
- `lib/workspace/**`
- `lib/tools/**`
- `lib/approval/**`
- `app/**`
- `package.json`、lockfile、TypeScript、Vitest、ESLint、Next.js 配置
- `.env.example`、`.gitignore`
- 既有测试文件

若 TypeScript 实现证明必须修改领域导出或已有配置，停止开发并修订 Task；若需要改变事件 Schema 或安全边界，回到 Spec 修订。

## 13. 任务执行顺序

### T08-00：实施前基线与文档对照

输入：

- 已批准的阶段 08 Spec。
- 本 Task。
- 当前工作树和现有测试基线。

动作：

1. 重新阅读 `AGENTS.md`、阶段 08 Spec、Task 和前置阶段 Summary。
2. 按 `AGENTS.md` 阅读本地 Next.js 16.3.3 的 Route/runtime 文档，确认本阶段不引入 `next/*` 且只运行于 Node.js。
3. 执行 `git status --short`，记录用户或前置阶段已有修改。
4. 确认白名单外文件不会被覆盖。
5. 运行当前全量单元测试、lint 和 typecheck，记录实施前基线。
6. 检查 `lib/storage` 和 `tests/unit/storage` 尚不存在或没有用户文件冲突。

输出：

- 可追溯的基线命令与结果，最终写入 Summary。
- 明确的允许文件集合。

完成条件：

- Spec/Task 均已批准。
- 基线失败已区分为既有问题或本阶段阻断问题。
- 未修改任何生产代码。

最小验证：

```text
git status --short
pnpm test
pnpm lint
pnpm typecheck
```

### T08-01：常量、Schema、类型与错误契约

依赖：T08-00。

涉及文件：

- `lib/storage/types.ts`
- `lib/storage/schemas.ts`
- `lib/storage/errors.ts`
- `tests/unit/storage/schemas.test.ts`

动作：

1. 实现第 4 节全部公共常量和类型。
2. 实现 options、Session 创建、metadata、draft、分页和最近工作区 strict Schema。
3. 实现分布式 `DurableEventDraft`，排除 `session.created`。
4. 实现固定错误码、details Schema、`EventStoreError` 和 errno 安全映射。
5. 对全部输入的 extra key、长度、UUID、日期、绝对路径、limit 和禁止事件建立测试。
6. 验证错误枚举、cause 可见性和秘密不泄露。

输出：

- 后续模块不需临时决定的稳定契约。

完成条件：

- 所有 Schema 均 strict。
- 类型从 Schema 推导或与批准的判别联合保持一致。
- 错误通过 `ErrorInfoSchema`。
- 未修改领域事件文件。

最小验证：

```text
pnpm exec vitest run tests/unit/storage/schemas.test.ts
pnpm typecheck
```

覆盖：FR-001、FR-008、NFR-002、NFR-003、SEC-006。

### T08-02：配置、依赖注入与文件身份安全

依赖：T08-01。

涉及文件：

- `lib/storage/dependencies.ts`
- `lib/storage/config.ts`
- `lib/storage/file-safety.ts`
- `tests/unit/storage/helpers.ts`
- `tests/unit/storage/config.test.ts`
- `tests/unit/storage/security.test.ts`

动作：

1. 实现原生 dependencies 和仅内部可见的注入 factory。
2. 实现 dataDir 优先级、cwd 捕获、相对路径解析和真实根固定。
3. 创建/验证 data root 与 `sessions`，应用新建 mode。
4. 实现固定路径组件、containment、lstat、realpath 和 fstat identity 检查。
5. 实现安全的测试临时目录登记与精确清理；拒绝清理未登记路径。
6. 覆盖显式 data root symlink 和内部 symlink 的不同语义。
7. 注入 errno，验证错误不泄露真实 path。

输出：

- 所有后续磁盘操作复用的安全根与已验证文件能力。

完成条件：

- factory 创建时不写磁盘，initialize 才创建布局。
- 初始化幂等，失败不误标已初始化。
- 内部 symlink、类型冲突和逃逸失败关闭。
- 测试不触碰默认数据目录或真实用户工作区。

最小验证：

```text
pnpm exec vitest run tests/unit/storage/config.test.ts tests/unit/storage/security.test.ts
pnpm typecheck
```

覆盖：FR-001、FR-008、NFR-003、NFR-006、SEC-006、SEC-008。

### T08-03：按 Session FIFO 串行器

依赖：T08-01。

涉及文件：

- `lib/storage/mutex.ts`
- `tests/unit/storage/mutex.test.ts`

动作：

1. 实现相同 key 严格 FIFO 的异步串行器。
2. 确保前一任务 reject 后队列仍能继续。
3. 确保不同 key 不互相阻塞。
4. 最后一个任务完成后释放无等待者的锁条目。
5. 禁止未 await 的内部任务和吞掉 rejection。

输出：

- create/list 根锁和 Session 读写锁可复用的内部原语。

完成条件：

- 顺序、异常继续、跨 key 并发和条目回收测试全部通过。

最小验证：

```text
pnpm exec vitest run tests/unit/storage/mutex.test.ts
pnpm typecheck
```

覆盖：FR-008、NFR-003、NFR-006。

### T08-04：有界 JSONL 序列化、重放和尾部修复原语

依赖：T08-01、T08-02。

涉及文件：

- `lib/storage/jsonl.ts`
- `tests/unit/storage/jsonl.test.ts`
- `tests/unit/storage/recovery.test.ts`

动作：

1. 实现事件序列化和 8 MiB UTF-8 边界。
2. 实现按字节 LF 切行的增量 parser。
3. 实现 UTF-8、JSON、领域 Schema 和物理不变量验证。
4. 实现 line/byte offset、lastSeq、事件 ID Set 和 run 恢复统计。
5. 实现未换行最终尾部的有限内存检测、truncate 和 sync。
6. 区分可修复尾部、完整坏行和提交不确定错误。
7. 用一字节、随机和多字节 chunk 验证解析。
8. 验证 CRLF、BOM、空行、坏 JSON、超大行、seq/ID/Session 冲突全部失败关闭。

输出：

- 不依赖 Session 列表和 Agent 业务状态的 JSONL 物理层。

完成条件：

- 不使用整文件 `readFile` 读取事件日志。
- 不完整尾部不按事件解析。
- 完整坏行不跳过、不自动修复。
- parser 不验证阶段 09 业务生命周期。

最小验证：

```text
pnpm exec vitest run tests/unit/storage/jsonl.test.ts tests/unit/storage/recovery.test.ts
pnpm typecheck
```

覆盖：FR-005、FR-008、FR-010、NFR-003、NFR-006、SEC-006。

### T08-05：EventStore 初始化与原子 Session 创建

依赖：T08-02、T08-03、T08-04。

涉及文件：

- `lib/storage/event-store.ts`
- `tests/unit/storage/session.test.ts`

动作：

1. 实现 store 生命周期和显式 `initialize()` 门禁。
2. 实现严格临时目录和原子 Session 创建事务。
3. 一次生成 Session UUID/createdAt，构造 metadata、SessionRecord 和 seq 1 事件。
4. exclusive 创建、完整写入并同步两个文件。
5. rename 后按平台规则同步父目录。
6. 实现目标冲突、创建中故障、rename 后不确定性和残留临时目录规则。
7. 实现 `getSessionMetadata` 及 metadata 有界读取。
8. 验证创建结果深冻结，磁盘身份与首事件一致。

输出：

- 不会向列表暴露半创建目录的 Session 创建能力。

完成条件：

- seq 1、初始 status/时间和 metadata 精确匹配。
- 故障注入不覆盖目标、不误删未知目录。
- 初始化前调用返回固定错误。

最小验证：

```text
pnpm exec vitest run tests/unit/storage/session.test.ts tests/unit/storage/config.test.ts
pnpm typecheck
```

覆盖：FR-001、FR-008、NFR-002、NFR-003、SEC-006。

### T08-06：持久事件追加与并发一致性

依赖：T08-03、T08-04、T08-05。

涉及文件：

- `lib/storage/event-store.ts`
- `tests/unit/storage/append.test.ts`

动作：

1. 实现 `appendEvent` 的输入校验、Session 锁和信封生成。
2. 建立/重建 lastSeq 与事件 ID 一致性状态。
3. 实现 UUID 冲突、连续 seq、最终 Schema 和写前大小检查。
4. 使用已验证文件句柄 append，校验完整写入并同步。
5. 实现提交失败后的缓存失效和 `EVENT_COMMIT_UNCERTAIN`。
6. 验证同 Session `Promise.all` 仍 FIFO 连续，不同 Session 可并行。
7. 验证未知、实时、外部 session.created 和额外信封字段均不落盘。

输出：

- 阶段 09 可直接使用的单事件 durable append API。

完成条件：

- 成功返回前已 sync。
- 同 Session 无重号、跳号或交错半行。
- 失败后不会在未知 lastSeq 上继续。
- 返回事件深冻结。

最小验证：

```text
pnpm exec vitest run tests/unit/storage/append.test.ts tests/unit/storage/jsonl.test.ts
pnpm typecheck
```

覆盖：FR-005、FR-006、FR-008、FR-010、NFR-002、NFR-003、SEC-006。

### T08-07：读取分页、Session 检查和派生列表

依赖：T08-05、T08-06。

涉及文件：

- `lib/storage/event-store.ts`
- `tests/unit/storage/read.test.ts`
- `tests/unit/storage/recovery.test.ts`
- `tests/unit/storage/security.test.ts`

动作：

1. 实现 `readEvents` 的完整验证扫描、有界分页和 `hasMore`。
2. 实现 `inspectSession` 的 metadata/首事件一致性和 recovery report。
3. 实现 open run 检测，不追加任何新事件。
4. 实现 `listSessions` 的目录过滤、metadata 验证和稳定排序。
5. 实现 `listRecentWorkspaces` 的排序复用、精确去重和 limit。
6. 验证全部读/修复操作与 append 共享 Session 锁。
7. 验证 UUID symlink/非目录候选导致失败，普通无关项被忽略。
8. 验证批准事实可以读取，但结果中没有 pending/authorization/capability。

输出：

- 刷新、重启、终端和后续 API 所需的完整读取能力。

完成条件：

- 分页不返回超过 limit 的事件，lastSeq 语义正确。
- 尾部恢复报告准确，完整坏行仍失败。
- open run 顺序确定且无执行副作用。
- Session 和最近工作区排序可重复。

最小验证：

```text
pnpm exec vitest run tests/unit/storage/read.test.ts tests/unit/storage/recovery.test.ts tests/unit/storage/security.test.ts
pnpm typecheck
```

覆盖：FR-001、FR-005、FR-006、FR-008、FR-010、NFR-003、SEC-006、SEC-008。

### T08-08：公共 API、架构和秘密边界收口

依赖：T08-01 至 T08-07。

涉及文件：

- `lib/storage/index.ts`
- `tests/unit/storage/public-api.test.ts`

动作：

1. 按第 4–5 节导出唯一批准的公共能力。
2. 测试内部 dependencies、parser、mutex、路径和 truncate helper 不从 barrel 暴露。
3. 扫描 `lib/storage` import，确认不依赖 Next.js、React、浏览器和 approval capability 实现。
4. 扫描生产源码和 fixture，确认无 API Key、Authorization 或真实 data root。
5. 重新验证 `approval.resolved` 无法转换成任何执行授权。
6. 对照需求 ID 和 Spec 验收清单，补充遗漏的边界测试，不改变批准语义。

输出：

- 稳定、最小且可供阶段 09 使用的 `@/lib/storage` 公共面。

完成条件：

- 公共导出与本文一致。
- 内部原语不能被生产调用方误用。
- 无新依赖、框架耦合或秘密落盘路径。

最小验证：

```text
pnpm exec vitest run tests/unit/storage/public-api.test.ts tests/unit/storage
pnpm typecheck
```

覆盖：全部本阶段需求。

### T08-09：整体验证、反思与 Summary

依赖：T08-00 至 T08-08 全部完成。

允许文档：

- `docs/development/08-jsonl-event-store-summary.md`
- `docs/development/README.md`

动作：

1. 执行阶段 storage 精确测试和全量质量命令。
2. 检查 Git diff、白名单、空白错误和依赖变化。
3. 执行框架耦合、秘密、危险恢复和整文件读取扫描。
4. 对照 Spec 的 14 项验收标准和本 Task 全部完成条件。
5. 如实记录所有失败、诊断、修正和重新验证。
6. 记录平台目录 sync/mode 的实际行为和降级。
7. 生成 Summary，更新开发索引为“Summary 待用户审批”。
8. 停止，不开始阶段 09 观察。

完整验证：

```text
pnpm exec vitest run tests/unit/storage
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
git status --short
```

附加扫描：

```text
检查白名单外改动
检查 package/lockfile 无变化
检查 lib/storage 无 next/react/browser import
检查 events.jsonl 未使用整文件 readFile
检查无 assistant.delta/private reasoning/pending/authorization 持久化
检查无秘密和绝对测试 fixture 泄露
```

完成条件：

- 所有命令通过，或真实阻断已按第 16 节停止并重新审批。
- Summary 完整、索引正确。
- 未开始阶段 09。

覆盖：NFR-008 及全部阶段验收。

## 14. 测试矩阵

| 测试文件 | 核心职责 | 关键失败路径 |
| --- | --- | --- |
| `schemas.test.ts` | options、metadata、draft、query、错误 details | extra key、非法 UUID/时间/路径、禁止事件、limit 越界 |
| `config.test.ts` | 配置优先级、cwd 固定、初始化、mode | 空白/NUL、文件冲突、环境值泄露、重复初始化 |
| `mutex.test.ts` | FIFO、异常继续、不同 key 并行、回收 | reject 后死锁、跨 key 阻塞、条目泄漏 |
| `jsonl.test.ts` | 序列化、chunk parser、物理不变量 | BOM/CRLF/空行/坏 JSON/超大/seq/ID/Session 冲突 |
| `session.test.ts` | 原子创建、metadata、seq 1、故障注入 | 半创建可见、冲突覆盖、sync/rename 不确定 |
| `append.test.ts` | envelope、seq、fsync、并发和缓存失效 | 外部信封、UUID 冲突、部分写、sync 失败、并发重号 |
| `read.test.ts` | 分页、lastSeq、hasMore、冻结结果 | after/limit 边界、全量常驻、首事件不符 |
| `recovery.test.ts` | 尾部截断、open run、重启 | 可解析无换行尾部、完整坏行、truncate sync 失败、能力重建 |
| `security.test.ts` | symlink、identity、containment、秘密 | UUID symlink、文件替换、errno path、未知目录删除 |
| `public-api.test.ts` | 导出面和框架解耦 | 内部 fs/parser/mutex/capability 泄露 |

测试要求：

- 不使用真实 `.secode-data`。
- 不读取或修改用户项目。
- 不依赖测试执行顺序。
- 故障注入后清理只针对登记的专用临时根。
- 不用跳过、弱化断言或删除测试制造通过。
- 时间、UUID、chunk 和关键 fs 故障必须可确定注入。

## 15. 需求到任务映射

| 需求 | 任务 | 实现证据 | 验证证据 |
| --- | --- | --- | --- |
| FR-001 | T08-01/02/05/07 | metadata、原子 Session、列表 | schemas/session/read tests |
| FR-005 | T08-04/06/07 | 事件追加与分页重放 | jsonl/append/read tests |
| FR-006 | T08-06/07/08 | 审批事实持久化且无能力导出 | append/recovery/public API tests |
| FR-008 | T08-02–07 | durable store、尾部恢复、open run | config/session/recovery tests |
| FR-010 | T08-04/06/07 | 只追加原始事件 | jsonl/append/read tests |
| NFR-002 | T08-01/05/06 | strict Schema 与完整事件 parse | schemas/session/append tests |
| NFR-003 | T08-01/02/04–07 | EventStoreError 和故障恢复 | 全部失败路径测试 |
| NFR-006 | T08-02–08 | Node-only `lib/storage` | import scan、Node Vitest |
| NFR-008 | T08-00/09 | 基线、证据和 Summary | 文档审计 |
| SEC-006 | T08-01/02/04–08 | 有限错误、事件边界和秘密扫描 | error/security/public API tests |
| SEC-008 | T08-02/08/09 | 本地单用户和 TOCTOU 限制声明 | 文档、源码审查 |
| COM-001/003 | T08-01–09 | 自研 JSONL、恢复、并发与错误 | 依赖/源码扫描 |

## 16. 失败处理与重新审批

### 16.1 普通实现或测试失败

按以下顺序处理：

1. 记录命令、失败现象和首个根因。
2. 确认修复仍在批准的文件和语义内。
3. 做最小修复。
4. 重跑精确测试。
5. 重跑受影响的阶段测试。
6. 最终重跑全量门禁。
7. 在 Summary 如实记录失败和修正。

不得通过吞掉 fs 错误、接受坏行、取消 sync、跳过 symlink 检查、放宽 Schema 或删除测试来修复。

### 16.2 必须修订 Task 的情况

- 需要新增、删除、合并或修改白名单外文件。
- 需要改变模块职责或公共导出名称，但仍不改变 Spec 行为。
- 需要调整任务顺序或测试组织。
- 发现测试辅助文件未列入白名单。

发生后立即停止开发，更新本 Task 为新修订并等待用户重新批准。

### 16.3 必须回到 Spec 的情况

- 需要改变磁盘布局、metadata 字段或 storage/protocol version。
- 需要改变换行提交、fsync、尾部修复或完整坏行规则。
- 需要多进程写入、数据库、索引文件或最近工作区状态文件。
- 需要持久化或恢复审批/执行 capability。
- 需要在 storage 中追加中断事件或验证完整 Agent 生命周期。
- 需要新增依赖、修改领域事件或扩大安全信任边界。

原 Task 审批随 Spec 修订失效。

### 16.4 回退策略

本阶段新增独立 `lib/storage` 和测试目录。若开发尚未生成真实用户数据，回退仅涉及本阶段新增文件；不得使用 `git reset --hard`、覆盖用户修改或删除真实 `.secode-data`。

测试 fixture 可由登记式 helper 清理。生产数据目录不纳入自动回退和测试清理。

## 17. 明确不执行的工作

- 不开发阶段 09 Agent 状态机或事件业务投影。
- 不自动追加 `run.interrupted`。
- 不开发上下文压缩。
- 不开发终端命令和交互。
- 不开发 Next.js Route Handler、Server Action 或 NDJSON。
- 不开发 Web UI 或 Playwright 产品流程。
- 不修改模型、工具、工作区或审批实现。
- 不实现跨进程锁、SQLite、日志索引、轮转、压缩或迁移。
- 不自动清理真实数据根或残留未知目录。
- 不保存实时 delta、私有推理、环境变量或授权能力。
- 不安装、升级或删除依赖。
- 不执行 Git commit、push、rebase、reset、发布或部署。

## 18. 实施完成定义

阶段 08 开发完成必须同时满足：

- [ ] T08-00 至 T08-09 全部按顺序完成。
- [ ] 只修改白名单文件。
- [ ] 公共 API、常量、错误码和磁盘格式与本文一致。
- [ ] Session 创建原子可见，metadata 与 seq 1 一致。
- [ ] 同 Session 并发追加保持连续唯一 seq，并逐事件 sync。
- [ ] JSONL 任意 chunk 可重放，单行和分页有硬上限。
- [ ] 只有未换行最终尾部被截断，完整坏行失败关闭。
- [ ] open run 被报告但不执行、不授权、不自动追加事件。
- [ ] Session/最近工作区列表稳定且无第二事实文件。
- [ ] symlink、文件身份和错误秘密边界测试通过。
- [ ] 无 Agent 框架、新依赖或 Next.js/React 耦合。
- [ ] 精确测试、全量测试、lint、typecheck、build 和 diff check 通过。
- [ ] 所有失败与修正已写入 Summary。
- [ ] Summary 和索引已生成并停在用户审批点。

## 19. Task 内部检查

- [x] 已批准 Spec 的所有不可变决策已转成任务约束。
- [x] 公共类型、API、错误和文件格式已锁定。
- [x] 文件白名单完整列出生产、测试和文档产物。
- [x] 任务按依赖顺序排列，并有逐项最小验证。
- [x] 需求、实现和测试证据映射完整。
- [x] 失败处理、回退和重新审批条件明确。
- [x] 未创建生产代码、测试或 Summary。
- [x] 未修改依赖、配置或既有代码。

## 20. 审批记录

- 当前审批结果：用户已于 2026-08-27 批准。
- 本次批准已解锁：按 T08-00 至 T08-09 开发、验证并生成阶段 08 Summary。
- 用户要求修订时：只修订本 Task 和开发索引，修订后重新等待审批。
- 开发期间：只能修改本 Task 白名单内文件；任何越界需求必须按第 16 节重新审批。
