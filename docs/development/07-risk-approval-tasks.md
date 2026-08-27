# 阶段 07：风险分级与审批 Task

## 1. 文档状态与审批链

- 当前状态：已批准（修订 1）
- 生成日期：2026-08-27
- 批准的 Spec：[07-risk-approval-spec.md](./07-risk-approval-spec.md)
- Spec 审批结果：用户已批准
- 本文档作用：将批准的安全规格拆成按依赖顺序可直接实施的任务
- 当前禁止：Task 获批前不得修改业务代码、测试、配置或依赖

审批链：

```text
阶段 07 Spec（已批准）
  → 本 Task 原版（已批准）
  → T07-00 基线（已完成）
  → 本 Task 修订 1（已批准）
  → 实际开发与验证（进行中）
  → 阶段 07 Summary（尚未生成）
```

## 2. 实施目标

实现一个与 Next.js/UI 解耦的 Node.js 风险与审批层，完成：

```text
PreparedLocalToolInvocation
  → 三态风险评估
  → 自动授权 / 待审批 / 直接拒绝
  → 单次审批解析
  → 一次性执行授权
  → 受控调用阶段 06 raw executor
```

开发完成后，生产公共调用方不能再从 `@/lib/tools` 获得 raw executor；所有实际执行必须通过 `@/lib/approval` 的一次性授权网关。

## 3. 批准规格的不可变约束

实现期间不得自行改变：

1. 风险决定只有 `allow`、`require_approval`、`deny`。
2. 禁止规则优先于自动允许和审批规则。
3. list/read/search 自动允许为 low；write/replace 自动允许为 medium 并由后续 Agent 完整记录。
4. 只自动允许窄规则的 `git status/diff` 和 package manager 验证脚本。
5. 安装、Git 写、Shell、迁移、格式化、删除、path-qualified 和未知程序必须审批。
6. sudo/权限切换、系统与进程控制、宽泛删除、hard reset 和结构化参数中明确的工作区逃逸直接拒绝。
7. pending 和 authorization 绑定当前 toolCallId 与 prepared 对象身份；没有永久允许。
8. authorization 在第一次执行尝试前消费，成功、失败、超时、取消后均不可复用。
9. JSONL 审批事件是事实而不是执行能力；本阶段不持久化 capability。
10. raw executor 从 `@/lib/tools` barrel 移除，生产路径只走 approval gateway。
11. 不修改事件协议版本/字段，不实现等待、JSONL、Agent、终端、API 或 UI。
12. 不增加第三方依赖，不修改项目配置。

若实现需要改变其中任一项，必须停止并回到 Spec 修订审批。

## 4. 最终公共接口锁定

### 4.1 常量与类型

`@/lib/approval` 最终导出：

```ts
RISK_DECISIONS
RISK_LEVELS
RISK_REASON_CODES
APPROVAL_LIFECYCLE_ERROR_CODES
APPROVAL_TOOL_ERROR_CODES

RiskDecision
RiskLevel
RiskReasonCode
RiskAssessment
ApprovalDecision
ApprovalLifecycleError
PendingToolApproval
PendingToolApprovalView
AuthorizedLocalToolInvocation
AuthorizationRequestResult
ApprovalResolutionResult
```

固定值：

```ts
type RiskDecision = "allow" | "require_approval" | "deny";
type RiskLevel = "low" | "medium" | "high" | "blocked";
```

`RiskAssessment` 使用判别联合保证合法组合：

```ts
type RiskAssessment =
  | Readonly<{
      decision: "allow";
      level: "low" | "medium";
      reasonCode: RiskReasonCode;
      reason: string;
      toolSummary: string;
    }>
  | Readonly<{
      decision: "require_approval";
      level: "high";
      reasonCode: RiskReasonCode;
      reason: string;
      toolSummary: string;
    }>
  | Readonly<{
      decision: "deny";
      level: "blocked";
      reasonCode: RiskReasonCode;
      reason: string;
      toolSummary: string;
    }>;
```

Spec 中列出的原因码全部保留，并增加内部契约拒绝码 `DENY_INVALID_INVOCATION`，用于 forged prepared/toolCallId，不能把无效对象降级为未知程序审批。

### 4.2 Schema

```ts
ApprovalDecisionSchema
```

固定结构：

```ts
z.strictObject({
  approved: z.boolean(),
  reason: z.string().max(4096).optional(),
})
```

不自动 trim 或删除用户 reason；只验证边界。类型从 Schema 推导。

### 4.3 公共函数

```ts
assessLocalToolRisk(
  invocation: PreparedLocalToolInvocation,
): RiskAssessment

requestLocalToolAuthorization(
  toolCallId: ToolCallId,
  invocation: PreparedLocalToolInvocation,
): AuthorizationRequestResult

getPendingToolApprovalView(
  pending: PendingToolApproval,
): PendingToolApprovalView | ApprovalLifecycleError

resolveLocalToolApproval(
  pending: PendingToolApproval,
  approvalId: ApprovalId,
  decision: unknown,
): ApprovalResolutionResult

executeAuthorizedLocalTool(
  context: LocalToolExecutionContext,
  authorization: AuthorizedLocalToolInvocation,
): Promise<ToolResult>
```

测试依赖注入函数不从 `@/lib/approval` 公共 barrel 导出；测试可直接 import 内部模块或使用 Task 指定的内部 factory。

### 4.4 结果联合

```ts
type AuthorizationRequestResult =
  | Readonly<{
      status: "authorized";
      assessment: Extract<RiskAssessment, { decision: "allow" }>;
      authorization: AuthorizedLocalToolInvocation;
    }>
  | Readonly<{
      status: "approval_required";
      assessment: Extract<RiskAssessment, { decision: "require_approval" }>;
      pending: PendingToolApproval;
    }>
  | Readonly<{
      status: "denied";
      assessment: Extract<RiskAssessment, { decision: "deny" }>;
      result: ToolResult;
    }>;

type ApprovalResolutionResult =
  | Readonly<{
      status: "authorized";
      authorization: AuthorizedLocalToolInvocation;
    }>
  | Readonly<{
      status: "rejected";
      result: ToolResult;
    }>
  | Readonly<{
      status: "invalid";
      error: ApprovalLifecycleError;
    }>;
```

### 4.5 Pending public view

固定为现有 `approval.required.data` 可直接消费的字段：

```ts
interface PendingToolApprovalView {
  approvalId: ApprovalId;
  toolCallId: ToolCallId;
  reason: string;
  toolSummary: string;
}
```

不包含 invocation、authorization、write content 或内部状态。

## 5. 错误码与恢复语义锁定

### 5.1 ToolResult 错误

```text
TOOL_POLICY_DENIED          recoverable: false
TOOL_APPROVAL_REJECTED      recoverable: true
TOOL_AUTHORIZATION_INVALID  recoverable: false
```

- denied：固定 `TOOL_POLICY_DENIED`，不创建 pending，不执行。
- user rejected：固定 `TOOL_APPROVAL_REJECTED`，允许 Agent 尝试不同方案，不允许静默重试原操作。
- forged/replayed authorization 或无效请求能力：`TOOL_AUTHORIZATION_INVALID`，不执行。

所有结果必须通过 `ToolResultSchema.parse`。

### 5.2 Approval lifecycle 错误

```text
APPROVAL_INVALID
APPROVAL_ALREADY_RESOLVED
APPROVAL_ID_MISMATCH
APPROVAL_DECISION_INVALID
```

固定数据结构：

```ts
interface ApprovalLifecycleError {
  code: ApprovalLifecycleErrorCode;
  message: string;
  recoverable: false;
}
```

不得附带 Error stack、prepared invocation 或绝对路径。阶段 13 再决定 HTTP 映射。

## 6. 文件变更白名单

### 6.1 允许新增

```text
lib/approval/types.ts
lib/approval/schemas.ts
lib/approval/summary.ts
lib/approval/process-policy.ts
lib/approval/assessment.ts
lib/approval/capability.ts
lib/approval/dependencies.ts
lib/approval/gateway.ts
lib/approval/index.ts

tests/unit/approval/helpers.ts
tests/unit/approval/schemas.test.ts
tests/unit/approval/summary.test.ts
tests/unit/approval/assessment.test.ts
tests/unit/approval/process-policy.test.ts
tests/unit/approval/capability.test.ts
tests/unit/approval/gateway.test.ts
tests/unit/approval/public-api.test.ts
```

若多个小模块合并可以减少循环依赖，必须先在 Task 修订中说明；不能在开发中临时改变公共职责。

### 6.2 允许修改

```text
lib/tools/registry.ts
lib/tools/index.ts
tests/unit/tools/registry.test.ts
tests/unit/tools/helpers.ts
docs/development/07-risk-approval-tasks.md
docs/development/07-risk-approval-summary.md
docs/development/README.md
```

`lib/tools/registry.ts` 只允许：

- 导出内部 runtime authenticity helper。
- 保持 raw executor 行为不变。
- 为 approval gateway 提供内部调用入口。

不得顺便修正、重构或改变六工具参数和执行语义。

### 6.3 禁止修改

- `app/**`、`lib/model/**`、`lib/workspace/**`。
- `lib/domain/event.ts` 或其他领域协议字段/版本。
- `package.json`、`pnpm-lock.yaml` 和所有配置文件。
- 阶段 01–06 已批准产物，审批状态记录除外。
- 真实用户项目或工作区外文件。

## 7. 执行顺序总览

| ID | 任务 | 依赖 | 最小验证 |
| --- | --- | --- | --- |
| T07-00 | 开发前门禁与基线冻结 | Task 批准 | 状态/文档/基线检查 |
| T07-01 | 风险与审批类型、Schema、错误 helper | T07-00 | schemas 单测 + typecheck |
| T07-02 | 有限脱敏摘要 | T07-01 | summary 单测 |
| T07-03 | 进程 token 规范化与显式路径检测 | T07-01/02 | process-policy 路径测试 |
| T07-04 | 自动允许规则 | T07-03 | allow matrix 测试 |
| T07-05 | 审批与直接拒绝规则 | T07-03/04 | precedence/deny matrix 测试 |
| T07-06 | 六工具统一 assessment | T07-02/05 | assessment 单测 |
| T07-07 | pending/authorization capability | T07-01/06 | capability 单测 |
| T07-08 | 受控执行 gateway 与 raw 出口收紧 | T07-07 | gateway/public API 测试 |
| T07-09 | 安全矩阵补齐与回归 | T07-08 | approval + tools 全量测试 |
| T07-10 | 整体验证、审计与反思修正 | T07-09 | lint/typecheck/test/build/diff |
| T07-11 | Summary 与索引 | T07-10 | 文档门禁 |

只能按依赖顺序实施。每项失败必须先记录，再修复并重跑该项及受影响的前置测试。

## 8. T07-00：开发前门禁与基线冻结

### 输入

- 已批准 Spec。
- 获批后的本文档。
- 阶段 06 Summary 与现有工具测试。

### 动作

1. 确认 Spec 和 Task 均有用户批准记录。
2. 重新读取 Spec 第 10–19、21、25 节和本文第 3–7 节。
3. 检查 Git 状态，记录既有未提交文件，不覆盖用户修改。
4. 确认 package/lock/config 不在允许修改范围。
5. 运行只读基线：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

6. 记录测试文件数、用例数、构建路由和任何既有失败。

### 完成条件

- 基线全部通过，或既有失败被证明确实与当前未实现阶段无关并停止请求用户处理。
- 未执行安装、格式化、Git 写操作或真实工具命令。

## 9. T07-01：类型、Schema 与错误 helper

### 文件

- 新增 `lib/approval/types.ts`
- 新增 `lib/approval/schemas.ts`
- 新增 `tests/unit/approval/schemas.test.ts`

### 实现清单

1. 定义并冻结常量数组，类型从常量或 Zod 推导，禁止双份手写漂移。
2. `RiskAssessment` 使用第 4.1 节判别联合。
3. reason 最大 4096、summary 最大 1024 的常量必须复用现有事件上限语义。
4. 定义 opaque branded 类型；品牌仅供编译期，runtime 真伪由 T07-07 WeakMap 判断。
5. `ApprovalDecisionSchema` 使用 strict object，reason 保持原字符串。
6. 定义三个 ToolResult 错误码和四个 lifecycle 错误码。
7. 内部 helper 创建的 ToolResult 必须用 `ToolResultSchema.parse`。
8. lifecycle error 为普通冻结数据，不用可序列化 Error 实例。

### 测试

- approval true/false、reason absent/empty/4096 正常。
- 超长、unknown field、非 boolean、null、array 拒绝。
- RiskAssessment 合法组合由类型/构造 helper 保证。
- 错误 code、recoverable 和 ToolResult 不变量正确。

### 最小验证

```text
pnpm exec vitest run tests/unit/approval/schemas.test.ts
pnpm typecheck
```

## 10. T07-02：有限、脱敏、不可执行摘要

### 文件

- 新增 `lib/approval/summary.ts`
- 新增 `tests/unit/approval/summary.test.ts`

### 输入与输出

- 输入：prepared invocation 的结构化字段。
- 输出：≤1024 字符 `toolSummary`。

### 实现清单

1. list/read/search 只展示工具名与工作区相对 path；search query 仅有限脱敏预览。
2. write/replace 只展示工具名与 path，不读取或输出 content/oldText/newText。
3. run_process 展示 program、cwd 和独立 argv token 的 JSON 转义预览。
4. 先对每个可展示值执行既有 `redactSecrets`，再执行 UTF-8 头尾/总长度限制。
5. 摘要只用于显示；process 分类必须读取完整 invocation args。
6. 摘要不能是 shell command，不添加可复制执行的引号/连接语义。
7. 不输出绝对 workspace path、process.env、哈希前镜像或 Error stack。

### 测试

- 六工具摘要稳定、中文 UTF-8 边界正确。
- write/replace 的唯一秘密标记不会出现。
- Bearer/API Key/token/password 样例被脱敏。
- 空参数、128 参数、超长 token 总摘要仍 ≤1024。
- 引号、分号、`$()`、pipe、redirect 仅作为 JSON token 显示。

### 最小验证

```text
pnpm exec vitest run tests/unit/approval/summary.test.ts
```

## 11. T07-03：program/args 规范化与显式路径检测

### 文件

- 新增 `lib/approval/process-policy.ts`
- 新增 `tests/unit/approval/process-policy.test.ts`

### 规范化

1. 从 POSIX 和 Windows 分隔符兼容地取得 basename；ASCII 小写只用于比较，不改变原执行字段。Windows 比较名额外去除单个 `.exe`、`.cmd`、`.bat` 或 `.com` 后缀，防止禁止命令以常见扩展名绕过。
2. `program` 含 `/` 或 `\` 标记为 path-qualified。
3. 禁止规则按 basename 生效；自动允许只接受 bare program。
4. args 保持原 token 边界；不 split、不去引号、不展开变量/glob。
5. 提供内部纯函数返回结构分析，不执行文件系统或进程调用。

### 显式路径检测

对独立 token 或 `--flag=value` 的 value 检测：

- POSIX absolute：以 `/` 开始。
- home：`~`、`~/`、`~user/`。
- Windows absolute/UNC：盘符根路径或 `\\server`。
- traversal：以 `/` 或 `\` 分段后存在完整 `..` segment。

以下不得误判：

- `https://example.com/a`、`file` 以外普通 URL。
- `1.2.3`、`HEAD~1`、`foo..bar`。
- scoped package `@scope/name`。
- 合法工作区相对 `src/a.ts`。

Shell payload 不做完整路径解析；它仍进入审批。路径检测不得使用任意 substring 命中。

### 最小验证

```text
pnpm exec vitest run tests/unit/approval/process-policy.test.ts -t "path|program"
```

## 12. T07-04：自动允许规则

### Git status grammar

bare `git` 且第一个 token 为 `status`。后续 token 只能来自：

```text
--short
-s
--branch
-b
--porcelain
--porcelain=v1
--porcelain=v2
--untracked-files=no
--untracked-files=normal
--untracked-files=all
```

允许任意无冲突组合；未知 token 或分离式 flag value 进入审批。

### Git diff grammar

bare `git` 且第一个 token 为 `diff`。`--` 前 token 只能来自：

```text
--check
--stat
--name-only
--name-status
--cached
--staged
--color=never
```

- `--` 后可跟一个或多个已通过显式路径检查的工作区相对 pathspec。
- 首版不自动允许 revision token、`--no-index`、全局 Git option、`--output` 或未知 flag。
- `git diff` 无额外 token合法。

### Package manager 验证 grammar

脚本集合固定：

```text
test
lint
typecheck
build
```

允许数组：

- pnpm/yarn：`[script]` 或 `["run", script]`。
- npm：`["test"]` 或 `["run", script]`。
- bun：`["test"]` 或 `["run", script]`。

不允许额外 token、`--filter`、workspace selector、`--fix`、`--write`、script 前后缀或别名。

### 结果

- Git：`allow/low/PROCESS_GIT_READ_ONLY`。
- 验证脚本：`allow/medium/PROCESS_VERIFICATION`。

### 测试

- 每个允许形状及 flag 组合。
- 大小写 program 不改变原值但可分类。
- `/usr/bin/git`、`./pnpm` 不自动允许。
- revision、unknown flag、extra args、`lint:fix`、`test:unit` 均不是 allow。
- pathspec 合法与外部路径拒绝。

### 最小验证

```text
pnpm exec vitest run tests/unit/approval/process-policy.test.ts -t "allow|git|verification"
```

## 13. T07-05：审批、直接拒绝与优先级规则

### 13.1 必须审批的精确类别

#### 依赖与下载执行

- package manager subcommand：`add`、`install`、`remove`、`uninstall`、`update`、`upgrade`、`up`。
- `npx`、`bunx`。
- `pnpm/yarn` 的 `dlx`。
- 原因：`PROCESS_DEPENDENCY_CHANGE`。

#### Git 写操作

- 除 T07-04 只读 allowlist 与直接 deny 规则外，所有 `git` 调用均审批。
- 明确写命令使用 `PROCESS_REPOSITORY_WRITE`；未知 Git option 也按 repository write 审批，不自动执行。

#### Shell

basename 集合：

```text
sh bash zsh fish dash ksh cmd powershell pwsh
```

- 未命中禁止 payload 时：`PROCESS_SHELL`。
- shell 无 `-c`、脚本文件或交互形状仍必须审批。

#### 迁移与格式化

- package script exact/segment 匹配：`migrate`、`migration`、`db:push`、`format`、`fmt`、`lint:fix`。
- token/flag：`--fix`、`--write`。
- 迁移优先原因 `PROCESS_MIGRATION`；格式化原因 `PROCESS_REPO_FORMAT`。
- 这些只影响审批原因，不改变“必须审批”。

#### 删除、path-qualified 与未知

- 非宽泛 `rm`、`unlink`：`PROCESS_FILE_DELETE`。
- path-qualified：`PROCESS_PATH_QUALIFIED`，但禁止 basename/路径优先。
- 其他：`PROCESS_UNKNOWN`。

### 13.2 直接拒绝表

#### 权限切换 basename

```text
sudo doas su
```

reason：`DENY_PRIVILEGE_ESCALATION`。

#### 系统控制 basename

```text
shutdown reboot halt poweroff
systemctl service launchctl
mkfs mkfs.ext4 mkfs.xfs fdisk diskpart
```

`diskutil` 在首 token 为 `eraseDisk`、`eraseVolume`、`partitionDisk` 时直接拒绝；其他未知形状审批。

reason：`DENY_SYSTEM_CONTROL`。

#### 进程控制 basename

```text
kill killall pkill taskkill
```

reason：`DENY_PROCESS_CONTROL`。

#### Git destructive

- `git reset` args 任意位置出现 exact `--hard` 或 `--hard=<value>`：`DENY_GIT_HARD_RESET`。
- `git clean` 存在 `-f`、`--force` 或短 flag group 含 `f`，且没有 `--` 后的明确非根相对 pathspec，或 pathspec 本身为 broad target：`DENY_BROAD_DELETE`；明确限定到非根相对 pathspec 的 clean 仍需审批。

#### 广泛删除

- `rm` 出现 recursive flag：`-r`、`-R`、`--recursive` 或短 flag group 含 r/R；且目标为 `.`, `./`, `..`, `/`, `~`, `*`, `./*` 或等价尾斜杠形状时拒绝。
- `find` 含 `-delete` 且搜索根缺省、为工作区根/`.`/glob 或无法可靠限定时直接拒绝；所有搜索根均为明确非根相对路径时仍需删除审批。
- `dd` 直接拒绝，避免原始设备/文件覆盖。
- `mkfs*` basename 前缀全部按系统控制拒绝。

#### Wrapper/payload

- `env`：跳过以 `-` 开头的 env option 和 `NAME=VALUE`，定位嵌套 program；只递归检查直接禁止规则。无法定位或未禁止时整个 env 调用审批。
- Shell payload：只做高置信扫描，覆盖独立 sudo/doas、系统/进程控制、`git reset ... --hard` 和宽泛 rm；命中则 deny，否则仍审批。
- 不实现完整 shell parser，不因扫描失败自动允许。

### 13.3 固定优先级测试

必须证明：

1. 结构化显式外部路径 → deny。
2. path-qualified `sudo` → privilege deny，不是 path-qualified approval。
3. `env sudo` → privilege deny，不是 unknown approval。
4. `sh -c "sudo ..."` → privilege deny，不是 shell approval。
5. `sh -c "echo ok"` → shell approval。
6. `git reset --hard` → hard-reset deny，不是 Git write approval。
7. `git clean -fdx` → broad-delete deny。
8. `rm file.txt` → delete approval；`rm -rf .` → deny。
9. unknown program + `../x` → escape deny，不是 unknown approval。
10. unknown program 无禁止形状 → unknown approval。

### 最小验证

```text
pnpm exec vitest run tests/unit/approval/process-policy.test.ts
```

## 14. T07-06：六工具统一风险 assessment

### 文件

- 新增 `lib/approval/assessment.ts`
- 新增 `tests/unit/approval/assessment.test.ts`

### 实现清单

1. `assessLocalToolRisk` 对六个 invocation name 使用穷尽 switch。
2. list/read/search：`allow/low/TOOL_READ_ONLY`。
3. write/replace：`allow/medium/TOOL_WORKSPACE_WRITE`。
4. run_process：调用 T07-03–05 的纯 process policy。
5. 每个 assessment 经唯一内部构造 helper 深冻结。
6. 构造 helper 验证 decision/level 合法组合、reason/summary 上限。
7. 中文 reason 使用固定模板；只将有限摘要放入 toolSummary。
8. 不从 publicArguments 反推风险，不对摘要截断后的内容分类。

### 测试

- 六工具逐一断言 decision/level/reasonCode。
- write/replace content 不出现在 assessment。
- process 的完整长尾危险 token 即使摘要截断仍命中 deny。
- assessment 和嵌套数据不可修改。
- forged shape 不通过 request gateway；pure assessment 只接受类型化 prepared 输入。

### 最小验证

```text
pnpm exec vitest run tests/unit/approval/assessment.test.ts
```

## 15. T07-07：Pending 与 authorization capability

### 文件

- 新增 `lib/approval/capability.ts`
- 新增 `lib/approval/dependencies.ts`
- 新增 `tests/unit/approval/helpers.ts`
- 新增 `tests/unit/approval/capability.test.ts`

### Runtime 身份

1. `PendingToolApproval` 与 `AuthorizedLocalToolInvocation` 均由私有 WeakMap 注册。
2. pending WeakMap state：invocation、toolCallId、approvalId、assessment、`pending|resolved`。
3. authorization WeakMap state：invocation、toolCallId、assessment、`unused|consumed`。
4. 对外对象深冻结，不公开 invocation；字段相同对象不具有能力。
5. UUID 由 dependency `randomUUID` 生成，默认 Node `crypto.randomUUID`；测试注入固定 UUID。

### 创建与查看

6. 只有 `require_approval` assessment 能创建 pending。
7. `getPendingToolApprovalView` 校验 WeakMap 身份并返回新冻结 public view。
8. view 字段严格为 approvalId/toolCallId/reason/toolSummary。

### Resolve

9. 先校验 pending runtime 身份，再校验 approvalId exact match，再校验 decision Schema。
10. 任一校验失败不得改变 pending 状态。
11. 首次合法 decision 原子将 pending 改为 resolved。
12. approved 创建恰好一个 authorization。
13. rejected 创建 `TOOL_APPROVAL_REJECTED` ToolResult，不创建 authorization。
14. resolved 后任何第二次 resolve 返回 `APPROVAL_ALREADY_RESOLVED`。

### Authorization 消费

15. auto allow 与 approved 都调用同一个内部 authorization factory。
16. 执行网关先校验 WeakMap，再同步标记 consumed，然后调用 raw executor。
17. raw executor throw/reject/cancel 不能回滚 consumed。
18. forged/clone/round-trip/重复使用返回 `TOOL_AUTHORIZATION_INVALID`，不调用 executor。

### 测试

- deterministic UUID 与 public view event compatibility。
- pending forged/clone/JSON、ID mismatch、invalid decision、unknown field、重复 resolve。
- approve/reject 两分支与状态不可逆。
- authorization forged/clone/JSON、第二次使用。
- 对象冻结、内部 invocation 不可枚举/序列化。

### 最小验证

```text
pnpm exec vitest run tests/unit/approval/capability.test.ts
```

## 16. T07-08：Gateway、工具真实性与公共出口收紧

### 文件

- 新增 `lib/approval/gateway.ts`
- 新增 `lib/approval/index.ts`
- 修改 `lib/tools/registry.ts`
- 修改 `lib/tools/index.ts`
- 修改 `tests/unit/tools/registry.test.ts`
- 修改 `tests/unit/tools/helpers.ts`
- 新增 `tests/unit/approval/gateway.test.ts`
- 新增 `tests/unit/approval/public-api.test.ts`

### 工具内部真实性 helper

1. `lib/tools/registry.ts` 导出 `isPreparedLocalToolInvocation(value: unknown): value is PreparedLocalToolInvocation`，只查询已有私有 WeakSet。
2. 该 helper 与 `executePreparedLocalTool` 不从 `@/lib/tools` barrel 导出。
3. approval gateway 只通过内部源模块 import 两者。
4. 不改变 prepare、public projection、raw execute 或六 handler 行为。

### Request gateway

5. `requestLocalToolAuthorization` 先用 `UuidSchema` 校验 toolCallId，再验证 prepared runtime identity。
6. 无效输入得到 `denied/blocked/DENY_INVALID_INVOCATION` 与 `TOOL_AUTHORIZATION_INVALID`，不 assessment 不完整 shape、不执行。
7. 有效输入调用 `assessLocalToolRisk`：
   - allow → 一次性 authorization。
   - require_approval → pending。
   - deny → `TOOL_POLICY_DENIED`。
8. result 与 assessment 深冻结。

### Execute gateway

9. `executeAuthorizedLocalTool` 使用 T07-07 consume helper取得绑定 invocation。
10. consume 失败直接返回 `TOOL_AUTHORIZATION_INVALID`。
11. consume 成功后调用内部 raw executor一次。
12. `LocalToolExecutionAbortedError` 原样传播。
13. raw ToolResult 不改写并继续满足领域 Schema。

### 公共 API

14. `@/lib/approval` 只导出第 4 节批准项。
15. 不导出 WeakMap、factory、raw executor、dependency adapter、policy matcher 和内部 summary helper。
16. `@/lib/tools` 保留 definitions、schemas、prepare、类型与限制常量；移除 `executePreparedLocalTool`。

### 测试

- prepare → request 三态 → resolve → execute 完整路径。
- allow/approved 正好调用 executor 一次。
- deny/reject/invalid/replayed 调用次数 0。
- executor 成功/ToolResult failure/throw Abort 后 authorization 均 consumed。
- public barrel 运行时 key 审查与 TypeScript import 边界。
- 既有 registry raw 测试改为内部 import，证明阶段 06 行为未变。

### 最小验证

```text
pnpm exec vitest run tests/unit/approval/gateway.test.ts tests/unit/approval/public-api.test.ts tests/unit/tools/registry.test.ts
pnpm typecheck
```

## 17. T07-09：安全矩阵补齐与回归

### 目标

将 Spec 第 21/22 节和本文 T07-03–08 的所有边界映射到测试，禁止只覆盖典型 happy path。

### 必测矩阵

1. 六工具全部分类。
2. 四 package manager 的每种精确验证形状。
3. Git status/diff 的全部允许 flag 与未知/写入 flag。
4. dependency、dlx、Git write、shell、migration、format、delete、path-qualified、unknown 审批。
5. privilege/system/process/broad delete/hard reset/path escape 拒绝。
6. basename path 绕过、env wrapper、shell payload、Git grouped flag。
7. URLs、version、HEAD~1、foo..bar、scoped package 不误判为 path。
8. secret、UTF-8、超长摘要、写入内容不披露。
9. pending/authorization identity、冻结、一次性和错误码。
10. Abort、executor 失败与 ToolResult Schema。

### 安全源码审查

使用 `rg` 检查：

- approval 代码无 `next/`、React、DOM import。
- 无 `exec`、`execSync`、`shell: true` 或 command string 执行。
- 无 API key、token、Authorization 和完整 env 日志。
- raw executor 不在 tools public barrel。
- 不存在永久 allowlist、历史批准复用或 capability 序列化。
- 未修改 domain event version/schema。

### 最小验证

```text
pnpm exec vitest run tests/unit/approval tests/unit/tools
pnpm typecheck
```

## 18. T07-10：整体验证、人工审计与反思修正

### 完整验证顺序

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

### 人工对照

逐条核对：

- Spec 第 10–19、21、25 节。
- 本文第 3–17 节。
- `SEC-003/004/005/006/008`。
- `@/lib/tools` 和 `@/lib/approval` 实际导出。
- 文件白名单、package/lock/config diff。

### 失败处理

1. 不降低断言、不删除测试、不扩大 allowlist 来消除失败。
2. 分类预期冲突时，以批准 Spec 和本文矩阵为准。
3. 实现 bug 在批准文件内修复，并重跑最小测试和完整验证。
4. 若需改变公共接口、安全规则、错误恢复语义或范围，停止并回到 Spec。
5. 若只需改变文件拆分、内部 factory 或测试注入方式，停止并修订 Task。
6. 所有失败命令、根因、修复和复跑结果写入 Summary。

### 反思检查

- 是否存在由规则顺序造成的 deny 降级审批。
- 是否存在 summary 截断影响分类。
- 是否存在 capability 在 resolve/execute 竞态中被重复使用。
- 是否把 approved 事件错误当成 authorization。
- 是否让 package script 自动允许范围超过 exact grammar。
- 是否对静态策略作了强沙箱式过度承诺。

## 19. T07-11：Summary 与开发索引

### 文件

- 新增 `docs/development/07-risk-approval-summary.md`
- 更新 `docs/development/README.md`

### Summary 必须记录

1. Spec/Task 用户审批记录。
2. T07-00 至 T07-11 实际完成状态。
3. 每个新增/修改/删除文件。
4. 风险矩阵、capability 和 gateway 的实际实现细节。
5. 每个最小验证和整体验证的真实结果。
6. 所有失败、诊断、修复、复跑和偏差。
7. raw executor 出口、安全扫描和秘密检查结果。
8. 静态策略、package script 和内存 capability 的已知限制。
9. 对阶段 08 JSONL 与阶段 09 Agent 的具体输入约束。
10. Summary 内部门禁与用户审批区。

生成 Summary 后索引状态改为“Summary 待用户审批”，并立即停止；不得开始阶段 08 观察。

## 20. 需求与任务映射

| 需求 | 主要任务 |
| --- | --- |
| FR-003 | T07-06、T07-08、T07-09 |
| FR-004 | T07-07、T07-08 |
| FR-005 | T07-02、T07-06、T07-09 |
| FR-006 | T07-05、T07-07、T07-08 |
| FR-007 | T07-08、T07-09 |
| NFR-002 | T07-01、T07-06、T07-08 |
| NFR-003 | T07-01、T07-07、T07-08 |
| NFR-006 | T07-09、T07-10 |
| SEC-003 | T07-03、T07-04、T07-05 |
| SEC-004 | T07-05、T07-09 |
| SEC-005 | T07-04、T07-05、T07-07 |
| SEC-006 | T07-02、T07-09、T07-10 |
| SEC-008 | T07-05、T07-10、T07-11 |
| COM-001/003 | T07-08、T07-09、T07-10 |

## 21. 验收标准映射

| Spec 验收组 | Task 证据 |
| --- | --- |
| 21.1 分类 | T07-03–06、process/assessment tests |
| 21.2 审批能力 | T07-07/08、capability/gateway tests |
| 21.3 数据与错误 | T07-01/02/09、schema/summary tests |
| 21.4 架构与回归 | T07-08–10、public API/full validation |
| 22 测试矩阵 | T07-09 完整矩阵 |

## 22. 回退策略

本阶段不修改用户数据，不执行真实危险命令，回退以文件级可恢复修改为主：

- 新模块失败：保留测试证据，修复批准文件；不得删除失败测试制造通过。
- raw barrel 收紧导致既有测试失败：只把测试改为内部 import，不重新公开 executor。
- 类型循环：允许在批准模块内使用 `import type` 或内部文件职责调整；跨文件调整需 Task 修订。
- capability 状态 bug：停止执行测试中的 gateway，先修复 WeakMap 状态和一次性断言。
- process policy 争议：不扩大自动允许；无法匹配时保持审批，并在 Summary 记录。
- 发现 Spec 冲突：停止开发，标记 Task 审批失效并请求 Spec 修订。

禁止使用 `git reset --hard`、`git checkout --`、递归删除或覆盖用户已有修改进行回退。

## 23. 明确不执行

- 不发起真实模型请求。
- 不对真实工作区运行 package manager、Git、Shell、rm 或系统命令。
- 不安装依赖或修改 lockfile。
- 不写 JSONL、不创建 Session/Run、不发 approval 事件。
- 不实现等待、审批超时、取消等待或恢复。
- 不创建终端入口、Route Handler、页面或组件。
- 不实现完整 shell parser、永久批准、命令学习或 OS 沙箱。
- 不修改 Next.js、TypeScript、ESLint、Vitest、Playwright 配置。
- 不执行 Git commit、push、发布或部署。

## 24. 实施纪律

- 每项开始前重新对照其输入、文件和完成条件。
- 只使用 `apply_patch` 创建或修改源码与文档。
- 搜索优先使用 `rg`/`rg --files`。
- 测试只使用准备后的调用、注入执行器和临时目录。
- 不能让测试 spawn Spec 中的真实危险命令；分类测试必须是纯函数。
- 不输出环境秘密或完整用户内容。
- 任何未在白名单内的写入立即停止并请求修订。
- Summary 如实记录所有失败，不通过回写批准文档掩盖偏差。

## 25. Task 审批清单

- [x] 链接并对照已批准 Spec。
- [x] 公共接口、错误码、规则 grammar 和优先级已锁定。
- [x] 任务按依赖顺序排列，输入、输出、文件和完成条件明确。
- [x] 需求与验收标准已映射。
- [x] 最小验证、整体验证、失败处理和回退策略明确。
- [x] 文件变更白名单与明确不执行项完整。
- [x] 未修改业务代码、测试、配置或依赖。
- [x] 未提前生成 Summary。

**Task 原版内部门禁：通过。当前状态：修订 1 已批准。**

T07-00 已完成；允许从 T07-01 继续，阶段 07 Summary 获批前不得开始阶段 08。

## 26. 用户审批记录

- 审批结果：阶段 07 Task 已获用户批准。
- 解锁动作：允许按 T07-00 至 T07-11 顺序进行实际开发、验证和 Summary。
- 仍然禁止：阶段 07 Summary 获批前不得开始阶段 08。

## 27. Task 修订 1

### 27.1 发现时间与事实

- 发现时间：2026-08-27，T07-00 基线通过后、T07-01 编码前。
- 只读证据：`rg -n "executePreparedLocalTool" lib tests --glob '*.ts'` 显示，除已列入白名单的 `tests/unit/tools/registry.test.ts` 外，`tests/unit/tools/helpers.ts` 也从 `@/lib/tools` 导入 raw executor。
- 影响：T07-08 按批准设计从工具公共 barrel 移除 raw executor 后，所有复用 `runTool` helper 的阶段 06 测试都会在 typecheck/import 时失败。
- 当前状态：尚未创建 `lib/approval`、阶段 07 测试或修改任何业务代码。

### 27.2 修订内容

仅增加一个允许修改文件：

```text
tests/unit/tools/helpers.ts
```

授权的唯一改动：

- 将 `executePreparedLocalTool` 的 import 从 `@/lib/tools` 改为内部 `@/lib/tools/registry`。
- `prepareLocalToolCall` 继续从公共 `@/lib/tools` 导入。
- 不改变 fixture、cleanup、ToolCall、runTool 参数、执行流程或任何断言。

本文第 6.2 节和 T07-08 文件列表已同步加入该文件。除此之外，公共接口、安全策略、任务顺序、验收标准和文件范围均不变化。

### 27.3 修订原因与级别

- 类型：局部测试 import 路径与文件白名单补漏。
- 不改变 Spec，无需回退 Spec 审批。
- 根据 `00-process.md`，文件范围变化必须暂停开发、修订 Task 并重新审批。
- 原 Task 审批在修订 1 获批前不再授权 T07-01 及后续实现。

### 27.4 修订 1 审批门禁

- [x] 缺口有现有源码引用证据。
- [x] 修订只增加必要测试 helper 文件。
- [x] 文件的唯一允许改动已精确限定。
- [x] 未改变批准 Spec 的公共接口或安全边界。
- [x] 未编写业务代码或阶段 07 测试。

**修订 1 当前状态：已批准。**

### 27.5 修订 1 用户审批记录

- 审批结果：阶段 07 Task 修订 1 已获用户批准。
- 解锁动作：从 T07-01 继续执行；T07-00 基线无需重复，最终整体验证仍按 T07-10 完整重跑。
