# 阶段 26 Task 修订 2：比例化验证、软完成证据与快速启动

> **当前状态：已批准，T26R2-00～T26R2-07 已完成；Summary 修订 2 待审批。** 本 Task 依据已批准的阶段 26 Spec 修订 2 编写。T26R2-08、真实 provider、Git 写入、发布和部署仍未授权。

**Spec：** [`26-agent-convergence-efficiency-spec.md`](./26-agent-convergence-efficiency-spec.md) 第 12 节（修订 2 已批准）。

**目标：** 保留工作区、安全、审批、取消和真实失败事实，同时撤销普通任务的完成证据硬失败门；让轻量项目按比例完成编码、一个简单相关测试、一次真实启动和 final，并以 ≤30 次模型请求作为可比轨迹验收目标。

## 1. 审批与历史边界

- Spec 修订 2 审批：用户于 2026-08-31 回复“批准”，只解锁本 Task 编写。
- 原 Task 与原 Summary 已被取代，只保留历史实施与失败证据；不得把旧审批用于本 Task。
- 本 Task 获批后只解锁 T26R2-00～T26R2-07。T26R2-08 真实 provider 回归仍需自动门禁完成后的单独授权。
- T26R2-07 生成新 Summary 后立即停止；Summary 获批前不得进入阶段 27。
- 现有未提交代码属于此前阶段实施和用户工作，必须原地最小修订，不 reset、stash、清理或覆盖无关变化。

## 2. 锁定设计

### 2.1 普通完成与验证警告

不新增 durable 事件类型、Session 迁移或第二套任务成功状态。新 run 继续使用现有 `assistant.message` 与 `run.completed`；`run.completed` 表示 Runtime 正常交付 final，不等价于所有需求均已自动验证。

新增或保持为纯函数的内部接口：

```ts
interface VerificationWarning {
  scopes: string[];
  paths: string[];
  totalPaths: number;
  pathsTruncated: boolean;
}

appendVerificationWarning(
  content: string,
  evidence: UncoveredCompletionEvidence,
): string;
```

规则：

1. 首次 `stop` 且存在 pending mutation 时，追加一次既有 `completion.evidence.rejected`，向模型提供最小相关验证建议。
2. 第二次 `stop` 不再因 pending mutation 失败。若模型未明确说明验证不完整，Runtime 在最终正文尾部附加固定简体中文警告，列出有界相对 scope/path；不得包含绝对路径、stdout、命令参数或秘密。
3. 固定警告必须经过最终正文尺寸上限检查并作为同一条 `assistant.message` 持久化，刷新和旧历史投影保持一致。
4. 真实失败 validator 仍是事实；Runtime 不把失败改成成功，Prompt 要求 final 明确列出失败命令与未完成验证。
5. 删除 `completionEvidenceCorrectionBudgetExceeded` 对新 run 的终止作用；既有 `AGENT_COMPLETION_EVIDENCE_MISSING` 类型、错误解析和旧 JSONL 展示保留兼容，不迁移历史。

### 2.2 service 交付降级

`ServiceHandoffState` 仍保存每 cwd 最新 service 事实，但普通 final 不因 service 失败或缺 URL 产生不可恢复硬终态：

1. 最后 service 失败或成功 service URL 未出现在首次 final 时，最多进行一次现有 service correction。
2. 纠正后仍失败时接受 final，并确定性附加“服务未成功启动”警告及有限 `cwd`/错误码；不得附 PID、stdout 或绝对路径。
3. service 已 ready 但模型漏链接时，Runtime 可确定性附加已经过 Schema 校验的 loopback URL，不再追加第二轮模型请求。
4. `AGENT_FINAL_HANDOFF_INCOMPLETE` 保留旧事件兼容，但不再作为新普通 run 的最终结果。
5. `run.failed`、`run.cancelled`、总超时和 readiness 失败尝试仍清理对应进程树；成功交付 service 的既有保持运行语义不变。

### 2.3 原生 readiness 探针

将工具依赖从只返回状态码改为有限结构化结果：

```ts
type HttpProbeErrorCategory =
  | "connection_refused"
  | "connection_reset"
  | "request_timeout"
  | "other";

interface HttpProbeResult {
  connected: boolean;
  status?: number;
  errorCategory?: HttpProbeErrorCategory;
}
```

- `nativeToolDependencies.probeHttp` 使用 `node:http`，不调用 `globalThis.fetch`，不使用代理、重定向、Cookie 或缓存。
- URL 仍由现有 Schema 限制为无凭据的 `http://127.0.0.1:<high-port>`；不得扩大到 hostname、IPv6、HTTPS 或任意地址。
- 每次响应必须消费或销毁，request 必须响应 AbortSignal；超时、取消和子进程终止不得遗留 socket 或 timer。
- `run_process` metadata 增加有界 `readinessProbeAttempts`、`readinessConnected`、可选 `readinessErrorCategory`，继续保留最后 `readinessStatus`；不得记录 body、headers、环境或 socket 细节。
- 轻量服务的模型可见建议窗口为 10～15 秒；已知编译型 dev server 可选择更长窗口，最大值保持现有 Schema 边界。相同 host/port/命令形状的失败不得无变化重复。

### 2.4 比例化反馈环与收尾视图

- System Prompt 升为 V13：普通任务“尽早建立最小可执行反馈环”，不再强制每个垂直切片都单独 RED。
- 空工作区允许在同一响应成组创建最小实现、简单测试和必要配置；之后执行一次相关测试。现有项目优先复用已有最小测试。
- 普通轻量项目只要求一个核心测试或等价 validator、一次 readiness，以及必要时一次需求 smoke；不为凑齐四类 validator 重复执行。
- 用户或仓库明确要求的全量测试、认证/数据安全/不可逆操作/正式发布门禁仍严格执行。
- `ConvergenceView` 增加由 `modelRequests >= 20` 派生的 `closing` 布尔量；只在跨入收尾阶段时改变 fingerprint 并注入一次，不把模型请求数写入 durable 事件或新事实源。
- closing 提示只允许最小相关验证、一次启动、至多一次需求 smoke 和 final；禁止非必要重构、README 扩写、目录复盘和等价 HTTP 重查。

## 3. 依赖顺序

```text
T26R2-00 审批基线与 requirements RED
  → T26R2-01 完成证据软门与确定性验证警告
  → T26R2-02 service 交付软失败与确定性启动警告
  → T26R2-03 node:http readiness 与有限诊断
  → T26R2-04 Prompt V13、比例化测试与 closing 视图
  → T26R2-05 最新真实轨迹回放与 ≤30 请求 E2E
  → T26R2-06 全量自动门禁
  → T26R2-07 agent-browser、审计与新 Summary
  → T26R2-08 可选真实 provider（独立授权）
```

## 4. 任务清单

### T26R2-00：审批基线、需求修订与专项 RED

**允许修改：**

- `docs/development/01-requirements.md`
- 阶段 26 Spec/Task/README/流程状态
- 仅用于建立 RED 的对应测试文件

**步骤：**

1. 记录 `git status --short`，确认现有阶段 25/26 和用户修改全部保留。
2. requirements 拟修订：
   - `FR-012` 升为 Prompt V13，改为比例化反馈环、一次核心验证、快速启动和诚实 final。
   - `FR-025` 明确收敛视图是建议事实，不是普通完成许可证。
   - 新增 `FR-026`：验证或启动不完整时正常交付带确定性警告的 final，不以完成证据硬门截断。
   - `NFR-018` 从强制逐切片 RED→GREEN 改为按风险选择最小可执行反馈环；严格门禁继续服从用户和仓库指令。
   - `NFR-022` 改为可比轻量完整轨迹总请求 ≤30、ready 后 ≤1，不成为通用 Runtime 硬预算。
   - 新增 `NFR-023`：第 20 次请求后的可比轻量轨迹进入收尾，不做非必要扩张。
   - `SEC-014` 增加原生 `node:http`、无代理/缓存/重定向及有限诊断约束。
3. 在 Production 修改前建立以下 RED：pending stop 第二次仍失败、service correction 后仍硬失败、探针依赖仍只返回 number/调用全局 fetch、closing 视图不存在、最新轨迹仍无 final。
4. 专项 RED 必须真实失败且断言新合同，不删除或放宽既有安全负例。

### T26R2-01：完成证据软门

**允许修改：**

- `lib/agent/completion-evidence.ts`
- `lib/agent/runtime.ts`
- `lib/agent/errors.ts`
- `lib/agent/types.ts`
- `lib/agent/projection.ts`（仅旧错误兼容断言需要时）
- 对应 unit/integration tests

**实现与验证：**

1. 保持首个 pending stop 的一次纠正事件。
2. 第二个 stop 接受完成；实现有界、脱敏、幂等的确定性验证警告。
3. 移除 4 model / 8 tool 局部预算的硬失败分支及不再需要的 run-local baseline 字段；保留旧错误 Schema/投影兼容。
4. 覆盖：模型已写警告时不重复、多个 path 截断、Unicode/尺寸边界、失败 validator 不被改写、刷新恢复正文一致、语言重试不重复工具。
5. 最小专项 GREEN 后运行相关 Runtime、projection、language 和 terminal integration 测试。

### T26R2-02：service handoff 软交付

**允许修改：**

- `lib/agent/service-handoff.ts`
- `lib/agent/runtime.ts`
- `lib/agent/convergence-view.ts`
- 对应 unit/integration/E2E tests

**实现与验证：**

1. 保留一次 service final correction；第二次不再产生新普通 run 硬失败。
2. 失败 service 确定性附加启动警告；ready URL 缺失时确定性附加实际 readiness URL。
3. 同时存在验证警告与启动警告时顺序稳定、总大小有界、各出现一次。
4. 覆盖成功 service 保持、失败/取消清理、同 cwd 新事实取代旧事实、多个 cwd URL、旧 `AGENT_FINAL_HANDOFF_INCOMPLETE` 恢复。

### T26R2-03：原生 readiness 与快速诊断

**允许修改：**

- `lib/tools/dependencies.ts`
- `lib/tools/types.ts`
- `lib/tools/run-process.ts`
- `lib/tools/schemas.ts`（只修改模型可见 timeout/retry 指导，不扩大输入权限）
- 对应 tool unit 与 terminal integration tests

**实现与验证：**

1. 先用测试替换全局 `fetch` 为会返回陈旧 404 的哨兵，证明原生探针完全不调用它。
2. 用隔离随机 loopback server 覆盖 200、稳定 404、先连接拒绝后 ready、连接重置、总超时和 AbortSignal。
3. 核对 probe attempts、connected、最后 status/errorCategory；不持久化 body/header。
4. 覆盖 service timeout 后 SIGTERM/SIGKILL、socket/timer 释放和无孤儿进程。
5. 不用固定端口，不接触真实用户 service；权限型 `EPERM` 只按原命令申请获准重跑。

### T26R2-04：Prompt V13 与收尾视图

**允许修改：**

- `lib/context/system-prompt.ts`
- `lib/agent/convergence-view.ts`
- `lib/agent/runtime.ts`
- `lib/tools/schemas.ts`
- 对应 prompt、context、runtime tests

**实现与验证：**

1. 升级全部 phase 的版本断言到 V13；删除强制每切片 RED 和“四类验证才完成”的语义。
2. 固定普通轻量任务的最小反馈环、10～15 秒轻服务 readiness 建议、有变化才重试、失败后诚实 final。
3. `closing` 只在第 20 次请求边界改变一次 fingerprint；相同状态不重复注入，不展示精确预算倒计时。
4. 保持 planning 只读、危险审批、工具串行、中文固定文本和安全说明。
5. 三 phase token 上限沿用现有门禁；不得用冗长规则抵消效率收益。

### T26R2-05：冻结回放与 ≤30 请求完整轨迹

**允许修改/新增：**

- `tests/e2e/convergence-efficiency.spec.ts`
- `tests/e2e/support/fake-model-server.ts`
- 可选新增聚焦 replay fixture；不得复制真实用户正文、绝对路径或秘密
- 相关 runtime/terminal tests

**实现与验证：**

1. 冻结最新 run 的最小因果轨迹：6 项测试通过、`server.js` 再修改、首次 stop、四次诊断/工具请求、第二次 stop。修订后必须 `run.completed` 且有验证警告，无新 `AGENT_COMPLETION_EVIDENCE_MISSING`。
2. 完整空工作区任务允许成组生成最小实现与简单测试；必须真实运行测试、启动 service、完成一次需求 smoke 并 final。
3. 从首个模型请求到 final ≤30，第二十次后只出现最小验证/readiness/一次 smoke/final，ready 后 ≤1。
4. 增加 service 最终失败路径：正常 final + 启动警告，进程已清理；不得伪造 URL 或成功。
5. 工具参数一次校验失败后允许一次修正或带限制 final，不触发完成证据硬失败。

### T26R2-06：全量自动门禁

按顺序运行并如实记录：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
npm run build
SECODE_NEXT_DIST_DIR=.next-gate-turbo pnpm exec next build
git diff --check
```

- 失败必须记录症状、根因、最小修正和重跑结果；不得降低断言、skip 或删除测试。
- 审计 `.only/.skip`、依赖变化、secret、真实 `.secode-data`、用户工作区写入和孤儿进程。
- 两次 build 若修改临时 include，只精确处理该命令产生的条目，不覆盖用户 tsconfig 变化。

### T26R2-07：agent-browser、反思与新 Summary

1. 使用隔离 dataDir、临时 marker workspace 和随机 loopback 端口启动真实 SEcode；依照仓库要求使用 agent-browser。
2. 验收两条轨迹：完整成功服务；测试或启动未完整但仍有诚实 final。检查 UI 无无回答截断，警告可读且刷新恢复。
3. 成功轨迹检查核心交互、API、console/network、final URL；失败轨迹确认不显示虚假通过或虚假 URL。
4. 精确停止测试 PID、端口、browser 和临时目录；不清理未知进程或真实 Session。
5. 新 Summary 记录原实现为何被回退、所有 RED/GREEN、readiness 根因证据、调用数、失败/修正、偏差、安全和 T26R2-08 状态；更新索引后立即停止。

### T26R2-08：可选真实 provider 回归

**门禁：** 只有 T26R2-07 自动与浏览器结果展示后，用户另行明确授权才执行一次。

- 使用全新 marker 临时工作区，任务规模与最新轻量看板可比。
- 总模型请求目标 ≤30；不得自动重试、放宽阈值或读取/输出凭据。
- 必须包含简单相关测试、真实 readiness、必要 smoke、可见 final；若验证/启动未完整，必须以警告正常交付而非无 final 截断。
- agent-browser 验证核心交互与刷新；记录 token/cache、请求/工具数、审批、耗时、失败和精确资源清理。
- 结果写入独立 acceptance 文档，不自动修改 Production、commit、push、发布或部署。

## 5. 验收追踪

| Spec 验收 | Task |
| --- | --- |
| AC26-R2-01～R2-03 | T26R2-01、T26R2-05 |
| AC26-R2-04～R2-05 | T26R2-04、T26R2-05 |
| AC26-R2-06～R2-07 | T26R2-03、T26R2-05 |
| AC26-R2-08 | T26R2-01、T26R2-05 |
| AC26-R2-09 | T26R2-01～T26R2-07 |
| AC26-R2-10 | T26R2-06～T26R2-08 |

## 6. 明确不执行

- 不删除工作区、symlink、原子写、危险审批、Plan Mode、取消、总时限、重复错误、无进展或秘密保护。
- 不把失败 test/build/readiness 伪造成通过，不把 HTTP 200 当作全部功能测试。
- 不新增 durable 事件、通用 `completed_with_warnings` 状态、Session 迁移或第二事实源。
- 不把 30 请求目标加入所有任务的 Runtime 硬上限；复杂任务继续由真实进展与既有保护决定。
- 不新增工具、Agent 框架、并行工具、shell、端口扫描、代理、重定向或未知进程清理。
- 不执行真实 provider、Git commit/push、发布或部署。

## 7. 回退策略

- 确定性警告若造成正文越界、重复或泄密，停止并回到 Spec，不通过删除警告解决。
- 软完成若吞掉真实失败或绕过用户/仓库严格门禁，回退相应 Runtime 修改并保留失败测试。
- `node:http` 探针若出现 socket/进程泄漏，回退 T26R2-03，不恢复带缓存歧义的全局 `fetch`；先报告并重新定规格。
- closing 视图若导致未做核心验证便提前 final，回退 T26R2-04/T26R2-05，并保留 ≤30 目标作为未通过事实。
- 任何 durable schema、公共状态或安全边界变化都必须停止并回到 Spec 重新审批。

## 8. Task 审批

**当前状态：已批准，T26R2-00～T26R2-07 已完成；Summary 修订 2 待审批。**

用户于 2026-08-31 回复“批准”，语义等价于“阶段 26 Task 修订 2 通过”，只解锁 T26R2-00～T26R2-07。T26R2-08、真实 provider、真实凭据、Git 写入、发布和部署仍需独立授权。

T26R2-00～T26R2-07 已完成并形成 Summary 修订 2；当前停在 Summary 审批门，不进入 T26R2-08 或阶段 27。
