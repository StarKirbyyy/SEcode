# 阶段 07：风险分级与审批 Spec

## 1. 文档状态与审批门禁

- 当前状态：待用户审批
- 观察日期：2026-08-27
- 前置阶段：阶段 06 Summary 已获用户批准
- 本轮允许产物：本 Spec 与开发索引状态
- 本轮禁止动作：不得创建 Task、业务代码、测试或 Summary

审批关系：

```text
阶段 06 Summary（已批准）
  → 阶段 07 只读观察（已完成）
  → 本 Spec（待用户审批）
  → 阶段 07 Task（尚未生成）
```

用户批准本 Spec 只解锁 Task 文档编写，不直接授权实现。

## 2. 阶段目标

在已经完成的本地工具“准备”和“执行”之间建立统一风险边界，使每个有效工具调用只能得到以下三个明确结论之一：

1. `allow`：无需用户批准，可生成一次性执行授权。
2. `require_approval`：必须暂停并等待用户针对该次精确调用允许或拒绝。
3. `deny`：策略直接拒绝，不得向用户提供绕过批准入口，也不得调用执行器。

本阶段同时定义审批请求、审批决定、一次性授权和受控执行网关，但不实现 Agent 等待循环、JSONL 追加、HTTP 接口、终端交互或 UI。

目标调用链：

```text
ToolCall
  → prepareLocalToolCall
  → PreparedLocalToolInvocation
  → assessLocalToolRisk
  → allow ───────────────→ 一次性授权 ─→ executeAuthorizedLocalTool
  → require_approval ────→ 待审批对象
                           ├─ 允许 → 一次性授权 ─→ executeAuthorizedLocalTool
                           └─ 拒绝 → ToolResult（不执行）
  → deny ────────────────→ ToolResult（不执行）
```

## 3. 覆盖需求与追踪

| 需求 ID | 本阶段解释 | 验收证据 |
| --- | --- | --- |
| FR-003 | 六类本地工具统一经过风险层后才能进入生产执行路径 | 分类与网关测试 |
| FR-004 | 为阶段 09 的 Agent 工具循环提供确定的授权结果 | 公共联合类型与流程测试 |
| FR-005 | 生成有限、脱敏、可展示的风险原因和工具摘要 | 摘要与边界测试 |
| FR-006 | 危险操作产生待审批对象；允许、拒绝均有明确语义 | 审批生命周期测试 |
| FR-007 | 受控执行继续传播阶段 06 的 Abort 取消语义 | 取消回归测试 |
| NFR-002 | 公共审批决定使用 strict Zod Schema；内部联合类型穷尽 | Schema 与类型检查 |
| NFR-003 | 策略拒绝、用户拒绝和无效授权均返回结构化错误 | 错误路径测试 |
| NFR-006 | 风险与审批核心仅依赖 Node.js 和既有领域/工具层 | import 审查与 Node 测试 |
| SEC-003 | 命令始终按 `program + args` 分类和执行，不构造 shell command | 源码审查与注入测试 |
| SEC-004 | 明确的 sudo、系统控制、宽泛删除和 hard reset 直接拒绝 | 禁止矩阵测试 |
| SEC-005 | 安装、Git 写、Shell、迁移、全仓格式化和未知程序必须审批 | 审批矩阵测试 |
| SEC-006 | 风险原因、摘要和错误不得泄露秘密或完整环境 | 脱敏与大小测试 |
| SEC-008 | 明确静态策略不是 OS 沙箱，批准进程仍受可信本地用户假设约束 | 文档与边界审查 |
| COM-001/003 | 分类、审批能力与执行网关自行实现，不引入 Agent 框架 | 依赖与源码审查 |

## 4. 只读观察范围与方法

### 4.1 已阅读文档

- `docs/development/00-process.md`
- `docs/development/01-requirements.md`
- `docs/development/03-domain-protocol-spec.md`
- `docs/development/03-domain-protocol-summary.md`
- `docs/development/06-local-tools-spec.md`
- `docs/development/06-local-tools-tasks.md`
- `docs/development/06-local-tools-summary.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`

### 4.2 已检查代码与配置

- `lib/domain/event.ts`、`core.ts`、`tool.ts`、`model.ts`
- `lib/tools/types.ts`、`schemas.ts`、`registry.ts`、`run-process.ts`、`index.ts`
- `lib/workspace` 的公共边界
- `tests/unit` 当前测试布局
- `package.json`、`tsconfig.json`、`vitest.config.mts`、`eslint.config.mjs`
- 当前 Git 状态与已有未提交阶段产物

### 4.3 观察方式

- 只执行文件读取、文本检索、目录枚举和 Git 状态检查。
- 未运行安装、格式化、构建或会重写文件的命令。
- 未修改业务代码、依赖、配置或测试。
- 当前工作树已有阶段 05/06 的未提交修改；它们属于既有工作，本阶段不得覆盖或重写。

## 5. 观察事实与证据

### 5.1 已具备的输入边界

阶段 06 已形成并验证：

```text
ToolCall
  → prepareLocalToolCall
  → PreparedLocalToolInvocation + publicArguments
  → executePreparedLocalTool
  → ToolResult / LocalToolExecutionAbortedError
```

其中：

- 只有 `prepareLocalToolCall` 成功后才有 `PreparedLocalToolInvocation`。
- prepared invocation 被深冻结，并由工具注册表内部 `WeakSet` 标记；伪造、克隆和 JSON round-trip 对象不能执行。
- 未知工具、非法参数、敏感内容路径在 prepare 阶段直接成为 `ToolResult`，不应进入审批。
- path/cwd 已转成工作区规范相对路径；执行时仍会重新做 realpath、哈希和 writable snapshot 复验。
- `write_file`、`replace_in_file` 的完整内容不进入公共参数，只公开路径、大小、哈希和有限预览。
- `run_process` 已固定为 `spawn(program, args)`、`shell: false`、忽略 stdin、过滤秘密环境变量，并具备超时、取消和 64 KiB 输出限制。

### 5.2 已批准的阶段 06 后续约束

阶段 06 Summary 已明确：

- 风险层只能分类成功 prepared 的调用。
- `list_directory`、`read_file`、`search_text` 是自动只读候选。
- `write_file`、`replace_in_file` 是工作区内自动记录变更候选。
- shell、未知程序、安装和 Git 写操作必须审批。
- sudo、系统控制、宽泛删除和 `git reset --hard` 必须直接拒绝。
- 只有风险结论允许后才调用 executor；拒绝不得调用 executor。
- 审批等待后，执行器仍必须重新检查工作区和文件状态。

### 5.3 现有事件协议

领域协议已经有以下稳定事件：

- `tool.requested`：`toolCallId`、`toolName`、`publicArguments`、`argumentsTruncated`。
- `approval.required`：`approvalId`、`toolCallId`、`reason`、`toolSummary`。
- `approval.resolved`：`approvalId`、`approved`、可选 `reason`。
- `tool.started` 与 `tool.result`。

既有顺序不变量要求：

1. 需要审批的调用只有批准后才能出现 `tool.started`。
2. 用户拒绝时直接产生失败 `tool.result`，不能出现 `tool.started`。
3. 事件只记录事实，不应被当成可重放的执行凭证。
4. 事件创建、关联验证和持久化分别属于阶段 08/09。

因此本阶段不能修改 `protocolVersion: 1`，也不需要给审批事件增加 invocation 哈希或私有参数。

### 5.4 Next.js 运行时边界

项目内置 Next.js 16.3.3 文档确认：

- Route Handler 使用 Web `Request`/`Response` API。
- 动态路由 `params` 是 Promise，后续必须异步读取。
- Route Handler 可以显式使用 `runtime = "nodejs"`，Node.js 也是本项目需要的运行时。

阶段 07 不导入 `next/*`。后续阶段 13 只负责把本阶段已经验证的审批 API 暴露为 Node Runtime Route Handler，不能在路由中复制风险规则。

## 6. 当前差距

当前工具层可以直接执行所有 prepared 调用，但尚无：

1. 三态风险判定类型和稳定原因码。
2. 文件工具的自动允许策略。
3. `run_process` 的结构化程序/参数分类器。
4. 直接禁止命令的高优先级规则。
5. 安装、Git 写、Shell、迁移、格式化和未知程序的审批规则。
6. 精确绑定单次工具调用的待审批对象。
7. 用户批准后只能使用一次的执行授权。
8. 用户拒绝、策略拒绝、授权伪造或重放对应的结构化结果。
9. 阻止生产调用方从公共 barrel 直接获得 raw executor 的架构边界。
10. 后续状态机可直接消费且不依赖 UI/HTTP 的审批联合类型。

## 7. 范围

### 7.1 范围内

- 风险决定、级别、原因码、原因文本和工具摘要类型。
- 六类 prepared invocation 的穷尽分类。
- `run_process` 的程序名规范化、规则优先级和精确策略矩阵。
- 待审批对象、审批决定 Schema、审批解析和一次性授权能力。
- 自动允许、批准后允许、用户拒绝和直接拒绝的数据流。
- 受控执行网关及 raw executor 公共导出收紧。
- 脱敏、有限摘要和稳定结构化错误。
- 可注入 UUID/执行依赖与 Node 单元测试。
- 本阶段文档和开发索引。

### 7.2 范围外

- 等待用户输入、Promise 挂起、超时或审批队列；属于阶段 09。
- `approval.required`、`approval.resolved` 或其他事件的创建、追加和重放；属于阶段 08/09。
- 跨进程、服务重启或多实例恢复待审批能力。
- JSONL、Session、Run 状态机和连续错误终止。
- 终端提示、HTTP 审批接口和 Web 审批卡片；属于阶段 11、13、14。
- 新增文件删除工具、目录工具、shell 字符串工具或 Git 专用工具。
- 解析任意 shell 语法、分析 package script 源码或证明任意可执行程序无副作用。
- 容器、chroot、权限降级、系统调用过滤或强 OS 沙箱。
- 自动 Git commit、push、发布或部署。
- 修改阶段 03 事件协议版本或字段。
- 新增第三方依赖。

## 8. 设计原则

1. **默认不执行**：无法证明满足自动允许规则的进程调用必须审批，不能猜测安全。
2. **禁止优先**：直接拒绝规则先于允许和审批规则，不能用 wrapper、路径形式或批准绕过显式禁止。
3. **结构化分类**：始终分别检查 `program` 和 `args`；只为显示生成摘要，不把两者拼成待执行命令。
4. **审批精确绑定**：一次批准只对应一个 `toolCallId` 和一个内存中的 prepared invocation。
5. **授权一次消费**：授权对象不序列化、不可伪造、不可克隆复用，执行尝试即消费。
6. **事件不是能力**：JSONL 中的 approved 事实不能在重启后自动恢复成执行权限。
7. **拒绝不执行**：策略拒绝、用户拒绝、无效授权都不得触达 raw executor。
8. **安全边界分层**：路径/敏感文件拒绝仍由阶段 05/06 负责；阶段 07 不能提供例外。
9. **最少披露**：风险输出只包含解释所需字段，复用脱敏和 UTF-8 限制。
10. **核心框架无关**：风险策略不得依赖 Next.js、React、浏览器或 HTTP。

## 9. 模块与职责设计

建议新增 `lib/approval`：

```text
lib/approval/
  types.ts            风险、审批、授权联合类型与稳定常量
  schemas.ts          审批决定 strict Zod Schema
  process-policy.ts   program/args 规范化与规则匹配
  assessment.ts       六工具穷尽风险判断和有限摘要
  capability.ts       pending/authorized WeakSet、一次性状态
  gateway.ts          请求授权、解析审批、受控执行
  dependencies.ts     randomUUID 与 raw executor 注入边界
  index.ts            唯一公共入口
```

职责边界：

- `@/lib/tools`：准备调用、工具定义和工具参数类型。
- `@/lib/approval`：决定调用能否执行，并持有一次性内存能力。
- `@/lib/domain`：稳定 JSON 事件和 `ToolResult` Schema。
- 阶段 09 Agent：持有 pending 对象、等待决定、发事件和推进状态。

具体文件可在 Task 中按依赖顺序细化，但不得改变本 Spec 的公共语义。

## 10. 风险模型

### 10.1 判定与级别

```ts
type RiskDecision = "allow" | "require_approval" | "deny";
type RiskLevel = "low" | "medium" | "high" | "blocked";

interface RiskAssessment {
  decision: RiskDecision;
  level: RiskLevel;
  reasonCode: RiskReasonCode;
  reason: string;
  toolSummary: string;
}
```

约束：

- `allow` 只能配 `low` 或 `medium`。
- `require_approval` 只能配 `high`。
- `deny` 只能配 `blocked`。
- `reason` 最大 4096 字符，`toolSummary` 最大 1024 字符，与现有事件字段一致。
- assessment 必须是不可变普通数据，可用于生成事件，但不包含授权能力或完整写入内容。

### 10.2 稳定原因码

首版至少包含：

```text
TOOL_READ_ONLY
TOOL_WORKSPACE_WRITE
PROCESS_VERIFICATION
PROCESS_GIT_READ_ONLY
PROCESS_DEPENDENCY_CHANGE
PROCESS_REPOSITORY_WRITE
PROCESS_SHELL
PROCESS_MIGRATION
PROCESS_REPO_FORMAT
PROCESS_FILE_DELETE
PROCESS_UNKNOWN
PROCESS_PATH_QUALIFIED
DENY_PRIVILEGE_ESCALATION
DENY_SYSTEM_CONTROL
DENY_PROCESS_CONTROL
DENY_BROAD_DELETE
DENY_GIT_HARD_RESET
DENY_EXPLICIT_WORKSPACE_ESCAPE
```

原因码是测试和状态机分支使用的稳定机器值；中文 `reason` 是展示文本，不用于程序判断。

## 11. 非进程工具策略

| 工具 | 决定 | 级别 | 原因 |
| --- | --- | --- | --- |
| `list_directory` | allow | low | 工作区内有限目录读取 |
| `read_file` | allow | low | 工作区内有限文本读取 |
| `search_text` | allow | low | 工作区内有限固定文本搜索 |
| `write_file` | allow | medium | 工作区内经过哈希/原子规则的显式写入 |
| `replace_in_file` | allow | medium | 工作区内经过唯一匹配/哈希/原子规则的显式替换 |

补充规则：

- “allow”不表示不记录；阶段 09 必须为写入类调用生成完整 `tool.requested`、`tool.started`、`tool.result`。
- prepare 失败不调用 risk API。
- 敏感路径、绝对路径、`..` 穿越和 symlink 逃逸不能转成 `require_approval`。
- 审批等待后也不缓存阶段 05/06 的检查结果，执行器必须重新解析和复验。

## 12. `run_process` 分类基础

### 12.1 程序名规范化

- 使用平台路径规则取得 program basename，并做 ASCII 小写比较。
- 禁止规则按 basename 生效，因此 `/usr/bin/sudo` 与 `sudo` 同样拒绝。
- 自动允许只接受无 `/`、`\` 的裸 program 名。
- 相对或绝对的 path-qualified program 默认 `require_approval`；即使 basename 看似 `git`、`pnpm` 也不能自动允许。
- path-qualified program 若 basename 命中直接禁止项，仍然 `deny`。
- 不解析 PATH、不读取 executable 内容、不信任扩展名。

### 12.2 参数处理

- 保持参数数组边界，匹配 exact token 或经过明确规范化的 flag。
- 不执行 shell split、变量替换、glob 展开或命令替换。
- 用于摘要时按 JSON 字符串形式逐项转义、脱敏并截断，不能产生可再次执行的 shell command。
- 自动允许规则只接受明确列出的参数形状；额外 flag 会降级为审批。
- 结构化参数 token 或明确的 flag value 中出现绝对文件路径、home 路径或 `..` 路径段时，判为 `DENY_EXPLICIT_WORKSPACE_ESCAPE`。
- URL、版本号和普通含点字符串不能误判为路径；实现必须以 token/flag value 的路径语法判断，不做任意子串搜索。

说明：上述只能拒绝结构化参数中可可靠识别的逃逸路径。Shell payload 和程序内部动态计算不作完整语法解释，它们依靠“必须审批 + 可信本地用户”边界；静态分类不构成 OS 沙箱。

### 12.3 规则优先级

同一调用命中多个规则时按以下顺序唯一决定：

1. 显式工作区逃逸。
2. 权限提升、系统/进程控制。
3. hard reset、宽泛删除等破坏性操作。
4. 自动允许的精确只读/验证规则。
5. 已知必须审批的安装、写操作、Shell、迁移、格式化、删除规则。
6. path-qualified program。
7. 未知程序或未知参数形状。

禁止项不能因为同时符合“shell 需审批”或“未知程序需审批”而降低为审批。

## 13. `run_process` 精确策略矩阵

### 13.1 自动允许

#### Git 只读

自动允许的 subcommand 仅包括：

- `git status`
- `git diff`

可接受的 flag 必须建立窄 allowlist，例如：

- status：`--short`、`-s`、`--porcelain`、`--branch`、`-b`、有限的 `--untracked-files` 形式。
- diff：`--check`、`--stat`、`--name-only`、`--name-status`、`--cached`、`--staged`、`--color=never`、`--` 与工作区相对 pathspec。

以下不能自动允许：

- Git 全局 `-C`、`-c`、`--git-dir`、`--work-tree`。
- `git diff --no-index`。
- `--output` 或其他写文件 flag。
- 未知 flag、显式外部路径。

不在只读 allowlist 中的 Git subcommand 默认审批；`reset --hard` 和宽泛 `clean` 仍直接拒绝。

#### 项目验证脚本

为满足已批准的自动构建、类型检查和测试要求，首版自动允许裸 package manager 的精确脚本形状：

```text
pnpm test | lint | typecheck | build
pnpm run test | lint | typecheck | build
npm test
npm run test | lint | typecheck | build
yarn test | lint | typecheck | build
yarn run test | lint | typecheck | build
bun test
bun run test | lint | typecheck | build
```

自动允许时：

- 脚本名必须 exact match，不接受任意前后缀。
- 首版不自动允许额外透传参数；额外参数进入审批，避免隐藏 `--fix`、输出路径或未知行为。
- `lint` 只代表无显式 fix/write 参数的验证调用。
- 自动允许项目脚本依赖“用户选择的本地工作区可信”假设；策略不读取或证明 package script 的内部实现。

### 13.2 必须审批

| 类别 | 典型结构 | 说明 |
| --- | --- | --- |
| 依赖变化 | `pnpm add/install/remove/update`、npm/yarn/bun 对应命令 | 可写 lockfile、下载和执行生命周期脚本 |
| 临时下载执行 | `npx`、`pnpm dlx`、`yarn dlx`、`bunx` | 可能下载并运行未知代码 |
| Git 写操作 | `git add/commit/checkout/switch/restore/merge/rebase/tag/push/reset` 等 | 改工作树、引用或远程状态；直接禁止项除外 |
| Shell | `sh`、`bash`、`zsh`、`fish`、`dash`、`ksh`、`cmd`、`powershell`、`pwsh` | 即使 `shell:false`，显式启动解释器仍能解释字符串 |
| 迁移 | 脚本名/子命令明确包含 `migrate`、`migration`、`db:push` 等 | 可能改变数据库或生成文件 |
| 全仓格式化/修复 | `format`、`fmt`、`lint:fix`、`--fix`、`--write` | 可能大范围改写工作区 |
| 文件删除 | 非宽泛的 `rm`、`unlink` 等 | 删除必须用户确认；宽泛删除直接拒绝 |
| 未知程序 | 不在任何精确 allowlist/denylist 的 program | 默认不执行 |
| 已知程序未知形状 | 安全 program 携带额外或未知参数 | 不扩大自动允许面 |
| path-qualified program | `./tool`、`/path/tool` | 可执行身份未由窄 allowlist 确认 |

审批只允许该次精确调用，不把 program 加入未来 allowlist。

### 13.3 直接拒绝

#### 权限提升

- program basename 为 `sudo`。
- 明确 wrapper 后的首个程序为 `sudo`，例如 `env sudo ...`。
- shell payload 中高置信度识别到独立 `sudo` 命令。

`doas`、`su` 等明显权限切换程序也应按同类禁止处理，避免只保护一个平台命令。

#### 系统与进程控制

- `shutdown`、`reboot`、`halt`、`poweroff` 等系统电源控制。
- `kill`、`killall`、`pkill`、`taskkill` 等任意目标进程控制。
- 明确的服务/启动项控制或磁盘破坏命令应进入禁止表，而不是未知审批。

AbortController 对本次工具 child 的终止由阶段 06 内部执行器完成，不受此策略影响。

#### 宽泛删除

至少直接拒绝：

- `rm` 同时带递归/强制语义且目标为 `/`、home、`.`、`..`、`*`、工作区根或等价形式。
- `find ... -delete` 的宽泛目录范围。
- `git clean` 携带 force 并作用于未限定范围。
- 明确磁盘擦除、文件系统格式化或原始设备覆盖命令。

对不确定是否宽泛的删除不能自动允许，最低也必须审批。

#### Git hard reset

以下等价形状直接拒绝：

- `git reset --hard`
- `git reset --hard=<rev>`（若平台 Git 接受对应形式）
- Git 全局参数后最终解析出的 reset hard。

不得仅检查完整 command string 的单一字面子串。

### 13.4 Wrapper 与解释器限制

策略对少量明确 wrapper 做结构识别：

- `env`：跳过环境赋值和已知 env flag 后检查首个嵌套 program；若无法可靠定位则审批。
- Shell `-c`/等价 payload：先执行高置信禁止扫描；未命中禁止也始终审批。
- 其他 wrapper、脚本语言 `-e/-c` 和构建工具无法静态证明内部行为，默认审批。

本策略不尝试实现完整 shell parser。混淆、动态拼接或程序内部副作用只能依赖“默认审批 + 可信用户”边界，必须在最终 README/UI 持续说明。

## 14. 审批与授权生命周期

### 14.1 公共审批决定

```ts
const ApprovalDecisionSchema = z.strictObject({
  approved: z.boolean(),
  reason: z.string().max(4096).optional(),
});
```

- 拒绝未知字段。
- reason 可为空字符串，但不得超过现有事件协议上限。
- HTTP path 中的 approvalId 校验属于阶段 13；阶段 07 的 pending 对象已经持有服务端生成 UUID。

### 14.2 待审批对象

`PendingToolApproval` 至少内部绑定：

- 服务端生成的 `approvalId`。
- 归一化 `toolCallId`。
- 原始 prepared invocation 对象身份。
- `RiskAssessment`。
- 生命周期状态 `pending/resolved`。

它对后续阶段公开的可展示字段必须与 `approval.required` 兼容：

```ts
{
  approvalId: string;
  toolCallId: string;
  reason: string;
  toolSummary: string;
}
```

内部 invocation 不可 JSON 序列化到事件、日志、API 或 UI。

### 14.3 一次性授权对象

`AuthorizedToolInvocation`：

- 只能由自动允许路径或有效 pending 的批准解析产生。
- 使用模块私有 `WeakSet/WeakMap` 注册，类型品牌不能替代运行时身份检查。
- 深冻结并绑定 toolCallId、prepared invocation 与 risk assessment。
- 不公开构造函数，不提供序列化/反序列化。
- 调用执行网关时先原子标记 consumed，再调用 executor。
- 无论 executor 成功、失败、超时或取消，授权均不能再次使用。
- 克隆、JSON round-trip、字段相同对象和第二次执行都必须失败且无副作用。

### 14.4 状态转换

```text
assess = allow
  → authorized(unused)
  → execute attempt
  → consumed

assess = require_approval
  → pending
  ├─ approve → resolved → authorized(unused) → execute attempt → consumed
  └─ reject  → resolved → TOOL_APPROVAL_REJECTED（不执行）

assess = deny
  → TOOL_POLICY_DENIED（不创建 pending，不执行）
```

同一 pending 第二次 resolve 必须返回明确的 approval lifecycle 错误，不能产生第二份授权。

## 15. 受控执行网关

阶段 07 完成后，生产公共流程应为：

```ts
requestLocalToolAuthorization(toolCallId, invocation)
resolveLocalToolApproval(pending, decision)
executeAuthorizedLocalTool(context, authorization)
```

公共结果建议使用判别联合：

```ts
type AuthorizationRequestResult =
  | { status: "authorized"; assessment: RiskAssessment; authorization: AuthorizedToolInvocation }
  | { status: "approval_required"; assessment: RiskAssessment; pending: PendingToolApproval }
  | { status: "denied"; assessment: RiskAssessment; result: ToolResult };

type ApprovalResolutionResult =
  | { status: "authorized"; authorization: AuthorizedToolInvocation }
  | { status: "rejected"; result: ToolResult }
  | { status: "invalid"; error: ApprovalLifecycleError };
```

执行边界调整：

- `executePreparedLocalTool` 从 `@/lib/tools` 公共 barrel 移除。
- `@/lib/approval` 内部可以从工具内部模块调用 raw executor。
- 后续 Agent、终端、Route Handler 和 UI 只能依赖 `@/lib/approval` 公共网关。
- 原始源文件路径仍可被仓库内部直接 import，因此这是一条应用架构边界，不宣称是针对恶意本机代码的安全隔离。
- 工具层已有单元测试可针对内部 registry 继续验证 raw executor；公共 barrel 测试必须证明生产出口已收紧。

这项导出调整是阶段 06 已预留的“prepare → risk/approval → execute”插入点，不改变六工具行为、参数或路径安全规则。

## 16. 错误模型

### 16.1 ToolResult 错误

| code | 场景 | recoverable | 执行器是否调用 |
| --- | --- | --- | --- |
| `TOOL_POLICY_DENIED` | 命中不可批准的禁止规则 | false | 否 |
| `TOOL_APPROVAL_REJECTED` | 用户拒绝本次调用 | true | 否 |
| `TOOL_AUTHORIZATION_INVALID` | 授权伪造、克隆或重放 | false | 否 |

解释：

- `TOOL_POLICY_DENIED` 的当前动作不可重试或通过批准恢复；阶段 09 可决定是否把结果反馈给模型寻求完全不同的方案。
- `TOOL_APPROVAL_REJECTED` 标为可恢复，表示 Agent 可选择不需要该权限的替代方案，不表示可以无提示重复请求同一操作。
- 授权无效表示内部调用契约被破坏，不应由模型修正。

### 16.2 审批生命周期错误

审批对象伪造、approvalId 不匹配、已解析或状态非法使用独立 `ApprovalLifecycleError` 数据联合，不抛出含 stack 的对象跨边界。稳定 code 至少包括：

```text
APPROVAL_INVALID
APPROVAL_ALREADY_RESOLVED
APPROVAL_ID_MISMATCH
APPROVAL_DECISION_INVALID
```

阶段 09/13 再决定这些错误如何映射为运行失败或 HTTP 状态；本阶段不定义 HTTP。

### 16.3 异常传播

- `LocalToolExecutionAbortedError` 必须原样传播，不能转为普通 ToolResult。
- raw executor 返回的工具失败保持原语义。
- 策略内部意外异常不得触发执行；网关返回稳定内部错误或抛出仅供服务器处理的受控错误，具体形式在 Task 中锁定。
- 错误、details、reason 和 summary 不包含 stack、绝对工作区路径、环境变量或完整写入内容。

## 17. 数据最小化与摘要

- 文件工具摘要只含工具名和工作区相对路径；写入/替换不含完整 content、oldText 或 newText。
- 进程摘要展示 program、cwd 和有限 argv 预览；每个 token 做 secret redaction 和 JSON 转义。
- 总摘要受 1024 字符上限约束，并标记是否截断；分类始终使用完整内部 args，不使用截断摘要。
- 风险 reason 使用固定模板，不回显未经限制的模型文本。
- assessment、pending public view 和所有错误均只能包含普通 JSON 兼容安全字段。
- approval capability、prepared invocation 和完整写内容只存在当前 Node 进程内存。

## 18. 与事件、恢复和后续阶段的边界

### 18.1 阶段 08 JSONL

- 只持久化现有 `approval.required`/`approval.resolved` 字段。
- 不持久化 pending/authorization 对象或完整 invocation。
- 进程崩溃时未完成运行后续标记为 interrupted，不从 approved 事件重放危险操作。

### 18.2 阶段 09 Agent

- Agent 在内存 map 中按 approvalId 持有 pending 对象。
- 需要审批时写 `approval.required` 并进入 `awaiting_approval`。
- 批准后写 `approval.resolved(approved=true)`，获得 authorization，之后才写 `tool.started` 并执行。
- 拒绝后写 `approval.resolved(approved=false)` 和失败 `tool.result`，不能写 `tool.started`。
- 同一工具调用不得并发 resolve 或 execute。
- 用户取消等待时丢弃 pending 能力并进入 cancelled。

### 18.3 阶段 11 终端

- 终端先展示 reason、toolSummary 和 publicArguments，再读取批准/拒绝。
- 终端不能接收或展示完整内部 invocation。
- 人工测试必须覆盖允许、拒绝、重复决定和取消等待。

### 18.4 阶段 13/14 API 与 UI

- Route Handler 使用 Node Runtime，动态 params 按 Next.js 16 Promise 语义读取。
- HTTP 请求只能提交 approvalId、approved 和有限 reason。
- 客户端不能构造 authorization，也不能要求“以后始终允许”。
- UI 只展示事件和 pending public view，不缓存执行权限。

## 19. 公共接口约束

批准本 Spec 即锁定以下语义，不锁定函数参数的最终排版：

1. 风险判断输入必须是 prepared invocation，不接受原始 ToolCall 或 command string。
2. 风险结果必须是 `allow/require_approval/deny` 判别联合。
3. 审批必须绑定 toolCallId、approvalId 和 prepared 对象身份。
4. 授权必须是不可序列化、不可伪造、单次消费的内存能力。
5. raw executor 必须退出工具公共 barrel；生产调用统一经过审批网关。
6. 拒绝和重放不能调用 executor。
7. 事件协议字段和 protocol version 不变。
8. 所有公共运行时输入继续由 Zod strict 校验。

Task 必须给出最终导出名称、逐文件改动和每一项接口测试；如果实现阶段需要改变以上语义，必须回到 Spec 重新审批。

## 20. 预期文件范围

Task 获批后预计允许：

- 新增 `lib/approval/**`。
- 修改 `lib/tools/index.ts` 收紧 raw executor 导出。
- 必要时对 `lib/tools/registry.ts` 做不改变 raw 行为的内部可测试调整。
- 新增 `tests/unit/approval/**`。
- 修改与公共 barrel 相关的既有工具测试。
- 更新本阶段 Task、Summary 和开发索引。

不得修改：

- `app/**`、Next.js 路由或 UI。
- `lib/model/**`、`lib/workspace/**` 的批准行为。
- `lib/domain/event.ts` 的事件字段或协议版本。
- package/lock、TypeScript、ESLint、Vitest、Playwright 配置。

如 Task 发现需要超出此范围，必须先修订 Spec 或 Task 并重新审批。

## 21. 可测试验收标准

### 21.1 分类

- [ ] 六个非进程工具全部得到规定的唯一结论。
- [ ] 只读/写入文件工具的摘要不泄露内容或绝对路径。
- [ ] 精确 `git status/diff` 和四类项目验证脚本自动允许。
- [ ] 安装、Git 写、Shell、迁移、格式化、删除、path-qualified 与未知程序需要审批。
- [ ] sudo、系统/进程控制、宽泛删除和 hard reset 直接拒绝。
- [ ] 禁止规则优先于 wrapper、shell 和未知程序审批规则。
- [ ] 外部路径 token、Git 全局路径参数和 `diff --no-index` 不会自动执行。
- [ ] 未知 flag 和额外脚本参数不会扩大自动 allowlist。

### 21.2 审批能力

- [ ] 自动允许产生有效一次性 authorization。
- [ ] 高风险调用产生 UUID pending 和事件兼容 public view。
- [ ] 批准只为原 pending 产生一份 authorization。
- [ ] 拒绝返回 `TOOL_APPROVAL_REJECTED` 且 executor 调用次数为 0。
- [ ] 直接拒绝返回 `TOOL_POLICY_DENIED` 且不创建 pending、不执行。
- [ ] pending 重复 resolve、伪造、克隆和 ID 不匹配均失败。
- [ ] authorization 重复执行、伪造、克隆和 JSON round-trip 均失败且无副作用。
- [ ] authorization 在执行尝试失败或取消后仍已消费。

### 21.3 数据与错误

- [ ] reason ≤ 4096 字符，toolSummary ≤ 1024 字符。
- [ ] secret-like argv、写入预览和错误经过既有脱敏规则。
- [ ] 分类使用完整参数，不受显示截断影响。
- [ ] 所有 ToolResult 再经 `ToolResultSchema` 验证。
- [ ] approval decision 拒绝未知字段和超长 reason。
- [ ] 不输出 stack、完整环境、绝对工作区路径或写入正文。

### 21.4 架构与回归

- [ ] `@/lib/approval` 不导入 Next.js、React 或浏览器 API。
- [ ] `@/lib/tools` 公共 barrel 不再导出 raw executor。
- [ ] 测试使用 prepared 调用、注入执行器和临时工作区，不触碰真实项目。
- [ ] 既有 lint、typecheck、全量 unit/integration、build 均通过。
- [ ] `git diff --check` 通过且无新增依赖或秘密。

## 22. 测试矩阵建议

Task 至少应把以下矩阵拆成独立测试：

| 组 | 样例 |
| --- | --- |
| 自动只读 | list/read/search、`git status --short`、`git diff --check` |
| 自动写入 | write/replace prepared 调用 |
| 自动验证 | pnpm/npm/yarn/bun 的精确 test/lint/typecheck/build |
| 依赖审批 | install/add/remove/update、npx/dlx |
| Git 审批 | add/commit/restore/checkout/push/reset soft |
| Shell 审批 | bash/zsh/sh/pwsh，无禁止 payload |
| 迁移/格式化 | migrate、db:push、format、lint:fix、--write/--fix |
| 未知审批 | python/node/custom binary、未知 Git flag、额外 script args |
| 直接拒绝 | sudo/doas、shutdown/reboot、kill/pkill、rm broad、find -delete、git clean force、reset hard |
| 绕过形状 | `/usr/bin/sudo`、`env sudo`、`sh -c "sudo ..."`、Git 全局参数、path-qualified program |
| 路径 | `/etc/...`、`../...`、`--output=../...`、合法相对 pathspec、URL/版本号非误判 |
| 能力 | pending/authorization forged、clone、round-trip、重复 resolve/execute、ID mismatch |
| 执行 | allow/approve 正好执行一次；deny/reject/invalid 零次；Abort 原样传播 |
| 披露 | argv secret、超长摘要、写入正文不出现、错误字段有限 |

## 23. 风险、限制与缓解

### 23.1 静态分类不是沙箱

风险：获批的 Shell、未知程序或 package script 可以在内部访问网络、工作区外文件或启动子进程。

缓解：默认审批、精确一次性授权、无“永久允许”、明确可信单用户声明；最终 README/UI 持续说明。强 OS 沙箱不在首版范围。

### 23.2 Shell 与 wrapper 无法完整解析

风险：仅用规则无法识别所有动态拼接、编码和脚本语言间接执行。

缓解：只对高置信禁止形状直接拒绝；所有 Shell、wrapper 未知形状和脚本语言默认审批，不宣称完全检测。

### 23.3 自动项目脚本可有副作用

风险：名称为 `test/build/lint/typecheck` 的 package script 本质上仍是工作区代码。

缓解：这是已批准需求与可信工作区假设下的明确例外；只允许精确脚本名和无额外参数，其他形状审批。

### 23.4 内存审批不能跨重启

风险：服务重启后 JSONL 中可能有 approved 事实，但原 authorization 不存在。

缓解：事件不是能力；阶段 08/09 将未结束运行标记 interrupted，用户通过“继续任务”创建新决策，不重放旧危险操作。

### 23.5 模块导出不是恶意代码隔离

风险：仓库内部代码仍可按源路径导入 raw executor。

缓解：公共 barrel 和生产调用链收紧并以测试审计；项目只面向自身代码和可信本地用户，不把 TypeScript 模块边界宣传为安全沙箱。

### 23.6 规则过窄会增加审批

风险：合法命令因未知 flag 或 program 路径形式进入审批。

缓解：首版安全优先；只有通过测试和新 Spec/Task 审批才能扩大 allowlist，不能在运行时学习永久许可。

## 24. 明确假设

- 用户选择的工作区及其 build/test script 是可信的。
- 模型输出不可信，必须经过 prepare 和风险层。
- 用户批准代表愿意承担该次明确展示操作的本机副作用。
- 首版单进程、单用户；pending/authorization 只在当前进程存在。
- 工具调用串行执行，阶段 09 不会并发消费同一 authorization。
- Windows 命令名可被分类，但首要运行与验收环境为当前 Node.js 支持的本地平台。
- 风险 allowlist 是代码和测试固定策略，不从历史批准自动扩张。

## 25. 本次审批将确认的决策

批准本 Spec 即表示确认：

1. 风险结论采用 `allow/require_approval/deny` 三态，禁止项优先。
2. 读/搜自动允许；结构化工作区写入自动允许但完整记录。
3. 仅精确 Git 只读和精确项目验证脚本自动执行，未知参数降级审批。
4. 安装、Git 写、Shell、迁移、全仓格式化、删除和未知程序必须单次审批。
5. sudo、系统/进程控制、宽泛删除、hard reset，以及结构化参数中可可靠识别的显式工作区逃逸直接拒绝。
6. 审批绑定当前 toolCallId 与 prepared 对象身份，不提供永久允许。
7. authorization 是内存中不可序列化、不可伪造、单次消费的能力。
8. 事件只记录审批事实，不承担执行授权；重启后不重放能力。
9. raw executor 从工具公共 barrel 移除，后续生产调用只走 approval gateway。
10. 阶段 07 不实现等待、持久化、终端、API 或 UI，不修改领域事件协议。

## 26. Spec 内部门禁

- [x] 已对照阶段 00、01、03、05、06 的批准文档。
- [x] 已读取相关源码、测试、配置、Git 状态和 Next.js 16.3.3 本地指南。
- [x] 当前能力、差距、范围内外和后续阶段边界明确。
- [x] 三态风险、命令矩阵、优先级和 wrapper 限制明确。
- [x] 审批绑定、一次性授权、错误与数据最小化规则明确。
- [x] 验收标准和测试矩阵可执行。
- [x] 未修改业务代码、依赖、配置或测试。
- [x] 未生成 Task 或 Summary。

**Spec 内部门禁：通过。当前状态：待用户审批。**

用户批准前不得生成阶段 07 Task，不得编写风险/审批代码或测试。

## 27. 用户审批记录

- 审批结果：待用户审批。
- 批准后解锁：只允许生成 `07-risk-approval-tasks.md`。
- 仍然禁止：Task 获批前不得进入实际开发。
