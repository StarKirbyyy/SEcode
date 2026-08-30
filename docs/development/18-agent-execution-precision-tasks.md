# 阶段 18 Task（已批准，实施中）：Agent 执行因果判定与写入前置观察

> **执行者要求：** 实施时必须使用 `superpowers:test-driven-development`；可使用 `superpowers:executing-plans` 按任务顺序执行。仓库禁止未经用户授权的 Git commit，因此本计划不包含提交步骤。

**目标：** 通过 System Prompt V6、四个相关工具的中文说明和确定性轨迹回归，使 Agent 不再把非阻塞 warning 当作必须修复的问题，并在 `write_file` 前完成安全、可复用的存在性观察。

**架构：** 不修改工具执行器或持久化协议。模型行为由唯一版本化 System Prompt 与工具定义约束；底层现有 `write_file` 拒绝继续作为并发和偏离契约的安全防线。确定性假模型验证请求中真实可见的契约与工具顺序，真实 LongCat 只在自动门禁后经独立批准执行窄范围回归。

**技术栈：** TypeScript、Vitest、现有 Agent Runtime/Terminal、六个自研本地工具、JSONL 事件存储、OpenAI-compatible 模型客户端。

**Spec：** [`18-agent-execution-precision-spec.md`](./18-agent-execution-precision-spec.md)（2026-08-29 已批准）

## 1. 状态、审批链与停止点

- 当前状态：`已批准`，T18-00～T18-05 已解锁并开始实施。
- 上游阶段：阶段 17 Summary 修订 6 已批准，阶段 17 完成。
- Spec 审批：用户于 2026-08-29 明确回复“批准”，阶段 18 Spec 通过。
- Task 审批：用户于 2026-08-29 明确回复“批准”，语义等价于“阶段18 Task通过”。
- 当前允许：按顺序实施 T18-00～T18-05。
- 当前禁止：运行真实 LongCat；创建 Summary；commit、push、发布、部署或阶段 19 工作。
- 下一门禁：T18-05 自动结果展示后等待用户独立批准 T18-06。
- 中间门禁：T18-05 自动验证结果展示后必须停止；只有用户另行明确批准，才可执行 T18-06 真实 LongCat 回归。

## 2. 全局约束

1. 命令结果只以 `ToolResult.ok`、结构化 `error`、`metadata.exitCode` 和 readiness 为权威事实；stdout/stderr 只是原始通道。
2. warning 默认记录而不主动修复；仅用户要求零 warning、warning 违反验收，或其被配置提升为结构化失败时行动。
3. `write_file` 前必须取得或复用新鲜的父目录/目标事实；既有目标读取最新完整 SHA，新目标省略 `expectedSha256`。
4. 不自动创建父目录、不自动读取/重试/覆盖，不放宽 `FILE_CHANGED`、`parent_not_found` 或 `invalid_expected_hash_semantics`。
5. 不增加第七个工具、durable 事件、错误码、迁移、依赖、provider wire 分支或 UI 状态。
6. 原始 stdout/stderr、路径、命令、工具名、字段名和哈希逐字保留，不翻译、不屏蔽 warning。
7. 不修改 `lib/tools/run-process.ts`、`lib/tools/atomic-write.ts`、Domain、Storage、Server、Client 或 UI。
8. 真实模型、真实用户项目、真实 Session、`.env.local` 和保留的阶段 17 临时根不属于实现范围。

## 3. 文件职责与白名单

### 3.1 允许修改

| 文件 | 职责 |
| --- | --- |
| `docs/development/01-requirements.md` | 在 Task 获批后同步 `FR-023`、`FR-024`、`NFR-021`、`SEC-017` 与 `AC18-*`。 |
| `lib/context/system-prompt.ts` | 将 System Prompt V5 升级为 V6，加入命令因果与写入前置决策规则。 |
| `lib/tools/schemas.ts` | 强化四个相关工具的模型可见中文 function/property descriptions，不改变 Schema 形状。 |
| `tests/unit/context/model-language.test.ts` | 锁定 V6 内容、三 phase 一致性和事实保真。 |
| `tests/unit/context/token-estimator.test.ts` | 锁定 V6 的唯一 bounded phase overlay，不写死新增提示词 token 数。 |
| `tests/unit/tools/schemas.test.ts` | 锁定四工具说明和六工具 Schema/字段集合不变。 |
| `tests/integration/terminal/execution-precision.test.ts` | 新增确定性 warning 与写入顺序轨迹。 |
| `tests/integration/terminal/helpers.ts` | 仅增加阶段 18 确定性夹具所需的可选初始化文件能力；不改变既有调用行为。 |
| `tests/manual/stage18-fixture.ts` | 创建带 marker 的窄范围真实回归临时工作区，不读取凭据。 |
| `docs/development/18-agent-execution-precision-terminal-acceptance.md` | 记录自动轨迹和经独立批准后的真实 LongCat 事实。 |
| 本 Task、阶段 18 Spec、Summary、`docs/development/README.md` | 同步实施、门禁、验证、偏差与审批状态。 |

### 3.2 只读回归

- `lib/tools/write-file.ts`
- `lib/tools/atomic-write.ts`
- `lib/tools/run-process.ts`
- `lib/workspace/boundary.ts`
- `lib/agent/runtime.ts`
- `tests/unit/tools/write-file.test.ts`
- `tests/unit/tools/run-process.test.ts`
- `tests/unit/agent/runtime-plan-mode.test.ts`
- `tests/integration/terminal/runtime.test.ts`

如果红灯证明必须修改只读回归文件、公共接口或安全边界，立即停止并回退到 Spec 修订；不得在实施中自行扩大白名单。

## 4. 依赖顺序

```text
T18-00 需求与基线冻结
  → T18-01 先写红灯契约/轨迹测试
  → T18-02 System Prompt V6 与工具说明最小实现
  → T18-03 确定性终端轨迹和安全回归收口
  → T18-04 临时夹具与真实验收说明
  → T18-05 全量自动门禁并停止
  → 用户独立批准真实 LongCat
  → T18-06 窄范围真实回归
  → T18-07 Summary 与最终停止门禁
```

任务必须严格顺序执行。T18-01 的预期红灯必须在 T18-02 生产修改之前记录。

### 4.1 需求与任务覆盖矩阵

| 需求/验收 | 实施任务 | 主要证据 |
| --- | --- | --- |
| `FR-023`、`AC18-01` | T18-01～T18-03 | 退出 0 + stderr warning 的零写入轨迹、V6 请求捕获 |
| `AC18-02` | T18-01～T18-03 | blocker + warning 非零轨迹，只修 blocker，重跑成功即收敛 |
| `FR-024`、`AC18-03` | T18-01～T18-03 | 缺失父目录、新建、覆盖的真实工具顺序与零可预防错误 |
| `NFR-021`、`AC18-04` | T18-01～T18-03 | 同目录 listing 复用、逐目标 SHA、`FILE_CHANGED` 后重新观察 |
| `SEC-017`、`AC18-05` | T18-02～T18-03 | 三 phase/三 provider 共源契约、Schema 不变、原始输出保真和安全回归 |
| `AC18-06` | T18-05 | lint、typecheck、test、coverage、E2E、build、diff 与依赖/协议复核 |
| `AC18-07` | T18-04、T18-06 | 带 marker 的新临时根、独立授权、真实 LongCat 事件与文件审计 |

## 5. T18-00：同步需求与冻结基线

**文件：**

- 修改：`docs/development/01-requirements.md`
- 修改：本 Task 与 `docs/development/README.md`

**覆盖：** `FR-023`、`FR-024`、`NFR-021`、`SEC-017`，为 `AC18-01`～`AC18-07` 建立正式追踪。

- [ ] **步骤 1：再次核对审批和 dirty worktree**

运行：

```bash
git status --short
sed -n '1,260p' docs/development/18-agent-execution-precision-spec.md
sed -n '1,260p' docs/development/18-agent-execution-precision-tasks.md
```

预期：Spec 和 Task 均有明确批准记录；dirty worktree 与阶段 13～17 既有修改保持不变。

- [ ] **步骤 2：同步正式需求**

将 Spec 第 2、8 节的四项候选需求和七项验收标准逐字同步到 `01-requirements.md`；将 `FR-012` 的 System Prompt 版本从 V5 更新为 V6。不得重编号或改写既有需求。

- [ ] **步骤 3：冻结依赖和协议基线**

运行：

```bash
shasum -a 256 package.json pnpm-lock.yaml
rg -n "SYSTEM_PROMPT_VERSION|CONTEXT_PROTOCOL_VERSION" lib/context
rg -n "LOCAL_TOOL_NAMES|DurableAgentEvent" lib tests/unit/domain
```

记录 package/lock 哈希、当前 `CONTEXT_PROTOCOL_VERSION`、六个工具名和 durable event 集合；阶段结束时逐项复核无变化。

- [ ] **步骤 4：验证文档格式**

运行：`git diff --check`

预期：退出码 0。

## 6. T18-01：先建立失败的 V6 与执行精度契约

**文件：**

- 修改：`tests/unit/context/model-language.test.ts`
- 修改：`tests/unit/context/token-estimator.test.ts`
- 修改：`tests/unit/tools/schemas.test.ts`
- 新增：`tests/integration/terminal/execution-precision.test.ts`
- 修改：`tests/integration/terminal/helpers.ts`（仅测试初始化能力）

**接口：**

- 消费：现有 `renderSystemPolicy(phase)`、`LOCAL_TOOL_DEFINITIONS`、`QueueFakeModel`、Terminal fixture 和真实六工具 Runtime。
- 产出：V6 必须满足的文本哨兵与四条确定性工具序列；不新增生产导出。

- [ ] **步骤 1：把 System Prompt 版本与因果规则写成红灯断言**

将测试标题更新为“使用中文 System Prompt V6”，并加入以下核心断言：

```ts
expect(SYSTEM_PROMPT_VERSION).toBe(6);
for (const policy of [normal, planning, executing]) {
  expect(policy).toContain("ToolResult.ok");
  expect(policy).toContain("stderr 只是输出通道");
  expect(policy).toContain("不单独代表失败");
  expect(policy).toContain("只修复直接原因");
  expect(policy).toContain("list_directory");
  expect(policy).toContain("目标存在");
  expect(policy).toContain("expectedSha256");
  expect(policy).toContain("新鲜事实");
}
```

同时保留现有中文输出、AGENTS、Next.js、审批、验证和原始事实保真断言。

- [ ] **步骤 2：锁定工具说明但保持 Schema 形状**

在 `schemas.test.ts` 中对四个工具分别断言：

```ts
expect(description("run_process")).toContain("结构化结果");
expect(description("run_process")).toContain("stderr");
expect(description("list_directory")).toContain("写入前");
expect(description("read_file")).toContain("目标存在");
expect(description("write_file")).toContain("父目录");
expect(description("write_file")).toContain("expectedSha256");
expect(LOCAL_TOOL_DEFINITIONS.map((item) => item.function.name))
  .toEqual(LOCAL_TOOL_NAMES);
```

`description(name)` 在测试文件内从 `LOCAL_TOOL_DEFINITIONS` 查找并返回 function description；不得导出新的生产 helper。

- [ ] **步骤 3：建立四条确定性 Terminal 轨迹**

新增以下测试用例，模型响应使用现有 `QueueFakeModel`，并在每次请求上断言 system message 包含 V6 哨兵：

1. `treats exit 0 with stderr warning as success without writes`：运行 fixture 的 `npm run warning-only`，工具结果为 `ok: true/exitCode: 0` 且 stderr 含 `FIXTURE_WARNING`；下一响应直接中文总结。断言 `write_file`/`replace_in_file` 请求数为 0。
2. `fixes only the blocker in mixed failure and stops after green rerun`：首次 `npm run build:mixed` 返回非零、`DIRECT_BLOCKER` 与 `NON_BLOCKING_WARNING`；序列只读取并覆盖 `src/blocker.ts`，再次 build 退出 0 但仍含 warning，然后结束。断言 warning fixture 文件从未成为写入目标。
3. `observes parent and target before create, overwrite and batch writes`：先列父目录；缺失父目录经独立工具审批显式创建；新文件无 SHA，既有文件先读后携带返回 SHA 覆盖；同目录两个新文件共享一次 listing。断言没有 `parent_not_found` 或 `invalid_expected_hash_semantics`。
4. `re-observes after FILE_CHANGED instead of bypassing the hash`：首次读取后由测试夹具模拟并发改动，旧 SHA 写入得到 `FILE_CHANGED`；下一轮重新列/读并以新 SHA 成功。断言没有无 SHA 覆盖或删除目标。

工具调用 ID 必须每次唯一，例如：

```ts
const callId = (index: number) =>
  `18000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
```

测试不得模拟 Runtime 成功事件；必须读取真实 JSONL `tool.requested/tool.result/run.completed`。

- [ ] **步骤 4：运行红灯并记录准确原因**

运行：

```bash
pnpm test -- tests/unit/context/model-language.test.ts tests/unit/context/token-estimator.test.ts tests/unit/tools/schemas.test.ts tests/integration/terminal/execution-precision.test.ts
```

预期：因 `SYSTEM_PROMPT_VERSION` 仍为 5、V6 哨兵和新工具说明缺失而失败；既有安全工具测试不应成为失败原因。记录失败测试数和首要断言，不降低断言。

## 7. T18-02：实现 System Prompt V6 与四工具说明

**文件：**

- 修改：`lib/context/system-prompt.ts`
- 修改：`lib/tools/schemas.ts`

**接口：**

- 消费：现有 `AgentPromptPhase`、`renderSystemPolicy()`、Zod Schema 和 `LOCAL_TOOL_DEFINITIONS`。
- 产出：`SYSTEM_PROMPT_VERSION = 6`；Schema 字段、工具名和函数签名保持不变。

- [ ] **步骤 1：升级版本并加入命令因果规则**

将版本常量更新为：

```ts
export const SYSTEM_PROMPT_VERSION = 6 as const;
```

在 `EXECUTION_RELIABILITY_POLICY` 中加入简洁、无生态关键词的规则，必须表达以下完整语义：

```text
ToolResult.ok、结构化 error、metadata.exitCode 和 readiness 是命令成败事实；stdout/stderr 只是输出通道，stderr 或 warning 不单独代表失败。成功且满足验收时记录 warning 后继续；失败混有 warning 时只修复能解释非零退出、readiness 或验收失败的直接原因，原验证重跑成功后停止。仅在用户明确要求零 warning、warning 违反验收或被配置提升为结构化失败时主动处理。
```

- [ ] **步骤 2：加入写入前置观察规则**

在同一 policy 中加入以下决策顺序，不新增 Runtime 状态：

```text
write_file 前复用本 run 的新鲜父目录/目标事实，否则先 list_directory 父目录或最近存在祖先；父目录缺失时显式创建并确认成功。目标存在则 read_file 获取最新完整 SHA 后传 expectedSha256，目标不存在才省略 expectedSha256。同目录批量新建可共享 listing；进程、审批等待、冲突或不确定变化后重新观察；不要用 read_file 探测预期不存在的新文件。
```

normal、planning、executing 必须通过公共 reliability policy 获得相同规则；planning 的只读能力限制保持不变。

- [ ] **步骤 3：强化四工具 function/property descriptions**

只修改描述文本：

- `list_directory`：说明可用于写入前确认父目录和目标条目，结果受 depth/limit 约束。
- `read_file`：说明目标已存在时可取得覆盖所需的完整 SHA，不用于预期不存在探测。
- `write_file`：说明调用前先确认父目录和目标；父目录必须已存在；目标存在必须提供最新 `expectedSha256`，目标不存在必须省略。
- `run_process`：说明以结构化 `ok/error/exitCode/readiness` 判定成败，stdout/stderr 是原始通道且 stderr 不自动等于失败。

不得修改 Zod required/optional、默认值、限制、JSON Schema property 顺序或 `LOCAL_TOOL_NAMES`。

- [ ] **步骤 4：运行红灯集合直到转绿**

运行 T18-01 的同一命令。

预期：全部通过。若行为轨迹仍失败，只允许修正 V6/描述或测试夹具的确定性错误；若需要修改 Runtime/执行器，立即回退 Spec。

## 8. T18-03：确定性轨迹与安全回归收口

**文件：**

- 修改：仅 T18-01 已列测试文件；生产文件原则上不再变化。
- 只读验证：现有写工具、进程、Plan Mode 与 Context 测试。

**覆盖：** `AC18-01`～`AC18-05`、`SEC-017`。

- [ ] **步骤 1：检查轨迹中的真实结果和调用顺序**

每条轨迹必须同时断言：

```ts
expect(events.some((event) => event.type === "run.completed")).toBe(true);
expect(events.filter((event) => event.type === "tool.requested")
  .map((event) => event.data.toolName)).toEqual(expectedToolOrder);
expect(events.filter((event) => event.type === "tool.result")
  .every((event) => event.data.result !== undefined)).toBe(true);
```

warning 轨迹额外检查原始 `FIXTURE_WARNING` 仍存在于 tool result；写入轨迹检查目标文件最终字节和 SHA，不只检查事件数量。

- [ ] **步骤 2：验证直接跳过前置观察仍被拒绝**

运行：

```bash
pnpm test -- tests/unit/tools/write-file.test.ts tests/unit/tools/run-process.test.ts tests/unit/agent/runtime-tools.test.ts tests/unit/agent/runtime-plan-mode.test.ts
```

预期：现有 `parent_not_found`、创建/覆盖 SHA 语义、`FILE_CHANGED`、planning 只读和 stdout/stderr 保真测试全部通过。

- [ ] **步骤 3：运行 Context/Tools/Terminal 专项**

运行：

```bash
pnpm test -- tests/unit/context/model-language.test.ts tests/unit/context/token-estimator.test.ts tests/unit/context/runtime-integration.test.ts tests/unit/tools/schemas.test.ts tests/unit/tools/write-file.test.ts tests/unit/tools/run-process.test.ts tests/integration/terminal/execution-precision.test.ts tests/integration/terminal/runtime.test.ts
```

预期：全部通过；没有修改现有测试断言来适配错误行为。

- [ ] **步骤 4：核对模型与协议边界**

运行：

```bash
rg -n "SYSTEM_PROMPT_VERSION = 6|ToolResult.ok|expectedSha256" lib/context/system-prompt.ts lib/tools/schemas.ts tests
git diff -- lib/domain lib/storage lib/model lib/server lib/client app
```

预期：V6 与契约命中；第二条命令不出现阶段 18 新增修改（工作树中的阶段 13～17 既有内容须按开始时基线区分）。

## 9. T18-04：准备隔离真实回归夹具与人工验收文档

**文件：**

- 新增：`tests/manual/stage18-fixture.ts`
- 新增：`docs/development/18-agent-execution-precision-terminal-acceptance.md`

**接口：**

- 产出：只创建临时根的脚本；输出根路径、工作区路径、marker 路径和预期事实，不启动模型、不读取环境变量。

- [ ] **步骤 1：实现安全夹具生成器**

脚本使用 `mkdtemp(path.join(tmpdir(), "secode-stage18."))` 创建全新根，并写入：

```text
.secode-stage18-marker
workspace/package.json
workspace/scripts/verify.mjs
workspace/src/blocker.ts
workspace/src/existing.ts
workspace/fixtures/non-blocking-warning.txt
workspace/AGENTS.md
```

`warning-only` 必须向 stderr 写 `NON_BLOCKING_WARNING` 并退出 0；`build:mixed` 在 `src/blocker.ts` 未修复时同时输出 `DIRECT_BLOCKER` 与相同 warning 并退出 1，修复后保留 warning 但退出 0。脚本不得安装依赖、初始化 Git 或接触仓库外既有路径。

- [ ] **步骤 2：夹具自检**

运行生成器后，在其输出的临时工作区执行：

```bash
npm run warning-only
npm run build:mixed
```

预期：第一条退出 0 且 stderr 有 warning；第二条退出 1 且同时含 blocker/warning。只记录脱敏临时根 basename，不把绝对路径固化进源码 fixture。

- [ ] **步骤 3：编写真实验收步骤和成功标准**

人工验收文档必须要求真实 Agent：

1. 运行 `warning-only`，不得修改 `fixtures/non-blocking-warning.txt`。
2. 运行 `build:mixed`，只修复 `src/blocker.ts`，重跑成功后停止 warning 修复。
3. 在尚不存在的 `src/generated/` 中创建两个文件，并覆盖 `src/existing.ts`。
4. 使用事件证明父目录观察/创建、新文件无 SHA、既有文件 read→write(SHA)、同目录 listing 复用。
5. 最终再次执行两条验证并给出中文总结。

失败标准包括：对 warning fixture 的非必要写入、`parent_not_found`、`invalid_expected_hash_semantics`、无 SHA 覆盖、自动批准危险操作、未产生最终总结或触碰真实项目。

## 10. T18-05：全量自动门禁并停止等待真实模型授权

**文件：**

- 修改：本 Task、人工验收文档、`docs/development/README.md`

- [ ] **步骤 1：执行完整自动门禁**

依次运行并记录真实结果：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
git diff --check
```

不得把退出码 0 中的 warning 记录成失败，也不得隐藏 warning。任何非零退出先诊断直接原因并重跑相关命令，最终 Summary 同时记录首次失败和修正。

- [ ] **步骤 2：复核无范围漂移**

```bash
shasum -a 256 package.json pnpm-lock.yaml
git diff --name-only
rg -n "api[_-]?key|authorization: bearer|cookie:" docs/development/18-* tests/manual/stage18-fixture.ts tests/integration/terminal/execution-precision.test.ts
```

预期：package/lock 哈希与 T18-00 相同；没有新依赖、密钥、事件、工具、迁移或阶段外生产文件。

- [ ] **步骤 3：更新中间门禁并立即停止**

把自动验证结果、warning 原文摘要、失败/修正和临时根 basename 写入人工验收文档与 Task。不得运行真实 LongCat。

**强制停止点：向用户展示自动门禁证据，并请求独立批准 T18-06。此前任何“批准”只批准 Spec 或 Task，不能复用为真实模型授权。**

## 11. T18-06：经独立批准后执行窄范围真实 LongCat 回归

**前置条件：** 用户已经在看到 T18-05 自动结果后明确批准真实 LongCat 回归。没有该回复，本任务保持未执行。

**文件：**

- 修改：`docs/development/18-agent-execution-precision-terminal-acceptance.md`
- 修改：本 Task 实施记录
- 外部临时数据：仅 T18-04 新建且带 marker 的系统临时根

- [ ] **步骤 1：创建新的真实回归根**

每次真实回归重新运行 `stage18-fixture.ts`，不得复用自动测试、阶段 17 或失败回归根。只通过现有 config API/CLI 确认 LongCat profile `configured=true`；不读取或输出 Key。

- [ ] **步骤 2：提交单个窄任务并逐项处理审批**

任务正文明确列出 T18-04 的五步目标，但不直接告诉模型具体工具参数。每个危险工具审批必须核对精确 program/args/cwd 后单独决定；计划批准不得代替工具批准。

- [ ] **步骤 3：审计真实事件和文件**

统计模型请求、工具请求、`parent_not_found`、`invalid_expected_hash_semantics`、`FILE_CHANGED`、approval、终态及最终写入路径。独立运行 `npm run warning-only` 和 `npm run build:mixed`，检查 warning 保留、退出码和文件内容。

- [ ] **步骤 4：如实记录结论**

只有 `AC18-01`～`AC18-05` 全部满足且产生 `run.completed` 中文总结时才记为真实回归通过。概率性偏离、超时或外部服务失败必须原样记录，不得修改夹具或降低成功标准后伪装通过。

临时根默认保留供 Summary 审核；清理需要用户另行明确授权。

## 12. T18-07：Summary、追踪矩阵与最终停止门禁

**文件：**

- 新增：`docs/development/18-agent-execution-precision-summary.md`
- 修改：本 Task、人工验收文档、`docs/development/README.md`

- [ ] **步骤 1：建立验收追踪矩阵**

逐项映射 `FR-023`、`FR-024`、`NFR-021`、`SEC-017`、`AC18-01`～`AC18-07` 到实际代码、自动测试、真实事件或明确失败证据。

- [ ] **步骤 2：记录全过程**

Summary 必须包含：批准记录、红灯、最小实现、专项和全量命令、warning、失败与修正、文件清单、依赖/协议复核、真实 LongCat 数量与终态、偏差、临时根状态和阶段 19 影响。

- [ ] **步骤 3：执行最终文档检查**

运行：

```bash
git diff --check
rg -n "待用户审批|已批准|阶段 18|阶段 19" docs/development/18-* docs/development/README.md
```

预期：Task 标为已实施，Summary 标为待用户审批，README 指向实际文档且阶段 19 仍锁定。

- [ ] **步骤 4：立即停止**

**Summary 生成后不得开始阶段 19、commit、push、发布、部署或清理保留临时根。必须等待用户明确回复“阶段18 Summary通过”。**

## 13. 回退与失败处理

1. V6 文本造成中文合规、phase、Context token 或 provider 请求回归：只在已批准语义内压缩措辞并完整重跑 T18-03；改变规则需回退 Spec。
2. 工具描述修改改变 JSON Schema 字段、required、默认值或调用解析：撤销该结构变化，只保留 description；不得更新调用方适配未批准的新 Schema。
3. 确定性轨迹需要 Runtime/执行器修改才能通过：停止，记录红灯证据并回退 Spec。
4. 并发写入触发 `FILE_CHANGED`：这是安全防线成功，不得吞掉；模型须重新观察，仍失败则如实结束。
5. 全量命令非零：记录直接原因、最小修复和重跑；不得仅因输出位于 stderr 就判失败，也不得因称为 warning 就忽略非零退出。
6. 真实 LongCat 不可用或额度受限：记录外部阻塞，不伪造真实通过；确定性自动证据仍可进入 Summary，但 `AC18-07` 标为阻塞或失败。

## 14. 明确不执行

- 不修复阶段 17 R6 的 HTTP/E2E、并发注册唯一性、嵌套 Git、总时限或最终总结通用问题。
- 不添加 warning 分类库、关键词表、stdout/stderr 过滤器或生态专用 parser。
- 不让 `write_file` 或 Runtime 隐式调用其他工具。
- 不修改用户 `.env.local`、真实项目、真实 Session 或阶段 17 临时根。
- 不安装/升级依赖，不修改 package/lock，不做 Git 写操作或阶段 19 最终材料。

## 15. Task 审批清单

- [x] 文件范围与 Spec 一致。
- [x] TDD 红灯先于生产实现。
- [x] warning 因果和写入前置观察均有确定性自动轨迹规划。
- [x] 底层工具拒绝、安全、协议和原始输出保真保持不变。
- [x] 全量自动门禁与真实 LongCat 独立审批分离。
- [x] Summary 和阶段 19 停止点明确。
- [x] 用户于 2026-08-29 批准本 Task。

**当前停止点：按批准顺序实施 T18-00～T18-05；自动结果展示后停止，未经新的明确批准不得执行 T18-06。**

## 16. 实施记录

### 16.1 Task 审批与 T18-00 基线

- [x] 用户于 2026-08-29 明确回复“批准”，解锁 T18-00～T18-05。
- [x] 开始时位于既有 `main` 共享工作区；阶段 13～17 dirty baseline 原样保留，未 reset、stash、commit 或创建缺失既有修改的隔离 worktree。
- [x] `package.json` SHA-256：`5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13`。
- [x] `pnpm-lock.yaml` SHA-256：`5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683`。
- [x] `CONTEXT_PROTOCOL_VERSION = 1`；System Prompt 实施前为 V5；工具集合仍为六个，durable event 协议不在本阶段修改。

### 16.2 T18-01～T18-02：RED/GREEN

- [x] RED：目标 4 个文件、26 项中 7 项因 V5、缺失因果/写入契约和旧工具说明稳定失败；四条 Terminal 轨迹本身完成。
- [x] 最初在模型回调内直接断言导致 4 项超时；仅修正测试结构为轨迹结束后检查捕获请求，再次得到可解释 RED。
- [x] GREEN：`SYSTEM_PROMPT_VERSION` 升级为 6；公共 reliability policy 加入结构化命令因果和 `write_file` 前置观察；四工具仅修改 description，Schema 形状不变。
- [x] V6 初稿使 planning prompt 超过 1500 token；在保留阶段 17 既有哨兵和阶段 18 全部语义下压缩公共/phase 文案，最终 4 文件、26 项通过。

### 16.3 T18-03：确定性轨迹与安全专项

- [x] warning 成功、混合失败、父目录/新建/覆盖/批量、陈旧 SHA 后重观察四条真实 Terminal 轨迹通过。
- [x] 安全专项在受限沙箱内有 6 项 readiness 因 `listen EPERM` 失败；授权后本机重跑为 4 文件、25 项通过，无产品修复。
- [x] Context/Tools/Terminal 跨层专项 8 文件、60 项通过。

### 16.4 T18-04：隔离夹具

- [x] 新增不读取环境变量、不安装依赖、不初始化 Git 的 `stage18-fixture.ts` 和人工验收文档。
- [x] 自检临时根 basename：`secode-stage18.jcLJ1Q`；`warning-only` 退出 0 并保留 warning，`build:mixed` 退出 1 且同时保留 blocker/warning。
- [x] 临时根按 Task 默认保留，未清理或用于真实模型。

### 16.5 T18-05：全量自动门禁（build 环境阻塞）

- [x] lint 修正新测试 1 error/2 warnings 后退出 0，只保留 coverage 2 条既有 warning。
- [x] typecheck 修正新测试 readonly 类型后退出 0。
- [x] `pnpm test` 111 文件/885 项通过；coverage 111/885 通过，行覆盖率 90.04%。
- [x] 38 项 E2E 的 `.last-run.json` 为 `passed` 且无失败测试；大量既有颜色环境 warning 不改变该结构化结果。
- [ ] build 未通过：用户随后明确批准沙箱外生产构建，但原工作区和隔离镜像的授权执行仍在 Turbopack 内部端口处返回 EPERM；隔离镜像的普通受限执行可越过端口阶段，却因禁止访问 Google Fonts 而失败。
- [x] `git diff --check`、package/lock 哈希、秘密和协议边界复核通过。
- [ ] T18-05 未完成；T18-06 真实 LongCat 和 T18-07 Summary 保持锁定。

**当前阻塞点：当前宿主没有同时允许 Turbopack 内部端口与 Google Fonts 网络访问的执行路径。需要在正常联网且允许本机子进程通信的环境中取得原样 `pnpm build` 结果；在此之前不得完成 T18-05，也不得请求或执行 T18-06。**
