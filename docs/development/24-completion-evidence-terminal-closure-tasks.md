# 阶段 24 Task：Agent Harness 收敛效率、完成证据精确纠正与可解释失败终态

## 1. 文档状态与审批门禁

- 当前状态：`T24-00～T24-09 已完成；Summary 已批准，阶段 24 完成`。
- 批准的 Spec：[`24-completion-evidence-terminal-closure-spec.md`](./24-completion-evidence-terminal-closure-spec.md)，修订 1。
- Spec 审批：用户于 2026-08-30 回复“批准”，只解锁本 Task 的编写。
- Task 审批：用户于 2026-08-30 在 Task 待审批门禁回复“批准”，语义等价于“阶段 24 Task 通过”；该批准解锁 T24-00～T24-09，不解锁 T24-10 真实模型回归。
- Task 获批前不得修改 Production、测试、配置或真实 Session，不得执行真实 provider 回归、安装依赖、Git 写操作、发布或部署。
- Task 获批后解锁 T24-00～T24-09，必须按依赖顺序实施。T24-10 真实模型 + `agent-browser` 回归仍需在自动门禁后单独说明价值并取得用户独立授权。
- 本阶段不得读取或输出 `.env.local`、API Key、Authorization、provider body 或 private reasoning；不得修改真实 `.secode-data` 和真实用户工作区。

## 2. 冻结边界与实施原则

1. 严格 TDD：先建立真实模式 RED，再改实现；不得先修改 Runtime、Context 或 Tools 后补浅层字符串断言。
2. 保持六工具、串行执行、工作区隔离、SHA、symlink、审批、Plan Mode、取消、预算和 JSONL 事实源。
3. 普通 `node file.js`、`node -e`、HTTP、readiness、service、install、warning 和 stdout 自称成功仍不属于完成验证；本阶段明确把精确 `node --test` 归类为 `test`，其他 Node 形态继续拒绝。
4. Context 的 64K 是软压缩触发，不是硬失败门；`floor(contextWindow × 0.75)` 继续是硬预算。
5. Repair fingerprint 只在 run 内存中比较相同失败，绝不持久化、展示或作为跨 run contract。
6. `replace_in_file` batch 只扩展同一个工具、同一个文件和同一原始 SHA；任一校验失败时整批零写入。
7. 不缓存或回放业务模型 completion，不并行执行副作用工具，不通过跳过验证、减少事实输出、提高预算或降低断言制造效率提升。
8. 真实 Session 只用于脱敏统计和只读结构回放；正式测试使用合成事件、临时 dataDir 和临时 workspace。
9. 修改任何 Next.js/React 文件前必须阅读本机 Next.js 16.3.3 对应文档；浏览器真实环境测试按仓库要求使用 `agent-browser`。
10. 长期 dirty worktree 全部保留；每项只修改本 Task 白名单，不 reset、stash、checkout、覆盖或清理无关内容。

## 3. 冻结公共数据与算法

### 3.1 完成证据有限视图

新增内部只读视图：

```ts
interface UncoveredCompletionEvidence {
  scopes: string[];
  paths: string[];
  totalPaths: number;
  pathsTruncated: boolean;
}
```

- 路径稳定排序，最多 12 条；单条最多 256 Unicode code points，总正文最多 2048 code points。
- scopes 从完整 pending 集合计算；列表截断不丢 scope。
- 公开前拒绝绝对路径、反斜杠和 `..`；不含内容、seq、stdout、hash 或秘密。

`completion.evidence.rejected` 新增可选兼容字段：

```ts
uncoveredPaths?: string[];
uncoveredPathCount?: number;
uncoveredPathsTruncated?: boolean;
```

### 3.2 Validator repair 事实

新增 Agent 错误：

```text
AGENT_VALIDATION_NO_PROGRESS
```

新增 durable 事件：

```ts
type: "validation.repair.warning"
data: {
  iteration: number;
  verificationKind: "lint" | "typecheck" | "test" | "build";
  cwd: string;
  failedAttempts: number;
  repeatedDiagnostic: boolean;
  mutatedPaths?: string[];
  mutatedPathCount?: number;
  mutatedPathsTruncated?: boolean;
}
```

- 同一 validator 第二次及后续失败时追加 warning，供下一次 Context 和 UI/Terminal 解释当前 repair episode。
- 同一安全 fingerprint 在至少一次成功 mutation 后第 3 次出现时，以 `AGENT_VALIDATION_NO_PROGRESS` 失败。
- error/event 不公开 program 的 secret 参数、stdout、绝对路径、fingerprint 或文件内容。

### 3.3 Context 双预算

```text
hardInputBudget = floor(contextWindow × 0.75)
softCompactionTrigger = min(hardInputBudget, 64_000)
softSummaryTarget = min(floor(softCompactionTrigger × 0.125), 8_000)
```

- 可驱逐回合超过 8 且 baseline 达软触发时提前压缩。
- 最近 8 个完整回合超过软触发但低于硬预算时允许继续。
- 达硬预算时沿用既有严格失败语义。
- Context protocol/cache fingerprint 版本随语义升级；旧 durable compaction 无迁移继续恢复。

### 3.4 `replace_in_file` batch

旧输入保持：

```ts
{ path, oldText, newText, expectedSha256 }
```

新增严格互斥输入：

```ts
{
  path: string;
  expectedSha256: string;
  replacements: Array<{ oldText: string; newText: string }>;
}
```

- 1～16 项；每个 oldText 非空、在原始文件唯一匹配、相互不同且不重叠。
- 所有位置在原始字节快照上确定，再一次原子写入。
- 新 metadata 只允许 `replacementCount` 与兼容的 `replacedOccurrences`；公开参数/审批摘要只给路径、数量、正文长度/hash 和脱敏 preview，不保存完整替换正文。

### 3.5 System Prompt 与工具说明

- `SYSTEM_PROMPT_VERSION` 从 9 升为 10；只增加阶段 24 的批处理、同文件原子编辑、validator repair 和当前有效验证规则，不删除 V9 的中文、安全、端口、写入前置观察和完成证据契约。
- normal/planning/dependency_recovery 三种能力使用同一 V10 固定自然语言；planning 仍只暴露只读工具。
- `replace_in_file` 中文 description/parameter description 同步说明单项与 batch、SHA 和全有或全无语义。

## 4. 任务依赖顺序

```text
T24-00 基线、Next 文档与 RED
  → T24-01 完成证据有限路径与严格分类
  → T24-02 拒绝/失败终态及跨层投影
  → T24-03 Context 软压缩
  → T24-04 Validator repair episode
  → T24-05 单文件原子多替换
  → T24-06 V10 批处理与有效验证视图
  → T24-07 Terminal/Web 完整呈现
  → T24-08 合成 E2E 与效率差分
  → T24-09 全量门禁、Summary
  → T24-10 可选真实模型回归（独立授权）
```

## 5. 任务清单

### T24-00：实施前基线、Next.js 本地文档与 RED

**覆盖：** AC24-01～AC24-18 的修复前信号。

**允许文件：**

- 新增阶段 24 专项测试文件和合成 fixture；
- 修改既有对应测试文件，仅增加 RED；
- 本 Task 文档仅记录结果。

**禁止：** Production、配置、真实 Session、package/lock。

- [x] 重新运行 `git status --short`，记录并保留既有 dirty worktree。
- [x] 完整阅读 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`、`node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`，以及本地文档中与错误边界/流式 Route Handler 直接相关的章节；记录约束，不修改代码。
- [x] 运行现有 completion/runtime、Context compaction/provider/token estimator、Tools replace/Schema/Approval、Domain/Terminal/Client transcript 基线。
- [x] 建立完成证据 RED：build 后新建 `client/verify-integration.mjs`，普通 Node 执行成功仍 pending；纠正请求当前拿不到具体路径。
- [x] 建立失败呈现 RED：两次 stop 后当前 run.failed 不含有限行动信息，Terminal/Web 不能显示待验证文件。
- [x] 建立 Context RED：1M profile、超过 8 个完整回合、估算超过 64K 但低于 750K 时当前不产生 compaction。
- [x] 建立 repair RED：相同 tsc 失败在成功 mutation 间隔后出现 3 次，当前不会提前终止。
- [x] 建立 replace RED：同一文件同 SHA 两处替换需要两次调用且第二个同批调用 stale；新 batch Schema 当前拒绝。
- [x] 建立确定性效率基线 fixture，记录模型请求、工具调用、失败工具、估算输入 Token、compaction 和终态；不得复制真实消息/代码/路径。

**最小验证：** 旧行为测试保持通过；新增 RED 精确失败且失败原因与 Spec 一致。

**完成条件：** 五条独立反馈环均可重复、快速、无网络、无真实数据；不得用实现缺失之外的错误冒充 RED。

### T24-01：完成证据有限路径、有效验证视图与严格分类

**覆盖：** AC24-01～AC24-03、AC24-05～AC24-07。

**允许文件：**

- `lib/agent/completion-evidence.ts`
- `lib/agent/types.ts`
- `lib/agent/runtime.ts`（只接入有限视图和分类结果）
- `tests/unit/agent/completion-evidence.test.ts`
- `tests/unit/agent/runtime-completion.test.ts`

- [x] 实现 `UncoveredCompletionEvidence` 的排序、12/256/2048 上限、scope 全量和异常路径防御。
- [x] 在 run-local state 保留最多 8 条当前有效验证事实 `{kind,cwd,seq}`；后续覆盖范围 mutation 只使相关事实失效。
- [x] 精确识别 `node --test`、`node --test <paths>` 为 test；`node file.js`、`node -e`、名称含 test/verify 的脚本继续不接受。
- [x] 纠正 system message 使用同一次有限视图，列出具体 pending 路径、总数、scope、接受类别和未知脚本禁令。
- [x] 取得新覆盖时继续重置原 completion correction 无进展计数；有效验证视图不得跨 run 授权。

**最小验证：** `completion-evidence.test.ts`、`runtime-completion.test.ts`。

**完成条件：** 真实模式能明确指出 `client/verify-integration.mjs`，补跑认可 client validator 后同一 run 完成；普通 Node 仍 pending。

### T24-02：完成拒绝、失败终态与跨层兼容投影

**覆盖：** AC24-02～AC24-06、AC24-08～AC24-09。

**允许文件：**

- `lib/agent/runtime.ts`
- `lib/agent/types.ts`
- `lib/agent/schemas.ts`
- `lib/agent/projection.ts`
- `lib/domain/event.ts`
- `lib/context/history-projector.ts`
- `lib/terminal/event-renderer.ts`
- `lib/client/schemas.ts`
- `lib/client/types.ts`
- `lib/client/transcript.ts`
- 对应 Agent/Domain/Context/Terminal/Client 测试。

- [x] 为 `completion.evidence.rejected` 增加三个可选路径字段，旧事件缺失字段继续 strict 解析。
- [x] rejection、纠正 prompt 和最终 error 使用同一有限视图快照，避免 scope/path/count 漂移。
- [x] `AGENT_COMPLETION_EVIDENCE_MISSING` details 包含有限路径事实和 accepted kinds；message 明确“运行未完成、修改保留、需补验证”。
- [x] 被拒绝 completion 与语言不合规正文继续不持久化、不展示；安全 live delta 在 durable rejection/run.failed 前 flush。
- [x] Context 将新字段渲染为不可信历史事实，不能把路径或历史正文提升为 system 指令。
- [x] Terminal/Client transcript 对旧事件回退到 scope/泛化错误，不伪造具体路径。

**最小验证：** Agent schemas/projection/runtime completion、Domain event、Context history projector、Terminal renderer、Client schemas/transcript。

**完成条件：** completed/failed 语义诚实且刷新一致；路径、secret、stdout、绝对路径和被拒绝正文无泄漏。

### T24-03：Context 64K 软压缩与硬预算兼容

**覆盖：** AC24-11～AC24-13、AC24-18。

**允许文件：**

- `lib/context/types.ts`
- `lib/context/token-estimator.ts`
- `lib/context/compaction.ts`
- `lib/context/provider.ts`
- `lib/context/fallback-summary.ts`（仅适配新的 selection 预算确有需要时）
- 对应 Context unit/integration 测试与合成长历史 fixture。

- [x] 新增明确命名的 64K soft trigger 和最多 8K summary target；硬预算计算保持 75%。
- [x] 重构 selection 接收 soft/hard 两套预算：软目标不可达但仍低于 hard 时返回未压缩 baseline，不抛错。
- [x] 可驱逐回合超过 8 时在 soft trigger 提前 compaction；摘要与最近 8 回合最终仍需低于 hard budget。
- [x] 硬预算、summary timeout、deterministic fallback、父取消、历史非法和 projected recent rounds 既有语义不回归。
- [x] Context cache protocol/fingerprint 升级；旧 durable summary 继续复用，旧 JSONL 零迁移。
- [x] 32K、64K、1M profile 覆盖短历史、软触发、硬保留超过 soft、达到 hard、二次 compaction 和 fallback。
- [x] 合成真实规模差分断言：可压缩 baseline ≥64K 时下一业务请求使用 durable summary，估算输入低于原 baseline；不冻结 provider 随机 Token。

**最小验证：** Context compaction/provider/token-estimator/fallback/runtime-integration 专项。

**完成条件：** 1M profile 不再等到 750K 才压缩；短历史和硬预算安全不回归。

### T24-04：Validator repair episode 与结构化无进展失败

**覆盖：** AC24-14～AC24-15、AC24-18。

**允许文件：**

- 新增 `lib/agent/validation-repair.ts`
- `lib/agent/runtime.ts`
- `lib/agent/types.ts`
- `lib/agent/errors.ts`
- `lib/agent/schemas.ts`
- `lib/agent/projection.ts`
- `lib/domain/event.ts`
- `lib/context/history-projector.ts`
- 新增/修改对应 Agent、Domain、Context 测试。

- [x] 纯函数规范化 validator command key，最多 8 个 run-local episode。
- [x] fingerprint 只使用已脱敏/截断结果的内存摘要；不进入事件、错误、Context、日志或公共类型。
- [x] 跟踪同一 validator 的 failedAttempts、repeated count 和两次之间成功 mutation 路径；第二次及后续失败追加 `validation.repair.warning`。
- [x] warning 的相对路径复用 12/256/2048 有界投影；公开 cwd 同样拒绝绝对/穿越。
- [x] 第三次相同 fingerprint 且期间至少有 mutation 时，以 `AGENT_VALIDATION_NO_PROGRESS` 失败；没有 mutation 的直接重复仍受既有重复工具错误保护。
- [x] 不同 fingerprint、不同 validator、最终成功、取消、总时限、语言重述和 completion correction 交错均有确定语义。
- [x] repair 提示要求集中诊断/修复，但不自动执行、授权、禁止读取或重置预算。

**最小验证：** 新 validation-repair 单元、Runtime limits/tools/completion/language/cancellation、Domain/Context 投影。

**完成条件：** 相同诊断的修改循环在第 3 次验证失败时早于全局时限终止；真实进展不误杀。

### T24-05：`replace_in_file` 单文件原子多替换

**覆盖：** AC24-16～AC24-17。

**允许文件：**

- `lib/tools/replace-in-file.ts`
- `lib/tools/file-content.ts`（仅共享原子内容辅助）
- `lib/tools/schemas.ts`
- `lib/tools/types.ts`
- `lib/tools/registry.ts`
- `lib/tools/dependencies.ts`（仅调用签名适配确有需要时）
- `lib/approval/assessment.ts`
- `lib/approval/summary.ts`
- 对应 Tools/Approval/Domain 测试。

- [x] 用 strict union 保持旧单项与新 batch 二选一，拒绝混合字段、空 batch 和第 17 项。
- [x] 在原始文本中一次定位全部 oldText，逐项唯一、互不重复、不重叠；按原始 offset 稳定应用。
- [x] expected SHA、真实父目录、symlink、敏感路径、编码/字节上限和原子 rename 沿用既有安全实现。
- [x] 任一失败时文件内容和 SHA 不变；成功只写一次并返回 replacementCount。
- [x] public arguments、工具 summary、审批风险和事件不暴露完整 old/new；批量中的敏感字段继续统一脱敏。
- [x] completion evidence 将 batch 记为一个 path mutation；工具预算和审批只计一次调用。

**最小验证：** replace/file-content/schemas/registry/output/security 与 approval assessment/summary 专项。

**完成条件：** README 两处替换可在一个工具调用中完成且零 FILE_STALE；所有旧调用与安全矩阵通过。

### T24-06：System Prompt V10、工具批处理与有效验证提示

**覆盖：** AC24-03、AC24-06～AC24-07、AC24-15、AC24-17。

**允许文件：**

- `lib/context/system-prompt.ts`
- `lib/context/message-renderer.ts`（仅固定 repair/validation facts 布局）
- `lib/tools/registry.ts`
- `lib/tools/schemas.ts`（只调整 description）
- `lib/agent/runtime.ts`（只接入 current evidence/repair system note）
- Context model-language/security、Tools Schema、Agent request-capture 测试。

- [x] System Prompt V9 → V10，并更新固定版本断言。
- [x] 固定说明：独立只读/不同文件可合批；依赖前序结果不可合批；同文件 SHA 编辑使用 atomic replacements 或等待新 SHA。
- [x] 固定说明：首次创建前核对依赖接口，validator 失败后集中修复当前诊断，未知 Node 脚本不能替代认可验证。
- [x] 当前有效验证视图最多 8 条，只在有事实时注入下一请求；后续 mutation 失效后不再展示。
- [x] 不要求模型重复有效同 scope validator；不同证据类别、用户明确更强验收和后续 mutation 例外如实说明。
- [x] normal/planning/dependency_recovery 与 DeepSeek/LongCat/Generic 请求捕获全部为简体中文固定文案，代码/路径/命令逐字保真。

**最小验证：** Context model-language/security/runtime-integration、Tools schemas、Agent runtime completion/plan/dependency tests。

**完成条件：** 模型可见规则足以解释哪些调用应合批、哪些必须串行，以及当前还缺什么；不扩大工具能力。

### T24-07：Repair 与完成终态的 Terminal/Web 呈现

**覆盖：** AC24-04～AC24-05、AC24-08～AC24-09、AC24-13～AC24-15。

**允许文件：**

- `lib/terminal/event-renderer.ts`
- `lib/terminal/application.ts`（仅状态摘要确有需要时）
- `lib/client/schemas.ts`
- `lib/client/types.ts`
- `lib/client/transcript.ts`
- `lib/client/event-state.ts`（仅 durable projection）
- `app/ui/workbench/transcript.tsx`
- `app/ui/workbench/details-drawer.tsx`
- 对应 Terminal/Client/UI 单元与 E2E 测试。

- [x] 修改 React/Next 文件前完成 T24-00 本地 Next 文档核对。
- [x] Terminal 显示 completion rejection、validation repair 次数/类别/cwd/有限路径和最终行动说明。
- [x] Web transcript 以有限系统事实呈现 warning/rejection/run.failed；不把它们伪装成 assistant 消息或成功。
- [x] Details 展示当前 durable 失败事实；刷新旧事件缺字段时安全降级。
- [x] `aria-live`、键盘、响应式和 `prefers-reduced-motion` 既有行为不回归；不新增卡片式永久 Inspector。
- [x] Context Cache warm、Provider cache、Prompt usage 和 durable compaction 继续分区展示，不宣称 warm 等于 Token 命中。

**最小验证：** Terminal renderer/application、Client schemas/transcript/event-state/view-model、相关 UI component tests。

**完成条件：** 用户能看见“哪里未验证/哪个 validator 在循环/为何失败/如何继续”，同时不看到秘密、stdout 或被拒绝总结。

### T24-08：合成浏览器 E2E 与 Harness 效率差分

**覆盖：** AC24-01～AC24-18。

**允许文件：**

- `tests/e2e/agent-workflow.spec.ts`
- 新增 `tests/e2e/harness-efficiency.spec.ts`
- `tests/e2e/support/fake-model-server.ts`
- `tests/e2e/support/runtime-manifest.ts`（仅 fixture 配置）
- `tests/e2e/fixtures.ts`（仅临时 fixture）
- 新增/修改 `tests/manual/stage24-fixture.ts`（不得含凭据）
- 阶段 24 专项 integration fixture。

- [x] 假模型完整轨迹：后写验证脚本 → 普通 Node 不清账 → 首次 rejection 显示具体路径 → client build 清账 → 同 run completed。
- [x] 负轨迹：两次 stop 产生可解释 completion failure；相同 validator fingerprint 第三次产生 validation no-progress failure。
- [x] 原子多替换通过 production tool/API/approval 链修改临时文件两处，零 stale、一次 mutation、一次工具预算。
- [x] 1M profile 合成长历史通过 production Context 产生 durable compaction；刷新和后续 run 复用摘要，不重复历史副作用。
- [x] 效率差分 fixture 固定断言：可压缩上下文在 compaction 后估算低于 64K；同文件两处编辑从“两个调用且一个 stale”降为一个成功调用；相同诊断循环最迟第三次 validator 失败收口。
- [x] 记录模型请求/工具/失败工具/估算 Token/compaction，但不为自然模型冻结绝对 Token 或价格。
- [x] 使用 `agent-browser` 启动真实本地环境做可见 gut-check：完成纠正、失败终态、刷新恢复、详情和 console/network；不只依赖 Playwright 断言。
- [x] 所有 dataDir/workspace/端口随机隔离，结束后精确清理本任务资源，不触碰真实 `.secode-data` 或用户项目。

**最小验证：** 专项 Playwright + `agent-browser` 真实页面检查；邻接 agent workflow/language/plan/approval/cancel/recovery/history/session deletion E2E。

**完成条件：** 用户报告轨迹在合成 production 链中收敛，效率指标改善且安全/恢复/终态一致。

### T24-09：全量自动门禁、审计与 Summary

**覆盖：** AC24-10、AC24-18 及全阶段。

**允许文件：**

- 不新增业务修改；失败修正只能回到对应 T24 任务白名单。
- `docs/development/24-completion-evidence-terminal-closure-tasks.md`
- `docs/development/24-completion-evidence-terminal-closure-summary.md`
- `docs/development/README.md`

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm test:coverage`
- [x] `pnpm test:e2e`
- [x] `SECODE_NEXT_DIST_DIR=.next-stage24-webpack pnpm exec next build --webpack`
- [x] `SECODE_NEXT_DIST_DIR=.next-stage24-turbopack pnpm exec next build --turbopack`
- [x] `git diff --check`
- [x] 使用 `agent-browser` 对最终本地 production 路径再做一次真实环境检查，记录页面、console、network 和终态，不读取密钥。
- [x] 扫描阶段新增提示、事件、错误、fixture 和 UI，不含 `.env.local` 值、Authorization、绝对真实路径、provider body、stdout fixture secret 或 private reasoning。
- [x] 核对旧 JSONL fixture、真实 Session 和 package/lock 未修改；核对不存在 skip/only、调高预算、降低 coverage/assertion 或业务 completion cache。
- [x] 精确清理 `.next-stage24-webpack`、`.next-stage24-turbopack`、临时端口/服务/dataDir/workspace；不清理用户已有文件。
- [x] 如实记录每个失败、根因、修正和完整重跑，生成 Summary 并停止等待审批。

任一门禁失败且未在批准白名单内修复时，阶段保持阻塞，不生成成功 Summary。构建若机械改写 `tsconfig.json`，只允许精确恢复本阶段构建引入的行，不覆盖既有内容。

**完成条件：** 全部门禁真实通过、效率差分成立、无遗留资源和安全偏差；Summary 状态为待用户审批。

### T24-10：可选隔离真实模型 + `agent-browser` 回归

**覆盖：** 真实 provider 对精确纠正、软压缩和批处理提示的响应质量；不替代自动门禁。

**门禁：** T24-09 自动验证完成后，先向用户说明模型、费用、一次性目标、临时目录、敏感信息边界和停止点；只有用户再次明确批准才执行。

**允许文件：**

- `tests/manual/stage24-fixture.ts`
- `docs/development/24-agent-harness-terminal-acceptance.md`
- Task/Summary/README 只记录脱敏结果。

- [ ] 使用新临时 dataDir、workspace、随机 loopback 端口和无外部依赖 fixture；不得复用真实 Session/项目。
- [ ] 真实任务必须自然产生“已验证后又新增非文档验证脚本”，观察模型收到具体路径后补跑认可 validator 并在同一 run 完成。
- [ ] 观察独立读取/不同文件工具是否合理合批、同文件是否使用 batch replace、是否避免重复有效 validator。
- [ ] 若历史达到软阈值，核对 durable compaction 和后续请求；若任务自然未达到，不人工灌入真实付费 Token，使用自动 fixture 作为该项证据。
- [ ] 使用 `agent-browser` 检查实时 transcript、repair/rejection、详情、终态和刷新恢复。
- [ ] 运行后立即停止，不挑选多次结果；失败如实记录，不自动重试，不改 Production。

**完成条件：** 获批的一次真实运行满足目标则记录通过；否则阶段保持真实阻塞或在 Summary 中记录外部/模型质量限制，不伪造成功。

## 6. 文件白名单汇总

### 6.1 预计新增

```text
lib/agent/validation-repair.ts
tests/unit/agent/validation-repair.test.ts
tests/e2e/harness-efficiency.spec.ts
tests/manual/stage24-fixture.ts
docs/development/24-completion-evidence-terminal-closure-tasks.md
docs/development/24-completion-evidence-terminal-closure-summary.md
docs/development/24-agent-harness-terminal-acceptance.md（仅 T24-10 获批时）
```

### 6.2 预计修改

```text
lib/agent/completion-evidence.ts
lib/agent/runtime.ts
lib/agent/types.ts
lib/agent/errors.ts
lib/agent/schemas.ts
lib/agent/projection.ts
lib/domain/event.ts
lib/context/system-prompt.ts
lib/context/message-renderer.ts
lib/context/history-projector.ts
lib/context/provider.ts
lib/context/compaction.ts
lib/context/token-estimator.ts
lib/context/types.ts
lib/context/fallback-summary.ts（仅预算适配需要）
lib/terminal/event-renderer.ts
lib/terminal/application.ts（仅状态摘要需要）
lib/tools/replace-in-file.ts
lib/tools/file-content.ts（仅原子辅助需要）
lib/tools/schemas.ts
lib/tools/types.ts
lib/tools/registry.ts
lib/tools/dependencies.ts（仅签名适配需要）
lib/approval/assessment.ts
lib/approval/summary.ts
lib/client/schemas.ts
lib/client/types.ts
lib/client/transcript.ts
lib/client/event-state.ts（仅 durable projection 需要）
app/ui/workbench/transcript.tsx
app/ui/workbench/details-drawer.tsx
上述模块的直接 unit/integration/e2e 测试
docs/development/README.md
```

### 6.3 明确禁止

```text
lib/storage/** Production 实现
lib/model/**
lib/workspace/**
app/api/**
package.json
pnpm-lock.yaml
.env*
真实 .secode-data/**
真实用户工作区
```

若实施证明必须修改禁止范围、增加第七工具、改变跨 run 授权、并行副作用工具或修改公共 provider/Storage 协议，立即停止并回退 Spec 修订，不得在 Task 内临时决定。

## 7. 失败处理与回退

- RED 未复现：停止，修正 feedback seam，不猜测实现。
- Context 软压缩导致短历史额外摘要或硬保留误失败：回到 T24-03，不提高 64K 或减少 8 回合掩盖。
- Repair episode 误杀变化诊断：回到 T24-04 修正 fingerprint/episode 状态，不提高全局预算或删除保护。
- Batch replace 出现部分写入：立即停止，保留失败 fixture，修正为原始快照全量校验后单次原子写；不得降级为逐项写。
- 新事件破坏旧 JSONL：保持字段可选并修正 Schema/投影；不迁移或重写旧事件。
- UI 需要修改未列出的公共 API：停止并回退 Task/Spec 门禁。
- 任意 secret/绝对路径/被拒绝正文泄漏：视为阻断，先修复安全问题并完整重跑相关层。
- 不使用 `git reset --hard`、checkout、stash、宽泛删除或全仓格式化回退。

## 8. Task 审批门禁

**当前状态：T24-00～T24-09 已完成；Summary 已批准，阶段 24 完成。**

- 本 Task 只拆分已批准 Spec 修订 1，没有修改 Production、测试或配置。
- 用户于 2026-08-30 已以语义等价回复批准本 Task，T24-00～T24-09 的开发与自动验证已解锁。
- T24-10 真实模型回归不随 Task 批准自动解锁，仍需 T24-09 后独立授权。
- T24-00～T24-09 已按顺序实施并完成自动门禁；2026-08-30 已生成 Summary。
- 用户于 2026-08-31 明确批准此前全部待审批文档并确认问题已修复；阶段 24 Summary 已批准，阶段正式完成。
- T24-10 未执行，也未被追认为通过；它不再作为阶段完成门禁。未来若仍要运行真实 provider，必须重新取得独立授权。
