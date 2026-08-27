# 阶段 05 Task：工作区安全层

## 1. 文档状态

- 状态：已批准。
- 依据 Spec：[05-workspace-security-spec.md](./05-workspace-security-spec.md)。
- Spec 状态：已批准。
- 当前子阶段：开发、验证与反思已完成。
- 后续动作：阶段 05 Summary 获批后才能开始阶段 06 观察。
- 禁止动作：Summary 审批前不得生成阶段 06 Spec 或开发本地工具系统。

## 2. 已批准范围摘要

本阶段实现纯 Node.js 工作区安全边界：

- 验证绝对工作区根并绑定规范 realpath、dev 和 ino。
- 建立不可由普通对象伪造的内存句柄。
- 规范化只使用正斜线的工具相对路径。
- 拒绝绝对路径、反斜线、控制字符和所有 `..` 段。
- 解析现存目标并检查真实路径包含关系。
- 允许读取型内部 symlink，拒绝任何外部 symlink。
- 解析父目录已存在的可写目标，禁止修改最终 symlink。
- 通过私有快照在变更前复验 root、父目录和叶子身份。
- 把 Node 文件系统失败转换为有限 `WorkspaceLayerError`。
- 只使用临时目录完成真实文件系统安全测试。

不实现文件内容读写、搜索、进程执行、内容哈希、原子更新、风险审批、存储、Agent、终端、API 或 UI。

## 3. 允许修改的文件范围

### 3.1 预计新增

```text
lib/workspace/types.ts
lib/workspace/path-input.ts
lib/workspace/boundary.ts
lib/workspace/index.ts
tests/unit/workspace/helpers.ts
tests/unit/workspace/path-input.test.ts
tests/unit/workspace/boundary.test.ts
tests/unit/workspace/errors.test.ts
docs/development/05-workspace-security-summary.md
```

实现可在 `boundary.ts` 内定义不从公共 barrel 导出的最小文件系统 adapter/factory，供权限和 errno 测试注入。若单文件因此明显失去可读性，必须先修订本 Task，将内部 adapter 移到明确的新文件；不得实现时临时扩展文件清单。

### 3.2 预计修改

```text
docs/development/05-workspace-security-tasks.md
docs/development/README.md
```

### 3.3 明确禁止

- 修改 `lib/domain/**` 或 `lib/model/**`。
- 修改阶段 03、04 已批准的公共类型和模型行为。
- 修改 `app/**`、Next.js、TypeScript、ESLint、Vitest、Playwright 配置。
- 修改 `package.json`、`pnpm-lock.yaml` 或安装依赖。
- 创建 `lib/tools`、`lib/security`、`lib/storage`、`lib/agent`、终端、Route Handler 或 UI。
- 读取、写入、重命名、chmod 或删除真实用户项目中的任何文件。
- 使用 shell 命令拼接模型路径做安全判断。
- 将工作区绝对路径、dev/ino、Node cause 或 stack 写入模拟 AgentEvent。

若实现需要改变已批准的路径语法、symlink 策略、root 身份规则、可写父目录规则、公共接口、错误码或文件范围，必须立即停止并申请 Spec 或 Task 修订审批。

## 4. 实现依赖顺序

```text
T05-01 公共类型与错误边界
    ↓
T05-02 纯相对路径校验与规范化
    ↓
T05-03 工作区 root factory 与身份复验
    ↓
T05-04 现存目标解析与 symlink 包含检查
    ↓
T05-05 可写目标解析、私有快照与二次复验
    ↓
T05-06 唯一公共导出与跨模块契约审查
    ↓
T05-07 完整工作区单元测试矩阵
    ↓
T05-08 全阶段门禁与安全审查
    ↓
T05-09 Summary
```

每项完成后先执行该项最小测试。不得在根验证、现存解析和可写复验同时存在未知失败时一次性诊断。

## 5. 详细任务清单

### T05-01：建立公共类型、稳定错误码和私有状态边界

覆盖：`NFR-002`、`NFR-003`、`NFR-006`、`SEC-008`。

输入：已批准 Spec 第 6–8、14 节，阶段 03 `ErrorInfoSchema`。

涉及文件：

```text
lib/workspace/types.ts
tests/unit/workspace/errors.test.ts
```

实现内容：

- 定义 `WORKSPACE_ERROR_CODES` 常量与对应 union type，精确包含 Spec 第 14 节的 17 个错误码。
- 定义 `WorkspaceEntryKind`、`ExpectedWorkspaceEntryKind`。
- 定义有 unique-symbol brand 的只读 `WorkspaceHandle`，公共可枚举字段仅 `rootPath`。
- 定义 `ExistingWorkspacePath`、`WritableWorkspacePath`、existing/writable options。
- 定义 `WorkspaceLayerError`，其 `.error` 必须通过 `ErrorInfoSchema`，cause 不可枚举。
- 定义内部使用的 `createWorkspaceError`，details 只接受 JSON object。
- 固定 public error details 允许字段：`field`、`reason`、`relativePath`、`expectedKind`、`actualKind`。
- 不把 Node `Stats`、dev/ino、原始输入、绝对外部路径或 fs adapter 放入公共类型。

不变量：

- `JSON.stringify(WorkspaceLayerError)` 不出现 cause、stack、dev/ino 或 Node errno path。
- 句柄的 TypeScript 类型不能由未断言的普通对象满足。
- 可写结果的身份快照不作为 public 字段。
- `WorkspaceLayerError` 与阶段 04 的 `ModelLayerError` 独立，不互相导入。

最小验证：

- 所有错误码唯一且稳定。
- error public payload 可序列化并通过 `ErrorInfoSchema`。
- cause 不可枚举。
- 公共对象类型中没有 `stats`、`snapshot`、`dev`、`ino`、`cause` 字段。

完成条件：类型模块只依赖领域层，不执行文件系统 I/O。

### T05-02：实现工具相对路径校验与规范化

覆盖：`NFR-002`、`SEC-001`、`COM-003`。

输入：T05-01，Spec 第 10 节。

涉及文件：

```text
lib/workspace/path-input.ts
tests/unit/workspace/path-input.test.ts
```

实现内容：

- 建立字符串运行时边界，不依赖调用方 TypeScript 类型。
- 使用阶段 03 `utf8ByteLength`，最大 4096 UTF-8 字节。
- 拒绝空串、NUL、C0/DEL 控制字符和任何反斜线。
- 拒绝 POSIX absolute、Windows drive、UNC/device 和 URL/tilde 式非相对工具路径。
- 在规范化前用 `/` 分段，任何完整 `..` 段都拒绝；不能先 normalize 再认为安全。
- 允许 `.`、`./src`、重复 `/` 和重复 `.` 段。
- 使用 `path.posix` 产生稳定规范结果；输出只能是 `.` 或安全正斜线路径。
- 不执行 decode、环境变量展开、home 展开、Unicode normalization 或本机大小写转换。
- 非法输入错误不回显原始值，只给有限 field/reason。
- 暴露一个内部纯函数把规范相对路径拆成段，供 boundary 使用；公共 barrel 只导出 normalize 函数。

最小验证：

- 表驱动覆盖合法 ASCII、空格、中文、`.`、`./` 和重复分隔符。
- 表驱动覆盖 `/x`、`../x`、`a/../x`、`C:/x`、`C:\x`、UNC、NUL、换行、反斜线和 4097 字节。
- 规范化结果不受 `process.cwd()` 影响。
- 4096/4097 中文或多字节边界按字节而不是 JS length 判断。
- 含假 Bearer/Key 的非法原始路径不出现在 ErrorInfo。

完成条件：模块是纯函数，不调用 fs、不读取 cwd、不接触 workspace handle。

### T05-03：实现工作区根 factory、私有 identity 和句柄复验

覆盖：`FR-001`、`NFR-002`、`NFR-003`、`SEC-001`、`SEC-008`。

输入：T05-01、T05-02，Spec 第 9、11、14 节。

涉及文件：

```text
lib/workspace/boundary.ts
tests/unit/workspace/helpers.ts
tests/unit/workspace/boundary.test.ts
tests/unit/workspace/errors.test.ts
```

实现内容：

- 定义模块私有 `WorkspaceIdentity`：canonical root、dev、ino。
- 用 `WeakMap<WorkspaceHandle, WorkspaceIdentity>` 保存身份；handle 冻结。
- `createWorkspaceHandle` 验证 string、4096 UTF-8 字节、控制字符和当前平台 absolute。
- 不 trim、不展开 `~` 或 `file://`，避免改变合法空格路径语义。
- 使用注入或默认 Node fs adapter 执行 `realpath`、`stat`、`lstat`；默认生产实例用 `node:fs/promises`。
- root realpath 必须为目录，且不等于 `path.parse(realPath).root`。
- handle.rootPath 固定为真实规范路径，不保留用户的 symlink alias。
- 每个 boundary 操作先验证 handle 存在于 WeakMap。
- `assertWorkspaceIdentity` 重新 realpath/stat，对比 root 字符串、dev、ino 和目录类型。
- 被删除、换成文件、换成链接或同路径新 inode 均映射 `WORKSPACE_CHANGED`。
- 建立静态 Node errno 映射，消息不拼接 `cause.message` 或 `cause.path`。
- 内部可注入 boundary factory 不从 `@/lib/workspace` barrel 导出，只供确定性 errno 测试。

最小验证：

- 真实临时目录成功，handle 冻结，rootPath 为 realpath。
- root symlink 输入固定到真实目录。
- 相对、`~`、`file://`、文件系统根、普通文件和不存在路径拒绝。
- 普通 `{rootPath}` 和跨 boundary handle 拒绝。
- root 删除后、删除并同名重建后旧 handle 失效。
- 模拟 EACCES/EPERM/ENAMETOOLONG/ELOOP/未知 errno 有稳定错误码且不泄露 cause.path。

完成条件：factory 与 identity 复验通过；尚不实现目标路径解析。

### T05-04：实现现存目标解析和真实路径包含检查

覆盖：`SEC-001`、`SEC-002`、`NFR-003`、`COM-003`。

输入：T05-02、T05-03，Spec 第 12 节。

涉及文件：

```text
lib/workspace/boundary.ts
tests/unit/workspace/helpers.ts
tests/unit/workspace/boundary.test.ts
tests/unit/workspace/errors.test.ts
```

实现内容：

- 实现只接受已经规范化工具相对路径的内部候选构造器。
- `.` 映射工作区根；其他路径按 `/` 分段后逐段用本机 `path.join` 组合。
- 在 realpath 之外再做词法 containment 防御；不能使用字符串前缀。
- 使用统一 `isPathInside(root, target)`：`path.relative` 结果为空或安全子路径，且不能 absolute、等于 `..` 或以 `..${sep}` 开头。
- 候选现存时先 lstat，再 realpath/stat。
- 父或最终 symlink 解析到外部时返回 `WORKSPACE_SYMLINK_ESCAPE`。
- 返回真实 absolutePath、规范逻辑 relativePath、目标 kind、最终项/父级是否发生 symlink 跟随的可解释布尔值。
- `followedSymbolicLink` 至少在最终项是 symlink 时为 true；如果实现检测父链接，定义为任意路径组件经过链接时 true，并在测试固定。
- `expectedKind` 默认为 `any`；file/directory 不匹配返回实际 kind 的有限 details。
- socket、FIFO、device 等统一为 other，不读取内容。
- dangling/loop symlink、not found、not directory 和权限错误结构化。

需要在实现前于 Task 范围内固定一个细节：`followedSymbolicLink` 定义为“候选逻辑绝对路径与真实路径不同，或最终 lstat 是 symlink”，因此父链接也会报告 true；这不改变任何安全决策。

最小验证：

- 根 `.`、普通文件、普通目录、空格/中文路径。
- file/directory/any 与错误 type。
- `/tmp/project` 与 `/tmp/project-copy` 前缀碰撞不误判。
- 内部文件 link、内部目录 link 允许且 absolutePath 指向真实内部目标。
- 外部最终 link、外部父 link、dangling link、循环 link 拒绝。
- 伪造 expectedKind 或额外 options 字段在运行时拒绝。

完成条件：任何返回的现存 absolutePath 均经过 root identity 和 target realpath containment 验证。

### T05-05：实现可写目标、私有快照与写前二次复验

覆盖：`SEC-001`、`SEC-002`、`SEC-007`、`NFR-003`。

输入：T05-03、T05-04，Spec 第 13、15 节。

涉及文件：

```text
lib/workspace/boundary.ts
tests/unit/workspace/helpers.ts
tests/unit/workspace/boundary.test.ts
tests/unit/workspace/errors.test.ts
```

实现内容：

- 用独立 `WeakMap<WritableWorkspacePath, WritableSnapshot>` 保存 workspace identity 引用、规范相对路径、真实 parent、parent dev/ino、目标存在性和存在目标 dev/ino/kind。
- 可写相对路径不得为 `.`。
- 父目录必须已存在，realpath 在 root 内，stat 为目录。
- absolutePath 必须由真实 parent + basename 构造，不能返回仍含父链接别名的候选。
- 叶子 ENOENT 产生 `existed: false`；EACCES/ENOTDIR 等不能伪装成不存在。
- 叶子存在时执行 lstat/realpath containment 和 kind 分类。
- `allowExisting` 默认为 true；false 时存在目标返回 `WORKSPACE_EXISTING_TARGET_DENIED`。
- 存在目标的最终 lstat 如果是 symlink，始终返回 `WORKSPACE_FINAL_SYMLINK_WRITE_DENIED`，不区分内部/外部链接。
- 普通 existing file 允许；existing directory/other 以 type mismatch 拒绝，保证首版 writable 只表示文件叶子。
- 返回结果冻结，私有 snapshot 不可枚举。
- revalidate 必须验证 previous 来自当前 boundary、同一 workspace 且未被篡改。
- revalidate 重新执行完整 writable resolve，再比较 parent realpath/dev/ino、目标 existed、dev/ino/kind。
- 不存在目标变为存在、存在目标消失/替换、parent 更换、出现 link 均返回 `WORKSPACE_PATH_CHANGED` 或更具体 escape/symlink 错误。
- 成功返回新的冻结 writable 结果和新私有 snapshot；previous 不被原地更新。
- revalidate 不计算文件内容哈希，不执行写入、mkdir、临时文件或 rename。

最小验证：

- 存在普通文件和不存在叶子成功。
- parent 不存在/不是目录、目标目录/other、allowExisting false。
- 最终内部/外部 symlink 均禁止修改。
- 内部 parent symlink 解析成真实 parent；外部 parent symlink 拒绝。
- target 在 resolve 后创建、删除、原子替换或换类型均被 revalidate 发现。
- parent 在 resolve 后重建或替换为外部 link 被发现。
- previous 伪造、篡改、跨 workspace、跨 boundary 拒绝。
- 成功 revalidate 返回新对象，absolutePath 和 relativePath 保持一致。

完成条件：阶段 06 可以在不访问私有 snapshot 的情况下只用公共 resolve/revalidate API 完成路径级写前保护。

### T05-06：建立唯一公共导出并审查后续接口

覆盖：`NFR-006`、`NFR-008`、`SEC-001`、`SEC-002`。

输入：T05-01 至 T05-05。

涉及文件：

```text
lib/workspace/index.ts
tests/unit/workspace/path-input.test.ts
tests/unit/workspace/boundary.test.ts
tests/unit/workspace/errors.test.ts
```

实现内容：

- 从 `@/lib/workspace` 导出：
  - `createWorkspaceHandle`
  - `normalizeWorkspaceRelativePath`
  - `resolveExistingWorkspacePath`
  - `resolveWritableWorkspacePath`
  - `revalidateWritableWorkspacePath`
  - approved public types、错误码、`WorkspaceLayerError`
- 不导出：
  - identity/snapshot WeakMap
  - `assertWorkspaceIdentity`
  - fs adapter 与测试 boundary factory
  - errno mapper
  - 原始 Node Stats/cause helper
- 不使用默认导出。
- 三个测试 suite 至少各有一处只从公共 barrel 导入，证明后续模块不需要内部路径。
- 人工演练阶段 06 调用顺序：read/list/search existing、write/replace writable+revalidate、process cwd existing directory。

最小验证：

- 公共 import 成功，导出名称与 Spec 完全一致。
- 普通对象无法在运行时作为 handle 或 writable previous 使用。
- `JSON.stringify` handle 只含 rootPath；writable 只含批准字段。
- 通过静态扫描确认公共 barrel 不含 private 名称。

完成条件：阶段 06 不需要复制 path containment 或直接导入 workspace 内部模块。

### T05-07：完成工作区安全单元测试矩阵

覆盖：Spec 第 18、19 节全部验收标准。

输入：T05-01 至 T05-06。

涉及文件：

```text
tests/unit/workspace/helpers.ts
tests/unit/workspace/path-input.test.ts
tests/unit/workspace/boundary.test.ts
tests/unit/workspace/errors.test.ts
```

实现内容：

- `helpers.ts` 只创建、记录和清理 `mkdtemp` 返回的明确临时目录。
- cleanup 前验证路径位于 `tmpdir()` 且带本测试固定前缀；不得对 cwd、workspace root、home 或未解析变量递归删除。
- 所有测试使用 `afterEach`/`afterAll` 回收自己的临时目录；失败时也执行。
- fixture 需要文件内容时只写短固定文本，不使用真实仓库。
- symlink 测试目标全部在同一测试临时根的 inside/outside sibling 中。
- Windows 若普通 symlink 因权限不可用：目录使用 junction；仍不可覆盖的文件链接语义用内部 fs adapter 固定，必须在测试名中说明平台替代，不能静默 skip 整类安全用例。
- errno 测试注入显式 `{ code, path, syscall }` 假错误，断言 path/syscall 不公开。
- 避免依赖真实 chmod 权限，因为 root/CI 行为可能不同。
- 每个错误断言稳定 code、recoverable 和有限 details，不依赖整段中文消息。
- 明确反向断言测试输出、ErrorInfo 和 JSON.stringify 不包含 outside 真实路径、假 Key、dev/ino 或 stack。

最小验证：

```text
pnpm exec vitest run tests/unit/workspace/path-input.test.ts
pnpm exec vitest run tests/unit/workspace/boundary.test.ts
pnpm exec vitest run tests/unit/workspace/errors.test.ts
pnpm exec vitest run tests/unit/workspace
```

完成条件：Spec 第 18 节每一个项目都能映射到具体 test name，不能只依赖覆盖率。

### T05-08：执行阶段整体验证与安全一致性审查

覆盖：`NFR-002`、`NFR-003`、`NFR-006`、`NFR-008`、`SEC-001`、`SEC-002`、`SEC-007`、`SEC-008`、`COM-002`、`COM-003`。

执行顺序：

1. `pnpm exec vitest run tests/unit/workspace`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm build`
6. `git diff --check`
7. 扫描 `lib/workspace` 不导入模型、Agent、React、Next.js、浏览器、子进程或存储。
8. 扫描 `package.json` 与 lockfile，确认没有阶段 05 依赖变更。
9. 审查所有 containment 判断使用 `path.relative`，不存在 root 字符串前缀安全判断。
10. 审查所有现存目标经过 realpath；所有 writable 经过真实 parent 和最终 lstat。
11. 审查 handle/writable snapshot WeakMap 不从 barrel 导出且不被 JSON 序列化。
12. 扫描生产错误、测试快照和文档，确认不存在真实用户路径、Key 或未经脱敏 outside path。
13. 确认临时测试目录全部回收，未触碰当前仓库与用户项目。
14. 确认没有创建 Task 之外的文件工具、风险、存储、Agent、终端、API 或 UI 模块。

失败处理：

- 记录首次失败命令、实际错误、根因、修正和最小/完整复验。
- 只修复已批准范围内的工作区实现或测试夹具。
- 不通过禁用 symlink 测试、捕获所有异常为 not found、放宽 `..` 或改用字符串前缀制造通过。
- 若跨平台行为要求改变正斜线路径协议、symlink 政策、root identity、父目录规则或公共 API，立即停止并修订 Spec。
- 若只需拆出内部 adapter 文件、调整测试文件位置或局部任务顺序，停止并修订 Task。

完成条件：全部命令退出码 0，人工审查结论写入 Summary。

### T05-09：生成阶段 Summary

输入：T05-01 至 T05-08 的实现和真实验证记录。

涉及文件：

```text
docs/development/05-workspace-security-summary.md
docs/development/05-workspace-security-tasks.md
docs/development/README.md
```

实现内容：

- 记录 Spec、Task 的批准状态和任何重新审批。
- 逐项记录 T05-01 至 T05-09 的完成状态、代码和测试证据。
- 详细说明路径语法、root identity、containment、symlink、writable snapshot 和错误映射。
- 列出实际新增、修改、删除文件。
- 如实记录所有失败、诊断、修正和重验。
- 记录精确工作区测试数、全量测试数及最终命令结果。
- 对照 Spec/Task 列出偏差；无偏差也明确说明。
- 记录 outside path、Key、dev/ino、stack、依赖和公共 barrel 安全检查。
- 反思 TOCTOU、跨平台和阶段 06 调用约束。
- 更新索引为“阶段 05 Summary 待用户审批”。

完成条件：Summary 内部门禁通过后立即停止，不开始阶段 06 观察。

## 6. 测试矩阵

| 类别 | 核心场景 | 预期 |
| --- | --- | --- |
| Path input | `.`, `./src//x`, 中文 | 输出稳定 POSIX 相对路径 |
| Path input | absolute、drive、UNC、反斜线、控制符、`..` | `WORKSPACE_PATH_INVALID/ESCAPE` |
| Path bytes | 4096/4097 UTF-8 | 精确接受/拒绝 |
| Root | 真实目录、root symlink | 绑定规范 realpath 与身份 |
| Root | relative、missing、file、filesystem root | 稳定拒绝 |
| Handle | 普通对象、跨 boundary | 无法伪造 |
| Identity | root 删除、重建、换 link | `WORKSPACE_CHANGED` |
| Existing | root/file/directory/中文 | 真实内部路径成功 |
| Kind | file/directory/any/other | 类型精确或 mismatch |
| Prefix | project 与 project-copy | sibling 不算子路径 |
| Symlink read | 内部 file/dir | 允许并标记 followed |
| Symlink escape | 外部 final/parent、dangling/loop | 结构化拒绝 |
| Writable | existing file、missing leaf | 真实 parent 下成功 |
| Writable | missing parent、directory、existing denied | 结构化拒绝 |
| Writable link | 内部/外部 final link | 全部禁止变更 |
| Revalidate | 未变化 | 返回新安全结果 |
| Revalidate | target create/delete/replace | path changed |
| Revalidate | parent/root replace | changed 或 escape |
| Errno | ENOENT/EACCES/EPERM/ENOTDIR/ELOOP/unknown | 稳定有限错误 |
| Leakage | outside path、Key、dev/ino、stack | 不进入 public JSON |
| Barrel | public/internal export | 只暴露批准 API |

## 7. 文件系统测试安全规则

### 7.1 临时根

- 固定前缀建议：`path.join(tmpdir(), "secode-workspace-test-")`。
- `mkdtemp` 的实际返回值立即登记到当前 test context。
- 所有 inside/outside 目录都必须是该临时根的子目录；“outside”只表示目标 workspace 之外，不是真实系统目录。
- 清理只能对登记过且通过前缀/父目录复验的实际路径执行。

### 7.2 禁止目标

- 不以 `/Users/starkirby/Codes/secode`、cwd、home、`/tmp` 本身或 filesystem root 为 recursive cleanup 目标。
- 不使用未验证 glob、`$HOME`、`~` 或空环境变量构造清理路径。
- 不读取真实 `.env.local`、Git objects、用户源码或系统配置文件。

### 7.3 可恢复性

- 测试产生的目录只包含固定小文件、目录和 symlink，可在 suite 后整体删除。
- 失败中断留下的目录位于操作系统 temp 且有固定前缀，不影响仓库；Summary 需记录是否发现残留。
- 生产开发不执行任何删除功能；递归删除只存在于测试 cleanup。

## 8. 失败处理与回退策略

### 8.1 失败分类

- 实现 bug：保持 Spec/Task，修复并重跑最小测试。
- 测试夹具 bug：证明 fixture 与 Node 文件系统语义不符后修正，不降低安全断言。
- 平台差异：优先用 adapter/junction 等等价覆盖；需要改变公共行为时重新审批 Spec。
- 文件范围缺口：停止并修订 Task，不能直接新增内部文件。
- 阶段 03 类型不足：停止，不直接修改领域层；先申请跨阶段修订。
- 强沙箱需求：超出首版范围，记录限制，不以复杂 shell 或不可靠权限技巧伪实现。

### 8.2 回退

- 本阶段不修改持久数据、用户项目或数据库。
- `lib/workspace` 是新增隔离目录，可按明确文件恢复，不使用 `git reset --hard` 或 `git checkout --`。
- 测试临时目录按登记路径清理；不执行广泛递归删除。
- 不覆盖阶段 00–04 的既有未提交内容。

## 9. 明确不执行的工作

- 不实现文件内容读取、目录遍历、rg、文件创建/覆盖或进程 spawn。
- 不计算 SHA-256，不实现 expected hash 或 atomic rename。
- 不创建目录，不删除、移动或 chmod 用户文件。
- 不执行真实项目安全演练；只使用隔离 temp fixture。
- 不实现命令风险分类或审批。
- 不保存最近工作区、Session 或 JSONL。
- 不创建 Agent 工具定义或把路径结果送入模型。
- 不创建终端命令、Route Handler、Server Action、Client Component 或 UI。
- 不修改模型、领域事件、依赖、构建或测试配置。
- 不声称该边界能阻止恶意本机进程、获批命令或操作系统级攻击。

## 10. Task 审批清单

- [x] 任务完全来源于已批准 Spec。
- [x] 公共接口、错误码、路径语法和 symlink 策略未发生变化。
- [x] 文件范围、禁止范围和重新审批条件明确。
- [x] 任务按类型→纯路径→root→existing→writable→barrel→测试顺序排列。
- [x] 每项任务有输入、输出、涉及文件、最小验证和完成条件。
- [x] 临时文件系统测试的创建、清理和平台差异规则明确。
- [x] root identity、真实路径、前缀碰撞、symlink 和 TOCTOU 都有直接测试。
- [x] 未提前创建 workspace 代码、测试、Summary 或后续阶段模块。
- [x] 未增加依赖、触碰真实项目或修改未经批准配置。

**Task 内部门禁：通过。当前状态：已批准。**

## 11. 用户审批区

请确认任务拆分、允许文件范围、测试临时目录规则和 T05-05 写前复验细节。批准后才会按 T05-01 至 T05-09 实施并生成 Summary；阶段 06 仍不会开始。

## 12. 用户审批记录

- 审批结果：阶段 05 Task 已获用户批准。
- 解锁动作：允许严格按 T05-01 至 T05-09 开发、验证并生成 Summary。
- 后续门禁：阶段 05 Summary 获批前不得开始阶段 06 观察。
