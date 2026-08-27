# 阶段 06 Summary：本地工具系统

## 1. 文档状态与审批链

- 当前状态：已批准。
- 依据 Spec：[06-local-tools-spec.md](./06-local-tools-spec.md)，已获用户批准。
- 依据 Task：[06-local-tools-tasks.md](./06-local-tools-tasks.md)，已获用户批准。
- 当前子阶段：T06-00 至 T06-13 的开发、测试、整体验证与反思已完成。
- 后续门禁：本 Summary 获批前不得开始阶段 07 的只读观察，不得生成阶段 07 Spec。

审批链：

1. 2026-08-27：用户批准阶段 05 Summary，解锁阶段 06 观察与 Spec。
2. 2026-08-27：用户批准阶段 06 Spec，确认六工具接口、限制、敏感路径、哈希/原子写、进程与阶段分界。
3. 2026-08-27：用户批准阶段 06 Task，授权按 T06-00 至 T06-13 在批准文件范围内实施。
4. 实现没有触发公共接口、安全策略、限制数值、依赖或阶段范围的重新审批条件。

## 2. 阶段结果

本阶段完成了纯 Node.js、模型提供方无关的本地工具系统，形成如下唯一调用链：

```text
ToolCall
  → prepareLocalToolCall
  → PreparedLocalToolInvocation + publicArguments
  → 阶段 07 风险/审批
  → executePreparedLocalTool
  → ToolResult / LocalToolExecutionAbortedError
```

最终结果：

- 16 个 `lib/tools` 生产模块完成。
- 11 个工具测试 suite 和 1 个安全 fixture helper 完成。
- 六个工具 definitions、strict Zod Schema 和固定 registry 完成。
- 16 个稳定工具错误码完成。
- 工具测试 50 项全部通过。
- 全仓 24 个测试文件、240 项测试全部通过。
- lint、TypeScript、Next.js 16.3.3 生产构建和 `git diff --check` 全部通过。
- 没有新增依赖，没有修改 package、lockfile、Next/TS/Vitest/Playwright 配置。
- 测试只操作登记的系统临时目录；最终没有 `secode-tools-test-*` 或临时写文件残留。
- 没有提前实现风险审批、JSONL、Agent、终端、API 或 UI。

## 3. 任务完成清单

| 任务 | 状态 | 实现证据 | 验证证据 |
| --- | --- | --- | --- |
| T06-00 前置复核 | 完成 | 本地 Next.js 16.3.3 项目结构/Vitest/TS 文档 | 基线与 Git 状态检查 |
| T06-01 类型/错误/依赖 | 完成 | `types.ts`、`dependencies.ts` | typecheck、依赖扫描 |
| T06-02 Schema/definitions | 完成 | `schemas.ts` | 6 项 schema 测试 |
| T06-03 共享安全能力 | 完成 | `output.ts`、`file-content.ts`、`sensitive-path.ts`、`abort.ts` | 19 项共享测试 |
| T06-04 list | 完成 | `list-directory.ts` | 3 项目录测试 |
| T06-05 read | 完成 | `read-file.ts` | 3 项读取测试 |
| T06-06 search | 完成 | `search-text.ts` | 4 项双引擎测试 |
| T06-07 atomic/write | 完成 | `atomic-write.ts`、`write-file.ts` | 3 项写入流程测试 |
| T06-08 replace | 完成 | `replace-in-file.ts` | 2 项替换测试 |
| T06-09 process | 完成 | `run-process.ts` | 6 项进程测试 |
| T06-10 registry/barrel | 完成 | `registry.ts`、`index.ts` | 4 项 registry 测试 |
| T06-11 安全补强 | 完成 | rg 敏感排除、fallback symlink、多匹配修正 | tools 50/50 |
| T06-12 整体验证 | 完成 | 本文第 8、9 节 | 全部门禁退出码 0 |
| T06-13 Summary | 完成 | 本文档、开发索引 | 内部门禁通过，等待审批 |

## 4. 详细开发过程

### 4.1 T06-00：规则与基线复核

编码前重新阅读：

- `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`
- `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md`

结论：

- `lib/tools` 位于 `app` 外，不会成为路由。
- 工具核心只需 Node 环境，不需要 React/jsdom。
- 既有 `vitest.config.mts` 已覆盖 `tests/unit/**/*.test.ts`。
- 当前 TypeScript strict 与路径别名可直接使用。
- 不需修改 Next.js、Vitest、TypeScript 或依赖配置。

### 4.2 T06-01/02：统一类型、限制、Schema 与 definitions

`types.ts` 集中固定：

- 六个工具名。
- 目录、文件、搜索、进程和输出限制。
- 16 个 `LOCAL_TOOL_ERROR_CODES`。
- 六类执行参数和 prepared invocation 判别联合。
- `LocalToolExecutionContext`。
- `PrepareLocalToolCallResult`。
- `LocalToolExecutionAbortedError`。
- strict error details 与成功/失败 ToolResult factory。

`dependencies.ts` 只提供内部最小 Node adapter：readdir、stat、readFile、open、rename、unlink、spawn、UUID 和 clock。adapter 没有从公共 barrel 导出。

`schemas.ts` 为六个工具建立 strict Zod 输入：

- optional 默认值在 parse 后明确填充。
- path/cwd 在准备阶段规范为阶段 05 相对路径。
- 字符串限制使用 UTF-8 bytes。
- read line range、replace same text、process args 总字节等交叉约束在运行时校验。
- 模型 parameters 由 Zod 4 `toJSONSchema(..., { target: \"draft-7\" })` 生成，不维护第二份手写结构。
- 六 definitions 再通过阶段 03 `ToolDefinitionSchema`。

### 4.3 T06-03：输出、文本、哈希、敏感路径和取消

`output.ts` 实现头/标记/尾 UTF-8 有限化：

- 公开文本先经过 `redactSecrets`。
- 总输出不超过 64 KiB。
- 不切断中文等多字节字符。
- 进程 accumulator 只保留有限头尾，但继续 drain 全部 stream。
- metadata 记录原始与返回 bytes。

`file-content.ts`：

- stat 后先检查 2 MiB，再读取，读取后再次检查大小。
- NUL 或 fatal UTF-8 decode 失败视为 binary unsupported。
- SHA-256 基于完整原始 bytes。
- 行选择为 1-based inclusive，不插入行号。
- 空文件、CRLF、BOM 和无末尾换行有固定行为。

`sensitive-path.ts` 使用 path segment/basename：

- 拒绝 `.git/**`、`.secode-data/**`、非模板 `.env*`、常见凭据/私钥。
- 允许 `.env.example`、`.env.sample`、`.env.template`。
- `src/env.ts`、`monkey.ts` 等相似名称不会误拒。

`abort.ts` 统一预检查与 listener cleanup。取消使用专用异常，不转换为可供模型盲目重试的普通 ToolResult。

### 4.4 T06-04：目录工具

`list_directory`：

1. 起始目录通过 existing resolver。
2. 使用显式 breadth-first queue 和稳定代码点排序。
3. 每个公开子项再次经过 workspace resolver。
4. 默认跳过 `.git`、`.secode-data`、`node_modules`、`.next`。
5. 内部 symlink 显示但不递归。
6. 外部、dangling 或 loop link 只显示 blocked relative path。
7. 不支持名称只计数，不公开原始名称。
8. entry/output limit 返回成功且 `truncated:true`；Abort 中止。

结果不包含 root、absolutePath 或 symlink target。

### 4.5 T06-05：文件读取

`read_file`：

- 敏感检查后要求 existing ordinary file。
- 复用统一文本 gate/hash。
- 支持 startLine/endLine。
- 公开 selected text 先脱敏、再 64 KiB 截断。
- metadata 返回完整 raw file SHA-256、总行数、实际行区间和 byte 信息。
- hash 不因 slice、脱敏或截断变化。

### 4.6 T06-06：固定字符串搜索

rg 引擎：

- 参数化 `spawn(\"rg\", argv, { shell:false })`，query 为独立 argv。
- 使用 JSON、fixed-string、line/column、no-color 与 ignore globs。
- argv 层直接排除 ignored/sensitive 文件。
- 增量解析跨 chunk JSONL。
- 同一行多个 submatch 逐项输出。
- workspace relative path 再规范化。
- exit 0/1 为正常，其他为结构化搜索失败。
- 达到内部 match limit 时主动结束并标记 truncated。

Node fallback：

- 只在 rg spawn ENOENT 时启用。
- 使用显式稳定 queue，不依赖 Node 24 recursive readdir。
- 不跟随目录 symlink；外部 symlink 跳过。
- 复用 ignore、sensitive、2 MiB、UTF-8 gate。
- 最多扫描 10,000 文件。
- 固定字符串逐行定位 1-based line/column。

回归测试证明含分号、`$()`、pipe、redirect 的 query 只作为文本，不产生 shell 副作用。

### 4.7 T06-07/08：哈希保护和统一原子变更

`atomic-write.ts` 是 write/replace 唯一写核心：

1. `resolveWritableWorkspacePath` 取得不可伪造快照。
2. existing 必须有 expected SHA-256；missing 不得携带。
3. existing 读取 raw bytes/hash 并比较。
4. 相同 bytes 返回 no-op，不制造无意义 rename。
5. 在真实 parentPath 中以 `wx` 创建唯一 `.secode-write-<uuid>.tmp`。
6. 写入、sync、close；overwrite 保留权限位，create 使用 umask 后普通文件权限。
7. 对原 writable snapshot 执行 revalidate。
8. existing 再次读取/hash，发现同 inode 内容变化。
9. rename 前最后检查 Abort。
10. 同目录 atomic rename，完成后立即标记 committed。
11. 失败只清理本次确切 temp；不 unlink target、不 direct-write fallback。

`write_file`：

- content 最大 1 MiB，原样 UTF-8，不改换行。
- create/overwrite/no-change 返回明确 operation、hash、bytes。
- 不返回完整内容。

`replace_in_file`：

- 先验证完整文件 hash。
- 通过从下一 code-unit 继续查找发现重叠多匹配。
- 0 次/2+ 次不修改。
- 唯一匹配用 slice 拼接，不使用 regex replace。
- 结果最大 1 MiB，复用同一 atomic core。
- 结果只记录 before/after hash 和 replacedOccurrences。

### 4.8 T06-09：无 shell 进程

`run_process`：

- cwd 通过 existing directory resolver。
- 固定 direct `spawn(program,args)`、`shell:false`、stdin ignore、stdout/stderr pipe。
- 不支持 command string、env 参数、stdin、detached、uid/gid。
- 子进程环境复制自 server env，但删除 key 命中 API_KEY/TOKEN/SECRET/PASSWORD/AUTHORIZATION 的项。
- stdout/stderr 每 chunk 标记 stream 并进入有限 accumulator，超过上限仍继续 drain。
- exit 0 成功；非零/信号为 `PROCESS_EXIT_NONZERO`。
- spawn error 为 `PROCESS_SPAWN_FAILED`。
- timeout 先 SIGTERM，2 秒宽限后尝试 SIGKILL，返回 `PROCESS_TIMEOUT`。
- 外部 Abort 终止直接 child 后抛专用取消错误。
- error/close/timeout/abort 由单一 settle 状态控制，listener/timer 一次清理。

测试使用 `process.execPath` 和临时工作区，不运行真实项目命令。实现不宣称可靠终止自行脱离的后代进程树。

### 4.9 T06-10：准备、公开投影与执行分发

`registry.ts` 是唯一映射：

- unknown tool → `TOOL_UNKNOWN`。
- invalid arguments → `TOOL_ARGUMENTS_INVALID`。
- parse 后规范 path/cwd。
- sensitive content path 在准备阶段直接拒绝。
- invocation 与 arguments deep-freeze，并登记在私有 WeakSet。
- forged、clone、JSON round-trip 对象不能执行。
- handler 返回后再次通过 `ToolResultSchema`。
- WorkspaceLayerError 投影已有有限 ErrorInfo。
- unexpected error → `TOOL_INTERNAL_ERROR`。
- Abort error 原样传播。

专用公开投影：

- write：path、contentBytes、contentSha256、expectedSha256?、最多 256-byte 脱敏 preview。
- replace：path、expected hash、old/new bytes、hash 和有限脱敏 preview。
- 其他工具保留必要参数并经过 16 KiB 公共门禁。
- 原始 content/oldText/newText 不作为字段进入事件。

`index.ts` 不导出 raw handlers、atomic helper、adapter、WeakSet、absolute helper、sensitive matcher或内部 error factory。

## 5. 文件变更

### 5.1 新增生产文件

```text
lib/tools/types.ts
lib/tools/dependencies.ts
lib/tools/schemas.ts
lib/tools/output.ts
lib/tools/file-content.ts
lib/tools/sensitive-path.ts
lib/tools/abort.ts
lib/tools/list-directory.ts
lib/tools/read-file.ts
lib/tools/search-text.ts
lib/tools/atomic-write.ts
lib/tools/write-file.ts
lib/tools/replace-in-file.ts
lib/tools/run-process.ts
lib/tools/registry.ts
lib/tools/index.ts
```

### 5.2 新增测试文件

```text
tests/unit/tools/helpers.ts
tests/unit/tools/schemas.test.ts
tests/unit/tools/output.test.ts
tests/unit/tools/file-content.test.ts
tests/unit/tools/sensitive-path.test.ts
tests/unit/tools/list-directory.test.ts
tests/unit/tools/read-file.test.ts
tests/unit/tools/search-text.test.ts
tests/unit/tools/write-file.test.ts
tests/unit/tools/replace-in-file.test.ts
tests/unit/tools/run-process.test.ts
tests/unit/tools/registry.test.ts
```

### 5.3 文档修改/新增

```text
docs/development/06-local-tools-spec.md
docs/development/06-local-tools-tasks.md
docs/development/06-local-tools-summary.md
docs/development/README.md
```

阶段 05 Summary 的状态固化属于用户批准后的生命周期记录。没有删除文件。

### 5.4 未修改

```text
package.json
pnpm-lock.yaml
tsconfig.json
vitest.config.mts
next.config.ts
playwright.config.ts
lib/domain/**
lib/model/**
lib/workspace/**
app/**
```

## 6. 失败、诊断与修正

### 6.1 Task 文档补丁格式失败

- 发生阶段：Task 文档生成。
- 现象：两次 Add File patch 因代码块行缺少补丁前缀而被 `apply_patch` 拒绝。
- 影响：patch 在验证阶段失败，没有产生半个 Task 文件或代码变化。
- 修正：由脚本逐行生成补丁前缀，仍使用 `apply_patch` 写入。
- 复验：Task 文档 639 行、`git diff --check` 通过并经用户批准。

### 6.2 首批共享源码脚本解析失败

- 现象：批量 apply_patch 外层 JavaScript template 与待写 TypeScript template string 冲突，脚本在解析阶段失败。
- 影响：`apply_patch` 未执行，没有生成半成品共享文件。
- 修正：拆小 patch，避免嵌套 template delimiter。
- 复验：共享文件成功创建，随后 typecheck 能进入实际源码检查。

### 6.3 首次静态检查失败

首轮并行结果：

- typecheck：1 个错误。
- lint：0 error、3 warning。

具体问题：

1. `filteredEnvironment` 从空对象逐项构造；Next.js ambient `ProcessEnv` 类型要求 `NODE_ENV`，TypeScript 认为结果可能缺字段。
2. registry 有未使用 `JsonObject` type import。
3. schemas 解构出的 `_schema` 未使用。
4. search catch 参数未使用。

修正：

- 改为 `{ ...process.env }` 后删除敏感 key，不修改原环境。
- 删除未使用 import/catch 参数。
- JSON Schema 改为复制后删除 `$schema`。

复验：`pnpm typecheck` 和 `pnpm lint` 均通过，无 warning。

### 6.4 工具测试通过但并行 typecheck 失败

- 首次工具结果：11 个文件、46 项 Vitest 全部通过。
- 同时 typecheck 失败：测试中对 Vitest 4 `toMatchObject` 使用了不支持的显式泛型参数。
- 修正：删除泛型参数和随之未使用的 type import。
- 复验：typecheck、lint、工具 46 项全部通过。

### 6.5 人工安全审查补强

首次 46 项通过后没有立即结束。对照 Spec 发现：

1. rg 解析后虽会丢弃敏感路径匹配，但 argv 还没有在扫描前直接排除 `*.pem`、`*.key` 等。
2. Node fallback 遇到目录中的 external symlink 会使整个搜索失败，应该跳过该不安全子项。
3. rg 一行多个 submatch 只取第一个，与 Node fallback 多匹配语义不一致。
4. public barrel 缺少直接的私有导出回归断言。
5. process 缺少超长输出 drain/截断与 timeout 的直接回归。
6. fallback 缺少 rg ENOENT 的真实回归。

修正：

- 增加所有批准敏感文件的 rg exclude globs。
- fallback 对非根 WorkspaceLayerError 子项安全跳过。
- 遍历 rg submatches 并逐项计算列号。
- list 对 ignored directory symlink 同样跳过。
- 新增 Node fallback/external symlink、进程 80k 输出、timeout、public barrel 与 deep-freeze 测试。

最终工具测试从 46 增加到 50；全仓从 239 增加到 240。

## 7. 定向测试结果

| 测试命令 | 结果 |
| --- | --- |
| `schemas.test.ts` | 1 文件、6 项通过 |
| `output.test.ts` | 1 文件、3 项通过 |
| `file-content.test.ts` | 1 文件、3 项通过 |
| `sensitive-path.test.ts` | 1 文件、13 项通过 |
| `list-directory.test.ts` | 1 文件、3 项通过 |
| `read-file.test.ts` | 1 文件、3 项通过 |
| `search-text.test.ts` | 1 文件、4 项通过 |
| `write-file.test.ts` | 1 文件、3 项通过 |
| `replace-in-file.test.ts` | 1 文件、2 项通过 |
| `run-process.test.ts` | 1 文件、6 项通过 |
| `registry.test.ts` | 1 文件、4 项通过 |
| `pnpm exec vitest run tests/unit/tools` | 11 文件、50 项通过 |

所有测试退出码为 0。测试包括真实系统临时文件、真实 symlink、真实 direct Node child 和 rg/Node fallback；不触碰真实用户项目。

## 8. 最终整体验证

| 命令/检查 | 最终结果 |
| --- | --- |
| `pnpm lint` | 通过，无 error/warning |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 24 文件、240 项全部通过 |
| `pnpm build` | Next.js 16.3.3 Turbopack 构建成功 |
| 构建路由 | `/` 与 `/_not-found` 静态生成成功 |
| `git diff --check` | 通过 |
| package/lock/config diff | 无差异 |
| 禁止依赖扫描 | 无 Next/React/model/Agent/storage/terminal/UI/Agent framework 导入 |
| process primitive 扫描 | 无 `exec`、`shell:true`、sudo 或 hard reset |
| public barrel 审查 | 无 raw handler、adapter、atomic、sensitive/private helper 导出 |
| 临时目录扫描 | `[]`，无 `secode-tools-test-*` 残留 |
| temp write 检查 | 测试断言无 `.secode-write-*.tmp` 残留 |
| 文件范围检查 | 仅 Task 允许的工具、测试与阶段文档 |

没有执行 Playwright 产品流程、真实模型调用或真实项目命令；这些不属于阶段 06。

## 9. 需求对照

| 需求 | 实现证据 | 验证证据 |
| --- | --- | --- |
| FR-003 | 六 definitions/handlers/registry | 50 项工具测试 |
| FR-004 | prepare/execute 契约 | registry 4 项 |
| FR-005 | summary/output/metadata/error/public projection | output/read/process/registry |
| FR-007 | AbortSignal + 专用中止 | process cancel 与 helper |
| NFR-002 | strict Zod + normalized prepared args | schemas 6 项 |
| NFR-003 | ToolResult factory/workspace/internal mapping | failure suites |
| NFR-005 | 输入限制与 64 KiB 头尾输出 | output/process tests |
| NFR-006 | Node-only `lib/tools` | Vitest/依赖扫描/build |
| NFR-008 | Spec/Task/Summary | 本文 |
| SEC-001/002 | workspace resolvers/symlink policies | list/read/search/write tests |
| SEC-003 | direct spawn + shell false | metacharacter/process scan |
| SEC-006 | sensitive path/redaction/env filter | 13 项 path + process/public tests |
| SEC-007 | full hash/snapshot/revalidate/atomic | write/replace tests与审查 |
| SEC-008 | process 非沙箱限制 | 本文第 11 节 |
| COM-001/002/003 | 自研 Node 工具，无 Agent/托管工具 | 依赖/源码扫描 |

## 10. 与 Spec/Task 的偏差

无未经批准偏差。

文件层面：

- 生产和测试文件与 Task 第 19 节完全一致。
- 没有合并、拆出或重命名额外模块。
- 没有修改批准禁止文件。

行为层面：

- 工具名、参数、默认值、上限、错误族、敏感列表、search fixed-string、hash/atomic、process timeout/kill grace 与 Spec/Task 一致。
- rg `toJSONSchema` target 使用 Zod 实际接受的字符串 `draft-7`，语义即批准的 Draft-07；不是协议变更。
- search 安全补强只完善已批准的敏感排除和引擎一致性。
- 测试数量不是预先固定验收项；补强后增加至 50。

## 11. 安全检查与已知限制

安全检查结果：

- 所有 file path/cwd 先规范并在执行时调用 workspace resolver。
- path escape、sensitive path 和 invalid handle 不可通过阶段 07 审批绕过。
- write/replace 同时使用路径快照和完整内容 hash。
- temp 位于 revalidate 目标真实 parent，`wx` 独占创建、sync 后 rename。
- 失败不 unlink target、不 direct overwrite、不 broad cleanup。
- run_process 固定 shell false，args 独立，不接受 env/stdin。
- 子进程不继承应用 API Key/token/password/authorization 变量。
- output、public arguments、errors 均有限并脱敏。
- public barrel 不暴露明显内部绕过入口。

已知限制：

1. Node 标准 API 不能完全消除最终复验/hash 与 rename 间的恶意本机 TOCTOU。
2. rename 覆盖存在平台差异；失败时返回错误，不做非原子回退。
3. rg 与 Node fallback 在复杂 Unicode case-fold 可能有差异。
4. 目录 symlink 不递归，可能遗漏通过内部别名才能看到的重复目录。
5. read/search 2 MiB、write/replace 1 MiB 会拒绝大型生成物。
6. 敏感文件名策略可能拒绝用户确实想编辑的配置，首版不审批绕过。
7. 通用秘密脱敏是启发式，不能证明识别任意格式秘密。
8. 获批进程仍能主动读写工作区外、联网或访问本机凭据。
9. timeout/cancel 只管理直接 child，不承诺清理自行脱离的全部后代。
10. raw executor 是进程内能力，不是授权边界；生产入口必须经过阶段 07。

## 12. 反思与后续阶段影响

### 12.1 本阶段反思

1. “结果不公开敏感数据”弱于“根本不扫描敏感文件”；安全边界应尽可能前移到 argv/遍历层。
2. 双引擎 fallback 不能只比较是否找到文本，还要比较一行多匹配、列号、symlink 和 limit 语义。
3. 原子写保护需要路径身份与内容 hash 两条线；同 inode 内容变化证明仅比较 dev/ino 不够。
4. Abort 与 commit 的顺序是事实问题。rename 成功后必须报告成功，不能因稍后 signal 到达谎报未修改。
5. stream 截断不能停止 drain，否则高输出命令会因 pipe 背压挂死。
6. public barrel 测试比只看 export 列表可靠，能同时证明 prepared→execute 模块流程。
7. 测试通过后人工对照 Spec 仍然必要；本阶段 4 项安全/一致性补强来自此步骤。

### 12.2 阶段 07 硬约束

阶段 07 必须：

- 只分类 `prepareLocalToolCall` 成功产生的 `PreparedLocalToolInvocation`。
- prepare 失败直接产生 ToolResult，不进入审批。
- `list_directory`、`read_file`、`search_text` 为只读候选。
- `write_file`、`replace_in_file` 为工作区内自动记录变更候选，但敏感/path escape 永不审批绕过。
- `run_process` 必须按 program+args 结构分类，不能把它拼成 command string。
- 只有风险结论允许后才调用 `executePreparedLocalTool`。
- shell、未知程序、安装、Git 写等必须审批；sudo、系统控制、宽泛删除、hard reset 直接拒绝。
- 审批等待后 executor 内部仍会重新 resolve/hash/revalidate。
- 拒绝操作不调用 executor。
- 风险与审批测试继续只使用 prepared 调用和 temp fixture，不引入 CLI/UI。

### 12.3 对阶段 09/11/13/14 的约束

- JSONL/事件只保存 publicArguments 和有限 ToolResult。
- Agent 对 `LocalToolExecutionAbortedError` 进入 cancelled，不反馈模型重试。
- Agent 串行执行工具。
- 终端/API/UI 不直接 import raw handler。
- 终端先通过阶段 07 风险层，再调用 executor。
- UI 不能依赖原始 write/replace 内容恢复完整 diff，只能使用批准的 preview/hash/bytes。

## 13. Summary 内部门禁

- [x] Spec 与 Task 均有明确用户批准记录。
- [x] T06-00 至 T06-13 全部完成。
- [x] 实现、接口、安全策略和文件范围与批准文档一致。
- [x] 首次文档/脚本/type/lint/test-type 问题均如实记录并复验。
- [x] 11 个工具 suite、50 项全部通过。
- [x] 全仓 24 个文件、240 项测试全部通过。
- [x] lint、typecheck、build、diff check 全部通过。
- [x] workspace/sensitive/hash/atomic/spawn/abort/output 有直接测试与审查。
- [x] 无依赖/配置/后续阶段修改，无真实项目操作。
- [x] 临时目录和进程全部回收。
- [x] 已记录限制、反思和阶段 07 硬约束。
- [x] 开发索引将更新为“阶段 06 Summary 待用户审批”。

**Summary 内部门禁：通过。当前状态：已批准。**

## 14. 用户审批区

请重点审阅：

1. prepare → risk → execute 三段式是否满足阶段 07 插入审批。
2. 敏感路径直拒和写入公开 preview 是否符合数据最小化预期。
3. expected hash + writable snapshot + 二次 hash + atomic rename 是否满足本地单用户保护。
4. fixed-string rg/Node fallback 与不递归目录 symlink 是否可接受。
5. run_process 环境过滤、2 秒 kill grace 和直接 child 限制是否清楚。
6. 是否批准阶段 06 Summary，从而只解锁阶段 07 的只读观察与 Spec。

批准前不会开始阶段 07。可回复“阶段 06 Summary 批准”或语义等价批准。

## 15. 用户审批记录

- 2026-08-27：用户明确回复“批准”，阶段 06 Summary 获批。
- 解锁范围：阶段 06 正式完成；只解锁阶段 07 的只读观察与 `07-risk-approval-spec.md`。
- 仍然禁止：阶段 07 Spec 获批前不得生成 Task、风险/审批代码、测试或 Summary。
