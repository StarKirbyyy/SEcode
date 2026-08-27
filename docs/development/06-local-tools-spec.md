# 阶段 06 Spec：本地工具系统

## 1. 文档状态与阶段门禁

- 当前状态：已批准。
- 观察日期：2026-08-27（Asia/Shanghai）。
- 前置阶段：[05-workspace-security-summary.md](./05-workspace-security-summary.md) 已获用户批准。
- 当前子阶段：只读观察与 Spec。
- 本文获批前不得生成 `06-local-tools-tasks.md`，不得创建 `lib/tools`、工具测试或后续阶段代码。
- 本文获批后只解锁 Task 文档；Task 再获批准后才允许开发。

阶段 05 Summary 审批记录：

- 2026-08-27：用户明确回复“批准”。
- 解锁范围：阶段 06 只读观察与本 Spec，不包含 Task、实现、依赖变更或真实项目试运行。

## 2. 阶段目标

建立一个纯 Node.js、模型提供方无关、可由终端和 Next.js 服务端复用的本地工具系统。系统提供六个固定工具：

1. `list_directory`
2. `read_file`
3. `search_text`
4. `write_file`
5. `replace_in_file`
6. `run_process`

本阶段负责工具参数 Schema、模型可见定义、调用准备、公开参数投影、文件与进程执行、结构化结果、输出限制、取消传播和测试注入边界。它不负责模型循环、事件写入、风险分类或用户审批。

完成后，后续模块应能按以下固定顺序使用工具层：

```text
模型 ToolCall
  → prepareLocalToolCall（未知工具/参数校验/公开投影）
  → 阶段 07 风险判断与审批
  → executePreparedLocalTool（实际执行）
  → ToolResult
```

## 3. 覆盖需求

| 需求 ID | 本阶段覆盖内容 | 最终证据类型 |
| --- | --- | --- |
| FR-003 | 六个结构化本地工具及统一注册表 | 工具单元测试 |
| FR-004 | 提供 Agent 循环可调用的准备与执行边界 | 注册表/调用契约测试 |
| FR-005 | 产生可展示的摘要、输出、metadata 和结构化错误 | 结果快照与 Schema 测试 |
| FR-007 | 文件遍历、搜索和进程执行接收 `AbortSignal` | 取消测试 |
| NFR-002 | 所有工具调用参数通过 strict Zod Schema | 非法参数矩阵 |
| NFR-003 | 预期失败转换为 `ToolResult`，未知异常有限化 | 错误与泄露测试 |
| NFR-005 | 所有公开输出不超过 64 KiB，并明确截断 | UTF-8 边界测试 |
| NFR-006 | 不依赖 React、浏览器、Next.js 或 Agent | Node Vitest 与依赖扫描 |
| NFR-008 | 设计、验证与偏差形成阶段文档 | Spec/Task/Summary |
| SEC-001 | 所有 path/cwd 通过 `@/lib/workspace` | 越界路径测试 |
| SEC-002 | 遍历、搜索、读写不绕过真实路径与 symlink 规则 | symlink 测试 |
| SEC-003 | 进程使用 `spawn(program, args)`，固定 `shell: false` | 代码审查与进程测试 |
| SEC-006 | 公共参数、输出、错误和子进程环境不暴露应用 API Key | 脱敏与环境测试 |
| SEC-007 | 覆盖前校验读取时 SHA-256，变更采用同目录原子 rename | 陈旧写与竞态测试 |
| SEC-008 | 明确工具层不是操作系统沙箱 | 文档和限制检查 |
| COM-001/002/003 | 工具、搜索和进程执行全部自行实现，不用 Agent/托管工具框架 | 依赖与源码审查 |

## 4. 观察范围与方法

本次只读观察包括：

- 复核 `00-process.md`、阶段 01 需求、阶段 03 领域协议和阶段 05 工作区安全契约。
- 阅读 `lib/domain` 的 `ToolCall`、`ToolDefinition`、`ToolResult`、事件与脱敏实现。
- 阅读 `lib/workspace` 公共 barrel、类型和边界实现。
- 检查 `lib`、`tests`、`app` 文件结构和当前依赖。
- 检查 Node、pnpm、ripgrep、Git、Vitest、TypeScript 和工作区状态。
- 阅读本地 `@types/node` 的 `child_process.spawn` signal、timeout 和 killSignal 定义。
- 检查当前 Zod 4.4.3 的 `toJSONSchema` 能力。
- 执行 `git diff --check`；未运行会修改受版本控制文件的命令。

观察阶段没有：

- 创建工具源码或测试。
- 安装、删除或升级依赖。
- 读取、修改或执行真实用户项目。
- 启动 Agent、终端入口、Next.js 开发服务器或浏览器。
- 生成阶段 06 Task/Summary。

## 5. 事实证据

### 5.1 当前代码与协议

| 事实 | 证据 | 对设计的影响 |
| --- | --- | --- |
| 当前没有 `lib/tools` 或工具测试 | `rg --files lib tests app` | 六工具实现是本阶段新增边界 |
| `ToolResult.output` 已限制为 64 KiB UTF-8 | `lib/domain/core.ts` | 工具层必须在构造结果前完成有限化 |
| `ToolResult` 成功不能有 error，失败必须有 error | `ToolResultSchema` | 所有执行结果最终再经领域 Schema 校验 |
| 工具名与模型 ToolCall 已有统一 Schema | `lib/domain/tool.ts` | 不修改阶段 03 公共命名协议 |
| 工具 definitions 会直接传入模型请求 | `lib/model/chat-mapper.ts` | 参数 JSON Schema 必须稳定且不含执行私有字段 |
| `tool.requested` 只保存 `publicArguments` | `lib/domain/event.ts` | 原始写入内容不能直接进入事件 |
| 已有 UTF-8 长度、截断、秘密脱敏和公共参数辅助 | `lib/domain/core.ts`、`redaction.ts` | 复用现有基础能力，补充工具专用投影 |
| 工作区公共入口已提供 existing/writable/revalidate | `lib/workspace/index.ts` | 不复制路径、realpath 或 symlink 规则 |
| writable snapshot 是私有且不能伪造 | 阶段 05 实现与测试 | 写工具必须保留并在变更前复验原对象 |
| 仓库 TypeScript strict、Vitest Node 环境 | `tsconfig.json`、`vitest.config.mts` | 工具层可完全在 Node 单元测试中验证 |

### 5.2 运行环境

观察时环境：

```text
Node.js v24.15.0
pnpm 10.33.3
ripgrep 15.2.0
Darwin arm64
项目最低 Node.js >=20.9.0
Zod 4.4.3
```

本机存在 `rg`，但项目不能假设所有用户环境都安装它。实现必须兼容 `package.json` 声明的 Node 20.9 最低版本，不能只依赖观察机的 Node 24 行为。

### 5.3 已批准的硬约束

阶段 05 已锁定：

- 读取、目录、搜索必须使用 existing resolver。
- 写入与替换必须使用 writable resolver，并在最终变更前 revalidate。
- 工作区路径只使用规范相对路径；公开结果不泄露 absolutePath 或快照。
- 内部 symlink 可读，外部 symlink 拒绝，最终 symlink 一律不可写。
- 可写父目录必须已经存在。
- 路径身份与内容 SHA-256 是两种独立保护，覆盖时两者都必须验证。
- Node 标准 API 无法完全消除最终检查与 syscall 之间的恶意本机 TOCTOU。

阶段 03 已锁定：

- `ToolResult.output` 最大 64 KiB。
- `tool.requested` 使用工具专用的公开参数投影。
- 写入类参数不得持久化完整内容，应记录路径、字节数、哈希和有限预览。
- 工具错误必须结构化，事件不得包含 stack、API Key、Authorization 或完整环境变量。

## 6. 当前差距

目前模型层可以产生 `ToolCall`，工作区层可以安全解析路径，但二者之间没有执行系统。具体缺口为：

1. 没有六工具的 strict 参数 Schema 和模型 JSON Schema。
2. 没有工具名称到处理器的唯一注册表。
3. 没有未知工具和非法参数到 `ToolResult` 的转换。
4. 没有目录遍历深度、条目数、忽略项和 symlink 循环规则。
5. 没有文本/二进制识别、逐行读取、完整文件哈希和文件大小上限。
6. 没有 `rg` 参数化搜索、流式解析或 Node 回退实现。
7. 没有写入时 expected SHA-256、同目录临时文件、fsync、原子 rename 和残留清理。
8. 没有唯一文本替换和替换后大小检查。
9. 没有不经 shell 的 spawn、cwd 校验、输出合并、超时、取消和退出状态结果。
10. 没有写入内容的专用公开参数投影。
11. 没有可注入的 fs/search/process 测试边界。
12. 没有工具级稳定错误码、数据最小化规则和完整测试矩阵。

## 7. 范围内

- 六个工具的名称、描述、参数 Schema、推导类型和模型 definitions。
- 工具调用准备、严格校验、专用公开参数投影和统一执行分发。
- 目录列举、文本文件读取、固定字符串搜索、完整文件写入、唯一文本替换和直接进程执行。
- SHA-256、文本/二进制判断、UTF-8 头尾截断和安全 metadata。
- `rg` 可用时的参数化实现及不可用时的 Node 文件遍历回退。
- AbortSignal、进程超时、输出流 drain 和临时文件清理。
- 仅使用操作系统临时目录的单元/模块集成测试。
- 阶段文档、依赖扫描和整体验证。

## 8. 范围外

- 自动允许、需要审批、直接拒绝的风险分类；属于阶段 07。
- `sudo`、安装依赖、Git 写操作、shell 和未知程序的策略判断；属于阶段 07。
- Agent 迭代、工具串行调度、连续错误终止和最终消息；属于阶段 09。
- JSONL 事件追加与恢复；属于阶段 08。
- 上下文投影与压缩；属于阶段 10。
- 可交互终端命令；属于阶段 11。
- 真实项目 Agent 流程验收；属于阶段 12。
- Route Handler、NDJSON、Web UI 和 Playwright 产品 E2E；属于阶段 13/14。
- 删除文件、创建目录、patch/diff 工具、Git commit/push 或任意 shell 字符串工具。
- chmod、chown、ACL、容器、虚拟机、chroot 或强 OS 沙箱。
- 在 `rg` 缺失时自动安装它。

## 9. 设计原则

1. **准备与执行分离**：参数校验和公开投影先完成，风险审批后才调用实际执行。
2. **单一注册表**：工具名称、Zod Schema、definition、公开投影和 handler 不分散维护。
3. **路径边界复用**：任何 I/O 和 cwd 都先经过 `@/lib/workspace`，不自行拼接不可信路径。
4. **默认有限**：输入大小、深度、条目数、文件数、行数、参数数、运行时间和输出都有硬上限。
5. **文本优先**：首版文件内容工具只处理严格 UTF-8 文本，二进制与过大文件明确拒绝。
6. **原子变更**：文件变更写到同一真实父目录的独占临时文件，成功同步后 rename。
7. **不使用 shell**：进程始终 `spawn(program, args, { shell: false })`；工具参数不拼成命令字符串。
8. **取消是一等控制流**：用户取消不伪装成普通工具失败，向上抛出专用中止信号。
9. **公开数据最小化**：模型/事件只看到规范相对路径、有限内容、有限输出和必要 metadata。
10. **可注入、可验证**：生产默认依赖 Node 原生 API；测试可替换最小 fs、搜索与进程 adapter。

## 10. 建议模块边界

预计生产代码位于 `lib/tools`：

```text
lib/tools/
  types.ts              工具名、稳定错误、上下文、prepared union
  schemas.ts            六工具 strict Zod Schema 与模型 definitions
  output.ts             UTF-8 头尾截断、输出组合、公开 metadata
  file-content.ts       大小、严格 UTF-8、二进制判断、SHA-256
  list-directory.ts     目录工具
  read-file.ts          读取工具
  search-text.ts        rg 与 Node fallback
  write-file.ts         完整写入与原子更新
  replace-in-file.ts    唯一替换
  run-process.ts        spawn、timeout、cancel、stream capture
  registry.ts           prepare、公开投影、execute 分发
  index.ts              唯一公共 barrel
```

Task 可以在不改变公共接口和安全语义的前提下合并过小文件；若要拆出新的公共模块、改变工具参数或执行策略，必须回到 Spec 审批。

生产模块允许依赖：

- Node 标准库：`node:crypto`、`node:fs/promises`、`node:path`、`node:child_process` 等必要子集。
- `zod`。
- `@/lib/domain`。
- `@/lib/workspace`。

禁止依赖 Next.js、React、浏览器 API、模型 client、Agent、存储、终端 UI、Agent SDK 或第三方进程/文件工具库。

## 11. 公共调用契约

### 11.1 工具执行上下文

```ts
interface LocalToolExecutionContext {
  workspace: WorkspaceHandle;
  signal: AbortSignal;
}
```

执行上下文不接受绝对 cwd、环境变量、shell 开关、风险结论或日志对象。风险结论由阶段 07 控制是否调用执行函数，而不是作为模型可伪造参数。

### 11.2 准备结果

```ts
type PrepareLocalToolCallResult =
  | {
      ok: true;
      invocation: PreparedLocalToolInvocation;
      publicArguments: JsonObject;
      argumentsTruncated: boolean;
    }
  | {
      ok: false;
      result: ToolResult;
      publicArguments: JsonObject;
      argumentsTruncated: boolean;
    };
```

要求：

- `prepareLocalToolCall` 接收领域 `ToolCall`。
- 未知工具返回 `TOOL_UNKNOWN`，不抛出未处理异常。
- 参数使用对应 strict Zod Schema；extra key、错误类型、超限和交叉约束均拒绝。
- 无论准备成功失败，都生成有限、脱敏的公共参数，供 `tool.requested` 审计。
- `PreparedLocalToolInvocation` 是按工具名判别的内部联合，保留执行所需真实内容，但不得被事件持久化。

### 11.3 执行结果

```ts
function executePreparedLocalTool(
  context: LocalToolExecutionContext,
  invocation: PreparedLocalToolInvocation,
): Promise<ToolResult>;
```

不变量：

- 进入 handler 前再次确认 invocation 来自当前 registry 的准备结果，拒绝普通对象伪造。
- 所有普通成功/失败返回值最终通过 `ToolResultSchema.parse`。
- 工作区错误保留稳定 `WORKSPACE_*` ErrorInfo，但不公开 cause。
- 可预期的 fs、搜索、进程失败转换为稳定工具错误。
- 未知内部异常转换为 `TOOL_INTERNAL_ERROR`，不包含 stack、absolutePath 或原始 Node message。
- `AbortSignal` 已中止或执行中中止时抛出 `LocalToolExecutionAbortedError`，由阶段 09 转换为 run cancelled；不得返回可被模型重试的普通失败结果。
- handler 自身不并发执行其他工具；调用顺序由阶段 09 串行控制。

### 11.4 模型定义

- 工具 definitions 由同一 Zod 参数 Schema 使用 Zod 4 `toJSONSchema(..., { target: "draft-07" })` 生成。
- 生成物再通过阶段 03 `ToolDefinitionSchema`。
- 参数 Schema 不使用无法可靠表达为 JSON Schema 的 transform；默认值和交叉约束仍在运行时解析阶段执行。
- definitions 只包含模型需要的字段，不包含 workspace、signal、absolutePath、authorization 或内部限制器。
- 六个定义按固定名称排序，保证测试、提示和日志稳定。

## 12. 通用限制与结果协议

### 12.1 建议常量

```text
MAX_TOOL_OUTPUT_BYTES             65,536（复用领域常量）
MAX_TEXT_FILE_BYTES               2 MiB
MAX_WRITE_CONTENT_BYTES           1 MiB
MAX_REPLACEMENT_TEXT_BYTES        1 MiB
MAX_SEARCH_QUERY_BYTES            4 KiB
DEFAULT_DIRECTORY_DEPTH           1
MAX_DIRECTORY_DEPTH               4
DEFAULT_DIRECTORY_ENTRIES         200
MAX_DIRECTORY_ENTRIES             1,000
DEFAULT_SEARCH_RESULTS             100
MAX_SEARCH_RESULTS                 500
MAX_FALLBACK_SEARCH_FILES        10,000
DEFAULT_PROCESS_TIMEOUT_MS      120,000
MAX_PROCESS_TIMEOUT_MS          600,000
MAX_PROCESS_ARGUMENTS              128
MAX_PROCESS_ARGUMENT_BYTES       32 KiB total
```

Task 必须把数值集中定义并用边界测试锁定，不能在 handler 中散落 magic number。

### 12.2 输出截断

领域现有 `truncateUtf8` 只保留头部。本阶段增加工具输出专用“头 + 明确标记 + 尾”策略：

- 以 UTF-8 字节计数，不切断多字节字符。
- 总输出（含截断标记）不超过 64 KiB。
- 默认约保留前 75% 与后 25%，使命令错误尾部仍可见。
- metadata 至少包含 `truncated`、`originalBytes`、`returnedBytes`。
- 即使达到公开上限，仍继续 drain stdout/stderr，避免子进程因管道背压挂起。
- 文件读取按请求行区间截取后再应用输出上限；完整原文件 SHA-256 不受截断影响。

### 12.3 稳定错误族

本阶段至少定义以下稳定错误码：

```text
TOOL_UNKNOWN
TOOL_ARGUMENTS_INVALID
TOOL_INTERNAL_ERROR
TOOL_SENSITIVE_PATH_DENIED
FILE_TOO_LARGE
FILE_BINARY_UNSUPPORTED
FILE_CONTENT_INVALID
FILE_STALE
FILE_MATCH_NOT_FOUND
FILE_MATCH_NOT_UNIQUE
FILE_ATOMIC_WRITE_FAILED
FILE_IO_ERROR
SEARCH_FAILED
PROCESS_SPAWN_FAILED
PROCESS_EXIT_NONZERO
PROCESS_TIMEOUT
```

规则：

- 参数或可修正内容问题通常 `recoverable: true`。
- 内部不变量破坏和未知 I/O 默认 `recoverable: false`。
- details 只允许工具名、规范 relativePath、限制数值、计数、exitCode、signal、timeout 等有限字段。
- 不包含 absolutePath、完整 args、完整 query、完整内容、完整环境、stack、syscall 或 Node cause message。

## 13. 敏感路径与数据最小化

### 13.1 文件内容保护

目录工具可以显示文件名，但读取、搜索、写入和替换不得处理以下敏感目标：

- `.git/**`
- `.secode-data/**`
- `.env` 和 `.env.*`，但允许明确的模板文件 `.env.example`、`.env.sample`、`.env.template`
- `.npmrc`、`.pypirc`、`.netrc`、`.git-credentials`
- 常见私钥文件：`id_rsa`、`id_ed25519`、`*.pem`、`*.key`

判断基于规范 relativePath 的完整 path segment/basename，不使用易误判的普通 substring。命中时返回 `TOOL_SENSITIVE_PATH_DENIED`；不能通过阶段 07 审批绕过。

这不是完整秘密检测器。普通源码中若出现已知 Bearer、`sk-*` 或环境 API Key 赋值模式，公开输出和预览仍复用 `redactSecrets`；原始内容只在当前 handler 内用于哈希、匹配和写入。

### 13.2 公共参数投影

- `list_directory`、`read_file`、`search_text`、`run_process`：保留经过通用脱敏和大小限制的必要参数。
- `write_file`：只记录 `path`、`contentBytes`、`contentSha256`、可选 `expectedSha256` 和最多 256 UTF-8 字节的脱敏 preview。
- `replace_in_file`：只记录 `path`、`expectedSha256`、old/new 字节数、old/new SHA-256 与各自最多 256 字节脱敏 preview。
- `run_process` 不记录环境；program 与 args 逐项脱敏并受公共参数 16 KiB 总限制。
- 未知工具仍使用阶段 03 通用 `createPublicToolArguments`，避免非法原始值直接进入事件。

## 14. `list_directory` 规格

### 14.1 参数

```ts
{
  path?: string;   // 默认 "."
  depth?: number;  // 1..4，默认 1
  limit?: number;  // 1..1000，默认 200
}
```

### 14.2 行为

1. 入口 path 使用 existing resolver 且 `expectedKind: "directory"`。
2. 使用 `readdir(..., { withFileTypes: true })` 分层遍历，按规范 relativePath 代码点顺序稳定排序。
3. 每个准备公开的子项再次通过工作区 existing resolver；不能因可信父目录而绕过子 symlink 检查。
4. 默认跳过任意层级的 `.git`、`node_modules`、`.next` 和 `.secode-data` 目录，不提供模型参数关闭忽略。
5. 内部目录 symlink 可以显示，但不递归进入，避免环与重复树；外部/损坏链接显示为受阻条目，不公开目标。
6. 名称若含工具路径协议不允许的控制字符或反斜线，则不返回原始名称，只增加 `unsupportedEntries` 计数。
7. 达到 depth、limit、output bytes 或取消信号时停止继续收集；limit 属于成功截断，取消属于中止控制流。
8. 不调用 `stat` 获取昂贵的完整 metadata；首版只输出类型、规范相对路径和 symlink 标记。

### 14.3 结果

输出每行一个条目，例如：

```text
directory  src
file       src/index.ts
symlink    linked-config
blocked    outside-link
```

metadata 至少包含 path、depth、returnedEntries、truncated、ignoredEntries、blockedEntries、unsupportedEntries。

## 15. `read_file` 规格

### 15.1 参数

```ts
{
  path: string;
  startLine?: number; // 1-based，默认 1
  endLine?: number;   // inclusive，必须 >= startLine
}
```

### 15.2 行为

1. 先执行敏感路径检查，再以 existing resolver 要求普通 file。
2. 打开后读取 stat；超过 2 MiB 返回 `FILE_TOO_LARGE`，不读取到无界内存。
3. SHA-256 基于完整原始字节计算，即使只返回行区间。
4. 使用 fatal UTF-8 decoder；含 NUL 或无效 UTF-8 返回 `FILE_BINARY_UNSUPPORTED`。
5. 行号以 `\n` 分隔计算，保留原始行尾内容；最后一个无换行行仍算一行。
6. startLine 超过总行数返回可恢复参数/范围错误，不静默返回空内容。
7. 返回选择区间的原始文本，不给每行注入行号，避免模型复制时污染内容。
8. 输出应用 64 KiB 头尾截断，metadata 明确实际行区间、总行数、完整 SHA-256 和截断状态。

SHA-256 使用 64 位小写十六进制，不附加 `sha256:` 前缀；写工具的 expectedSha256 使用同一格式。

## 16. `search_text` 规格

### 16.1 参数

```ts
{
  query: string;       // 非空固定字符串，最大 4 KiB
  path?: string;       // 文件或目录，默认 "."
  caseSensitive?: boolean; // 默认 true
  limit?: number;      // 1..500，默认 100
}
```

首版只支持固定字符串，不开放正则。这样 `rg` 与 Node fallback 的匹配语义一致，也避免把两套正则方言当作同一协议。正则搜索可作为以后显式扩展。

### 16.2 `rg` 路径

- 起始 path 先通过 existing resolver。
- 使用 `spawn("rg", args, { cwd, shell: false })`，query 始终作为独立 argv。
- 使用 JSON/行号/列号/无颜色/固定字符串模式；不构造 shell 命令。
- 不跟随 symlink，不搜索 `.git`、`.secode-data`、`node_modules`、`.next` 和敏感文件。
- 流式解析完整 JSON 行，处理任意 chunk 边界；解析结果只生成规范 relativePath、1-based 行/列和有限文本。
- exit code 0 为有匹配，1 为无匹配成功，其他退出为 `SEARCH_FAILED`。
- 达到全局 limit 或输出预算时主动结束本次内部搜索并标记 truncated，不把内部限额停止当作用户取消。

### 16.3 Node fallback

仅在 `spawn("rg")` 明确 ENOENT 时回退；权限、非法参数或 rg 自身错误不能被静默掩盖。

fallback：

- 使用显式目录队列和 `readdir`，不依赖 Node 24 独有行为。
- 规则与目录工具相同：稳定排序、不跟随目录 symlink、跳过默认忽略项和敏感文件。
- 每个文件通过 workspace resolver、2 MiB 大小与严格 UTF-8 检查；二进制/过大文件计数后跳过。
- 最多扫描 10,000 个文件；达到文件、匹配、输出或取消限制即停止。
- fixed string case-insensitive 使用明确的 Unicode 小写比较；记录这与 rg 在少数复杂 Unicode case-fold 上可能不同。

### 16.4 结果

每个匹配一行：

```text
src/file.ts:12:8: matched line preview
```

metadata 至少包含 engine（`rg`/`node`）、path、returnedMatches、scannedFiles（可得时）、skippedBinary、skippedLarge、truncated。

## 17. `write_file` 规格

### 17.1 参数

```ts
{
  path: string;
  content: string;          // UTF-8 最大 1 MiB
  expectedSha256?: string;  // 覆盖 existing 时必填
}
```

规则：

- existing target：必须提供 64 位小写十六进制 expectedSha256。
- missing target：expectedSha256 必须省略，避免把创建和覆盖语义混合。
- 不创建缺失父目录。
- content 原样 UTF-8 编码，不自动格式化、不改换行、不添加末尾换行。

### 17.2 原子写算法

1. 敏感路径检查。
2. `resolveWritableWorkspacePath` 获取目标和私有快照。
3. existing 时读取当前原始字节、检查 2 MiB 上限并比较 SHA-256。
4. 若新旧字节完全相同，返回 `changed: false`，不触发 rename。
5. 在快照的真实 `parentPath` 中以 `open(..., "wx")` 创建唯一 `.secode-write-<uuid>.tmp`。
6. 写入全部字节并 `FileHandle.sync()`；existing 时保留原普通文件权限位，创建时使用受进程 umask 约束的普通文件模式。
7. 调用 `revalidateWritableWorkspacePath`。
8. existing 时再次读取并比较 expectedSha256，覆盖“同 inode 内容变化”场景；missing 时确认仍不存在。
9. 使用同目录 `rename(temp, target)` 完成原子替换。
10. 成功后读取/计算新 SHA-256；失败时只删除本次确切创建的临时文件。

禁止：

- 先 unlink 目标再 rename。
- rename 失败后回退为非原子直接覆盖。
- 使用 glob、递归删除或目录级 cleanup。
- 把 temp absolutePath、原内容或完整新内容写入错误/metadata。

Node 标准 API 下，最后一次哈希/复验与 rename 之间仍有极小 TOCTOU；本项目保持阶段 05 的可信本地单用户声明。

## 18. `replace_in_file` 规格

### 18.1 参数

```ts
{
  path: string;
  oldText: string;          // 非空
  newText: string;
  expectedSha256: string;
}
```

### 18.2 行为

1. 只允许 existing 普通 UTF-8 文本文件，执行敏感路径、2 MiB 和 expected SHA-256 检查。
2. oldText 必须精确出现一次；0 次返回 `FILE_MATCH_NOT_FOUND`，2 次及以上返回 `FILE_MATCH_NOT_UNIQUE`。
3. 唯一性检测必须能发现重叠出现，不能仅用会跳过重叠的普通 split 计数。
4. oldText 与 newText 相同视为参数错误，不制造“成功但未修改”的替换。
5. 替换结果 UTF-8 不得超过 1 MiB。
6. 复用 `write_file` 的同目录 temp、sync、二次 revalidate、二次 expected hash 和 atomic rename 核心，不复制一套较弱实现。
7. 结果记录 beforeSha256、afterSha256、changed 和 replacedOccurrences: 1；不返回完整文件。

## 19. `run_process` 规格

### 19.1 参数

```ts
{
  program: string;
  args?: string[];     // 默认 []，最多 128 项、总计 32 KiB
  cwd?: string;        // 工作区相对目录，默认 "."
  timeoutMs?: number;  // 1,000..600,000，默认 120,000
}
```

不提供 `command` 字符串、shell、env、stdin、detached、uid、gid 或 stdio 参数。

### 19.2 执行

1. cwd 使用 existing resolver 且 `expectedKind: "directory"`。
2. 固定调用 `spawn(program, args, { cwd: absolutePath, shell: false, stdio: ["ignore", "pipe", "pipe"] })`。
3. program 与每个 arg 原样作为独立 argv，不做引号解析、变量展开、glob、重定向或管道。
4. 子进程环境从服务端环境生成有限副本，删除大小写不敏感命中 `API_KEY`、`TOKEN`、`SECRET`、`PASSWORD`、`AUTHORIZATION` 的键；不接受模型自定义 env。
5. 保留 PATH、HOME、TMPDIR、语言和工具链正常运行所需非敏感变量；不在结果中记录环境。
6. stdout/stderr 分别 drain，并按收到 chunk 的单调序号合并为带 `[stdout]`/`[stderr]` 标签的有限输出。
7. 正常 exit 0 返回成功；非零返回 `PROCESS_EXIT_NONZERO`，保留有限输出与 exitCode。
8. spawn ENOENT/权限等返回 `PROCESS_SPAWN_FAILED`，不暴露绝对 PATH 搜索结果。
9. 超时先发送 SIGTERM；短宽限后若仍未退出再尝试 SIGKILL，返回 `PROCESS_TIMEOUT`。
10. 外部 AbortSignal 触发同样终止流程，但最终抛出 `LocalToolExecutionAbortedError`。
11. close/error/abort/timeout 竞态只能结算一次，定时器与 listener 必须清理。

### 19.3 与阶段 07 的边界

本阶段不判断 program 是否安全。阶段 07 必须在调用 `executePreparedLocalTool` 之前：

- 自动允许已识别的构建、类型检查、测试和只读 Git 命令。
- 要求审批安装依赖、Git 写、shell、格式化全仓和未知程序。
- 直接拒绝 sudo、系统控制、宽泛删除、`git reset --hard` 等。

因此，阶段 06 的单元测试可以直接验证 spawn 机械行为，但任何 Agent/终端/API 生产入口都不得在阶段 07 完成前暴露 `run_process` 执行。

已知限制：即使 cwd 在工作区，获批进程仍可读取或修改工作区外路径、联网或启动后代进程；本工具不是 OS 沙箱。首版只尽力终止直接子进程，不宣称跨平台可靠清理所有后代进程树。

## 20. 搜索、遍历和文件系统竞态

- list/search 对每个实际访问目标复用 workspace resolver，但目录在 readdir 与子项 resolve 间仍可能变化。
- 读取在 resolve 后打开文件，普通本机并发修改可能使 hash 对应读取瞬间而非目录项当前状态。
- 变更工具通过 writable snapshot + expected hash + final revalidation 缩短风险窗口。
- symlink escape、absolute path 和 `..` 错误直接拒绝，不能转换为阶段 07 可审批风险。
- 测试会覆盖正常并发变化，但不声称防御拥有同一主机写权限的恶意竞争进程。

## 21. 取消语义

所有可能长时间运行的循环在以下位置检查 signal：

- list_directory 每个目录与批次。
- read_file 在 I/O 前后。
- search_text 每个流 chunk、目录和文件。
- write/replace 在创建 temp 前、写后、final revalidate 前和 rename 前。
- run_process 使用 signal listener，并保证终止只结算一次。

若 signal 在原子 rename 完成前触发：清理确切 temp，目标不变。若 rename 已完成后才观察到 abort，则返回已经完成的真实写入成功，不能谎报未变更。此竞态必须通过“mutation committed”内部状态决定结果。

## 22. 测试设计

测试只使用 `mkdtemp(tmpdir()/secode-tools-test-*)` 创建的登记目录。cleanup 必须验证真实 parent、固定前缀和登记集合，只删除确切 fixture/temp；不得触碰当前仓库之外的真实用户项目。

### 22.1 注册表与 Schema

- 六个名称唯一、顺序稳定、definitions 通过 `ToolDefinitionSchema`。
- Zod Schema 与生成 JSON Schema 的 required/type/additionalProperties 一致。
- extra key、错误类型、空字符串、超字节、非法范围和交叉字段约束拒绝。
- 未知工具与非法参数产生有限失败 ToolResult。
- prepared invocation 不能由普通对象伪造或跨 registry 使用。

### 22.2 公共投影与结果

- write/replace 不出现完整 content/oldText/newText。
- 只出现规范 relativePath、大小、哈希和有限脱敏 preview。
- Bearer、`sk-*`、`*_API_KEY=` 和敏感参数键被脱敏。
- 所有输出按 UTF-8 头尾截断且通过 `ToolResultSchema`。
- 中文多字节边界不产生替换字符或超限。
- 错误 JSON 不含 stack、absolutePath、cause、完整环境或 temp 路径。

### 22.3 目录

- 根/子目录、depth 1/4、limit、稳定排序和中文路径。
- 默认忽略四类目录。
- 内部 symlink 显示但不递归；外部、dangling、loop 受阻。
- prefix sibling、路径变化、取消和不支持名称。
- output bytes 与 entry limit 分别触发明确截断。

### 22.4 读取

- 完整读取、行区间、CRLF、末行无换行、空文件和中文。
- hash 基于完整原始字节，slice/截断不改变 hash。
- invalid range、2 MiB 边界、超大、NUL、非法 UTF-8、目录和敏感路径。
- 读取后并发变化返回实际读取内容/哈希，不泄露 absolutePath。

### 22.5 搜索

- rg JSON 跨任意 chunk 边界解析、路径/行/列映射、exit 0/1/>1。
- query 作为独立 argv，包含空格、引号、`$()`、分号时不执行 shell。
- global result/output limit 能终止并 drain/cleanup。
- rg ENOENT 才回退，其他错误不回退。
- Node fallback 固定字符串、大小写、忽略目录、二进制/大文件、symlink、文件上限和取消。
- 两个引擎对普通 ASCII/中文固定字符串结果一致。

### 22.6 写入

- create 成功、overwrite 成功、内容相同时无写、中文和空内容。
- existing 缺 expected hash、missing 带 expected hash、错误 hash、大小超限。
- resolve 后 target create/delete/replace、同 inode 内容变化、parent 替换和 symlink。
- temp 使用 `wx`、同 parent、sync 后 rename、权限位策略。
- write/sync/revalidate/hash/rename 各失败点均清理本次 temp 且不删除目标。
- rename 失败不回退直接覆盖。
- Abort 在 commit 前清理，commit 后不谎报取消。

### 22.7 替换

- 唯一匹配成功，before/after hash 正确。
- 0 次、多次和重叠多次拒绝。
- old===new、二进制、过大结果、stale hash 和敏感路径拒绝。
- 复用同一原子写核心，不存在第二套较弱流程。

### 22.8 进程

- 使用 `process.execPath` 和临时 fixture 验证 argv 保真、cwd 和 shell false。
- 带 `;`、`$()`、重定向符号的 arg 只作为普通参数。
- stdout/stderr 交错、中文 chunk、64 KiB 截断且持续 drain。
- exit 0、非零、signal、ENOENT、timeout、预先 abort、运行中 abort。
- close/error/abort/timeout 竞态单次结算，无 listener/timer 残留。
- 子进程看不到假 `DEEPSEEK_API_KEY`、`LONGCAT_API_KEY`、TOKEN/PASSWORD，仍能看到非敏感测试变量与 PATH。
- cwd absolute、`..`、外部 symlink 和普通文件拒绝。

### 22.9 整体验证

预计实施阶段执行：

```text
pnpm exec vitest run tests/unit/tools/schemas.test.ts
pnpm exec vitest run tests/unit/tools/files.test.ts
pnpm exec vitest run tests/unit/tools/search.test.ts
pnpm exec vitest run tests/unit/tools/process.test.ts
pnpm exec vitest run tests/unit/tools/registry.test.ts
pnpm exec vitest run tests/unit/tools
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

不会在本阶段执行真实项目命令、真实模型调用、交互终端或 UI E2E。

## 23. 验收标准

本 Spec 获批并实施后，阶段 06 必须满足：

1. 六个工具拥有唯一 strict Zod Schema、有效模型 definition 和稳定注册表。
2. 未知工具与非法参数返回结构化、有限、可恢复结果，不使进程崩溃。
3. list/read/search 的每个路径访问都遵循阶段 05 existing resolver 与 symlink 边界。
4. read 返回完整文件 SHA-256，拒绝过大、二进制和敏感内容文件。
5. rg 搜索全程参数化，缺失时 Node fallback 行为可预测且受限。
6. write/replace 覆盖必须携带正确 expected SHA-256，并使用 writable snapshot、二次哈希、同目录 temp、sync 和 atomic rename。
7. replace 只接受唯一 oldText 匹配，0 次/多次不修改目标。
8. run_process 的 cwd 在工作区，固定 shell false，支持 timeout、AbortSignal、有限输出和敏感环境过滤。
9. 所有结果通过 `ToolResultSchema`，output 不超过 64 KiB，公共数据不含绝对路径、完整写入内容、应用 API Key、stack 或 cause。
10. 敏感路径不能通过文件内容工具访问，path escape 不能通过后续审批绕过。
11. 工具核心保持 Node-only，不导入 Next.js、React、模型 client、Agent、存储、终端或 UI。
12. 不新增依赖；工具测试、全量测试、lint、typecheck、build、diff check 全部通过，临时目录无残留。
13. 不提前实现阶段 07 风险策略、阶段 09 Agent、阶段 11 终端或阶段 13/14 Web 能力。

## 24. 风险与限制

1. Node 文件 API 无法完全消除最终复验与 rename 间的恶意本机 TOCTOU。
2. `rename` 覆盖行为存在平台差异；失败时首版保守返回错误，不使用非原子回退。
3. rg 与 Node fallback 在复杂 Unicode case-fold 上可能存在少量差异，普通 UTF-8/ASCII 固定字符串必须一致。
4. 不跟随目录 symlink 会遗漏通过内部别名可达的重复目录内容，但避免环、重复扫描和意外扩大成本。
5. 2 MiB 读取与 1 MiB 写入上限可能排除大型生成文件；首版优先安全、上下文和演示稳定性。
6. 敏感文件名规则可能拒绝用户确实想编辑的本地配置；首版不允许审批绕过，以避免秘密进入模型和 JSONL。
7. 内容脱敏是启发式，不能证明识别所有秘密。
8. 进程环境过滤不能约束进程主动读取磁盘、钥匙串或网络凭据。
9. 只终止直接子进程可能留下自行守护化或脱离的后代；强进程树管理不在首版范围。
10. 阶段 06 raw executor 是应用内部能力，不是安全授权边界；生产调用必须经过阶段 07。

## 25. 假设

- 首版面向可信本地单用户，主要运行在 macOS/Linux，保持 Windows 可实现。
- 源码工具以 UTF-8 文本为主；UTF-16、二进制和超大生成物不属于首版编辑对象。
- 工具由 Agent 串行调用；同一 run 不会并发执行两个写操作。
- 工作区父目录由用户/仓库预先创建，文件工具不隐式创建目录。
- 用户需要搜索源码文本，固定字符串已满足首版定位需求；正则不是必需验收项。
- 构建、测试、Git 等具体命令的风险分类可以在阶段 07 不修改本阶段工具参数的情况下完成。
- 终端入口可在阶段 11 直接复用 prepare/risk/execute 链路，不需要在 CLI 层复制工具逻辑。

## 26. 对后续阶段的硬约束

### 26.1 阶段 07 风险与审批

- 风险分类输入必须是 `PreparedLocalToolInvocation`，不能基于未校验 raw arguments。
- path escape、sensitive path 和 workspace identity 错误直接拒绝，不可审批绕过。
- 审批后才调用 executor；若等待发生在可写准备之后，执行内部仍必须重新 resolve/revalidate/hash。
- 风险层不得开启 shell 或把 program/args 拼成字符串。

### 26.2 阶段 08/09 存储与 Agent

- `tool.requested` 只能使用本阶段 public projection。
- `tool.result` 保存已经有限化并通过 Schema 的 ToolResult。
- 原始 content/oldText/newText、absolutePath、temp path 和进程环境不进 JSONL。
- Agent 把 `LocalToolExecutionAbortedError` 解释为取消，不反馈模型继续重试。
- Agent 串行执行工具调用；unknown/invalid ToolResult 可以反馈模型自修正。

### 26.3 阶段 11/12 终端与核心验收

- 终端先展示公开参数、风险结论和 ToolResult，再进行真实 Agent 测试。
- 终端不直接调用 raw handler 绕过风险层。
- 阶段 12 才在用户指定的受控示例项目完成“读—改—测—总结”。

### 26.4 阶段 13/14 API 与 UI

- Route Handler 只传递 ToolCall/事件，不接收客户端 absolutePath 或 shell 开关。
- UI 使用 `tool.requested.publicArguments` 和 `tool.result` 展示卡片，不依赖内部 invocation。
- replace 的前后预览来自公开投影，不能从 JSONL 恢复完整写入内容。

## 27. 本次审批需确认的决策

批准本 Spec 即表示确认：

1. 六工具固定参数与准备/风险/执行三段式边界。
2. 首版 list depth 最大 4、条目最大 1000，默认忽略 `.git`、`node_modules`、`.next`、`.secode-data`。
3. read/search 只处理最大 2 MiB 的严格 UTF-8 文本；write/replace 结果最大 1 MiB。
4. read 的 SHA-256 始终针对完整原始文件，即使只返回部分行或截断输出。
5. search 首版只支持固定字符串；优先参数化 rg，只有 ENOENT 才用 Node fallback。
6. 所有覆盖必须携带 64 位小写 expectedSha256；missing create 不允许携带它。
7. write/replace 使用同目录独占 temp、sync、二次路径/内容复验和 atomic rename，失败不做非原子回退。
8. `.env*`（模板除外）、`.git/**`、`.secode-data/**`、常见凭据/私钥文件不能被内容工具访问，也不能审批绕过。
9. run_process 不接收 shell/env/stdin，cwd 必须在工作区，默认 120 秒、最大 10 分钟，并过滤子进程敏感环境变量。
10. 风险分级不在阶段 06；任何生产 Agent/终端入口必须等阶段 07 完成后才能暴露进程执行。
11. 外部取消使用专用中止控制流；超时和非零退出使用结构化 ToolResult。
12. 工具层是可信本地应用能力，不是强 OS 沙箱，不承诺阻止获批进程的工作区外副作用或所有后代进程。

## 28. Spec 内部门禁

- [x] 阶段 05 Summary 的用户批准已记录。
- [x] 已阅读批准的流程、需求、领域协议和工作区契约。
- [x] 已观察代码、测试、配置、依赖、本机工具链和 Git 状态。
- [x] 当前差距、范围内外和阶段 07/09/11 分界明确。
- [x] 六工具参数、限制、执行算法、错误和公开投影明确。
- [x] SHA-256、原子写、rg fallback、spawn、取消与泄露测试标准明确。
- [x] 已记录跨平台、TOCTOU、敏感路径和进程非沙箱限制。
- [x] 未创建工具代码、测试、Task 或 Summary，未安装依赖，未触碰真实项目。
- [x] 开发索引将更新为“阶段 06 Spec 待用户审批”。

**Spec 内部门禁：通过。当前状态：已批准。**

## 29. 用户审批区

请重点审阅第 27 节的 12 项设计决策。

若批准，只解锁根据本 Spec 生成 `06-local-tools-tasks.md`；仍不会开始工具开发。可回复“阶段 06 Spec 批准”或语义等价的明确批准。

## 30. 用户审批记录

- 2026-08-27：用户明确回复“批准”，阶段 06 Spec 获批。
- 已确认：第 27 节的六工具接口、限制、敏感路径、哈希与原子写、进程和阶段分界决策。
- 解锁动作：允许生成 `06-local-tools-tasks.md`。
- 仍然禁止：阶段 06 Task 获批前不得创建 `lib/tools`、工具测试或 Summary，不得修改依赖或后续阶段业务。
