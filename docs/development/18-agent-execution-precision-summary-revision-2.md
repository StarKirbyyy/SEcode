# 阶段 18 Summary 修订 2：启动验收、服务进程生命周期与完整用量计量

## 1. 状态与审批

- 当前状态：`已批准`。
- Spec：[18-agent-execution-precision-spec-revision-2.md](./18-agent-execution-precision-spec-revision-2.md)，用户已批准。
- Task：[18-agent-execution-precision-tasks-revision-2.md](./18-agent-execution-precision-tasks-revision-2.md)，用户已批准。
- 本 Summary 记录本轮实现和验证；用户于 2026-08-29 回复“批准”，等价于“阶段 18 Summary 修订 2 通过”。

## 2. 已完成实现

### 2.1 `run_process` 服务生命周期与启动验收

- `run_process` 新增 `lifecycle: "oneshot" | "service"`，默认 `oneshot`；service 必须带 readiness。
- readiness 支持严格高位 loopback `127.0.0.1`、`localhost` 和 `[::1]`，支持独立 `readiness.timeoutMs`，继续禁止重定向和凭据。
- service readiness 成功后返回 `pid`、`lifecycle`、状态码和耗时，停止等待但不杀进程；输出继续排空。
- oneshot、未就绪提前退出、spawn 失败、超时和取消仍按进程组清理；执行信号在 service 返回后取消时也会终止目标服务。
- 系统提示加入开发完成后的 lockfile 安装、build/typecheck、逐服务 readiness 验收及安装/构建/启动/端口/就绪结果区分。模型不会因 stderr/warning 单独判失败，也不会在安装失败时宣称可启动。

### 2.2 完整 Token 计量

- `model.completed` 支持 `usageComplete`；重试后的完成会标记为不完整。
- 上下文摘要模型调用通过回调收集每次 completion usage，并写入 `context.compacted.usage/usageComplete`；摘要无 usage 时显式不完整。
- 客户端 `projectRun` 累计主模型和摘要 usage，检测缺失字段、未完成的 model request，并暴露 `usageComplete` 与 `unreportedUsageRequests`。
- 详情抽屉和终端 renderer 在 usage 不完整时显示“至少/不完整”，不把 provider 缺失值伪装为精确账单；不公开 reasoning 正文。

## 3. 修改范围

生产代码涉及：

- `lib/tools/types.ts`、`lib/tools/schemas.ts`、`lib/tools/run-process.ts`；
- `lib/model/client.ts`、`lib/model/types.ts`；
- `lib/context/provider.ts`、`lib/context/summary-generator.ts`、`lib/context/history-projector.ts`、`lib/context/types.ts`、`lib/context/system-prompt.ts`；
- `lib/agent/runtime.ts`、`lib/agent/schemas.ts`、`lib/agent/types.ts`、`lib/domain/event.ts`；
- `lib/client/event-state.ts`、`lib/terminal/event-renderer.ts`、`app/ui/workbench/details-drawer.tsx`。

测试涉及工具 readiness/service、Schema/registry、模型重试、摘要 usage、事件投影、Agent Schema、终端与上下文回归。未新增依赖，未触碰真实用户项目或凭据。

## 4. 验证结果

通过：

- `pnpm exec vitest run tests/unit/tools/run-process.test.ts tests/unit/tools/schemas.test.ts tests/unit/tools/registry.test.ts`：26/26 通过（宿主机 loopback）；
- `pnpm exec vitest run --maxWorkers=1`：112/112 测试文件、895/895 测试通过（宿主机环境）；
- `pnpm typecheck`：通过；
- `pnpm lint`：0 errors，保留 coverage 生成脚本既有 2 条 unused-disable warning；
- `git diff --check`：通过；
- `pnpm exec next build --webpack`：编译、TypeScript、静态页面和路由生成全部通过。

环境限制：

- `pnpm build`（Next.js 16.3.3 Turbopack）仍在处理 `app/globals.css` 时因内部进程绑定端口 `Operation not permitted (os error 1)` 失败；同一代码使用官方 `--webpack` fallback 已通过，故记录为宿主 Turbopack 限制而非业务编译错误。
- 默认并发 `pnpm test` 曾出现并发资源争用导致的 2 项偶发失败；单 worker 宿主回归已全部通过，未降低断言或跳过测试。

## 5. 偏差与遗留风险

1. provider 不返回 usage、流在 usage 之前断开或供应商内部缓存/折扣口径仍无法被本地精确推算；UI 现在明确显示未完整计量和已报告下限。
2. service PID 只在当前应用进程生命周期内可安全控制；应用重启后不会猜测或自动杀旧 PID，用户需通过外部服务管理或重新启动的受控动作清理。
3. 服务常驻是显式 `lifecycle="service"` 行为；旧调用默认 oneshot，避免无意遗留进程。

## 6. 内部门禁

- [x] T18-R2-01～T18-R2-06 已实施并有对应测试；
- [x] T18-R2-07 的自动回归、类型、lint、webpack 构建和 diff 校验已执行；
- [x] 真实 loopback service 生命周期和取消清理已在宿主机验证；
- [x] 未新增依赖、秘密、工具或未说明的外部写入；
- [ ] Turbopack 默认构建仍受宿主端口权限限制；
- [x] Summary 已于 2026-08-29 获用户批准。

**当前结论：Summary 修订 2 已获批准，阶段 18 正式完成；阶段 19 尚未开始。**
