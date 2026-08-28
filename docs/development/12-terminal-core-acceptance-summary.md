# 阶段 12 Summary：终端测试与核心验收

## 1. 状态与审批链

- 当前状态：进度 Summary 待用户审批。
- 阶段状态：12 个场景通过；LongCat-compatible 真实冒烟为 `blocked_external`。
- 完成声明：不成立。缺少 LongCat 端点时不能标记阶段 12 完成。
- 阶段 13：未开始，当前仍禁止开始。
- 生成日期：2026-08-28。

```text
阶段 12 Spec（已批准）
  → 原 Task（已批准）
  → T12-13 首次失败与只读诊断
  → Task 实施修订 R1（已批准）
  → R1 实施与重验（通过）
  → 本进度 Summary（待审批）
  → LongCat 阻塞解除后补测
  → 阶段 12 最终门禁（尚未到达）
```

- [阶段 12 Spec](./12-terminal-core-acceptance-spec.md)
- [阶段 12 Task 与 R1](./12-terminal-core-acceptance-tasks.md)
- [开发流程索引](./README.md)

## 2. 目标与结论

本阶段使用真实 `pnpm agent` 入口和仓库外的独立 Git fixture，验证真实 provider 工具调用、六工具、完整修复、审批、取消、Session 恢复、工作区保护、compaction、安全审计和全仓回归。

实际结论：

- DeepSeek 已完成真实工具冒烟、六工具、完整修复闭环、审批、取消和恢复。
- generic test-only profile 已完成真实 HTTP/SSE compaction 和恢复。
- 工作区安全、错误分类、泄漏审计与全仓顺序门禁通过。
- production 文件变化为 0；没有新增依赖或修改 package/lock。
- LongCat-compatible 因用户暂无端点而未运行，是唯一外部阻塞。

## 3. 仓库产物与边界

```text
docs/development/12-terminal-core-acceptance-spec.md
docs/development/12-terminal-core-acceptance-tasks.md
docs/development/12-terminal-core-acceptance-summary.md
docs/development/README.md
tests/manual/openai-compatible-server.ts
tests/integration/terminal/manual-server.test.ts
```

```text
app/**          0 changes
cli/**          0 changes
lib/**          0 changes
package.json    0 changes
pnpm-lock.yaml  0 changes
```

阶段开始前已有的阶段 11 文档变化继续保留，本阶段没有覆盖或重新归属。

## 4. T12-00～T12-17 实际执行

| 任务 | 状态 | 主要事实 |
| --- | --- | --- |
| T12-00 基线 | 通过 | Terminal、lint、typecheck 与 package/lock hash 固定 |
| T12-01 ledger | 通过 | workspace、outside、data、evidence 隔离 |
| T12-02 fixture | 通过 | 固定 hash；初始 2 pass/2 fail；Git clean |
| T12-03 test server | 通过 | loopback、ephemeral、SSE、有限输入、无请求日志 |
| T12-04 无凭据回归 | 通过 | Model、工具、存储、Agent、context、Terminal 通过 |
| T12-05 DeepSeek | 通过 | 真实工具回合，自行修正一次空 path |
| T12-06 LongCat | 外部阻塞 | 用户暂无兼容端点；未替代或伪造 |
| T12-07 六工具 | 通过 | 六项均有 durable 事件 |
| T12-08 修复闭环 | 通过 | 失败基线、最小修改、测试转绿、diff check |
| T12-09 审批 | 通过 | reject 不执行；新 ID approve 后执行 |
| T12-10 取消 | 通过 | 唯一取消终态、无晚到结果、child 为 0 |
| T12-11 恢复 | 通过 | seq 连续；metadata 和文件不变 |
| T12-12 工作区安全 | 通过 | traversal、绝对路径、symlink、敏感文件拒绝 |
| T12-13 compaction | 通过（经 R1） | 原失败保留；R1 后压缩和恢复通过 |
| T12-14 错误分类 | 通过 | 7 files/62 tests；无未知失败继续 |
| T12-15 安全审计 | 通过 | 结构化、模式、真实 Key 同值扫描均为 0 |
| T12-16 全仓门禁 | 通过 | 607 tests、lint、typecheck、build 等通过 |
| T12-17 Summary | 已生成 | 本文待审批；LongCat 阻塞仍保留 |

## 5. A12 场景账本

| 场景 | 状态 | Profile | 结论 |
| --- | --- | --- | --- |
| A12-01 | `passed` | none | 基线、隔离 fixture、profile 预检完成 |
| A12-02 | `passed` | deepseek | 真实 list/read 工具冒烟完成 |
| A12-03 | `blocked_external` | longcat | 缺少用户提供的兼容端点 |
| A12-04 | `passed` | deepseek | 六工具均有 durable 事件链 |
| A12-05 | `passed` | deepseek | 2/2 失败转为 4/4 通过 |
| A12-06 | `passed` | deepseek | reject/approve 权限隔离正确 |
| A12-07 | `passed` | deepseek | 取消终态唯一，子进程收口 |
| A12-08 | `passed` | deepseek | Session 恢复后 seq 连续 |
| A12-09 | `passed` | none | 工作区边界与敏感路径保护通过 |
| A12-10 | `passed` | generic | 原失败保留；R1 重验和恢复通过 |
| A12-11 | `passed` | none | 自动错误与真实失败已分类 |
| A12-12 | `passed` | none | 所有泄漏计数为 0 |
| A12-13 | `passed` | none | 固定顺序全仓门禁通过 |

```text
passed            12
blocked_external   1
failed             0（最终状态；A12-10 原始失败仍保留）
not_run            0
```

## 6. Provider 结果

### DeepSeek

- 冒烟短 Session/Run：`942d99f9` / `3481535f`。
- 初次 `list_directory` 使用空 path，得到结构化参数错误；模型随后用 `path="."` 自行修正。
- README、source、tests、package、sentinel hash 均未变化。
- 六工具短 Session：`eee1c139`。
- 修复短 Session：`ee65434c`。
- 审批短 Session：`8604cbf8`。
- 取消短 Session：`75a390b0`。
- 恢复短 Run：`159367ac`。

### LongCat-compatible

- 状态：`blocked_external`。
- 原因：用户暂无兼容 endpoint。
- 未调用、未消耗凭据、未使用其他 provider 冒充。
- 解除阻塞需要用户提供 base URL、model ID 和凭据，并按 T12-06 固定 prompt 完成一次真实工具冒烟。

### Generic test-only

- 只用于确定性 compaction HTTP/SSE 验收，无凭据。
- server 只监听 loopback 临时端口，结束后释放。
- 真实端点和端口没有写入仓库文档或 ledger。

## 7. 六工具与修复闭环

| 工具 | 结果 | 关键事实 |
| --- | --- | --- |
| `list_directory` | 通过 | bounded；`.git` 忽略；外部 link blocked |
| `read_file` | 通过 | 一次超范围参数后窄化重试；SHA 匹配 |
| `search_text` | 通过 | marker 唯一命中；不进入 data |
| `write_file` | 通过 | 创建 notes 文件，18 bytes |
| `replace_in_file` | 通过 | 使用读取 SHA；唯一替换；保留 LF |
| `run_process` | 通过 | exit 1、2 pass/2 fail 为预期结构化结果 |

完整修复由单个 DeepSeek run 完成：先读 README、测试、源码，运行测试得到 2 pass/2 fail；只修改 `src/slug.mjs`，再运行测试得到 4 pass/0 fail；`git diff --check` exit 0。外部复核确认 README、tests、package、sentinel 和 escape-link 不变，没有依赖、lockfile 或 commit。

## 8. 审批、取消与恢复

- 第一次 `node --version` approval 短 ID `65165cb3` 被拒绝；没有 `tool.started` 或进程输出。
- 第二次 approval 短 ID `67179377` 与第一次不同；批准后执行并 exit 0。
- 慢任务短 Run `a7991c40` 在 `tool.started` 后取消；唯一 terminal 为 `run.cancelled`，无晚到 result/completed/failed。
- grace 后 slow child 为 0；Terminal 随后完成只读任务。
- 恢复六工具 Session 时稳定序号 90，新事件连续到 101；101 个 seq/ID 唯一，文件 SHA 与 metadata 不变。

## 9. 工作区保护

自动验证为 21 files/225 tests。真实 fixture 复核结果：

| 输入 | 结果 |
| --- | --- |
| `../outside/sentinel.txt` | 参数拒绝 |
| sentinel 绝对路径 | 参数拒绝 |
| `escape-link` | `WORKSPACE_SYMLINK_ESCAPE` |
| `.git/config` | `TOOL_SENSITIVE_PATH_DENIED` |
| `.env` | `TOOL_SENSITIVE_PATH_DENIED` |

sentinel 的 SHA、mtime、bytes 前后完全相同；data root 位于 workspace 外，list/search 均无法发现 data。

## 10. Compaction 失败、R1 与重验

### 原始失败

- 短 Session：`29f6ad7c`。
- 前 5 回合成功；第 6 回合工具结果后发生 `AGENT_CONTEXT_FAILED`。
- 64 条原事件保持连续、唯一，最后仍为 `run.failed`。
- 回放估算 10602、预算 10500；选择器正常 evict 2、retain 9、through seq 14。
- 摘要返回 tool call，归类为 `CONTEXT_SUMMARY_INVALID`。

### 根因与 R1

生产 transport 在 tools 为空时省略 HTTP `tools` 字段；原 test-only server 只识别显式 `tools: []`，因此误返回 `read_file`。这是 test-only helper 与既有 transport 契约不一致，不是 production 缺陷。

用户批准 R1 后：

1. 先增加 production generic client 空工具摘要测试，修正前稳定 1/8 失败。
2. 仅修改 test-only server，同时接受省略字段与显式空数组。
3. 修正后 server 8/8；相关 5 files/24 tests、lint、typecheck 通过。
4. 没有修改 production、阈值、contextWindow、保留回合数或依赖。

### 新 Session

- 短 Session：`3706f500`。
- 第 6 回合 seq 64 写入 compaction：through 14，range 15–63。
- 退出时稳定 seq 68；恢复后小任务完成。
- seq 76 写入第二次 compaction：through 25，range 26–75。
- 最终 seq 80；seq/ID 唯一；failed 0。
- 原失败 Session 未删除、未重写；server 通过 SIGTERM 退出，listener/process 为 0。

## 11. 错误分类与安全审计

错误回归 7 files/62 tests，覆盖 401、429、5xx、timeout、非法 SSE/arguments、unknown tool、重复错误、cancel 和普通失败恢复。

| 事实 | 分类 | 处理 |
| --- | --- | --- |
| LongCat 无端点 | 外部阻塞 | 保留 `blocked_external` |
| DeepSeek 空 path/endLine | provider 参数行为 | 自行修正或一次窄化重试；保留事件 |
| compaction 首次失败 | helper 偏差 | 停止、诊断、R1 审批、修正、重验 |

结构化审计输入为 15 个 JSON/JSONL 文件、387 条记录：parse error、forbidden key、Bearer、`sk-`、API Key assignment、ESC/C0/C1、run_process 敏感标签、真实路径/端口和 debug marker 均为 0。用户在持有真实 DeepSeek Key 的 shell 中执行同值扫描，结果 `matches=0`，未输出 Key、内容或文件名。

## 12. 全仓顺序门禁

| 命令 | 结果 |
| --- | --- |
| Terminal Vitest | 14 files/74 tests passed |
| `pnpm test` | 75 files/607 tests passed |
| `pnpm lint` | exit 0，0 warnings |
| `pnpm typecheck` | exit 0 |
| `pnpm build` | Next.js 16.3.3 build passed |
| Agent help | exit 0 |
| frozen install | lockfile up to date，无变更 |
| `git diff --check` | exit 0 |

package/lock hash 与 T12-00 一致；package/lock diff 为 0；`.only/.skip`、tracked env/Session/fixture、后台 server/CLI、真实端点/临时路径均为 0。既有忽略 data 目录仍为 0 files/1 directory/0 KiB，阶段 12 运行全部使用仓库外显式 data root。

## 13. 偏差、限制与反思

已批准偏差只有 T12-13 的 R1。失败后没有临时修代码，而是先建立差分反馈环、记录最小复现、修订 Task 并等待审批；修正只触及 test-only helper 和测试。

已知限制：

1. LongCat-compatible 端点缺失，阻止双 provider 完成条件。
2. DeepSeek 偶尔生成空 path 或超大 endLine；工具安全拒绝正确，但演示 prompt 应给出精确参数。
3. 本阶段是可信本地单用户应用边界，不是恶意代码的操作系统沙箱。

反思与改进：

- durable events 而不是模型文字作为事实来源。
- 原失败与修正后成功同时保留，不以最终通过覆盖历史。
- 新增正确接缝的 production client 摘要测试，弥补 raw payload 测试缺口。
- 真实 Key 始终由用户持有，开发 Agent 从未读取或接收。

## 14. 临时证据状态

仓库外系统临时根仍保留：workspace fixture、repair fixture、outside sentinel、各 data root 和 evidence ledger。它们没有进入 Git；Summary 审批前不删除，用户未授权清理。

## 15. 阶段 13 门禁

阶段 13 可继承已通过的 Agent runtime、六工具、workspace 安全、approval/cancel/resume、JSONL、compaction 事件和脱敏 profile。test-only server 只能作为测试资产，不能进入 production app。

当前固定门禁：

```text
LongCat-compatible 真实冒烟未完成
→ 阶段 12 不得声明完成
→ 阶段 13 Spec 观察不得开始
→ Route Handler、NDJSON 和 UI 仍禁止开发
```

## 16. 用户审批项

请审阅并确认：

1. 本 Summary 是否准确记录阶段 12 已完成的工作。
2. A12-10 原失败、R1 诊断和修正是否保留充分。
3. LongCat `blocked_external` 是否准确，且当前不能声明阶段完成。
4. 临时 fixture/data/evidence 是否继续保留。
5. 是否批准本进度 Summary。

即使本进度 Summary 获批，LongCat 阻塞仍然存在；只有完成 LongCat-compatible 真实冒烟，或另行审批修改双 provider 完成条件，阶段 13 才可能解锁。
