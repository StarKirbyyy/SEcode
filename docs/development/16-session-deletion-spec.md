# 阶段 16 Spec：Session 对话删除与安全清理

## 1. 文档状态与审批门禁

- 当前状态：已批准。
- 需求来源：用户于 2026-08-28 提出“加入删除工作区对话的功能”。
- 前置门禁：阶段 15 Summary 已由用户于 2026-08-28 明确批准，阶段 15 正式完成。
- Spec 审批：用户于 2026-08-28 明确回复“批准”。
- 本阶段已完成：只读观察、差距分析和本 Spec。
- 当前允许：仅根据本 Spec 生成并审阅 `16-session-deletion-tasks.md`。
- 当前禁止：修改业务代码、修改测试或执行删除验证。
- 下一门禁：用户明确批准阶段 16 Task 后，才允许实际开发。

## 2. 术语与需求解释

本 Spec 将“工作区对话”解释为绑定某个工作区的 **SEcode Session 会话记录**，不是工作区目录本身。

删除一个 Session 时：

- 删除 `.secode-data/sessions/<session-id>/`（或 `SECODE_DATA_DIR` 下等价位置）中的会话元数据和 JSONL 事件历史。
- 不读取、修改或删除 `session.workspacePath` 指向的项目目录及其中任何文件。
- 不删除模型配置、其他 Session 或独立的工作区数据。
- 最近工作区列表继续由剩余 Session 推导；某工作区最后一个 Session 删除后，它可从“最近工作区”消失，但本机项目目录仍然存在，并可重新选择。

该操作是不可撤销的本地会话记录删除。首版不提供回收站或恢复功能，因此 UI 必须二次确认并明确说明删除边界。

## 3. 阶段目标

在不改变 Agent、工具、模型调用和工作区文件安全边界的前提下，为 Session 增加完整的删除链路：

1. 事件存储能够安全删除一个确定 UUID 对应的 Session 目录。
2. 服务端阻止删除正在启动、运行、等待审批、执行工具或正在结束的 Session。
3. Next.js Route Handler 暴露经过本地请求与同源检查的删除接口。
4. Client API、共享 App Shell 和侧栏提供明确、可访问、可恢复失败的删除交互。
5. 删除当前 Session 后回到新任务主页；删除其他 Session 时保留当前页面。
6. 刷新页面或重启服务后，被删除 Session 不再恢复。

## 4. 新增需求与追踪 ID

本阶段提出以下需求增量；本 Spec 获批后，它们成为阶段 16 的实现依据，并在 Task 中同步回需求追踪表：

| ID | 需求 | 验证方式 |
| --- | --- | --- |
| FR-011 | 用户可从会话导航删除指定 Session，并在确认后看到列表立即更新 | Client 单元测试与 Playwright |
| NFR-009 | 删除链路具有有限状态、结构化错误和确定的刷新/导航行为 | Server、Client 与 E2E 测试 |
| SEC-009 | 删除只作用于事件存储中经 UUID 校验和真实路径验证的 Session 目录，绝不作用于绑定工作区 | 存储安全与 symlink 测试 |

继续覆盖既有 `FR-005`、`FR-007`、`FR-008`、`NFR-001`、`NFR-002`、`NFR-003`、`NFR-007`、`NFR-008`、`SEC-006` 与 `SEC-008`。

## 5. 只读观察范围与方法

### 5.1 已观察文档

- `docs/development/00-process.md`
- `docs/development/01-requirements.md`
- `docs/development/13-nextjs-route-handlers-spec.md`
- `docs/development/15-workbench-home-workspace-ux-spec.md`
- `docs/development/15-workbench-home-workspace-ux-tasks.md`
- `docs/development/15-workbench-home-workspace-ux-summary.md`

### 5.2 已观察实现

- 存储：`lib/storage/event-store.ts`、`types.ts`、`dependencies.ts`、`file-safety.ts`、`config.ts`、`mutex.ts`。
- Server：`lib/server/application.ts`、`types.ts`、`errors.ts`、`schemas.ts`、`http.ts`。
- Route：`app/api/sessions/route.ts`、Session events/runs 动态路由。
- Client：`lib/client/api-client.ts`、`schemas.ts`、`types.ts`。
- UI：`app/ui/shell/session-navigation.tsx`、`app-shell-provider.tsx`、Session Workbench。
- 测试：存储 Session 单元测试、Server Session Route 集成测试、Session 导航 E2E。

### 5.3 观察方法

- 使用 `rg` 和只读输出检查接口、锁、路径验证、活动运行注册和 UI 状态流。
- 检查 `git status --short`，确认工作树已有阶段 13–15 变更，本阶段不得覆盖或回退这些用户工作。
- 本次没有执行写数据、安装依赖、测试或构建命令。

## 6. 观察事实

### 6.1 存储层

1. `JsonlEventStore` 当前只有 initialize/create/list/get/append/read/inspect，没有删除接口。
2. Session 使用规范 UUID 作为 `sessionsRoot` 下的直接子目录名；创建时通过临时目录、rename 和父目录 sync 提交。
3. `validateSessionDirectory` 已拒绝 symlink、非目录、逃逸和不存在路径，可作为删除前身份验证基础。
4. `EventStoreDependencies.fs` 已包含 `rename`、`rm`、`lstat`、`realpath` 和 `open`，无需新增运行时依赖。
5. `KeyedFifoExecutor` 已支持 `session:<id>` 串行队列；append/read/inspect 使用会话锁，但 list/create 使用 root 锁。
6. 未知目录名前缀会被 `listSessions()` 忽略；创建残留使用 `.creating-` 前缀，目前没有删除残留约定。

### 6.2 Server 与并发

1. `createServerApplication` 用 `activeByRun` 和 `activeBySession` 保存本进程活动 handle。
2. handle 仅在 `runtime.startRun()` 成功返回后登记；因此 startRun 的异步准备阶段尚无占位，若直接增加 delete 检查会产生“启动与删除”竞态窗口。
3. completion settle 后才清理活动映射，因此已登记运行的最终事件写入期间仍可被视为 active。
4. `readEvents()` 可能触发 interrupted Session 恢复；删除期间也需要有限拒绝，避免恢复追加与目录 rename 竞争。
5. 当前错误映射已有 404 `SESSION_NOT_FOUND` 和 409 `AGENT_SESSION_BUSY`，但没有删除专用的成功响应或 busy 错误。

### 6.3 HTTP 与 Client

1. `/api/sessions` 目前只实现 GET/POST；没有 `app/api/sessions/[id]/route.ts`。
2. 动态路由已使用 Next.js 16 的异步 `params` 约定。
3. `handleApiRequest(request, true, ...)` 已提供本地 Host 与 mutation Origin 检查；DELETE 应复用该边界。
4. `ApiClient`、Zod Client Schema 和 Provider 都没有 deleteSession 状态或方法。

### 6.4 UI

1. Sidebar 已按工作区分组 Session，每个 Session 当前是一整行 Link，没有独立操作菜单。
2. 运行期间 `requestNavigation()` 会阻止切换，但它不是服务端删除授权，不能单独保证删除安全。
3. App Shell 持有 Session 列表、当前 history、活动 Session/Run 和 router，适合统一协调删除后的列表刷新、历史清理和导航。
4. 当前没有通用确认 Dialog；删除入口不能嵌套在 Link 内，需要把导航链接与操作按钮做成同级可访问控件。

## 7. 范围内

- 删除单个 Session 的存储接口、服务端 facade、Route Handler 和 Client API。
- 删除会话的竞态保护、路径验证、结构化错误和提交不确定性处理。
- Sidebar 单会话删除入口。
- 二次确认弹窗、删除中状态、失败提示和键盘/屏幕阅读器语义。
- 删除后 Session/最近工作区刷新，以及当前页导航规则。
- 存储、Server、Client 和 E2E 自动化测试。
- 对需求索引、公共接口说明和阶段文档的同步更新。

## 8. 范围外

- 删除工作区项目目录或其中任何文件。
- 批量删除、清空全部、按工作区删除全部会话。
- Session 归档、重命名、搜索、固定、回收站、撤销或恢复。
- 云同步、多用户权限、登录鉴权和跨进程分布式锁。
- 修改 Agent 事件协议以记录 `session.deleted`；会话目录删除后没有可承载该事件的日志。
- 在浏览器中直接操作 `.secode-data`。
- 自动取消正在运行的任务后继续删除；用户必须显式停止并等待终态。

## 9. 公共接口设计

### 9.1 Event Store

为 `JsonlEventStore` 增加：

```ts
deleteSession(sessionId: SessionId): Promise<DeletedStoredSession>;

interface DeletedStoredSession {
  readonly sessionId: SessionId;
  readonly status: "deleted";
}
```

语义：

- UUID 非法或目录不存在统一为 `SESSION_NOT_FOUND`，不泄漏任意存储路径。
- 返回成功前，目标 Session 已从可列举的正式 Session 名称中消失。
- 不接受 workspacePath，不根据会话元数据拼接项目路径。

### 9.2 Server Application

为 `ServerApplication` 增加：

```ts
deleteSession(sessionId: SessionId): Promise<DeletedSessionResponse>;
```

活动/启动/恢复/删除互斥由 Server Application 统一协调；Route 和 UI 不复制判定规则。

### 9.3 HTTP

新增：

```text
DELETE /api/sessions/[id]
```

成功响应：HTTP 200。

```json
{
  "sessionId": "<uuid>",
  "status": "deleted"
}
```

错误约定：

| 场景 | HTTP | code | recoverable |
| --- | ---: | --- | --- |
| 动态参数不是 UUID | 400 | `API_REQUEST_INVALID` | true |
| Session 不存在或已删除 | 404 | `SESSION_NOT_FOUND` | true |
| Session 正在启动、运行、审批、执行工具、恢复或收口 | 409 | `API_SESSION_BUSY` | true |
| symlink/path identity 冲突 | 500 | 既有 Event Store 安全错误 | false |
| rename/sync 后提交结果不确定 | 500 | `EVENT_COMMIT_UNCERTAIN` | false |
| 非本机 Host 或非同源 mutation | 403 | 既有 API 安全错误 | false |

DELETE 不接收请求体；Route 必须声明 Node.js Runtime，并异步读取 `params`。

### 9.4 Client API

增加：

```ts
deleteSession(sessionId: string, signal?: AbortSignal): Promise<DeletedSessionResponse>;
```

响应必须经过 Zod 严格校验；非 JSON、错误 UUID、额外字段或未知状态均转换为有限 Client 错误。

## 10. 删除提交与文件安全设计

### 10.1 安全目标

删除只能命中：

```text
<real sessionsRoot>/<validated UUID>
```

禁止使用 title、workspacePath、URL 原始片段、glob、shell 或环境变量字符串作为删除目标。删除前必须复用 `validateSessionDirectory()`，验证目标为 sessionsRoot 的真实直接子目录且不是 symlink。

### 10.2 两阶段文件提交

在 `session:<id>` 队列内执行：

1. 解析并规范化 UUID。
2. 验证正式 Session 目录身份。
3. 生成受控 tombstone 名：`.deleting-<session-id>-<uuid-nonce>`。
4. 在同一个 `sessionsRoot` 内原子 rename 正式目录到 tombstone。
5. sync `sessionsRoot`，此时 Session 在逻辑上已删除且不会再被 list/recovery 发现。
6. 对精确 tombstone 路径执行递归 `rm`。
7. 再次 sync `sessionsRoot`。

任何情况下都不得对 sessionsRoot、dataRoot、workspacePath、空字符串或未验证路径调用递归删除。

### 10.3 异常与残留

- rename 前失败：正式 Session 保持可见，返回结构化错误。
- rename 后失败：返回 `EVENT_COMMIT_UNCERTAIN`；UI 必须重新加载 Session 列表，不声称数据仍可恢复。
- `.deleting-*` 残留永不作为 Session 返回；初始化时只清理格式严格匹配本应用 tombstone 规则的残留。
- 残留清理失败不得让路径扩大；错误与日志不能包含事件内容、工作区文件或秘密。

## 11. 运行与删除竞态模型

Server Application 增加每 Session 的瞬时操作占位，至少覆盖 `starting`、`recovering`、`running` 和 `deleting`：

```text
空闲 ── reserve start ── starting ── running ── completion settled ── 空闲
空闲 ── reserve delete ── deleting ── delete settled ── 不存在
```

规则：

1. startRun 必须在第一个异步 await 前同步占用 Session；删除看到占位即返回 409。
2. deleteSession 必须在第一个异步 await 前同步占用 Session；新的 start/read-recovery 看到 deleting 即有限拒绝。
3. 已进入运行的 Session 不允许删除；用户需要先停止并等待 terminal event 与 completion settle。
4. 删除失败后必须释放 deleting 占位，使用户能够刷新或重试。
5. 成功删除后不得保留 stale active map、pending approval 或 client history。
6. Server 是最终授权边界；UI 隐藏或禁用按钮只是体验优化。

本阶段不引入分布式锁；设计继续限定为一个持久本地 Node.js 进程和一个可信本地用户。

## 12. UI 与交互规格

### 12.1 入口

- 每条 Session 行拆为同级的导航 Link 和操作按钮，禁止 Button 嵌套 Link。
- 操作按钮 accessible name 为 `删除会话：<title>`，视觉可使用轻量垃圾桶或更多操作图标。
- 桌面端在 hover、focus-within 或当前选中行显示；键盘焦点必须始终可达。
- 触摸/窄屏端不得依赖 hover，应持续提供可点击入口。
- 运行中的 Session 显示运行状态，删除入口禁用并提供“请先停止任务”的说明。

### 12.2 确认弹窗

弹窗采用 `alertdialog` 语义，包含：

- 标题：`删除这个对话？`
- Session 标题。
- 折叠展示的工作区名称/路径。
- 明确说明：`只会删除 SEcode 的会话和执行记录，不会删除工作区中的项目文件。此操作无法撤销。`
- 次按钮：`取消`。
- 危险主按钮：`删除对话`。

打开时焦点进入弹窗；Tab 不逃逸；Escape 与取消按钮关闭；关闭后焦点返回触发按钮。确认期间按钮禁用并显示 `正在删除…`，避免重复提交。

### 12.3 成功与失败

- 删除当前 Session：从 Provider 清除对应 history 与列表，刷新最近工作区，使用 `router.replace("/")` 返回新任务主页，并通过 live region 宣告成功。
- 删除非当前 Session：保持当前 URL 和 transcript，仅更新侧栏与最近工作区，并宣告成功。
- 取消确认：不调用 API、不改变导航、列表、history 或 draft。
- 409 busy：保留 Session 和弹窗，提示先停止并等待任务结束。
- 404：视为服务端已不存在；协调刷新列表；若是当前页则回主页，同时显示有限通知。
- 其他失败：保留会话和当前页面，弹窗内展示结构化错误，可关闭后重试。
- 删除当前 Session 时未提交的 Composer draft 会随该 Session 一并清除；确认文案必须让用户先取消以复制草稿。

## 13. 状态所有权与数据流

```text
Sidebar 删除按钮
  → AppShellProvider 打开确认状态
  → 用户确认
  → ApiClient DELETE /api/sessions/[id]
  → Route Handler（Host/Origin/UUID）
  → Server Application（会话操作占位与 busy 判定）
  → JsonlEventStore（验证 → rename → sync → rm → sync）
  → Provider 删除本地投影并重新获取 sessions/recent
  → 当前 Session：replace 到 /
    非当前 Session：保持原路由
```

JSONL 仍是存在 Session 的历史事实来源；删除属于容器生命周期操作，不新增会话内 durable event，也不引入 localStorage 第二真相。

## 14. 可访问性与响应式要求

1. 删除入口必须有可读名称，不能只依赖图标或颜色。
2. 弹窗具有 `aria-labelledby`、`aria-describedby` 和错误 live region。
3. 初始焦点优先放在取消按钮，避免 Enter 意外确认破坏性操作。
4. 删除按钮使用危险色同时保留文字，不以颜色单独表达风险。
5. reduced-motion 下禁用弹窗位移动画，不影响焦点与状态。
6. 264px Sidebar、72px rail 和移动抽屉三种布局均能触发、取消和完成删除。
7. 确认弹窗在窄屏内不溢出，不产生页面滚动锁死。

## 15. 测试规格

### 15.1 Storage 单元测试

- 成功删除后 metadata/events 均不可读取，listSessions 不再返回目标。
- 删除一个 Session 不影响同工作区或不同工作区的其他 Session。
- 非 UUID、不存在 Session、symlink、非目录和逃逸身份被拒绝。
- 只对精确 tombstone 调用 recursive rm；测试依赖断言从不命中 workspace、sessionsRoot 或 dataRoot。
- append/read/inspect 与 delete 同 Session 串行，不产生半条 JSONL 或越界删除。
- rename、首次 sync、rm、最终 sync 各失败点返回真实结构化结果。
- 初始化安全清理严格匹配的 `.deleting-*` 残留，忽略其他未知目录。

### 15.2 Server 与 Route 集成测试

- DELETE 成功返回严格响应，刷新列表/events 得到预期 404。
- 非法 ID 400、不存在 404、运行/启动/恢复/收口 409。
- start/delete 双向竞态中最多一个操作获得 Session 所有权。
- 非同源 Origin 与非本机 Host 返回 403 且存储未变化。
- 删除不调用 workspace factory，不读取或修改 fixture workspace 文件。
- 错误响应不包含 dataRoot、绝对事件存储路径、API Key 或事件正文。

### 15.3 Client 单元测试

- DELETE URL 使用 encodeURIComponent，method 为 DELETE，无请求体。
- 成功与错误响应严格校验。
- 当前/非当前 Session 删除后的纯状态转换可独立测试。
- 双击确认只产生一个请求；Abort 和网络错误有有限状态。

### 15.4 Playwright E2E

- 从 Sidebar 打开确认并取消，Session 仍存在。
- 删除非当前 Session，当前页面和 transcript 不变化。
- 删除当前 Session，回到 `/`，侧栏移除记录。
- 刷新后被删 Session 不恢复，直接访问旧 URL 显示不存在或协调回主页。
- 活动 Session 不能删除；停止并等待终态后可以删除。
- 手机视口可以完成同一流程；键盘可打开、取消和确认。
- 断言工作区 marker 文件在删除前后内容和 hash 不变。

### 15.5 阶段整体验证

Task 阶段应按批准范围列出精确命令，整体验收至少包含：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
git diff --check
```

## 16. 可测试验收标准

| ID | 验收标准 |
| --- | --- |
| AC16-01 | 每条 Session 具有独立、可访问的删除入口，且不嵌套交互元素 |
| AC16-02 | 删除前必须出现含 Session 身份、不可撤销提示和“不删除项目文件”声明的确认弹窗 |
| AC16-03 | 取消确认不发送 DELETE 且不改变任何 Session/UI 状态 |
| AC16-04 | DELETE 只接受规范 UUID，复用本地 Host、同源 mutation 和 Node Runtime 边界 |
| AC16-05 | 删除只命中事件存储的目标 Session 目录，工作区 marker/hash 保持不变 |
| AC16-06 | start/recover/run/completion 与 delete 不竞态；busy 返回可恢复 409 |
| AC16-07 | 存储使用受控 tombstone rename、目录 sync 和精确 rm，不直接递归删除未验证路径 |
| AC16-08 | 当前 Session 删除后回主页并清理 history；非当前 Session 删除后保持当前上下文 |
| AC16-09 | 删除后 sessions 与 recent workspaces 投影一致，刷新/重启不会恢复被删 Session |
| AC16-10 | 404、409、提交不确定和网络失败均有有限中文错误，不制造成功假象 |
| AC16-11 | 桌面、rail、移动抽屉与键盘交互均可完成删除；焦点管理符合 alertdialog 规则 |
| AC16-12 | 核心 Agent、工具、审批、模型、事件类型与工作区读写边界不发生语义变化 |
| AC16-13 | lint、typecheck、单元/集成/E2E、build 与 diff check 全部通过 |

## 17. 风险与应对

| 风险 | 影响 | 规格应对 |
| --- | --- | --- |
| 把“删除工作区对话”误做成删除工作区 | 严重项目数据损失 | API 只接收 Session UUID；存储从不接收 workspacePath；E2E 校验 marker/hash |
| startRun 尚未登记就被删除 | 运行写入已消失目录 | 第一个 await 前同步 reservation，双向 busy 测试 |
| rename 后清理失败 | Session 已不可见但磁盘残留 | `EVENT_COMMIT_UNCERTAIN`、刷新协调、严格 tombstone 启动清理 |
| Link 内嵌按钮 | 点击误导航、键盘语义错误 | sibling Link/button 结构与可访问性测试 |
| UI 乐观移除但服务端失败 | 历史真相与界面不一致 | 默认等待成功响应后移除；404 单独协调；其他错误保留 Session |
| 删除当前会话丢失 draft | 用户输入损失 | 确认文案说明；取消保留；确认后明确清除 |
| E2E 删除真实用户会话 | 不可恢复数据损失 | 全部测试使用独立临时 `SECODE_DATA_DIR` 和 fixture workspace |

## 18. 兼容性与迁移

- 不改变现有 `session.json`、`events.jsonl`、Agent event 或 seq 格式，存储版本保持 1。
- 既有 Session 无需迁移即可删除。
- `.deleting-*` 是存储内部实现，不通过 API/UI 暴露。
- 不新增生产依赖；使用 Node 文件系统能力和现有 Zod/React/Playwright/Vitest 基线。
- Next.js 动态 Route Handler 按本仓库 16.3.3 本地文档约定实现；编码前 Task 必须要求重新核对相关本地文档。

## 19. 假设与待用户确认

本 Spec 采用以下明确选择：

1. “删除对话”只删除单个 Session 及事件历史，不删除工作区。
2. 删除不可撤销；首版没有回收站或 Undo。
3. 运行中的 Session 不自动 cancel-and-delete，而是要求用户先停止并等待终态。
4. 删除入口位于 Sidebar 每条 Session 的独立操作按钮中。
5. 当前 Session 删除后回新任务主页；删除其他 Session 保持当前页面。
6. 文档、视频与最终提交顺延为阶段 17。

批准本 Spec 即表示确认以上六项选择。若其中任一项需要调整，请在批准前提出，本阶段只修订 Spec，不生成 Task。

## 20. Spec 门禁检查

- [x] 阶段 15 Summary 已获得明确用户批准。
- [x] 已完成只读观察且未修改业务代码。
- [x] 已区分 Session 数据与工作区项目数据。
- [x] 已定义公共接口、删除提交、竞态、错误和 UI 行为。
- [x] 已定义安全、可访问性、测试与验收标准。
- [x] 已明确范围外和不可撤销风险。
- [x] 用户已于 2026-08-28 批准本 Spec。
- [x] 已根据批准的 Spec 生成阶段 16 Task。
- [ ] 开始实现（Task 批准前禁止）。

**当前结论：阶段 16 Spec 已批准，Task 文档已解锁；业务实现仍须等待 Task 批准。**
