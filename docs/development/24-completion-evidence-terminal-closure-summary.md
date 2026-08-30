# 阶段 24 Summary：Agent Harness 收敛效率、完成证据精确纠正与可解释失败终态

## 1. 状态与审批门禁

- 当前状态：`已批准，阶段 24 完成`。
- 已批准 Spec：[`24-completion-evidence-terminal-closure-spec.md`](./24-completion-evidence-terminal-closure-spec.md)，修订 1。
- 已批准 Task：[`24-completion-evidence-terminal-closure-tasks.md`](./24-completion-evidence-terminal-closure-tasks.md)。
- 审批记录：用户于 2026-08-30 先批准 Spec 修订 1，随后回复“批准”通过 Task，解锁 T24-00～T24-09。
- 实施结果：T24-00～T24-09 已完成，自动门禁与隔离浏览器检查通过。
- Summary 审批：用户于 2026-08-31 明确要求自动审批并批准此前全部待审批文档，并确认问题已经修复；该回复批准本 Summary，阶段 24 正式完成。
- T24-10 是可选且需要独立授权的真实 provider 回归，本次未执行；用户基于完整自动门禁和隔离浏览器证据批准 Summary，因此该可选项按“未执行、不再作为阶段门禁”关闭，不追记为真实模型成功。

## 2. 问题结论与根因

最新真实 Session 的截断不是代码修改丢失，而是完成门在两次纠正后以 `AGENT_COMPLETION_EVIDENCE_MISSING` 正确阻止了虚假 completed，但旧实现只告诉模型和用户未覆盖的 scope，没有给出具体待验证文件。模型已在 build 后新增 `client/verify-integration.mjs`，又用普通 `node` 成功执行；旧分类既不承认普通 Node，也不承认精确的 `node --test`，因此模型无法从泛化提示判断该补跑哪个认可验证，第二次 stop 后直接进入结构化失败，UI 又缺少可行动路径，表现为“总结阶段报错后截断”。

Harness 效率方面还确认了三条独立放大链：

1. 1M context profile 只在 75% 硬预算附近压缩，长 run 在 64K 之后仍反复携带大历史。
2. 同一文件、同一 SHA 的多处修改只能拆成多个 `replace_in_file` 调用，后一调用容易因前一写入变成 stale。
3. validator 在“失败—修改—相同失败”循环中只有全局预算保护，缺少面向同一诊断的早停与解释。

真实 Session 的只读脱敏计数为 122 次模型请求、145 次工具调用、18 次失败工具调用、约 5,308,984 prompt tokens；这些数字用于定位工程问题，不与较短的合成 fixture 做等价任务速度对比，也未读取或复制消息正文、代码、凭据或 private reasoning。

## 3. 已完成实现

### 3.1 完成证据与失败闭环

- 完成门现在提供稳定排序且有界的相对路径视图：最多 12 条、单条 256 Unicode code points、正文合计 2048 code points；scope 始终按完整 pending 集合计算。
- `completion.evidence.rejected` 与 `AGENT_COMPLETION_EVIDENCE_MISSING` 增加兼容的路径、总数、截断标记和认可验证类别；旧事件缺字段仍能恢复并降级显示。
- 精确 `node --test` 归类为 test；普通 `node file.js`、`node -e` 和名称自称 test/verify 的脚本继续不清除完成证据。
- run 内最多保留 8 条当前有效验证事实；后续覆盖范围 mutation 会使对应事实失效，不形成跨 run 授权。
- Terminal、Context、Web transcript 与详情抽屉都能显示“哪个文件未验证、运行为何未完成、修改仍保留、下一步应补什么验证”，且不会把系统诊断伪装成 assistant 成功正文。

### 3.2 Context 与 validator 收敛

- Context 采用双预算：`min(hard, 64_000)` 软压缩触发、最多 8K 摘要目标、原 75% hard budget 不变；软目标不可达但仍低于 hard 时允许保留最近完整回合继续。
- Context cache protocol 升级到 v2；旧 durable summary/JSONL 不迁移、不重写。
- 新增 run-local validator repair episode。第二次及后续相同 validator 失败会产生 `validation.repair.warning`；相同安全 fingerprint 在成功 mutation 间隔后第三次出现时，以 `AGENT_VALIDATION_NO_PROGRESS` 结构化终止。
- fingerprint 仅由已脱敏、已截断的工具结果在内存计算，不持久化、不展示、不进入 Context 或公共类型。

### 3.3 工具效率与模型指导

- `replace_in_file` 保持旧单项输入，同时新增 1～16 项、同文件、同原始 SHA 的 atomic `replacements`；所有匹配先在原快照验证，任一缺失、非唯一或重叠时零写入，成功只进行一次原子写。
- 公共工具参数、审批摘要与事件只保留数量、长度、hash 和脱敏 preview，不保存完整替换正文。
- System Prompt 升级到 V10，明确独立读取/不同文件的合批边界、依赖调用顺序、同文件 batch replace、validator 聚焦修复、当前有效验证事实及认可验证分类。

## 4. Harness 效率差分

合成 fixture 固定的是行为上界，不冻结自然模型 Token 或价格：

| 反馈环 | 修复前风险 | 修复后确定性结果 |
| --- | --- | --- |
| 后写验证脚本 | 泛化 scope 提示，两次 stop 后不可行动失败 | 7 次模型请求、5 次工具调用、1 次精确 rejection；显示 `client/verify-integration.mjs`，补跑 client validator 后同 run completed |
| 同文件两处替换 | 2 次调用，第二次可能 `FILE_STALE` | 1 次 batch 调用、1 次 mutation、0 stale |
| 相同 validator 诊断 | 可持续消耗全局预算 | 第二次起 warning，满足 mutation 条件时最迟第 3 次相同失败结构化收口 |
| 1M context 长历史 | 接近 750K 才触发压缩 | 可驱逐 baseline 达 64K 即生成 durable compaction，后续估算低于原 baseline |

这证明用户关心的“小问题反复调用工具仍无法修好”不再只依赖模型自律：同文件编辑减少一次可避免的 stale 往返；相同诊断循环有局部早停；完成门给出精确路径而不是重复泛化提醒。它不保证任意自然模型都能一次修复，也不通过提高模型/工具/总时限预算制造改善。

## 5. 主要文件

- Agent：`lib/agent/completion-evidence.ts`、`lib/agent/validation-repair.ts`、`lib/agent/runtime.ts`、`lib/agent/types.ts`、`lib/agent/errors.ts`、`lib/agent/schemas.ts`、`lib/agent/projection.ts`。
- Context：`lib/context/compaction.ts`、`lib/context/provider.ts`、`lib/context/types.ts`、`lib/context/system-prompt.ts`、`lib/context/history-projector.ts`、`lib/context/message-renderer.ts`。
- Tools/Approval：`lib/tools/replace-in-file.ts`、`lib/tools/schemas.ts`、`lib/tools/types.ts`、`lib/tools/registry.ts`、`lib/approval/summary.ts`。
- Durable/UI：`lib/domain/event.ts`、`lib/terminal/event-renderer.ts`、`lib/client/*`、`app/ui/workbench/transcript.tsx`、`app/ui/workbench/details-drawer.tsx`。
- 验证：`tests/unit/agent/validation-repair.test.ts`、completion/context/tools/approval/domain/terminal/client 专项测试、`tests/e2e/harness-efficiency.spec.ts`、`tests/e2e/support/fake-model-server.ts`。

没有修改 `package.json`、`pnpm-lock.yaml`、Production `lib/storage/**`、`lib/model/**`、`lib/workspace/**` 或 `app/api/**`；没有读取或修改真实 `.secode-data`、真实用户工作区或 `.env.local`。

## 6. 验证结果

| 验证 | 结果 |
| --- | --- |
| `pnpm lint` | 通过，0 warning |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 118 files，1003/1003 通过 |
| `pnpm test:coverage` | 118 files，1003/1003 通过；Statements 88.29%、Branches 82.24%、Functions 91.05%、Lines 90.14% |
| `pnpm test:e2e` | Chromium 48/48 通过，2.6 分钟 |
| Webpack production build | 通过；Next.js 16.3.3，10 个静态页面生成完成 |
| Turbopack production build | 通过；Next.js 16.3.3，保留一条既有动态 filesystem tracing warning |
| `git diff --check` | 通过 |
| secret/skip/范围审计 | 通过；命中项仅为脱敏测试哨兵、变量名和文档禁令；无 `.only/.skip`，无 package/lock/真实 Session 改动 |

隔离 `agent-browser` 检查使用临时 dataDir、临时 workspace、随机 fake-model 端口和本机 `localhost`：页面显示精确待验证路径、1/2 completion rejection、审批后的同 run completed（模型请求 7、工具 5），刷新后 durable 终态一致；正常流程 API 均为 200，console 无应用错误。最初误用 `127.0.0.1` 触发一次预期 Origin 403，改用配置允许的 `localhost` 后通过。浏览器、服务、临时目录和 `.next-stage24-*` 已精确清理。

## 7. 失败、诊断与修正记录

1. RED 阶段分别复现：`node --test` 未识别、完成拒绝缺路径、1M profile 64K 不压缩、batch schema 拒绝、validator 无局部早停；随后按 T24-01～T24-06 逐环修复。
2. System Prompt V10 首版超过既有 1700-token 固定门；压缩重复措辞后恢复到原门内，没有提高阈值。
3. 首轮全量测试仍断言 V9/旧 scope，修正冻结版本和精确路径期望后通过。
4. coverage instrumentation 使 62-request stress、空工作区 Plan、1001-event pagination 三个确定性长测试超过原测试框架 wall-clock timeout；仅将对应测试 case timeout 调为 10s、10s、30s，未改变 Agent 模型/工具/总时限预算、业务断言或 coverage 阈值。最终 coverage 全通过。
5. 新 E2E 初版复用了已有 fixture 文件且未处理普通 Node 的危险命令审批；改为唯一文件名并走真实批准链。随后刷新过早命中 active-run cleanup 窗口返回 409；测试改为轮询 durable events API 到 200 后刷新，不修改 Server 业务语义。最终专项与全量 E2E 均通过。
6. Webpack 首次在沙箱内因 `fonts.googleapis.com` DNS 不可达失败；以相同命令获准联网重跑后通过。Turbopack 构建成功但报告动态 filesystem tracing 的既有警告，未在阶段 24 越界修改 Storage。
7. 两次构建会机械写入临时 dist 类型路径；已只移除本轮 `.next-stage24-webpack` / `.next-stage24-turbopack` 条目并删除对应构建目录，保留此前 `tsconfig.json` 内容。

## 8. 偏差、限制与风险

- 未创建 `tests/manual/stage24-fixture.ts`：T24-00～T24-09 的合成生产链已由现有 E2E runtime manifest、fake model server 与临时 workspace 完整覆盖；该文件在 Task 中是允许文件而非强制公共产物。T24-10 若获独立授权，仍可在其白名单内创建专用真实模型 fixture。
- 未执行 T24-10，因此没有对 DeepSeek/LongCat/Generic 自然模型的真实响应质量、费用或 provider 缓存行为作新声明。
- Turbopack 的动态 filesystem tracing warning 来自阶段 24 禁止修改的 `lib/storage/file-safety.ts`；构建成功，但部署包追踪范围风险继续保留给后续获批阶段处理。
- 长期 dirty worktree 包含用户与先前阶段的大量修改；本阶段没有 reset、stash、checkout、commit 或清理这些内容。

## 9. 安全与兼容性结论

- 六工具、串行副作用、工作区边界、SHA、symlink、审批、Plan Mode、取消、预算和 JSONL 事实源保持不变。
- 新 durable 字段均为可选，新事件有 strict schema；旧 JSONL 无迁移恢复测试通过。
- 路径、replacement、repair diagnostic 均有界并脱敏；不公开 fingerprint、文件正文、stdout/stderr、绝对真实路径、凭据或被拒绝 completion。
- 自动与浏览器验证只操作临时目录；真实 Session 与用户项目未被测试写入。

## 10. Summary 内部门禁

- [x] Spec 与 Task 均有明确用户批准记录。
- [x] T24-00～T24-09 全部完成，T24-10 保持独立授权状态。
- [x] 实现符合已批准 Spec 修订 1 与 Task，无公共接口或安全边界越权。
- [x] 最小验证、全量测试、coverage、E2E、双构建和浏览器检查通过。
- [x] 失败、根因、修正、重跑和 Turbopack warning 已如实记录。
- [x] 无新增秘密、真实数据写入、依赖变更或遗留临时资源。
- [x] README 与 Task 已同步为 Summary 待审批。

## 11. 用户审批

**当前状态：已批准，阶段 24 正式完成。**

- 审批记录：用户于 2026-08-31 明确批准此前全部待审批文档，并确认本问题已经修复。
- 解锁范围：阶段 24 正式完成；允许进入阶段 25 的只读观察与 Spec 生命周期。
- T24-10 未执行、未被追认为通过；未来若仍要运行真实 provider，必须作为新的明确请求重新授权。
