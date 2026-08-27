# 阶段 04 Summary：模型协议层

## 1. 文档状态与审批链

- 当前状态：已批准。
- 依据 Spec：[04-model-protocol-spec.md](./04-model-protocol-spec.md)，已获用户批准。
- 依据 Task：[04-model-protocol-tasks.md](./04-model-protocol-tasks.md)，已获用户批准。
- 当前子阶段：开发、测试、整体验证与反思已完成。
- 后续门禁：阶段 05 已解锁只读观察；其 Spec 获批前不得生成 Task 或开发工作区安全层。

审批过程：

1. 用户批准阶段 04 Spec，确认流式 Chat Completions、DeepSeek V4 示例、thinking 默认关闭、不透明 continuation、确定性内部 UUID、三次总尝试和 URL/响应大小边界。
2. 用户批准阶段 04 Task，解锁 T04-01 至 T04-10 的代码、测试、环境示例和 Summary。
3. 开发严格限制在 Task 允许文件内；未触发需要改变 Spec、领域协议、依赖或文件范围的重新审批条件。
4. 完成模型层精确测试、仓库全量测试、lint、类型检查、生产构建和人工安全审查后生成本 Summary。

## 2. 阶段结果

本阶段建立了一个与 React、Next.js 路由、Agent 循环和本地工具解耦的 Node.js 模型协议层。后续 Agent 可以通过唯一公共入口选择 DeepSeek、LongCat 或 generic OpenAI-compatible 配置，发送统一领域消息和工具定义，并获得经过校验的文本、工具调用、usage、结束原因及结构化错误。

最终结果：

- 7 个模型生产模块完成。
- 6 个模型测试文件完成，其中 5 个为测试套件、1 个为流夹具辅助。
- 模型层 60 个精确单元测试全部通过。
- 仓库 10 个测试文件、128 个测试全部通过。
- lint、TypeScript、Next.js 16.3.3 生产构建和差异格式检查全部通过。
- 没有增加依赖，没有访问真实模型端点，没有读取或写入真实凭据。
- 没有提前实现 Agent、工具、工作区安全、存储、终端、API 或 UI。

## 3. 任务完成清单

| 任务 | 状态 | 实现证据 | 验证证据 |
| --- | --- | --- | --- |
| T04-01 模型类型与错误边界 | 完成 | `lib/model/types.ts` | client/config 测试、TypeScript |
| T04-02 配置注册表与 URL 安全 | 完成 | `lib/model/config.ts` | `config.test.ts` |
| T04-03 通用 SSE 解析器 | 完成 | `lib/model/sse.ts` | `sse.test.ts` |
| T04-04 请求映射与 continuation | 完成 | `lib/model/chat-mapper.ts` | `chat-mapper.test.ts` |
| T04-05 chunk 与工具调用聚合 | 完成 | `lib/model/chat-accumulator.ts` | `chat-accumulator.test.ts` |
| T04-06 原生 fetch client | 完成 | `lib/model/client.ts` | `client.test.ts` |
| T04-07 公共入口与环境示例 | 完成 | `lib/model/index.ts`、`.env.example` | barrel 与空 Key 测试 |
| T04-08 模型测试矩阵 | 完成 | `tests/unit/model/**` | 5 个套件、60 个测试通过 |
| T04-09 整体验证与审查 | 完成 | 本文第 7、8 节 | 全部门禁退出码 0 |
| T04-10 Summary | 完成 | 本文档、开发索引 | 内部门禁通过，用户已批准 |

## 4. 详细开发过程

### 4.1 类型、错误和不透明状态

`lib/model/types.ts` 定义模型配置快照、请求、completion、usage、合法/非法工具调用联合、client 依赖注入以及稳定模型错误码。公共结果只包含后续 Agent 所需数据，不携带 headers、原始响应、供应商 call ID 或私有 reasoning。

`ModelLayerError` 的公共部分始终经过阶段 03 `ErrorInfoSchema` 验证；原始 cause 只作为不可枚举的进程内诊断值。调用方取消使用独立 `ModelAbortError`，避免 Agent 把用户停止误记为模型故障。

`ModelContinuation` 是只有品牌类型的空对象。真正的供应商状态保存在模块私有 `WeakMap` 中，token 冻结且无可枚举字段：`JSON.stringify` 结果固定为 `{}`。这保证它只能在当前进程中由调用方保存引用并原样传回，不能被事件、日志或 JSONL 意外持久化。

### 4.2 模型配置与 endpoint 安全

配置注册表只读取代码声明的环境变量名称，不遍历完整环境：

- DeepSeek 使用公开默认 base URL、`deepseek-v4-flash` 和 1,000,000 context；缺 Key 时仍返回脱敏 profile，但标记 `configured: false`。
- LongCat 与 generic 必须同时提供 base URL 和 model；context 只接受严格十进制正整数，thinking 开关只接受字面量 `true`/`false`。
- LongCat/generic Key 可选，因此可信用户可接入无 Key 的本机 SGLang/vLLM 网关。
- public snapshot 不包含 `apiKeyEnv`、Key、Authorization 或 server definition。

endpoint 规范化保留已有路径并只追加一次 `/chat/completions`。HTTPS 可用于远端；明文 HTTP 只允许 `localhost`、`127.0.0.1` 和 `[::1]`。userinfo、query、hash、非 HTTP(S) 和非本机明文地址均在发请求前拒绝。

### 4.3 SSE 字节流状态机

`parseSseStream` 直接消费 `ReadableStream<Uint8Array>`，使用 fatal streaming `TextDecoder`，因此中文 UTF-8 字符跨任意网络 chunk 仍能正确恢复。状态机支持 LF、CRLF、CR/LF 跨 chunk、多 `data:` 行、注释 keep-alive、未知字段、尾部无空行 event 和 `[DONE]`。

解析器只负责 SSE 分帧，不解析 JSON，也没有提供方分支。调用方 abort 会取消 reader 并抛 `ModelAbortError`；收到 `[DONE]` 后主动停止和取消后续读取。单 event data 受 8 MiB UTF-8 上限保护。

SSE 测试把同一中文多行夹具在每一个 byte boundary 处切分，确认输出与未切分完全一致，而不是只测试常见 chunk 位置。

### 4.4 请求映射和 continuation 回放

`buildChatRequest` 在边界上重新用领域 Schema 校验 messages 与 tools，再映射 system、user、assistant 文本、assistant tool calls 和 tool result。请求固定启用 streaming 和 usage 尾块，不添加未批准的 `tool_choice` 或 beta strict 字段，也不接触凭据。

DeepSeek 请求默认显式发送 `thinking: { type: "disabled" }`；只有 DeepSeek 且 profile 声明支持时才允许显式启用和映射 effort。LongCat/generic 不发送 DeepSeek 专用 thinking 字段。

首次工具调用没有 continuation 时，内部 UUID 会作为临时 provider call ID，参数使用稳定 JSON 字符串。有 continuation 时则回放供应商原始 assistant turn，包括原 call ID、字符串或对象 arguments 形态以及 DeepSeek 所需的 reasoning。DeepSeek tool message 不附加 name；LongCat 会附加 name。

人工一致性审查进一步补强了 continuation 混用检查：同一 assistant message 如果混合已追踪和未追踪调用，或调用来自不同历史 turn，会结构化拒绝，不能静默丢失某个调用。

### 4.5 chunk、工具调用和 usage 聚合

`accumulateChatCompletion` 对每个 SSE data 先 JSON.parse，再用 Zod 验证已识别字段，同时容忍无关扩展字段。首版只接受 choice 0，并允许 usage-only 空 choices。

聚合行为包括：

- content 与 reasoning_content 在同一 chunk 中分别累积，content delta 按到达顺序串行 await 回调。
- reasoning 从不进入 `ModelCompletion`，只有存在工具调用时才放入私有 continuation 供下一轮协议回放。
- 工具调用按 index 排序与聚合；ID、名称和字符串 arguments 可跨多个 chunk 拼接。
- LongCat 的完整对象 arguments 可直接接收；对象与字符串分片混用会拒绝。
- 缺供应商 call ID 时按 completion ID、index 和名称生成稳定私有 ID。
- 再按 adapter、completion ID、provider ID 和 index 计算 SHA-256，并设置 UUID version/variant 位，得到符合领域 Schema 的确定性内部 UUID。
- 参数最终必须是 JSON object；非法 JSON、数组、primitive、缺失/非法名称形成 recoverable 的 `MODEL_INVALID_TOOL_CALL` union item，不阻塞同一响应内其他合法调用。
- 名称合法但尚未注册的工具仍作为合法调用返回，由后续 Agent/工具注册表产生“未知工具”结果。
- prompt、completion、total 和 reasoning token 可从 usage 尾块归一化。

`stop` 只允许非空可见文本且不能同时携带调用；`tool_calls` 必须至少有一个调用。`length`、`content_filter`、资源不足和未知 finish reason 均映射为稳定错误。缺 `[DONE]`、冲突 finish reason、非法 UTF-8 和响应不变量破坏不会被当作成功。

### 4.6 原生 fetch、超时、取消和重试

`createModelClient` 使用注入环境和依赖构造，不隐式读取 `process.env`。生产默认使用 Node 原生 fetch；测试注入 fetch、sleep、时钟和随机数，没有真实等待或网络请求。

每次 HTTP attempt：

1. 解析 profile、定向读取 Key、构建无秘密请求体。
2. 只设置 `Accept`、`Content-Type` 和有 Key 时的 Bearer Authorization。
3. 创建独立 120 秒 timeout controller，并与 caller signal 联动。
4. 对 2xx body 使用自研 SSE 与 accumulator；不依赖 Content-Type 声明。
5. 在成功、失败和取消路径清理 timer、监听器和 reader。

最大尝试数在 client 构造时硬限制为 1–3。401/403、402 和普通 4xx 立即失败；408、429、5xx、建连错误和 payload 前 timeout 可重试。Retry-After 同时支持秒数和 HTTP 日期并封顶 30 秒；否则使用 500/1000 ms 指数基数和 0.5–1.5 抖动。

keep-alive 注释不算 payload。收到第一个真正 SSE data 后，无论后续是网络、SSE、JSON、结束原因还是回调错误，都不自动重试；错误 details 增加 `partialOutputDiscarded: true`，避免重复 delta 或重复工具调用。

HTTP 错误体按字节最多读取 8 KiB；Bearer、已知 API Key、常见秘密格式和 reasoning 字段先脱敏再形成有限 `safeBodyPreview`。读取错误体本身失败不会把已知 401/403 误分类为可重试网络故障；caller abort 仍拥有最高优先级。

### 4.7 公共入口和环境示例

`lib/model/index.ts` 是后续 Agent 的唯一公共入口，导出 client、脱敏配置快照、请求/结果类型、错误类型和稳定限制常量。它不导出 server definition、Key 读取器、wire Schema、SSE accumulator、continuation WeakMap 或供应商状态类型。

`.env.example` 已更新 DeepSeek V4 Flash/1M context，LongCat/generic 增加默认 false 的 thinking capability 开关；所有 `*_API_KEY=` 仍为空。测试会读取该文件并逐行断言 Key 示例为空。

## 5. 文件变更

### 5.1 新增

```text
lib/model/types.ts
lib/model/config.ts
lib/model/sse.ts
lib/model/chat-mapper.ts
lib/model/chat-accumulator.ts
lib/model/client.ts
lib/model/index.ts
tests/unit/model/helpers.ts
tests/unit/model/config.test.ts
tests/unit/model/sse.test.ts
tests/unit/model/chat-mapper.test.ts
tests/unit/model/chat-accumulator.test.ts
tests/unit/model/client.test.ts
docs/development/04-model-protocol-summary.md
```

### 5.2 修改

```text
.env.example
docs/development/04-model-protocol-tasks.md
docs/development/README.md
```

### 5.3 删除

无。

`docs/development/00-process.md`、`02-engineering-baseline.md`、阶段 03 文件和 `vitest.config.mts` 是本阶段开始前已有的工作树内容；阶段 04 没有修改它们，也没有把它们计入本阶段实现。

## 6. 失败、诊断与修正记录

### 6.1 mapper 消息角色未被 TypeScript 完全收窄

- 首次失败命令：`pnpm typecheck && pnpm lint`。
- 错误：TypeScript 认为最终分支仍可能是 system/user，不能访问 `toolCallId` 和 `name`。
- 根因：Zod 推导联合中的 system/user 共享 enum role，前置分支后没有被编译器收窄为仅 tool。
- 修正：最终映射分支显式检查 `message.role === "tool"`。
- 复验：typecheck 与 lint 通过，四类消息精确映射测试通过。

### 6.2 partial-stream 测试夹具同步 error 吞掉已入队 chunk

- 首次失败命令：`pnpm exec vitest run tests/unit/model/client.test.ts`。
- 结果：14 个 client 测试中 1 个失败；预期 payload 后只请求一次，实际请求三次。
- 根因：测试流在同一个 `start()` 中先 enqueue 再立即 `controller.error()`；Web Stream 会进入 errored 状态，消费者没有机会取得已入队 chunk，因此实现正确地把它视为 payload 前断流。
- 修正：夹具改为下一事件循环触发 error，先保证 data 被真实消费，再模拟 socket 断开。没有修改 client 的禁止重试规则。
- 复验：delta `visible` 被回调一次、fetch 只调用一次，错误含 `partialOutputDiscarded: true`。

### 6.3 delta 测试回调返回了 Array.push 的数字

- 首次失败命令：client 测试通过后的 `pnpm typecheck`。
- 错误：简写箭头函数返回 `number`，不符合 `void | Promise<void>`。
- 根因：测试夹具使用 `(delta) => deltas.push(delta)`，意外把 push 返回值暴露为回调返回类型。
- 修正：使用块体回调，只执行 push、不返回值。
- 复验：TypeScript、lint 和相关 client 测试全部通过。

### 6.4 一致性与防御性审查补强

初次模型层测试通过后继续人工对照 Spec/Task，补强了以下批准范围内行为：

- continuation 中混合已追踪与未追踪工具调用时明确拒绝，避免静默丢调用。
- 注入依赖的 `maxAttempts` 也强制不超过 3，避免测试入口绕过生产不变量。
- 已取得 HTTP 错误状态后，即使错误预览 body 自身断流也保持原状态分类；只有真实 caller abort 覆盖它。
- 增加 content/reasoning 8 MiB、408 HTTP-date、timeout 后恢复、body 读取中取消和 continuation 不一致回归测试。

没有删除边界测试、放宽 Schema、泄露 reasoning 或通过增加真实 sleep 制造通过。

## 7. 最终验证记录

| 命令 | 最终结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/model/config.test.ts` | 通过 |
| `pnpm exec vitest run tests/unit/model/sse.test.ts` | 通过 |
| `pnpm exec vitest run tests/unit/model/chat-mapper.test.ts` | 通过 |
| `pnpm exec vitest run tests/unit/model/chat-accumulator.test.ts` | 通过 |
| `pnpm exec vitest run tests/unit/model/client.test.ts` | 通过 |
| `pnpm exec vitest run tests/unit/model` | 5 个文件、60 个测试全部通过 |
| `pnpm lint` | 通过，无 ESLint 错误或 warning |
| `pnpm typecheck` | 通过，无 TypeScript 错误 |
| `pnpm test` | 10 个文件、128 个测试全部通过 |
| `pnpm build` | Next.js 16.3.3 Turbopack 构建成功；`/` 与 `/_not-found` 静态生成成功 |
| `git diff --check` | 通过，无空白错误 |
| 模型依赖扫描 | 生产模块未导入 React、Next.js、文件系统、子进程、模型 SDK 或 Agent 框架 |
| 依赖变更检查 | `package.json` 与 `pnpm-lock.yaml` 无阶段 04 差异 |
| 文件范围检查 | 所有阶段 04 新增/修改文件均在 Task 允许列表内 |

未执行真实 DeepSeek/LongCat 冒烟测试：Task 明确禁止真实网络、计费调用和读取真实凭据。真实凭据冒烟保留到最终验收阶段，并必须由用户提供环境配置。

## 8. Spec、Task 与范围对照

### 8.1 需求覆盖

| 需求 | 实现证据 | 验证证据 |
| --- | --- | --- |
| FR-004 模型决策协议 | mapper、accumulator、client | 正常文本/工具/usage/client 测试 |
| FR-007 可取消 | attempt signal、reader cancel、abort error | fetch 前、sleep、body abort 测试 |
| FR-009 多模型配置 | DeepSeek/LongCat/generic registry | 配置、keyless LongCat、URL 测试 |
| NFR-002 运行时校验 | Zod 配置、消息、工具、chunk | 非法 env/chunk/arguments 测试 |
| NFR-003 结构化错误 | ModelLayerError 和状态映射 | HTTP/网络/SSE/finish 测试 |
| NFR-005 超时与上限 | 120 秒默认、3 attempts、大小限制 | timeout/retry/8 MiB/4 MiB 测试 |
| NFR-006 Node 解耦 | `lib/model` 纯 Node 模块 | 依赖扫描、Node Vitest |
| SEC-006 密钥与推理隔离 | 定向 Key、WeakMap、错误脱敏 | Key/Bearer/reasoning 哨兵测试 |
| COM-001/003 自研核心 | 原生 fetch、自研 SSE/归一化 | 依赖检查和完整模型测试 |

### 8.2 最终偏差

无未批准偏差：

- 没有修改 `lib/domain/**`、app、Next.js/TypeScript/ESLint/Vitest 配置、依赖或锁文件。
- 没有实现 Agent 循环、工具、工作区安全、审批、JSONL、上下文、终端、Route Handler 或 UI。
- 没有改变最多 3 次、payload 后不重试、私有 reasoning、不安全 URL 拒绝或大小限制。
- 所有新增与修改文件均在 Task 允许清单中。

## 9. 安全检查与已知限制

安全检查结果：

- public model snapshot 与 barrel 不暴露 API Key、`apiKeyEnv` 或 server definition。
- Authorization 只在单次 fetch init 中形成，不进入 request body、completion、ErrorInfo 或测试快照。
- HTTP 错误预览有 8 KiB 上限，并对已知 Key、Bearer、环境 Key 形式和 reasoning 字段脱敏。
- continuation 的供应商 ID、arguments 原形和 reasoning 仅存在 WeakMap；公共 token 序列化为空对象。
- 模型 URL 在请求前阻止非本机 HTTP、userinfo、query 和 hash。
- 所有外部 JSON、模型参数和领域消息均在边界验证。
- 大小限制按 UTF-8 字节计算，避免中文字符计数偏差。

已知限制：

- continuation 不可持久化；进程重启后 thinking 工具回合只能从可见历史重新决策，这是已批准的首版取舍。
- generic OpenAI-compatible 只保证 Spec 定义的 Chat Completions 子集，不保证所有厂商扩展。
- LongCat 部署栈可能对 tool message 字段有版本差异；base URL、model 和 capability 保持环境可配。
- private reasoning 隔离依赖调用方只使用公共 barrel；阶段 09 必须继续禁止把 continuation 或内部模块写入事件。
- 应用级 URL 与日志保护不是恶意远端模型或本机代码的强沙箱；工作区与进程安全属于后续阶段。
- 本阶段未使用真实凭据，供应商实时兼容性需在最终冒烟测试验证。

## 10. 反思与后续阶段影响

### 10.1 本阶段反思

1. 流测试必须区分“enqueue 过”与“消费者已读取”。同步 stream error 会改变可观察语义；partial retry 测试必须以实际 data 交付为边界。
2. 私有推理隔离不能只靠不导出字段。空 token、WeakMap、公共 barrel、错误体 scrub 和显式反向测试共同形成边界。
3. 外部 ID 不能直接成为领域 ID。确定性 UUID 让事件、工具和测试都能使用统一领域 Schema，同时 continuation 保留供应商协议连续性。
4. 重试策略的关键不是状态码表，而是“副作用是否已对调用方可见”。首个 data 后停止自动重试，能避免 UI delta 与工具调用重复。
5. 测试依赖注入也是生产不变量的入口。`maxAttempts` 即使来自测试配置也必须硬限制为 3，否则验收规则可被旁路。
6. 取得 HTTP 状态和读取错误体是两个不同事实。错误预览失败不应覆盖已知 401/403 分类，caller abort 才拥有最高优先级。

### 10.2 对阶段 05 的约束

阶段 05 工作区安全层与模型层没有直接依赖，不应修改 `lib/model`。它应继续使用阶段 03 的结构化错误与最少披露原则，并保证任何工作区路径、符号链接或错误预览不会把环境凭据带入后续 AgentEvent。

阶段 05 仍必须从只读观察和独立 Spec 开始；本 Summary 获批只解锁观察，不自动批准其 Task 或开发。

### 10.3 对阶段 09 Agent 的接口影响

后续 Agent 状态机应只从 `@/lib/model` 使用：

- `createModelClient` 发起单轮决策。
- `ModelRequest` 提交领域消息、工具定义、caller signal 和上一轮 continuation。
- `ModelCompletion.content` 产生可见 assistant delta/message。
- `ModelCompletion.toolCalls` 区分合法调用和可反馈给模型的结构化非法调用。
- `ModelCompletion.continuation` 只保存在当前 run 内存，不写 JSONL、不进入事件、不展示。
- `ModelAbortError` 映射 run cancelled；`ModelLayerError.error` 映射公开失败或恢复策略。

Agent 不应从内部路径导入 mapper、accumulator、server definition 或 continuation state。模型返回未知合法工具名时，应由工具注册表形成结构化 tool error，再继续下一轮，而不是在模型层硬编码工具集合。

## 11. Summary 内部门禁

- [x] Spec 与 Task 均有明确用户批准记录。
- [x] T04-01 至 T04-10 均有实现和验证证据。
- [x] 失败命令、根因、修正和复验均如实记录。
- [x] 最终模型测试、全量测试、lint、typecheck、build 和 diff check 全部通过。
- [x] 文件范围、依赖、公共导出和后续阶段边界已审查。
- [x] API Key、Authorization、provider ID、arguments 原形和 private reasoning 未进入公共持久数据。
- [x] 未访问真实模型、安装 SDK、实现后续阶段或修改未经批准文件。
- [x] 开发索引已更新为“阶段 04 Summary 待用户审批”。

**Summary 内部门禁：通过。当前状态：已批准。**

## 12. 用户审批区

请重点审阅：

1. DeepSeek thinking 默认关闭及 private reasoning 仅内存续传是否符合预期。
2. LongCat/generic 配置、对象 arguments 和 keyless loopback 行为是否符合预期。
3. 3 次总尝试、首个 data 后不重试、120 秒 attempt timeout 是否符合预期。
4. HTTP 错误预览、URL 安全、大小限制和公共导出边界是否充分。
5. 是否批准阶段 04 Summary，从而只解锁阶段 05 的只读观察与 Spec 编写。

## 13. 用户审批记录

- 审批结果：阶段 04 Summary 已获用户批准。
- 阶段结果：阶段 04 正式完成。
- 解锁动作：允许开始阶段 05 的只读观察并生成工作区安全层 Spec。
- 仍然禁止：阶段 05 Spec 获批前不得生成 Task 或编写工作区安全代码。
