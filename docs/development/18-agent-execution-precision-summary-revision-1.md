# 阶段 18 Summary 修订 1：工作区权限、Token 统计与工作台细节修复

## 1. 状态与审批

- 当前状态：`被后续修订取代`。
- 取代说明：用户新增启动验收、service 生命周期、readiness 超时和完整 Token 计量需求；这些需求改变公共工具/事件契约，已回退到 [Spec 修订 2](./18-agent-execution-precision-spec-revision-2.md) 重新审批。本 Summary 的既有实现记录仍保留为历史事实，不作为新范围的批准。
- Spec：[18-agent-execution-precision-spec-revision-1.md](./18-agent-execution-precision-spec-revision-1.md)，用户已批准。
- Task：[18-agent-execution-precision-tasks-revision-1.md](./18-agent-execution-precision-tasks-revision-1.md)，用户已批准。
- 本 Summary 记录本轮实现、验证、失败和偏差；用户批准前不得进入阶段 19。

## 2. 已完成实现

### 2.1 Token 统计

- `projectRun` 现在按 run 内所有 `model.completed` 事件分别累计输入、输出和总 Token。
- 每轮 transcript 仍显示单轮值；详情抽屉显示三项累计值。
- 缺失字段不被伪造或从其他字段推算。

### 2.2 工作区权限

- 新增 `ask` / `full` 工作区权限模式，默认 `ask`，按服务端规范化工作区路径隔离。
- 新增 `/api/workspaces/permission` GET/POST 接口和 Client API。
- `full` 模式自动解析原本需要审批的高风险工具调用，并追加 `approval.required` / `approval.resolved` 审计事实。
- `deny`、工作区边界、哈希校验、取消、预算和进程清理仍不可绕过。
- 审批卡提供“批准本次”和“完全访问权限”；详情抽屉提供模式查看及恢复“每次询问”。

### 2.3 提示与工作区新建

- `navigationNotice` 增加 4 秒可取消计时器，新提示会清理旧计时器，卸载时清理。
- 每个左侧工作区分组增加直接新建对话按钮，复用现有工作区验证并跳转新任务页。

## 3. 修改范围

生产代码涉及：

- `lib/client`、`lib/approval`、`lib/agent`、`lib/server`、`lib/domain`；
- `app/api/workspaces/permission`；
- `app/ui/shell`、`app/ui/workbench`、`app/globals.css`。

测试涉及客户端事件投影、Agent full 权限运行、Server 工作区权限隔离和公共 API 导出断言。未新增第三方依赖，未触碰真实用户项目或凭据。

## 4. 验证结果

通过：

- `pnpm exec vitest run tests/unit/client/event-state.test.ts tests/unit/client/api-client.test.ts tests/unit/server/application.test.ts tests/unit/server/workspace-permissions.test.ts tests/unit/agent/runtime-completion.test.ts tests/unit/agent/runtime-cancellation.test.ts`：53/53 通过；
- 相关扩展回归（含 Server public API）：32/32 通过；
- `pnpm lint`：0 errors，仅保留既有 coverage 脚本的 2 条 unused-disable warning；
- `pnpm typecheck`：通过；
- `git diff --check`：通过。

阻塞/失败：

- `pnpm test`：869/890 通过，21 项失败。失败集中在既有的本机监听限制：`listen EPERM`、Unix socket 创建限制，以及受此影响的终端子进程退出码；另有一次公共 API 导出断言已修正并单独回归通过。
- `pnpm build`：Next.js 16.3.3 Turbopack 在处理 `app/globals.css` 时因内部进程绑定端口 `Operation not permitted (os error 1)` 失败；不是 TypeScript 或业务错误。

## 5. 偏差与遗留风险

1. 工作区权限当前保存在服务端应用实例内存中。浏览器刷新仍可读取同一实例状态；服务进程重启后恢复为 `ask`，不会把旧批准伪装成执行能力。若要求跨进程重启持久化，需要另行设计安全的权限事实存储。
2. “完全访问权限”是审批策略放宽，不是 OS 沙箱关闭或主机权限提升；项目仍保持可信本地单用户边界。
3. 全量测试和生产构建需在允许本机端口/Unix socket 的宿主环境重跑。

## 6. 内部门禁

- [x] 实现仅使用已批准 Task 的范围。
- [x] 核心回归、lint、typecheck、diff 校验已执行并记录。
- [x] 未新增依赖、秘密、工具或未说明的外部写入。
- [ ] 全量测试与生产构建未因环境权限完成。
- [ ] Summary 尚未获用户批准。

**当前结论：Summary 修订 1 待用户审批；批准前不进入下一阶段。**
