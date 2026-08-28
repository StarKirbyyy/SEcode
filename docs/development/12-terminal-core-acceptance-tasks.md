# 阶段 12 Task：终端测试与核心验收

## 1. 文档状态与审批链

- 当前状态：T12-00～T12-17 已执行；进度 Summary 待用户审批；LongCat 外部阻塞
- 生成日期：2026-08-28
- 已批准 Spec：[12-terminal-core-acceptance-spec.md](./12-terminal-core-acceptance-spec.md)
- Spec 审批记录：用户于 2026-08-28 明确批准
- 当前允许：用户审阅进度 Summary；保留临时证据；等待 LongCat-compatible 端点
- 当前禁止：超出白名单、未经修订审批修改产品代码、安装依赖或进入阶段 13
- 下一步门禁：用户审批本进度 Summary；即使获批，LongCat 冒烟完成前仍禁止阶段 13

审批链：

```text
阶段 12 Spec（已批准）
  → 本 Task（已批准）
  → T12-00～T12-12（已执行；LongCat 外部阻塞单独保留）
  → T12-13 第一次人工 compaction（失败并停止）
  → 实施修订 R1（已批准并完成）
  → T12-13 新 Session 重验（已通过）
  → 阶段 12 进度 Summary（已生成，待审批）
```

## 1.1 实施修订 R1：test-only 摘要请求兼容（已批准并完成）

### 1.1.1 观察与最小复现

T12-13 使用已批准的 `contextWindow=14000` 和 test-only generic server。前 5 个固定回合完成；第 6 回合的 `read_file` 成功后发生：

```text
run.failed: AGENT_CONTEXT_FAILED
context.compacted: 0
```

只读事件回放确认：

- seq 63 的基线估算为 10602 tokens，输入预算为 10500。
- compaction 选择器成功选出 `evicted=2`、`retained=9`、`throughSeq=14`。
- 摘要生成失败为 `CONTEXT_SUMMARY_INVALID`，原因是模型返回了 tool call 而非纯文本。
- 生产 `chat-mapper` 在工具数组为空时省略 HTTP body 的 `tools` 字段。
- test-only server 仅在 body 包含显式 `tools: []` 时返回摘要；字段缺失时错误返回 `read_file` tool call。
- 对同一 loopback 端点的差分复现稳定为：显式空数组得到摘要，省略字段得到工具调用。
- 既有相关测试 5 files / 23 tests 全部通过，说明缺少“生产 generic client + 空工具摘要路径”的正确回归接缝。

该问题属于阶段 12 test-only helper 与既有生产传输契约不一致，不是 Agent/context/model production 语义缺陷。第一次失败的 64 条 JSONL 事件和 ledger `A12-10=failed` 必须永久保留，不得改写。

### 1.1.2 修订任务清单

R1 获批后严格顺序执行：

1. **R1-01 先写失败回归**：只修改 `tests/integration/terminal/manual-server.test.ts`，通过生产 `createModelClient` 发起 `tools: []` completion；修正前必须稳定得到错误 tool call，并使新断言失败。
2. **R1-02 最小 helper 修正**：只修改 `tests/manual/openai-compatible-server.ts`；对摘要请求同时接受 production 省略 `tools` 与显式 `tools: []`，仍保持带非空 tools 的普通请求返回固定 `read_file` 调用。
3. **R1-03 定向验证**：运行 manual-server 集成测试、context compaction/summary/runtime integration、Terminal event renderer、lint 和 typecheck；不得修改 production、配置、依赖或阈值。
4. **R1-04 新证据运行**：关闭旧 listener，使用新 ephemeral port 和全新 `data/t12-13-r1` Session；仍使用 `contextWindow=14000`、相同 fixture 和最多 12 个固定回合，不复用失败 Session。
5. **R1-05 compaction 与恢复**：首次出现 `context.compacted` 后停止新增回合，核验 throughSeq/retainedRange、旧 JSONL 未重写；退出并恢复新 Session，再完成一次小任务。
6. **R1-06 账本保真**：新尝试通过后可将 A12-10 更新为 `passed`，但 events/verification/result 必须同时保留第一次失败短 Session/Run、`CONTEXT_SUMMARY_INVALID` 根因和 R1 修复证据。

### 1.1.3 文件与安全边界

R1 只允许修改原 Task 已批准白名单中的：

```text
tests/manual/openai-compatible-server.ts
tests/integration/terminal/manual-server.test.ts
docs/development/12-terminal-core-acceptance-tasks.md
docs/development/README.md
```

仍禁止修改 `lib/**`、`cli/**`、`app/**`、package/lock、contextWindow、保留回合数、token 估算、Agent 终止条件和真实 provider 配置。server 继续只监听 loopback，不读取 Key、不记录 request body/header。

### 1.1.4 R1 验收与停止条件

通过必须同时满足：

- 新回归测试在 helper 修正前失败、修正后通过。
- production generic client 的空工具请求得到 `finishReason=stop`、纯文本摘要、零 tool calls。
- 非空工具请求仍得到唯一 `read_file` tool call。
- 新人工 Session 在 12 回合内出现合法 `context.compacted`，恢复后小任务完成。
- 原失败 Session 和 ledger 失败事实未删除、未改写。
- lint/typecheck 与相关自动测试通过，listener 正常关闭且无后台进程。

若仍发生预算、摘要、恢复错误，立即停止，不再修改阈值或 helper 行为，进入新的失败分类。

### 1.1.5 R1 审批记录

- 当前审批结果：用户已批准。
- 审批时间：2026-08-28。
- 本次批准解锁：R1-01～R1-06。
- 审批后仍不解锁：LongCat 替代、production 修复、阶段 13、Summary 完成结论。

### 1.1.6 R1 实施结果

- R1-01：新增生产 generic client 空工具摘要回归；修正前 1/8 失败，实际返回 `tool_calls/read_file`。
- R1-02：只修改 test-only server，使省略 `tools` 与显式 `tools: []` 均进入摘要路径。
- R1-03：修正后 server 8/8；相关 5 files/24 tests、lint、typecheck 全部通过。
- R1-04：使用全新短 Session `3706f500`；第 6 回合在 seq 64 写入 compaction，`throughSeq=14`、`retainedRange=15–63`。
- R1-05：退出时稳定序号 68；恢复后小任务完成，并在 seq 76 写入第二次合法 compaction，最终 seq 80。
- R1-06：原失败短 Session `29f6ad7c` 的 64 条事件和失败终态完整保留；ledger 同时记录原失败和 R1 通过事实。
- server 通过 SIGTERM 退出，listener 已关闭，后台相关进程数为 0。

## 2. 任务目标

把已批准 Spec 的 A12-01～A12-13 验收场景拆成可执行、可停止、可复核的任务，完成以下产物：

1. 一个位于系统临时目录、无第三方依赖、初始测试确定性失败的 Git fixture。
2. 一个只服务 compaction 人工展示的 loopback OpenAI-compatible test-only server 及确定性测试。
3. DeepSeek 与 LongCat-compatible 各一次真实工具冒烟证据。
4. 六工具、完整修复闭环、审批、取消、恢复、工作区保护和 compaction 的逐项结果。
5. secret/reasoning/capability/control 零泄漏审计。
6. 全仓顺序回归和详细阶段 12 Summary。

本阶段不以产生产品代码为目标。若验收全部通过，允许阶段 12 最终只有 test-only helper、测试和文档变更；若发现缺陷，必须先按本 Task 的停止规则重新审批。

## 3. 已批准且不可临时改变的决策

1. 真实人工入口只能是 `pnpm agent`，不新增 pipe/batch CLI。
2. 所有 Agent 写入和进程只针对独立临时 Git fixture，不使用 SEcode 仓库或用户真实项目。
3. fixture data root 必须位于 workspace 外。
4. DeepSeek、LongCat-compatible 都要通过真实工具冒烟；LongCat 配置由用户提供。
5. 完整修复闭环至少由一个真实 profile 完成。
6. 六工具、审批、取消、恢复、compaction、安全审计分别记录。
7. 不故意诱导错误修改；初始失败基线到最终通过即满足闭环。
8. 真实调用有最大任务/重试次数，不做无界压测。
9. LongCat 缺失只能记 `blocked_external`，不能宣称阶段完成。
10. 发现公共语义缺陷必须回到所属阶段 Spec，不能在本阶段绕过。
11. 不安装新依赖、不自动 commit/push、不提交真实会话或凭据。
12. 阶段 12 Summary 获批前禁止 Route Handler、NDJSON 和 UI。

## 4. 精确文件与状态边界

### 4.1 Task 编写阶段实际修改

```text
docs/development/12-terminal-core-acceptance-spec.md
docs/development/12-terminal-core-acceptance-tasks.md
docs/development/README.md
```

### 4.2 Task 获批后的仓库白名单

```text
tests/manual/openai-compatible-server.ts
tests/integration/terminal/manual-server.test.ts
docs/development/12-terminal-core-acceptance-tasks.md
docs/development/12-terminal-core-acceptance-summary.md
docs/development/README.md
```

只有 test-only server 的测试确实需要复用现有 helper 时，允许修改：

```text
tests/integration/terminal/helpers.ts
```

该条件路径在修改前必须先证明无法通过新测试文件内部 helper 完成，并把原因写入 Task 实施记录；否则不得修改。

### 4.3 运行时临时路径

获批后允许在一个由 `mktemp -d` 生成并经过前缀/realpath 检查的根目录内创建：

```text
<temp-root>/workspace/**
<temp-root>/outside/**
<temp-root>/data/**
<temp-root>/evidence/**
```

这些不是仓库产物，不得 Git add；Summary 审批前保留，之后由用户决定是否删除。

### 4.4 明确禁止修改

```text
app/**
cli/**
lib/domain/**
lib/model/**
lib/workspace/**
lib/tools/**
lib/approval/**
lib/storage/**
lib/agent/**
lib/context/**
lib/terminal/**
tests/unit/**
package.json
pnpm-lock.yaml
next.config.ts
tsconfig.json
vitest.config.ts
eslint.config.mjs
.env*
.gitignore
```

本 Task 不预授权任何产品修复。若真实验收发现产品缺陷，立即执行 T12-14 分类并停止；符合既有语义的实现修正先修订本 Task，公共语义变化回到所属 Spec。

## 5. 操作者与凭据职责

| 工作 | 主操作者 | 约束 |
| --- | --- | --- |
| 基线、fixture、test-only server、自动测试 | 开发 Agent | 不读取真实 Key，不调用外网模型 |
| DeepSeek/LongCat 环境变量输入 | 用户 | 在自己的 TTY 中 `read -rs`，不发送 Key |
| `pnpm agent` 真实模型交互 | 用户 | 使用共同临时路径，按固定 prompt 操作 |
| approval allow/reject/cancel | 用户 | 只对 Task 中精确安全参数操作 |
| JSONL/fixture 脱敏检查 | 开发 Agent | 只输出计数、事件类型、相对路径和短 ID |
| 失败分类、回归、Summary | 开发 Agent | 不把用户口头成功替代事件事实 |

Codex 进程不继承用户独立 shell 的临时 `export`。不得让用户把 Key 粘贴到聊天、工具 stdin、命令参数、Task 文档或证据文件中。真实操作完成后，用户只回复场景状态、短 Session/Run ID 和不含 secret 的错误码；开发 Agent再从共同 data root 检查 durable 事件。

## 6. 全局执行纪律

1. 开始每个 T12 任务前重读本 Task 对应节和 Spec 对应 A12 场景。
2. 一次只执行一个任务；最小验证通过后才能进入下一项。
3. 真实模型每个场景使用独立或明确记录的 Session，不混用 provider。
4. 每个 Agent run 结束前不提交下一任务；active 时只使用 status/approval/cancel/exit。
5. 原始终端输出不直接写入仓库；只在临时 evidence 中保留，Summary 使用脱敏摘要。
6. 每次失败记录：场景、时间、profile、短 ID、事件顺序、公开错误、重试次数和下一动作。
7. 不并行运行全仓 Vitest/lint/typecheck/build，避免既有 fsync/CPU 竞争。
8. 除 T12-16 已批准的 `pnpm install --frozen-lockfile` 锁一致性检查外，不运行 `pnpm approve-builds`、`pnpm add/install`、下载器或任何依赖变更命令。
9. 不使用 `curl -v`、shell tracing、环境 dump、原始 HTTP debug 或打印 Key 长度/尾部。
10. 任何未列出的危险 invocation 默认 `/reject`；任何工作区/data path 不一致立即退出。

## 7. 结果状态和证据账本

### 7.1 固定状态

```text
passed
failed
blocked_external
not_run
```

### 7.2 临时 ledger

T12-01 创建 `<temp-root>/evidence/ledger.json`，只使用以下结构：

```json
{
  "protocolVersion": 1,
  "createdAt": "ISO-8601",
  "scenarios": [
    {
      "scenario": "A12-01",
      "status": "not_run",
      "profile": "none",
      "session": null,
      "run": null,
      "events": [],
      "changedPaths": [],
      "verification": [],
      "approval": "none",
      "result": ""
    }
  ]
}
```

账本禁止字段：Key、Authorization、base URL、完整绝对路径、raw transcript、reasoning、continuation、capability、完整事件对象、stack/cause。Session/Run 只保留 UUID 前 8 字符。

### 7.3 更新规则

- 每完成或停止一个场景立即原子更新 ledger。
- 自动测试和真实 provider 结果写入不同 verification 条目。
- `blocked_external` 必须注明缺少的环境类别，但不记录变量值。
- 只有真实 event/命令事实才能设为 `passed`。
- Summary 从 ledger 和重新读取的 JSONL 生成，不从记忆补写。

## 8. 依赖顺序

```text
T12-00 审批链与基线
  → T12-01 证据账本
  → T12-02 精确临时 fixture
  → T12-03 test-only 兼容端点
  → T12-04 无凭据自动回归
  → T12-05 DeepSeek 真实冒烟
  → T12-06 LongCat 真实冒烟
  → T12-07 六工具逐项验收
  → T12-08 完整修复闭环
  → T12-09 approval allow/reject
  → T12-10 cancel 与子进程收口
  → T12-11 Session 恢复
  → T12-12 工作区/敏感路径保护
  → T12-13 compaction 可见性
  → T12-14 错误与缺陷分类门禁
  → T12-15 secret/reasoning/control 审计
  → T12-16 全仓顺序门禁
  → T12-17 Summary 与用户审批
```

T12-05/06 需要用户外部配置；若其中一个临时阻塞，可先执行不依赖该 provider 的 T12-07～15，但不得跳过 ledger 状态或执行 T12-17 的“全部通过”结论。

## 9. T12-00：审批链、工作树和基线

### 输入

- 已批准阶段 12 Spec。
- 本 Task（获批后）。
- 阶段 11 已批准 Summary 和当前工作树。

### 操作

1. 确认 Spec/Task 状态与用户审批记录一致。
2. 运行 `git status --short`，保存用户已有变更列表，不清理、不覆盖。
3. 记录 Node、pnpm 版本和 package/lock hash。
4. 顺序运行：

```text
pnpm exec vitest run tests/unit/terminal tests/integration/terminal
pnpm lint
pnpm typecheck
```

5. 确认仓库根没有新 `.secode-data`、真实 transcript、Key 或后台 Agent。

### 最小验证

- Terminal 预期至少保持阶段 11 的 13 files / 66 tests。
- lint 0 warning，typecheck exit 0。
- 只有已知文档和本 Task 后续批准文件存在差异。

### 停止条件

任一基线失败、package/lock 非预期变化、出现未知业务差异时停止，不创建 fixture。

### 完成条件与覆盖

- 基线被记录为 A12-01 的第一部分。
- 覆盖 NFR-001/002/003/006/008、COM-001–004。

## 10. T12-01：临时根和证据账本

### 操作

1. 使用 `mktemp -d` 创建唯一 `<temp-root>`；解析 realpath 并确认它位于系统临时目录下且不是 `/`、home、仓库根或其祖先。
2. 创建 `workspace`、`outside`、`data`、`evidence` 四个子目录。
3. 再次核对 `workspace` 与 `data` 互不包含。
4. 创建 ledger v1，预置 A12-01～A12-13 为 `not_run`。
5. 将 `<temp-root>` 的实际路径只在当前运行上下文和用户终端中传递，不写入仓库文档。

### 最小验证

- 四个目录均为真实目录、无 symlink。
- ledger 可 JSON.parse，只有批准字段。
- `git status --short` 不包含临时路径。

### 停止条件

路径无法证明安全、临时根落入仓库/home 广泛路径、ledger 含绝对路径或敏感字段时停止。

### 完成条件与覆盖

- 后续所有动态状态有唯一、隔离、可恢复位置。
- 覆盖 SEC-001/002/006/008、NFR-008。

## 11. T12-02：建立精确 Git fixture

### 11.1 固定文件内容

`package.json`：

```json
{
  "name": "secode-stage12-fixture",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "slow": "node -e \"setTimeout(() => {}, 60000)\""
  }
}
```

`README.md`：

```markdown
# Slugify contract

`slugify(value)` must trim outer whitespace, convert every run of whitespace to one hyphen, and lowercase the result.
Do not change or remove tests. Do not install dependencies. Do not commit changes.
```

`src/slug.mjs`：

```js
export const FIXTURE_MARKER = "SECODE_STAGE12_SLUG";

export function slugify(value) {
  return value.toLowerCase().replace(" ", "-");
}
```

`tests/slug.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";

import { slugify } from "../src/slug.mjs";

test("lowercases and joins one space", () => {
  assert.equal(slugify("Hello World"), "hello-world");
});

test("trims and collapses repeated spaces", () => {
  assert.equal(slugify("  Hello   World  "), "hello-world");
});

test("normalizes tabs", () => {
  assert.equal(slugify("Hello\tWorld"), "hello-world");
});

test("preserves an existing slug", () => {
  assert.equal(slugify("Already-Slugged"), "already-slugged");
});
```

`outside/sentinel.txt`：

```text
SECODE_STAGE12_OUTSIDE_SENTINEL
```

另创建：

- 空目录 `workspace/notes/`。
- `workspace/escape-link` symlink，精确指向 `<temp-root>/outside/sentinel.txt`。
- `workspace/context/chunk.txt`：精确 2048 个 ASCII `C` 后加 LF；用于 compaction，不参与 slug 测试。

### 11.2 初始 SHA-256

| 文件 | UTF-8 bytes | SHA-256 |
| --- | ---: | --- |
| `package.json` | 196 | `4d62773408417b63a72201f7eae395ed149308e8a1028033aecfbc2419eab9b8` |
| `README.md` | 221 | `795b87e0fc189ea1a1d6c1f534a26142bea6589c0e199f07ffa6aa6f8aefca54` |
| `src/slug.mjs` | 137 | `f3a126517c9c9a87f257fc6952838c7cca69bd8d94c8af7e3f807d4c8c772c88` |
| `tests/slug.test.mjs` | 544 | `2921ae08a1dce002d2c2d29cf3e9dec6f2a9b45239bb125bd648c01a091db9bd` |
| `outside/sentinel.txt` | 32 | `aa294ddb1db42c5215d697325f3220b461070ef6613c60388966b8f81ca52c8e` |

Task 实施时必须以字节重新计算并匹配；任何不匹配先修正 fixture，不改变表中基线。

### 11.3 Git 和测试基线

1. 在 workspace 内 `git init`。
2. 以命令级临时 identity 完成唯一基线 commit；不修改全局/local Git config。
3. 不生成 lockfile，不安装依赖。
4. 执行 `pnpm test`，预期 exit 1、4 tests 中 2 passed / 2 failed。
5. 记录 sentinel hash 和 mtime。
6. 确认 `git status --short` 为空。

### 最小验证

- 文件 hash、失败测试数量、symlink 目标、Git clean 全部精确。
- `data` 不在 Git workspace。

### 停止条件

初始测试不是预期 2/2、fixture hash 不匹配、Git 基线不干净、symlink 越出 `<temp-root>` 时停止。

### 完成条件与覆盖

- 后续 Agent 任务有确定性失败与安全边界。
- 覆盖 FR-001/003/004、SEC-001/002/007/008。

## 12. T12-03：test-only OpenAI-compatible server

### 涉及文件

```text
tests/manual/openai-compatible-server.ts
tests/integration/terminal/manual-server.test.ts
```

### 生产隔离

- server 只能被手工/测试命令直接运行，不能从 `lib/**`、`app/**` 或 `cli/**` import。
- 不修改 package scripts 或依赖。
- 绑定 `127.0.0.1`、请求端口 0，由 OS 分配。
- 不读取 process env 中的 Key，不记录 headers/body/messages。
- 限制 request body 为 2 MiB，超限返回有限 413。
- 只支持 `GET /health` 和 `POST /v1/chat/completions`。

### 固定协议行为

1. 启动时只输出以下无 secret 配置提示：

```text
OPENAI_COMPAT_BASE_URL=http://127.0.0.1:<port>/v1
OPENAI_COMPAT_MODEL=secode-stage12-fixture
OPENAI_COMPAT_CONTEXT_WINDOW=14000
OPENAI_COMPAT_SUPPORTS_THINKING=false
```

2. Chat 请求 `tools.length === 0` 时，流式返回一个固定中文压缩摘要，finish reason `stop`。
3. 最后一条消息 role 为 `tool` 时，流式返回固定最终文本，finish reason `stop`。
4. 其他有工具请求返回唯一 `read_file` tool call，arguments 为 JSON 字符串 `{"path":"context/chunk.txt"}`，finish reason `tool_calls`。
5. tool call ID 使用进程内递增有限标识，不包含时间、路径或输入。
6. SSE 以多个 chunk 输出并以 `[DONE]` 结束，用于覆盖真实 transport 聚合。
7. SIGINT/SIGTERM 关闭 listener，不留下后台端口。

### 测试

`manual-server.test.ts` 使用真实 loopback ephemeral port，至少覆盖：

- health 200。
- 普通请求得到 tool call SSE。
- tool-result 请求得到 final SSE。
- tools 空数组得到 summary SSE。
- 非法 method/path/body/超限得到有限错误。
- server 输出不含 headers/body/Authorization/绝对路径。
- close 后端口释放，无 open handle。

### 最小验证

```text
pnpm exec vitest run tests/integration/terminal/manual-server.test.ts
pnpm lint
pnpm typecheck
```

### 停止条件

需要修改 production model/terminal、增加依赖、监听非 loopback 或保存请求内容时停止并回到 Task 修订。

### 完成条件与覆盖

- 提供无费用、确定性的真实 HTTP/SSE compaction 人工入口。
- 覆盖 FR-004/010、NFR-002/003/005/006、SEC-006、COM-001–003。

## 13. T12-04：无凭据自动回归

### 操作

顺序执行：

```text
pnpm exec vitest run tests/unit/model
pnpm exec vitest run tests/unit/workspace tests/unit/tools tests/unit/approval
pnpm exec vitest run tests/unit/storage tests/unit/agent tests/unit/context
pnpm exec vitest run tests/unit/terminal tests/integration/terminal
pnpm agent -- --help
```

专项确认：

- 模型 401/429/5xx、超时、SSE 分片、arguments string/object。
- 六工具成功/失败/哈希/输出限制。
- allow/approval/deny 三态。
- Agent 完成/取消/恢复/重复错误/限制。
- Context 完整回合与 compaction。
- Terminal renderer/writer/TTY/审批/取消/恢复。

### 最小验证

- 所有目标文件通过，无 network、Key、用户目录访问。
- help exit 0 且不创建数据目录。

### 停止条件

任何既有测试失败先诊断；不得继续真实模型测试来掩盖本地回归。

### 完成条件与覆盖

- A12-01 自动部分与 A12-09/10/11 确定性基础成立。
- 覆盖全部核心 FR/NFR/SEC/COM。

## 14. T12-05：DeepSeek 真实工具冒烟

### 用户前置操作

在用户自己的 shell：

```zsh
unset DEEPSEEK_BASE_URL DEEPSEEK_CONTEXT_WINDOW
read -rs "DEEPSEEK_API_KEY?DeepSeek API Key: "
export DEEPSEEK_API_KEY
echo
export DEEPSEEK_MODEL="deepseek-v4-flash"
export SECODE_DATA_DIR="<temp-root>/data"
```

用户只执行不回显的存在/前后空白检查；不发送 Key、长度或尾部。随后启动：

```zsh
pnpm agent -- \
  --workspace "<temp-root>/workspace" \
  --model deepseek \
  --title "阶段12 DeepSeek 冒烟" \
  --data-dir "<temp-root>/data"
```

### 固定 prompt

```text
必须实际使用工具完成这个只读任务：先调用 list_directory 列出工作区根目录，再调用 read_file 读取 README.md，最后只依据工具事实总结项目约束。不要修改文件，不要运行命令。
```

### 预期事件

```text
run.started
model.requested
tool.requested(list_directory)
tool.started
tool.result(ok=true)
model.requested
tool.requested(read_file)
tool.started
tool.result(ok=true)
model.requested
assistant.message
run.completed
```

工具顺序允许模型合并或先读取，但两个工具必须实际成功。最多一次等价重试；第二次仍缺工具事件记 `failed`。

### 最小验证

- JSONL 事件与终端顺序一致。
- workspace Git 仍 clean，sentinel 不变。
- 无 `reasoning_content`、Key 或 Authorization。

### 停止条件

401/402/网络不可用记外部错误并停止该场景；解析/工具关联错误记实现失败并进入 T12-14。

### 完成条件与覆盖

- A12-02 `passed`。
- 覆盖 FR-002/003/004/005/009、NFR-003/005、SEC-006。

## 15. T12-06：LongCat-compatible 真实工具冒烟

### 用户前置操作

用户在自己的 shell 安全设置：

```text
LONGCAT_BASE_URL
LONGCAT_MODEL
LONGCAT_API_KEY（端点需要时）
LONGCAT_CONTEXT_WINDOW（可选）
LONGCAT_SUPPORTS_THINKING=false
SECODE_DATA_DIR=<temp-root>/data
```

不把具体值写入聊天或文档。启动：

```zsh
pnpm agent -- \
  --workspace "<temp-root>/workspace" \
  --model longcat \
  --title "阶段12 LongCat 冒烟" \
  --data-dir "<temp-root>/data"
```

使用与 T12-05 相同 prompt 和事件条件，另核对：

- profile 固定为 longcat。
- `/chat/completions` 请求成功。
- arguments string/object 均能进入公开标准对象。
- tool call ID 与 result 对应。
- provider reasoning 不进入 durable/public 输出。

### 调用上限

- 初次一次；只允许一次等价重试。
- 不切换到 generic 或 DeepSeek 冒充通过。

### 停止条件

- endpoint/Key/额度/网络缺失：`blocked_external`。
- 服务返回非兼容结构：`failed`，保存有限 public error 后进入 T12-14。

### 完成条件与覆盖

- A12-03 `passed`；否则阶段不能完成。
- 覆盖 FR-003/004/005/009、NFR-002/003/005、SEC-006。

## 16. T12-07：六工具逐项人工验收

使用已经通过真实冒烟的 profile；优先 DeepSeek。每个 prompt 是独立 run，等待终态后继续。

### 16.1 list_directory

```text
必须只调用 list_directory 列出工作区根目录，depth=3，limit=50。不要调用其他工具，不要修改文件。
```

通过：看到 root/src/tests/context 等相对路径；`.git` 不展开；元数据 bounded。

### 16.2 read_file

```text
必须只调用 read_file 读取 src/slug.mjs 全部内容。最终报告工具返回的 SHA-256，不要修改文件。
```

通过：SHA 初始匹配 `f3a126...72c88`，行范围和总行数正确。

### 16.3 search_text

```text
必须只调用 search_text，在工作区中区分大小写搜索固定文本 SECODE_STAGE12_SLUG，limit=20。不要修改文件。
```

通过：唯一命中 `src/slug.mjs`，不进入 `.git`/data/node_modules。

### 16.4 write_file

```text
必须调用 write_file 创建 notes/created.txt，内容必须恰好为一行 created by SEcode 并以 LF 结束。不要使用 run_process，不要修改其他文件。
```

通过：`operation=create`、`changed=true`、正确 bytes/afterSha256；Git 只新增该文件。

### 16.5 replace_in_file

```text
先调用 read_file 读取 notes/created.txt 并取得最新 SHA-256；再调用 replace_in_file，把唯一文本 created by SEcode 替换成 verified by SEcode，保留末尾 LF。必须使用刚读取的 SHA-256，不要修改其他文件。
```

通过：read → replace 顺序、前后 SHA 不同、`replacedOccurrences=1`、只修改 notes 文件。

### 16.6 run_process

```text
必须调用 run_process，program=pnpm，args=["test"]，cwd="."，timeoutMs=120000。不要修改文件。
```

此时 slug bug 尚未修复，预期工具真实返回 `PROCESS_EXIT_NONZERO` 和 2/2 测试失败。该结构化失败即工具执行通过，不要求 run 最终成功。

### 调用上限和判定

- 每项一个主 run；模型未用目标工具时最多一次窄化重试。
- 模型选择其他工具不算目标项通过。
- 工具返回预期结构化失败时，工具项可以通过，但场景需明确 `ok=false expected`。
- 六项结束后 Git 仅允许 `notes/created.txt` 变化，slug/tests/README 不变。

### 完成条件与覆盖

- A12-04 六行全部 `passed`。
- 覆盖 FR-003/004/005、NFR-003/005、SEC-001/003/007。

## 17. T12-08：真实失败测试到修复通过闭环

### 前置重置

不用 destructive Git 命令。由开发 Agent 从 T12-02 固定内容建立一个全新 sibling workspace 与独立 Session/data 子目录，再验证相同初始 hashes、2/2 失败和 clean Git。不得复用六工具已写入的 workspace。

### 固定 prompt

```text
修复这个项目的 slugify 缺陷。必须先阅读 README.md、测试和相关源码，并运行 pnpm test 建立真实失败基线；定位根因后只做最小源码修改，再运行 pnpm test。如果仍失败，依据真实错误继续修正。最后运行 git diff --check，并总结改动、实际验证和限制。不要安装依赖，不要修改或删除测试，不要 Git commit。
```

### 必须事件事实

- list/read/search 中至少一个观察工具。
- 第一次 `pnpm test` exit nonzero，2 passed / 2 failed。
- 对 `src/slug.mjs` 的 write/replace，tests/README hash 不变。
- 最终 `pnpm test` exit 0，4 passed / 0 failed。
- `git diff --check` exit 0。
- 最终回答与命令事实一致。

### 人工外部复核

run 完成后由开发 Agent在 workspace 外执行：

```text
pnpm test
git diff --check
git status --short
```

并检查：仅 `src/slug.mjs` 修改；测试、README、package、sentinel、escape-link 未变化；没有 lockfile/node_modules。

### 调用上限

- 只提交一个真实 Agent run；运行内部最多 30 轮/10 分钟，由 Runtime 控制。
- 若自然出现中间测试失败，允许 Agent在同一 run 自我修正。
- run failed 后不通过另一个更强提示拼接结果；先 T12-14 分类。

### 完成条件与覆盖

- A12-05 `passed`。
- 覆盖 FR-002/003/004/005、NFR-003/004、SEC-003/007、COM-002/003。

## 18. T12-09：审批拒绝与批准

使用专用 Session，目标 invocation 固定为：

```json
{"program":"node","args":["--version"],"cwd":".","timeoutMs":120000}
```

### 拒绝轨迹

Prompt：

```text
必须调用 run_process 执行 node --version，仅执行这个命令。
```

看到参数和 `approval.required` 后：

```text
/reject 阶段12人工验收拒绝
```

必须没有对应 `tool.started`，并有 `approval.resolved approved=false`。

### 批准轨迹

重新提交相同 prompt；再次产生新的 approval ID 后：

```text
/approve 已确认只读取Node版本
```

必须出现新的 approved resolution、tool started/result、exit 0。第一次拒绝不能复用为第二次 capability。

### 停止条件

program/args/cwd 任一偏离立即 reject；无需重试危险形状。approval ID 重用、拒绝后仍执行或批准跨调用复用属于安全缺陷，立即停止阶段。

### 完成条件与覆盖

- A12-06 `passed`。
- 覆盖 FR-006、SEC-003/005/006、NFR-003。

## 19. T12-10：取消与子进程收口

### 固定 prompt

```text
必须调用 run_process 执行 pnpm run slow，program=pnpm，args=["run","slow"]，cwd="."。这是取消验收，不要执行其他操作。
```

看到精确 invocation 后批准：

```text
/approve 允许临时无副作用计时任务
```

看到 `tool.started` 后立即：

```text
/cancel 阶段12人工验收取消
```

### 验证

- 唯一 durable terminal 为 `run.cancelled`。
- 没有晚到 `tool.result` 或 `run.completed/failed`。
- 2 秒 grace 后没有对应 slow child。
- `/status` idle；随后只读任务能完成。
- Terminal 进程保持活动，除非用户随后 `/exit`。

不使用 `kill/pkill` 作为验收步骤。若需清理测试 helper，只使用其持有的精确 child handle。

### 完成条件与覆盖

- A12-07 `passed`。
- 覆盖 FR-007、NFR-003/004、SEC-003/005。

## 20. T12-11：Session 退出与恢复

### 操作

1. 记录完成过工具 run 的完整 Session UUID，但 ledger 只留短 ID。
2. 输入 `/exit`，确认 exit 0 且无 active run。
3. 用户在相同 shell/data root 执行：

```zsh
pnpm agent -- --session <完整Session UUID> --data-dir "<temp-root>/data"
```

4. 输入 `/status`。
5. 提交：

```text
调用 read_file 读取 notes/created.txt，并告诉我当前内容。不要修改文件。
```

6. `/exit`。

### 开发 Agent复核

- metadata 的 workspace/profile 不变。
- event seq 从上次 lastSeq 后单调递增。
- event id/seq 无重复，尾行完整。
- 没有伪造 interrupted；若存在 open run，恢复只产生批准语义的终态。

### 完成条件与覆盖

- A12-08 `passed`。
- 覆盖 FR-001/002/008、NFR-003、SEC-006。

## 21. T12-12：工作区和敏感路径保护

### 自动权威验证

```text
pnpm exec vitest run tests/unit/workspace tests/unit/tools tests/unit/approval
```

### 临时 fixture 复核

1. 记录 sentinel hash/mtime。
2. 通过正常 list_directory 观察 `escape-link` 为 symlink/blocked，不递归进入。
3. 分别验证准备层拒绝：
   - `../outside/sentinel.txt`
   - sentinel 的绝对路径
   - `escape-link`
   - `.git/config`
   - `.env`
4. 再取 sentinel hash/mtime，必须完全相同。
5. 确认 data root 没有位于 workspace 内，也未被工具列出/搜索。

真实模型若因系统策略不发起危险调用，不算安全层证据；使用已有单元测试/直接公共准备入口的确定性测试结论。不得为人工演示要求模型绕过规则。

### 完成条件与覆盖

- A12-09 `passed`。
- 覆盖 SEC-001/002/004/006/008。

## 22. T12-13：compaction 终端可见性与恢复

### server 启动

开发 Agent或用户在无 Key 终端运行：

```text
pnpm exec tsx tests/manual/openai-compatible-server.ts
```

使用 server 输出设置 generic 的四个非秘密变量；`OPENAI_COMPAT_API_KEY` 保持 unset。为 compaction 使用独立 data 子目录和 Session：

```text
profile=generic
contextWindow=14000
workspace=<fixture workspace>
```

### 固定回合

最多提交 12 次以下任务，编号 1～12：

```text
调用 read_file 读取 context/chunk.txt，然后只回答“已确认第 N 轮”。
```

server 会确定性产生 read_file tool call/final；当终端首次显示 `context.compacted` 时立即停止新增回合。

### 通过条件

- 12 次以内出现 `context.compacted`。
- compaction event 有合法 throughSeq/retainedRange。
- 原始旧事件仍在 JSONL，未删除或重写。
- `/exit` 后恢复 Session，再提交一次小任务能完成。
- server 收到 summary path 并返回固定摘要，但不保存 request body。
- server 正常关闭，无后台 listener。
- 既有 context/terminal compaction 自动测试同时通过。

### 停止条件

- `CONTEXT_BUDGET_EXCEEDED`、12 次无 compaction、hard retained overflow 或 summary 失败：记 `failed`，不调阈值、不扩大回合、不改生产代码。

### 完成条件与覆盖

- A12-10 `passed`。
- 覆盖 FR-008/010、NFR-003/005/006、SEC-006。

## 23. T12-14：错误与缺陷分类门禁

### 自动错误验证

重跑并记录明确场景：

```text
tests/unit/model/client.test.ts
tests/unit/model/sse.test.ts
tests/unit/model/chat-accumulator.test.ts
tests/unit/agent/runtime-tools.test.ts
tests/unit/agent/runtime-limits.test.ts
tests/unit/terminal/application.test.ts
tests/integration/terminal/runtime.test.ts
```

覆盖 401/429/5xx/timeout、非法 SSE/arguments/unknown tool、重复错误、cancel、ordinary failure 后继续。

### 真实失败分类

对 ledger 中每个非 passed 场景依次判断：

1. 外部 Key/额度/网络/endpoint → `blocked_external`，不改代码。
2. fixture/人工命令错误 → 重建全新 fixture 或修正步骤；不覆盖原失败记录。
3. 模型不使用工具 → 一次等价重试后仍失败，记录 provider behavior。
4. 已批准行为的实现偏离 → 写最小复现说明，停止并提出 Task 修订。
5. 公共语义缺口 → 停止并指出需回退的阶段 Spec。

### 修正门禁

当前 Task 白名单不含任何 product 文件，因此本轮不得直接修复 Terminal/Model/Agent 等产品实现。即使修复看似一行，也必须先把具体缺陷、目标文件、测试和不变语义写入 Task 修订并重新获批。

### 完成条件与覆盖

- A12-11 自动错误部分有明确结果；所有失败已分类，无“未知但继续”。
- 覆盖 NFR-002/003/004/005/008、SEC-004/005/006。

## 24. T12-15：secret、reasoning、capability 和控制字符审计

### 审计输入

- `<temp-root>/data/**/session.json`
- `<temp-root>/data/**/events.jsonl`
- `<temp-root>/evidence/**`
- test-only server 源码/测试
- 阶段 12 文档和 Git diff

### 规则

1. 由用户在同一真实模型 shell 内运行 Key 同值扫描，只输出 `matches=0/非0`；不输出文件名中的原始匹配行，不把 Key 传给 Codex。
2. 开发 Agent运行模式扫描，只输出规则与计数：
   - `Bearer` token pattern
   - `sk-` 长 token pattern
   - `*_API_KEY=` assignment pattern
   - `reasoning_content`
   - continuation/private/capability 字段
   - raw ESC/OSC/C0/C1 bytes
   - stack/cause 和真实绝对路径进入仓库文档
3. 读取 JSONL 时使用正式 store/有限 parser；容忍批准的尾行恢复语义，不用原始整文件 dump。
4. 检查 Agent `run_process` 输出不含模型 Key 环境。
5. 检查 Git diff 不包含 `.env*`、session data、transcript、fixture 或真实 endpoint。

### 失败处理

任何真实 secret 同值非零：立即停止、通知用户撤销 Key，不继续展示匹配内容；按 SEC-006 回退规格处理。reasoning/capability 泄漏同样是阻断性安全失败。

### 完成条件与覆盖

- A12-12 `passed`，所有计数为 0。
- 覆盖 SEC-006/008、COM-004。

## 25. T12-16：全仓顺序门禁与残留检查

### 命令顺序

```text
pnpm exec vitest run tests/unit/terminal tests/integration/terminal
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm agent -- --help
pnpm install --frozen-lockfile
git diff --check
```

### 差异与残留检查

- `git status --short` 只含批准的 test-only server/test 和阶段文档，以及任务开始前记录的用户变更。
- package/lock hash 与 T12-00 一致。
- 无仓库内 `.secode-data`、fixture、transcript、Key、coverage、临时输出或新 lockfile。
- 无 test `.only`、永久 `.skip`、降低断言、放宽超时或 snapshot 批量更新。
- 无 Agent/model/CLI/framework/dotenv/http/logging 新依赖。
- test-only server 无后台进程或占用端口。
- 临时 fixture/data/evidence 保留但不位于仓库。

### 失败处理

目标测试失败先最小复跑和诊断，修正后重跑受影响目标，再从第一条命令完整顺序重跑。不得并行化全仓门禁。

### 完成条件与覆盖

- A12-13 `passed`。
- 覆盖全部 NFR、SEC、COM 和回归要求。

## 26. T12-17：Summary、索引与审批门禁

### 涉及文件

```text
docs/development/12-terminal-core-acceptance-summary.md
docs/development/12-terminal-core-acceptance-tasks.md
docs/development/README.md
```

### 操作

1. 更新本 Task 的逐项实际状态，不改写批准内容或删除失败记录。
2. 生成 Summary，至少包含：
   - Spec/Task 审批链。
   - T12-00～T12-17 实际执行顺序。
   - A12-01～A12-13 ledger 状态表。
   - DeepSeek/LongCat 的 provider/profile、短 ID、事件顺序和有限结果。
   - 六工具和完整修复闭环证据。
   - approval/cancel/resume/compaction 结果。
   - 自动测试、全仓门禁和 secret audit。
   - 每次失败、诊断、重试、修正或外部阻塞。
   - 与 Spec/Task 的偏差、已知限制、临时目录保留状态。
   - 对阶段 13 的固定输入。
3. 不粘贴 raw transcript、JSONL、完整绝对路径、endpoint、Key 或 reasoning。
4. 更新开发索引为“阶段 12 Summary 待用户审批”。
5. 运行链接、围栏、状态、秘密、路径和 `git diff --check` 文档门禁。
6. 立即停止，不开始阶段 13 观察或 Next.js 文档阅读。

### Summary 提交条件

- 所有关键场景 `passed`，无 `failed/blocked_external/not_run` 才能声明阶段具备完成条件。
- LongCat 若 `blocked_external`，可以提交进度说明但不能写“阶段 12 完成”，开发索引保持阻塞而非 Summary 完成门禁。
- 任何安全泄漏、核心回归或 unresolved product defect 都阻止 Summary 完成声明。

### 完成条件与覆盖

- 详细、可审计、无 secret 的 Summary 等待用户审批。
- 覆盖 NFR-008、SEC-006/008、COM-004。

## 27. 需求—任务追踪矩阵

| 需求 | 主要任务 | 关键证据 |
| --- | --- | --- |
| FR-001/002 | T12-02/05/06/11 | 临时 workspace、Session create/resume、user run |
| FR-003 | T12-05–08 | 六工具事件、双模型工具回合、修复闭环 |
| FR-004 | T12-03–08/13 | SSE/Model/Agent 循环、最终终态 |
| FR-005 | T12-05–13 | Terminal 可见事件、错误、审批、compaction |
| FR-006 | T12-09 | reject/approve 新 ID、执行边界 |
| FR-007 | T12-10 | cancel 单终态、child 收口 |
| FR-008 | T12-11/13 | JSONL seq、恢复和 compaction |
| FR-009 | T12-05/06 | DeepSeek/LongCat 真实 profile |
| FR-010 | T12-03/04/13 | summary path、context.compacted、旧事件保留 |
| NFR-001 | T12-00/16 | Node/pnpm、build |
| NFR-002/003 | T12-03/04/14/16 | 边界解析、结构化失败 |
| NFR-004/005 | T12-08/10/13/14 | limits、cancel、timeout/output/compaction |
| NFR-006 | T12-03/04/16 | Node-only test path |
| NFR-008 | T12-00/01/14/17 | ledger、审批和 Summary |
| SEC-001/002 | T12-02/12 | symlink、sentinel、敏感路径 |
| SEC-003/005 | T12-07/09/10 | process allow/approval/cancel |
| SEC-004 | T12-04/12/14 | deny 策略确定性测试 |
| SEC-006 | T12-03/05/06/11/13/15 | env/输出/JSONL 零泄漏 |
| SEC-007 | T12-07/08 | read hash、replace/write |
| SEC-008 | T12-01/02/15/17 | 临时可信边界和文档 |
| COM-001–003 | T12-00/03/04/16 | 无框架、无托管工具、生产路径 |
| COM-004 | T12-05/06/15/17 | Key/transcript/文档审计 |

## 28. 真实模型调用预算

| 场景 | 主 run | 允许重试 | 最大任务提交 |
| --- | ---: | ---: | ---: |
| DeepSeek 冒烟 | 1 | 1 | 2 |
| LongCat 冒烟 | 1 | 1 | 2 |
| 六工具 | 6 | 每项最多 1 | 12 |
| 完整修复闭环 | 1 | 0 | 1 |
| approval reject/allow | 2 | 0 | 2 |
| cancel | 1 | 0 | 1 |
| resume 验证 | 1 | 0 | 1 |

真实 provider 正式任务最多 21 次提交；每次仍受 30 轮/10 分钟限制。实际应尽量在 14 个主 run 内完成。compaction 使用本机 test-only generic server，不计外部模型调用。

达到上限后将场景记 failed/blocked，不通过换提示、换模型或新增 Session 无限重试。

## 29. 失败处理与回退

### 29.1 可恢复操作错误

- 用户变量在错误 shell：退出旧 Agent，在正确 shell 重启，不覆盖原错误记录。
- workspace 环境变量为空：重新输出安全路径并创建新 Session，不使用 `/workspace`。
- fixture 内容误差：删除该次临时 fixture 的资格，建立新 sibling；不修改预期 hash。
- 模型一次未用工具：按任务允许的一次等价窄化重试。

### 29.2 必须修订本 Task

- 需要修改任何 `lib/terminal/**` 或未批准测试文件。
- test-only server 文件/协议/端口/输入保存语义需要改变。
- fixture 内容、初始失败数、hash 或验收 prompt 需要实质改变。
- 调用预算、证据字段或场景通过标准需要放宽。

### 29.3 必须回到旧 Spec

- Model transport/provider/retry/reasoning/tool-call 映射变化：阶段 04。
- Workspace/path/symlink：阶段 05。
- Tool Schema/write/process：阶段 06。
- Risk/approval/capability：阶段 07。
- JSONL/durable/recovery：阶段 08。
- Agent loop/terminal/error/limits：阶段 09 或 11，按所有权判断。
- Context/system prompt/compaction：阶段 10。
- Domain event/error/protocol：阶段 03。

### 29.4 不允许的“修复”

- 删除/改弱 fixture tests。
- 手工修改 JSONL 让恢复通过。
- 把 unknown process 加入自动 allow 只为省审批。
- 关闭 SHA、workspace、secret、reasoning 或 terminal safety。
- 增大 maxIterations/duration/model timeout 或无界 retry。
- 换用未声明的第三方模型冒充 LongCat。
- 忽略失败场景，只在 Summary 展示最终成功。

## 30. 实施后总门禁清单

- [x] Spec 与 Task 均有用户批准记录。
- [x] T12-00～T12-17 按依赖顺序执行并记录。
- [x] fixture 内容/hash/2 pass + 2 fail 基线准确。
- [x] test-only server 仅 loopback、无日志/Key、测试通过。
- [x] DeepSeek 真实工具冒烟通过。
- [ ] LongCat-compatible 真实工具冒烟通过。
- [x] 六工具逐项通过。
- [x] 至少一个真实模型完整修复闭环通过。
- [x] approval reject/allow、cancel、resume 通过。
- [x] workspace/symlink/sensitive path 通过且 sentinel 不变。
- [x] compaction Terminal 可见、恢复通过、旧事件保留。
- [x] 模型/Agent/Terminal 错误自动测试通过。
- [x] secret/reasoning/capability/control 审计全零。
- [x] 全仓顺序门禁通过，lint 0 warning，lockfile 不变。
- [x] 无 `.only`/永久 skip/降断言/新增依赖/后台进程/仓库残留。
- [x] Summary 如实记录失败、重试、阻塞、偏差和临时目录状态。
- [x] 开发索引更新为正确门禁状态。
- [x] 阶段 13 未开始。

## 31. Task 内部门禁

- [x] 已链接并记录阶段 12 Spec 批准。
- [x] 已把 A12-01～A12-13 全部映射为 T12-00～T12-17。
- [x] 已固定文件白名单和临时目录边界。
- [x] 已固定 fixture 全文、字节、SHA、失败数和 Git 基线。
- [x] 已固定 test-only server 的安全协议与测试。
- [x] 已区分开发 Agent与用户的凭据/TTY职责。
- [x] 已固定双模型、六工具、闭环、审批、取消、恢复和 compaction 的 prompt/证据。
- [x] 已固定真实模型调用预算和重试上限。
- [x] 已定义 ledger、秘密审计、失败分类、Task 修订和旧 Spec 回退。
- [x] 已定义全仓门禁、残留检查和 Summary 停止条件。
- [x] 未创建 fixture/server/test/Summary，未调用真实模型或修改产品代码。

**原 Task 内部门禁：通过，且已批准。实施修订 R1 已批准并完成。**

## 32. 用户审批项

批准本 Task 即确认：

1. 按 T12-00～T12-17 顺序执行，不跳过最小验证。
2. 允许新增两个 test-only 文件，但不允许修改 production 代码或 package/lock。
3. 允许在安全系统临时根创建 fixture/data/evidence，并在 Summary 审批前保留。
4. fixture 初始内容、hash、2/2 失败基线和无依赖脚本固定。
5. 用户自行安全设置 DeepSeek/LongCat 环境并操作真实 TTY，Key 不进入 Codex。
6. DeepSeek/LongCat 各最多一次等价冒烟重试，全部真实任务最多 21 次提交。
7. 只批准 Task 中精确无副作用命令；其他 invocation 默认拒绝。
8. compaction 使用 loopback test-only generic server，不消耗真实 provider token。
9. 当前不预授权产品修复；发现缺陷后先修订 Task 或回到旧 Spec。
10. 全部通过后只生成阶段 12 Summary，不进入阶段 13。

## 33. 用户审批记录

- 原 Task 审批结果：用户已于 2026-08-28 批准阶段 12 Task。
- 原 Task 批准解锁：严格按 T12-00～T12-17 创建临时 fixture、test-only server，执行自动/人工验收并生成 Summary。
- 实施修订 R1 审批结果：用户已于 2026-08-28 批准；已解锁 R1-01～R1-06。
- 当前仍禁止：任何 production 修改、依赖变更、未批准真实调用、Route Handler、NDJSON、UI 或阶段 13。
- 发现产品缺陷时：先按 T12-14 分类，修订本 Task 或回到所属 Spec 后重新等待审批。
