# 阶段 06 Task：本地工具系统

## 1. 文档状态与审批链

- 当前状态：已批准。
- 依据 Spec：[06-local-tools-spec.md](./06-local-tools-spec.md)，已获用户批准。
- Spec 批准日期：2026-08-27。
- 当前子阶段：任务拆分与实现计划。
- 本文获批前不得创建 `lib/tools`、`tests/unit/tools` 或阶段 06 Summary，不得修改依赖和后续阶段业务。
- 本文获批后只允许按 T06-00 至 T06-13 的顺序开发、验证和总结。

审批链：

1. 阶段 05 Summary 获用户批准，只解锁阶段 06 观察与 Spec。
2. 阶段 06 Spec 获用户批准，锁定六工具接口、限制、敏感路径、固定字符串搜索、哈希/原子写、进程和阶段边界。
3. 当前仅生成 Task；用户批准 Task 前不执行生产代码或测试文件变更。

## 2. 任务目标与执行链

严格实现已批准 Spec，使后续风险层和 Agent 使用唯一流程：

```text
ToolCall
  → prepareLocalToolCall
  → PreparedLocalToolInvocation + publicArguments
  → 阶段 07 风险/审批（本阶段不实现）
  → executePreparedLocalTool
  → ToolResult 或 LocalToolExecutionAbortedError
```

阶段结束时必须具备：六个 strict Zod Schema、模型 definitions、不可伪造 prepared invocation、工具专用公开投影、六个 Node handler、64 KiB 输出限制、稳定错误、工作区/敏感路径/哈希/原子写/无 shell 边界，以及只操作临时工作区的完整测试。

## 3. 已批准且不得重新决定的事项

1. 工具固定为 `list_directory`、`read_file`、`search_text`、`write_file`、`replace_in_file`、`run_process`。
2. path/cwd 只接受阶段 05 正斜线相对路径协议。
3. list depth 默认 1/最大 4；条目默认 200/最大 1000。
4. read/search 单文件最大 2 MiB；write/replace 结果最大 1 MiB。
5. search 只支持 fixed string；优先 rg，只有 spawn ENOENT 才 fallback。
6. 覆盖 existing 文件必须提供 64 位小写 `expectedSha256`；missing create 不得提供。
7. write/replace 必须同目录 `wx` temp、sync、二次路径/内容复验和 atomic rename。
8. `.git/**`、`.secode-data/**`、非模板 `.env*`、常见凭据/私钥为不可审批绕过的敏感路径。
9. `run_process` 不接受 shell/env/stdin，cwd 在工作区，默认 120 秒、最大 600 秒。
10. 外部取消抛专用中止错误；timeout/非零退出返回 ToolResult。
11. 风险分类属于阶段 07；本阶段不实现临时 allowlist。
12. 工具是可信本地应用边界，不宣称 OS sandbox 或完整后代进程树隔离。

实现若必须改变任一项，应立即停止并回到 Spec 修订。

## 4. 任务依赖与总览

```text
T06-00 前置复核
  → T06-01 常量/类型/错误/依赖
  → T06-02 Schema/definitions
  → T06-03 输出/文本/哈希/敏感路径
  → T06-04 list
  → T06-05 read
  → T06-06 search
  → T06-07 atomic/write
  → T06-08 replace
  → T06-09 process
  → T06-10 registry/barrel
  → T06-11 完整测试补强
  → T06-12 整体验证/反思
  → T06-13 Summary
```

| 任务 | 主要输出 | 最小验证 |
| --- | --- | --- |
| T06-00 | 只读复核记录 | 文档/状态/依赖检查 |
| T06-01 | `types.ts`、`dependencies.ts` | typecheck/依赖扫描 |
| T06-02 | `schemas.ts` | schemas suite |
| T06-03 | 共享安全与内容模块 | 3 个 helper suite |
| T06-04 | list handler | list suite |
| T06-05 | read handler | read suite |
| T06-06 | rg/fallback handler | search suite |
| T06-07 | atomic core/write handler | write suite |
| T06-08 | replace handler | replace suite |
| T06-09 | process handler | process suite |
| T06-10 | prepare/execute/public barrel | registry suite |
| T06-11 | 全工具回归 | tools 全量 |
| T06-12 | 验证与审查记录 | 全仓门禁 |
| T06-13 | Summary | 文档/索引检查 |

实际开发严格按编号串行。

## 5. T06-00：开发前复核

### 输入与动作

- 逐条复核已批准 `00-process.md`、阶段 03/05 文档、阶段 06 Spec 和本 Task。
- 按仓库 `AGENTS.md` 阅读当前 Next.js 16.3.3 本地文档：
  - `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`
  - `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md`
- 检查 Git 状态并保留阶段 00–05 既有修改。
- 确认 package、lockfile、TS/Vitest/Next 配置无需修改。
- 确认本 Task 已获用户批准，否则停止。

### 输出与完成条件

- 只读复核事实最终写入 Summary；不修改生产/测试文件。
- 文件范围、接口、安全决策无未决问题；有变化则退回审批。

## 6. T06-01：常量、类型、错误与依赖边界

### 需求与文件

- 覆盖：`FR-003/004/007`、`NFR-002/003/005/006`、`COM-003`。
- 新增：`lib/tools/types.ts`、`lib/tools/dependencies.ts`。

### 实现清单

1. 集中定义 Spec 全部限制常量，不在 handler 散落数值。
2. 定义六工具名 tuple、`LocalToolName`、稳定 `LOCAL_TOOL_ERROR_CODES`。
3. 定义仅含 `workspace`、`signal` 的 `LocalToolExecutionContext`。
4. 定义按工具名判别的 `PreparedLocalToolInvocation`；write/replace 原文只存在该内存对象。
5. 定义 `PrepareLocalToolCallResult` 成功/失败联合。
6. 实现 `LocalToolExecutionAbortedError`；cause 不可枚举。
7. 实现内部 error/result factory，所有结果经 `ToolResultSchema`。
8. error details strict allowlist：toolName、relativePath、reason、limit、actual、matches、exitCode、signal、timeoutMs、truncated。
9. `dependencies.ts` 只定义最小 fs/spawn/UUID/clock adapter 和 Node 默认值。
10. adapter、Node 原对象、内部 error helper 不从公共 barrel 导出。

### 完成条件与最小验证

- public type 无 absolutePath、env、shell、authorization、Agent/日志依赖。
- 错误无 stack、syscall、cause message、Node path。
- T06-01 自身可编译，不留指向未创建模块的 placeholder。
- 运行 `pnpm typecheck` 和禁止依赖扫描。

## 7. T06-02：六工具 Schema 与模型 definitions

### 需求与文件

- 覆盖：`FR-003/004`、`NFR-002/003`、`COM-003`。
- 新增：`lib/tools/schemas.ts`、`tests/unit/tools/schemas.test.ts`。

### 实现清单

1. 六参数均用 `z.strictObject`；字符串同时执行 UTF-8 byte 限制。
2. 固定字段/默认值：

```text
list_directory: path=".", depth=1, limit=200
read_file: path, startLine=1, endLine?
search_text: query, path=".", caseSensitive=true, limit=100
write_file: path, content, expectedSha256?
replace_in_file: path, oldText, newText, expectedSha256
run_process: program, args=[], cwd=".", timeoutMs=120000
```

3. 交叉校验：endLine>=startLine；oldText 非空且不等于 newText；hash 为 64 位小写 hex；args<=128 且总字节<=32 KiB；program 无 NUL/控制字符。
4. path/cwd 在 parse 后明确调用 `normalizeWorkspaceRelativePath`；执行时仍重新走 resolver。
5. Schema 不用无法表示的 transform；用 Zod 4 `toJSONSchema` 生成 Draft-07，不手写第二份结构。
6. 六 definitions 固定顺序，描述相对路径、限制、hash、fixed search 和无 shell；最终经 `ToolDefinitionSchema`。

### 测试与完成条件

- 唯一名称/顺序/JSON round-trip、object/additionalProperties/required 一致。
- 默认、最小、最大和越界；extra key、错误类型、中文 byte、控制字符、args/hash/range/replace 交叉错误。
- definitions 不含 workspace、signal、absolutePath、env、shell、adapter。
- `pnpm exec vitest run tests/unit/tools/schemas.test.ts` 通过。

## 8. T06-03：输出、文本、哈希、敏感路径与中止

### 需求与文件

- 覆盖：`FR-005/007`、`NFR-003/005`、`SEC-006/007`。
- 新增：

```text
lib/tools/output.ts
lib/tools/file-content.ts
lib/tools/sensitive-path.ts
lib/tools/abort.ts
tests/unit/tools/helpers.ts
tests/unit/tools/output.test.ts
tests/unit/tools/file-content.test.ts
tests/unit/tools/sensitive-path.test.ts
```

### 实现清单

1. UTF-8 头/标记/尾截断，总大小含标记且<=64 KiB，多字节不破坏。
2. 返回 value/truncated/originalBytes/returnedBytes；流 accumulator 不保留无界数据但允许 drain。
3. 公开文本先 `redactSecrets` 再计算公开大小。
4. 实现原始 bytes SHA-256 小写 hex、2 MiB 读取前 gate、fatal UTF-8、NUL/binary 拒绝。
5. 固定空文件、BOM、CRLF、末行无换行和 1-based inclusive line slice；hash 始终基于 raw bytes。
6. 敏感判断只接收规范路径，按 segment/basename 匹配；允许 `.env.example/.sample/.template`，拒绝批准列表。
7. 避免 substring 误拒 `src/env.ts`、`monkey.ts` 等。
8. 统一 `throwIfAborted`/listener cleanup；不把普通 Error 误判为取消。
9. 测试 helper 只创建并登记 `tmpdir()/secode-tools-test-*`；cleanup 验证 parent、前缀、登记集合，只删除确切 fixture。

### 测试与完成条件

- 64 KiB 恰好/超限、中文边界、头尾保留、脱敏后 byte metadata。
- crypto 已知向量、2 MiB 边界、invalid UTF-8、NUL、BOM/CRLF/line slice。
- 敏感正例、合法相似反例、abort 单次清理、helper broad-path 拒绝。
- 三个 suite 通过，temp 无残留；模块不依赖模型/Agent/API/UI。

## 9. T06-04：`list_directory`

### 需求与文件

- 覆盖：`FR-003/005/007`、`SEC-001/002`。
- 新增：`lib/tools/list-directory.ts`、`tests/unit/tools/list-directory.test.ts`。

### 实现清单

1. 起点 existing resolve 为 directory；显式 breadth-first queue，depth 表示返回子项层数。
2. `readdir(withFileTypes)` 后按规范 relativePath 代码点稳定排序。
3. 每个输出/递归子项再次 existing resolve。
4. 任意层忽略 `.git/.secode-data/node_modules/.next` 并计数。
5. internal symlink 显示但不递归；outside/dangling/loop 显示 blocked，不泄露目标。
6. 不支持名称不输出原文，只计数。
7. limit/output 达到为成功 truncated；Abort 抛专用错误。
8. metadata：path、depth、returnedEntries、truncated、ignoredEntries、blockedEntries、unsupportedEntries。

### 测试与完成条件

- root/nested/中文/稳定排序/depth/limit/ignored/symlink/prefix/目录替换/非目录/escape/取消/两种截断。
- POSIX 才验证不支持文件名；其他平台记录条件。
- 无 root/raw absolute 拼接绕过，无 absolutePath 输出。
- `pnpm exec vitest run tests/unit/tools/list-directory.test.ts` 通过。

## 10. T06-05：`read_file`

### 需求与文件

- 覆盖：`FR-003/005/007`、`NFR-005`、`SEC-001/002/006/007`。
- 新增：`lib/tools/read-file.ts`、`tests/unit/tools/read-file.test.ts`。

### 实现清单

1. 敏感路径检查后 existing resolve 为 file。
2. 复用有限文本读取取得 raw bytes/text/hash/line count。
3. startLine 默认 1，endLine 默认末行；startLine 超总行数返回可恢复范围错误。
4. selected text 脱敏后再头尾截断；不插入人工行号。
5. metadata：relative path、startLine、endLine、totalLines、sha256、truncated、originalBytes、returnedBytes。
6. hash 只基于完整未脱敏 raw bytes，不对 slice/公开输出计算。

### 测试与完成条件

- 完整/区间/空/CRLF/BOM/末行/中文、slice/截断不改 hash。
- 越界、目录、2 MiB+1、NUL、invalid UTF-8、敏感路径、内部/外部 symlink、Abort/I/O 泄露。
- output<=64 KiB 且 ToolResult 合法。
- `pnpm exec vitest run tests/unit/tools/read-file.test.ts` 通过。

## 11. T06-06：`search_text`

### 需求与文件

- 覆盖：`FR-003/005/007`、`NFR-005`、`SEC-001/002/003/006`。
- 新增：`lib/tools/search-text.ts`、`tests/unit/tools/search-text.test.ts`。

### rg 实现

1. 起点 existing resolve，允许 file/directory；cwd 为真实目录，目标 argv 为 basename 或 `.`。
2. 固定 `spawn("rg", argv, { shell: false })`；query 单独 argv。
3. 使用 JSON/line/column/no-color/fixed/case/ignore 参数；不 follow symlink、不 hidden 全扫。
4. 增量 UTF-8/JSONL parser 保留半行并限制单行大小，只处理 match。
5. 输出 path 重新映射为 workspace relativePath 并规范化。
6. exit 0/1/>1 按 Spec；只有 child error ENOENT fallback。
7. global match/output limit 用内部 stop reason，返回成功 truncated，不混淆用户取消。

### Node fallback

8. 显式稳定 queue，不依赖 recursive readdir；每项走 resolver，目录 symlink 不递归。
9. 复用 ignore/sensitive/2 MiB/UTF-8 helpers；binary/large 计数跳过。
10. 最多 10,000 文件；固定字符串逐行查找，输出 1-based line/column，多匹配按列。
11. case-insensitive 固定普通 Unicode lower-case 行为。

### 测试与完成条件

- rg 任意 chunk、半行、malformed/oversized JSON、exit 0/1/2、ENOENT/EACCES。
- query 含引号、空格、分号、`$()`、pipe/redirect 仍为独立 argv。
- file/dir、中文、多列、两引擎一致、ignore/sensitive/symlink/binary/large/10k limits。
- internal limit 与 Abort 区分；无 shell command/absolute path/raw error。
- `pnpm exec vitest run tests/unit/tools/search-text.test.ts` 通过。

## 12. T06-07：原子核心与 `write_file`

### 需求与文件

- 覆盖：`FR-003/005/007`、`SEC-001/002/006/007`。
- 新增：`lib/tools/atomic-write.ts`、`lib/tools/write-file.ts`、`tests/unit/tools/write-file.test.ts`。

### 原子算法

1. helper 只接收 workspace、规范 path、目标 bytes、expected/create 语义、signal。
2. `resolveWritableWorkspacePath` 并保留原快照。
3. existing 受限读/hash；缺 hash 或 mismatch 为 `FILE_STALE`，不建 temp。missing 带 hash 参数失败。
4. 新旧 bytes 相同返回 changed:false，但必须已完成 path/hash 校验。
5. parentPath 内 `open("wx")` 创建 `.secode-write-<uuid>.tmp`；碰撞有限重试，不扫描其他 temp。
6. write 全部→sync→close；existing 保留权限位，create 使用 `0o666 & ~process.umask()`。
7. revalidate 原 writable；existing 再读并比 expected hash，missing 确认仍不存在。
8. rename 前最后 abort；rename 后立即标记 committed。
9. rename 失败为 `FILE_ATOMIC_WRITE_FAILED`，禁止 unlink/direct overwrite fallback。
10. finally 只清当前 helper 确切未 committed temp；cleanup 错误不覆盖主错误。
11. committed 后才观察到 abort 时返回真实成功。

### write handler

12. 敏感路径检查；content UTF-8<=1 MiB；只调用唯一 atomic helper。
13. metadata：relativePath、operation、changed、beforeSha256?、afterSha256、bytes；不输出完整内容。

### 测试与完成条件

- create/overwrite/no-op/空/中文/换行；missing/existing hash 组合、wrong hash、1 MiB+1。
- target create/delete/replace、same-inode content change、parent replace、final symlink。
- wx collision、权限、write/sync/close/revalidate/re-read/rename 每个失败点、各 abort 时点。
- 目标状态真实、temp 无残留；源码无 unlink target/非原子 fallback。
- `pnpm exec vitest run tests/unit/tools/write-file.test.ts` 通过。

## 13. T06-08：`replace_in_file`

### 需求与文件

- 覆盖：`FR-003/005/007`、`SEC-001/002/006/007`。
- 新增：`lib/tools/replace-in-file.ts`、`tests/unit/tools/replace-in-file.test.ts`。

### 实现清单

1. 敏感检查，existing UTF-8 text，比较 expected hash。
2. `indexOf` 从每个下一 code-unit 起点继续，第二次即停止，覆盖重叠匹配。
3. 0 次为 `FILE_MATCH_NOT_FOUND`，2+ 为 `FILE_MATCH_NOT_UNIQUE`，均不建 temp。
4. 用唯一 start/end slice 生成新文本，不用 regex replace；结果 UTF-8<=1 MiB。
5. 只调用 T06-07 atomic helper，它再次执行 path/hash final checks。
6. metadata：beforeSha256、afterSha256、changed:true、replacedOccurrences:1、bytes；无原文。

### 测试与完成条件

- 唯一 ASCII/中文/跨行、0/2/重叠2、old===new、stale、binary、大小、敏感。
- target/parent 竞态、atomic 失败、Abort；失败文件不变且 temp 无残留。
- 不存在第二套 direct write/rename。
- `pnpm exec vitest run tests/unit/tools/replace-in-file.test.ts` 通过。

## 14. T06-09：`run_process`

### 需求与文件

- 覆盖：`FR-003/005/007`、`NFR-003/005`、`SEC-001/003/006/008`。
- 新增：`lib/tools/run-process.ts`、`tests/unit/tools/run-process.test.ts`。

### 实现清单

1. cwd existing resolve 为 directory。
2. 从 `process.env` 建副本，大小写不敏感删除含 API_KEY/TOKEN/SECRET/PASSWORD/AUTHORIZATION 的 key；不修改原 env，不接收自定义 env。
3. 固定 `spawn(program, args, { cwd: absolutePath, shell: false, stdio: ["ignore", "pipe", "pipe"], env })`。
4. 不用 command string/exec，不做引号、变量、glob 解析。
5. stdout/stderr chunk 分配单调序号、加 stream 标签、进入有限 accumulator，同时持续 drain。
6. 单一 settle 状态机处理 error/close/timeout/abort，listener/timer 只清理一次。
7. timeout 发送 SIGTERM，固定 2 秒后仍未退出再 SIGKILL，返回 `PROCESS_TIMEOUT`。
8. external abort 使用同一终止动作但抛专用错误。
9. exit 0 成功；非零/信号为 `PROCESS_EXIT_NONZERO`；spawn 失败为 `PROCESS_SPAWN_FAILED`。
10. metadata：脱敏 program、cwd relative、durationMs、exitCode、signal、timedOut、truncated、byte counts。
11. 不用 detached/process group，只管理直接 child。

### 测试与完成条件

- `process.execPath` 回显 argv；shell metacharacter 仅普通参数。
- cwd 正常/absolute/`..`/file/outside symlink。
- stdout/stderr/中文 split/64 KiB 后 drain；exit0/非零/signal/ENOENT/EACCES。
- pre/mid abort、timeout、TERM 后退出、需 KILL adapter、所有竞态单次 settle。
- fake provider keys/token/password/authorization 不到 child，PATH/普通变量保留；输出/args 脱敏。
- 无挂起 child/timer/listener；唯一 primitive 为 spawn + shell false。
- `pnpm exec vitest run tests/unit/tools/run-process.test.ts` 通过。

## 15. T06-10：注册表、公共投影、执行分发与 barrel

### 需求与文件

- 覆盖：`FR-003/004/005`、`NFR-002/003/006`、`SEC-006`、`COM-003`。
- 新增：`lib/tools/registry.ts`、`lib/tools/index.ts`、`tests/unit/tools/registry.test.ts`。

### 实现清单

1. 唯一 registry 绑定 name、Schema、definition、projector、handler。
2. `prepareLocalToolCall` 先生成 safe fallback public args；unknown 返回 `TOOL_UNKNOWN`；strict parse 失败返回 `TOOL_ARGUMENTS_INVALID` 和有限 issue。
3. parse 成功后规范 path/cwd并做敏感路径早拒；构造 deep-frozen invocation，登记到私有 WeakSet。
4. read/list/search/process 投影只保留批准字段；write/replace 用 bytes/hash/256-byte 脱敏 preview 替代原文；最后经 16 KiB 公共门禁。
5. `executePreparedLocalTool` 只接受当前 WeakSet 对象；伪造/clone/JSON round-trip/篡改/跨 registry 不执行。
6. 执行前检查 signal，按 name 分发；结果再过 `ToolResultSchema`。
7. workspace error 投影其 ErrorInfo；未知异常为有限 `TOOL_INTERNAL_ERROR`；abort 原样传播。
8. public barrel 只导出：工具名/限制/错误码/公共类型、六 Schema/参数类型、definitions、prepare、execute、专用 abort error。
9. 不导出 raw handler、atomic helper、adapter、WeakSet、absolute helper、sensitive matcher、内部 error factory。

### 测试与完成条件

- 六 prepare/default/normalized path；unknown/invalid/extra key 都有安全公开参数和失败结果。
- write/replace 无完整原文，preview/hash/bytes 正确，秘密/16 KiB 有限化。
- invocation 不可伪造/篡改；六 handler 分发、workspace/internal/invalid result/abort 路径。
- public barrel 可在 temp workspace 完成 list→read→create→replace 模块流程且无私有导出。
- 阶段 07 可检查 prepared invocation 后决定是否调用 executor。
- `pnpm exec vitest run tests/unit/tools/registry.test.ts` 通过。

## 16. T06-11：完整测试矩阵与安全补强

### 允许动作

- 只修改 T06-01–10 已列 `lib/tools/**`、`tests/unit/tools/**`，补覆盖或修复批准范围内缺陷。
- 不借补强改变参数、安全策略、限制或阶段范围。

### 检查清单

1. 对照 Spec 第 22/23 节逐项建立直接测试证据。
2. 每个 ToolResult 执行 Schema 和 JSON round-trip。
3. 扫描公开值不得含 fixture/temp absolute path、stack/syscall、fake secrets、write/replace 完整原文。
4. 注入每个失败点验证 cleanup，不以 chmod 作为唯一权限证据。
5. tempdir 最终无 `secode-tools-test-*`/`.secode-write-*.tmp`。
6. 依赖/public barrel 无后续阶段或私有 adapter。
7. 生产源码无 `exec`/shell true/command 拼接/untrusted absolute fs/cwd/unlink target/非原子 fallback/无界 buffer。

### 最小验证与完成条件

- `pnpm exec vitest run tests/unit/tools` 全部通过。
- 不通过放宽断言、skip、删除安全测试制造成功。
- 所有临时目录/进程/timer/listener 回收。

## 17. T06-12：整体验证、差异审查与反思

### 验证顺序

```text
pnpm exec vitest run tests/unit/tools/schemas.test.ts
pnpm exec vitest run tests/unit/tools/output.test.ts
pnpm exec vitest run tests/unit/tools/file-content.test.ts
pnpm exec vitest run tests/unit/tools/sensitive-path.test.ts
pnpm exec vitest run tests/unit/tools/list-directory.test.ts
pnpm exec vitest run tests/unit/tools/read-file.test.ts
pnpm exec vitest run tests/unit/tools/search-text.test.ts
pnpm exec vitest run tests/unit/tools/write-file.test.ts
pnpm exec vitest run tests/unit/tools/replace-in-file.test.ts
pnpm exec vitest run tests/unit/tools/run-process.test.ts
pnpm exec vitest run tests/unit/tools/registry.test.ts
pnpm exec vitest run tests/unit/tools
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

### 额外审查

- diff 与第 19 节文件范围逐项比对；package/lock/TS/Vitest/Next/Playwright 配置无差异。
- `lib/tools` 不导入 Next/React/model client/Agent/storage/terminal/UI 或 Agent framework。
- 无 `.env`、真实 Key/Token/Cookie、真实项目输出。
- 无 Route Handler、Client Component、CLI/UI；temp 最终无残留。
- 反思 registry 对阶段 07 是否足够、rg/fallback 语义、atomic 失败事实、abort/commit 竞态、进程环境/输出限制。

### 失败处理与完成条件

- 记录首次失败、根因、修正，重跑失败命令及受影响 suite。
- 不改配置规避，不降低限制/断言，不把错误捕获成 success。
- 需新依赖、接口、安全策略、文件范围或验收变化时停止重新审批。
- 所有命令退出 0，审查通过，才能进入 T06-13。

## 18. T06-13：Summary

### 允许文件

```text
docs/development/06-local-tools-summary.md
docs/development/README.md
```

### 必须内容

- Spec/Task 用户批准记录、T06-00–13 状态、六工具与共享模块开发过程。
- 实际文件清单、所有定向/tools/全仓/lint/typecheck/build/diff 结果。
- 首次失败、诊断、修复与复验；偏差与审批情况。
- absolutePath/secret/temp/process/shell/atomic 审查、已知限制、阶段 07 硬约束与反思。

完成后索引改为“阶段 06 Summary 待用户审批”并立即停止；不得观察阶段 07。

## 19. 文件范围

### 新增生产文件

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

### 新增测试文件

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

### 文档文件

```text
docs/development/06-local-tools-spec.md
docs/development/06-local-tools-tasks.md
docs/development/06-local-tools-summary.md
docs/development/README.md
```

### 禁止修改

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

若已批准接口无法编译且需改 domain/workspace，不得顺手修复，应停止并重新审批。

## 20. 需求追踪

| 需求 | 主要任务 | 直接验证 |
| --- | --- | --- |
| FR-003 | T06-02、04–10 | 六 handler/registry |
| FR-004 | T06-01、02、10 | prepare/execute flow |
| FR-005 | T06-03–10 | output/public/result |
| FR-007 | T06-03–09 | abort suites |
| NFR-002 | T06-01、02、10 | strict/forgery |
| NFR-003 | T06-01、03–10 | failure paths |
| NFR-005 | T06-01、03–10 | limits/64 KiB |
| NFR-006 | T06-01–12 | Node/import scan |
| NFR-008 | T06-00、12、13 | docs/evidence |
| SEC-001 | T06-04–10 | workspace/cwd |
| SEC-002 | T06-04–08 | symlink |
| SEC-003 | T06-06、09 | argv/shell scan |
| SEC-006 | T06-03、05–10 | path/redaction/env |
| SEC-007 | T06-03、05、07、08 | hash/stale/atomic |
| SEC-008 | T06-09、12、13 | limitation evidence |
| COM-001/002/003 | T06-01–12 | dependency/source scan |

## 21. 回退与恢复

### 审批回退

- 接口、安全、限制、验收变化：停止，Spec 改为用户要求修订，Task 审批失效。
- 仅文件拆分/顺序/局部策略变化：停止，修订 Task 并重新审批。
- Summary 如实记录失败/批准偏差，不回写历史伪装原计划。

### 实现/测试恢复

- 每项完成时保持可编译，不留永久 placeholder/TODO handler/类型跳过。
- atomic 失败先确认目标/temp，再清登记 fixture；禁止 broad rm。
- process 失败只终止确切 child，禁止 killall/pkill。
- helper cleanup + 前缀扫描双确认；不覆盖先前/用户修改。

### 禁止的“修复”

- 不增加 Agent SDK、文件/进程/shell/glob/diff/rg wrapper 依赖。
- 不用 shell true、absolutePath 暴露、取消 hash/revalidate、原始 Node error。
- 不允许敏感路径审批绕过，不扩大测试到当前仓库或真实项目。

## 22. 明确不执行

- 风险分类/审批、JSONL/Session、Agent/上下文、CLI/readline、模型 smoke、Next Route/NDJSON/React/UI。
- 真实工作区命令或修改、install、Git commit/push、部署、发布、视频。
- regex search、删除、建目录、chmod、Git/patch 工具。
- 依赖/配置/domain/model/workspace 协议修改。

## 23. 开发记录模板

每项最终写入 Summary：

```text
任务：T06-XX
对照 Spec：第 X 节
修改文件：...
最小验证：...
首次结果：通过/失败
失败证据/根因/修正/复验：...
偏差：无/已停止重新审批
```

不得只保留最终成功而丢弃真实失败过程。

## 24. Task 审批确认项

批准即授权：

1. 按 T06-00–13 串行实施，限第 19 节文件。
2. 使用 Node 原生 fs/crypto/child_process 和现有 Zod，不新增依赖。
3. 临时 fixture 内可创建/覆盖/原子替换/清理文件。
4. 可用 `process.execPath`/adapter 测试非零、timeout、取消，但不运行真实项目命令。
5. 失败按第 21 节处理，规格级变化先停止重新审批。
6. 完成实现/验证/反思后生成 Summary 并等待独立审批。

## 25. Task 内部门禁

- [x] 已记录阶段 06 Spec 用户批准。
- [x] 任务按依赖顺序，均有输入/输出/文件/动作/测试/完成条件。
- [x] 接口、安全和限制没有留待编码决定。
- [x] 文件范围、禁止范围和不执行工作明确。
- [x] 测试、失败、回退、temp/process cleanup 明确。
- [x] 需求映射到实现和验证。
- [x] 本轮未创建生产代码、测试或 Summary，未修改依赖/配置。
- [x] 索引将更新为“阶段 06 Task 待用户审批”。

**Task 内部门禁：通过。当前状态：已批准。**

## 26. 用户审批区

请重点审阅：T06-01–10 顺序和文件范围、T06-07/08 原子竞态、T06-09 直接子进程/2 秒 kill 宽限/环境过滤、T06-10 WeakSet 与公共导出、第 19/22 节范围。

若批准，将开始阶段 06 实际开发与验证，完成后另交 Summary 审批。可回复“阶段 06 Task 批准”或语义等价批准。

## 27. 用户审批记录

- 2026-08-27：用户明确回复“批准”，阶段 06 Task 获批。
- 解锁动作：允许按 T06-00 至 T06-13 的顺序实施、验证并生成阶段 06 Summary。
- 文件与安全边界：严格限制在第 19、21、22 节；任何规格级变化必须停止并重新审批。
