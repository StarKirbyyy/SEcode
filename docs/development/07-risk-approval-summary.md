# 阶段 07：风险分级与审批 Summary

## 1. 文档状态与审批链

- 当前状态：待用户审批
- 完成日期：2026-08-27
- 批准的 Spec：[07-risk-approval-spec.md](./07-risk-approval-spec.md)
- 批准的 Task：[07-risk-approval-tasks.md](./07-risk-approval-tasks.md)
- Spec 状态：已批准
- Task 状态：原版与修订 1 均已批准
- 后续门禁：本 Summary 获批前不得开始阶段 08 观察

审批链：

1. 用户批准阶段 06 Summary，解锁阶段 07 只读观察。
2. 用户批准阶段 07 Spec，确认三态风险、命令矩阵、一次性能力与受控 gateway。
3. 用户批准阶段 07 Task，授权执行 T07-00 至 T07-11。
4. T07-00 后发现测试 helper 文件白名单缺口，按流程暂停。
5. 用户批准 Task 修订 1，只增加 `tests/unit/tools/helpers.ts` 的 import 调整权限。
6. 实现、最小测试、全量验证和反思修正完成，提交本 Summary 审批。

## 2. 阶段结果

阶段 07 已建立完整生产调用链：

```text
ToolCall
  → prepareLocalToolCall
  → PreparedLocalToolInvocation
  → requestLocalToolAuthorization
     ├─ allow → AuthorizedLocalToolInvocation
     ├─ require_approval → PendingToolApproval
     │                      ├─ approve → AuthorizedLocalToolInvocation
     │                      └─ reject → TOOL_APPROVAL_REJECTED
     └─ deny → TOOL_POLICY_DENIED
  → executeAuthorizedLocalTool
  → 阶段 06 raw executor
```

完成后的关键保证：

- 六类 prepared 工具调用均有唯一风险结论。
- 自动允许、单次审批和直接拒绝不能相互降级绕过。
- pending 与 authorization 是 WeakMap 注册的进程内能力，而不是 JSON 数据。
- authorization 在第一次执行尝试前消费，失败和取消也不能复用。
- 拒绝、伪造、克隆、JSON round-trip 和重放均不会调用 raw executor。
- `@/lib/tools` 不再公开 raw executor；生产公共入口为 `@/lib/approval`。
- 风险层不依赖 Next.js、React、浏览器或 HTTP。
- 未实现等待、事件追加、JSONL、Agent、终端、API 或 UI。

## 3. 实际完成任务

| Task | 状态 | 主要产物 | 完成证据 |
| --- | --- | --- | --- |
| T07-00 基线 | 完成 | 基线记录 | 24 files / 240 tests；lint/typecheck/build 通过 |
| T07-01 类型与 Schema | 完成 | `types.ts`、`schemas.ts` | Schema/type tests |
| T07-02 有限摘要 | 完成 | `summary.ts` | summary tests、秘密审计 |
| T07-03 program/path | 完成 | `process-policy.ts` 基础分析 | path/program matrix |
| T07-04 自动允许 | 完成 | Git/package narrow allowlist | allow grammar tests |
| T07-05 审批/禁止 | 完成 | approval/deny/precedence rules | wrapper/deny matrix |
| T07-06 统一 assessment | 完成 | `assessment.ts` | 六工具 tests |
| T07-07 capability | 完成 | `capability.ts`、`dependencies.ts` | identity/resolve/consume tests |
| T07-08 gateway/export | 完成 | `gateway.ts`、`index.ts`、tools 收口 | gateway/public API tests |
| T07-09 安全矩阵 | 完成 | 8 个 approval 测试文件 | approval+tools 18 files / 158 tests |
| T07-10 整体验证 | 完成 | 全仓验证与人工审计 | 31 files / 353 tests；全部门禁通过 |
| T07-11 Summary | 完成 | 本文档与索引 | Summary 待用户审批 |

## 4. 关键实现说明

### 4.1 三态风险模型

公共类型定义：

```text
allow             → low / medium
require_approval  → high
deny              → blocked
```

`RiskAssessment` 是判别联合，包含：

- `decision`
- `level`
- 稳定 `reasonCode`
- 固定中文 `reason`
- 有限脱敏 `toolSummary`

assessment 统一冻结；构造函数在运行时验证 decision/level 合法组合、reason 4096 字符上限和 summary 1024 字符上限。

### 4.2 非进程工具规则

| 工具 | 结论 | 级别 | reasonCode |
| --- | --- | --- | --- |
| list_directory | allow | low | TOOL_READ_ONLY |
| read_file | allow | low | TOOL_READ_ONLY |
| search_text | allow | low | TOOL_READ_ONLY |
| write_file | allow | medium | TOOL_WORKSPACE_WRITE |
| replace_in_file | allow | medium | TOOL_WORKSPACE_WRITE |

这些结论只接受阶段 06 成功 prepared 的对象。敏感路径、absolute/`..` 和 symlink 逃逸仍由阶段 05/06 拒绝，审批层不提供例外。

### 4.3 Program 与参数规范化

`run_process` 始终按结构化 `program + args` 分类：

- POSIX/Windows 分隔符兼容 basename。
- 比较名做 ASCII lowercase，并去除常见 Windows `.exe/.cmd/.bat/.com` 后缀。
- 自动允许只接受 bare program；path-qualified 默认审批，禁止 basename 仍优先拒绝。
- 参数不 split、不做 shell 展开、不拼执行 command string。
- 结构化 token/flag value 检测 POSIX absolute、home、Windows absolute/UNC 和完整 `..` segment。
- http/https、版本号、HEAD~1、foo..bar、scoped package 和合法相对路径不会误判。
- `file:` URI 直接视为外部路径。
- `cmd` 的 `/c /k /d /q /s` 明确解释器 flag 不误判为 POSIX 根路径。

### 4.4 自动允许规则

Git 只读：

- bare `git status`，只接受批准的 status flag 集合。
- bare `git diff`，只接受批准的 diff flag；`--` 后只接受工作区相对 pathspec。
- revision、unknown flag、全局 `-C/-c`、`--no-index`、`--output` 不自动允许。

项目验证：

- pnpm/yarn：exact script 或 `run + exact script`。
- npm/bun：`test` 或 `run + exact script`。
- exact script 只包括 test、lint、typecheck、build。
- extra args、filter、script 前后缀、fix/write 不自动允许。

本阶段通过穷举测试覆盖四个 package manager 的所有批准形状和 Git 每个批准 flag。

### 4.5 必须审批规则

以下进入 `require_approval/high`：

- dependency add/install/remove/update/upgrade/up。
- npx/bunx/pnpm dlx/yarn dlx。
- Git 非只读 allowlist 的操作。
- sh/bash/zsh/fish/dash/ksh/cmd/powershell/pwsh。
- migrate/migration/db:push。
- format/fmt/lint:fix/`--fix`/`--write`。
- 非宽泛 rm/unlink/find delete。
- path-qualified program。
- 所有未知 program 或未知参数形状。

批准不会学习或扩大 allowlist，只绑定当前 toolCallId 与 prepared invocation。

### 4.6 直接拒绝规则

禁止规则优先级高于 approval：

- sudo/doas/su 权限切换。
- shutdown/reboot/halt/poweroff、服务控制和明确磁盘控制。
- kill/killall/pkill/taskkill。
- `git reset --hard` 与 `--hard=<value>`。
- 未限定或根范围的 forced `git clean`。
- 根/`.`/glob 等 broad target 的 recursive rm。
- broad `find ... -delete`。
- dd、mkfs 系列和 diskutil destructive subcommand。
- 结构化参数中明确的工作区外路径。

wrapper 补强：

- `/usr/bin/sudo` 仍按 sudo 拒绝。
- env wrapper 会扫描显式禁止 token，并解析普通 option/assignment 后的 nested program。
- `env -u MODE sudo ...` 不能降级为未知审批。
- Shell payload 只在命令位置做高置信禁止扫描；`sudo` 实际命令拒绝，`echo sudo` 不误判。
- 未命中高置信禁止的 Shell 仍始终审批。

### 4.7 摘要与数据最小化

- 文件工具摘要只含工具名、工作区相对 path 和必要的有限 query 预览。
- write/replace 不包含 content、oldText、newText。
- process 以 JSON 转义 token 列表展示，不形成 shell command。
- 分类使用完整内部 args；摘要截断不会影响安全结论。
- Bearer、sk-key、API key assignment 复用领域层脱敏。
- approval 层补充 password/token/secret/authorization/api-key 的 `key=value` 和分离 flag value 脱敏。
- summary 最大 1024 字符；风险原因使用固定模板。

### 4.8 Pending 与 authorization

两个私有 WeakMap 分别持有：

```text
Pending state:
  approvalId + toolCallId + invocation + assessment + pending/resolved

Authorization state:
  toolCallId + invocation + assessment + unused/consumed
```

公开对象本身：

- 空、冻结、无可枚举 invocation 字段。
- JSON 序列化仅得到 `{}`，反序列化对象没有能力。
- clone、字段相同对象和 forged cast 均无法通过 WeakMap 身份检查。

resolve 流程：

1. 校验 pending runtime identity。
2. 已处理对象直接 `APPROVAL_ALREADY_RESOLVED`。
3. 校验 approvalId exact match。
4. 用 strict Zod 校验 decision。
5. 合法决定原子转为 resolved。
6. approve 生成一份 authorization；reject 生成 recoverable ToolResult。

### 4.9 受控执行 Gateway

`requestLocalToolAuthorization`：

- 用 UUID Schema 校验 toolCallId。
- 用工具 registry 私有 WeakSet helper 校验 prepared runtime identity。
- invalid input 直接得到 `DENY_INVALID_INVOCATION` 和 `TOOL_AUTHORIZATION_INVALID`。
- allow 创建 authorization；approval 创建 pending；deny 创建不可恢复 ToolResult。

`executeAuthorizedLocalTool`：

- 先同步消费 authorization，再调用 raw executor。
- executor 成功、失败、throw 或 Abort 都不回滚消费状态。
- forged/replayed authorization 返回 `TOOL_AUTHORIZATION_INVALID`，executor 调用数为 0。
- `LocalToolExecutionAbortedError` 原样向阶段 09 传播。

### 4.10 公共出口收紧

`@/lib/approval` 公开：

- approved constants/types/Schema。
- `assessLocalToolRisk`。
- request/view/resolve/execute 四个 gateway 函数。

不公开：

- gateway factory。
- native dependencies。
- process matcher 和 summary helper。
- WeakMap/capability factory/consume helper。
- raw executor。

`@/lib/tools` 已移除 `executePreparedLocalTool`，也不公开 authenticity helper。阶段 06 内部测试改从 `@/lib/tools/registry` 引入 raw executor，生产后续模块必须使用 approval gateway。

## 5. 文件变更

### 5.1 新增生产文件

- `lib/approval/types.ts`
- `lib/approval/schemas.ts`
- `lib/approval/summary.ts`
- `lib/approval/process-policy.ts`
- `lib/approval/assessment.ts`
- `lib/approval/capability.ts`
- `lib/approval/dependencies.ts`
- `lib/approval/gateway.ts`
- `lib/approval/index.ts`

### 5.2 新增测试文件

- `tests/unit/approval/helpers.ts`
- `tests/unit/approval/schemas.test.ts`
- `tests/unit/approval/summary.test.ts`
- `tests/unit/approval/process-policy.test.ts`
- `tests/unit/approval/assessment.test.ts`
- `tests/unit/approval/capability.test.ts`
- `tests/unit/approval/gateway.test.ts`
- `tests/unit/approval/public-api.test.ts`

### 5.3 修改业务/测试文件

- `lib/tools/registry.ts`：增加内部 prepared authenticity helper，raw 行为不变。
- `lib/tools/index.ts`：移除 raw executor 公共导出。
- `tests/unit/tools/registry.test.ts`：内部 import 与 public barrel 断言。
- `tests/unit/tools/helpers.ts`：按 Task 修订 1 将 raw executor 改为内部 import。

### 5.4 文档文件

- `docs/development/07-risk-approval-spec.md`：记录用户审批。
- `docs/development/07-risk-approval-tasks.md`：任务、原版审批、修订 1 与审批记录。
- `docs/development/07-risk-approval-summary.md`：本文档。
- `docs/development/README.md`：阶段索引更新。

### 5.5 未修改/删除

- 无删除文件。
- 未修改 package、lock、Next.js、TypeScript、ESLint、Vitest 或 Playwright 配置。
- 未修改 `lib/domain/event.ts` 或 protocol version。
- 未修改 model、workspace、app、Route Handler 或 UI。

## 6. 测试与验证结果

### 6.1 T07-00 基线

| 命令 | 结果 |
| --- | --- |
| `pnpm lint` | 通过 |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 24 files / 240 tests 通过 |
| `pnpm build` | 通过；路由 `/`、`/_not-found` |
| `git diff --check` | 通过 |

### 6.2 阶段最小验证

| 范围 | 结果 |
| --- | --- |
| schemas/summary/process/assessment | 4 files / 84 tests 通过 |
| capability/gateway/public/tools registry | 4 files / 21 tests 通过 |
| approval + tools 安全矩阵 | 18 files / 158 tests 通过 |
| reflection summary/process | 2 files / 87 tests 通过 |
| 对应局部 typecheck/lint | 通过 |

### 6.3 最终全仓验证

| 命令 | 最终结果 |
| --- | --- |
| `pnpm lint` | 通过，无 warning/error |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 31 files / 353 tests 全部通过 |
| `pnpm build` | Next.js 16.3.3 production build 通过 |
| `git diff --check` | 通过 |
| untracked file `--check`/trailing whitespace | 通过 |

最终 build：

```text
Route (app)
├ ○ /
└ ○ /_not-found
```

### 6.4 安全与范围审计

- approval 源码无 Next.js、React、window/document/storage import。
- 无 child_process、exec/execSync、`shell: true` 或 `process.env`。
- 执行只通过阶段 06 raw executor adapter。
- tools public barrel 无 raw executor/authenticity helper。
- approval public barrel 无 factory、WeakMap、policy internals 或 native dependency。
- package/lock/config/domain event diff 为空。
- secret-like 值扫描无真实凭据命中。
- 无 capability 持久化、永久允许或历史批准学习逻辑。
- 所有测试只分类纯数据或注入 fake executor；未运行真实危险命令。

## 7. 失败、诊断与修正记录

### 7.1 Task 文件白名单补漏

- 现象：T07-00 后 `rg` 发现 `tests/unit/tools/helpers.ts` 也从公共 tools barrel 导入 raw executor。
- 风险：直接实现会修改未批准文件，违反三级门禁。
- 处理：停止开发，生成 Task 修订 1，只增加该 helper 的 import 调整权限；用户重新批准后继续。
- 验证：最终 tools 全量测试通过，helper 行为未变。

### 7.2 Windows shutdown 测试原因冲突

- 首轮：4 个纯策略文件中 83 通过、1 失败。
- 原因：测试使用 `shutdown.exe /s`，批准优先级会先把 `/s` 识别为 POSIX absolute token；动作仍被 deny，但 reasonCode 为 path escape，不是用例目标的 system control。
- 修正：用例移除冲突 flag，只验证 Windows extension basename 不能绕过 system deny；后续另补 `cmd` 已知 slash flag 语义。
- 复跑：4 files / 84 tests 通过。

### 7.3 局部 lint 命令调用错误

- 现象：`pnpm lint -- --no-warn-ignored ...` 被项目脚本展开为额外 `--`，ESLint 把 option 当文件名。
- 影响：命令在 lint 前退出，无文件修改。
- 修正：改用 `pnpm exec eslint <approved paths>`。
- 复跑：局部 lint 和最终 `pnpm lint` 通过。

### 7.4 Gateway 隐式 any

- 现象：首次 T07-07/08 typecheck 报 4 个方法参数隐式 any。
- 原因：method object 直接包在 `Object.freeze` 中时未获得预期 contextual typing。
- 修正：给 toolCallId、invocation、context、authorization 添加明确批准类型。
- 复跑：typecheck 通过。

### 7.5 Gateway 测试类型 import 错误

- 现象：运行测试 21/21 通过，但并行 typecheck 报 `AuthorizedLocalToolInvocation` 错从 `@/lib/tools` 导入。
- 修正：从 `@/lib/approval/types` 导入；prepared type 继续来自 tools。
- 复跑：21 tests、typecheck、lint 全通过。

### 7.6 冻结 ToolResult 的静态窄化

- 现象：158 个策略测试通过，但 typecheck 认为展开后的 `result.error.code` 可能 undefined。
- 原因：Zod 推导类型中 error 对总体 ToolResult 是 optional，尽管 failure invariant 已由 Schema 保证。
- 修正：parse 后显式断言 failure 必有 error，再冻结 outer result 与 error。
- 复跑：158 tests、typecheck、lint 通过。

### 7.7 通用敏感 assignment 正则

- 现象：反思新增的 `password=...` 搜索摘要测试失败。
- 原因：复合正则的贪婪 key 部分吞掉敏感关键词，未触发替换。
- 修正：先以普通 assignment 解析 key/separator/value，再单独用敏感 key pattern 判断是否替换。
- 复跑：2 files / 87 tests、typecheck、lint 通过；最终全仓 353 tests 通过。

所有失败均未通过删除测试、降低断言或扩大自动 allowlist 处理。

## 8. 与批准 Spec/Task 的偏差

### 8.1 已审批偏差

唯一范围变化是 Task 修订 1：增加 `tests/unit/tools/helpers.ts`，仅允许 raw executor import 改为内部路径。该修订已在实现前重新获批。

### 8.2 实现内局部细化

以下属于批准策略内的安全/测试细化，不改变公共接口：

- Windows executable suffix normalization。
- `file:` URI 外部路径判定。
- `cmd` 已知 slash interpreter flag 例外。
- env wrapper 显式禁止 token 扫描。
- Shell payload command-position 匹配，降低 `echo sudo` 误判。
- 通用敏感 assignment 摘要脱敏。
- process allow/deny 集合穷举测试。

### 8.3 无未审批偏差

- 公共函数、类型、错误码和三态语义与批准 Task 一致。
- 文件范围与 Task 修订 1 一致。
- 未新增依赖或配置。
- 未修改事件协议、安全边界或阶段范围。

## 9. 需求验收映射

| 需求 | 实现证据 | 验证证据 |
| --- | --- | --- |
| FR-003 | 六工具统一 assessment/gateway | assessment/gateway/tools tests |
| FR-004 | AuthorizationRequestResult 联合 | gateway complete path tests |
| FR-005 | reason/toolSummary/结构化结果 | summary/schema/public tests |
| FR-006 | pending/resolve/approve/reject | capability/gateway tests |
| FR-007 | Abort 原样传播且授权已消费 | gateway abort test |
| NFR-002 | strict Zod + typed unions | schemas/typecheck |
| NFR-003 | policy/reject/auth/lifecycle errors | failure path tests |
| NFR-006 | Node-only core | import scan + Vitest Node |
| SEC-003 | program/args structural policy | process matrix/source scan |
| SEC-004 | privilege/system/delete/hard reset deny | exhaustive deny tests |
| SEC-005 | install/Git/Shell/unknown approval | approval matrix tests |
| SEC-006 | bounded/redacted summary/error | summary/secret tests + scan |
| SEC-008 | documented static boundary | sections 10/11 below |
| COM-001/003 | self-built policy/capability/gateway | dependency and source audit |

## 10. 已知限制与遗留风险

1. **不是 OS 沙箱**：获批程序可在内部访问工作区外、网络或启动子进程。
2. **Shell 只做高置信扫描**：不解析完整 shell grammar、编码、动态拼接或脚本语言内部行为。
3. **验证脚本依赖可信工作区**：名为 test/build/lint/typecheck 的 package script 本身仍可有副作用。
4. **能力只在内存**：进程重启后 pending/authorization 丢失，旧 approved 事件不能恢复执行权限。
5. **模块边界不是恶意代码隔离**：仓库内部仍可按源路径 import raw executor；公共 barrel 和测试只约束项目生产架构。
6. **allowlist 有意保守**：revision、额外 flag、path-qualified program 和未列出工具会增加审批。
7. **静态路径检查有限**：只能判断结构化 token 中可可靠识别的路径，无法证明程序内部不会逃逸。
8. **单进程假设**：WeakMap capability 不跨 worker/host；首版本地单用户满足该假设。

## 11. 对后续阶段的约束

### 11.1 阶段 08 JSONL

- 只保存现有 public arguments、approval required/resolved 和有限 ToolResult。
- 不序列化 pending、authorization 或完整 invocation。
- approved 事件不能作为重启后的执行凭证。
- 未结束运行恢复时只能进入 interrupted，不能自动重放危险操作。

### 11.2 阶段 09 Agent

- Agent 必须按 approvalId 在当前进程持有 pending object map。
- `approval.required` 使用 `getPendingToolApprovalView` 的四个字段。
- approve 后先记录 resolved，再取得 authorization；只有随后才能记录 tool.started 并执行。
- reject 后记录 resolved + failed tool.result，不记录 tool.started。
- denied 不进入 awaiting_approval，不调用 executor。
- `LocalToolExecutionAbortedError` 进入 cancelled，不反馈模型盲目重试。
- 同一 tool call 串行 resolve/execute，不能并发消费 authorization。

### 11.3 阶段 11/13/14

- 终端/API/UI 只能使用 `@/lib/approval` 公共接口。
- 客户端只提交 approvalId、approved 和有限 reason。
- 不提供“永久允许”或历史批准自动复用。
- UI 只展示 public view/event，不展示 capability 或完整 write content。
- Route Handler 必须使用 Node Runtime；风险逻辑不能复制到 HTTP 层。

## 12. 反思

1. **公共出口收紧必须同步测试基础设施**：T07-00 后的 Task 修订证明，barrel 变化不能只检索生产 import，测试 helper 也是依赖图的一部分。
2. **deny 与 reason 都需要测试**：只断言“被拒绝”会掩盖规则优先级和解释错误；Windows `/s` 用例揭示了这一点。
3. **运行测试不能替代 typecheck**：gateway 测试曾全部通过，但 type-only import 仍错误；并行执行两者有效发现问题。
4. **能力安全需要对象身份而非字段**：空冻结对象 + WeakMap 使 clone/JSON 无法复用，而不会把 invocation 暴露给事件层。
5. **事件与能力分离避免重放危险操作**：approved 是审计事实，不是授权 token；该原则必须贯穿阶段 08/09。
6. **高置信扫描应减少误判**：Shell 中出现单词 `sudo` 不等于执行 sudo；命令位置匹配比任意单词匹配更符合可解释策略。
7. **保守 allowlist 应通过穷举测试固定**：四包管理器和 Git flag 的显式矩阵比模糊字符串规则更容易审计。
8. **脱敏正则本身必须有失败测试**：简单复合正则容易因贪婪/边界出错，分步 parse key 后判断更可靠。

## 13. Summary 内部门禁

- [x] Spec、Task 原版和 Task 修订 1 均有明确用户批准记录。
- [x] T07-00 至 T07-11 全部完成。
- [x] 实现与批准 Spec、Task 修订 1 一致。
- [x] 最小验证和整体验证全部通过。
- [x] 所有失败、诊断、修正和复跑如实记录。
- [x] 无真实秘密、越界写入或未说明风险。
- [x] package、lock、配置和领域事件协议无改动。
- [x] 反思和后续阶段约束已记录。
- [x] 开发索引更新为“Summary 待用户审批”。

**Summary 内部门禁：通过。当前状态：待用户审批。**

阶段 07 尚未正式完成；用户批准前不得开始阶段 08 观察或创建阶段 08 Spec。

## 14. 用户审批区

请重点审阅：

1. 三态风险和禁止优先级是否符合已批准规则。
2. Git/package manager 自动 allowlist 是否足够窄。
3. wrapper/Shell 扫描的能力与限制是否说明清楚。
4. pending/authorization 的 WeakMap、一次性消费和不可重放是否满足要求。
5. raw executor 公共出口收紧是否符合后续 Agent 调用方式。
6. 失败与 Task 修订记录是否真实完整。
7. 阶段 08/09 是否可以直接使用本阶段公共接口。

## 15. 用户审批记录

- 审批结果：待用户审批。
- 批准后解锁：阶段 08 只读观察和 `08-jsonl-event-store-spec.md`。
- 仍然禁止：阶段 08 Spec 获批前不得生成 Task 或实现 JSONL 存储。
