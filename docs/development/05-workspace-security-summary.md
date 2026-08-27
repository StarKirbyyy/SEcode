# 阶段 05 Summary：工作区安全层

## 1. 文档状态与审批链

- 当前状态：已批准。
- 依据 Spec：[05-workspace-security-spec.md](./05-workspace-security-spec.md)，已获用户批准。
- 依据 Task：[05-workspace-security-tasks.md](./05-workspace-security-tasks.md)，已获用户批准。
- 当前子阶段：开发、测试、整体验证与反思已完成。
- 后续门禁：本 Summary 获批前不得开始阶段 06 的只读观察，不得生成阶段 06 Spec。

审批过程：

1. 用户批准阶段 04 Summary，阶段 04 正式完成，只解锁阶段 05 观察与 Spec。
2. 用户批准阶段 05 Spec，确认 root realpath/身份绑定、正斜线路径协议、内部读取 symlink、最终 symlink 禁止写、父目录预存在、写前复验和应用级安全边界。
3. 用户批准阶段 05 Task，解锁 T05-01 至 T05-09 的代码、临时目录测试、验证和 Summary。
4. 开发严格限制在 Task 允许文件内，没有触发需要修改公共接口、安全策略、依赖或文件范围的重新审批条件。

## 2. 阶段结果

本阶段建立了一个纯 Node.js 工作区安全层。它把用户选择的绝对目录固定为带真实目录身份的内存句柄，并为后续六个工具提供统一的现存路径、可写路径和写前复验入口。

最终结果：

- 4 个工作区生产模块完成。
- 4 个工作区测试文件完成，其中 3 个测试 suite、1 个临时目录辅助模块。
- 17 个稳定工作区错误码完成。
- 工作区精确测试 62 个全部通过。
- 仓库 13 个测试文件、190 个测试全部通过。
- lint、TypeScript、Next.js 16.3.3 生产构建和差异格式检查全部通过。
- 临时测试目录全部回收，无残留。
- 没有增加依赖，没有读取或修改真实用户项目。
- 没有提前实现文件工具、进程、风险审批、存储、Agent、终端、API 或 UI。

## 3. 任务完成清单

| 任务 | 状态 | 实现证据 | 验证证据 |
| --- | --- | --- | --- |
| T05-01 类型与错误边界 | 完成 | `lib/workspace/types.ts` | `errors.test.ts`、typecheck |
| T05-02 相对路径规范化 | 完成 | `lib/workspace/path-input.ts` | `path-input.test.ts` 27 项 |
| T05-03 root 与身份复验 | 完成 | `lib/workspace/boundary.ts` | root/handle 测试 |
| T05-04 现存路径与 symlink | 完成 | `lib/workspace/boundary.ts` | existing/symlink 测试 |
| T05-05 writable 与二次复验 | 完成 | `lib/workspace/boundary.ts` | writable/revalidate 测试 |
| T05-06 唯一公共入口 | 完成 | `lib/workspace/index.ts` | public barrel 完整流程测试 |
| T05-07 安全测试矩阵 | 完成 | `tests/unit/workspace/**` | 3 个 suite、62 项通过 |
| T05-08 整体验证与审查 | 完成 | 本文第 7、8 节 | 全部门禁退出码 0 |
| T05-09 Summary | 完成 | 本文档、开发索引 | 内部门禁通过，等待用户审批 |

## 4. 详细开发过程

### 4.1 本地 Next.js 规则复核

编码前按仓库 `AGENTS.md` 阅读当前安装版本的 Next.js 16.3.3 本地文档：项目结构、TypeScript 和 Vitest 指南。阶段 05 模块放在 `app` 之外的 `lib/workspace`，不会成为路由；测试继续使用既有 Node Vitest 配置。没有修改 Next.js 或测试配置，也没有把 Node 文件系统模块引入 Client Component。

### 4.2 类型、错误和私有状态

`types.ts` 定义：

- 17 个稳定 `WORKSPACE_*` 错误码。
- file/directory/other 三种条目类型和 file/directory/any 期望类型。
- 带 unique-symbol brand 的 `WorkspaceHandle`。
- existing/writable 结果和运行时 options。
- `WorkspaceLayerError` 与内部 `createWorkspaceError`。

`WorkspaceLayerError.error` 始终通过阶段 03 `ErrorInfoSchema`。cause 使用不可枚举属性保留在进程内，JSON 不包含 Node stack、errno path 或 syscall。

工作区错误 details 还要通过独立 strict Schema，只允许：

- field
- reason
- relativePath
- expectedKind
- actualKind

尝试加入 `absolutePath` 等字段会在构造错误时被拒绝，避免未来实现无意扩大日志数据面。

### 4.3 可移植相对路径协议

`normalizeWorkspaceRelativePath` 是独立纯函数：

- 使用 UTF-8 字节限制 4096，而不是 JavaScript 字符数。
- 根目录显式表示为 `.`。
- `./src//nested/./file.ts` 规范为 `src/nested/file.ts`。
- 保留空格、中文和普通文件名，不 trim、不改大小写、不做 Unicode normalization。
- 拒绝空串、控制字符、反斜线、POSIX absolute、Windows drive、UNC/device、URL/home expansion 和所有完整 `..` 段。
- 不读取 cwd、不执行 URL decode、环境变量或 shell 展开。

候选绝对路径不是通过 `path.resolve(root, rawInput)` 生成，而是把已校验的 POSIX 段逐个交给本机 `path.join`。这样模型工具协议始终使用 `/`，本机路径语义只存在于可信边界内部。

### 4.4 工作区 root factory

`createWorkspaceHandle` 的固定流程：

1. 校验绝对输入、UTF-8 长度和控制字符。
2. 使用 `realpath` 固定真实目录。
3. 使用 `stat` 确认目录。
4. 拒绝文件系统根目录。
5. 捕获真实 rootPath、dev 和 ino。
6. 返回只公开 rootPath 的冻结句柄。

真实身份保存在 boundary 实例私有 `WeakMap`。普通 `{rootPath}`、其他 boundary 产生的 handle 或反序列化对象都无法使用。Session 恢复必须重新调用 factory。

用户输入可以是指向项目目录的 root symlink，但句柄保存的是当时目标 realpath。后续删除原目录并同名重建，或把原路径换成外部 symlink，都会触发 `WORKSPACE_CHANGED`。

### 4.5 真实路径包含判断

所有 containment 使用统一 `path.relative` 判断：

- target 等于 root 时允许。
- relative 不能是绝对路径。
- relative 不能等于 `..` 或以 `..${path.sep}` 开头。

生产代码没有使用 `target.startsWith(root)` 作为安全判断，因此 `/project-copy` 不会被误判为 `/project` 子路径。

现存目标解析顺序是：

1. 规范相对路径。
2. 复验工作区 root identity。
3. 构造词法候选并做防御性 containment。
4. `lstat` 观察最终目录项。
5. `realpath`/`stat` 观察跟随链接后的真实目标与类型。
6. 再对真实目标做 containment。
7. 按 expectedKind 校验并返回冻结结果。

返回的 `absolutePath` 是真实服务端目标，`relativePath` 是规范逻辑路径。`followedSymbolicLink` 在最终项为链接，或逻辑候选和真实路径不同时为 true，因此父目录链接也能被观察到。

### 4.6 symlink 策略

读取型解析允许：

- 内部文件 symlink。
- 内部目录 symlink 及其子文件。

读取型解析拒绝：

- 指向 sibling `project-copy` 的最终链接。
- 父目录链接逃逸。
- dangling link。
- symlink loop。

错误只公开逻辑相对路径，不公开 outside 真实目标。

变更型解析更保守：最终项只要是 symlink 就返回 `WORKSPACE_FINAL_SYMLINK_WRITE_DENIED`，无论它指向内部还是外部。这避免普通 write 会修改链接目标，而原子 replace 会替换链接本身的语义分裂。

### 4.7 可写目标解析

可写 resolver 只表示“普通文件或尚不存在的文件叶子”：

- `.` 不能作为目标。
- 父目录必须已存在且是工作区内真实目录。
- 最终 absolutePath 由 parent realpath 与 basename 重新构造。
- ENOENT 叶子产生 `existed: false`；其他 errno 不伪装成缺失。
- existing directory、socket 等 other 类型拒绝。
- `allowExisting: false` 可要求纯创建语义。
- 返回对象冻结并只包含 relativePath、absolutePath、parentPath、existed 和可选 kind。

父目录是内部 symlink 时会规范到内部真实 parent；外部 parent symlink 直接拒绝。本阶段不自动创建缺失父目录。

### 4.8 写前二次复验

每个 writable 结果在另一个私有 WeakMap 中关联：

- workspace handle 引用。
- 规范相对/绝对/parent 路径。
- parent dev/ino。
- 目标是否存在。
- existing target dev/ino/kind。

`revalidateWritableWorkspacePath` 拒绝伪造、跨 workspace 和跨 boundary previous。它重新执行完整 writable 解析，再比较快照：

- 未变化时返回新的冻结结果，不原地更新旧对象。
- 缺失目标被创建时返回 path changed。
- existing 目标被删除、原子替换或换类型时返回 path changed。
- parent 同路径重建时通过 dev/ino 发现变化。
- parent 换为外部链接时返回 symlink escape。
- root 变化时返回 workspace changed。

阶段 06 必须在审批等待之后重新 resolve/revalidate，并与内容 SHA-256 一起使用。路径身份检查不能替代内容哈希，内容哈希也不能替代路径身份。

### 4.9 文件系统错误映射

Node errno 使用静态上下文映射：

- ENOENT → root/path/parent not found。
- ENOTDIR → root not directory、parent not found 或 path not found。
- EACCES/EPERM → access denied。
- ENAMETOOLONG/ELOOP → input/path invalid。
- 未知 I/O → workspace I/O error。
- root 运行期无法再解析 → workspace changed。

错误消息不拼接原始 `cause.message`、path 或 syscall。测试通过注入 adapter 模拟权限与异常 errno，避免 chmod 在 root/CI 环境中的不确定性。

### 4.10 唯一公共入口

`@/lib/workspace` 只导出：

- 五个批准的 factory/normalize/resolve/revalidate 函数。
- 路径大小常量。
- 工作区公共类型、错误码和 `WorkspaceLayerError`。

它不导出：

- root identity 和 writable snapshot。
- 两个 WeakMap。
- fs adapter、测试 boundary factory。
- errno mapper、`createWorkspaceError` 或 Node Stats。

公共 barrel 测试真实执行 create handle → resolve existing → resolve writable → revalidate 完整流程，证明默认 boundary 的私有状态在所有入口间正确共享。

## 5. 测试临时目录安全

所有真实文件系统测试使用：

```text
tmpdir()/secode-workspace-test-<随机后缀>/
  project/
  project-copy/
```

其中 `project-copy` 只是同一 fixture 内的“工作区外部”目录，不是用户目录或系统目录。

cleanup 规则：

- 只清理由 helper `mkdtemp` 返回并登记的路径。
- 清理前再次验证 parent 等于当前 `tmpdir()`。
- basename 必须带固定 `secode-workspace-test-` 前缀。
- 不接受 cwd、home、filesystem root、`/tmp` 本身、glob 或环境变量作为删除目标。
- afterEach/afterAll 都有兜底清理。

最终扫描当前系统 temp，没有发现该固定前缀的残留目录。

## 6. 文件变更

### 6.1 新增

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

### 6.2 修改

```text
docs/development/05-workspace-security-tasks.md
docs/development/README.md
```

### 6.3 生命周期文档更新

在实际开发开始前，阶段切换和审批记录还更新了：

```text
docs/development/04-model-protocol-summary.md
docs/development/05-workspace-security-spec.md
```

这些是用户批准后的状态固化，不是阶段 05 业务实现范围扩张。

### 6.4 删除

无。

阶段 00–04 的其他既有未提交内容均被保留，没有覆盖或回退。

## 7. 失败、诊断与修正记录

### 7.1 `./` 保留尾斜线

- 首次失败命令：`pnpm exec vitest run tests/unit/workspace/path-input.test.ts tests/unit/workspace/errors.test.ts`。
- 结果：29 个测试中 1 个失败；`./` 实际规范结果是 `./`，预期为 `.`。
- 根因：Node `path.posix.normalize("./")` 会保留表示目录的尾斜线。
- 修正：normalize 后移除尾斜线；空结果统一回落为 `.`。
- 复验：路径与错误测试 29/29 通过。

### 7.2 可选错误字段与 JsonObject 索引冲突

- 首次失败命令：路径测试修正后的 `pnpm typecheck`。
- 错误：`WorkspaceErrorDetails extends JsonObject` 时，可选字段类型含 `undefined`，不满足 JSON index signature。
- 根因：TypeScript interface 继承会把可选属性的 undefined 纳入索引兼容检查。
- 修正：改成 `JsonObject & { optional approved fields }` 交叉类型，并在运行时增加 strict Zod details Schema。
- 复验：typecheck、lint 和测试通过；未批准 details 字段测试会被拒绝。

### 7.3 未使用的测试导入

- 首次失败命令：首次完整工作区测试后的 `pnpm lint`。
- 结果：无 error，1 个 warning；`cleanupWorkspaceFixture` 被导入但未直接使用。
- 根因：测试最终统一由 `cleanupAllWorkspaceFixtures` 兜底，单项 helper 导入遗留。
- 修正：删除未使用导入，没有改变清理行为。
- 复验：lint 无 error 或 warning。

### 7.4 人工一致性补强

初次 59 个工作区测试通过后继续对照 Spec/Task，新增：

- root 被外部 symlink 替换后的句柄失效用例。
- 假 Bearer 形状相对路径在公开错误中的脱敏用例。
- writable parent 是普通文件的拒绝用例。
- 公共 barrel 的完整 default-boundary 流程和 snapshot 不可见用例。

最终工作区测试增加到 62 个。没有通过放宽 `..`、允许最终 symlink、删除平台边界用例或捕获所有异常为 not found 制造通过。

## 8. 最终验证记录

| 命令 | 最终结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/workspace/path-input.test.ts` | 1 个文件、27 个测试通过 |
| `pnpm exec vitest run tests/unit/workspace/boundary.test.ts` | 1 个文件、25 个测试通过 |
| `pnpm exec vitest run tests/unit/workspace/errors.test.ts` | 1 个文件、10 个测试通过 |
| `pnpm exec vitest run tests/unit/workspace` | 3 个文件、62 个测试通过 |
| `pnpm lint` | 通过，无 ESLint error 或 warning |
| `pnpm typecheck` | 通过，无 TypeScript 错误 |
| `pnpm test` | 13 个文件、190 个测试全部通过 |
| `pnpm build` | Next.js 16.3.3 Turbopack 构建成功；`/` 与 `/_not-found` 静态生成成功 |
| `git diff --check` | 通过，无空白错误 |
| 依赖扫描 | 生产模块只依赖 Node 标准库、Zod 和 `@/lib/domain` |
| 禁止依赖扫描 | 未导入 model、Agent、React、Next.js、浏览器、子进程或存储 |
| 依赖/配置差异 | package、lockfile、TS/Vitest/Next 配置无阶段 05 差异 |
| containment 审查 | 只使用 `path.relative` 安全判断；无 root 字符串前缀判断 |
| public barrel 审查 | identity、snapshot、WeakMap、adapter、errno helper 均未导出 |
| temp 残留扫描 | 无 `secode-workspace-test-*` 目录残留 |

没有执行 Playwright 产品流程：阶段 05 没有 Route Handler 或 UI。没有对真实用户项目执行安全演练。

## 9. Spec、Task 与需求对照

### 9.1 需求覆盖

| 需求 | 实现证据 | 验证证据 |
| --- | --- | --- |
| FR-001 工作区绑定核心 | root factory/handle | 绝对目录、symlink root、错误测试 |
| NFR-002 运行时校验 | path/options/details strict validation | 非字符串、extra options、边界测试 |
| NFR-003 结构化错误 | 17 codes、errno mapper | errors suite 10 项及各边界失败 |
| NFR-006 Node 解耦 | `lib/workspace` | Node Vitest、依赖扫描 |
| NFR-008 文档证据 | Spec/Task/Summary | 本文完整记录 |
| SEC-001 工作区限制 | portable path + containment | absolute/`..`/prefix/writable 测试 |
| SEC-002 symlink 逃逸 | lstat + realpath containment | internal/external/dangling/loop 测试 |
| SEC-007 写前保护前置 | writable private snapshot | create/delete/replace/parent 测试 |
| SEC-008 应用级边界 | TOCTOU 与限制声明 | 本文第 10 节 |
| COM-002/003 自研本机边界 | Node fs/path 自研实现 | 依赖和代码审查 |

### 9.2 最终偏差

无未批准偏差：

- 公共函数、错误码、路径语法、symlink 读写策略和 writable 规则均与批准 Spec/Task 一致。
- fs adapter 和测试 boundary factory 保留在批准的 `boundary.ts`，没有额外拆文件。
- `followedSymbolicLink` 按 Task 锁定为最终 lstat 是 link 或逻辑候选与 realpath 不同，因此覆盖父链接。
- 没有修改领域、模型、app、依赖或配置。
- 没有提前实现阶段 06 及之后业务。

## 10. 安全检查与已知限制

安全检查结果：

- 所有工具输入路径先通过统一 portable grammar。
- 现存目标始终经过 root identity、lstat、realpath 和 containment。
- writable 始终经过真实 parent、最终 lstat 和私有 snapshot。
- `WORKSPACE_PATH_ESCAPE`、`WORKSPACE_SYMLINK_ESCAPE` 和最终 symlink 禁止不能通过后续审批绕过。
- public errors 不含外部绝对路径、Node cause path、stack、dev/ino 或假 Key。
- public barrel 不提供内部绕过入口。
- 测试清理只针对登记的 temp fixture。

已知限制：

- Node 标准 fs/path API不能完全消除最后一次复验和最终 syscall 之间的恶意本机 TOCTOU 竞态。
- dev/ino 在特殊网络文件系统上可能不稳定；变化时会保守地使句柄或快照失效。
- 正斜线路径协议不支持 POSIX 中罕见的反斜线文件名。
- 最终 symlink 不可写，使用 symlink 管理实际源码的仓库需要修改真实目标路径，而不能通过别名写入。
- writable 不自动创建缺失父目录。
- 用户仍可明确选择 home 等宽范围非根目录；阶段 13/14 应提供清晰提示。
- public resolved object 含服务端 absolutePath；调用方必须遵守契约，只把 relativePath 投影给模型和事件。
- 工作区边界不能约束阶段 07 中用户批准的任意进程在工作区外产生副作用，因此产品仍只面向可信本地用户。

## 11. 反思与后续阶段影响

### 11.1 本阶段反思

1. 路径规范化 API 的输出细节不能凭直觉推断；即使 `normalize` 也可能保留目录尾斜线，必须用直接边界测试固定协议。
2. 词法安全与真实文件系统安全是两层问题。拒绝 `..` 不能替代 realpath containment，realpath 也不能替代不可信输入语法约束。
3. 读取和写入的 symlink 语义不能完全相同。读取内部链接是常见需求，变更最终链接则会在 write/rename 之间产生不一致行为。
4. 路径快照和内容哈希解决不同的陈旧状态。阶段 06 如果只实现其中一个，仍可能覆盖错误对象或陈旧内容。
5. 运行时伪造不仅来自外部 JSON，也可能来自错误的内部恢复代码；WeakMap 让持久化对象必须重新经过 factory。
6. 权限测试不应依赖 chmod 在当前用户/CI 下必然失败；最小 fs adapter 提供了稳定 errno 证据，同时真实 symlink/identity 行为仍用实际 temp 文件系统验证。
7. 安全测试 cleanup 自身也是破坏性代码，需要比普通 fixture 更严格地验证目标，而不能只依赖一个看似安全的字符串前缀。

### 11.2 对阶段 06 本地工具的硬约束

阶段 06 必须只从 `@/lib/workspace` 导入并遵循：

- `list_directory`、`read_file`、`search_text` 使用 existing resolver。
- `write_file`、`replace_in_file` 使用 writable resolver，并在实际变更前 revalidate。
- 审批等待、长计算或模型调用之后不能使用旧 writable 结果。
- 覆盖 existing 文件还必须比较阶段 06 的读取时 SHA-256。
- 临时文件必须放在 revalidate 后的真实 parentPath 内，并在同目录原子 rename。
- `run_process.cwd` 必须解析为 existing directory。
- 工具请求、结果和 AgentEvent 只公开 relativePath，不公开 absolutePath 或 snapshot。
- 未知程序审批不能绕过 workspace path escape；工作目录越界永远直接拒绝。

阶段 06 仍必须从只读观察和独立 Spec 开始；本 Summary 获批只解锁观察，不自动批准其 Task 或开发。

## 12. Summary 内部门禁

- [x] Spec 与 Task 均有明确用户批准记录。
- [x] T05-01 至 T05-09 均有实现和验证证据。
- [x] 首次失败、根因、修正和复验均如实记录。
- [x] 工作区测试、全量测试、lint、typecheck、build 和 diff check 全部通过。
- [x] 根身份、真实路径、symlink、writable snapshot 和写前复验均有直接测试。
- [x] outside path、Key、dev/ino、stack 和私有 helper 未进入公共输出。
- [x] 测试只使用登记的系统临时目录，最终无残留。
- [x] 未新增依赖、触碰真实项目或实现后续阶段。
- [x] 开发索引已更新为“阶段 05 Summary 待用户审批”。

**Summary 内部门禁：通过。当前状态：已批准。**

## 13. 用户审批区

请重点审阅：

1. root realpath + dev/ino 身份绑定是否满足工作区切换预期。
2. 正斜线协议、任意 `..` 拒绝和 filesystem root 禁止是否合适。
3. 内部 symlink 可读、所有最终 symlink 禁止写是否合适。
4. writable 父目录预存在、私有 snapshot 和二次复验是否足以作为阶段 06 前置。
5. 是否批准阶段 05 Summary，从而只解锁阶段 06 的只读观察与 Spec。

审批记录：

- 2026-08-27：用户明确回复“批准”，阶段 05 Summary 获批。
- 解锁范围：阶段 05 正式完成；只解锁阶段 06 的只读观察与 `06-local-tools-spec.md`，不解锁阶段 06 Task 或开发。
