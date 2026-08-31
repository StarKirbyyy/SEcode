# 阶段 25 Task：Agent 简化写入、基础 TDD、端口启动与可访问交付

> **实施要求：** Task 获批后使用 `superpowers:executing-plans` 按 T25-00～T25-06 顺序执行；除非用户另行明确要求，不派发 subagent。每项任务都先形成 RED、确认失败原因、做最小实现并重跑。仓库三级审批门禁优先，不执行自动 commit。

**目标：** 移除模型可见 SHA 写入仪式，使 Agent 按简单 TDD 完成功能，并以一致端口保持最终 Web 服务运行、交付启动命令和直接访问链接。

**架构：** 文件工具把路径、文本、原子写和执行期竞态留在工具内部，模型输入不再包含 `expectedSha256`。Agent Runtime 新增一个有限、run-local 的 service handoff 状态，只依据结构化 `run_process` 结果校验 final 中的 readiness URL；端口选择和 TDD 顺序由 System Prompt 与确定性轨迹共同固定。

**技术栈：** TypeScript、Zod、Vitest、Next.js 16.3.3、Playwright、现有六工具、JSONL 事件协议。

**Spec：** [`25-agent-tdd-startup-handoff-spec.md`](./25-agent-tdd-startup-handoff-spec.md)（v2 已批准）。

## 1. 状态与审批门禁

- 当前状态：`阶段 25 真实回归失败，后续修复转入阶段 26`。v2 实施记录保留为历史事实，不据此继续开发。
- Spec 审批：用户于 2026-08-31 再次回复“批准”，阶段 25 Spec v2 已批准，只解锁本 Task 的重写。
- 修订记录：删除原 Task 中的 `strictPort`、固定替代端口和冲突重试次数要求；生成项目只需避开 3000，并保证实际监听端口与所有消费方、readiness 和最终链接一致。
- Task 审批：用户于 2026-08-31 回复“批准”，随后明确允许直接在当前 `main` 工作区实施；该批准解锁 T25-00～T25-06，不授权 T25-07、Git 写入、真实 provider、发布或部署。
- Task 获批前禁止修改 Production、测试、配置、`01-requirements.md`、真实 Session 或真实用户工作区。
- Task 获批后只允许执行 T25-00～T25-06；T25-07 真实 provider 回归仍需在自动门禁展示后单独授权。
- 未经用户明确要求，不 commit、push、发布、部署或清理已有 dirty worktree。
- T25-06 生成 Summary 后立即停止，Summary 获批前不得进入阶段 26。

## 2. 全局约束

1. 只移除模型管理 SHA 的契约，不删除工作区 realpath/symlink、敏感路径、文本/大小、原子 rename、Plan Mode、审批、秘密过滤或 JSONL 事实源。
2. `read_file.metadata.sha256`、既有 ToolResult hash metadata 和旧 JSONL 原样兼容；新模型工具 Schema 不再接受或要求 `expectedSha256`。
3. 功能与缺陷任务遵守 RED → GREEN → 必要重构；文档、CSS、静态配置不强制单元测试。
4. 不新增依赖、工具名、Shell、任意环境注入、后台守护、服务管理 UI 或跨 SEcode 重启保证。
5. 3000 保留；生成项目最终监听端口只需不是 3000，不指定固定替代端口、`strictPort` 或冲突重试次数；readiness 与实际监听 URL 完全一致。
6. 最终交付 service 只在实现和验证完成后启动；失败、超时、取消或 run 失败清理，成功 run 不主动终止。
7. service final 校验只检查结构化 URL 和最后 service 成败，不做通用自然语言评分，不增加 hash、baseline 或 contract freeze。
8. 自动测试只使用临时 workspace、dataDir 和隔离 loopback 端口；不读取 `.env.local`，不写真实 `.secode-data` 或用户项目。
9. 修改任何 Next.js Production 文件前，必须先阅读 `node_modules/next/dist/docs/` 中与变更直接相关的本地文档；若不修改 Next Production，则在 Task/Summary 中如实写明无需触发该动作。

## 3. 文件与接口地图

### 3.1 预计新增

```text
lib/agent/service-handoff.ts
tests/unit/agent/service-handoff.test.ts
tests/e2e/service-handoff.spec.ts
tests/manual/stage25-fixture.ts（仅 T25-07 获批时）
docs/development/25-agent-tdd-startup-handoff-tasks.md
docs/development/25-agent-tdd-startup-handoff-summary.md（T25-06）
docs/development/25-agent-tdd-startup-handoff-acceptance.md（仅 T25-07）
```

### 3.2 预计修改

```text
docs/development/01-requirements.md
docs/development/README.md
lib/context/system-prompt.ts
lib/tools/types.ts
lib/tools/schemas.ts
lib/tools/atomic-write.ts
lib/tools/write-file.ts
lib/tools/replace-in-file.ts
lib/tools/registry.ts
lib/approval/summary.ts（仅既有测试证明需要适配时）
lib/agent/types.ts
lib/agent/errors.ts
lib/agent/runtime.ts
tests/unit/tools/write-file.test.ts
tests/unit/tools/replace-in-file.test.ts
tests/unit/tools/schemas.test.ts
tests/unit/tools/registry.test.ts
tests/unit/tools/run-process.test.ts
tests/unit/approval/assessment.test.ts
tests/unit/approval/summary.test.ts
tests/unit/context/model-language.test.ts
tests/unit/context/token-estimator.test.ts
tests/unit/agent/completion-evidence.test.ts
tests/unit/agent/runtime-completion.test.ts
tests/unit/agent/runtime-cancellation.test.ts
tests/unit/agent/schemas.test.ts
tests/integration/server/run-stream.test.ts
tests/integration/terminal/execution-precision.test.ts
tests/integration/terminal/process.test.ts
tests/e2e/support/fake-model-server.ts
tests/e2e/fixtures.ts（仅隔离服务清理需要）
```

没有确定证据时不得扩大该清单。若公共事件、Client Schema 或 UI Production 必须变化，属于 Spec 范围变化，必须停止并回退修订 Spec；本 Task 设计为无需新增 durable event 或 UI 业务状态。

### 3.3 锁定接口

写工具公共输入：

```ts
export interface WriteFileArguments {
  path: string;
  content: string;
}

export type ReplaceInFileArguments = { path: string } & (
  | { oldText: string; newText: string }
  | { replacements: TextReplacement[] }
);
```

原子写内部接口：

```ts
export interface AtomicWriteOptions {
  expectedCurrentSha256?: string;
}

export function atomicWriteWorkspaceFile(
  workspace: WorkspaceHandle,
  relativePath: string,
  targetBytes: Buffer,
  signal: AbortSignal,
  dependencies?: ToolDependencies,
  options?: AtomicWriteOptions,
): Promise<AtomicWriteResult>;
```

- `write_file` 不传 `expectedCurrentSha256`；helper 自行读取执行时现有快照并在 rename 前重验。
- `replace_in_file` 把本次执行已读取的 `content.sha256` 作为内部 `expectedCurrentSha256`，但该值不进入模型输入或审批。
- `AtomicWriteError` 删除 `invalid_hash_semantics`；保留内部 `stale | content | atomic_io`。

service handoff 接口：

```ts
export interface ServiceHandoffFact {
  cwd: string;
  program: string;
  args: readonly string[];
  readinessUrl: string;
  seq: number;
}

export interface ServiceHandoffState {
  readonly successful: ServiceHandoffFact[];
  attempted: boolean;
  lastAttemptSucceeded: boolean;
  correctionAttempts: number;
}

export type ServiceFinalDecision =
  | { kind: "accept" }
  | { kind: "retry"; message: string }
  | { kind: "fail"; details: JsonObject };

export function createServiceHandoffState(): ServiceHandoffState;
export function recordServiceHandoffToolResult(
  state: ServiceHandoffState,
  seq: number,
  invocation: PreparedLocalToolInvocation,
  result: ToolResult,
): void;
export function decideServiceFinal(
  state: ServiceHandoffState,
  content: string,
): ServiceFinalDecision;
```

`decideServiceFinal` 规则：没有 service 尝试则接受；最后 service 失败则重试一次；最后成功但 final 缺任一成功 readiness URL 则重试一次；第二次仍不满足则 `fail`。Runtime 使用新增 `AGENT_FINAL_HANDOFF_INCOMPLETE`，不新增 durable 事件类型。

## 4. 依赖顺序

```text
T25-00 审批基线与需求修订
  → T25-01 写工具移除模型 SHA
  → T25-02 System Prompt、简单 TDD 与避开 3000
  → T25-03 service final handoff 状态与纠正
  → T25-04 失败清理与成功服务生命周期
  → T25-05 Terminal/E2E/agent-browser 完整回归
  → T25-06 全量门禁、审计与 Summary
  → T25-07 可选真实 provider 回归（独立授权）
```

## 5. 任务清单

### T25-00：实施基线、需求修订与范围锁定

**覆盖：** Spec 3.1～3.2、AC25-01～AC25-14 的实施前事实。

**文件：**

- Modify: `docs/development/01-requirements.md`
- Modify: `docs/development/25-agent-tdd-startup-handoff-tasks.md`（只记录结果）
- Read only: Spec、阶段 19/24 文档、相关 Production 与测试。

**接口：** 不产生代码接口；锁定后续任务使用第 3.3 节签名。

- [x] **Step 1：确认 dirty worktree 与审批边界**

  运行 `git status --short`，确认只保留用户和阶段 25 文档现有修改；不 reset、stash、checkout 或清理。

- [x] **Step 2：运行实施前专项基线**

  运行：

  ```text
  pnpm exec vitest run tests/unit/tools/write-file.test.ts tests/unit/tools/replace-in-file.test.ts tests/unit/tools/schemas.test.ts tests/unit/tools/registry.test.ts tests/unit/context/model-language.test.ts tests/unit/agent/runtime-completion.test.ts tests/integration/terminal/execution-precision.test.ts
  ```

  预期：当前既有测试通过；它们明确冻结旧 SHA、SERVER_PORT 和 final 接受行为，作为后续 RED 的对照，不把通过写成新需求已实现。

- [x] **Step 3：按已批准 Spec 修订需求文字**

  精确修改 FR-024、NFR-021、SEC-007、SEC-017；不调整其他需求 ID、题目合规边界或验收历史。文字必须与 Spec 3.2 完全一致。

- [x] **Step 4：记录基线**

  在本 Task 的实施记录中写入真实命令、通过数、Git 状态和任何既有失败；不创建 Summary。

**最小验证：** `git diff --check -- docs/development/01-requirements.md docs/development/25-agent-tdd-startup-handoff-tasks.md`。

**完成条件：** 需求安全取舍与 Spec 一致，代码仍未修改，后续接口和白名单无歧义。

### T25-01：写工具移除模型可见 SHA

**覆盖：** AC25-01～AC25-04。

**文件：**

- Modify: `lib/tools/types.ts`
- Modify: `lib/tools/schemas.ts`
- Modify: `lib/tools/atomic-write.ts`
- Modify: `lib/tools/write-file.ts`
- Modify: `lib/tools/replace-in-file.ts`
- Modify: `lib/tools/registry.ts`
- Modify only if failing assertions require: `lib/approval/summary.ts`
- Test: `tests/unit/tools/write-file.test.ts`
- Test: `tests/unit/tools/replace-in-file.test.ts`
- Test: `tests/unit/tools/schemas.test.ts`
- Test: `tests/unit/tools/registry.test.ts`
- Test: `tests/unit/approval/assessment.test.ts`
- Test: `tests/unit/approval/summary.test.ts`
- Test: `tests/unit/agent/completion-evidence.test.ts`
- Test: `tests/integration/server/run-stream.test.ts`

**接口：** 产生第 3.3 节 `WriteFileArguments`、`ReplaceInFileArguments`、`AtomicWriteOptions` 与 `atomicWriteWorkspaceFile`，供后续 Runtime 和 fixture 使用。

- [x] **Step 1：写无 SHA 覆盖 RED**

  将 `write-file.test.ts` 的旧 hash 测试改为：

  ```ts
  it("overwrites an existing text file without a model-provided hash", async () => {
    const fixture = await createToolFixture();
    await fs.writeFile(path.join(fixture.project, "a.txt"), "before");
    const result = await runTool(fixture.workspace, "write_file", {
      path: "a.txt",
      content: "after",
    });
    expect(result.ok).toBe(true);
    await expect(fs.readFile(path.join(fixture.project, "a.txt"), "utf8"))
      .resolves.toBe("after");
  });
  ```

  在 Schema 测试中断言 write/replace properties 不含 `expectedSha256`，显式传入该字段因 strict schema 被拒绝。

- [x] **Step 2：运行 RED**

  运行：`pnpm exec vitest run tests/unit/tools/write-file.test.ts tests/unit/tools/schemas.test.ts`

  预期：existing overwrite 仍报 `TOOL_ARGUMENTS_INVALID`，Schema properties 仍含 `expectedSha256`。

- [x] **Step 3：写无 SHA 替换和原子竞态 RED**

  从 replace fixture 删除所有 `expectedSha256`，保留 unique、missing、non-unique、overlap、batch 零写入断言；新增依赖钩子在 helper 取得快照后、rename 前改写目标，断言 `FILE_STALE` 且不覆盖并发内容。

- [x] **Step 4：实现最小工具契约**

  按第 3.3 节修改类型、Zod Schema、parser、工具 descriptions 和 registry public arguments。`contentSha256`、old/new hash 作为自动生成的脱敏审计 metadata 可保留，但 `expectedSha256` 必须从模型参数和 public arguments 删除。

- [x] **Step 5：实现内部原子快照重验**

  `atomicWriteWorkspaceFile` 在执行时读取 existing 快照；rename 前比较本次内部快照。`write_file` 不传外部 hash；`replace_in_file` 用本次已读 snapshot 作为内部 option。删除 `invalid_hash_semantics` 分支，保留执行期 `stale`。

- [x] **Step 6：运行 GREEN**

  运行：

  ```text
  pnpm exec vitest run tests/unit/tools/write-file.test.ts tests/unit/tools/replace-in-file.test.ts tests/unit/tools/schemas.test.ts tests/unit/tools/registry.test.ts tests/unit/approval/assessment.test.ts tests/unit/approval/summary.test.ts tests/unit/agent/completion-evidence.test.ts tests/integration/server/run-stream.test.ts
  ```

  预期：全部通过；正常覆盖零 `invalid_expected_hash_semantics`，并发窗口仍返回内部 `FILE_STALE`。

- [x] **Step 7：全仓残留审计**

  运行 `rg -n "expectedSha256|invalid_expected_hash_semantics" lib tests --glob '!docs/**'`。预期：Production 和新测试零模型契约命中；仅明确的冻结旧 JSONL fixture 可保留并逐项说明。

**完成条件：** 模型不再管理 SHA，写工具仍具备工作区、文本、原子性和执行期竞态保护，旧 durable 事实可恢复。

### T25-02：System Prompt V11、简单 TDD 与生成项目避开 3000

**覆盖：** AC25-05～AC25-08。

**文件：**

- Modify: `lib/context/system-prompt.ts`
- Test: `tests/unit/context/model-language.test.ts`
- Test: `tests/unit/context/token-estimator.test.ts`
- Test: `tests/integration/terminal/execution-precision.test.ts`

**接口：** `SYSTEM_PROMPT_VERSION` 从 10 升为 11；工具与 Runtime 公共类型不变。

- [x] **Step 1：写 Prompt RED**

  修改请求捕获断言，要求每个 phase 包含：

  ```text
  功能或缺陷先写一个因目标行为缺失而失败的最小测试，再做最少实现并重跑；文档、样式和纯配置使用适当验证。
  生成项目的最终监听端口不得为 3000；不指定固定替代端口或冲突重试次数，监听、代理、README、API 检查、readiness 和最终链接使用同一个实际端口。
  最终交付 service 只在实现与验证完成后启动；成功后保持运行，最终回答给出启动命令和实际 URL。
  ```

  同时断言不再出现 `expectedSha256`、`最新完整 SHA` 或“Node.js 必须使用 SERVER_PORT”。

- [x] **Step 2：运行 Prompt RED**

  运行：`pnpm exec vitest run tests/unit/context/model-language.test.ts tests/unit/context/token-estimator.test.ts tests/integration/terminal/execution-precision.test.ts`

  预期：版本和新文案断言失败。

- [x] **Step 3：写简单 TDD 轨迹 RED**

  在 `execution-precision.test.ts` 增加确定性序列：创建最小 test → 运行 test 得到目标行为缺失 → 写 Production → 重跑同一 test 成功 → 一次 build → 最终 service。断言 Production 写入发生在有效 RED 之后，GREEN 后没有无关 validator。

- [x] **Step 4：写“避开 3000”端口 RED**

  测试同时设置并在 `finally` 恢复：

  ```ts
  process.env.PORT = "3000";
  process.env.SERVER_PORT = "3000";
  ```

  fixture 自行选择测试隔离端口并注入生成任务；断言最终 server/client 监听端口均不为 3000，tool args、代理、README、API、readiness URL 与 final 链接使用各自同一个实际端口。不得断言固定端口值、`strictPort` 或端口冲突重试次数；保留零批量端口扫描和零终止未知进程断言。

- [x] **Step 5：实现 V11 最小文案**

  删除 V10 的模型 SHA、SERVER_PORT 唯一配置和扩张式完成证据措辞；加入 Step 1 的三条短规则，保留中文、安全、Plan Mode、ToolResult 因果、warning、无 Shell 和验证事实边界。

- [x] **Step 6：运行 GREEN**

  重跑 Step 2 命令。预期全部通过，System Prompt 仍在既有 Token 预算内；不得通过提高 prompt 阈值制造通过。

**完成条件：** 确定性模型可见契约与真实任务顺序一致；宿主变量不能令生成项目监听 3000，最终实际端口在监听、消费方、readiness 和 final 中一致。

### T25-03：service handoff 状态、final 纠正与结构化失败

**覆盖：** AC25-10～AC25-11。

**文件：**

- Create: `lib/agent/service-handoff.ts`
- Modify: `lib/agent/runtime.ts`
- Modify: `lib/agent/types.ts`
- Modify: `lib/agent/errors.ts`
- Test: `tests/unit/agent/service-handoff.test.ts`
- Test: `tests/unit/agent/runtime-completion.test.ts`
- Test: `tests/unit/agent/schemas.test.ts`

**接口：** 产生第 3.3 节 `ServiceHandoffFact/State/Decision` 和三个纯函数；新增 `AGENT_FINAL_HANDOFF_INCOMPLETE`。

- [x] **Step 1：写纯状态 RED**

  覆盖四类输入：无 service 接受；成功 service 但 final 缺 URL 返回 retry；final 包含全部 URL 接受；最后 service 失败返回 retry，第二次仍失败返回 fail。测试还要断言 message/details 不含 PID、绝对路径、秘密或 stdout。

- [x] **Step 2：运行纯状态 RED**

  运行：`pnpm exec vitest run tests/unit/agent/service-handoff.test.ts`

  预期：模块不存在。

- [x] **Step 3：实现纯状态模块**

  只记录 `run_process` 且 `lifecycle === "service"` 的结构化结果。成功条件为 `result.ok === true`、`metadata.ready === true` 且存在 invocation readiness；事实最多保留 8 条，URL 来自已通过工具 Schema 的 loopback URL。

- [x] **Step 4：写 Runtime RED**

  在 `runtime-completion.test.ts` 增加：

  - service success → 首次中文 final 缺 URL → 第二次请求收到有限纠正文案 → 含 URL final → completed；
  - service failure → 两次 stop 且无新 service success → `AGENT_FINAL_HANDOFF_INCOMPLETE`；
  - 无 service 的普通代码任务不触发纠正；
  - completion evidence pending 时先补验证，再执行 handoff 校验。

- [x] **Step 5：接入 Runtime**

  `ActiveRunState` 初始化 `serviceHandoff`；每个真实 invocation 的 `tool.result` append 后调用 record。stop 分支在 completion evidence 通过后调用 decide；retry 时清空 continuation、只注入一次 system correction；fail 时抛新增 Agent error。不得新增 durable event或修改 Client/UI Schema。

- [x] **Step 6：运行 GREEN**

  运行：

  ```text
  pnpm exec vitest run tests/unit/agent/service-handoff.test.ts tests/unit/agent/runtime-completion.test.ts tests/unit/agent/schemas.test.ts tests/unit/agent/runtime-language-policy.test.ts
  ```

  预期：全部通过；错误码集合数量同步，中文重述与 handoff 纠正不重复工具调用。

**完成条件：** 有 service 事实时缺 URL 或最新启动失败不能产生虚假 completed；普通代码任务无新仪式。

### T25-04：service 成功保留与失败终态清理

**覆盖：** AC25-09、Spec 6.5。

**文件：**

- Modify: `lib/tools/schemas.ts`（修正文案矛盾）
- Modify: `lib/agent/runtime.ts`
- Test: `tests/unit/tools/run-process.test.ts`
- Test: `tests/unit/agent/runtime-cancellation.test.ts`
- Test: `tests/integration/terminal/process.test.ts`

**接口：** 不新增服务注册表；沿用 `ActiveRunState.controller` 和 `run_process` service abort listener。

- [x] **Step 1：写生命周期 RED**

  使用可观察 fake child 或隔离真实 loopback server，断言：completed 不触发 service SIGTERM；run.failed、run.cancelled、readiness timeout 各触发 SIGTERM，必要时 grace 后 SIGKILL；测试 `finally` 精确清理 PID/端口。

- [x] **Step 2：运行 RED**

  运行：`pnpm exec vitest run tests/unit/tools/run-process.test.ts tests/unit/agent/runtime-cancellation.test.ts tests/integration/terminal/process.test.ts`

  预期：至少 run.failed 后已 ready service 仍存活的断言失败；记录当前真实行为。

- [x] **Step 3：修正成功/失败终态**

  `completeTextRun` 不 abort controller。`finishFailed` 与 `finishCancelled` 在写入终态前确保 controller abort，从而触发已 ready service 的既有 listener；保持单一终态和事件顺序。修正 readiness parameter description：oneshot readiness 成功后清理，service readiness 成功后保持。

- [x] **Step 4：运行 GREEN 与孤儿检查**

  重跑 Step 2 命令，并在测试结束确认临时端口可重新绑定。不得使用宽泛 `pkill`，不得终止用户已有进程。

**完成条件：** 最终成功服务保持可访问；失败、取消、超时不留本阶段测试进程，且无需新增第七个工具或服务管理 UI。

### T25-05：完整 Terminal、E2E 与 `agent-browser` 回归

**覆盖：** AC25-05～AC25-12。

**文件：**

- Modify: `tests/e2e/support/fake-model-server.ts`
- Create: `tests/e2e/service-handoff.spec.ts`
- Modify only if cleanup requires: `tests/e2e/fixtures.ts`
- Modify: `tests/integration/terminal/execution-precision.test.ts`
- Modify: `tests/integration/terminal/process.test.ts`

**接口：** fake scenario 新增 `tdd-web-handoff`；端口从测试用户 prompt 的有限 `BACKEND_PORT=<n>` / `FRONTEND_PORT=<n>` 标记读取，不使用宿主环境或固定共享端口。

- [x] **Step 1：移除既有 E2E hash 依赖**

  `slug-fix` 与 `plan-slug-fix` 不再从 Context 正则提取 SHA，直接发新的 `replace_in_file` 参数；保留 read → replace → test 行为与原断言。

- [x] **Step 2：写 `tdd-web-handoff` RED fixture**

  fixture 必须按以下自然轨迹发工具：创建测试 → `node --test` 预期失败 → 创建最小 server/client 实现 → 同一测试通过 → 一次 build/typecheck（若 fixture 提供）→ 后端 service → 前端 service；首次 final 故意缺 URL，第二次读取 Runtime 纠正事实后返回两个实际 URL。

- [x] **Step 3：写浏览器 RED**

  `service-handoff.spec.ts` 断言：页面显示一次 final 纠正后的完整中文 final、两个 Markdown 链接和 completed；点击前端链接能加载任务看板；API 可用；console 无应用错误；run completed 后两个端口仍可访问。

- [x] **Step 4：实现 fixture 最小适配并运行专项 GREEN**

  运行：

  ```text
  pnpm exec playwright test tests/e2e/service-handoff.spec.ts tests/e2e/agent-workflow.spec.ts tests/e2e/plan-mode.spec.ts
  ```

  测试 cleanup 只根据本 fixture 记录的 PID/端口终止服务；不得把清理写入 Agent 自然轨迹或最终回答。

- [x] **Step 5：使用 `agent-browser` 做真实环境检查**

  启动隔离 SEcode dev/test 环境，用 `agent-browser` 实际观察任务流、最终回答、链接、页面、API、console 和 network。若涉及 Next Production 修改，先按全局约束阅读对应本地 Next 文档；若没有，记录“未修改 Next Production”。

- [x] **Step 6：记录真实结果**

  在 Task 实施记录中写入模型请求、工具调用、失败工具、端口收敛次数、最终 URL 是否可访问和资源清理结果；不把合成 fixture 数量等同于真实模型性能。

**完成条件：** 用户报告的真实模式在 production 链路的合成测试和实际浏览器中闭环，零 SHA 参数、最终端口均非 3000、服务保持、链接可点。

### T25-06：全量门禁、审计与 Summary

**覆盖：** AC25-01～AC25-13。

**文件：**

- 不新增业务修改；失败修正必须回到对应 T25 任务白名单和 RED/GREEN。
- Modify: `docs/development/25-agent-tdd-startup-handoff-tasks.md`
- Create: `docs/development/25-agent-tdd-startup-handoff-summary.md`
- Modify: `docs/development/README.md`

**接口：** 不产生新代码接口。

- [x] **Step 1：运行静态与单元门禁**

  ```text
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm test:coverage
  ```

- [x] **Step 2：运行完整 E2E 与双构建**

  ```text
  pnpm test:e2e
  SECODE_NEXT_DIST_DIR=.next-stage25-webpack pnpm exec next build --webpack
  SECODE_NEXT_DIST_DIR=.next-stage25-turbopack pnpm exec next build --turbopack
  git diff --check
  ```

  构建若机械修改 `tsconfig.json`，只精确恢复本阶段构建产生的内容；不得覆盖既有用户修改。

- [x] **Step 3：执行范围与秘密审计**

  核对无 `expectedSha256` 模型契约、无真实 `.env.local` 值、Authorization、provider body、绝对真实工作区、private reasoning、`.only/.skip`、依赖变化、预算放宽或断言弱化。冻结旧 JSONL 中的历史字段必须列出而不是删除。

- [x] **Step 4：精确清理测试资源**

  只清理 `.next-stage25-webpack`、`.next-stage25-turbopack` 和本阶段临时 dataDir/workspace/PID/端口；不清理用户项目、真实 `.secode-data` 或无关进程。

- [x] **Step 5：生成 Summary 并停止**

  Summary 如实记录任务、文件、每条验证、失败/根因/修正/重跑、安全取舍、服务生命周期限制和 T25-07 状态。更新索引为“Summary 待用户审批”后立即停止。

**完成条件：** 全部门禁真实通过、无资源和范围偏差；Summary 待审批。任一门禁未修复则阶段保持阻塞，不生成成功 Summary。

### T25-07：可选真实 provider + `agent-browser` 回归

**覆盖：** AC25-14；不替代 T25-06 自动门禁。

**门禁：** T25-06 自动结果展示后，向用户说明 provider、一次性费用、临时目录、端口、敏感边界和停止点；只有用户再次明确批准才执行。

**文件：**

- Create: `tests/manual/stage25-fixture.ts`
- Create: `docs/development/25-agent-tdd-startup-handoff-acceptance.md`
- Modify: Task/Summary/README 仅记录脱敏事实。

- [ ] 在全新临时 dataDir/workspace 中创建轻量前后端看板；不得复用本次诊断目标项目或真实 Session。
- [ ] 任务明确要求简单 TDD、启动并直接给链接，但不向模型提供内部实现答案。
- [ ] 只执行一次自然 provider run；危险工具由用户按真实请求决定，不自动批准。
- [ ] 验收事件顺序：有效 RED 在 Production 前；GREEN 后仅必要验证；无 `expectedSha256`；生成项目最终端口均非 3000；实际端口与 readiness/final 一致；双 service readiness 成功。不得以固定替代端口、`strictPort` 或冲突重试次数判定通过。
- [ ] 用 `agent-browser` 打开最终链接，检查看板核心交互、API、console/network 和刷新；确认 final 有启动命令、实际链接、验证和限制。
- [ ] 运行后立即记录并精确清理临时资源；失败不自动重试、不修改 Production、不伪造成功。

**完成条件：** 单次真实运行满足 AC25-14 则记录通过；否则如实记录 provider/模型质量阻塞，由用户决定修订 Spec、Task 或接受限制。

### T25-00 实施记录

- 2026-08-31：用户批准 Task v2，并明确允许直接在当前 `main` 工作区实施；未授权 Git 写入或 T25-07。
- 实施前 `git status --short`：`docs/development/00-process.md`、`docs/development/README.md` 为阶段文档修改，阶段 25 Spec/Task 为新增文件；未发现其他用户代码改动。
- 专项基线命令：`pnpm exec vitest run tests/unit/tools/write-file.test.ts tests/unit/tools/replace-in-file.test.ts tests/unit/tools/schemas.test.ts tests/unit/tools/registry.test.ts tests/unit/context/model-language.test.ts tests/unit/agent/runtime-completion.test.ts tests/integration/terminal/execution-precision.test.ts`。
- 基线结果：7 个测试文件、49 个测试全部通过；这些通过仅证明旧 SHA、旧 Prompt 和旧 final 行为基线可复现，不代表阶段 25 已实现。
- 已按 Spec v2 修订 `FR-024`、`NFR-021`、`SEC-007`、`SEC-017`；代码尚未在 T25-00 修改。

### T25-01～T25-05 实施记录

- T25-01 RED：existing `write_file` 无模型 hash、Schema 删除 hash、replace 无 hash 及 rename 前并发改写断言均按预期失败；GREEN 后 8 个文件、61 个测试通过。保留 `read_file`/审计 metadata hash 与执行期内部快照重验，不再暴露模型 hash。
- T25-02 RED：Prompt 旧版缺少简单 TDD、避开 3000 和最终命令/URL要求；GREEN 后 Prompt V11、动态非 3000 端口和 `npm test` RED→GREEN 轨迹通过（3 个文件、23 个测试）。
- T25-03 RED/GREEN：新增 `lib/agent/service-handoff.ts` 纯状态测试及 Runtime 完成/纠正/失败测试；最终 URL 缺失时只允许一次纠正，仍缺失形成结构化失败，不重复工具调用。相关 5 个文件、67 个测试通过。
- T25-04 RED/GREEN：验证成功 service 不被终止、失败/取消会 abort；修正 Runtime 失败和取消终态清理。4 个文件、40 个测试通过。
- T25-05：移除 fake E2E slug hash 依赖；新增 `tdd-web-handoff`，临时子目录内先失败测试、最小实现、同测通过、构建、后端/前端 readiness、缺 URL final 纠正；专项 Playwright 14/14 通过。一次旧语言 E2E 因终态先于 Session 锁释放遇到 `API_SESSION_BUSY`，改为轮询事件 API，保留原断言后全量 E2E 49/49 通过。agent-browser 实测 3100 首页、63588 API、63589 看板和计数交互均通过；服务 PID 52901、53051 已精确停止，临时环境已关闭。
- T25-05 未修改 Next.js Production；因此无需阅读或改写 `node_modules/next/dist/docs/`，浏览器检查仍按 `vercel:agent-browser` 与 `vercel:agent-browser-verify` 完成。

### T25-06 实施记录

- `pnpm lint`、`pnpm typecheck`：通过。
- `pnpm test`：119 个文件、1015/1015 通过；沙箱首次运行的 25 项 EPERM 已以授权环境原命令重跑通过。
- `pnpm test:coverage`：119 个文件、1015/1015 通过；Statements 88.44%、Branches 82.50%、Functions 91.00%、Lines 90.27%。
- `pnpm test:e2e`：Chromium 49/49 通过；首次 48/49 的 `API_SESSION_BUSY` 竞态已修正并重跑。
- Webpack 与 Turbopack production build：均通过；Turbopack 保留既有 `lib/storage/file-safety.ts` 动态 filesystem tracing warning。构建自动加入的临时 tsconfig include 已恢复，`.next-stage25-webpack`/`.next-stage25-turbopack` 已删除。
- `git diff --check`：通过。审计命中仅为负向 hash schema 测试断言与文档说明；无 `.only/.skip`、依赖变更、真实 `.secode-data`/用户工作区写入、`.env.local` 读取或 T25-07 真实 provider 调用。

## 6. 验收追踪

| 验收标准 | 任务 |
| --- | --- |
| AC25-01～AC25-04 | T25-00、T25-01 |
| AC25-05～AC25-08 | T25-02、T25-05 |
| AC25-09 | T25-04、T25-05 |
| AC25-10～AC25-11 | T25-03、T25-05 |
| AC25-12 | T25-05 |
| AC25-13 | T25-06 |
| AC25-14 | T25-07（独立授权） |

## 7. 明确不执行

- 不新增通用 final 文本评分器、服务注册表、停止按钮或第七个工具。
- 不删除 `read_file` 的审计 SHA、旧事件 hash metadata 或冻结历史事实。
- 不要求每个文档、配置、CSS 或静态资源先写测试。
- 不允许自动扫描大量端口、杀未知进程或使用 Shell 环境赋值规避工具边界。
- 不修改 Model/SSE、Context 压缩、Storage、Session API 或工作台视觉。
- 不安装依赖，不修改 package/lock，不自动 commit/push/deploy。

## 8. 回退策略

- 任一 Task 的 GREEN 失败，保留当前最小改动并回到该 Task 的 RED/根因，不叠加下一任务。
- 公共事件或 UI 协议若被证明必须变化，立即停止并修订 Spec；不得在 Task 内自行扩展。
- 工具简化若破坏工作区/symlink/原子性测试，回退 T25-01 实现并保持阶段未完成，不能恢复模型 SHA 作为临时绕过而不修订 Spec。
- service handoff 若误拒普通非服务任务，回退 T25-03 并以无 service accept 的纯函数测试为边界。
- 真实 provider 失败不回滚自动通过的代码，也不自动重试；如实记录为 T25-07 未通过。

## 9. Task 审批

**当前状态：阶段 25 真实回归失败，后续修复转入阶段 26。**

用户曾批准 T25-00～T25-06，并明确允许在当前工作区实施；实施记录不追溯改写。最新真实 run 证明完成证据、TDD、端口与收敛效率仍有缺口，用户明确允许新开阶段，后续修复转入阶段 26。既有批准不自动授权阶段 26 代码、真实 provider、Git 写入、发布或部署。
