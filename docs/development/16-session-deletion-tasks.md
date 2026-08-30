# 阶段 16 Task 修订 1：Session 对话删除与安全清理

## 1. 文档状态与审批链

- 当前状态：修订 1 已批准；实施与 Summary 审批均完成。
- 上游 Spec：[`16-session-deletion-spec.md`](./16-session-deletion-spec.md)。
- Spec 审批：用户于 2026-08-28 明确回复“批准”。
- Task 审批：用户于 2026-08-28 明确回复“批准”。
- 修订原因：T16-03 后首次全仓 typecheck 发现，`JsonlEventStore` 新增必需的 `deleteSession()` 后，既有 Agent runtime cancellation 测试中的完整 Store fake 必须同步补齐该方法；该测试文件未列入原批准白名单。
- 修订范围：只把 `tests/unit/agent/runtime-cancellation.test.ts` 加入允许修改文件，并要求只能为 fake 增加无副作用的 `deleteSession` 实现；不改变 Spec、公共接口、任务顺序或生产代码范围。
- 修订 1 审批：用户于 2026-08-28 明确回复“批准”。
- 本 Task 依据：已批准 Spec 的 `FR-011`、`NFR-009`、`SEC-009`、`AC16-01`～`AC16-13`。
- 当前允许：只审阅阶段 Summary；实施已经结束。
- 当前禁止：越过修订后白名单、改变 Spec 或删除真实用户数据。
- 下一门禁：生成 Summary 后等待用户审批。

### 1.1 修订记录

| 版本 | 状态 | 变化 |
| --- | --- | --- |
| 原版 | 已批准 | 用户批准 T16-00～T16-13、原文件白名单与验证计划 |
| 修订 1 | 已批准 | 增补一个因 Store 公共接口扩展而必然受影响的 Agent 测试 fake 文件；其余内容不变 |

## 2. 批准规格的不可变约束

实现阶段不得临时改变以下已批准决策：

1. 删除目标是单个 SEcode Session 及其事件历史，不是工作区目录。
2. 首版永久删除，不提供回收站、Undo、恢复、批量删除或按工作区清空。
3. 运行、启动、恢复、审批、工具执行或收口中的 Session 不自动取消后删除，而是返回可恢复 409。
4. Store API 和 HTTP API 只接收 Session UUID，不接收 workspacePath、title 或任意删除路径。
5. 存储使用已验证目录、同根 tombstone rename、目录 sync 和精确 rm。
6. 当前 Session 删除成功后回 `/`；非当前 Session 删除成功后保留当前路由与 transcript。
7. UI 必须二次确认并明确说明“不删除工作区项目文件、无法撤销”。
8. 不改变 Agent 事件协议、JSONL 行格式、storageVersion、工具、模型和审批语义。
9. 不新增生产依赖，不改 `package.json` 或 `pnpm-lock.yaml`。
10. 文档、视频与最终提交继续作为阶段 17，阶段 16 不提前生成提交材料。

若实现中发现必须改变上述任一项，立即停止，回到 Spec 修订并重新审批；不得通过 Task 或 Summary 回写掩盖变化。

## 3. 实施前基线与证据记录

正式开发获批后，`T16-00` 首先记录：

```text
git status --short
git diff --check
sha256 package.json
sha256 pnpm-lock.yaml
pnpm test -- tests/unit/storage/session.test.ts tests/unit/server/application.test.ts tests/integration/server/session-routes.test.ts tests/unit/client/api-client.test.ts
```

macOS 可使用 `shasum -a 256`，其他平台使用可用的 SHA-256 工具。只记录 hash，不打印环境变量或任何凭据。

同时重新阅读：

- `docs/development/00-process.md`
- 已批准的阶段 16 Spec 与本 Task
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`

本 Task 编写时已核对本地 Next.js 16.3.3 文档：Route Handler 支持原生 DELETE；动态 `params` 是 Promise；文件系统访问必须使用 Node Runtime；非 GET mutation 不缓存。

## 4. 任务依赖图

```text
T16-00 基线与边界确认
  ├── T16-01 需求追踪与公共契约骨架
  │     ├── T16-02 Storage 删除失败测试
  │     │     └── T16-03 Storage 安全删除实现
  │     └── T16-04 Server 竞态失败测试
  │           └── T16-05 Server reservation 与删除实现
  │                 └── T16-06 DELETE Route Handler
  └── T16-07 Client 契约与纯状态测试
        └── T16-08 Provider 删除协调
              └── T16-09 Sidebar 与确认 Dialog

T16-03 + T16-06 + T16-09
  → T16-10 集成与 E2E
  → T16-11 安全/可访问性/响应式复核
  → T16-12 全量回归与反思修正
  → T16-13 Summary
```

每项开始前必须重新对照其输入、允许文件和完成条件。失败时只修复当前任务范围，随后重跑该任务全部验证。

## 5. 任务清单

### T16-00：基线、工作树归属与 Next.js 规范确认

**输入**

- 已批准的阶段 16 Spec。
- 当前包含阶段 13–15 用户变更的 dirty worktree。
- 第 3 节所列 Next.js 16.3.3 本地文档。

**操作**

1. 执行第 3 节只读命令并记录结果。
2. 把既有修改与阶段 16 新修改分开记录，不清理、不 stash、不覆盖用户变更。
3. 记录 package/lock 初始 hash，后续门禁要求不变。
4. 确认 `app/api/sessions/[id]/route.ts` 不与 page 路由冲突，且 params 必须 await。
5. 确认 E2E 使用临时 `SECODE_DATA_DIR`，绝不删除用户真实 `.secode-data`。

**输出**

- Task 末尾实施记录中的基线条目。

**完成条件**

- 基线测试通过，或真实既有失败被记录并在继续前报告。
- 工作树与 hash 已记录。

**覆盖**：`NFR-001`、`NFR-008`、`AC16-13`。

---

### T16-01：需求追踪与公共类型骨架

**输入**

- Spec 第 4、9、16 节。

**操作**

1. 在 `docs/development/01-requirements.md` 中加入 `FR-011`、`NFR-009`、`SEC-009`，内容不得扩大 Spec。
2. 在 Storage types 中定义 `DeletedStoredSession` 和 `JsonlEventStore.deleteSession()`。
3. 在 Server types 中定义严格的 `DeletedSessionResponse` 和 `ServerApplication.deleteSession()`。
4. 在 Client schema/types 中定义严格响应，不接受额外字段。
5. 更新各层 public index 导出，使公共契约测试可以锁定表面。

**允许文件**

- `docs/development/01-requirements.md`
- `lib/storage/types.ts`
- `lib/storage/index.ts`
- `lib/server/types.ts`
- `lib/server/index.ts`
- `lib/client/schemas.ts`
- `lib/client/types.ts`
- `lib/client/index.ts`
- 对应 public-api/schema 测试。

**最小验证**

```text
pnpm test -- tests/unit/storage/public-api.test.ts tests/unit/server/public-api.test.ts tests/unit/client/public-api.test.ts tests/unit/client/schemas.test.ts
pnpm typecheck
```

**完成条件**

- 类型与响应字面量和 Spec 一致：`{ sessionId, status: "deleted" }`。
- 没有向 Client 导出内部路径、workspacePath 或 tombstone 名。

**覆盖**：`FR-011`、`NFR-002`、`NFR-009`、`AC16-04`、`AC16-12`。

---

### T16-02：Storage 删除失败测试与安全夹具

**输入**

- Spec 第 10 节和第 15.1 节。
- 既有 `createInitializedTestStore()`、可注入 `EventStoreDependencies` 和临时目录夹具。

**操作**

先写失败测试，不实现删除：

1. 正常删除与同/异工作区其他 Session 不受影响。
2. 非 UUID和不存在目录统一 `SESSION_NOT_FOUND`。
3. Session 路径为 symlink、普通文件或身份逃逸时拒绝。
4. 记录所有 `rename`/`rm` 参数，断言 recursive rm 只能命中严格 tombstone 直接子目录。
5. 对 rename、第一次 sync、rm、第二次 sync 分别注入失败并锁定结构化错误。
6. 并发 append/read/inspect/delete 使用受控 Promise gate，证明同 Session 串行。
7. 初始化清理合法 `.deleting-<session-id>-<nonce>`；拒绝扩大到相似前缀、嵌套路径、symlink 或其他未知目录。
8. marker 文件放在 fixture workspace 中，删除前后读取并比较内容/hash。

**允许文件**

- 新增 `tests/unit/storage/deletion.test.ts`。
- 必要时只扩展 `tests/unit/storage/helpers.ts` 的通用注入夹具。
- 若初始化残留测试归类更清晰，可最小修改 `tests/unit/storage/config.test.ts`。

**最小验证**

```text
pnpm test -- tests/unit/storage/deletion.test.ts
```

**完成条件**

- 新用例因删除接口尚未实现而真实失败。
- 测试从不触碰仓库 `.secode-data` 或真实工作区。

**覆盖**：`SEC-009`、`AC16-05`、`AC16-07`、`AC16-09`。

---

### T16-03：Storage 两阶段安全删除与 tombstone 清理

**输入**

- T16-01 公共接口。
- T16-02 失败测试。

**操作**

1. `deleteSession()` 首先 parse UUID，再在 `session:<id>` FIFO 队列内执行。
2. 复用 `validateSessionDirectory()` 验证正式 Session 目录。
3. 使用 injected UUID 生成严格 tombstone basename，不接受外部路径。
4. rename 后 sync sessionsRoot，再精确递归删除 tombstone，最后再次 sync。
5. rename 前失败保持 Session 可见；rename 后失败映射 `EVENT_COMMIT_UNCERTAIN`。
6. 初始化在 root lock 内清理严格匹配且验证为 sessionsRoot 真实直接子目录的 tombstone。
7. tombstone 清理失败映射既有结构化存储错误并停止，不删除相邻条目。
8. 返回冻结的 `{ sessionId, status: "deleted" }`。

**允许文件**

- `lib/storage/event-store.ts`
- `lib/storage/types.ts`
- `lib/storage/file-safety.ts`（仅当需要提取精确直接子目录验证 helper）
- `lib/storage/config.ts`（仅当初始化职责必须放在配置阶段）
- `lib/storage/index.ts`
- T16-02 测试文件。

**禁止**

- `rm(sessionsRoot, { recursive: true })` 或任何 dataRoot/workspacePath 删除。
- shell、glob、字符串前缀宽泛匹配。
- 修改 JSONL、metadata schema 或 storageVersion。

**最小验证**

```text
pnpm test -- tests/unit/storage/deletion.test.ts tests/unit/storage/session.test.ts tests/unit/storage/append.test.ts tests/unit/storage/read.test.ts tests/unit/storage/recovery.test.ts tests/unit/storage/security.test.ts
pnpm typecheck
```

**完成条件**

- T16-02 全部转绿。
- 既有存储行为无回归。
- workspace marker/hash 不变。

**覆盖**：`SEC-009`、`NFR-003`、`AC16-05`、`AC16-07`、`AC16-09`、`AC16-12`。

---

### T16-04：Server 操作占位与竞态失败测试

**输入**

- Spec 第 11 节。
- 既有 `activeByRun`、`activeBySession` 与可控 completion Promise。

**操作**

先增加失败测试：

1. `startRun()` 在第一个异步步骤完成前占用 Session，delete 返回 `API_SESSION_BUSY`。
2. delete 先占用后，startRun 和需要 recovery 的 readEvents 返回 busy，不调用 runtime/store 副作用。
3. 已登记 running、awaiting approval、tool execution 与 completion 未 settle 均不能删除。
4. completion settle 后可以删除。
5. start/delete/recover 失败均释放瞬时占位，允许后续合法操作。
6. 两个并发 delete 最多一个进入 Store；另一个返回 busy 或在前者完成后得到 404，不允许双重 rm。
7. busy 错误只含 sessionId 与有限 operation，不含 workspacePath、prompt 或事件正文。

**允许文件**

- `tests/unit/server/application.test.ts`
- 必要时扩展其中局部 fake dependency，不新建生产状态。

**最小验证**

```text
pnpm test -- tests/unit/server/application.test.ts
```

**完成条件**

- 新竞态断言先因缺少 reservation/delete 实现而失败。
- Promise gate 是确定性同步，不使用任意 sleep。

**覆盖**：`NFR-009`、`AC16-06`、`AC16-10`。

---

### T16-05：Server reservation、删除协调与错误映射

**输入**

- T16-04 失败测试。
- Spec 的状态图与错误表。

**操作**

1. 增加每 Session 瞬时 operation reservation，至少表示 `starting`、`recovering`、`deleting`；running 继续由 handle registry 表示。
2. reservation 获取必须发生在相关方法第一个 await 前；释放放在严格 finally/handle completion 路径。
3. `deleteSession()` 检查瞬时 operation 和 active handle，busy 时抛 `API_SESSION_BUSY`（409、recoverable）。
4. 空闲时占用 deleting，调用 Store，成功/失败均清理进程内临时状态。
5. `startRun()` 和 `readEvents()` 调整为遵守 deleting/recovering/starting 互斥，但活动运行的普通历史读取仍保持现有能力。
6. 保持 cancel 与 approval 现有行为，不复制 Agent 内部状态机。

**允许文件**

- `lib/server/application.ts`
- `lib/server/types.ts`
- `lib/server/errors.ts`
- `lib/server/index.ts`
- `tests/unit/server/application.test.ts`
- `tests/unit/server/errors.test.ts`
- `tests/unit/server/security.test.ts`

**最小验证**

```text
pnpm test -- tests/unit/server/application.test.ts tests/unit/server/errors.test.ts tests/unit/server/security.test.ts
pnpm typecheck
```

**完成条件**

- 所有受控竞态测试稳定通过。
- `API_SESSION_BUSY` 映射 409；`SESSION_NOT_FOUND` 仍为 404。
- 运行完成清理和取消幂等性无回归。

**覆盖**：`FR-007`、`NFR-003`、`NFR-009`、`AC16-06`、`AC16-10`、`AC16-12`。

---

### T16-06：DELETE Route Handler 与 Server 集成测试

**输入**

- T16-05 Server Application。
- 已核对的 Next.js 16.3.3 Route Handler 规范。

**操作**

1. 新建 `app/api/sessions/[id]/route.ts`，声明 `runtime = "nodejs"`。
2. 实现原生 DELETE；用 `await context.params` 读取 id，并用 `RouteUuidSchema` 校验。
3. 复用 `handleApiRequest(request, true, ...)`，不读取请求体。
4. 调用 `application.deleteSession()`，成功返回严格 HTTP 200 JSON。
5. 扩展 Session Route 集成测试，覆盖成功、400、403、404、409、存储失败与秘密/路径不泄漏。
6. 使用真实临时 Event Store，并在删除前后校验 fixture workspace marker/hash。

**允许文件**

- 新增 `app/api/sessions/[id]/route.ts`
- `lib/server/types.ts`、`errors.ts`、`index.ts`（只补 T16-05 未完成的导出）
- `tests/integration/server/session-routes.test.ts`
- `tests/integration/server/helpers.ts`（仅新增安全 fixture helper）
- `tests/unit/server/public-api.test.ts`

**最小验证**

```text
pnpm test -- tests/integration/server/session-routes.test.ts tests/unit/server/public-api.test.ts tests/unit/server/http.test.ts
pnpm typecheck
```

**完成条件**

- DELETE 路由符合 Spec 状态码和响应。
- Host/Origin 防护在任何 Store 副作用前执行。
- Route 不直接 import Node fs、解析 JSONL 或判断 active map。

**覆盖**：`FR-011`、`NFR-001`、`NFR-002`、`NFR-003`、`SEC-006`、`SEC-009`、`AC16-04`～`AC16-06`、`AC16-10`。

---

### T16-07：Client API 契约与删除状态投影

**输入**

- Spec 第 9.4、12、13 节。
- T16-06 HTTP 契约。

**操作**

1. 为 ApiClient 增加 `deleteSession()`，使用 encodeURIComponent、DELETE、无 body。
2. 加入严格 `DeletedSessionResponseSchema` 与类型。
3. 新增纯模块 `lib/client/session-deletion.ts`，定义有限状态：closed/confirming/deleting/error，并实现 begin/cancel/request/succeed/fail 转换。
4. 纯函数区分当前与非当前 Session 删除后的列表/history/navigation effect，React Provider 只消费结果。
5. 测试 double-submit guard、404 reconciliation、409 保留确认、网络/Abort 有限错误。

**允许文件**

- `lib/client/api-client.ts`
- `lib/client/schemas.ts`
- `lib/client/types.ts`
- `lib/client/index.ts`
- 新增 `lib/client/session-deletion.ts`
- `tests/unit/client/api-client.test.ts`
- `tests/unit/client/schemas.test.ts`
- `tests/unit/client/public-api.test.ts`
- `tests/unit/client/security.test.ts`
- 新增 `tests/unit/client/session-deletion.test.ts`

**最小验证**

```text
pnpm test -- tests/unit/client/api-client.test.ts tests/unit/client/schemas.test.ts tests/unit/client/session-deletion.test.ts tests/unit/client/security.test.ts
pnpm typecheck
```

**完成条件**

- Client 不含内部 tombstone/dataRoot/workspace 删除能力。
- 纯状态测试无需 DOM、router 或真实网络。

**覆盖**：`FR-011`、`NFR-002`、`NFR-009`、`SEC-009`、`AC16-03`、`AC16-08`～`AC16-10`。

---

### T16-08：AppShellProvider 删除事务协调

**输入**

- T16-07 Client API 与纯状态机。

**操作**

1. Provider 暴露打开确认、取消、确认删除和有限删除状态。
2. 确认时使用 submission guard/AbortController 防止重复请求。
3. Server 成功后过滤 Session 投影并刷新 sessions/recent；不得先乐观永久移除。
4. 删除当前 Session 时清空匹配 history/draft，关闭关联抽屉并 `router.replace("/")`。
5. 删除非当前 Session 时不改变当前 history、draft 或 URL。
6. 404 按 Spec 协调列表；409 保留目标与错误；其他错误不移除 Session。
7. 删除状态不得写 localStorage，不形成第二套持久化真相。

**允许文件**

- `app/ui/shell/app-shell-provider.tsx`
- `app/ui/shell/app-shell.tsx`
- T16-07 Client 状态模块及测试（仅在真实集成暴露局部缺口时修订）。

**最小验证**

```text
pnpm test -- tests/unit/client/session-deletion.test.ts tests/unit/client/api-client.test.ts
pnpm typecheck
```

**完成条件**

- 当前/非当前/404/409/网络失败均有确定状态。
- 正在运行的 Session 即使 UI 被绕过仍由 Server 拒绝。

**覆盖**：`FR-011`、`NFR-009`、`AC16-06`、`AC16-08`～`AC16-10`。

---

### T16-09：Sidebar 删除入口、确认 Dialog 与样式

**输入**

- T16-08 Provider 方法与状态。
- 已批准 Claude Code Web 风格侧栏。

**操作**

1. Session 行重构为 sibling Link 与 Button，保持 active/running 标识和链接点击区域。
2. 增加 Trash/Delete icon；按钮名称为 `删除会话：<title>`。
3. 新增 `session-delete-dialog.tsx`，使用 portal、`alertdialog`、标题/描述关联、初始取消焦点、焦点循环、Escape、焦点恢复和 inert 背景。
4. 文案逐字包含“只会删除 SEcode 的会话和执行记录，不会删除工作区中的项目文件。此操作无法撤销。”
5. deleting 时禁用关闭/重复确认并显示“正在删除…”；错误用 alert/live region。
6. 处理移动导航与删除 Dialog 叠层，不得产生双重 inert、焦点丢失或 drawer scroll-lock 残留。
7. 桌面 hover/focus/current 可见；tablet rail 使用图标；移动端持续可触达。
8. reduced-motion 禁用位移动画，危险按钮同时具有文字和非颜色语义。

**允许文件**

- `app/ui/shell/session-navigation.tsx`
- `app/ui/shell/app-shell.tsx`
- 新增 `app/ui/shell/session-delete-dialog.tsx`
- `app/ui/workbench/icons.tsx`
- `app/globals.css`
- 如纯焦点 helper 确有必要，可新增一个 `app/ui/shell` 内部文件，不扩展业务状态。

**禁止**

- Button 嵌套 Link。
- `window.confirm()` 替代可测试 Dialog。
- 仅 hover 可见、无 accessible name、默认聚焦危险确认按钮。
- 重做阶段 15 整体布局或引入组件/图标库。

**最小验证**

```text
pnpm typecheck
pnpm lint
```

**完成条件**

- 三种布局均能触发删除。
- Dialog 焦点、Escape、取消、错误与进行中状态可观察。
- 页面不出现新的横向滚动或交互嵌套警告。

**覆盖**：`FR-011`、`NFR-007`、`NFR-009`、`AC16-01`～`AC16-03`、`AC16-08`、`AC16-10`、`AC16-11`。

---

### T16-10：集成与 Playwright 删除闭环

**输入**

- T16-03、T16-06、T16-09 完整链路。

**操作**

1. 新增 `tests/e2e/session-deletion.spec.ts`。
2. fixture 在临时 data root 创建至少两个 Session，并在 workspace 写入 marker。
3. 覆盖取消、删除非当前、删除当前、旧 URL/刷新、运行中阻止、终态后删除。
4. 覆盖键盘打开/Escape/确认与移动视口。
5. 删除前后在 Node fixture 侧校验 workspace marker 内容/hash 不变。
6. 若需要测试正在运行，使用现有 fake model 场景与确定性事件等待，不使用生产模型或任意 sleep。
7. 更新既有导航/响应式测试中因 sibling control 导致的准确 locator，不降低原断言。

**允许文件**

- 新增 `tests/e2e/session-deletion.spec.ts`
- `tests/e2e/fixtures.ts`
- `tests/e2e/support/start-environment.ts`（仅在需要安全的 data fixture 查询 helper 时）
- `tests/e2e/new-task-session-navigation.spec.ts`
- `tests/e2e/responsive-visual.spec.ts`
- `tests/integration/server/session-routes.test.ts`

**最小验证**

```text
pnpm test -- tests/integration/server/session-routes.test.ts
pnpm test:e2e -- tests/e2e/session-deletion.spec.ts tests/e2e/new-task-session-navigation.spec.ts tests/e2e/responsive-visual.spec.ts --workers=1
```

**完成条件**

- 所有删除场景通过且 marker/hash 不变。
- E2E data root 明确为临时目录。
- 无真实模型、真实用户 Session 或真实项目删除。

**覆盖**：`FR-011`、`FR-007`、`FR-008`、`NFR-007`、`SEC-009`、`AC16-01`～`AC16-11`。

---

### T16-11：安全、可访问性与响应式专项复核

**输入**

- 完成的 UI/API/Store 链路。

**操作**

1. 静态搜索所有新增 `rm` 调用，逐个确认目标来自验证后的 tombstone。
2. 搜索 Client bundle 可达代码，确认没有 `SECODE_DATA_DIR`、sessionsRoot、API Key、workspace 删除函数或 Node fs import。
3. 用测试和浏览器人工检查 Dialog role/name/description、焦点循环、Escape、焦点恢复、live error。
4. 检查桌面、tablet rail、390px 手机视口与 reduced-motion。
5. 检查删除成功/404/409/500 后 drawer、dialog、body scroll lock 和路由状态。
6. 确认工作区 marker/hash 与 package/lock hash 不变。

**预期命令**

```text
rg -n "\.rm\(|rm\(" lib app
rg -n "SECODE_DATA_DIR|DEEPSEEK_API_KEY|LONGCAT_API_KEY|node:fs|sessionsRoot" app/ui lib/client
pnpm test -- tests/unit/storage/deletion.test.ts tests/unit/server/security.test.ts tests/unit/client/security.test.ts
```

**完成条件**

- 每项专项检查有可引用证据。
- 发现任何宽泛删除、秘密暴露或焦点锁死必须回到对应任务修正并重跑。

**覆盖**：`SEC-006`、`SEC-009`、`NFR-007`、`AC16-05`、`AC16-07`、`AC16-10`～`AC16-12`。

---

### T16-12：全量回归、失败修正与边界审计

**输入**

- T16-01～T16-11 的完成产物。

**按顺序执行**

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e -- --workers=1
pnpm build
git diff --check
```

随后：

1. 比较 package/lock 最终 hash 与 T16-00 基线，必须完全相同。
2. 用 `git status --short` 和 `rg --files` 对照第 7 节白名单。
3. 区分本阶段改动与既有阶段 13–15 dirty worktree，不得声称清理或提交。
4. 测试失败必须记录“命令 → 症状 → 根因 → 修正 → 重跑结果”。
5. 不得降低覆盖阈值、跳过 E2E、增加 retry 掩盖不稳定或删除旧测试。
6. build 的既有 warning 与新增 warning 分开记录；新增阻断 warning 必须修正。

**完成条件**

- 全部命令 exit 0。
- 新功能和既有 Agent 完整闭环 E2E 均通过。
- 没有越界文件、依赖变化、真实数据删除或秘密输出。

**覆盖**：`AC16-12`、`AC16-13` 与阶段全部需求。

---

### T16-13：阶段 Summary 与停止门禁

**输入**

- 所有任务实施记录和真实验证输出。

**操作**

1. 新建 `docs/development/16-session-deletion-summary.md`。
2. 记录 Spec/Task 审批、每项实际开发、文件清单、验证、失败修正、偏差、安全检查、已知限制和反思。
3. 更新 `docs/development/README.md` 为“阶段 16 Summary 待用户审批”。
4. Summary 明确说明删除会话不可恢复、工作区未被删除、最终交付顺延阶段 17。
5. 生成后立即停止，不开始阶段 17 观察、README.txt、视频、提交、push 或部署。

**完成条件**

- Summary 内部门禁逐项有证据。
- 状态准确为待用户审批，不把内部通过写成用户批准。

**覆盖**：`NFR-008`、`AC16-13`。

## 6. 需求—任务—验收映射

| 需求/验收 | 实现任务 | 主要验证 |
| --- | --- | --- |
| FR-011 | T16-01、06～10 | Route/Client/E2E |
| NFR-009 | T16-01、04～10 | 状态与失败测试 |
| SEC-009 | T16-02、03、06、10、11 | 删除目标与 marker/hash |
| AC16-01～03 | T16-09、10 | Sidebar/Dialog E2E |
| AC16-04 | T16-01、06 | Route 集成测试 |
| AC16-05、07 | T16-02、03、06、11 | Storage 安全测试 |
| AC16-06 | T16-04、05、10 | 受控并发与运行中 E2E |
| AC16-08、09 | T16-07、08、10 | Client 状态与刷新 E2E |
| AC16-10 | T16-04～11 | 404/409/500/网络失败 |
| AC16-11 | T16-09～11 | 键盘/移动/reduced-motion |
| AC16-12 | T16-03、05、11、12 | 既有全回归与边界扫描 |
| AC16-13 | T16-12、13 | 全量命令与 Summary |

## 7. 预计文件白名单

### 7.1 新增

```text
app/api/sessions/[id]/route.ts
app/ui/shell/session-delete-dialog.tsx
lib/client/session-deletion.ts
tests/unit/storage/deletion.test.ts
tests/unit/client/session-deletion.test.ts
tests/e2e/session-deletion.spec.ts
docs/development/16-session-deletion-tasks.md
docs/development/16-session-deletion-summary.md
```

### 7.2 允许修改

```text
docs/development/00-process.md
docs/development/01-requirements.md
docs/development/README.md
docs/development/16-session-deletion-spec.md

lib/storage/event-store.ts
lib/storage/types.ts
lib/storage/index.ts
lib/storage/file-safety.ts                 # 仅精确路径验证 helper
lib/storage/config.ts                      # 仅 tombstone 初始化清理职责

lib/server/application.ts
lib/server/types.ts
lib/server/errors.ts
lib/server/index.ts

lib/client/api-client.ts
lib/client/schemas.ts
lib/client/types.ts
lib/client/index.ts

app/ui/shell/app-shell-provider.tsx
app/ui/shell/app-shell.tsx
app/ui/shell/session-navigation.tsx
app/ui/workbench/icons.tsx
app/globals.css

tests/unit/storage/helpers.ts
tests/unit/storage/config.test.ts
tests/unit/storage/session.test.ts          # 仅既有契约回归需要时
tests/unit/storage/public-api.test.ts
tests/unit/storage/security.test.ts
tests/unit/server/application.test.ts
tests/unit/server/errors.test.ts
tests/unit/server/public-api.test.ts
tests/unit/server/security.test.ts
tests/unit/client/api-client.test.ts
tests/unit/client/schemas.test.ts
tests/unit/client/public-api.test.ts
tests/unit/client/security.test.ts
tests/unit/agent/runtime-cancellation.test.ts  # 仅为 JsonlEventStore fake 补 deleteSession
tests/integration/server/helpers.ts
tests/integration/server/session-routes.test.ts
tests/e2e/fixtures.ts
tests/e2e/support/start-environment.ts       # 仅临时 fixture 查询 helper
tests/e2e/new-task-session-navigation.spec.ts
tests/e2e/responsive-visual.spec.ts
```

### 7.3 明确禁止修改

```text
package.json
pnpm-lock.yaml
next.config.ts
lib/domain/**
lib/agent/**
lib/model/**
lib/tools/**
lib/approval/**
lib/context/**
lib/workspace/**
cli/**
真实 .env* 或 API Key
工作区项目文件
```

若确需越过白名单或修改禁止项，停止实现并回到 Task 或 Spec 重新审批。

## 8. 测试纪律

1. 所有删除测试使用 `mkdtemp` 或 E2E runtime 自动创建的临时 data root。
2. 每个删除 fixture 必须包含 workspace marker，并在删除后验证内容/hash。
3. 竞态使用受控 Promise/deferred gate，不用任意时间 sleep 证明顺序。
4. 不连接 DeepSeek/LongCat，不消耗真实凭据。
5. 不打开 shell，不执行真实用户路径上的 recursive rm。
6. E2E 固定 `--workers=1` 复核破坏性状态，默认 retries 保持 0。
7. 失败时不能修改测试契约迎合实现；若 Spec 不可实现，回到 Spec 修订。
8. 覆盖率不得因新增分支明显下降；若未达到现有阈值，补真实边界测试而非 exclude。

## 9. 错误处理与回退策略

### 9.1 实现错误

- 只用 `apply_patch` 回退本阶段明确新增或修改的行。
- 禁止 `git reset --hard`、`git checkout --`、清理整个目录或覆盖 dirty worktree。
- 不删除用户已有阶段 13–15 文件以解决冲突。

### 9.2 删除提交不确定

- rename 后任何失败不得尝试把 tombstone 盲目 rename 回正式目录。
- 返回 `EVENT_COMMIT_UNCERTAIN`，重新 list 协调事实；残留由严格初始化清理处理。
- Summary 如实记录注入测试结果，不宣称可恢复。

### 9.3 UI/Route 失败

- 200 后刷新失败：保留“删除已提交，列表刷新失败”的有限状态并允许重新加载。
- 404：协调本地列表，不重复 delete。
- 409：保留会话与确认上下文，提示停止任务。
- 500/网络失败：不乐观移除，允许关闭后重试。

## 10. 明确不执行

- 不删除真实工作区、真实用户 Session 或仓库 `.secode-data`。
- 不做回收站、归档、重命名、搜索、固定、批量操作。
- 不修改会话事件协议或追加 `session.deleted`。
- 不新增 Toast/Modal/状态管理/图标依赖。
- 不重构阶段 15 整体布局或 Transcript。
- 不执行 Git commit、push、发布、部署或压缩包制作。
- 不编写阶段 17 Spec、README.txt 或视频脚本。

## 11. Task 审批检查

- [x] 已绑定已批准的阶段 16 Spec 与审批记录。
- [x] 已按依赖顺序拆分 Storage、Server、Route、Client、UI 与 E2E。
- [x] 每项包含输入、操作、文件、验证和完成条件。
- [x] 已锁定删除路径、竞态、错误、焦点和响应式行为。
- [x] 已列出精确文件白名单、禁止范围和回退策略。
- [x] 已明确全部测试只能使用临时数据根和 marker/hash。
- [x] 已核对 Next.js 16.3.3 本地 Route Handler 规范。
- [x] 用户已于 2026-08-28 批准原 Task。
- [x] 用户已于 2026-08-28 批准 Task 修订 1。
- [x] T16-00～T16-12 已按任务顺序实施并完成全量回归。
- [x] T16-13 已生成阶段 Summary。

**当前结论：阶段 16 Task 修订 1 已实施完成，Summary 已获用户批准。**
