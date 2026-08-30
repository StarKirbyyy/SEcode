# 阶段 21 Spec：写入依赖恢复与完成证据收敛

## 1. 文档状态与审批门禁

- 当前状态：`已批准`。
- 生成日期：2026-08-30（北京时间）。
- 触发来源：阶段 20 的 T20-09 真实 LongCat 回归确认可见输出、Token、缓存、压缩和项目验证链基本有效，但首次嵌套写入仍先产生 `WORKSPACE_PARENT_NOT_FOUND`，完成证据门又在前后端分别验证成功后连续误拒绝，最终以 `AGENT_RUN_TIMEOUT` 终止。用户明确要求“另开一个修复阶段”。
- 前置状态：阶段 20 保留真实失败记录，不生成虚假 Summary；本阶段作为独立纠偏阶段承接两个已证实缺口，不回写阶段 20 为成功。
- 阶段调整：本阶段成为阶段 21；“文档、视频与最终提交”顺延为阶段 22。
- 当前允许：依据已批准 Spec 编写、审阅或修订阶段 21 Task，并同步文档状态。
- 当前禁止：Task 获批前不得修改产品代码、测试、配置、事件 Schema、API 或 UI，不得重新启动真实 LongCat 回归，不得生成阶段 20/21 Summary。

## 2. 阶段目标与需求追踪

本阶段把“目录依赖纠错”和“变更后验证”从松散提示或单一布尔值改为可解释、可收敛的 run-local 状态。目标不是隐藏模型错误，而是确保无效写入没有文件副作用、纠错不会无限循环、分别位于多个子项目的真实验证可以共同满足完成门。

| ID | 本阶段拟议需求 |
| --- | --- |
| FR-033 | 完整目录观察已经证明嵌套写入父目录缺失时，Runtime 进入有界依赖恢复态；写工具不得开始执行，模型必须先显式创建目录并通过新目录观察解除恢复态。 |
| FR-034 | 完成证据按变更路径与验证工作目录累计覆盖；多个子项目分别成功执行的 lint/typecheck/test/build 可以共同覆盖全部相关变更，不再要求单个命令覆盖所有路径。 |
| FR-035 | 完成证据纠正具有独立、可进展重置的有界预算；缺少新证据时快速结构化失败，取得覆盖进展后继续，全部覆盖后下一次合规 `stop` 正常完成。 |
| NFR-026 | 目录恢复、验证覆盖和纠正预算只存在于当前 run 内，不成为跨 run 授权或第二事实源；所有终态继续受原取消、工具预算和墙钟约束。 |
| NFR-027 | 完成门错误说明只包含有限相对 scope、接受的验证种类和纠正计数；不得泄露绝对路径、命令输出、私有 reasoning 或秘密。 |
| SEC-021 | 依赖恢复不得让 `write_file` 隐式创建目录、自动批准 `mkdir`、绕过 `run_process` 风险审批、削弱真实父目录/symlink/SHA 检查或执行模型伪造的不可用写工具。 |

关联并细化既有 `FR-024`、`FR-030`、`NFR-018`、`NFR-021`、`SEC-017`、`AC19-05`、`AC20-05` 与 `AC20-12`。

## 3. 只读观察与根因证据

### 3.1 真实轨迹

- T20-09 使用全新 marker 临时工作区、LongCat profile、后端 4317 和前端 4318；未读取或输出 API Key。
- event seq 18 的 `write_file server/package.json` 在父目录不存在时返回 `WORKSPACE_PARENT_NOT_FOUND`，同批另外两次写入被抑制；Agent 下一轮才执行 `mkdir -p`。
- 后续后端 typecheck/build/7 项测试、前端 typecheck/build、双 readiness、API 与真实浏览器关键流均成功。
- Agent 两次输出完成声明；事件流仍连续产生两次 `completion.evidence.rejected`，随后重复验证和服务启停，最终 seq 516 为 `run.failed / AGENT_RUN_TIMEOUT / iterations: 65`。
- 运行终止后 4317、4318 均已释放；失败不是孤儿服务造成，而是 Runtime 完成判定未收敛。

### 3.2 写入依赖根因

当前 `workspace-observations.ts` 能从完整 `list_directory` 得到“父目录已知缺失”事实，`runtime.ts` 也会在文件执行器前生成一个合成失败并抑制同批重复写。因此安全边界有效，但状态只作用于当前工具批次：

1. 没有 durable 授权问题，也没有实际文件写副作用；问题发生在模型请求与恢复流程。
2. Runtime 没有记录“这些父目录仍待修复”，下一次请求继续暴露全部写工具，只依赖模型阅读错误后自行纠正。
3. System Prompt 已有一般顺序规则，真实模型仍先请求嵌套写入，证明静态提示不能作为唯一收敛机制。
4. 当前事件语义把模型请求的无效写与实际开始执行的写混在用户观感中；验收必须明确区分 `tool.requested`、依赖预检 `tool.result` 与产生副作用的 `tool.started`。

### 3.3 完成证据根因

当前 `completion-evidence.ts` 使用一个 `pendingValidation` 布尔值和一个 `relevantMutationPaths` 数组。只有当一次成功验证命令的 `cwd` 同时覆盖数组内所有变更路径时，才清除 pending。

真实项目同时修改 `server/**` 和 `client/**`：

- `cwd=server` 的 typecheck/build/test 不能覆盖 `client/**`；
- `cwd=client` 的 typecheck/build 不能覆盖 `server/**`；
- 两侧证据不会合并，所以即使全部真实通过，pending 仍保持 true；
- 两次完成声明被拒绝后，模型仍可继续任意多轮工具调用，只有全局 30 分钟墙钟最终收口。

这不是 LongCat 对结果的理解错误，而是完成证据状态模型无法表达多 scope 联合覆盖。

## 4. 方案比较与选定方案

### 4.1 目录依赖

| 方案 | 结论 |
| --- | --- |
| 继续只加强 System Prompt | 不采用为唯一方案。既有真实运行已经证明静态提示不足。 |
| `write_file` 自动递归创建父目录 | 不采用。它引入隐式副作用并模糊进程审批、目录审计与文件安全边界。 |
| 新增第七个 `create_directory` 工具 | 不采用。本次缺口可在现有六工具边界内修复，无需扩大公共工具协议。 |
| run-local 依赖恢复态、动态能力收窄与重新观察 | 采用。它保留显式 `run_process mkdir` 及审批，同时让错误恢复确定收敛。 |

### 4.2 完成证据

| 方案 | 结论 |
| --- | --- |
| 要求模型始终在仓库根运行一次总验证 | 不采用为唯一规则。多包项目可能没有根脚本，且真实的子项目验证不应被判为无效。 |
| 看到任意一个成功验证就放行全部变更 | 不采用。它会让只验证后端的命令错误覆盖未验证前端。 |
| 按相对路径 scope 累计验证覆盖 | 采用。验证 `cwd` 覆盖其子树，多个成功命令联合覆盖全部最新变更。 |

## 5. 设计规格

### 5.1 run-local 写入依赖恢复态

1. 当前完整 listing 已知某个 `write_file` 父目录缺失时，保持现有执行前拦截；该调用不得产生 `tool.started`，不得进入文件执行器。
2. 同一模型响应中依赖相同缺失父目录的后续写入继续合并抑制，只产生一个主要诊断和有限的同批抑制结果，不重复副作用或审批。
3. Runtime 记录有限的 `pendingParentDirectories`。该状态只含规范化相对父目录，不含目录内容、绝对工作区路径或授权信息。
4. 依赖恢复态存在时，下一次模型请求增加动态中文事实：哪些相对父目录已知缺失、必须先显式创建、创建后必须重新 `list_directory`。这不是用户消息，不修改原目标。
5. 恢复态下模型可见能力移除 `write_file` 和 `replace_in_file`；保留只读工具及 `run_process`。Runtime 二次能力校验同步拒绝模型伪造的写工具，不能只依赖 Schema 过滤。
6. `run_process` 仍按现有风险策略审批。Runtime 不根据命令文本猜测目录已经创建；任何进程执行继续使旧 listing 失效。
7. 只有新的完整 `list_directory` 明确观察到所有 pending 父目录均为真实目录后，才清除相应恢复项并重新暴露写工具。符号链接不能当作目录满足依赖。
8. 若模型在恢复态输出 `stop`、重复不可用写工具或未取得任何目录事实进展，使用独立的有界纠正计数；达到后以 `AGENT_WRITE_DEPENDENCY_UNRESOLVED` 失败，不等待 30 分钟总超时。
9. System Prompt 升级为下一版本时，只增加必要的动态恢复契约；不得重复堆叠大段静态规则。

### 5.2 首次写入与事件语义

1. “首次写入顺序正确”的确定性含义是：任何产生文件副作用的 `write_file` 必须先有 `tool.started` 前的父目录存在事实；模型的无效 `tool.requested` 可以被预检拒绝，但不能开始执行。
2. Terminal/Web 必须保持诚实：若发生依赖预检，不伪装为成功写入；使用现有结构化工具结果说明“未执行，等待目录依赖”，不伪造 LLM 正文。
3. 自动测试同时断言事件序列和工作区 hash：依赖预检前后文件系统不变，目录创建审批前无副作用，重新观察后首次 `tool.started(write_file)` 才允许发生。
4. 真实模型目标仍要求正常路径尽量零依赖预检；但阶段成功的确定性安全门以“零越序执行、一次有界恢复、最终收敛”为准，不把模型是否第一次就选对工具作为唯一不可控条件。

### 5.3 分 scope 完成证据账本

1. 以每个非纯文档变更路径的最新成功 mutation seq 为基准记录待验证项；后续同路径写入更新该 seq，只使覆盖该路径的旧证据失效。
2. 成功、oneshot 且可分类为 `lint`、`typecheck`、`test` 或 `build` 的 `run_process` 产生验证证据，包含种类、规范化相对 `cwd` 与结果 seq。
3. 当验证 `cwd` 为 `.` 时覆盖全部相对变更；否则只覆盖等于该 cwd 或位于其子树的变更路径。
4. 多个成功验证可以联合覆盖。例如 `cwd=server` 的 test 与 `cwd=client` 的 build 共同覆盖 server/client 的最新变更。
5. 验证只覆盖其执行前已发生的 mutation；验证后的新写入必须重新验证。失败、service lifecycle、readiness、HTTP 请求、安装、warning 文本和模型自称成功均不产生覆盖。
6. 纯文档扩展名继续不触发代码完成门；分类规则保持与阶段 20 一致，不把未知脚本猜成验证。
7. `stop` 时只有存在未覆盖路径才产生 `completion.evidence.rejected`。事件增加可选、有限的 `uncoveredScopes` 与 `acceptedKinds`，旧 JSONL 缺失字段继续解析。
8. 对外 scope 只显示去重后的最小相对目录，数量和总字节有界；不得输出工作区绝对路径或文件内容。

### 5.4 有界纠正与收敛

1. 完成证据纠正计数表示“连续、没有新增覆盖进展的完成拒绝”，不再表示整个 run 的永久累计次数。
2. 新增至少一个有效路径覆盖时重置无进展纠正计数；全部路径覆盖后退出纠正态，下一次合规 `stop` 可以完成。
3. 纠正态记录开始时的模型请求数和工具调用数。没有覆盖进展时，最多允许 4 次额外业务模型请求或 8 次工具调用；先到者触发 `AGENT_COMPLETION_EVIDENCE_MISSING`，不能拖到全局墙钟。
4. 原两次 `stop` 拒绝上限继续作为更早终止条件；语言重述、计划审批、危险工具审批、取消和总预算不因纠正态重置。
5. 纠正提示按未覆盖 scope 给出可操作信息，不要求已覆盖 scope 重复执行验证；不得要求启动或重复 readiness 来代替结构化验证。

### 5.5 投影、Terminal、HTTP 与 UI

1. JSONL 继续是完成拒绝和终态的唯一 durable 事实；run-local 两类 ledger 不做持久授权，也不引入客户端状态机。
2. `completion.evidence.rejected` 新可选字段由 Domain、Storage、Terminal、Server、Client/Web 同一投影展示；旧事件零迁移。
3. 详情页显示“待验证 scope”与纠正进度时必须与事件一致；刷新后只能根据 durable 拒绝事件说明历史事实，不恢复为可执行授权。
4. `run.completed`、`run.failed`、服务清理、usage、provider cache、Context cache 与压缩统计保持阶段 20 的现有契约。

## 6. 错误、安全与兼容性

- 新错误 `AGENT_WRITE_DEPENDENCY_UNRESOLVED` 为结构化、有限、可恢复的 Agent 错误；不得包含绝对路径或原始模型正文。
- `AGENT_COMPLETION_EVIDENCE_MISSING` 保持完成失败语义，但应在局部纠正预算耗尽时早于 `AGENT_RUN_TIMEOUT` 出现。
- 不新增工具、依赖、数据库、缓存文件或文件迁移；不改变 `write_file` 的父目录、symlink、越界和 SHA 安全检查。
- 不自动执行或批准 `mkdir`，不解释 shell 管道/重定向，不扩大 `run_process` 环境继承或命令权限。
- 新事件字段必须可选；旧 Session、旧失败轨迹和阶段 20 fixture 无迁移恢复。
- 不读取 `.env.local`，不打印或持久化 API Key；真实回归由应用自行加载既有 profile。

## 7. 验收标准

| ID | 验收标准 |
| --- | --- |
| AC21-01 | 完整 root listing 已知嵌套父目录缺失时，无效 `write_file` 只有 requested/result，没有 `tool.started`，工作区 hash 不变；同批相同父目录只产生一次主要诊断。 |
| AC21-02 | 依赖恢复态移除写/替换工具并由 Runtime 二次拒绝伪造调用；经审批的显式目录创建后，只有重新完整 listing 观察到真实目录才恢复写能力。 |
| AC21-03 | 依赖恢复无进展在独立预算内以 `AGENT_WRITE_DEPENDENCY_UNRESOLVED` 收口；取消、总时限、工具预算、重复错误和审批安全无回归。 |
| AC21-04 | `server/**` 与 `client/**` 分别变更后，`cwd=server` 与 `cwd=client` 的成功验证可联合清除 pending；只验证一侧时仍拒绝完成并准确列出另一侧相对 scope。 |
| AC21-05 | 验证后的新 mutation 只使受影响路径重新 pending；根验证覆盖全部，失败/service/readiness/HTTP/install 不产生虚假覆盖。 |
| AC21-06 | 取得新覆盖进展会重置无进展纠正计数；无进展最多 4 次模型请求或 8 次工具调用即结构化失败，不再重复验证至 30 分钟超时。 |
| AC21-07 | 新可选拒绝字段在 Domain、Agent、Storage、Terminal、Server、Client/Web 和旧 JSONL 恢复中一致、有限、脱敏；reasoning、秘密和绝对路径不可见。 |
| AC21-08 | 专项单元/集成/E2E、lint、typecheck、全量 test、coverage、webpack build、Turbopack build 与 `git diff --check` 按后续 Task 全部真实执行并记录。 |
| AC21-09 | 自动门禁展示后，经用户独立授权，在新 marker 临时工作区完成真实 LongCat 多 scope 项目回归：目录依赖零越序执行且有界收敛，前后端分别验证后首次完成声明成功，产生 `run.completed`，不出现完成误拒绝、重复副作用或 `AGENT_RUN_TIMEOUT`，服务全部释放。 |
| AC21-10 | 真实回归继续核对公开中文说明、每请求/run/Session Token、Context 摘要、provider/local cache 与压缩展示；阶段 20 已通过能力不得回归。 |

## 8. 验证策略与人工门禁

1. 先用纯状态单元测试覆盖目录恢复 ledger、动态能力、scope 覆盖与纠正预算。
2. 再用假模型集成轨迹覆盖：首次错误写入后的恢复、伪造写工具、server/client 联合验证、后验证再写、无进展快速失败、取消和旧事件恢复。
3. Terminal/HTTP/UI 验证同一事件投影、相对 scope、刷新恢复和服务清理；不得在 UI 复制判定逻辑。
4. 完成完整自动门禁并展示真实结果后立即停止。
5. 真实 LongCat 回归必须再次获得独立用户授权；本 Spec 批准、后续 Task 批准和工具审批均不能复用为真实模型授权。
6. 真实回归使用全新系统临时 marker 根、非 3000 一致端口和小型前后端多 scope 任务；不触碰阶段 20 fixture、真实用户项目或真实 Session 数据。
7. 只有 AC21-01～AC21-10 全部真实通过后才能生成阶段 21 Summary；失败则记录阻塞，不伪造成功。

## 9. 范围外

- 不重新实现阶段 20 已通过的流式正文、usage、provider cache、本地 Context cache 或压缩系统。
- 不把模型私有 reasoning 展示给用户，不新增 thinking UI。
- 不新增目录工具，不让 `write_file` 隐式创建父目录，不增加 shell、自定义 env 或任意进程控制。
- 不要求一次验证必须覆盖整个仓库，也不把 readiness/HTTP 200 当作代码验证。
- 不修订第三次压缩中本地降级摘要保留早期已纠正错误的语义；该观察作为后续风险，不扩大本阶段两个阻塞点的范围。
- 不修改真实用户生成项目，不执行 Git commit/push，不发布、部署或制作最终视频/提交材料。

## 10. 风险、假设与选定边界

| 风险/决策 | 选定边界 |
| --- | --- |
| 模型第一次仍可能请求不存在父目录下的写入 | 不能伪造模型自主行为；确定性保证是零越序执行、动态收窄、一次有界恢复和最终收敛，真实回归另观察正常路径质量。 |
| `run_process` 成功不等于目录一定创建 | 不解析命令意图；必须重新 `list_directory` 取得真实目录事实。 |
| 多 scope 验证可能过度放宽 | 每条证据只覆盖其 cwd 子树且必须晚于对应最新 mutation；未覆盖路径继续阻止完成。 |
| correction 预算过小可能打断合理修复 | 只有没有新增覆盖进展时计数；任何真实覆盖进展重置局部预算，全局安全预算不重置。 |
| 阶段 20 未完成即进入阶段 21 | 这是用户对真实阻塞的明确流程重定向；阶段 20 保留失败事实，本阶段不追认其 Summary。 |

## 11. Spec 审批门禁

- 审批结果：用户于 2026-08-30 在收到本 Spec 全文链接与门禁说明后回复“批准”，语义等价于“阶段 21 Spec 通过”。
- 本次批准只解锁 `21-agent-dependency-completion-recovery-tasks.md` 的编写。
- Task 再次获批前，仍不得修改产品代码、测试、配置、事件协议或 UI，也不得启动真实 LongCat 回归。
