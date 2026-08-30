# 阶段 16 Summary：Session 对话删除与安全清理

## 1. 文档状态与审批门禁

- 当前状态：已批准，阶段完成。
- 完成日期：2026-08-28（北京时间）。
- 前置 Spec：[`16-session-deletion-spec.md`](./16-session-deletion-spec.md)，用户于 2026-08-28 明确批准。
- 前置 Task：[`16-session-deletion-tasks.md`](./16-session-deletion-tasks.md) 修订 1，原版与修订 1 均由用户于 2026-08-28 明确批准。
- 修订 1 原因：Store 公共接口增加必需的 `deleteSession()` 后，既有 Agent runtime cancellation 测试 fake 必须同步补齐该无副作用方法；用户批准后才继续修改该测试文件。
- 当前门禁：阶段 16 已关闭；后续工作遵循阶段 17 独立 Spec/Task/Summary 门禁。
- Summary 审批：用户于 2026-08-28 明确回复“批准”。
- 审批结果：阶段 16 正式完成；用户同时批准将 Agent 编排增强插入为阶段 17，最终文档与视频顺延为阶段 18。

## 2. 阶段目标与最终结论

阶段 16 已为 SEcode 增加单个 Session 对话及其 JSONL 历史的永久删除能力，并保持工作区项目文件完全不受影响：

```text
Sidebar 删除入口
  → 二次确认（不可撤销、不会删除项目文件）
  → DELETE /api/sessions/:id
  → Server Session 操作占位
  → Store 同根 rename 为严格 tombstone
  → sync sessionsRoot
  → 精确递归删除 tombstone
  → sync sessionsRoot
  → Client 重新读取 durable catalog
```

最终结论：T16-00～T16-13 已完成。删除当前 Session 后回到 `/`；删除非当前 Session 保持现有 URL 与 transcript；活跃或正在启动、恢复、删除的 Session 返回可恢复冲突，不会自动取消后删除。102 个 Vitest 文件共 767 项测试、24 项标准 Chrome Playwright E2E、lint、typecheck、coverage、build 和安全扫描通过，package/lock 未变化。

删除是永久操作，不提供撤销或回收站；被删除的是 SEcode 数据目录中的单个 Session 历史，不是 Session 绑定的工作区。

## 3. 实际开发顺序

1. 对照已批准 Spec/Task、流程文档、Next.js 16.3.3 本地 Route Handler 文档和 dirty worktree 边界。
2. 先扩展需求追踪与 Storage/Server/Client 的严格公共契约。
3. 测试先行锁定 Storage 删除目标、symlink、并发、失败注入、tombstone 恢复和 workspace marker。
4. 实现 Store 两阶段删除与启动时严格 tombstone 清理。
5. 测试先行锁定 start/recover/delete 的竞态，再实现 Server 操作占位和错误映射。
6. 实现原生 Node.js `DELETE /api/sessions/[id]` Route Handler。
7. 实现 Client DTO、API 调用和无乐观删除的有限状态机。
8. 实现 Provider 协调、Sidebar 删除入口和可访问确认 Dialog。
9. 新增 5 项删除 E2E，完成桌面、移动、运行中保护、刷新恢复和项目 marker 验证。
10. 执行全量回归；修正既有并发启动错误码兼容性后重新全量验证。
11. 完成静态安全扫描、浏览器视觉核对和本文档。

开发顺序与已批准 Task 的依赖图一致。没有先实现后补审批，也没有删除真实用户数据。

## 4. 核心实现细节

### 4.1 Storage：精确目标与两阶段删除

`JsonlEventStore.deleteSession(sessionId)` 只接受经 UUID schema 解析的 Session ID：

- 删除与 append/read/inspect 共用同一 `session:<id>` FIFO 队列，防止观察到半提交状态。
- 正式目录先经过既有 Session 目录身份验证；symlink、普通文件、越界身份和不存在目录均不会进入递归删除。
- tombstone 名称由服务端受控 UUID 生成，格式只接受 `.deleting-<session-uuid>-<nonce-uuid>`，不是调用者提供的路径。
- 在同一 `sessionsRoot` 内 rename 后同步父目录，再只对该已验证 tombstone 调用递归删除，最后再次同步父目录。
- rename 前失败保留 Session；rename 后失败返回 `EVENT_COMMIT_UNCERTAIN`，不盲目回滚目录名。
- 初始化只清理格式严格、真实且为 `sessionsRoot` 直接子目录的删除 tombstone；相似前缀、symlink、文件或逃逸条目不会被扩大匹配。
- 成功响应冻结为 `{ sessionId, status: "deleted" }`。

删除测试在临时 data root 和临时 workspace 中运行，删除前后比较 workspace marker，证明项目文件没有变化。

### 4.2 Server：Session 操作占位与错误兼容

Server Application 增加 `starting | recovering | deleting` 操作占位，并继续维护 active run 索引：

- 占位在第一次异步读取前建立，避免“先检查、后等待”产生竞态窗口。
- 删除与 active/starting/recovering/deleting 冲突时返回 `API_SESSION_BUSY`（HTTP 409，recoverable）。
- 删除期间新的 start/read recovery 也被拒绝；占位无论成功或失败均在 `finally` 释放。
- active run completion settle 后才从索引移除，随后允许删除。
- 既有“同一活跃 Session 再次 start”继续返回 `AGENT_SESSION_BUSY`，保持阶段 9/13 的公开错误契约。
- 已活跃 Session 的事件读取直接走 Store，不触发不必要的 recovery。

### 4.3 Route Handler 与 DTO

新增 `app/api/sessions/[id]/route.ts`：

- `runtime = "nodejs"`，使用原生 `DELETE` export。
- 按 Next.js 16 规则异步 `await params`。
- Route UUID schema 严格校验路径 ID。
- 复用 mutation request guard，保留 Host/Origin/Content-Type/体积安全约束。
- 200 响应只包含 `sessionId` 与字面量 `status: "deleted"`；不返回 workspacePath、数据目录或 tombstone 名。
- 非法 ID 为 400，不存在为 404，busy 为 409，未分类错误按既有公共错误边界处理。

### 4.4 Client 状态与删除协调

Client 增加严格删除 schema、类型、API 方法和纯状态模块：

- `deleteSession()` 使用 URL 编码后的 Session ID、原生 DELETE、无请求体。
- 状态只允许 `closed → confirming → deleting → closed/error`。
- 点击入口只打开确认，不预先从列表移除。
- 只有服务端成功或事实协调为 404 后才重新载入 catalog。
- 删除当前 Session：清空当前 history/draft，`router.replace("/")`，显示“工作区项目文件未受影响”的有限事实。
- 删除非当前 Session：保留当前 URL、历史和输入草稿。
- 409、500 或网络失败保留 Session 与错误上下文，可关闭后重试。
- 单一 ref 锁阻止重复确认请求；active run 时删除按钮禁用，提示先停止任务。

### 4.5 Sidebar 与确认 Dialog

Session 行改为相邻的导航 Link 与删除 Button，避免交互元素嵌套：

- 删除按钮具有按会话标题生成的 accessible name，并支持键盘聚焦。
- Dialog 使用 portal、`role="alertdialog"`、明确标题和安全说明。
- 文案明确“只会删除此对话及执行历史”“不会删除工作区中的项目文件”“无法撤销”。
- 默认焦点落在“取消”；Tab/Shift+Tab 锁定在弹窗内；Escape 取消；背景 inert；页面滚动锁恢复原值。
- 请求期间按钮禁用并显示有限进度，失败信息留在弹窗中。
- 移动会话导航点击删除后先关闭左侧 Drawer；取消 Dialog 后焦点回到移动导航按钮，避免恢复到已卸载元素。
- CSS 覆盖 desktop/tablet/mobile 和 reduced-motion，不改变阶段 15 的主信息架构。

## 5. 实际文件变化

### 新增 Production

```text
app/api/sessions/[id]/route.ts
app/ui/shell/session-delete-dialog.tsx
lib/client/session-deletion.ts
```

### 修改 Production / 契约

```text
lib/storage/event-store.ts
lib/storage/types.ts
lib/storage/index.ts
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
```

### 新增测试

```text
tests/unit/storage/deletion.test.ts
tests/unit/client/session-deletion.test.ts
tests/e2e/session-deletion.spec.ts
```

### 修改测试

```text
tests/unit/agent/runtime-cancellation.test.ts
tests/unit/server/application.test.ts
tests/unit/server/errors.test.ts
tests/unit/server/public-api.test.ts
tests/unit/client/api-client.test.ts
tests/unit/client/schemas.test.ts
tests/unit/client/public-api.test.ts
tests/integration/server/session-routes.test.ts
```

### 文档

```text
docs/development/01-requirements.md
docs/development/16-session-deletion-tasks.md
docs/development/16-session-deletion-summary.md
docs/development/README.md
```

没有修改 package、lock、Agent 事件协议、模型、工具、审批、上下文、workspace boundary 或 terminal 实现。

## 6. 测试与验证结果

### 6.1 阶段基线

- 阶段 15 最终基线：100 个 Vitest 文件 / 747 项测试，19 项 E2E。
- `package.json` SHA-256：`5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13`。
- `pnpm-lock.yaml` SHA-256：`5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683`。
- dirty worktree 中阶段 13～15 的既有改动全部保留，未 reset、stash、覆盖或错误归入阶段 16。

### 6.2 最终门禁

| 门禁 | 最终结果 |
| --- | --- |
| Storage 删除指定集 | 6 files / 32 tests，通过 |
| Server/Route 指定集 | 4 files / 45 tests，通过 |
| Client 指定集 | 4 files / 16 tests，通过 |
| 删除专项 E2E | 5/5，通过 |
| `pnpm lint` | exit 0；0 errors，2 个既有 coverage 生成文件 warning |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 102 files / 767 tests，通过 |
| `pnpm test:coverage` | 102 files / 767 tests，通过 |
| Statements | 87.84% |
| Branches | 80.79% |
| Functions | 90.56% |
| Lines | 89.39% |
| `pnpm test:e2e` | 24/24，通过；workers=1，retries=0 |
| `pnpm build` | Next.js 16.3.3，通过；新增动态 `/api/sessions/[id]` |
| `git diff --check` | exit 0 |

最终 package/lock hash 与基线完全一致。E2E 产生的 `playwright-report` 与 `test-results` 临时目录在验证后精确清理；未清理用户文件。

## 7. 测试覆盖的删除行为

- 正常删除只移除所选 Session；同工作区和异工作区其他 Session 均保留。
- workspace marker 内容与 hash 删除前后相同。
- 非 UUID、不存在、symlink、普通文件和越界身份安全失败。
- rm 参数被记录并断言只命中严格 tombstone 直接子目录。
- rename、sync、rm 失败均有结构化事实；rename 后失败为提交不确定。
- 初始化清理合法残留，不扩大到相似名称或未知条目。
- 同 Session read/delete 串行，删除、启动、恢复竞态由受控 Promise gate 验证。
- HTTP 200/400/404/409、Origin guard 和响应 schema 均有集成测试。
- Client 取消、重复提交、404 协调、错误保持和当前/非当前路由行为有单元测试。
- E2E 覆盖取消删除、删除非当前、删除当前并刷新、活动任务先停止、移动键盘/焦点恢复。

## 8. 失败、诊断、修正与重跑

1. 首次全仓 typecheck 发现 Agent runtime cancellation 测试中的完整 Store fake 缺少新必需方法。该文件超出原白名单，因此停止并提交 Task 修订 1；用户批准后只补无副作用 fake，typecheck 通过。
2. Dialog 初次 lint 命中 render 阶段写 ref。改为 effect 同步 `deletingRef`，保持 Escape handler 使用最新状态；lint 与 E2E 重跑通过。
3. 删除 E2E 首次全量运行 23/24：移动端打开确认时会话 Drawer按设计关闭，旧断言仍期待 Drawer 可见。测试修正为验证 Drawer 已关闭、取消后焦点恢复到“打开会话导航”；专项 5/5 和全量 24/24 通过。
4. 最终首次 `pnpm test` 为 766/767：新的预约层把“活跃 Session 再次 start”错误码从既有 `AGENT_SESSION_BUSY` 误改为 `API_SESSION_BUSY`。实现改为只在 start 遇到 active 时保留 Agent 错误；删除或其他预约冲突继续使用 API 错误。针对性 15/15、随后全量 767/767 通过。
5. Playwright 失败 trace 产物曾被 ESLint 扫描并产生大量第三方生成代码错误。确认目录是本轮测试生成且不受 Git 管理后，只精确清理仓库根的 `playwright-report` 与 `test-results`；最终 lint 0 error。

没有降低断言、覆盖阈值，没有添加 retry、跳过 E2E 或改变假模型来制造通过。

## 9. 安全与边界审计

- `rg` 删除扫描只发现 Store 中三个受控 `fs.rm` 调用：本阶段正式 tombstone 删除、初始化 tombstone 清理，以及既有临时文件清理。
- 正式删除和初始化清理都在 canonical data root 下构造路径，并验证 tombstone 是 `sessionsRoot` 的真实直接子目录。
- Route/Client 从不接受或传输删除路径；唯一目标标识是 UUID。
- `app/ui` 与 `lib/client` 对 `SECODE_DATA_DIR`、API Key、`node:fs`、`sessionsRoot` 的静态扫描无匹配。
- 响应、UI 和日志不暴露数据根、tombstone、环境变量、API Key 或模型私有推理。
- 所有破坏性测试使用自动临时根；没有读取或删除仓库真实 `.secode-data`，没有删除任何真实用户 Session 或工作区文件。
- 不使用 shell/glob 计算删除目标，不执行 Git commit/push，不安装依赖。

## 10. 人工浏览器检查

- 内置浏览器完成桌面主页、264px Session 导航、工作区 BottomSheet、视觉层级与无页面滚动的截图核对。
- 内置浏览器会给本地 mutation 请求附带非同源上下文，`POST /api/workspaces/browse` 被应用的 Origin guard 按设计拒绝为 403；本机 Chrome 控制扩展当前不可用，因此没有通过内置浏览器执行真实删除。
- 标准 Chrome Playwright 已独立完成全部删除交互与响应式核对：5/5 删除专项、24/24 全量，包含 alertdialog、默认取消焦点、Escape、移动 Drawer 关闭与焦点恢复。
- 该限制属于本次人工控制环境，不是生产 Route 或普通浏览器同源交互缺陷；E2E 使用真实 Next.js server 和标准 Chrome 同源请求验证通过。

## 11. 与 Spec/Task 的偏差

公共语义没有偏差。实现阶段有两项局部选择：

- 404 删除事实由 Client 协调为“已不存在”并刷新列表，避免重复删除；这符合 Task 9.3 的事实协调策略。
- active start 保留既有 `AGENT_SESSION_BUSY`，而删除相关冲突使用 `API_SESSION_BUSY`；这是全量回归发现并修复的向后兼容要求，不改变 Spec 的 HTTP 409 语义。

未实现归档、Undo、回收站、批量删除、删除工作区、自动取消后删除或 `session.deleted` 事件。

## 12. 已知限制

- 删除成功后不可恢复；若用户需要历史，必须在确认前自行备份 data root。
- rename 后进程或磁盘失败可能留下严格 tombstone，下一次 Store 初始化会尝试清理；接口会返回提交不确定而不虚假宣称保留或删除。
- 首版仍只面向可信本地单用户，不提供恶意模型代码的 OS 强沙箱。
- 多标签页没有跨进程分布式锁；当前 Server 实例内竞态有严格占位，磁盘层仍依赖单机 Store 队列和目录身份验证。
- LongCat 真实端点仍按用户先前决定跳过；本阶段不调用真实模型服务。

## 13. 反思与阶段 17 影响

1. 删除功能不能只在 UI 隐藏条目；必须把路径证明、提交边界、并发占位和 durable catalog 协调作为一个整体。本阶段的两阶段 Store 删除和 Server reservation 避免了“界面消失但磁盘事实不确定”的双真相。
2. 新增公共方法即使不改变旧行为，也会影响所有结构完整的测试 fake。Task 修订门禁成功阻止了未经批准扩大文件范围。
3. 通用 busy helper 容易抹平既有错误协议；完整回归发现并恢复了 `AGENT_SESSION_BUSY` 兼容性，证明不能只跑新功能指定集。
4. 删除确认的可访问性不仅是弹窗 focus trap，还包括触发元素在移动 Drawer 卸载后的 fallback focus；专项 E2E 锁定了真实生命周期。
5. 后续最终演示应明确展示“删除对话不会删除工作区文件”，但最终材料不得暗示可撤销或提供 OS 级沙箱；该最终交付后来经用户批准顺延为阶段 18。

## 14. 审批检查

- [x] Spec、Task 与 Task 修订审批链完整。
- [x] FR-011、NFR-009、SEC-009 已写入需求追踪。
- [x] Storage、Server、Route、Client、UI、E2E 全部完成。
- [x] 永久删除与工作区不删除的语义明确。
- [x] 404/409/失败、并发、tombstone 和可访问性均有证据。
- [x] 全量质量门禁、hash 与安全扫描通过。
- [x] 未越过阶段 17 边界。
- [x] 用户已于 2026-08-28 审批本 Summary。

**当前结论：阶段 16 Summary 已获批准，阶段正式完成；阶段 17 观察与 Spec 已解锁。**
