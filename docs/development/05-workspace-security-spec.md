# 阶段 05 Spec：工作区安全层

## 1. 文档状态

- 状态：已批准。
- 当前子阶段：只读观察与 Spec。
- 前置阶段：阶段 04 Summary 已获用户批准，阶段 04 正式完成。
- 后续动作：本 Spec 获批后才能生成 `05-workspace-security-tasks.md`。
- 禁止动作：审批前不得创建 `lib/workspace`、工作区测试、Task 或 Summary，不得修改领域、模型、工具、API、终端或 UI 代码。

## 2. 阶段目标与需求追踪

建立一个纯 Node.js、提供方无关的工作区安全边界。它负责把用户输入的绝对项目目录验证并固定为不可伪造的工作区句柄，再把模型或工具提供的相对路径解析为经过真实路径检查的本机目标，阻止绝对路径、`..` 穿越、符号链接逃逸、根目录替换和陈旧写入目标继续执行。

覆盖需求：

- `FR-001`：为“绝对路径创建并绑定工作区”提供核心验证能力；会话/API/最近目录仍在后续阶段。
- `NFR-002`：所有工作区根路径、工具相对路径和解析选项均进行运行时校验。
- `NFR-003`：不存在、权限、类型、逃逸和工作区变化均转换为结构化错误。
- `NFR-006`：工作区边界不依赖 React、浏览器、Next.js 路由、模型或 Agent，可在 Node Vitest 独立测试。
- `NFR-008`：明确记录真实路径算法、TOCTOU 边界、错误和验收证据。
- `SEC-001`：所有文件工具目标必须限制在当前工作区。
- `SEC-002`：符号链接不得把访问目标引出工作区。
- `SEC-007`：为阶段 06 的写前复验和内容哈希防陈旧写入提供路径级前置保证；内容哈希本身仍属于文件工具阶段。
- `SEC-008`：明确这是可信本地单用户的应用级边界，不冒充强操作系统沙箱。
- `COM-002`、`COM-003`：本机路径检查自行实现，不依赖托管代码/文件工具或 Agent 框架。

## 3. 只读观察范围与事实证据

### 3.1 已阅读资料

- [阶段开发与三级审批门禁](./00-process.md)。
- [阶段 01 需求、范围与验收](./01-requirements.md)。
- [阶段 03 领域协议 Spec](./03-domain-protocol-spec.md)与 [Summary](./03-domain-protocol-summary.md)。
- [阶段 04 模型协议 Spec](./04-model-protocol-spec.md)与 [Summary](./04-model-protocol-summary.md)。
- 当前 `lib/**`、`tests/**`、`package.json`、`tsconfig.json`、`vitest.config.mts`、`.gitignore` 和 Git 工作树。
- 当前运行环境：Node.js `v24.15.0`、pnpm `10.33.3`；项目最低 Node.js 版本仍为 `>=20.9.0`。

### 3.2 当前代码事实

- `lib` 目前只有 `domain` 和 `model`，没有 workspace/path/security/tool/process 模块。
- `SessionRecord.workspacePath` 目前只是最长 4096 字符的字符串；阶段 03 明确没有验证其存在性、绝对性或真实路径。
- 领域层已有 `ErrorInfo`、UTF-8 字节计算、脱敏和安全事件投影辅助，但没有工作区专用错误类。
- Vitest 使用 Node 环境并支持 `@` 根路径 alias，适合用临时目录执行真实文件系统边界测试。
- `.secode-data` 已被 Git 忽略，但最近工作区和 Session 存储尚未实现。
- 阶段 04 公共模型层不依赖工作区；阶段 05 不需要也不应修改 `lib/model`。
- 当前工作树包含已批准的阶段 03、04 产物和更早文档修改；阶段 05 必须保留这些内容。

### 3.3 平台 API 事实

- `fs.promises.realpath` 可取得现存路径解析符号链接后的路径，但不能直接解析尚不存在的写入目标。
- `lstat` 能识别最终路径项本身是否为符号链接，`stat`/`realpath` 观察的是跟随链接后的目标。
- 安全的目录包含判断必须使用 `path.relative` 和绝对性检查；字符串 `startsWith(root)` 会把 `/project-copy` 误判为 `/project` 内部。
- Node 标准路径 API无法提供类 Unix `openat`/目录文件描述符约束下的完整无竞态遍历；真实路径校验与最终 I/O 之间仍可能发生本机竞态。
- 因而本阶段应缩短校验到操作的窗口并提供二次复验，但不能宣称抵御拥有本机并发写权限的恶意进程。

## 4. 当前差距

当前任何字符串都可以作为 `workspacePath` 或未来工具路径。若直接把它传给 `readFile`、`readdir`、`rg` 或子进程，会存在：

1. 用户工作区根路径是相对路径、普通文件、不存在、不可访问或操作系统根目录。
2. 模型传入 `/etc/passwd`、`../outside`、Windows drive/UNC 等绝对或穿越形式。
3. 候选路径词法上位于工作区，但父目录或最终项通过符号链接指向外部。
4. `/workspace-other` 被脆弱的字符串前缀判断误认为 `/workspace` 子路径。
5. 工作区在会话期间被删除、替换或交换为另一个目录/链接，旧句柄继续工作。
6. 写入解析时目标安全，但写入前父目录、目标类型或文件身份已经变化。
7. Node 原生异常把绝对路径、syscall、stack 或其他实现细节直接传播到模型和事件。
8. 不同工具自行实现不同路径规则，产生读取允许、写入拒绝或进程 cwd 越界的规则漂移。

## 5. 范围

### 5.1 范围内

- 验证用户输入的绝对工作区目录。
- 通过 `realpath` 固定规范化工作区根路径。
- 记录工作区根目录的设备号和 inode 身份，用于运行期变化检测。
- 建立不可由普通对象伪造的内存工作区句柄。
- 定义工具相对路径的可移植语法和规范化输出。
- 解析必须存在的文件、目录或任意现存项。
- 解析“父目录已存在、叶子可存在或不存在”的可写目标。
- 检查词法包含、真实路径包含、父目录链接及最终链接。
- 为变更型工具提供写前二次复验契约。
- 统一 Node 文件系统错误到有限、可解释、无 stack 的 `WorkspaceLayerError`。
- 用真实临时目录覆盖穿越、符号链接、前缀碰撞和目录替换测试。
- 建立 `@/lib/workspace` 唯一公共入口。

### 5.2 范围外

- `list_directory`、`read_file`、`search_text`、`write_file`、`replace_in_file` 和 `run_process` 的实际执行；属于阶段 06。
- 文件内容 SHA-256、陈旧内容哈希比较、原子临时文件与 rename；属于阶段 06。
- 命令可执行程序、参数、shell、Git 和安装依赖的风险分类；属于阶段 07。
- 最近工作区、Session 元数据和 JSONL 持久化；属于阶段 08。
- Agent 提示词、工具循环、审批等待、取消和事件生成；属于阶段 09。
- 原生目录选择器、Route Handler、终端和 Web UI。
- chmod、ACL、macOS sandbox、容器、虚拟机、chroot 或恶意本机进程防护。
- 自动要求工作区必须是 Git 仓库；普通项目目录也允许。
- 自动创建缺失父目录；首版可写路径要求父目录已存在。

## 6. 信任模型与核心不变量

### 6.1 信任模型

- 工作区根路径由可信本地用户选择，但仍需防止误选和后续变化。
- 工具相对路径视为不可信模型输出，必须在每次 I/O 前验证。
- 本地工作区内容可以包含符号链接、损坏链接、特殊文件和异常长名称。
- 不假设模型理解当前操作系统路径语法。
- 不防御拥有同一用户权限、能在纳秒级并发替换目录项的恶意本机程序。

### 6.2 必须始终成立的不变量

1. 未经 `createWorkspaceHandle` 成功验证的工作区不能用于解析路径。
2. 工作区根路径必须是现存绝对目录的规范真实路径，且不能是文件系统根目录。
3. 工具输入只能使用本 Spec 定义的相对路径语法，不能使用本机绝对路径或 `..`。
4. 所有现存目标的 `realpath` 必须等于工作区根或严格位于其下。
5. 所有可写目标的真实父目录必须严格位于工作区内；不能写工作区根本身。
6. 读取可跟随仍位于工作区内的符号链接；任何逃逸链接均拒绝。
7. 变更型操作不得把最终符号链接当作普通文件覆盖，即使链接目标仍在工作区内。
8. 工作区根身份变化后旧句柄失效，不能静默绑定到新目录。
9. 路径错误只公开有限原因和规范相对路径，不传播 Node stack、完整 cause 或未校验的原始输入。
10. Stage 06 的每个文件和 cwd 操作必须通过同一公共工作区入口，不得另写旁路解析器。

## 7. 模块与依赖边界

预计生产模块：

```text
lib/workspace/types.ts
lib/workspace/path-input.ts
lib/workspace/boundary.ts
lib/workspace/index.ts
```

职责：

- `types.ts`：公共句柄、解析结果、选项、错误码和 `WorkspaceLayerError`。
- `path-input.ts`：纯字符串级的工作区根输入与工具相对路径校验/规范化。
- `boundary.ts`：Node `fs/promises`、`path`、真实路径、目录身份和可写目标复验。
- `index.ts`：唯一公共导出，不暴露句柄 WeakMap、原始 `Stats` 或底层 errno 映射器。

依赖约束：

- 只允许 Node 标准库、Zod 和 `@/lib/domain`。
- 不依赖 `@/lib/model`、React、Next.js、浏览器、Agent、工具实现、存储或子进程。
- 不增加 package 或修改 TypeScript、Vitest、ESLint、Next.js 配置。
- 生产模块不得读取 `process.cwd()` 作为隐式工作区，也不得读取环境变量。

## 8. 公共数据契约

建议公共接口固定为：

```ts
type WorkspaceEntryKind = "file" | "directory" | "other";
type ExpectedWorkspaceEntryKind = "file" | "directory" | "any";

interface WorkspaceHandle {
  readonly rootPath: string;
  // unique-symbol brand；真实身份另存于模块私有 WeakMap
}

interface ExistingWorkspacePath {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly kind: WorkspaceEntryKind;
  readonly followedSymbolicLink: boolean;
}

interface WritableWorkspacePath {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly parentPath: string;
  readonly existed: boolean;
  readonly kind?: WorkspaceEntryKind;
}

interface ResolveExistingOptions {
  expectedKind?: ExpectedWorkspaceEntryKind;
}

interface ResolveWritableOptions {
  allowExisting?: boolean;
}

createWorkspaceHandle(input: string): Promise<WorkspaceHandle>;
normalizeWorkspaceRelativePath(input: string): string;
resolveExistingWorkspacePath(
  workspace: WorkspaceHandle,
  input: string,
  options?: ResolveExistingOptions,
): Promise<ExistingWorkspacePath>;
resolveWritableWorkspacePath(
  workspace: WorkspaceHandle,
  input: string,
  options?: ResolveWritableOptions,
): Promise<WritableWorkspacePath>;
revalidateWritableWorkspacePath(
  workspace: WorkspaceHandle,
  previous: WritableWorkspacePath,
): Promise<WritableWorkspacePath>;
```

接口决策：

- `WorkspaceHandle.rootPath` 是用户已经选择的规范绝对路径，可用于 Session 元数据和本地 UI；句柄身份数据不可枚举、不可持久化。
- Session 恢复时必须用保存的 `rootPath` 重新调用 factory，不能反序列化伪造句柄。
- `absolutePath` 只供服务端工具执行，不能发送给模型或直接写入工具公开参数；模型和工具事件优先使用 `relativePath`。
- 所有返回对象冻结，避免后续调用方篡改安全检查结果。
- 公共输入在 TypeScript 类型之外仍需运行时验证。

## 9. 工作区根验证

`createWorkspaceHandle(input)` 按固定顺序执行：

1. 验证输入是非空字符串，UTF-8 不超过 4096 字节，不含 NUL、换行或其他 C0/DEL 控制字符。
2. 要求是当前平台的绝对文件系统路径；`~`、`file://` 和相对路径不展开。
3. 对输入执行 `realpath`；不存在、权限不足和其他 I/O 错误转换为工作区错误。
4. 对真实路径执行 `stat`，要求为目录。
5. 若真实路径等于 `path.parse(realPath).root`，以 `WORKSPACE_ROOT_TOO_BROAD` 拒绝；不禁止用户明确选择 home 或其他较大非根目录，但后续 UI 应提示范围。
6. 捕获真实目录的 `dev`、`ino` 与规范根路径，写入模块私有 WeakMap。
7. 返回冻结句柄，`rootPath` 使用真实路径，不保留可能变化的符号链接别名。

用户输入的工作区根本身可以是指向目录的符号链接；成功创建后绑定的是当时链接解析到的真实目录。之后原别名变化不会重定向既有句柄。

## 10. 工具相对路径语法

模型工具路径采用与操作系统无关的正斜线语法：

- 根目录必须显式写为 `.`。
- 普通示例：`src/app.ts`、`./src/app.ts`。
- 允许重复 `/` 和 `.` 段，并输出规范形式 `src/app.ts`。
- 输入必须是非空字符串，UTF-8 不超过 4096 字节。
- 拒绝 NUL、C0/DEL 控制字符和反斜线 `\`，避免 POSIX 文件名与 Windows 分隔符产生歧义。
- 拒绝以 `/` 开头、Windows drive 形式（如 `C:/x`）和 UNC/device 形式。
- 在规范化前按 `/` 分段；任何 `..` 段都直接拒绝，即使最终规范结果仍在工作区。
- 不做 URL decode、shell expansion、环境变量 expansion、Unicode normalization 或大小写改写。
- 规范结果只能是 `.` 或不以 `/` 开头且不含 `.`/`..` 段的 POSIX 相对路径。

拒绝反斜线是一项有意的可移植性限制。模型始终使用 `/`；即使应用运行在 Windows，边界层也把各段通过本机 `path.join` 组装，不把原始字符串直接交给本机路径解析器。

## 11. 工作区身份复验

每次解析现存或可写路径前必须验证句柄：

1. 句柄必须存在于模块私有 WeakMap；普通 `{ rootPath }` 对象无效。
2. 对保存的规范根路径重新 `realpath` 和 `stat`。
3. 当前真实路径必须与保存根路径相同。
4. 当前 `dev`、`ino` 必须与创建时一致，且仍为目录。
5. 不存在、被换成文件、被换成链接到其他位置或 inode 改变时，返回 `WORKSPACE_CHANGED`。

这样可以防止删除旧项目后在同一路径创建新目录时，会话无提示地切换项目。用户可重新验证路径并创建新会话/句柄。

## 12. 现存目标解析算法

`resolveExistingWorkspacePath`：

1. 运行相对路径规范化和工作区身份复验。
2. 将规范 POSIX 段逐段 `path.join` 到规范根目录；不得直接把原始输入传给 `path.resolve`。
3. 对候选项先 `lstat`，记录最终项本身是否为符号链接。
4. 对候选项执行 `realpath`，再 `stat` 取得跟随链接后的类型。
5. 使用 `path.relative(rootPath, targetRealPath)` 判断包含关系。仅当结果为空，或不是绝对路径、不是 `..`、也不以 `..${path.sep}` 开头时才位于工作区。
6. 若真实目标逃逸，返回 `WORKSPACE_SYMLINK_ESCAPE`；不能把外部真实路径放入 public error。
7. 按 `expectedKind` 验证 file/directory/any；socket、FIFO、device 等归类为 `other`。
8. 返回的 `absolutePath` 使用目标真实路径；`relativePath` 保留规范后的逻辑工具路径。

读取和列目录允许通过内部符号链接到达仍位于同一工作区的目标。这样可支持常见项目链接，同时所有外部链接均被真实路径包含检查拒绝。

## 13. 可写目标解析与二次复验

`resolveWritableWorkspacePath` 用于未来 `write_file` 和 `replace_in_file`，规则为：

1. 相对路径不能是 `.`，不能以工作区根为写入目标。
2. 叶子父目录必须已经存在；本阶段不递归创建父目录。
3. 对父目录执行 `realpath`、`stat` 和包含检查，要求真实目录位于工作区。
4. 最终执行路径由 `parentRealPath + basename` 组成，不继续使用含父级符号链接别名的候选字符串。
5. 若叶子不存在，返回 `existed: false`；除 ENOENT 外的 lstat 错误不能当作不存在。
6. 若叶子存在，检查 `allowExisting`、真实路径包含关系和类型。
7. 最终项本身若是符号链接，变更操作以 `WORKSPACE_FINAL_SYMLINK_WRITE_DENIED` 拒绝，即使链接目标仍在工作区。这样避免原子 rename 意外替换链接本身，而普通写入却修改链接目标的语义分裂。
8. 私有快照记录父目录 dev/ino，以及存在叶子的 dev/ino、类型和是否存在；这些字段不进入可枚举结果。

`revalidateWritableWorkspacePath` 必须紧邻实际变更前调用：

- 重新执行工作区身份、相对路径、父目录真实路径、父目录身份和目标状态检查。
- previous 必须是本模块产生且仍关联同一工作区的冻结结果；伪造或跨工作区使用拒绝。
- 父目录真实位置/身份变化、目标从不存在变为存在、目标消失、inode/类型变化或出现最终符号链接均返回 `WORKSPACE_PATH_CHANGED`。
- 成功时返回新的冻结结果；阶段 06 必须使用新结果执行写入。

路径复验与阶段 06 的内容哈希是互补关系：前者防目录项/身份陈旧，后者防同一文件 inode 内内容已变化。两者都通过后才允许覆盖。

## 14. 错误模型

稳定错误码建议：

```text
WORKSPACE_INPUT_INVALID
WORKSPACE_ROOT_NOT_ABSOLUTE
WORKSPACE_ROOT_NOT_FOUND
WORKSPACE_ROOT_NOT_DIRECTORY
WORKSPACE_ROOT_TOO_BROAD
WORKSPACE_ACCESS_DENIED
WORKSPACE_CHANGED
WORKSPACE_PATH_INVALID
WORKSPACE_PATH_NOT_FOUND
WORKSPACE_PATH_TYPE_MISMATCH
WORKSPACE_PATH_ESCAPE
WORKSPACE_SYMLINK_ESCAPE
WORKSPACE_PARENT_NOT_FOUND
WORKSPACE_EXISTING_TARGET_DENIED
WORKSPACE_FINAL_SYMLINK_WRITE_DENIED
WORKSPACE_PATH_CHANGED
WORKSPACE_IO_ERROR
```

`WorkspaceLayerError` 结构：

- `error` 必须通过阶段 03 `ErrorInfoSchema`。
- `cause` 只作为不可枚举的进程内值，不能 JSON 序列化。
- 对模型可修正的相对路径、not found、type mismatch 和 path changed 标记 `recoverable: true`。
- 非法工作区根通常允许用户改选，因此也可 recoverable；内部不变量错误为 false。
- public details 只允许有限字段：`field`、`reason`、`relativePath`、`expectedKind`、`actualKind`。
- `relativePath` 必须先规范化、脱敏并截断；若输入在规范化前即非法，只给 `field/reason`，不回显原始值。
- 不公开根目录之外的真实路径、Node `errno.path`、syscall、stack、dev、ino 或底层 `Stats`。

Node 错误映射：

- `ENOENT`：按上下文映射 root/path/parent not found。
- `EACCES`、`EPERM`：`WORKSPACE_ACCESS_DENIED`。
- `ENOTDIR`：root not directory、parent not found 或 type mismatch。
- `ELOOP`：路径或符号链接错误，不继续尝试。
- `ENAMETOOLONG`：input/path invalid。
- 未知 I/O：`WORKSPACE_IO_ERROR`，cause 私有保留。

## 15. TOCTOU 与安全边界

本阶段采用分层缓解：

```text
创建句柄时固定 root realpath + dev/ino
            ↓
每次解析前复验 root 身份
            ↓
现存目标检查 target realpath containment
可写目标检查 parent realpath + final lstat
            ↓
变更前重新解析并比较私有快照
            ↓
阶段 06 在同一真实父目录内临时写入并原子 rename
```

仍然存在的边界：标准 Node API下，攻击者可以在最后一次复验与最终 syscall 之间替换目录项。首版面向可信本地单用户，把该风险记录为应用级边界；不声称安全执行恶意本机竞争者或任意恶意获批进程。

阶段 06 应尽量：

- 使用本阶段返回的真实父目录路径。
- 缩短二次复验与 I/O 间隔。
- 不在复验后执行异步模型调用、审批等待或长任务。
- 临时文件与目标放在同一已验证目录。
- 原子 rename 前再次校验内容哈希与路径快照。

## 16. 隐私、日志与模型投影

- 用户可在本地 UI 看到其选择的规范绝对 workspace root，Session 元数据也可本地保存它。
- 模型默认只接收工具相对路径和必要项目上下文，不需要接收本机绝对根路径。
- 工具参数/事件记录规范相对路径；内部 `absolutePath`、root identity 和 Node cause 不进入事件。
- 路径中若出现 Key/Bearer 等模式，公开前复用阶段 03 `redactSecrets` 和 UTF-8 截断。
- 工作区句柄和可写快照不跨进程持久化；恢复时重新验证。
- 本阶段不读取文件内容，因此不会产生代码内容或二进制泄露。

## 17. 与后续阶段的契约

### 17.1 阶段 06 本地工具

- 六个工具的 path/cwd 都必须调用 `@/lib/workspace`。
- 读取、目录和搜索入口使用 existing resolver。
- 写入/替换使用 writable resolver，审批等待之后必须重新 resolve/revalidate，不能复用审批前快照。
- `run_process.cwd` 必须解析为现存 directory；程序执行风险不由工作区层决定。
- 工具输出只公开相对路径；内容哈希和原子更新由工具层补充。

### 17.2 阶段 07 风险与审批

- `WORKSPACE_PATH_ESCAPE` 和 `WORKSPACE_SYMLINK_ESCAPE` 是直接拒绝，不可通过用户审批绕过。
- 审批只决定一个本来位于工作区内的操作是否可执行，不扩大工作区边界。
- 审批等待后必须重新验证工作区和目标路径。

### 17.3 阶段 08 存储

- Session 只保存规范 `rootPath` 字符串，不保存句柄、dev/ino 或解析快照。
- 恢复 Session 时重新创建句柄；失败则把工作区标记为不可用，不静默沿用旧状态。
- 最近目录只保存成功验证过的规范根路径。

### 17.4 阶段 09、11、13、14

- Agent、终端和 API 只能接收工作区 ID/句柄或规范根路径，不能让模型自行设置绝对工具路径。
- API 的 workspace validate Route Handler 最终直接调用同一 factory，不复制规则。
- UI 负责显示用户输入错误，不负责做安全判断。

## 18. 测试设计

测试只使用 `fs.promises.mkdtemp` 在操作系统临时目录中创建隔离树；不得读取、修改或删除真实用户项目。

### 18.1 纯路径输入

- 合法：`.`、`src/file.ts`、`./src//file.ts`、包含空格和中文的路径。
- 非法：空串、绝对 POSIX、`C:/x`、UNC/device、反斜线、NUL/控制字符、任意 `..` 段、超 4096 UTF-8 字节。
- 规范输出使用 `/`，不受当前 cwd 影响。

### 18.2 根目录验证

- 真实绝对目录成功并返回 realpath。
- 指向内部目录的根 symlink 被固定为真实目录。
- 相对路径、`~`、不存在、普通文件、不可访问目录和文件系统根拒绝。
- 伪造句柄、已删除根、同路径新 inode、根被替换为外部链接均失效。

权限用例在 root/CI 无法可靠触发时，可通过可注入的最小 fs adapter 固定 errno 映射；不能把用例简单删除。

### 18.3 现存目标

- 根 `.`、普通文件、普通目录、中文路径。
- `expectedKind` 正反例和 special entry 分类。
- sibling prefix 碰撞，如 root `/tmp/project` 与 `/tmp/project-copy`。
- 内部 symlink 文件/目录允许，`followedSymbolicLink: true`。
- 最终或父目录 symlink 指向外部时拒绝。
- 损坏链接、循环链接、不存在项和权限错误结构化。

### 18.4 可写目标与复验

- 已存在普通文件与不存在叶子成功。
- 父目录不存在/不是目录、目标是目录、`allowExisting: false` 冲突。
- 内部/外部最终 symlink 均拒绝变更。
- 父目录内部 symlink 可解析为真实内部父目录；外部父链接拒绝。
- 解析后目标被创建、删除、替换，或父目录被换成外部链接时，revalidate 返回 path changed/escape。
- previous 被篡改、伪造或跨 workspace 使用时拒绝。

### 18.5 错误与泄露

- 每个稳定错误码至少一个直接用例或表驱动用例。
- `ErrorInfo` 可 JSON 序列化，cause、stack、dev/ino、外部绝对路径不出现。
- 含假 Bearer/Key 的非法路径不在错误中原样出现。
- 公共 barrel 不导出私有 identity/snapshot 访问器。

## 19. 验收标准

本 Spec 获批并实施后，阶段 05 必须满足：

1. 合法绝对目录可创建绑定真实路径的工作区句柄。
2. 相对路径解析不依赖 cwd，绝对、反斜线和任意 `..` 形式均拒绝。
3. 普通路径、内部 symlink 和中文路径能正确解析。
4. 最终链接、父链接、前缀碰撞和根替换不能逃出工作区。
5. 可写叶子只允许位于已存在的真实内部父目录，最终 symlink 不可修改。
6. 写前复验能发现工作区、父目录和目标身份变化。
7. 所有失败均为结构化有限错误，不暴露外部绝对路径、stack 或私有身份。
8. 模块不导入模型、Agent、Next.js、React、子进程或存储。
9. 不新增依赖，不修改阶段 03/04 公共协议。
10. 工作区单元测试、全量测试、lint、typecheck、build 和 `git diff --check` 全部通过。

## 20. 预计验证命令

实施阶段预计按以下顺序验证：

```text
pnpm exec vitest run tests/unit/workspace/path-input.test.ts
pnpm exec vitest run tests/unit/workspace/boundary.test.ts
pnpm exec vitest run tests/unit/workspace/errors.test.ts
pnpm exec vitest run tests/unit/workspace
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

不执行真实用户项目文件测试，不启动 Agent、终端或 Web UI。

## 21. 风险、假设与待确认决策

### 21.1 风险

- Node 标准 API 无法完全消除恶意本机并发替换路径的竞态。
- dev/ino 在某些特殊或网络文件系统上的稳定性可能弱于本地 APFS/ext4/NTFS；变化时将保守地使句柄失效。
- 禁止反斜线会排除 POSIX 中合法但罕见的反斜线文件名，换取跨平台工具协议无歧义。
- 禁止写最终 symlink 可能限制使用 symlink 管理源文件的仓库，但避免 write 与 atomic replace 语义不一致。
- 父目录必须已存在意味着 `write_file` 首版不能隐式创建整棵新目录；复杂目录创建可通过后续受控进程或未来专用工具扩展。
- 用户选择 home 等大目录仍会形成较宽边界；只强制拒绝文件系统根，UI 后续应提示工作区范围。

### 21.2 假设

- 主要目标是 macOS/Linux 本地开发，但路径协议和测试应保持 Windows 可实现。
- 工具会串行执行；同一运行不会并发写同一个目标。
- 用户不会主动运行一个专门与安全检查竞态的恶意本机进程。
- Session 恢复可以重新验证 root，而不是持久化 OS identity。
- 阶段 06 可在不修改本阶段公共接口的情况下实现内容哈希和原子更新。

### 21.3 本次审批将确认的决策

批准本 Spec 即表示确认：

1. 工作区句柄绑定 root realpath 与 dev/ino，根目录身份变化后失效。
2. 文件系统根目录不可作为工作区；home 等非根目录允许但后续提示风险。
3. 模型工具路径统一使用正斜线，拒绝反斜线、绝对路径、控制字符和任意 `..` 段。
4. 读取允许跟随仍在工作区内的 symlink，所有外部 symlink 拒绝。
5. 变更型操作禁止最终 symlink，即使它仍指向工作区内部。
6. 可写目标允许叶子不存在，但父目录必须已经存在，不自动递归建目录。
7. 写入前必须用私有快照二次复验；内容哈希和原子更新留给阶段 06。
8. Session 只持久化规范 rootPath，句柄和 dev/ino 每次恢复重建。
9. 这是可信本地单用户的应用级边界，不承诺抵御恶意本机竞态或获批进程。
10. 阶段 05 只实现工作区安全层，不提前实现文件工具、风险审批、存储、Agent、终端、API 或 UI。

## 22. Spec 内部门禁

- [x] 已记录阶段 04 Summary 用户批准并完成阶段切换。
- [x] 已完成需求、代码、配置、测试、运行环境和 Git 状态只读观察。
- [x] 当前差距、信任模型、范围内外和后续阶段接口明确。
- [x] 根验证、相对路径语法、真实路径包含、symlink 和身份复验算法明确。
- [x] 可写目标、写前复验、TOCTOU 边界与应用级安全声明明确。
- [x] 正常、失败、竞态、跨平台和泄露测试标准明确。
- [x] 未创建 workspace 代码、测试、Task 或 Summary，未安装依赖或操作真实项目。
- [x] 开发索引将更新为“阶段 05 Spec 待用户审批”。

**Spec 内部门禁：通过。当前状态：已批准。**

## 23. 用户审批区

请重点确认第 21.3 节的 10 项决策。批准后只允许基于本 Spec 生成阶段 05 Task；仍不会开始实际开发。

## 24. 用户审批记录

- 审批结果：阶段 05 Spec 已获用户批准。
- 已确认决策：root realpath 与身份绑定、可移植相对路径语法、内部读取 symlink、变更型最终 symlink 禁止、父目录预存在、写前复验及应用级安全边界。
- 解锁动作：允许生成 `05-workspace-security-tasks.md`。
- 仍然禁止：阶段 05 Task 获批前不得创建 `lib/workspace`、工作区测试或 Summary，不得修改后续阶段业务。
