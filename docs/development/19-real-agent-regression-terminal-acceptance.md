# 阶段 19：真实 Agent 回归终端验收

## 1. 当前状态与门禁

- Spec：[`19-real-agent-regression-fixes-spec.md`](./19-real-agent-regression-fixes-spec.md)（已批准）。
- Task：[`19-real-agent-regression-fixes-tasks.md`](./19-real-agent-regression-fixes-tasks.md)（已批准，T19-00～T19-06 已完成）。
- 当前门禁：T19-06 自动门禁已完成；用户于 2026-08-30 明确改由阶段 20 重新 Spec，T19-07 已停止，不再等待独立授权。
- 停止条件：不得执行 T19-07 或生成阶段 19 Summary；后续真实模型回归由阶段 20 Spec 的 `AC20-12` 和新的独立授权门禁取代。

## 2. 已完成的 TDD 与专项证据

| 范围 | RED | GREEN |
| --- | --- | --- |
| 真实 delta 打字余量与尾字 | 旧 `advanceTyping` 返回类型及连续 16ms 帧尾字停滞，5/6 失败 | `typing` 与 transcript：2 文件、15 项通过 |
| 长 Markdown 计划 | fake model 场景未注册，E2E 在场景设置处失败 | 标题、GFM 表格、代码块、尾标记、批准前后全文及刷新恢复：1 项通过 |
| System Prompt V7 与工具说明 | 4 文件、26 项中 7 项因 V6 和缺失语义失败 | V7、三个 phase、Schema 与确定性轨迹：4 文件、26 项通过；新增端口轨迹后 5 项集成测试通过 |
| run 内观察账本与 preflight | 纯模块不存在；空根后六个写入仍全部进入授权器（7 次而非 1 次） | 纯模块/Runtime/Plan/recovery：4 文件、31 项通过 |
| 空工作区跨层轨迹 | 错误轨迹复现已知缺失父目录批量写入 | 正确 Plan 轨迹与有限恢复轨迹：2 项通过 |

## 3. 实现事实

- durable `plan.proposed` 直接使用既有安全 Markdown 渲染器；普通 `assistant.delta` 继续使用动画并累计不足一个字形的时间余量。
- System Prompt V7 明确 3000 保留端口、`SERVER_PORT` 项目专用变量、跨文件端口一致性与无 Shell 语义；六工具公共参数未变化。
- Runtime 只在当前 run 保存完整目录观察；已知缺失父目录的 `write_file` 在授权器和执行器之前有限失败。未知或不完整事实保持原授权/安全检查路径。
- `run_process` 结果使缺失事实失效；Plan 批准不清空当前 run 账本；Session 恢复不重建内存账本。

## 4. 隔离夹具

生成命令：

```bash
node --import tsx tests/manual/stage19-fixture.ts
```

夹具只在系统临时目录创建新的 `secode-stage19.*` 根、`.secode-stage19-marker` 和空 `workspace/`。它不读取环境变量、不安装依赖、不初始化 Git，也不复用阶段 17/18 或用户项目目录。

- 本次夹具 basename：`secode-stage19.GK9wtU`；自检确认只含空 `workspace/` 与 marker（26 bytes）。
- marker：`SECODE_STAGE19_FIXTURE_V1`。
- T19-07 状态：未运行，已由用户明确停止。

## 5. T19-06 自动门禁

| 命令 | 结果 |
| --- | --- |
| `pnpm lint` | 通过；仅有 coverage 目录中既有的 2 条 unused eslint-disable 警告 |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 通过：113 files，914 tests |
| `pnpm test:coverage` | 通过：Statements 88.15%，Branches 82.24%，Functions 90.62%，Lines 89.94% |
| `pnpm test:e2e` | 通过：40 tests |
| `pnpm build` | 已执行（沙箱与授权后的本机重跑均失败）：Next 16.3.3 Turbopack 写入 `/page` 时内部创建进程/绑定端口触发 `Operation not permitted (os error 1)`；无 TypeScript、模块或页面诊断，未改字体或 bundler 绕过宿主限制 |
| `git diff --check` | 通过 |
| 秘密扫描 | 通过：唯一命中是 `tests/unit/context/token-estimator.test.ts` 中用于脱敏测试的 dummy `/tmp/sk-abcdefghijklmnopqrstuvwxyz/project`，未发现真实凭据 |

### 5.1 失败修正与宿主限制

- 首次 `typecheck` 只暴露新增测试中的类型收窄问题；补充类型守卫后重跑通过。
- 沙箱内 `pnpm test` 因 loopback/Unix socket/tsx IPC 的 `EPERM` 失败；在用户授权的原工作区重跑通过，未出现行为失败。
- 首次全量 E2E 为 30 passed / 9 failed，原因是既有测试选择器仍使用“允许”，而当前 UI 为“批准本次”，且固定计划标题与 Markdown heading 造成严格模式重复；修正选择器后最终 `40 passed`。
- `pnpm build` 在沙箱和授权后的原始命令均触发同一 Turbopack 宿主端口权限错误；该阻断已记录，未用修改字体、切换 bundler 或放宽安全边界的方式规避。

## 6. AC19-01～07 证据

| AC | 自动证据 | 状态 |
| --- | --- | --- |
| AC19-01 | 长计划 heading/table/code/tail 在批准前可见，批准不改变全文 | 已通过专项 |
| AC19-02 | 普通 delta 余量单元测试；刷新恢复不重播计划动画 | 已通过专项 |
| AC19-03 | `PORT=3000` 宿主下 `SERVER_PORT || 3001`、代理、README、readiness、API/页面一致 | 已通过确定性轨迹 |
| AC19-04 | V7/Schema 无 Shell 契约；事件参数无 `|`、`&&`、`$PORT`、`>`、`$()` | 已通过确定性轨迹 |
| AC19-05 | 完整 listing 后 known-missing-parent 在授权/执行前拒绝 | 已通过单元与集成 |
| AC19-06 | 同批有限抑制；mkdir/重新 listing 后同 run 恢复 | 已通过单元与集成 |
| AC19-07 | 全量自动门禁与安全回归；构建阻断为已记录的宿主 Turbopack 端口 EPERM | 已完成（自动结果已记录） |

## 7. 真实模型停止点与流程重定向

T19-07 尚未运行。当前自动结果不能替代真实模型 durable 证据，也不能被解释为真实模型授权。

用户于 2026-08-30 对新的真实 LongCat 运行完成只读诊断后，明确要求新开阶段重新 Spec。因此阶段 19 保持未完成，T19-07 不再执行；可见正文、完成证据、Context/缓存和 Token 可观测性以及新的真实回归统一转入阶段 20。
