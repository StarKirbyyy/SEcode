# 阶段 25 Summary：Agent 简化写入、基础 TDD、端口启动与可访问交付

## 1. 状态与范围

- 当前状态：`真实回归失败，不作为成功 Summary；修复转入阶段 26`。
- Spec v2、Task v2 均已获用户批准；本阶段执行 T25-00～T25-06。
- 用户明确允许直接在当前 `main` 工作区实施；未执行 commit、push、发布、部署或 T25-07 真实 provider 回归。
- 未读取 `.env.local`，未写入真实 `.secode-data` 或用户工作区。

## 2. 实现结果

- 写入契约移除模型可见 `expectedSha256`；`write_file` 和 `replace_in_file` 保持路径边界、文本校验、原子更新与执行期竞态重验。`read_file` 审计 hash、旧 ToolResult metadata 和旧 JSONL 兼容保留。
- System Prompt 升至 V11：功能/缺陷采用最小测试 RED→最小实现→GREEN；文档、样式、纯配置使用适当验证；生成项目端口仅要求避开 3000，并在监听、代理、README、readiness、API 检查和 final 使用同一实际端口；成功 service 保持运行，final 必须给启动命令和 URL。
- 新增 run-local service handoff 状态：依据结构化 readiness 结果校验最后 service 成败和 URL；缺失链接只纠正一次，仍不完整时返回结构化失败；不新增 durable 事件或服务管理器。
- run.failed、run.cancelled 和 readiness 失败会清理 service；成功 run 不主动终止服务。
- 新增 `tdd-web-handoff` E2E：临时子目录内先写失败测试，再补最小逻辑/后端/前端实现，重跑测试和构建，启动两个非 3000 service，首次 final 缺 URL 后由 Runtime 纠正为含命令和双链接的 final。

## 3. 验证结果

| 门禁 | 结果 |
| --- | --- |
| `pnpm lint` | 通过 |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 119 文件，1015/1015 通过 |
| `pnpm test:coverage` | 119 文件，1015/1015 通过；Statements 88.44%、Branches 82.50%、Functions 91.00%、Lines 90.27% |
| `pnpm test:e2e` | Chromium 49/49 通过 |
| Webpack production build | 通过 |
| Turbopack production build | 通过；保留既有动态 filesystem tracing warning |
| `git diff --check` | 通过 |

专项验证：受影响 Vitest 13 文件、123/123 通过；相关 Playwright 14/14 通过。未授权沙箱中的首次全量 test/coverage 因 loopback、Unix socket、tsx IPC `EPERM` 失败，使用相同命令在获准环境重跑通过；没有改弱断言或跳过测试。

## 4. agent-browser 实测

按 `vercel:agent-browser` 与 `vercel:agent-browser-verify` 在隔离环境运行：

- `http://localhost:3100/` 首页有有效内容，无 Next 错误覆盖层。
- 真实 UI 任务完成后显示后端健康检查链接和前端看板链接。
- 前端临时地址 `http://127.0.0.1:63589/` 显示“Stage 25 看板”“API 已连接”，点击“增加计数”后显示“计数：1”。
- 后端临时地址 `http://127.0.0.1:63588/api/health` 返回 `{"ok":true,"message":"API 已连接"}`。
- 服务 PID 52901、53051 已精确发送 SIGTERM；浏览器、Next、fake provider、临时 workspace/dataDir 均已关闭或清理。

## 5. 失败、根因与修正

1. E2E 初版仍从 Context 正则读取 SHA；改为无 hash 的 replace 参数，保留 read→replace→test。
2. 新服务轨迹第一次只批准后端，前端仍正确停在独立审批；测试改为按两个 service 文件分别批准，验证审批不被错误合并。
3. 旧终端 Plan fixture 的 final 只含一个 URL，触发新增 handoff 门禁后队列耗尽；补齐启动命令、页面 URL、健康 URL，原测试通过。
4. 全量 E2E 的语言策略测试偶发在 UI 终态后立即读取 events API，命中预期 `API_SESSION_BUSY`；改为轮询到 durable events 可读，保留原事件数量断言，重跑 49/49 通过。
5. Webpack/Turbopack 构建会自动追加临时 dist 类型到 `tsconfig.json`；仅恢复本轮追加并删除两个精确构建目录。Turbopack 的动态 filesystem tracing warning 来自既有 `lib/storage/file-safety.ts`，未越界修改。

## 6. 安全、兼容与限制

- 未删除 realpath/symlink、敏感路径、原子 rename、审批、Plan Mode、取消、预算、秘密过滤或 JSONL 事实源。
- 未增加 SHA、baseline、contract freeze、通用 final 文本评分、端口扫描、未知进程终止、Shell、后台守护或新的 durable 事件。
- 自动测试只使用临时目录和隔离 loopback 端口；端口没有固定替代值，只验证不为 3000 与各消费方一致。
- 成功 service 的生命周期仅保证在当前 run 完成后继续运行；跨重启服务管理不在本阶段范围。失败、取消和 readiness 失败会清理本 run service。
- T25-07 真实 provider 质量/费用/自然模型交付未执行，需独立明确授权。

## 7. Summary 审批

本文件只记录 v2 自动实施与验证事实。最新真实 run `ab562cd1-c1a4-496b-9cb0-86e7c1cf92b6` 以 `AGENT_COMPLETION_EVIDENCE_MISSING` 失败，并暴露 TDD、端口和收敛效率缺口，不能作为成功 Summary 审批。用户已明确允许新开修复阶段，后续工作转入阶段 26。
