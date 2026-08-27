# 阶段 03 Task：领域类型与事件协议

## 1. 文档状态

- 状态：已批准（修订 1）
- 依据 Spec：[03-domain-protocol-spec.md](./03-domain-protocol-spec.md)
- Spec 状态：已批准
- 当前子阶段：开发与验证
- 后续动作：继续 T03-07 至 T03-10，完成后生成 Summary
- 禁止动作：Summary 获批前不得开始阶段 04 观察

## 2. 已批准范围摘要

本阶段只实现框架无关、可 JSON 序列化、由 Zod 校验的领域契约：

- JSON、标识符、时间和错误基础 Schema。
- 模型、会话、运行状态、聊天消息、工具调用和结果 Schema。
- 持久事件与实时事件的判别联合。
- 协议版本、大小限制与最少披露辅助函数。
- 纯 Node Vitest 单元测试。

不实现模型请求、路径安全、工具执行、审批等待、JSONL 存储、Agent 循环、终端、API 或 UI。

## 3. 允许修改的文件范围

预计新增：

```text
lib/domain/json.ts
lib/domain/core.ts
lib/domain/model.ts
lib/domain/tool.ts
lib/domain/event.ts
lib/domain/redaction.ts
lib/domain/index.ts
tests/unit/domain/json.test.ts
tests/unit/domain/core.test.ts
tests/unit/domain/event.test.ts
tests/unit/domain/redaction.test.ts
docs/development/03-domain-protocol-summary.md
```

允许在验证需要时修改：

```text
vitest.config.mts
docs/development/README.md
docs/development/03-domain-protocol-tasks.md
```

`vitest.config.mts` 只允许增加与 `tsconfig.json` 一致的 `@` 根目录别名，使
Vitest 能在运行时解析 T03-07 已批准的 `@/lib/domain` 公共入口；不得改变测试
环境、覆盖率范围或其他测试行为。

明确禁止：

- 修改 `app/**`、Next.js 配置或 UI。
- 修改依赖和锁文件；阶段 02 已包含 Zod 与 Vitest。
- 创建模型、工具执行、存储或 Agent 引擎代码。
- 修改阶段 01、02 的已批准规格。

如果实现需要超出上述范围，必须停止并申请 Task 修订审批。

## 4. 任务依赖顺序

```text
T03-01 JSON 基础
  → T03-02 核心错误与结果
  → T03-03 模型、会话与消息
  → T03-04 工具契约
  → T03-05 事件协议
  → T03-06 脱敏与大小辅助
  → T03-07 公共导出
  → T03-08 单元测试
  → T03-09 全阶段验证
  → T03-10 Summary
```

每完成一个任务先运行其最小测试；T03-09 再完整重跑所有质量门禁。

## 5. 详细任务清单

### T03-01：JSON、ID、时间和版本基础

覆盖：`NFR-002`、`NFR-006`。

输入：已批准 Spec 第 7 节。

实现内容：

- 定义递归 `JsonValueSchema`、`JsonObjectSchema` 与推导类型。
- 拒绝 undefined、函数、bigint、Symbol、Date、Map、Set、NaN 和 Infinity。
- 定义 UUID 字符串 Schema、带时区 ISO 时间 Schema、正整数序号 Schema。
- 定义 `ProtocolVersionSchema`，首版只接受字面量 `1`。
- 导出 SessionId、RunId、EventId、ToolCallId、ApprovalId 的字符串类型别名。

最小验证：

- 正常嵌套 JSON 可往返解析。
- 非 JSON 值逐类拒绝。
- UUID、ISO 时间、seq 和版本边界覆盖。

完成条件：基础类型不导入 React、Next.js、文件系统或网络模块。

### T03-02：结构化错误与通用结果不变量

覆盖：`NFR-003`、`NFR-005`。

输入：T03-01。

实现内容：

- 定义 `ErrorInfoSchema`：code、message、recoverable、可选 JSON details。
- 定义可复用的 `ToolResultSchema` 基础结构。
- 通过 Schema refinement 保证：成功时无 error，失败时必须有 error。
- `summary` 设置合理短文本上限。
- `output` 按 UTF-8 字节数限制 64 KiB，而非按 JavaScript 字符数粗略限制。
- metadata 只能是 JsonObject。

最小验证：

- `ok/error` 四种组合分别覆盖。
- 中英文 UTF-8 输出的 64 KiB 边界覆盖。
- JavaScript Error 实例不能直接作为 ErrorInfo。

完成条件：错误可 JSON 序列化，且非法组合在运行时被拒绝。

### T03-03：模型、会话、运行状态与聊天消息

覆盖：`FR-004`、`FR-009`、`NFR-006`、`SEC-006`。

输入：T03-01、T03-02。

实现内容：

- 定义公共 `ModelProfileSchema`，提供方为 deepseek、longcat、generic。
- 使用严格对象 Schema，显式拒绝 apiKey 等额外敏感字段。
- 定义 `RunStatusSchema` 和终态词汇，但不实现状态转换算法。
- 定义 `SessionRecordSchema`，一个会话固定 workspacePath 和 modelProfileId。
- 定义 system/user、assistant、tool 三类 `ChatMessageSchema`。
- 定义 provider-independent `ChatToolCallSchema`，arguments 必须是 JsonObject。

最小验证：

- 每类消息可序列化往返。
- Assistant 可表达纯文本、纯工具调用或二者同时存在，但不得二者均为空。
- Tool 消息必须引用 ToolCallId。
- ModelProfile 出现 apiKey 或未知字段时拒绝。

完成条件：消息结构不包含任何厂商专用字段名称。

### T03-04：工具定义、调用与结果契约

覆盖：`FR-003`、`FR-004`、`NFR-003`。

输入：T03-01、T03-02、T03-03。

实现内容：

- 定义 `ToolCallSchema`：UUID、非空名称、JsonObject 参数。
- 定义 `ToolDefinitionSchema`，固定 type=function。
- parameters 使用 JsonObject 表达 JSON Schema 兼容数据。
- 工具名称采用可跨提供方使用的保守字符集与长度限制。
- 导出 `ToolResultSchema` 和所有推导类型。

最小验证：

- 合法定义与调用通过。
- 空名称、非法名称、数组参数、非 JSON parameters 拒绝。
- ToolResult 正确关联 ErrorInfo。

完成条件：阶段 04 可直接把 ToolDefinition 映射到兼容 API 请求。

### T03-05：持久事件与实时事件判别联合

覆盖：`FR-005`、`FR-006`、`FR-007`、`FR-008`、`FR-010`、`SEC-006`。

输入：T03-01 至 T03-04。

实现内容：

- 建立协议版本 1 的持久事件基础信封：durable=true、seq、sessionId、可选 runId。
- 建立实时事件信封：durable=false、streamSeq、必选 runId。
- 为 Spec 第 10.3 节列出的每种持久事件定义严格 data Schema。
- 定义唯一实时事件 `assistant.delta`。
- 定义 `DurableAgentEventSchema`、`LiveAgentEventSchema` 与 `AgentEventSchema` 判别联合。
- 导出事件 type 字面量联合与 `isDurableEvent`、`isTerminalRunEvent` 纯类型守卫。
- 不在本阶段实现跨事件状态验证。

最小验证：

- 每类事件至少一个合法夹具通过。
- 持久事件缺 seq、实时事件缺 streamSeq 或 runId 时拒绝。
- `assistant.delta` 无法通过持久事件 Schema。
- 未知事件、错误版本、额外字段和错误 data 结构拒绝。
- JSON stringify/parse 后仍通过同一联合 Schema。

完成条件：终端、JSONL、NDJSON 和 UI 可共享 AgentEvent 联合。

### T03-06：脱敏与大小控制辅助函数

覆盖：`SEC-006`、`NFR-005`。

输入：T03-01、T03-04、T03-05。

实现内容：

- 实现纯字符串 `redactSecrets`，覆盖 Bearer Token、常见 sk 风格 Key 和 `*_API_KEY=value`。
- 实现递归 `sanitizeForEvent`，只返回 JsonValue。
- 对键名包含 token、secret、password、authorization、apiKey 的值统一替换为 `[REDACTED]`。
- 提供 UTF-8 安全截断辅助，返回值与 truncated 标记。
- 提供 `createPublicToolArguments`：默认序列化上限 16 KiB。
- 对可能包含长内容的字符串保留有限预览，不暴露完整大段内容。

最小验证：

- 各类秘密字符串与嵌套敏感键被脱敏。
- 普通代码、路径和命令参数不被误删。
- 中文、多字节字符截断后仍是合法 UTF-8。
- 返回值始终通过 JsonValueSchema。

完成条件：后续事件存储可以使用统一辅助函数，避免各工具自行拼接日志。

### T03-07：建立唯一公共导出入口

覆盖：`NFR-006`。

输入：T03-01 至 T03-06。

实现内容：

- 通过 `lib/domain/index.ts` 导出公共 Schema、类型、常量和纯函数。
- 不使用默认导出。
- 避免循环依赖：json → core/model/tool → event/redaction → index。
- 不导出内部临时 Schema 或实现细节。

最小验证：测试只从 `@/lib/domain` 导入至少一组公共 API，确认路径别名和 barrel 可用。

完成条件：后续阶段只依赖公共入口即可使用领域协议。

### T03-08：完成领域协议单元测试

覆盖：本 Spec 第 14 节全部验收标准。

输入：T03-01 至 T03-07。

实现内容：

- 按 json、core、event、redaction 四个测试文件组织。
- 使用工厂函数创建稳定 UUID/时间/事件夹具，避免重复和随机不确定性。
- 正向与反向测试并重；不得只检查 TypeScript 编译。
- 对严格对象 Schema 验证未知字段拒绝。
- 对 UTF-8 大小、事件持久/实时分离、私密字段拒绝建立回归测试。

最小验证：逐文件运行测试，全部通过后再执行全套测试。

完成条件：阶段 03 新增公共行为均有直接测试证据。

### T03-09：阶段整体验证与一致性审查

覆盖：`NFR-002`、`NFR-006`、`NFR-008`、`COM-001`。

执行顺序：

1. `pnpm test -- tests/unit/domain`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm build`
6. `git diff --check`
7. 检查 `lib/domain` 不导入 Next.js、React、文件系统、网络、子进程或 Agent SDK。
8. 检查未生成 Task 之外未批准的业务模块。

失败处理：

- 先在 Summary 记录失败命令、实际原因和影响。
- 只修复已批准 Spec 范围内的问题，并重跑相关最小验证及完整门禁。
- 若需要改变事件公共结构、安全边界或验收标准，停止开发并回到 Spec 重新审批。

完成条件：全部命令退出码为 0，且实现与 Spec/Task 一致。

### T03-10：生成开发 Summary

输入：所有实现和验证记录。

实现内容：

- 创建 `03-domain-protocol-summary.md`。
- 记录 Spec、Task 审批状态和实际完成清单。
- 按任务描述开发过程、关键实现和文件变化。
- 完整记录失败、修正、测试数量和命令结果。
- 对照 Spec 列出所有偏差；无偏差也必须明确写明。
- 记录安全检查、已知限制、反思和对阶段 04 的影响。
- 更新开发索引为“阶段 03 Summary 待用户审批”。

完成条件：Summary 内部门禁通过并停止开发，等待用户批准。

## 6. 测试矩阵

| 类别 | 核心场景 | 预期 |
| --- | --- | --- |
| JSON | 嵌套普通对象、数组、null | 通过并可往返 |
| JSON | Date、Map、NaN、Infinity、undefined | 拒绝 |
| Error | 成功无 error、失败有 error | 通过 |
| Error | 成功含 error、失败无 error | 拒绝 |
| Message | 四种角色与工具调用组合 | 按规则通过 |
| Model | 公共模型信息 | 通过 |
| Model | apiKey 或未知字段 | 拒绝 |
| Event | 每个持久事件夹具 | 通过 |
| Event | assistant.delta 作为 durable | 拒绝 |
| Event | 错误版本、序号、data | 拒绝 |
| Redaction | Token、Key、敏感键 | 替换为 `[REDACTED]` |
| Redaction | 普通路径与代码 | 保留 |
| Size | 中英文 16/64 KiB 边界 | 按 UTF-8 字节正确判断 |

## 7. 回退策略

- 本阶段只新增独立领域模块与测试，不迁移现有业务数据。
- 若实现无法满足 Spec，可删除本阶段新增文件恢复至工程基线；不得使用破坏性 Git 命令。
- 若 Schema 设计需要实质变化，保留失败证据，停止开发并修订 Spec。
- 不通过放宽 `.passthrough()`、移除严格校验或删除失败测试来回避问题。

## 8. 明确不执行的工作

- 不创建 JSONL 文件或会话目录。
- 不发送真实模型请求。
- 不实现跨事件状态机或 context summary 算法。
- 不实现六个具体工具参数 Schema。
- 不开发终端、API、UI 或 E2E 产品流程。
- 不修改依赖版本。

## 9. Task 审批清单

- [x] 任务完全来源于已批准 Spec。
- [x] 任务顺序、输入、输出和完成条件明确。
- [x] 允许修改的文件范围明确。
- [x] 每项公共行为都有最小测试。
- [x] 整体验证、失败处理和回退策略明确。
- [x] 没有提前实现业务代码或创建 Summary。

**Task 初版与修订 1 内部门禁：通过；当前状态：已批准。**

## 10. 用户审批记录

- 审批结果：阶段 03 Task 已获用户批准。
- 解锁动作：允许严格按照 T03-01 至 T03-10 开发、验证并生成 Summary。
- 后续门禁：Summary 获用户批准前不得开始阶段 04 观察。

## 11. 开发中断与修订 1

### 11.1 发现的事实

- 首次执行 `pnpm test -- tests/unit/domain` 时，4 个领域测试文件均在加载阶段失败，错误为 Vitest 无法解析 `@/lib/domain`。
- `tsconfig.json` 已声明 `@/*`，因此 `pnpm typecheck` 能识别该路径；现有 `vitest.config.mts` 没有等价运行时 alias。
- T03-07 明确要求测试通过 `@/lib/domain` 验证唯一公共入口，改用相对路径会降低已经批准的验收标准。
- 同次只读诊断发现测试中的 BigInt 字面量不兼容当前 ES2017 target；该问题只需在已批准测试文件内改用 `BigInt(1)`，不需要扩展文件范围。

### 11.2 修订内容

只在第 3 节允许验证修改的文件中加入 `vitest.config.mts`，且修改权限严格限制为添加根目录 `@` alias。Spec、公共接口、安全边界、任务行为和验收标准均不改变。

### 11.3 暂停状态

- 初版批准曾解锁实现，已产生 `lib/domain/**` 与 `tests/unit/domain/**` 的未完成工作树文件。
- 发现越界需要后立即停止；尚未修改 `vitest.config.mts`，尚未修复测试，尚未生成 Summary。
- 修订 1 获批后，从失败的 T03-07/T03-08 最小验证继续，不重复已完成工作。

### 11.4 修订审批门禁

- [x] 失败命令和原因已如实记录。
- [x] 修订只扩展一个验证配置文件，不改变 Spec。
- [x] 新权限用途和禁止变更均已限定。
- [x] 开发已暂停，未越界修改配置。

请用户批准“阶段 03 Task 修订 1”后再继续开发。

### 11.5 修订 1 用户审批记录

- 审批结果：阶段 03 Task 修订 1 已获用户批准。
- 解锁动作：允许按第 3 节限制修改 `vitest.config.mts`，并继续 T03-07 至 T03-10。
- 后续门禁：开发完成后必须生成 Summary 并等待用户审批。
