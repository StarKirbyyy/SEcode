# 阶段 03 Summary：领域类型与事件协议

## 1. 文档状态与审批链

- 当前状态：已批准。
- 依据 Spec：[03-domain-protocol-spec.md](./03-domain-protocol-spec.md)，已获用户批准。
- 依据 Task：[03-domain-protocol-tasks.md](./03-domain-protocol-tasks.md)，初版及修订 1 均已获用户批准。
- 当前子阶段：开发、验证与反思已经完成。
- 后续门禁：阶段 04 已解锁，但仍须独立执行 Spec、Task、Summary 三级审批。

审批过程：

1. 用户批准阶段 03 Spec，确认协议版本、事件持久性、Zod 单一事实来源、最少披露和终端/API/UI 共用协议。
2. 用户批准阶段 03 Task，解锁 T03-01 至 T03-10。
3. 开发中发现 Vitest 未配置 `@` 运行时 alias，立即暂停并形成 Task 修订 1。
4. 用户批准 Task 修订 1，仅解锁 `vitest.config.mts` 的 alias 修改。
5. 修订获批后继续测试、修正、全量验证并生成本 Summary。

## 2. 阶段结果

本阶段已建立不依赖 Next.js、React、文件系统、网络或 Agent SDK 的领域协议层。后续模型适配、工具、安全、存储、Agent、终端、API 和 UI 可以通过 `@/lib/domain` 使用同一套运行时 Schema、推导类型、事件联合和安全辅助函数。

最终结果：

- 7 个领域模块完成。
- 4 个领域单元测试文件完成。
- 16 类持久事件和 1 类实时事件均有严格 Schema。
- 精确领域测试 65 个全部通过；仓库全量单元测试 68 个全部通过。
- lint、TypeScript、Next.js 生产构建和差异格式检查全部通过。
- 未开发模型、工具执行、存储、Agent、终端、API 或 UI。

## 3. 任务完成清单

| 任务 | 状态 | 实现证据 | 验证证据 |
| --- | --- | --- | --- |
| T03-01 JSON、ID、时间、版本 | 完成 | `lib/domain/json.ts` | `json.test.ts` |
| T03-02 错误与结果不变量 | 完成 | `lib/domain/core.ts` | `core.test.ts` |
| T03-03 模型、会话、状态、消息 | 完成 | `lib/domain/model.ts` | `core.test.ts` |
| T03-04 工具契约 | 完成 | `lib/domain/tool.ts` | `core.test.ts` |
| T03-05 持久/实时事件联合 | 完成 | `lib/domain/event.ts` | `event.test.ts` |
| T03-06 脱敏与大小辅助 | 完成 | `lib/domain/redaction.ts` | `redaction.test.ts` |
| T03-07 唯一公共导出 | 完成 | `lib/domain/index.ts`、Vitest alias | 所有领域测试只从 `@/lib/domain` 导入 |
| T03-08 领域单元测试 | 完成 | 4 个领域测试文件 | 65/65 通过 |
| T03-09 整体验证 | 完成 | 本文第 6、7 节 | 全部门禁退出码 0 |
| T03-10 Summary | 完成 | 本文档 | 内部门禁通过，等待用户审批 |

## 4. 详细开发过程

### 4.1 JSON 与协议基础

使用 Zod 4 的 JSON Schema 作为递归 JSON 类型来源，公共值只允许字符串、有限数字、布尔值、null、数组和普通 JSON 对象。UUID、带时区 ISO 时间、正整数序号和字面量协议版本 1 均有独立 Schema。

初始使用 `z.json()` 后，测试发现循环引用会触发调用栈溢出。最终在 Zod 解析前加入祖先链循环检测，使循环对象产生普通校验失败；共享但非循环的对象仍能正常解析。此处理保持 `JsonValue` 由 Schema 推导，没有引入第二份手写 JSON 类型。

### 4.2 错误、工具结果和 UTF-8 限制

`ErrorInfoSchema` 只接收严格、可序列化的 code、message、recoverable 和可选 details，不接受原生 `Error` 或额外字段。

`ToolResultSchema` 通过 refinement 强制：

- `ok: true` 不得携带 error。
- `ok: false` 必须携带 error。
- summary 始终存在且长度受限。
- output 按 `TextEncoder` 得到的 UTF-8 字节数限制为 64 KiB。
- metadata 和 details 必须是 JSON 对象。

测试同时覆盖 ASCII 与中文多字节边界，避免把 JavaScript 字符数误当字节数。

### 4.3 模型、会话与消息

公共 `ModelProfileSchema` 只暴露模型 ID、标签、提供方、base URL、模型名、上下文窗口、thinking 能力和是否已配置。严格对象会拒绝 `apiKey` 及其他未知字段。

会话记录使用 UUID 和 ISO 字符串，状态词汇包括 idle、运行中状态及四个终态，但没有提前实现状态转换。

聊天消息支持 system、user、assistant 和 tool：assistant 可以是文本、工具调用或二者兼有，但不能二者皆空。工具参数只能是 JSON 对象，消息中不含 DeepSeek 或 LongCat 的厂商字段。

### 4.4 工具公共契约

工具名统一限制为以英文字母开头、后续仅含英文字母、数字、下划线或连字符，最长 64 个字符。该约束同时用于聊天工具调用、ToolCall、ToolDefinition 和事件，防止不同边界规则漂移。

ToolDefinition 固定为 `type: "function"`，模型可见 parameters 是 JSON Schema 兼容对象；本阶段不把 JSON Schema 当作执行校验器，具体工具的 Zod 参数 Schema 留到阶段 06。

### 4.5 事件协议

持久事件信封包含协议版本、`durable: true`、UUID、会话内 seq、session ID、ISO 时间和严格 data。除 `session.created` 外的运行事件要求 run ID。

已实现 16 类持久事件：

- session.created
- run.started
- user.message
- model.requested / model.completed
- assistant.message
- tool.requested / tool.started / tool.result
- approval.required / approval.resolved
- context.compacted
- run.completed / run.failed / run.cancelled / run.interrupted

唯一实时事件 `assistant.delta` 使用 `durable: false`、streamSeq 和必选 run ID，无法通过持久事件 Schema。公共 API 还提供 durable 和运行终态类型守卫。

本阶段只校验单个事件结构；seq 单调性、请求/结果配对、唯一终态等跨事件不变量仍按 Spec 留给阶段 08 和 09。

### 4.6 脱敏、清洗与截断

`redactSecrets` 覆盖 Bearer Token、常见 `sk-` Key 和 `*_API_KEY=value`。`sanitizeForEvent` 递归处理未知输入：

- 敏感键值替换为 `[REDACTED]`。
- 字符串先脱敏再按 UTF-8 字节保留有限预览。
- NaN、Infinity、bigint、undefined、函数、Symbol、Date、Error 和循环引用转换为安全 JSON 表达。
- 重复引用但非循环的数据不会被错误标记为循环。

`truncateUtf8` 从字节边界回退，保证不切断中文或其他多字节字符。`createPublicToolArguments` 默认限制为 16 KiB；超限时返回有限 JSON 预览、原字节数和明确 truncated 标记。过小到无法容纳标记的自定义预算会被直接拒绝。

### 4.7 公共入口与测试运行时

`lib/domain/index.ts` 是唯一公共 barrel，不使用默认导出。领域测试全部通过 `@/lib/domain` 导入。

Task 修订 1 获批后，`vitest.config.mts` 增加与 `tsconfig.json` 一致的根目录 `@` alias。没有改变 Node 测试环境、测试包含范围或覆盖率设置。

## 5. 文件变更

### 5.1 新增

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

### 5.2 修改

```text
vitest.config.mts
docs/development/03-domain-protocol-tasks.md
docs/development/README.md
```

### 5.3 删除

无。

`docs/development/00-process.md` 和 `02-engineering-baseline.md` 在阶段开始前已经存在工作树修改，本阶段没有覆盖或把它们计入阶段 03 实现。

## 6. 失败、诊断与修正记录

### 6.1 Vitest 无法解析路径别名

- 失败命令：`pnpm test -- tests/unit/domain`
- 初次结果：4 个领域 suite 在导入阶段失败；原有 baseline 的 3 个测试通过。
- 错误：无法解析 `@/lib/domain`。
- 根因：TypeScript 配置有 `@/*`，Vitest 运行时没有对应 alias。
- 处理：按流程暂停；修订 Task 并等待用户批准；获批后只在 `vitest.config.mts` 增加 alias。
- 复验：领域测试能够加载并执行。

### 6.2 BigInt 测试写法不兼容 ES2017 target

- 失败命令：首次诊断 `pnpm typecheck`。
- 错误：BigInt 字面量需要 ES2020 或更高 target。
- 根因：测试使用 `1n`，项目 target 为 ES2017，虽然 `esnext` lib 提供 `BigInt` API。
- 修正：将测试夹具改为 `BigInt(1)`，不修改 TypeScript target。
- 复验：`pnpm typecheck` 通过。

### 6.3 循环 JSON 导致 Zod 栈溢出

- 失败命令：修订后首次 `pnpm test -- tests/unit/domain`。
- 结果：65/66 通过，循环对象用例触发 `RangeError: Maximum call stack size exceeded`。
- 根因：Zod 4.4.3 内置 `z.json()` 在该输入上递归溢出。
- 修正：解析前检测当前祖先链中的循环引用，并转成结构化校验 issue。
- 回归补强：增加共享非循环引用用例，防止简单 WeakSet 实现产生误判。
- 复验：相关测试和全套测试通过。

### 6.4 一致性审查补强

首次全量门禁通过后继续人工审查，发现聊天工具调用名称约束比 ToolCall 宽、共享对象清洗可能误判、极小截断预算可能放不下标记。这些都在批准的公共契约和安全辅助范围内完成修正，并新增 2 个回归测试；最终全量测试从 66 个增加到 68 个。

没有通过删除测试、放宽 strict Schema、跳过断言或降低验收标准来处理失败。

## 7. 最终验证记录

| 命令 | 最终结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/domain` | 4 个领域文件、65 个测试全部通过 |
| `pnpm test -- tests/unit/domain` | 退出码 0；pnpm/Vitest 参数分隔行为同时运行 baseline，共 5 文件、68 测试通过 |
| `pnpm lint` | 通过，无 ESLint 错误 |
| `pnpm typecheck` | 通过，无 TypeScript 错误 |
| `pnpm test` | 5 个文件、68 个测试全部通过 |
| `pnpm build` | Next.js 16.3.3 Turbopack 生产构建成功，`/` 与 `/_not-found` 静态生成成功 |
| `git diff --check` | 通过，无空白错误 |
| 领域依赖扫描 | 仅依赖 Zod 和领域内相对模块；未导入 Next.js、React、文件系统、网络、子进程或 Agent SDK |
| 敏感串检查 | 仅发现脱敏正则和明确的虚假测试夹具；无真实凭据 |

未执行完整 Playwright 产品 E2E：阶段 03 Task 不包含 UI 行为，完整产品 E2E 按流程保留到阶段 14。

## 8. Spec 与 Task 偏差

### 8.1 已审批修订

初版 Task 未把 `vitest.config.mts` 列入范围。该差距通过 Task 修订 1 重新审批后解决，最终修改严格限制为 alias。它不改变 Spec、领域协议、安全边界或验收标准。

### 8.2 最终偏差

除上述已批准修订外，无未批准偏差：

- 所有新增业务文件均在 Task 允许范围。
- 未修改 app、Next.js 配置、依赖或锁文件。
- 未实现后续阶段业务。
- 事件与公共类型遵循协议版本 1 和 JSON 可序列化约束。

## 9. 安全检查与已知限制

安全检查结果：

- 公共 ModelProfile 无 apiKey 字段，strict Schema 会拒绝额外密钥字段。
- 事件 data 为严格 Schema 或 JsonObject，不接受 Date、Error、Map 等实例。
- 私有 reasoning 没有进入任何领域事件。
- tool.requested 使用 publicArguments 和 argumentsTruncated，不要求保存原始参数。
- 脱敏和截断均在纯函数中实现，可被后续存储、终端和 API 统一调用。
- 领域层没有 I/O、副进程、网络和框架依赖。

已知限制：

- 通用秘密识别是防御性启发式规则，不能证明发现所有任意格式的秘密；后续具体工具仍需实施数据最小化。
- `write_file` 等工具的专用公共参数投影尚未实现，属于阶段 06。
- 事件序号、生命周期关联、唯一 final 和唯一终态尚未跨事件验证，属于阶段 08、09。
- 协议版本 1 暂无迁移器，符合首版 Spec。
- usage 字段只定义公共 token 计数；厂商字段归一化属于阶段 04。

## 10. 反思与下一阶段影响

### 10.1 本阶段反思

1. 编译期路径 alias 不自动等于测试运行时 alias。以后在 Task 中要求某种导入方式时，应同时观察所有执行器的解析配置。
2. 第三方 Schema 的安全失败方式也需要测试。`safeParse` 的名称不保证任意递归输入都不会抛出，因此不可信边界必须覆盖病理输入。
3. 字符限制和字节限制不能混用。工具输出、NDJSON 和日志大小控制应继续统一复用 UTF-8 辅助函数。
4. 同一个领域概念只应有一个约束来源。工具名规则最终上移到消息层并被工具层复用，避免消息已接受但执行层拒绝的漂移。
5. 严格审批流程实际阻止了一次未授权配置修改；修订记录也为失败原因和变更权限留下了审计证据。

### 10.2 对阶段 04 的约束

阶段 04 模型协议层应直接复用：

- `ModelProfile` 作为脱敏公共模型信息。
- `ChatMessage`、`ChatToolCall` 和 `ToolDefinition` 作为提供方无关输入。
- `ErrorInfo` 表达请求、SSE 与归一化错误。
- `assistant.delta` 只传最终可见文本 delta，不传 private reasoning。
- 模型返回的 arguments 必须先归一化并通过 JsonObject/ToolCall Schema。

阶段 04 不应复制事件或消息 DTO，也不应修改协议版本 1；若模型真实接口要求改变公共协议，必须先回到阶段 03 Spec 重新审批。

## 11. Summary 内部门禁

- [x] Spec、Task 初版和 Task 修订 1 均有用户批准记录。
- [x] T03-01 至 T03-10 全部完成。
- [x] 实现与批准的 Spec、Task 一致。
- [x] 领域最小验证和阶段整体验证全部通过。
- [x] 所有失败、诊断、修正和复验已如实记录。
- [x] 无真实秘密、越界写入或未说明风险。
- [x] 已记录反思和对阶段 04 的影响。
- [x] 开发索引已更新为“Summary 待用户审批”。

**Summary 内部门禁：通过。当前状态：已批准。**

## 12. 用户审批记录

- 审批结果：阶段 03 Summary 已获用户批准，阶段 03 正式完成。
- 解锁动作：允许开始阶段 04 的只读观察并生成模型协议层 Spec。
- 后续门禁：阶段 04 Spec 获批前不得生成 Task 或编写模型协议代码与测试。
