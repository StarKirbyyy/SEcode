# 阶段 24 Spec 修订 1：Agent Harness 收敛效率、完成证据精确纠正与可解释失败终态

## 1. 文档状态与审批门禁

- 当前状态：`修订 1 已批准`。
- 前置阶段：阶段 23 Summary 已于 2026-08-30 获用户明确批准，阶段 23 正式完成。
- 立项记录：用户报告最新真实 Agent 在总结阶段以 `AGENT_COMPLETION_EVIDENCE_MISSING` 失败并像被直接截断；只读诊断完成后，用户回复“通过并同意”，明确批准阶段 23 Summary，并同意新开本阶段修复。
- 修订记录：初版 Spec 待审批期间，用户要求从 Harness 工程角度评估真实运行效率，并在量化结果基础上修订阶段 24 Spec。修订 1 增加 Context 软压缩、验证修复循环、同文件原子多替换和批处理约束；初版待审批内容由本修订整体取代。
- 审批记录：用户于 2026-08-30 回复“批准”，语义等价于“阶段 24 Spec 修订 1 通过”；该批准只解锁阶段 24 Task 的编写，不构成 Task 批准或开发授权。
- 本次同意只授权只读观察、生成本 Spec 和同步流程索引，不等价于批准本 Spec。
- Spec 获批前不得生成阶段 24 Task，不得修改 Production、测试、配置、真实 Session 或真实用户工作区。
- 原文档、视频与最终提交顺延为阶段 25；阶段 19～22 的既有失败事实与无 Summary 状态不追认、不覆盖。

## 2. 阶段目标与需求映射

本阶段同时解决两个相互放大的 Harness 缺口：一是在不放宽完成证据安全门的前提下，使模型明确知道最后一次相关变更后仍未验证的具体文件，并让证据无法收敛的 run 以可见、有限、可操作的失败终态结束；二是降低完整历史重复发送、单工具单回合、同文件微补丁、重复验证和修复循环造成的模型请求、工具调用与 Token 浪费。

| 需求 ID | 本阶段解释 |
| --- | --- |
| FR-004 | Agent 在完成声明被拒绝后能够依据结构化待验证事实继续调用工具，取得证据后在同一 run 正常收口。 |
| FR-005 | transcript、详情和 Terminal 必须显示完成证据拒绝、待验证文件及最终失败原因，不能表现为无解释截断。 |
| FR-008 | 新事件字段保持可选，旧 JSONL 无迁移恢复；失败 run 刷新后仍能解释当时缺失的证据。 |
| FR-012 | 模型可见中文契约必须明确“最后一次非文档写入之后再验证”，以及临时验证脚本本身也是待验证变更。 |
| FR-015 | 模型请求数与工具调用数继续分别统计，并可用确定性轨迹证明 Harness 优化减少不必要请求而不改变预算语义。 |
| NFR-003 | 完成证据失败必须结构化、脱敏、有限且不使 Runtime 崩溃。 |
| NFR-004 | 重复错误、重复验证和无进展修复循环必须在局部有界，不拖到全局时限或 300 次工具上限。 |
| NFR-008 | 真实事件根因、RED、修复、回归与剩余风险进入阶段文档。 |
| NFR-015 | 持续取得真实进展的长任务不因新增效率提示或软压缩错误终止；软阈值不能变成新的模型请求硬上限。 |
| NFR-018 | 完成前只采信发生在相关变更之后的真实 lint、typecheck、test 或 build 证据。 |
| NFR-019 | 工具输出投影继续保持单项/总量预算；软压缩不能恢复已裁剪正文或破坏完整工具回合。 |
| NFR-020 | 长历史继续 run 时应复用 durable 摘要和近期完整回合，避免每次请求重复发送全部早期轨迹。 |
| SEC-006 | 待验证信息不得包含绝对路径、文件内容、命令输出、凭据或 provider 私有正文。 |

本阶段不改变这些既有需求的含义，不新增工具、权限或成功条件。

## 3. 只读观察与确定性复现

### 3.1 观察范围

- `docs/development/00-process.md`、`README.md`、`01-requirements.md` 与阶段 20、21、23 最新 Spec/Task/Summary。
- `.secode-data/sessions/82b8d34a-2d3a-41dc-b47b-44492ab00abf/events.jsonl` 中目标 run 的事件类型、seq、有限公开工具参数、结构化结果和错误码；未读取或记录 `.env.local`、凭据或 provider 私有 body。
- `lib/agent/completion-evidence.ts`、`lib/agent/runtime.ts`、事件/投影/Terminal/Client transcript 与现有完成证据测试。
- 专项回归命令：`pnpm exec vitest run tests/unit/agent/completion-evidence.test.ts tests/unit/agent/runtime-completion.test.ts`，2 个文件、28 项通过。

### 3.2 真实失败时间线

目标 run 为 `cd960cbb-9098-4451-9afe-00c7859099ee`：

```text
seq 693～695  client typecheck 成功
seq 699～703  client build 成功
seq 736～738  新建 client/verify-integration.mjs
seq 742～746  node verify-integration.mjs 成功，但属于未知脚本
seq 840       第一次 completion.evidence.rejected，仅公开 client scope
seq 843       一次英文总结被语言门拒绝
seq 846       第二次 completion.evidence.rejected，仍仅公开 client scope
seq 849       run.failed / AGENT_COMPLETION_EVIDENCE_MISSING
```

`client/verify-integration.mjs` 的写入晚于最后一次 client build。它自身成功执行证明了联调脚本当次退出为 0，但现有冻结分类不把任意 `node <script>` 猜成 lint/typecheck/test/build，因此该路径保持 pending。这个严格判定符合阶段 20/21 的已批准边界。

### 3.3 确定性反馈信号

现有测试已经固定两个关键事实：

1. `node server.js`、HTTP、service readiness、失败命令和未知程序不能清除待验证状态。
2. 模型连续两次只输出完成声明时，Runtime 产生两次拒绝后以 `AGENT_COMPLETION_EVIDENCE_MISSING` 失败，且不把被拒绝正文持久化为 final assistant 事实。

Task 必须把真实模式转成新的 RED：最后一次已接受 build 后新增 `client/verify-integration.mjs`，成功运行该未知脚本，模型首次尝试总结；模型请求中应得到具体待验证路径并补跑认可验证。修复前该断言必须失败，且当前失败终态只含泛化 scope/错误的断言必须形成 RED。

### 3.4 Harness 效率量化

同一 Session 三个 run 的脱敏统计如下：

| Run | 模型请求 | 工具调用 | 失败工具 | Prompt Token | 总 Token | 终态 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 首次构建 | 73 | 95 | 12 | 2,202,533 | 2,235,130 | `AGENT_COMPLETION_EVIDENCE_MISSING` |
| 继续执行 | 48 | 50 | 6 | 3,036,132 | 3,056,108 | `AGENT_COMPLETION_EVIDENCE_MISSING` |
| 后续总结 | 1 | 0 | 0 | 70,319 | 71,364 | `run.completed` |

合计为 122 次模型请求、145 次工具调用、18 次失败工具、5,308,984 Prompt Token 和 5,362,602 总 Token。两个主要执行 run 用时约 24 分钟但均失败；失败工具率约 12.4%。121 个执行模型回合中有 91 个只调用一个工具，占 75.2%。整个 Session 没有产生 `context.compacted`。

Provider 报告约 2,995,456 cached Prompt Token，但仍有约 2,313,528 cache miss Prompt Token。本地 Context Cache 的 warm 只复用事件投影计算，随后仍会渲染并发送完整 messages，不能视为 Prompt Token 已省略。

### 3.5 已确认的局部修复循环

1. 第一次 server typecheck 失败后，`cart.ts`/`orders.ts` 围绕 reduce、Prisma payload 和 transaction 类型进行了约 12 次局部替换，经历 3 次失败 typecheck 后才通过；中间出现误删再恢复 import 和多次改变根因判断。
2. `api-smoke.ts` 共执行 3 次，前两次失败；首次诊断错误地检查订单列表和无认证 curl，随后才定位到创建订单响应没有 `items`、测试断言本身错误。
3. `CartPage.tsx` 发生 4 次写请求：planning phase 被拒、首次创建、缺少覆盖语义被拒、携带 SHA 覆盖成功。
4. README 同批两个 `replace_in_file` 使用同一旧 SHA，第一项成功后第二项必然 `FILE_STALE`，随后再次请求才完成。
5. 前端 build 和 8/8 联调已通过后又追加 dist listing、server build、脚本修正、manifest 重读、根安装、目录 listing 和 health，说明 Harness 只阻止未验证完成，没有抑制重复或扩张式收尾。

## 4. 已确认根因与非根因

### 4.1 根因一：纠正信息粒度不足

Runtime 内部已经持有逐路径 `pendingMutations`，但 `getUncoveredCompletionScopes()` 只投影第一层 scope。纠正 system message 和 durable rejection 都只告诉模型 `client`，没有指出真正未验证的是后写入的 `client/verify-integration.mjs`。模型根据已有 typecheck/build 事实错误推断 client 已全部覆盖，重复输出总结。

### 4.2 根因二：失败收口缺少面向用户的行动信息

两次无进展 stop 后直接抛出泛化 `AGENT_COMPLETION_EVIDENCE_MISSING`。被拒绝的模型正文按安全契约不持久化，这一点正确；但最终错误没有携带有限待验证路径、已接受验证类型或下一步，因此 UI/Terminal 只能显示泛化错误，形成“总结突然截断”的体验。

### 4.3 非根因

- 不是阶段 23 已修复的 Web 分页或终态协调问题：`run.failed` 已真实持久化，刷新能恢复。
- 不是 scope 合并账本再次丢失：server/client 分别验证与 mutation seq 判定按阶段 21 设计工作。
- 不是 `node verify-integration.mjs` 结构化结果丢失：其 `ok=true/exitCode=0` 已保存，只是按安全规则不属于接受类别。
- 不是语言门导致证据丢失：语言重述消耗一次请求，但不会清账、重复工具或把失败变成功。

### 4.4 根因三：Context 只有硬容量阈值，没有效率阈值

DeepSeek 默认 `contextWindow=1_000_000`，现有 `CONTEXT_COMPACTION_THRESHOLD_RATIO=0.75`，因此估算上下文接近 750,000 Token 前不会压缩。真实请求约 60,000～70,000 Prompt Token，远未触发硬阈值，却已经在几十次请求中形成数百万 Token 重复发送。

现有 Context Cache 缓存 `ContextHistoryProjection`，减少 JSONL 重投影 CPU/IO；它不会缩短发给 provider 的消息。这是命名可观测性与经济效率之间的缺口，不是 provider cache 解析错误。

### 4.5 根因四：无进展保护只识别连续相同工具

当前保护在成功写工具后重置连续工具错误，因此无法识别以下典型循环：

```text
同一 validator 失败
  → 修改成功
  → 同一 validator 再失败
  → 再修改成功
  → 同一 validator 仍失败
```

这类循环没有连续相同失败，却可能在同一 scope 消耗大量模型请求和微补丁。Harness 没有按验证命令维护 repair episode，也没有把失败次数、相同诊断和已修改路径作为局部纠正事实反馈模型。

### 4.6 根因五：单替换 SHA 契约与同批多编辑冲突

`replace_in_file` 的单目标唯一替换和 expected SHA 保证了并发安全，但模型在同一 completion 对同一文件发出多个替换时，所有调用基于同一 SHA；工具串行执行后，第一项会使后续调用必然 stale。Harness 缺少同一文件的一次原子多替换表达，提示词也没有明确区分“可并批的独立文件”和“不可并批的同文件 SHA 变更”。

### 4.7 根因六：完成账本只描述 pending，没有抑制重复验收

Runtime 能阻止“变更后完全没有认可验证”的成功，但没有向模型提供紧凑的当前有效证据视图。模型会重复检查已经有效且未被后续写入失效的 build、health 或产物，并在总结前不断自行追加验收项。

## 5. 范围

### 5.1 范围内

1. 从 run-local pending mutation ledger 生成有界、规范化、工作区相对的待验证路径视图。
2. completion correction system message 明确列出待验证路径、总数、所属 scope 和允许的验证类型。
3. `completion.evidence.rejected` 增加向后兼容的可选有限路径字段，并在 Context、Terminal、HTTP、Client/Web 中一致投影。
4. `AGENT_COMPLETION_EVIDENCE_MISSING` 终态携带同一有限事实，transcript 与详情显示中文、可操作的失败收尾。
5. 保留严格分类：任意 Node/脚本、install、HTTP、readiness、service、warning 或 stdout 自称成功仍不能清账。
6. 补充标准 `node --test` 的分类评估；只有 Task 证明其参数结构确定且不依赖 stdout/文件名猜测时，才可作为 `test`，普通 `node file.js` 永远不接受。
7. 强化模型固定契约：创建或修改非文档验证脚本后，必须再运行覆盖其 cwd 的认可验证；完成声明前以当前 pending 事实为准。
8. 建立同一 run 成功纠正、两次无进展失败、语言重述交错、多个 pending 路径和旧事件恢复的确定性回归。
9. 将 Context 的硬容量预算与软效率触发分离；对可压缩长历史提前生成 durable 摘要，同时保留最近完整回合和硬窗口安全边界。
10. 为认可 validator 建立 run-local repair episode，识别相同验证命令在写入间隔后的重复失败，并提供局部诊断/有界停止。
11. 为 `replace_in_file` 增加向后兼容的单文件原子多替换输入，避免同批同文件 SHA stale；仍保持工具总数为六个。
12. 强化工具批处理契约：独立只读或不同文件操作应合理合批；同文件多个变更必须使用一次原子多替换或一次带最新 SHA 的覆盖。
13. 向模型提供紧凑的当前有效验证事实和未覆盖范围，抑制没有后续 mutation 的重复 build/typecheck/test。
14. 增加 Harness 效率统计与确定性差分验收，证明减少请求/工具/Token 不是通过跳过验证、扩大工具输出或降低断言制造。

### 5.2 范围外

- 不把未知脚本、任意文件名中的 `test`/`verify`、HTTP 断言、service readiness、安装命令或模型正文提升为验证证据。
- 不自动替模型选择或执行项目命令，不自动安装依赖，不自动批准危险工具。
- 不把缺失证据降级为 `run.completed`，不保存被语言门或完成门拒绝的模型总结。
- 不跨 run 持久化可执行授权，不修改用户工作区，不回写或伪造失败 run 的历史终态。
- 不新增第七个工具；`replace_in_file` 只允许向后兼容扩展，同一请求仍只作用于一个工作区内文件。
- 不改变模型 provider 协议、Session 绑定、审批、Plan Mode、取消、全局预算或 JSONL 事实源。
- 不把软 Context 阈值变成新的硬失败门；最近完整回合无法压到软目标时仍可在硬预算内继续。
- 不处理阶段 19～22 的其他失败，不制作最终文档/视频，不 commit、push、发布或部署。

## 6. 设计规格

### 6.1 有界待验证路径视图

新增 completion-evidence 纯函数，从 `pendingMutations` 产生只读视图：

```ts
interface UncoveredCompletionEvidence {
  scopes: string[];
  paths: string[];
  totalPaths: number;
  pathsTruncated: boolean;
}
```

固定约束：

- 路径使用已有规范化工作区相对路径，不含 `..`、绝对前缀、文件内容或 mutation seq。
- 按相对路径稳定排序；最多公开 12 条，单条最多 256 个 Unicode code points，总路径正文最多 2048 个 Unicode code points。
- 超限时只截断公开列表并保留 `totalPaths/pathsTruncated`，不得把内容哈希、绝对路径或剩余文件名塞入错误。
- scopes 从完整 pending 集合计算，不能因路径列表截断漏掉 scope。
- ledger 仍只属于当前 run 内存态；公开视图是解释事实，不是授权或第二事实源。

### 6.2 精确纠正提示

首次或第二次 completion rejection 后，下一次业务模型请求追加固定中文 system message，必须包含：

- “仍有 N 个最后变更后未验证的路径”；
- 有界路径列表及未完整展示提示；
- 去重 scope；
- 接受类型 `lint/typecheck/test/build`；
- 明确普通 `node <script>`、HTTP、readiness、install 和 stdout 不能清账；
- 指示只对未覆盖 scope 调用 `run_process`，看到成功结构化 tool result 后再总结；
- 若项目没有可用验证命令，必须保持失败而非宣称完成。

提示只解释现有状态，不重复工具、不生成审批、不重置 continuation 之外的预算，也不向模型暴露绝对路径或文件内容。

### 6.3 严格证据分类

现有 `VerificationKind` 和 cwd 覆盖语义保持：

- package manager 的 lint、typecheck/check、test、build；
- 已冻结的直接 `tsc --noEmit`、vitest、jest、playwright test、pytest、cargo test、go test；
- 可选新增 `node --test`，必须只按精确 program/args 结构识别，不能按目标文件名、stdout 或注释识别；
- 所有证据必须 `result.ok=true`、oneshot、发生在对应 mutation seq 之后，cwd 覆盖路径。

真实轨迹中的 `node verify-integration.mjs` 仍不清账。预期恢复路径是模型收到具体文件后，补跑 client cwd 内已经存在的认可 lint/typecheck/test/build；不是放宽分类来追认旧结果。

### 6.4 Durable 拒绝与失败终态

`completion.evidence.rejected` 增加全部可选字段：

```ts
uncoveredPaths?: string[];
uncoveredPathCount?: number;
uncoveredPathsTruncated?: boolean;
```

兼容约束：

- 旧事件缺失字段继续 strict 解析、恢复和展示；不迁移、不改写 JSONL。
- 新字段与 `uncoveredScopes/acceptedKinds` 来自同一次快照，跨 Domain、Agent、Context、Terminal、Server、Client 保持一致。
- Context history 将其渲染为不可信历史事实，不允许历史事件注入 system 指令。

当两次无进展 stop 或局部纠正预算耗尽时，仍写 `run.failed / AGENT_COMPLETION_EVIDENCE_MISSING`，但错误 message/details 必须包含有限中文行动说明：哪些相对路径仍未验证、接受哪些验证、修改仍保留且 run 未成功。不得包含被拒绝模型正文、stdout、绝对路径或内部异常。

### 6.5 Terminal 与 Web 呈现

- Terminal 在 rejection 时显示纠正次数、待验证 scope 和有限路径；终态明确显示“运行未完成，修改保留，缺少变更后验证”。
- Web transcript 在 durable rejection 与 `run.failed` 到达前 flush 已允许的 live delta；被拒绝总结不显示。
- 失败行和详情显示有限路径、总数、接受类别和可继续建议；刷新后完全由 durable 事件恢复。
- 不新增成功 assistant message，不把 Runtime 固定错误伪装成模型总结，不建立第二状态机。
- 旧失败事件没有路径字段时继续显示现有 scope/泛化错误，不伪造具体文件。

### 6.6 预算、语言与终态顺序

- 两次无进展 stop、4 次额外模型请求或 8 次工具调用的局部上限保持不变；取得路径覆盖进展继续按阶段 21 规则重置。
- 语言重述不算有效覆盖，不增加 completion rejection 次数；带工具调用的不合规正文仍只抑制正文并执行工具一次。
- 最终顺序固定为：可见安全进度 flush → durable completion rejection 或 run.failed → transport 收口；不得先发布成功或留下永久 executing。
- 取消、总时限、模型协议失败继续保留各自优先错误，不被 completion fallback 覆盖。

### 6.7 Context 硬预算与软效率触发

Context 预算拆为两个概念：

```text
hardInputBudget = floor(contextWindow × 0.75)
softCompactionTrigger = min(hardInputBudget, 64_000)
```

固定语义：

1. `hardInputBudget` 继续负责模型窗口安全，既有 75% 保留比例不变。
2. 当 projected baseline 达到 `softCompactionTrigger` 且存在超过 8 个可驱逐完整回合时，提前选择 compaction；摘要目标按软触发的 12.5% 计算，最多 8,000 Token，不再按百万窗口生成 93,750 Token 目标。
3. 仍保留最近 8 个完整 assistant/tool 回合、初始目标、最新 durable summary 和未解决错误；不拆 assistant/tool 配对，不恢复已裁剪 tool output。
4. 若最近 8 个硬保留回合本身超过软触发但低于 hard budget，允许本轮继续，不以 `CONTEXT_BUDGET_EXCEEDED` 失败；后续依靠新的完整回合自然推进下一次可压缩机会。
5. 达到 hard budget 时继续使用既有严格选择与错误语义；软压缩失败可使用既有确定性 fallback，但父取消、历史非法和硬预算不能被降级绕过。
6. durable `context.compacted` 继续作为摘要事实；本地 Context Cache fingerprint 必须包含新的效率协议版本，旧 cache 只失效内存项，不迁移 JSONL。
7. UI 必须继续区分 Provider cached Token 和 Local Context Cache；新增“提前压缩”统计只能来自 durable compaction，不把 warm projection 宣称为 Token 命中。

64,000 是针对本次“单次约 60,000～70,000 Prompt Token、几十轮重复发送、零压缩”的具体失败设置的效率上限，而不是模型上下文能力声明。Task 必须用 32K/64K/1M profile 和短/长历史验证边界。

### 6.8 Validator repair episode 与无进展收敛

Runtime 为认可验证命令维护 run-local、非授权的 repair episode：

```ts
interface ValidationRepairEpisode {
  commandKey: string;
  cwd: string;
  failedAttempts: number;
  repeatedFingerprintCount: number;
  mutatedPathsSinceLastAttempt: string[];
}
```

规则：

1. 只追踪可分类为 lint/typecheck/test/build 的 oneshot `run_process`；install、service、HTTP 和未知脚本不进入 episode。
2. `commandKey` 由规范化 program/args/cwd 构成；失败 fingerprint 只在内存中使用结构化错误码、退出信息和已经安全截断/脱敏的 output 计算 SHA-256，不持久化原 output 或 hash 为新的 contract。
3. 同一 command 成功时关闭 episode；切换到不同 validator 不抹掉尚未成功的旧 episode，但全局同时最多保留 8 个，超限按最旧淘汰内存诊断，不影响证据事实。
4. 第二次失败后，下一轮固定中文提示给出失败次数、是否与上次诊断相同、两次之间修改过的有限相对路径，并要求先基于当前完整错误事实形成一次集中修复，避免继续猜测式微补丁。
5. 同一 fingerprint 在至少一次成功 mutation 后累计出现 3 次，说明修改没有改变验证结果，以 `AGENT_VALIDATION_NO_PROGRESS` 结构化失败；不同 fingerprint 视为可能进展，不因总失败次数单独硬停。
6. episode 提示共享原模型/工具/墙钟预算，不自动执行命令、不批准写入、不禁止模型读取或修复。
7. 新错误和可选事件只公开 command kind、相对 cwd、失败次数和有限 mutated scopes/paths，不公开命令中的 secret 参数、stdout、绝对路径或 fingerprint。

这里使用 run-local fingerprint 的具体必要性是：Git、版本号、类型系统和普通结果码只能说明文件或命令状态，无法判断两次失败进程返回的诊断是否逐字未变；直接保留 stdout 又会扩大秘密与内存暴露。内部摘要只用于比较本 run 的相同失败，不能导出、持久化或成为 gate/baseline contract。

### 6.9 单文件原子多替换

`replace_in_file` 保留现有单替换输入，并增加二选一的 batch 形态：

```ts
{
  path: string;
  expectedSha256: string;
  replacements: Array<{ oldText: string; newText: string }>;
}
```

固定约束：

- `oldText/newText` 与 `replacements` 严格互斥；旧调用零修改继续解析。
- 每批 1～16 项；每个 `oldText` 必须非空并在原始文件中唯一匹配，各项 oldText 不能相同或重叠。
- 所有匹配和 expected SHA 在写入前一次校验；任一项缺失、重复、重叠、超限或 stale 时整批零写入。
- 所有替换基于同一原始字节快照按原位置应用，使用现有原子更新、父目录、真实路径、symlink、字节和秘密边界。
- 结果 metadata 只增加有限 `replacedOccurrences/replacementCount`，不记录 old/new 正文；风险评估和审批摘要覆盖整批参数且继续脱敏。
- batch 仍算一次工具调用、一次 mutation 和一个 completion-evidence path；不能跨文件、创建文件或绕过 `write_file` 覆盖语义。

### 6.10 模型可见批处理与有效验证视图

System Prompt 和工具说明增加固定 Harness 规则：

1. 能独立执行的只读观察和不同文件创建可在同一模型响应合批，仍由 Runtime 串行执行。
2. 依赖前一结果的调用不得同批；尤其同一文件多个 SHA 相关修改必须使用一次 atomic replacements 或等待前一结果后重新读取。
3. 首次写完整文件前先校验 store/API/type 契约；不要创建后立即凭自然语言自审多次覆盖。
4. validator 失败时先完整读取当前错误涉及的文件和必要类型定义，集中修复同一根因，再重跑原 validator。
5. Runtime 在 correction/repair 提示中只列当前仍有效的验证种类、覆盖 scope 和 pending 路径；模型不得重复没有被后续 mutation 失效的同 scope validator，除非用户要求更强验收或另一个验收类别仍缺失。
6. readiness/API/浏览器流程与 lint/typecheck/test/build 保持不同证据类别；有效视图减少重复，不把一个类别替代另一个。

### 6.11 效率观测与非目标优化

- 阶段测试记录每个 fixture 的模型请求、工具调用、失败工具、compaction 次数、估算输入 Token 和终态，用于修复前后差分。
- 不冻结真实 provider 的绝对 Token 数或价格；真实 usage 受模型 tokenizer/cache 变化影响，只作为人工证据。
- 不通过缓存/回放业务 completion、并行执行有副作用工具、跳过 SHA/审批/验证或缩短工具输出事实来换取效率。
- 不在本阶段把 Plan 正文升级为新的结构化任务协议；验收清单结构化属于更大的公共协议改造，若仍需要应另开阶段。

## 7. 安全与兼容性

1. JSONL 仍是唯一 durable 事实源；只增加可选字段，无迁移、重写或索引。
2. 相对路径来自已通过 Workspace 工具校验的 mutation invocation；即使内部状态异常，公开前仍需拒绝绝对路径和 `..`。
3. 固定错误和提示不得包含用户文件内容、工具 stdout/stderr、模型私有推理、API Key、Cookie、Authorization 或 provider body。
4. 不扫描 stdout 判断验证成功，不根据脚本文件名推断语义，不执行 shell 字符串。
5. 不削弱未知程序审批、工作区隔离、SHA、符号链接、Session 删除、Plan Mode 或取消边界。
6. 既有阶段 20/21/23 事件 fixture 与真实失败 Session 必须零字节修改并可恢复。
7. 软压缩摘要和 repair fingerprint 不得成为授权源；fingerprint 不持久化、不展示，摘要继续按不可信历史数据处理。
8. 原子多替换必须全有或全无，任何校验失败时文件 SHA 和字节保持不变。

## 8. 验收标准

| ID | 验收标准 |
| --- | --- |
| AC24-01 | build 成功后新建 `client/verify-integration.mjs` 并执行 `node verify-integration.mjs` 时，该路径仍 pending；普通 Node 脚本不被误认成 test。 |
| AC24-02 | 第一次 stop 拒绝后的模型请求明确得到有界具体路径、scope、总数和接受类别，不再只有 `client`。 |
| AC24-03 | 模型随后在 `cwd=client` 成功执行认可验证时，该路径清账，下一次合规中文 stop 正常产生唯一 `run.completed`。 |
| AC24-04 | 模型两次无进展 stop 时仍产生 `run.failed`，但 Terminal/Web 可见有限行动说明；被拒绝总结不持久化、不展示。 |
| AC24-05 | 路径按稳定顺序且满足 12 条、单条 256 code points、总 2048 code points上限；超限显示总数/截断标志，绝对路径、`..`、内容与秘密不可见。 |
| AC24-06 | server/client 多 scope、后续同路径再写、失败验证、service/readiness/HTTP/install/unknown script、语言重述交错和纠正预算保持既有严格语义。 |
| AC24-07 | `node --test` 只有在 Task 证明并批准精确分类时才可计为 test；`node file.js`、`node -e` 和名称含 test/verify 的脚本始终不计。 |
| AC24-08 | 新 rejection 字段跨 Domain、Storage、Agent、Context、Terminal、HTTP、Client/Web 一致；旧 JSONL 缺失字段零迁移恢复。 |
| AC24-09 | 刷新失败 Session 后仍显示同一 `run.failed`、待验证事实和可继续建议，不回退、伪 completed 或永久 executing。 |
| AC24-10 | 专项 unit/integration/E2E、完整 test、coverage、lint、typecheck、Webpack/Turbopack build、`git diff --check` 按 Task 如实通过。 |
| AC24-11 | 1M context profile 的可压缩长历史在 projected estimate 达到 64,000 Token 后产生 durable compaction；后续请求使用摘要和最近 8 个完整回合，不再持续发送全部早期回合。 |
| AC24-12 | 最近 8 个完整回合自身超过软触发但低于 hard budget 时不误失败；达到 hard budget 时仍执行既有严格压缩/错误语义。 |
| AC24-13 | Context Cache warm 与 Provider cache/Prompt usage 继续分开；软压缩不会缓存业务 completion、重复工具或改写旧 JSONL。 |
| AC24-14 | 同一认可 validator 在写入间隔后第三次返回相同失败 fingerprint 时，以 `AGENT_VALIDATION_NO_PROGRESS` 早于全局时限失败；不同诊断或最终成功正常继续。 |
| AC24-15 | 第二次 validator 失败后的模型请求得到有限 repair episode 事实，可在一次集中修复后重跑成功；episode 不泄漏 stdout、绝对路径、secret 或 hash。 |
| AC24-16 | `replace_in_file` 单文件 1～16 项 batch 在同一旧 SHA 上原子成功；缺失、重复、重叠、stale 或任一非法项整批零写入，旧单替换兼容。 |
| AC24-17 | 确定性 Harness 轨迹能合批独立读取/不同文件操作，不再生成同批同文件 stale；同一 validator 已有效且无后续 mutation 时不会仅为收尾重复执行。 |
| AC24-18 | 真实 Session 脱敏回放的估算输入 Token、模型回合与无进展修复次数相较当前基线下降；Task 必须先冻结可重复 fixture 和目标，不用真实 provider 随机结果作为唯一门禁。 |

## 9. 测试策略

### 9.1 正确 RED seam

1. CompletionEvidence 纯函数：构造 client build → 后写验证脚本 → 普通 Node 成功，断言具体 pending 路径及严格分类。
2. Runtime：QueueModel 捕获 correction request，断言路径事实存在；随后返回认可 client build，再返回中文 stop，断言同一 run 完成。
3. Runtime 失败：两次 stop 与一次语言重述交错，断言只有两次 completion rejection、一个可解释 run.failed、零 final assistant message。
4. 跨层投影：新旧 rejection/run.failed fixture 通过 Domain、Context、Terminal、HTTP、Client transcript。
5. 浏览器：临时 dataDir/workspace + 假模型构造真实轨迹，断言第一次拒绝可见、自动补验证后完成；另一路径耗尽后显示可操作失败并可刷新恢复。
6. Context：构造与真实 538/849 事件规模等价的合成长历史，分别用 32K、64K、1M context profile 断言软触发、8 回合硬保留、fallback、durable reuse 和硬预算。
7. Repair episode：同一 tsc 输出 hash 三次不变、诊断逐次变化、第三次成功、交替 validator、取消和预算矩阵。
8. Replace batch：旧单项、16 项成功、17 项拒绝、重复/重叠/缺失/stale/Unicode/秘密/原子字节 hash 矩阵。
9. Harness 差分：模拟“读取两个相关文件→集中修复→typecheck”与“同文件两处替换”，记录修复前后模型请求和工具调用，不依赖自然模型随机性。

不得只测试字符串 formatter，也不得通过降低现有“unknown Node command 不接受”断言制造通过。

### 9.2 回归矩阵

- pending 数量：1、12、13、大量跨 scope；重复路径取最新 seq。
- 路径：Unicode、长文件名、规范化分隔符、异常绝对/穿越防御。
- 命令：package scripts、直接 verifier、普通 Node、`node -e`、可选 `node --test`、失败/超时/service/readiness/install。
- 终态：纠正成功 completed、两次 stop failed、局部预算 failed、取消、超时、语言失败、模型协议失败。
- 恢复：新事件、旧事件、真实阶段 24 前失败 Session、Web 刷新与后续 run。
- 安全：secret、绝对路径、正文、stdout、private reasoning 哨兵不得进入提示、事件、错误或 UI。
- Context：短历史不压缩、可压缩长历史提前压缩、8 回合硬保留过软阈值、硬预算失败、摘要 timeout/fallback、cache fingerprint 失效。
- 修复效率：相同诊断无进展、诊断变化、集中修复、微补丁交替、不同 validator、单/多文件 mutation。
- 替换：单项向后兼容、batch 原子性、审批摘要、工具输出限制、symlink/越界/SHA 并发保护。

### 9.3 完整门禁与真实模型

Task 必须冻结命令、文件白名单、效率 fixture 和测试顺序。至少包含 completion/runtime、Context compaction/provider/token estimator、Tools/Approval、Domain/Terminal/Client/Server 投影、假模型浏览器 E2E、全量门禁和双构建。

自动门禁完成后，是否执行一次隔离真实模型 + `agent-browser` 回归必须单独说明增量价值、费用、临时目录和停止点，并再次取得用户明确授权；本 Spec 审批不自动授权真实 provider 调用。真实回归若获批，必须复现“后写验证脚本→首次完成拒绝→根据具体路径补跑认可验证→同 run 完成”，且不得读取或打印凭据。

## 10. 风险与选定决策

| 风险/决策 | 选定边界 |
| --- | --- |
| 直接认可成功的 `node verify-integration.mjs` 可消除误拒绝 | 禁止；任意脚本退出 0 不能证明 lint/test/build，继续保持严格分类。 |
| 只延长纠正次数可能让模型最终猜中 | 禁止；信息不足不是靠扩大预算解决，保留现有有界上限。 |
| 保存被拒绝总结可改善观感 | 禁止；未经证据和语言门允许的正文不能成为 assistant 事实。由结构化失败收尾解释。 |
| 公开全部 pending 路径最易定位 | 禁止；采用稳定、有界相对路径视图，并保留总数/截断标志。 |
| 自动选择项目命令可保证收敛 | 禁止；Runtime 不掌握项目意图，也不能绕过模型决策和审批。 |
| 跨 run 恢复 pending ledger 可阻止后续总结绕过 | 本阶段不引入跨 run 授权或强制门；失败事实会进入下一 run Context，但跨 run 工作区外部变化与用户新目标需要独立设计。 |
| 对 1M window 继续只在 75% 压缩可最大化历史 | 拒绝；真实 536 万 Token 证明硬容量与经济效率必须分离，采用 64K 软触发并保留硬预算。 |
| 把所有 validator 多次失败直接硬停可节省成本 | 拒绝；不同诊断可能代表进展，只对写入间隔后第三次相同安全 fingerprint 终止。 |
| 多替换削弱唯一匹配与 SHA | 拒绝；单文件、同一原始快照、逐项唯一/不重叠、任一失败零写入。 |
| 通过并行工具减少回合 | 有副作用工具仍串行；只优化模型一次决策表达和原子同文件编辑，不改变执行顺序。 |

## 11. 预期文件范围

Task 获批后可在更窄白名单内选择，预计涉及：

```text
lib/agent/completion-evidence.ts
lib/agent/runtime.ts
lib/agent/types.ts
lib/agent/schemas.ts
lib/domain/event.ts
lib/context/history-projector.ts
lib/context/provider.ts
lib/context/compaction.ts
lib/context/token-estimator.ts
lib/context/types.ts
lib/terminal/event-renderer.ts
lib/tools/replace-in-file.ts
lib/tools/file-content.ts（仅复用既有原子更新辅助确有需要时）
lib/tools/schemas.ts
lib/tools/types.ts
lib/tools/registry.ts
lib/approval/assessment.ts
lib/approval/summary.ts
lib/client/schemas.ts
lib/client/transcript.ts
lib/client/event-state.ts（仅投影确有需要时）
app/ui/workbench/transcript.tsx（仅现有 transcript 无法呈现新事实时）
app/ui/workbench/details-drawer.tsx（仅详情需要显示新事实时）
对应 unit/integration/e2e 测试
docs/development/24-completion-evidence-terminal-closure-*.md
docs/development/README.md
```

不得削弱 Tools 执行安全、修改 Storage 实现、Model provider、Session 删除、package/lock 或真实 `.secode-data`。审批文件只允许适配已批准的单文件原子多替换风险摘要；若 Task 发现必须新增工具、改变跨 run 授权、并行副作用执行或扩大安全边界，必须回退修订本 Spec 并重新审批。

## 12. Spec 审批门禁

**当前状态：修订 1 已批准。**

- 本修订在提交审批时只记录观察、量化基线、根因、设计边界和验收标准，未修改业务代码或测试；获批后已按流程生成待审批 Task。
- 用户于 2026-08-30 回复“批准”，已解锁 `24-completion-evidence-terminal-closure-tasks.md` 的编写。
- Task 编写完成后必须再次停止等待审批；Task 获批前不得修改 Production、测试或配置。
- 开发和自动验证完成后生成 Summary 并再次等待批准；阶段 24 Summary 获批前不得进入阶段 25 最终交付。
