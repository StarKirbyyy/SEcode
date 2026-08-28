# 阶段 08：JSONL 事件存储 Spec

## 1. 文档状态与审批门禁

- 当前状态：已批准
- 观察日期：2026-08-27
- 前置阶段：阶段 07 Summary 已获用户批准
- 本轮允许产物：本 Spec 与开发索引状态
- 本轮禁止动作：不得创建 Task、业务代码、测试或 Summary

审批关系：

```text
阶段 07 Summary（已批准）
  → 阶段 08 只读观察（已完成）
  → 本 Spec（已批准）
  → 阶段 08 Task（已批准）
  → 实际开发与验证（已完成）
  → 阶段 08 Summary（待用户审批）
```

用户已批准本 Spec，仅解锁阶段 08 Task 文档编写，不直接授权实现。

## 2. 阶段目标

建立一个仅运行于服务端 Node.js 的本地 JSONL 事件仓库，使会话身份和全部持久事件在页面刷新或服务重启后仍可恢复，并为阶段 09 Agent 状态机提供唯一、可审计、只追加的事实来源。

本阶段完成以下闭环：

```text
规范化数据根目录
  → 原子创建会话
  → 为持久事件分配单调序号
  → 追加单行 JSON + 刷盘
  → 按序流式重放并校验
  → 修复不完整尾行
  → 报告未结束运行
```

本阶段只保证存储层的物理完整性、单事件结构和最小会话关联关系。模型回合、工具调用、审批以及运行终态的完整生命周期检查仍由阶段 09 状态机负责。

## 3. 覆盖需求与追踪

| 需求 ID | 本阶段解释 | 预期验收证据 |
| --- | --- | --- |
| FR-001 | 持久保存固定绑定工作区和模型配置的会话身份 | 会话创建、元数据一致性和列表测试 |
| FR-005 | 为终端和 UI 恢复完整持久事件时间线提供查询能力 | 重放、分页和事件顺序测试 |
| FR-006 | 审批请求与决定作为事实持久化，但不能恢复成执行授权 | 审批事实重放与无能力恢复测试 |
| FR-008 | 刷新或服务重启后恢复会话、事件和未结束运行线索 | 尾行恢复、重新实例化和 open run 测试 |
| FR-010 | 原始事件永久保留，后续上下文压缩不删除历史 | 只追加和完整重放测试 |
| NFR-002 | 公共输入、元数据和每条 JSONL 记录均使用 strict Zod Schema 校验 | Schema 拒绝与类型检查 |
| NFR-003 | 配置、I/O、损坏、序号和大小错误结构化且不使进程崩溃 | 错误映射和故障注入测试 |
| NFR-006 | 存储核心不依赖浏览器、React 或 Next.js，可在 Node 测试环境运行 | import 审查与 Node 单元测试 |
| NFR-008 | 格式、恢复规则、验证结果和偏差均留有阶段文档 | Spec、Task、Summary 和索引审计 |
| SEC-006 | 事件和错误不得持久化 API Key、环境变量或私有推理 | 事件边界、秘密扫描和错误输出测试 |
| SEC-008 | 说明本地文件权限和 JSONL 校验不是强 OS 沙箱或多租户隔离 | 文档与边界审查 |
| COM-001/003 | JSONL、序号、恢复和错误处理全部自行实现，不使用 Agent 框架 | 依赖与源码审查 |

## 4. 只读观察范围与方法

### 4.1 已阅读文档

- `docs/development/00-process.md`
- `docs/development/01-requirements.md`
- `docs/development/03-domain-protocol-spec.md`
- `docs/development/05-workspace-security-summary.md`
- `docs/development/07-risk-approval-spec.md`
- `docs/development/07-risk-approval-summary.md`

### 4.2 已检查代码与配置

- `lib/domain/event.ts`
- `lib/domain/model.ts`
- `lib/domain/core.ts`
- `lib/domain/json.ts`
- `lib/domain/index.ts`
- `lib/approval` 的公共边界
- `.gitignore`
- `.env.example`
- `package.json`
- 当前目录、Node.js 版本、操作系统和 Git 状态

### 4.3 观察方法

- 只执行文件读取、文本搜索、目录枚举、环境版本和 Git 状态检查。
- 未运行安装、格式化或会修改业务产物的命令。
- 未新增业务代码、测试、依赖或配置。
- 当前 Git 状态中的阶段 07 Summary 和开发索引修改是审批状态记录，本阶段不得覆盖其内容。

## 5. 观察事实与证据

### 5.1 领域协议已经具备持久化输入

当前 `DurableAgentEventSchema` 已定义 16 类持久事件，并统一包含：

- `protocolVersion: 1`
- `durable: true`
- UUID 格式的 `id` 和 `sessionId`
- 会话内正整数 `seq`
- 可选或按事件必需的 `runId`
- ISO 日期时间 `createdAt`
- 判别字段 `type` 和严格结构的 `data`

`assistant.delta` 是唯一实时事件，具有 `durable: false` 和 `streamSeq`，已明确不得写入 JSONL。最终完整文本由 `assistant.message` 持久化。

领域层只校验单条事件结构。阶段 03 已把 JSONL 文件布局、序号分配和恢复算法留给阶段 08，把跨事件业务生命周期留给阶段 08/09 协作完成。

### 5.2 会话模型已经固定身份语义

`SessionRecordSchema` 已包含：

- `id`
- `title`
- `workspacePath`
- `modelProfileId`
- `status`
- `createdAt`
- `updatedAt`

一个会话固定绑定一个规范化工作区和一个模型配置；切换工作区或模型必须创建新会话，不能原地改变旧会话身份。

阶段 05 已明确：持久化的工作区路径只是恢复输入，不是可执行的工作区能力。恢复后必须重新经过 workspace factory 才能产生带真实目录身份的内存句柄。

### 5.3 审批记录不是可恢复能力

阶段 07 已实现以下不可序列化能力：

- `PendingToolApproval`
- `AuthorizedLocalToolInvocation`
- 内部 prepared invocation

它们依赖内存私有状态和一次消费语义。JSONL 只能保存已有公共参数、有限工具结果、`approval.required` 和 `approval.resolved` 事实。

即使历史最后一条完整记录是 `approval.resolved` 且 `approved: true`，重启后也不得据此重新生成授权或执行工具。阶段 09 必须把该运行标为中断，再由用户明确继续。

### 5.4 当前没有事件仓库实现

仓库中尚不存在：

- 数据根目录解析器。
- Session 元数据文件格式。
- JSONL 追加与刷盘实现。
- 会话内序号分配器。
- 按事件 Schema 重放的读取器。
- 不完整尾行修复。
- 未结束运行恢复报告。
- 最近工作区持久化或派生逻辑。

`.gitignore` 已忽略 `/.secode-data/`；`.env.example` 已定义可选的 `SECODE_DATA_DIR=.secode-data`，说明默认本地状态目录与配置入口已经预留。

### 5.5 运行环境与框架边界

- 当前 Node.js 为 v24.15.0，平台为 Darwin arm64。
- `package.json` 的最低 Node.js 版本为 `>=20.9.0`。
- Node 原生 `fs/promises`、`FileHandle.sync()`、流和 `TextDecoder` 足以实现本阶段，无需新增依赖。
- 本阶段不新增 Route Handler，不导入 `next/*`，也不涉及动态路由 API。
- 后续阶段 13 只能调用本阶段公共仓库 API，不能在 HTTP 层另写一套 JSONL 或恢复逻辑。

## 6. 当前差距

与需求相比，当前缺少：

1. 稳定的数据根目录解析和服务器端配置边界。
2. 不暴露半创建状态的会话创建事务。
3. 与 `session.created` 一致的会话索引元数据。
4. 会话内从 1 开始、连续且并发安全的事件序号。
5. 每条事件写入后的强制刷盘。
6. 不把整个日志载入内存的流式 JSONL 重放。
7. 对协议版本、事件类型、ID、序号和会话关联的恢复校验。
8. 崩溃留下的不完整最终行识别与安全截断。
9. 正常完整行损坏与可恢复尾部损坏的明确区分。
10. 对未结束 run 的恢复报告。
11. 最近会话和最近工作区的可重复派生规则。
12. symlink、目录穿越、超大记录和秘密落盘的存储边界。
13. 稳定、可测试的结构化存储错误模型。

## 7. 范围

### 7.1 范围内

- `SECODE_DATA_DIR` 解析、默认值和目录初始化。
- Session 元数据 Schema 和磁盘布局。
- 原子创建会话及首条 `session.created` 事件。
- 持久事件 draft、信封生成、Schema 校验和 JSONL 追加。
- 会话内串行化、单调连续序号和事件 ID 唯一性。
- 文件同步、行大小限制和提交不确定性处理。
- 基于字节流的 JSONL 解析、分页和恢复报告。
- 不完整最终尾行的识别、截断和审计信息。
- 元数据与 `session.created` 的一致性校验。
- 未结束 run ID 检测，但不创建中断事件。
- 会话列表和最近工作区派生。
- 数据目录、Session 目录和文件的 symlink 防护与权限约束。
- Node 单元测试、故障注入和临时目录 fixture。

### 7.2 范围外

- Agent 决策循环、状态投影、事件业务顺序和终止条件；属于阶段 09。
- 自动追加 `run.interrupted`；由阶段 09 消费恢复报告后完成。
- 上下文 token 估算、摘要生成和投影压缩；属于阶段 10。
- 终端命令、交互式审批和人工恢复入口；属于阶段 11。
- HTTP、NDJSON、SSE、Server Action 或 Route Handler；属于阶段 13。
- 会话列表页面、时间线、审批卡片和浏览器恢复；属于阶段 14。
- 跨进程锁、多实例共享一个数据目录、网络文件系统协调。
- 数据库、日志轮转、压缩、归档、事件删除和协议迁移工具。
- 对 JSONL 文件进行手工编辑后的自动猜测修复。
- 恢复工作区句柄、prepared invocation、待审批对象或执行授权。
- 保存实时 `assistant.delta`、模型私有 reasoning 或请求 Authorization 头。
- 新增第三方依赖。

## 8. 设计原则

1. **事件是唯一过程事实**：运行状态和更新时间从事件投影，不能维护第二套可漂移状态。
2. **只追加不改写历史**：除截断崩溃产生的不完整最终字节外，不修改、排序、删除或覆盖既有事件。
3. **仓库拥有信封**：调用方提交事件语义，仓库统一生成 ID、序号、会话 ID 和时间，避免伪造物理顺序。
4. **完整行才是记录**：只有以换行结束且通过 Schema 的 JSON 对象才是已提交记录。
5. **每次追加刷盘**：事件返回成功前必须完成文件同步；不能只依赖进程缓冲。
6. **恢复失败关闭**：中间损坏、完整坏行、序号缺口或身份冲突不能被静默跳过。
7. **能力不持久化**：事件记录过去事实，绝不恢复成未来执行权限。
8. **流式与有界**：按字节解析、限制单行大小和单页数量，避免大日志造成无界内存。
9. **单进程一致性**：首版明确支持一个本地 Node 进程；进程内串行化，不伪装成跨进程事务系统。
10. **核心框架无关**：存储层只依赖 Node.js、Zod 和领域层。

## 9. 数据根目录规格

### 9.1 配置解析

数据根目录按以下优先级解析：

1. 显式传入 store factory 的 `dataDir`，仅供组合和测试注入。
2. 服务端环境变量 `SECODE_DATA_DIR`。
3. 默认值 `<process.cwd()>/.secode-data`。

规则：

- 空字符串、纯空白或包含 NUL 的值无效。
- 绝对路径直接规范化。
- 相对路径以创建 store 时捕获的应用 `cwd` 为基准，不随之后的 `process.chdir()` 漂移。
- 初始化后用真实路径固定数据根身份。
- 已存在但不是目录的路径必须失败。
- 数据根可以是用户显式配置的 symlink 路径，但 factory 只保存其一次性解析后的真实路径；其内部固定目录和文件不允许是 symlink。
- 配置只在服务端读取，公共错误不回显环境变量值。

### 9.2 目录布局

首版固定布局：

```text
<dataRoot>/
  sessions/
    <session UUID>/
      session.json
      events.jsonl
```

约束：

- Session 目录名必须是规范 UUID，由 store 生成，不接受调用方路径。
- 不创建独立 `recent-workspaces.json`；最近工作区从 Session 元数据派生。
- 不创建可变的 `status.json`；当前状态从事件投影。
- 创建事务可在 `sessions/` 下使用严格命名的临时目录，但临时目录不参与列表和恢复。
- 首版初始化只忽略残留临时目录，不自动删除未知磁盘内容，避免扩大破坏范围。

### 9.3 权限

在平台支持 POSIX mode 时：

- 新建数据根、`sessions` 和 Session 目录使用 `0700`。
- `session.json` 和 `events.jsonl` 使用 `0600`。
- 已存在对象仍需通过类型和 symlink 检查；本阶段不擅自修改用户已有权限。
- mode 不是安全沙箱，其他高权限本机进程仍可读写文件。

## 10. Session 元数据规格

### 10.1 磁盘格式

`session.json` 使用 strict Schema：

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

元数据只保存不可变身份和列表所需索引。`status` 与 `updatedAt` 不在元数据中重复维护。

会话首次创建时对应的 `SessionRecord` 固定为：

- `status: "idle"`
- `createdAt === updatedAt`
- 其 `id`、`title`、`workspacePath`、`modelProfileId`、`createdAt` 与元数据完全一致

### 10.2 创建输入

创建输入使用 strict Schema，包含：

- `title`
- 已由工作区层规范化的绝对 `workspacePath`
- `modelProfileId`

store 负责生成 Session UUID 和 ISO 时间。存储层只验证路径是满足领域长度约束的绝对路径，不重新承担阶段 05 的工作区存在性和 realpath 身份验证；上层必须先通过 workspace factory。

### 10.3 原子创建

创建顺序固定为：

1. 在 `sessions/` 下创建不可见于正常枚举的严格临时目录。
2. 写入并同步 `session.json`。
3. 构造 `seq: 1` 的 `session.created`，写入并同步 `events.jsonl`。
4. 关闭文件句柄。
5. 原子重命名临时目录为最终 Session UUID。
6. 在平台支持时同步父目录。

只有最终目录重命名成功后，会话才对列表可见。目标 UUID 已存在时失败，不覆盖。

如果失败发生在最终重命名前，临时目录可以残留但不会被读取。如果失败发生在重命名之后且父目录同步结果不确定，store 必须重新检查最终目录并返回明确的提交结果或结构化的提交不确定错误，不能盲目创建第二个会话。

### 10.4 元数据一致性

加载会话时必须验证：

- 元数据通过 Schema。
- Session 目录名等于元数据 `id`。
- 第一条事件必须是唯一的 `session.created`。
- 第一条事件 `seq === 1` 且无 `runId`。
- 事件中的初始 SessionRecord 与元数据身份字段严格一致。
- 初始 `status` 为 `idle`，初始 `createdAt === updatedAt`。

任何不一致都是损坏，不选择“看起来更新”的一方覆盖另一方。

## 11. 持久事件追加规格

### 11.1 事件 draft

公共追加输入从 `DurableAgentEvent` 判别联合派生，移除仓库拥有的字段：

```text
protocolVersion
durable
id
seq
sessionId
createdAt
```

保留每种事件原有的 `type`、`data` 和 `runId` 必需性。调用方不能提交 `LiveAgentEvent`，也不能提交 `session.created`；首条事件只能由 `createSession` 内部生成。

最终类型必须是分布式联合，不能把 `Omit<union>` 错误收缩成丢失判别关系的宽对象。

### 11.2 信封生成

在同一会话锁内，store：

1. 确认会话存在且文件身份安全。
2. 必要时重放日志并取得最后稳定序号。
3. 生成 UUID `id`。
4. 分配 `seq = lastSeq + 1`。
5. 固定 `sessionId` 为目标会话。
6. 生成 ISO `createdAt`。
7. 补充 `protocolVersion: 1` 和 `durable: true`。
8. 用 `DurableAgentEventSchema` 校验完整事件。
9. 序列化、追加并同步。
10. 返回最终不可变事件。

UUID 和时钟必须可注入，以便测试冲突、顺序和确定性。

### 11.3 JSONL 格式

- 编码固定为 UTF-8。
- 每条记录是 `JSON.stringify(event) + "\n"`。
- 一条持久事件严格占一行。
- 不使用 pretty-print，不写 BOM，不允许空白行。
- 实时事件永不写入。
- 单条序列化记录（包含换行）最大为 8 MiB UTF-8 字节。
- 超过上限在打开追加写入前拒绝。

8 MiB 足以覆盖当前最大 1,048,576 字符消息及 JSON 转义开销，同时为异常公共参数建立硬上限。该限制是存储边界，不替代工具输出和公共参数各自更小的领域限制。

### 11.4 刷盘和提交语义

每次追加必须：

1. 以 append 模式打开既有 `events.jsonl`。
2. 将完整 UTF-8 Buffer 作为一个逻辑记录写入。
3. 检查写入字节数。
4. 调用 `FileHandle.sync()`。
5. 关闭句柄后才向调用方返回成功。

如果写入或同步失败，缓存的 `lastSeq` 立即失效。store 不得在未知状态上继续分配序号；下一次操作前必须重新重放磁盘。

若当前调用无法证明该完整记录已同步，返回 `EVENT_COMMIT_UNCERTAIN`。调用方不得自动重试相同业务动作，必须先重新加载历史。阶段 09 将把无法安全续接的 run 中断，而不是重复执行工具。

### 11.5 进程内并发

- 每个 Session 使用独立 FIFO 异步互斥队列。
- 同一 Session 的恢复、序号分配和追加完全串行。
- 不同 Session 可以并行。
- Session 创建和目录枚举使用必要的短期根目录互斥。
- 锁等待不得持有打开的事件文件句柄。
- 锁条目在无排队任务后可释放，不能无限累积。

首版不支持两个 Node 进程同时写同一 `SECODE_DATA_DIR`。文档和启动组合层必须声明该限制；不实现不可靠的伪跨进程锁。

## 12. 重放与查询规格

### 12.1 流式解析

读取 `events.jsonl` 时按字节 chunk 增量解析：

- 使用增量 UTF-8 解码，正确处理多字节字符跨 chunk。
- 仅以字节 `0x0A` 识别记录边界。
- 允许 JSON 内容中的转义 `\n`，因为它不会产生真实换行字节。
- 跟踪每行起始和结束字节偏移。
- 在找到换行前执行 8 MiB 上限，防止无界缓冲。
- 不使用一次性 `readFile()` 加载完整事件日志。

测试必须能注入极小 chunk 大小，以覆盖任意边界，而不是依赖操作系统恰好分块。

### 12.2 物理与结构校验

每条完整记录必须满足：

1. 非空且是单个 JSON 对象。
2. 通过 `DurableAgentEventSchema`。
3. `durable === true`，不能混入 `assistant.delta`。
4. `sessionId` 等于当前 Session。
5. `seq` 从 1 开始且与上一条严格连续。
6. 事件 `id` 在当前 Session 内唯一。
7. 第一条且只有第一条为 `session.created`。
8. `protocolVersion` 是当前支持的版本 1。

任何已换行的坏记录、空行、序号缺口、倒序、重复、错误会话、重复事件 ID 或未知协议版本均为不可自动修复的日志损坏。

### 12.3 业务生命周期边界

存储层不负责拒绝下列语义问题：

- 同一个 run 出现两个终态。
- `tool.result` 没有对应 `tool.requested`。
- `model.completed` 没有对应 iteration。
- `approval.resolved` 没有待处理的审批。
- 成功 run 没有 final assistant message。

这些都需要阶段 09 的状态投影和生命周期验证。阶段 08 只提供严格、有序、未丢行的输入，避免在底层复制状态机。

### 12.4 分页读取

读取参数使用 strict Schema：

- `afterSeq`：非负整数，默认 0，语义为只返回 `seq > afterSeq`。
- `limit`：正整数，默认 500，最大 1000。

结果至少包含：

```ts
interface EventPage {
  events: readonly DurableAgentEvent[];
  lastSeq: number;
  hasMore: boolean;
  recovery: SessionRecoveryReport;
}
```

`lastSeq` 是日志最后稳定序号，不是当前页最后一项；空日志不是合法 Session。为了验证尾部和恢复状态，首版查询仍完整流过日志，但只保留请求页和有限恢复索引，不把全部事件常驻内存。后续如需大型日志索引必须另开阶段规格。

### 12.5 会话列表和最近工作区

会话列表：

- 只枚举名称为 UUID 的直接子目录。
- 忽略临时目录和无关文件，但拒绝把 symlink UUID 目录当作 Session。
- 读取并校验元数据。
- 按 `createdAt` 降序、`id` 作为稳定次级排序。

最近工作区：

- 从有效 Session 元数据派生。
- 按最近创建的 Session 排序。
- 对完全相同的规范化 `workspacePath` 去重。
- 默认最多返回 20 项，公共 limit 最大 100。
- 不在本阶段重新验证目录当前是否存在；后续选择时必须再次经过 workspace factory。

## 13. 尾行损坏与恢复规格

### 13.1 可自动修复的唯一情况

只有文件末尾存在未以换行结束的字节时，才视为崩溃产生的不完整最终尾行。无论这些字节能否恰好解析为 JSON，都不是已提交记录，必须忽略。

恢复器记录最后一个有效换行之后的字节数，并把文件截断到最后稳定偏移，然后调用 `sync()`。恢复报告包含：

- `tailRepaired: boolean`
- `discardedTailBytes: number`
- `lastStableSeq: number`

被丢弃的尾部不会被解释、补换行或尝试合并。

### 13.2 不可自动修复的情况

以下情况必须失败，且不得跳过坏行继续：

- 任意已换行记录不是合法 JSON。
- 中间出现空行或超大行。
- 中间记录通过 JSON 但不通过事件 Schema。
- 序号不连续、重复或倒序。
- Session ID、事件 ID、协议版本或首事件不变量冲突。
- `session.json` 损坏或与首事件不一致。
- `events.jsonl` 为空或不存在。

损坏错误可以包含 Session ID、行号、字节偏移和错误码，但不得包含整条原始事件、秘密值或未经脱敏的大段内容。

### 13.3 未结束运行报告

重放过程中收集：

- 每个 `run.started` 的 `runId`。
- 每个 `run.completed`、`run.failed`、`run.cancelled`、`run.interrupted` 的 `runId`。

`openRunIds` 为已开始但未观察到任何终态事件的 run，按首次出现顺序返回。

存储层不自行追加 `run.interrupted`。阶段 09 在启动或会话加载时消费该报告，并在接受新任务前为 open run 追加中断事实。这样可以让中断事件经过同一状态机不变量，而不是在 I/O 层猜测业务状态。

如果不完整尾部原本属于审批允许、工具开始或工具结果，它被丢弃后只会使 run 保持 open。恢复绝不能据此重放工具或重建授权。

## 14. symlink 与文件身份安全

每次创建、读取、截断或追加前必须验证：

- `sessions` 是数据根内的真实目录且不是 symlink。
- Session UUID 目录是直接子目录且不是 symlink。
- `session.json` 和 `events.jsonl` 是普通文件且不是 symlink。
- realpath 仍位于已固定的数据根和 `sessions` 根内。

不得：

- 把 Session ID 拼成未经校验的任意路径。
- 跟随 Session 内部 symlink 读取或写入外部文件。
- 在验证失败时自动覆盖或删除可疑对象。
- 复用阶段 05 的 workspace handle 作为数据目录能力；两者是不同信任边界。

这些检查减少误配置和本地路径替换风险，但无法消除具有同一用户权限的恶意进程在检查后替换文件的 TOCTOU 风险。产品仍只面向可信本地单用户。

## 15. 公共 API 行为

建议新增 `lib/storage`，公共能力按职责组织：

```text
lib/storage/
  types.ts        存储输入、结果、恢复报告和常量
  schemas.ts      配置、元数据和查询 strict Schema
  errors.ts       稳定错误码与安全错误详情
  config.ts       数据根解析和初始化
  jsonl.ts        有界流式解析、序列化和尾行恢复
  mutex.ts        进程内按 Session 串行化
  event-store.ts  Session 创建、追加、读取和列表
  index.ts        受控公共导出
```

公共 store 行为建议为：

```ts
createJsonlEventStore(options?)
store.initialize()
store.createSession(input)
store.getSessionMetadata(sessionId)
store.listSessions(options?)
store.listRecentWorkspaces(options?)
store.appendEvent(sessionId, eventDraft)
store.readEvents(sessionId, query?)
store.inspectSession(sessionId)
```

约束：

- factory 本身不产生磁盘写入；`initialize()` 显式创建根布局。
- 所有公共输入先通过 strict Schema。
- 初始化具有幂等性，但发现类型或 symlink 冲突时失败。
- 返回的对象和事件只读或冻结，调用方修改不能污染内部缓存。
- `inspectSession` 返回元数据、最后稳定序号和恢复报告，不返回可执行能力。
- 精确函数名可在 Task 中按既有命名规范微调，但不得改变本 Spec 的数据格式、提交语义和安全边界。

## 16. 错误模型

新增 `EventStoreError`，内部携带既有 `ErrorInfo` 兼容结构：

```ts
interface ErrorInfo {
  code: string;
  message: string;
  recoverable: boolean;
  details?: JsonObject;
}
```

稳定错误码至少包括：

| 错误码 | 场景 | recoverable |
| --- | --- | --- |
| `EVENT_STORE_CONFIG_INVALID` | 数据目录配置非法 | false |
| `EVENT_STORE_NOT_INITIALIZED` | 初始化前调用磁盘能力 | true |
| `EVENT_STORE_IO_ERROR` | 可明确判定未提交的普通 I/O 失败 | true |
| `EVENT_COMMIT_UNCERTAIN` | 写入或同步后无法证明提交状态 | false |
| `EVENT_STORE_SYMLINK_DENIED` | 固定目录或文件是 symlink | false |
| `EVENT_STORE_PATH_CONFLICT` | 应为目录/文件的位置类型冲突 | false |
| `SESSION_ALREADY_EXISTS` | 最终 UUID 目录已存在 | false |
| `SESSION_NOT_FOUND` | Session 不存在 | true |
| `SESSION_METADATA_CORRUPT` | 元数据 Schema 或身份不一致 | false |
| `SESSION_ID_MISMATCH` | 目录、元数据或事件 Session ID 冲突 | false |
| `EVENT_LOG_CORRUPT` | 已提交完整行或物理不变量损坏 | false |
| `EVENT_TOO_LARGE` | 单行超过 8 MiB | true |
| `EVENT_SEQUENCE_CONFLICT` | 序号不连续、重复或倒序 | false |
| `EVENT_ID_DUPLICATE` | Session 内事件 ID 重复 | false |
| `EVENT_TYPE_FORBIDDEN` | 实时事件或外部 session.created 被提交 | true |
| `EVENT_SESSION_MISMATCH` | 输入或记录关联到错误 Session | false |

要求：

- 未识别的 `errno` 映射为有限 `EVENT_STORE_IO_ERROR`，不能把原始堆栈作为公共 message。
- details 只允许稳定字段，如 `sessionId`、`line`、`byteOffset`、`expectedSeq`、`actualSeq`。
- 不回显完整事件、文件内容、API Key、环境变量值或任意内部对象。
- 编程错误与结构化运行时错误要区分；公共调用不能因坏 JSON 直接使服务器崩溃。

## 17. 数据最小化与秘密边界

允许持久化：

- Session 的规范工作区路径和模型 profile ID。
- 用户消息和最终 assistant 消息。
- 已脱敏、有限的 `publicArguments`。
- 有 64 KiB 上限的 `ToolResult`。
- 审批原因、决定、运行状态和上下文摘要。

禁止持久化：

- API Key、Authorization、Cookie 和完整 `process.env`。
- 模型私有 reasoning/thinking。
- prepared invocation 的私有原始参数。
- 完整待写文件内容，除非它本身是用户消息或已有协议明确允许的数据。
- `PendingToolApproval` 或 `AuthorizedLocalToolInvocation`。
- AbortController、文件句柄、WorkspaceHandle 或函数对象。

存储层不重新实现通用秘密识别器；它只接受领域 Schema 的持久事件，并通过行大小和有限错误输出收紧边界。事件生产方的脱敏责任仍在领域、工具、审批和阶段 09 状态机。

## 18. 测试规格

所有测试使用 `mkdtemp` 创建带专用前缀的临时数据根，不触碰真实用户项目或默认 `.secode-data`。清理只针对测试自己持有的精确目录。

### 18.1 配置与初始化

- 无配置时相对当前应用 cwd 解析默认目录。
- 相对和绝对 `SECODE_DATA_DIR` 正确解析。
- 创建 store 后改变 cwd 不影响已固定路径。
- 空白、NUL、已有普通文件和内部 symlink 被拒绝。
- 初始化幂等，目录和文件 mode 在支持的平台正确。
- 环境配置值不进入错误内容。

### 18.2 Session 创建

- 生成合法 UUID、时间和 `storageVersion: 1` 元数据。
- 首条事件是匹配元数据的 `session.created`，`seq: 1`。
- `status: idle` 且两个初始时间相等。
- 创建完成前 Session 不可见，重命名后可见。
- 目标冲突不覆盖。
- 模拟每个写入、同步和重命名故障，验证没有可见半 Session。
- 残留严格临时目录被忽略而不被任意删除。

### 18.3 追加和并发

- 每种允许的持久事件 draft 生成合法信封。
- 外部 `session.created` 和实时事件被拒绝。
- `Promise.all` 并发追加仍产生连续唯一序号和完整行。
- 不同 Session 可独立追加。
- UUID 冲突通过可注入生成器被检测。
- 单行恰好到上限允许，超过 8 MiB 在写入前拒绝。
- 每次成功追加都调用同步；失败使序号缓存失效。
- 提交不确定后不能在缓存状态上继续追加。

### 18.4 流式重放和分页

- 一字节 chunk、随机 chunk 和 UTF-8 多字节跨 chunk 均正确解析。
- JSON 转义换行不被误分行。
- `afterSeq`、默认 limit、最大 limit、空页和 `hasMore` 正确。
- 大量事件只保留当前页，不整体常驻内存。
- 重放返回冻结或不可变结果。

### 18.5 损坏与尾部恢复

- 未换行的半截 JSON 被截断并报告字节数。
- 未换行但恰好可解析的完整 JSON 仍被截断。
- 正常完整最后一行不被改写。
- 已换行坏 JSON、中间坏行、空行、超大行均失败。
- seq 缺口、重复、倒序、重复事件 ID 和错误 Session 失败。
- 未知协议、实时事件和重复 `session.created` 失败。
- 元数据损坏、目录 ID 不符和首事件身份不符失败。
- 截断后同步失败返回提交不确定或 I/O 错误，不伪报恢复成功。

### 18.6 恢复与安全

- `run.started` 无终态时进入 `openRunIds`。
- 四类终态均关闭对应 run。
- 多个 open run 按首次出现顺序报告。
- 审批批准事实可重放，但 API 不返回任何授权能力。
- 不完整批准/工具事件尾部被丢弃后不执行任何动作。
- Session 目录、元数据文件和事件文件 symlink 均拒绝。
- 最近工作区按创建时间去重并受 limit 限制。
- 错误和测试输出不包含伪造 API Key 或完整敏感事件。

### 18.7 阶段整体验证

实现阶段最终至少执行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

同时执行针对以下边界的源码扫描：

- `lib/storage` 不导入 `next/*`、React 或浏览器 API。
- 不新增 Agent 框架或数据库依赖。
- 不持久化 `assistant.delta`、private reasoning、pending approval 或 authorization。
- 不使用整文件 `readFile(events.jsonl)` 实现事件重放。

## 19. 可测试验收标准

- [ ] 默认和自定义数据根目录按本 Spec 解析，且内部 symlink 被拒绝。
- [ ] Session 创建对读取方原子可见，元数据和 `session.created` 完全一致。
- [ ] 每个 Session 的持久事件从 1 开始连续递增，进程内并发追加不重号、不丢行。
- [ ] 每次成功追加在返回前完成文件同步。
- [ ] JSONL 可按任意字节 chunk 流式重放，单页和单行均有硬上限。
- [ ] 仅未换行最终尾部可自动截断；任何完整坏行均失败关闭。
- [ ] 重放严格校验协议、事件 Schema、序号、事件 ID、Session ID 和首事件。
- [ ] 恢复报告能识别 open run，但不自行追加中断事件或执行动作。
- [ ] 批准历史不能恢复为待审批对象或一次性执行授权。
- [ ] 最近工作区从 Session 元数据派生，没有第二份可漂移事实文件。
- [ ] 所有存储错误结构化、有限且不泄露秘密或原始事件内容。
- [ ] `lib/storage` 可在 Node 环境独立测试，不依赖 Next.js、React 或浏览器。
- [ ] 不新增第三方依赖，不修改阶段 03 事件协议版本或字段。
- [ ] 阶段整体验证全部通过，真实失败与修正写入 Summary。

## 20. 风险、权衡与已拒绝方案

### 20.1 每条事件同步的性能

每次 `sync()` 会降低吞吐，但本地单用户 Agent 的事件频率远低于日志采集系统。这里优先保证工具执行和审批事实在崩溃后的可解释性。若未来需要批量提交，必须重新规格化耐久性语义。

### 20.2 单进程限制

进程内 mutex 无法协调两个 Next.js 进程。首版开发和演示只运行一个本地服务，明确限制比实现易失效的锁文件更安全。多实例或网络文件系统属于后续架构变更。

### 20.3 元数据重复身份

`session.json` 与首条事件存在有限身份重复。保留元数据是为了无需扫描全部日志即可列会话；加载时严格比对，任何漂移均报损坏，不把两者视为双重真相。

### 20.4 完整尾行也要求换行

即使崩溃留下的最终字节能解析成完整 JSON，没有换行仍不能证明记录按约定完成，因此丢弃。这给提交边界一个确定规则，避免启发式猜测。

### 20.5 不在存储层验证完整 Agent 生命周期

把工具、模型和审批状态机复制进 JSONL reader 会造成两套规则漂移。阶段 08 验证物理与最小身份不变量，阶段 09 基于同一事件流验证业务生命周期。

### 20.6 已拒绝方案

1. **每次读取整个 JSONL**：拒绝；日志增长后造成无界内存，且难以正确处理超大尾行。
2. **无换行但 JSON 可解析就接受**：拒绝；提交完成边界不确定。
3. **跳过坏行继续恢复**：拒绝；会制造虚假的连续历史和危险重放条件。
4. **持久化 nextSeq/status 文件**：拒绝；形成第二套可漂移事实，崩溃时还需额外事务。
5. **保存 pending/authorization 以便重启继续**：拒绝；批准事实不是执行能力，可能重放危险操作。
6. **SQLite 或第三方日志库**：拒绝；超出用户指定 JSONL 和自研核心要求，也非首版必要。
7. **自动删除所有未知临时目录**：拒绝；破坏范围不清晰，首版只忽略严格临时命名。
8. **宣称文件 mode 和 realpath 是强沙箱**：拒绝；同用户进程和批准的命令仍可产生外部副作用。

## 21. 假设与兼容性

- 应用以可信本地单用户、单 Node.js 进程运行。
- 数据目录位于支持普通文件追加、重命名和文件同步语义的本地文件系统。
- Node.js 最低版本继续为 `>=20.9.0`。
- Windows 可运行核心逻辑，但目录同步和 POSIX mode 按平台能力降级；文件内容与 Schema 语义不降级。
- 首版只读写 `storageVersion: 1` 和 `protocolVersion: 1`，不猜测迁移未知版本。
- 工作区路径可以本地持久化；它属于用户明确选择的本地状态。
- 原始事件不自动删除。磁盘容量管理暂由用户负责，并在最终 README 声明。
- 后续阶段不得绕过 store 直接写 `events.jsonl`。

## 22. 对后续阶段的接口约束

### 阶段 09：Agent 状态机

- 只能通过 event store 创建和追加持久事实。
- 必须消费 `openRunIds`，在接受新任务前追加 `run.interrupted`。
- 必须验证模型、工具、审批和运行终态的跨事件生命周期。
- 不得从 `approval.resolved` 重建授权；继续任务必须重新决策。

### 阶段 10：上下文管理

- 原始 JSONL 永不因压缩删除或改写。
- `context.compacted` 只是新的追加事实。
- 上下文投影使用分页/流式事件 API，不另建隐藏历史。

### 阶段 11：终端入口

- 终端从 store 恢复会话和事件，不自行解析 JSONL。
- 所有新增用户任务和审批决定仍通过状态机追加。

### 阶段 13：Next.js API

- Route Handler 运行于 Node.js Runtime，并复用单例 store 组合实例。
- HTTP 输入只映射为公共 store/Agent API，不暴露数据根真实文件接口。
- NDJSON 实时流不改变持久事件提交语义。

### 阶段 14：UI

- UI 只根据事件重建历史，不能维护第二套权威状态。
- 页面刷新按 `afterSeq` 增量恢复，不能读取本机 JSONL 文件路径。

## 23. 待用户确认的规格决策

批准本 Spec 即表示确认：

1. 数据布局固定为每 Session 一个 `session.json` 和一个 `events.jsonl`。
2. `session.json` 只保存不可变身份；状态和更新时间由事件投影。
3. 最近工作区从 Session 元数据派生，不创建独立状态文件。
4. 每条事件返回成功前都执行文件同步。
5. 单条 JSONL 记录上限为 8 MiB，查询默认 500、最大 1000 条。
6. 只有未换行的最终尾部可自动截断，完整坏行一律失败。
7. 存储层报告 open run，阶段 09 才追加 `run.interrupted`。
8. 首版只支持一个 Node.js 进程写同一数据目录。
9. 审批历史永远不能恢复成可执行授权。
10. 本阶段不新增依赖、不修改现有领域事件协议。

## 24. Spec 内部检查

- [x] 前置阶段 Summary 已获用户批准。
- [x] 本阶段只进行了只读观察。
- [x] 目标、范围、边界和需求追踪已明确。
- [x] 数据布局、格式、提交和恢复语义已明确。
- [x] 公共行为、错误模型和安全约束已明确。
- [x] 测试与验收标准可执行。
- [x] 未创建 Task、实现、测试或 Summary。
- [x] 未修改依赖、配置或阶段 03 事件协议。

## 25. 审批记录

- 当前审批结果：用户已于 2026-08-27 批准。
- 本次批准已解锁：仅允许生成 `08-jsonl-event-store-tasks.md`。
- 用户要求修订时：只修订本 Spec 和开发索引，修订后重新等待审批。
- 当前后续门禁：阶段 08 开发已按批准 Task 完成；Summary 未获批准前不得开始阶段 09。
