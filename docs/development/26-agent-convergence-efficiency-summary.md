# 阶段 26 Summary 修订 2：比例化验证、软完成证据与快速启动

> **状态：待用户审批。** T26R2-00～T26R2-07 已实施并通过自动与隔离浏览器门禁；T26R2-08 真实 provider、Git 写入、发布和部署仍未授权。Summary 获批前不得进入阶段 27。

## 1. 结果

本轮完成了用户要求的回退：普通 run 不再因为未补齐完成证据或 service 交付信息而在最后阶段无回答失败。首次完成声明仍获得一次最小纠正机会；第二次声明正常形成同一条 `assistant.message` 与 `run.completed`，并在必要时确定性附加“验证未完整”或“服务未成功启动”警告。

最新失败轨迹的最小因果回放现在用 **9 次模型请求**完成：已有测试成功、Production 再修改、首次 stop、四次诊断请求、第二次 stop，结果为 `run.completed`，只有一条 `completion.evidence.rejected`，没有新的 `AGENT_COMPLETION_EVIDENCE_MISSING`。完整成功 Web 轨迹仍以 **9 次模型请求**完成双 service readiness、一次 smoke 和 final，低于 ≤30 目标；失败 service 浏览器轨迹以 **3 次模型请求**交付真实警告。

## 2. 实现

- `lib/agent/completion-evidence.ts` / `runtime.ts`：移除 4 model / 8 tool 局部硬失败预算和第二次完成拒绝；增加有界、脱敏、幂等的验证警告。旧错误码与投影保留，只服务历史 JSONL 兼容。
- `lib/agent/service-handoff.ts`：全 run 最多一次 final correction；之后失败 service 附加有限 `code@cwd` 警告，漏报的已验证 loopback URL 由 Runtime 确定性补入，不再形成普通 run 硬终态。
- `lib/tools/dependencies.ts` / `run-process.ts`：readiness 改用 `node:http`，显式禁用连接池，不经过 `globalThis.fetch`；结果只记录 connected/status/有限错误分类及尝试次数，不保存 body/header/socket 信息。
- `lib/agent/convergence-view.ts`：增加 `closing`；第 20 次模型请求跨界时只改变一次 fingerprint，提示只保留最小验证、一次启动、至多一次 smoke 和 final。
- `lib/context/system-prompt.ts` / `lib/tools/schemas.ts`：升级 Prompt V13，普通轻量任务使用比例化最小反馈环、10～15 秒 readiness 建议和诚实 final，不再要求每个切片独立 RED 或凑齐四类 validator。
- E2E 增加失败 service 软交付，并保留成功服务、交互、链接与刷新恢复覆盖。

## 3. readiness 404 结论

原 run 两次 60 秒探测只留下最后 HTTP 404，而生成服务在相同代码和端口的独立复测返回 200；旧日志没有记录连接目标来源或每次尝试，无法诚实归因到应用路由。旧探针依赖 Next 进程中的全局 `fetch`，可能受运行时 fetch 行为影响；这是推断，不是已证实根因。

修订后用原生 `node:http` 消除了代理、缓存、重定向和全局 fetch 这一不确定层。回归以“全局 fetch 固定抛错”的哨兵验证原生探针仍取得 200，并覆盖稳定 404、连接拒绝、连接重置、AbortSignal、超时和进程树清理。因此本轮修复的是可证明的不确定来源和诊断缺口，不把旧 404 伪写成已确定的应用缺陷。

## 4. RED、失败与修正

1. 专项 RED 首跑 30 项中 6 项按预期失败：completion/service 仍硬失败，closing 不存在。Production 修改后 30/30 通过。
2. 原生 readiness 首次在受限 sandbox 中因 loopback `EPERM` 无法运行；按原命令获准重跑后 39/39 通过。这是测试环境权限，不是产品失败。
3. Prompt V13 初版超过既有 1700 token 门；精简重复规则后三个 phase 均通过，未提高门限。
4. 全量 `pnpm test` 首轮只剩旧终端集成断言仍期待 Prompt V12；更新为 V13 比例化合同后 1034/1034 通过。
5. `test:coverage` 首跑一个 JSONL 测试在辅助句柄关闭时瞬态得到 `EBADF`；聚焦重跑 14/14 通过，完整覆盖率原命令重跑 1034/1034 通过，未修改 Production 或放宽断言。
6. 新 E2E 首跑发现假模型的失败场景在工具选择前提前返回文本；调整测试驱动顺序后通过。成功轨迹立即刷新还撞到既有服务端清理映射的短竞态 409；测试在输入区恢复后等待一次清理事件循环再刷新，Production 不变，完整 E2E 通过。

## 5. 验证

| 门禁 | 结果 |
| --- | --- |
| `pnpm lint` | 通过，0 error / 0 warning |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 120 文件，1034/1034 通过 |
| `pnpm test:coverage` | 重跑通过；statements 88.56%、branches 82.55%、functions 91.42%、lines 90.4% |
| `pnpm test:e2e` | 51/51 通过，约 1.7 分钟 |
| `npm run build` | 通过 |
| `SECODE_NEXT_DIST_DIR=.next-gate-turbo pnpm exec next build` | 通过；自动写入的临时 `tsconfig` include 已精确移除 |
| `git diff --check` | 通过 |
| `.only/.skip`、依赖、秘密、真实数据 | 无新增 skip/only；依赖文件未变；只命中既有/新增脱敏负例；未写真实 `.secode-data` |

两次 build 均保留既有 Turbopack warning：`lib/storage/file-safety.ts` 动态路径会扩大 tracing。本阶段未修改该路径安全实现，构建成功。

## 6. agent-browser 验收

- 使用隔离 dataDir、随机工作区、假模型和随机 loopback 端口启动真实 SEcode。
- agent-browser 驱动失败 service 场景：审批后显示真实 `run_process` 失败，最终以 3 次模型请求正常完成；final 包含 `PROCESS_EXIT_NONZERO@.` 和“未提供可访问 URL”，页面无虚假链接。
- 刷新 Session 后，终态、原 final 与确定性警告完整恢复。
- 首次误用 `127.0.0.1:3100` 来源时 workspace browse 返回 403，证明跨源保护有效；改用测试配置的 `localhost:3100` 后继续，未修改安全策略。
- 已关闭 agent-browser 与隔离开发环境；截图证据位于 `/private/tmp/secode-stage26-r2-warning.png`，临时测试根由环境自身清理。

## 7. 安全与剩余门禁

- 工作区边界、危险审批、取消/超时、重复错误和无进展保护均保留；失败 validator 事实没有被改写为成功。
- `AGENT_COMPLETION_EVIDENCE_MISSING`、`AGENT_FINAL_HANDOFF_INCOMPLETE` 仍可解析旧事件，但新普通 run 不再从这两条路径终止。
- T26R2-08 真实 provider 尚未授权、未读取凭据、未执行。若用户批准本 Summary，可选择另行授权该可选回归，也可直接进入阶段 27 的 Spec；不会自动 commit、push、发布或部署。

## 8. Summary 审批

**当前状态：待用户审批。**

请确认是否批准阶段 26 Summary 修订 2。批准后阶段 26 才正式完成；本轮到此停止。
