# 阶段 04 Task：模型协议层

## 1. 文档状态

- 状态：已批准。
- 依据 Spec：[04-model-protocol-spec.md](./04-model-protocol-spec.md)。
- Spec 状态：已批准。
- 当前子阶段：开发、验证与反思已完成。
- 后续动作：阶段 04 Summary 获批后才能开始阶段 05 观察。
- 禁止动作：Summary 审批前不得生成阶段 05 Spec 或开发工作区安全层。

## 2. 已批准范围摘要

本阶段实现 Node.js 环境中自研的流式 Chat Completions 模型层：

- 从允许列表环境变量生成脱敏模型注册表。
- 安全规范化 DeepSeek、LongCat 和 generic endpoint。
- 使用原生 fetch 发起请求，不使用厂商 SDK 或 Agent 框架。
- 自行解析任意字节分片的 SSE。
- 聚合 content、private reasoning、tool-call fragments、usage 和 finish reason。
- 兼容字符串与对象 arguments，并把非法调用变成结构化结果。
- 把外部 call ID 映射为内部确定性 UUID。
- 使用不可枚举、仅内存 continuation 续传外部 ID 与必要 reasoning。
- 实现取消、120 秒 attempt timeout、最多 3 次总尝试和有限退避。
- 使用假 fetch/Response/ReadableStream 完成 Node 单元测试。

不实现 Agent 循环、具体工具、JSONL、上下文压缩、终端、Route Handler 或 UI。

## 3. 允许修改的文件范围

### 3.1 预计新增

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

`tests/unit/model/helpers.ts` 只放稳定夹具、SSE Response 构造器、可控 fetch/sleep/时钟等测试辅助，不导出到生产代码。

### 3.2 预计修改

```text
.env.example
docs/development/README.md
docs/development/04-model-protocol-tasks.md
```

### 3.3 明确禁止

- 修改 `lib/domain/**` 或阶段 03 测试。
- 修改 `app/**`、Next.js 配置、Playwright 配置或 UI。
- 修改 `package.json`、`pnpm-lock.yaml`、TypeScript/ESLint/Vitest 配置。
- 安装 OpenAI SDK、AI SDK、LangChain 或其他依赖。
- 创建 Agent、工具、工作区安全、JSONL、终端或 API 模块。
- 访问真实 DeepSeek/LongCat 端点或读取开发者真实 `.env.local`。
- 修改已经批准的阶段 01–03 规格与实现。

如果实现需要超出上述文件、公共行为、大小限制或安全边界，必须立即停止并申请 Task 或 Spec 修订审批。

## 4. 实现依赖顺序

```text
T04-01 模型类型与错误边界
  ├──→ T04-02 配置注册表与 URL 安全
  └──→ T04-03 通用 SSE 解析器
          ↓
T04-04 Chat 请求映射与 continuation 基础
          ↓
T04-05 Chunk 聚合、工具归一化与 continuation 累积
          ↓
T04-06 HTTP client、超时、取消与重试
          ↓
T04-07 公共导出与环境示例
          ↓
T04-08 完整模型层单元测试
          ↓
T04-09 全阶段验证与一致性审查
          ↓
T04-10 Summary
```

每项任务完成后先运行对应测试文件；不得积累多个未知失败后再一次性诊断。

## 5. 详细任务清单

### T04-01：建立模型运行类型与结构化错误边界

覆盖：`FR-004`、`NFR-002`、`NFR-003`、`NFR-006`、`SEC-006`。

输入：已批准 Spec 第 8、9、14、15 节，阶段 03 公共领域入口。

涉及文件：

```text
lib/model/types.ts
tests/unit/model/helpers.ts
tests/unit/model/client.test.ts（先建立类型级夹具，行为在 T04-06 完成）
```

实现内容：

- 定义 `ServerModelProfileDefinition`、`ModelConfigIssue`、`ModelRegistrySnapshot`。
- 定义 `ModelRequest`、`ModelUsage`、`NormalizedFinishReason`。
- 定义合法/非法联合 `NormalizedModelToolCall`。
- 定义 `ModelCompletion`。
- 定义不透明 `ModelContinuation` 公共类型，外部只能保存引用并原样传回。
- 定义模型层稳定错误码常量和 `ModelLayerError`。
- `ModelLayerError` 内部携带经过 `ErrorInfoSchema` 验证的 public error 和可选 cause；cause 不进入 JSON。
- 定义 `ModelAbortError`，供后续 Agent 将调用方取消与普通失败分离。
- 定义 client 依赖注入类型：fetch、sleep、now、random、timeoutMs、maxAttempts。
- 定义大小常量：8 MiB SSE/content/reasoning、4 MiB arguments、8 KiB HTTP error preview。

不变量：

- ModelCompletion 不出现 provider 原始 JSON、API Key、headers 或 reasoning。
- ModelContinuation 无公共可枚举数据字段。
- 错误 details 只能使用阶段 04 Spec 允许列表字段。
- `maxAttempts` 表示总尝试次数，不是额外重试次数。

最小验证：

- `ModelLayerError.error` 通过 ErrorInfoSchema。
- abort error 可与普通模型错误区分。
- continuation 的 TypeScript API 不暴露 provider state。
- JSON.stringify 一个空 continuation token 不出现私有字段。

完成条件：模型运行类型只依赖 `@/lib/domain` 和平台类型，不依赖 client、React、Next.js 或 I/O。

### T04-02：实现环境配置注册表与安全 endpoint

覆盖：`FR-009`、`NFR-002`、`SEC-006`。

输入：T04-01，Spec 第 8 节。

涉及文件：

```text
lib/model/config.ts
tests/unit/model/config.test.ts
```

实现内容：

- 用 Zod 校验允许列表环境变量，不枚举完整环境。
- 生成 DeepSeek、LongCat、generic 的脱敏 `ModelRegistrySnapshot`。
- DeepSeek 默认 base、model 与 context 使用已批准 V4 示例。
- DeepSeek 缺 Key 时保留 `configured: false` Profile，并返回 `MISSING_API_KEY` issue。
- LongCat/generic 只有 base 与 model 完整有效时进入 profiles；Key 可选。
- `*_CONTEXT_WINDOW` 只接受十进制正整数，不使用宽松 parseInt 接受尾随垃圾。
- `*_SUPPORTS_THINKING` 只接受严格 `true`/`false`。
- issue message 只包含环境变量名称或 profile ID，不包含环境值。
- 实现 endpoint 规范化：根路径、`/v1` 和完整 `/chat/completions`。
- 拒绝 username/password、query、hash、非 http(s) 及非 loopback 明文 HTTP。
- 正确识别 `localhost`、IPv4 loopback 与方括号 IPv6 loopback。
- 提供通过 profile ID 查找 server definition 的函数；不存在或 configured=false 时抛稳定配置错误。
- 提供按 apiKeyEnv 定向读取 Key 的内部函数，不把 Key 写回定义。

最小验证：

- DeepSeek 有/无 Key，LongCat 本机无 Key，generic 完整/部分/非法配置。
- public snapshot 深度检查不含 `apiKey`、`apiKeyEnv`、Authorization 或假 Key 值。
- URL 路径矩阵与拒绝矩阵全部覆盖。
- `https://host/v1` 必须得到 `https://host/v1/chat/completions`，不能丢失 `/v1`。
- HTTP 只允许三个 loopback 主机形式。

完成条件：配置模块不读取真实 `process.env` 作为隐式全局；入口接受注入的 env-like 对象，生产调用方后续显式传入。

### T04-03：实现通用 SSE 字节流状态机

覆盖：`FR-004`、`NFR-002`、`NFR-003`、`NFR-005`、`COM-003`。

输入：T04-01，Spec 第 11 节。

涉及文件：

```text
lib/model/sse.ts
tests/unit/model/sse.test.ts
tests/unit/model/helpers.ts
```

实现内容：

- 接收 `ReadableStream<Uint8Array>` 并异步产出 `data` 或 done 事件。
- 使用一个 streaming TextDecoder，不能分别 decode 每个 chunk。
- 正确处理 LF、CRLF 和 CR/LF 跨 chunk。
- 空行提交当前 SSE event。
- 多个 data 行以换行连接；保留 data 冒号后的一个可选空格规则。
- 忽略注释、keep-alive 和非 data 字段。
- `[DONE]` 只产出终止事件；之后任何 data 均视为协议错误或停止读取，行为必须在测试中固定为“停止且取消 reader”。
- EOF 刷新 decoder；允许提交尾部未以空行结束的完整 data，但不替代 Chat 层对 DONE 的要求。
- 单 event data 按 UTF-8 最大 8 MiB；超限抛 `MODEL_RESPONSE_TOO_LARGE`。
- caller abort 时取消 reader，并抛 `ModelAbortError`。
- parser 自身不 JSON.parse，不导入 Chat 或 Tool 类型。

最小验证：

- 同一个中文/多行/CRLF 夹具在每个 byte boundary 切分后产出一致结果。
- 单独 CR 在 chunk 尾、下一 chunk LF 的场景无重复空行。
- keep-alive 不计为模型 payload。
- 空 data、多 data、未知 field、尾部 event、DONE 和超限覆盖。
- abort 能取消底层 reader。

完成条件：解析器是提供方无关的纯传输层，没有 DeepSeek/LongCat 条件分支。

### T04-04：实现 Chat 请求映射与不透明 continuation 基础

覆盖：`FR-004`、`FR-009`、`SEC-006`、`COM-003`。

输入：T04-01、T04-02、阶段 03 ChatMessage/ToolDefinition，Spec 第 9、10、15 节。

涉及文件：

```text
lib/model/chat-mapper.ts
tests/unit/model/chat-mapper.test.ts
```

实现内容：

- 建立内部 wire request/message/tool 类型与最小 Zod 校验；不从 barrel 公开厂商类型。
- 再次 parse ModelRequest.messages 和 tools，拒绝调用方伪造的类型。
- 映射 system、user、assistant text、assistant tool_calls、tool result。
- DeepSeek/generic 默认把 arguments 序列化为 JSON 字符串。
- 根据 continuation 恢复 provider assistant 原始 call ID、arguments string/object 形态和 reasoning_content。
- tool result 把内部 UUID 映射回 provider call ID。
- DeepSeek 不发送 tool message name；LongCat continuation 允许保持 provider 所需形态。
- 无 continuation 时使用内部 UUID 作为 provider call ID，arguments 使用稳定 JSON 字符串。
- 映射 tools 公共子集，不添加 beta strict 或 tool_choice。
- body 固定 `stream: true`，请求 usage 尾块。
- DeepSeek 默认显式 thinking disabled；enabled 时校验 profile capability 并映射 effort。
- LongCat/generic 不发送非标准 thinking 启用字段；不支持 profile 上请求 enabled 时返回配置错误。
- 创建 continuation token 的内部存储：token 对外不可枚举，provider state 存在 WeakMap。
- continuation 必须绑定 profile ID；跨 profile 拒绝。

最小验证：

- 四类领域消息与工具定义精确映射。
- DeepSeek disabled/enabled，LongCat/generic capability 拒绝路径。
- 外部 `call_*` 能在下一轮 tool message 恢复。
- LongCat object arguments 能按原始形态回放。
- JSON.stringify continuation 不含 reasoning 哨兵、外部 ID 或 arguments。
- 输出 request body 不包含 API Key。

完成条件：mapper 不执行 fetch，不解析 SSE，不把 wire 类型暴露给后续 Agent。

### T04-05：实现 Chat chunk 聚合与工具调用归一化

覆盖：`FR-004`、`NFR-002`、`NFR-003`、`NFR-005`、`SEC-006`、`COM-003`。

输入：T04-01、T04-03、T04-04，Spec 第 9、12、15 节。

涉及文件：

```text
lib/model/chat-accumulator.ts
tests/unit/model/chat-accumulator.test.ts
tests/unit/model/helpers.ts
```

实现内容：

- 对每个 SSE data JSON.parse，再用宽容外层/严格已识别字段 Schema 校验。
- 接受未知扩展字段；已识别字段类型错误必须拒绝。
- 只接受 choice 0；允许 usage-only 空 choices；拒绝多 choice/非零 choice。
- content 和 reasoning_content 独立拼接，同块同时存在时不能互斥处理。
- content delta 依到达顺序串行 await 回调。
- reasoning 只进入私有 continuation accumulator。
- tool calls 按 index 聚合；缺 index 时使用数组位置回退。
- 分别聚合 provider ID、name 和 string arguments fragments。
- arguments object 只接受一次完整对象；对象与后续 fragment 混用拒绝。
- 缺 provider ID 时基于 completion ID/index/name 生成稳定 provider ID。
- 基于 adapter/completion/provider ID/index 生成符合 UUID Schema 的确定性内部 ID。
- 参数字符串 JSON.parse 后必须通过 JsonObjectSchema；对象直接通过同一 Schema。
- 非法 JSON、数组/primitive、非法/缺失工具名生成 `MODEL_INVALID_TOOL_CALL` union item，不使其他调用丢失。
- 非法调用只保留脱敏且有限的 rawArgumentsPreview。
- 未知但名称合法的工具按合法 ToolCall 返回。
- 聚合 prompt/completion/total/reasoning tokens，忽略未知 usage 扩展。
- 映射 stop/tool_calls；把 length/content_filter/capacity/unknown reason 转成 Spec 错误。
- 验证 `[DONE]`、最终 finish reason 及 completion 不变量。
- 应用 8 MiB content/reasoning 和 4 MiB 单 arguments 限制。
- 把本轮 provider assistant 状态合并进旧 continuation，返回新 token。

最小验证：

- content/reasoning 同块、异步 delta 顺序与 reasoning 哨兵隔离。
- 单/多工具每个字段任意片段、乱序 index、缺 ID。
- 同一输入重复聚合得到相同内部 UUID。
- DeepSeek string 与 LongCat object 归一化相同 JsonObject。
- 一个非法调用不阻止同 response 中另一个合法调用。
- usage 三种尾块形态与缺失 usage。
- 所有 finish reason、无 DONE、矛盾结果与大小上限。

完成条件：公共 ModelCompletion 完全不含 wire chunk、reasoning 或 provider ID。

### T04-06：实现原生 fetch client、取消、超时和重试

覆盖：`FR-004`、`FR-007`、`FR-009`、`NFR-003`、`NFR-005`、`SEC-006`、`COM-001`、`COM-003`。

输入：T04-01 至 T04-05，Spec 第 13、14、16 节。

涉及文件：

```text
lib/model/client.ts
tests/unit/model/client.test.ts
tests/unit/model/helpers.ts
```

实现内容：

- 提供模型层单一执行函数或 client class，输入 `ModelRequest` 和显式 env/依赖。
- 通过 registry 解析 profile/endpoint，并在请求前定向读取 API Key。
- POST JSON，设置 Content-Type、Accept、可选 Bearer Authorization。
- 不发送 Cookie、Referer 或任意自定义环境 header。
- 每 attempt 创建 120 秒 timeout，并与 caller signal 组合。
- 无论成功、失败或 abort 都清理 timer、释放 body reader。
- caller abort 统一抛 ModelAbortError，不进入重试和普通 ErrorInfo。
- HTTP 非 2xx 读取最多 8 KiB body，先脱敏再写 safe preview。
- 401/403 → auth；402 → payment；400/404/422 → request invalid。
- 408/429/5xx、取得 Response 前网络错误和未消费 payload 的 timeout 可重试。
- 最多 3 total attempts。
- 解析 Retry-After 秒数/HTTP 日期，最大 30 秒；否则 500/1000ms 基数乘 0.5–1.5 jitter。
- sleep 可响应 abort；测试注入，不真实等待。
- `: keep-alive` 不把请求标记为已消费 payload。
- 收到第一个非 keep-alive SSE data 后标记 payloadStarted。
- payloadStarted 后的网络/SSE/JSON错误不自动重试，details 标记 partialOutputDiscarded。
- response body 缺失、DONE 缺失、content-type 差异按 Spec：不强依赖 header，但 body 必须可解析为 SSE。
- 异常 cause 只保留在进程内，不序列化 stack、headers 或 body。

最小验证：

- 请求 URL、body 和允许 header 精确断言；测试失败输出不得打印 Authorization 值。
- 所有状态码映射与 attempts 数量。
- 429 Retry-After、5xx jitter、网络错误和 timeout。
- fetch 前 abort、retry sleep 中 abort、body 读取中 abort。
- payload 前断开重试，payload 后断开不重试。
- 最终成功 delta/usage/tool calls 正确返回。
- response error 中假 Key、Bearer 与 reasoning 哨兵均被移除。

完成条件：client 不导入 Next.js、不访问 UI/事件存储、不实现 Agent 迭代。

### T04-07：建立唯一公共导出并更新无秘密环境示例

覆盖：`FR-009`、`NFR-006`、`SEC-006`、`COM-004`。

输入：T04-01 至 T04-06。

涉及文件：

```text
lib/model/index.ts
.env.example
tests/unit/model/config.test.ts
```

实现内容：

- 从 `lib/model/index.ts` 只导出 Agent 后续真正需要的 client、config snapshot、请求/结果类型、错误类型和稳定常量。
- 不导出 wire Schema、provider state WeakMap、Key 读取器或原始响应类型。
- 不使用默认导出。
- `.env.example` 更新 DeepSeek V4 Flash 与 1M context 示例。
- 添加 LongCat/generic supports thinking 开关示例，默认 false。
- 保持所有 Key 为空，不添加真实 URL 查询参数或私有 endpoint。
- 测试只从 `@/lib/model` 导入至少一组公共 API，验证 barrel。

最小验证：

- import 公共入口成功。
- 检查 `.env.example` 所有 `*_API_KEY=` 后为空。
- registry 能解析示例中不含秘密的默认/空配置。
- 公共导出列表不含 continuation 内部访问函数。

完成条件：阶段 09 可只依赖 `@/lib/model` 与 `@/lib/domain` 完成模型决策。

### T04-08：完成模型协议层单元测试矩阵

覆盖：Spec 第 18、19 节全部验收标准。

输入：T04-01 至 T04-07。

涉及文件：

```text
tests/unit/model/helpers.ts
tests/unit/model/config.test.ts
tests/unit/model/sse.test.ts
tests/unit/model/chat-mapper.test.ts
tests/unit/model/chat-accumulator.test.ts
tests/unit/model/client.test.ts
```

实现内容：

- 使用固定 UUID、时间和非秘密哨兵夹具，避免随机测试漂移。
- helpers 可将一个 UTF-8 byte array 按任意边界切分为 ReadableStream。
- SSE “每个 byte boundary”测试使用表驱动，不引入属性测试依赖。
- fetch 脚本可按 attempt 返回状态码、抛异常或产生可控流。
- 虚拟 sleep 记录 delay 与 signal，不产生真实等待。
- 正向、反向、极限和泄密测试并重。
- 断言稳定错误码、recoverable、有限 details，而不是依赖整段错误文案。
- 对私有 reasoning、Authorization、API Key 和原始大参数设置显式“不包含”断言。

最小验证：

```text
pnpm exec vitest run tests/unit/model/config.test.ts
pnpm exec vitest run tests/unit/model/sse.test.ts
pnpm exec vitest run tests/unit/model/chat-mapper.test.ts
pnpm exec vitest run tests/unit/model/chat-accumulator.test.ts
pnpm exec vitest run tests/unit/model/client.test.ts
pnpm exec vitest run tests/unit/model
```

完成条件：Spec 第 18 节每项测试要求均能映射到具体 test name；不得只通过覆盖率推断行为正确。

### T04-09：阶段整体验证与一致性审查

覆盖：`NFR-002`、`NFR-003`、`NFR-006`、`NFR-008`、`SEC-006`、`COM-001`、`COM-003`。

执行顺序：

1. `pnpm exec vitest run tests/unit/model`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm build`
6. `git diff --check`
7. 扫描 `lib/model` 不导入 React、Next.js、浏览器 UI、文件系统、子进程或模型/Agent SDK。
8. 扫描 `package.json` 与 lockfile 确认没有新增依赖。
9. 扫描 `.env.example`、生产代码、测试输出与 ErrorInfo 夹具，确认无真实秘密。
10. 审核 public barrel 不导出 wire provider 类型或 continuation 内部状态。
11. 审核未创建 Task 之外的 Agent、工具、存储、终端、API 或 UI 模块。

失败处理：

- 在开发记录中保留首次失败命令、实际错误、根因和修正。
- 只修复批准范围内的实现，先重跑最小用例，再完整重跑门禁。
- 不通过增加 sleep、跳过 flaky 测试、删除边界用例或放宽安全规则制造通过。
- 若失败表明需要改变阶段 03 协议、重试语义、私有推理边界、URL 策略、大小限制或文件范围，立即停止并重新审批。

完成条件：全部命令退出码 0，所有人工审查结论有 Summary 证据。

### T04-10：生成阶段 Summary

输入：T04-01 至 T04-09 的实现与真实验证记录。

涉及文件：

```text
docs/development/04-model-protocol-summary.md
docs/development/README.md
```

实现内容：

- 记录 Spec、Task 审批状态和任何重新审批。
- 逐项记录 T04-01 至 T04-10 完成情况。
- 详细说明配置、SSE、映射、聚合、continuation、client 和错误实现。
- 列出新增、修改、删除文件。
- 如实记录首次失败、诊断、修正和重验。
- 记录精确测试文件数、测试数和所有最终命令结果。
- 对照 Spec/Task 列出偏差；无偏差也明确说明。
- 记录 Key/reasoning/URL/大小/依赖安全检查。
- 反思实现并说明对阶段 05 和阶段 09 的接口影响。
- 更新索引为“阶段 04 Summary 待用户审批”。

完成条件：Summary 内部门禁通过后立即停止，等待用户审批，不开始阶段 05 观察。

## 6. 测试矩阵

| 类别 | 核心场景 | 预期 |
| --- | --- | --- |
| Config | DeepSeek 缺 Key | Profile configured=false，issue 无秘密 |
| Config | LongCat localhost 无 Key | 可配置且不发送 Authorization |
| Config | partial/invalid env | 有限结构化 issue，不抛原环境值 |
| URL | root、`/v1`、完整 path | 正确得到 chat endpoint |
| URL | non-loopback HTTP、userinfo/query/hash | 拒绝 |
| SSE | 任意 byte boundary、中文 | 事件完全一致 |
| SSE | CRLF、跨 chunk CR/LF、多 data | 正确分帧 |
| SSE | keep-alive | 忽略且不标记 payload |
| SSE | 无 DONE、非法/超大 data | 结构化失败 |
| Mapper | 四类消息、tools | wire body 正确 |
| Mapper | DeepSeek thinking | 默认关闭；显式启用映射 effort |
| Continuation | provider ID/reasoning | 下一轮可用，公共 JSON 不可见 |
| Tool call | string/object arguments | 归一化为 JsonObject |
| Tool call | 非法 JSON/数组/非法名 | invalid union，不崩溃 |
| Tool call | 外部/缺失 ID | 稳定内部 UUID，原 ID 可续传 |
| Chunk | content + reasoning 同块 | content 可见，reasoning 私有 |
| Usage | final choice/空 choices/缺失 | 能归一化或安全省略 |
| Finish | stop/tool_calls | 满足完成不变量 |
| Finish | length/filter/capacity/unknown | 按稳定错误码处理 |
| HTTP | 401/402/403/422 | 不重试 |
| HTTP | 408/429/5xx/network/timeout | 最多 3 total attempts |
| Retry | Retry-After/jitter | delay 正确且封顶 |
| Abort | fetch/sleep/body | 立即 ModelAbortError |
| Partial | payload 后断流 | 不重试，标记 partial discarded |
| Security | Key/Bearer/reasoning 哨兵 | 不进入公共结果和错误 |

## 7. 失败处理与回退策略

### 7.1 失败分类

- 实现 bug：保持 Spec/Task，修复并重跑。
- 测试夹具 bug：证明夹具与官方协议或 Spec 冲突后修正，不降低断言。
- 提供方事实变化：停止，补充官方证据并修订 Spec。
- 文件范围缺口：停止，修订 Task 并重新审批。
- 阶段 03 类型不足：停止，不直接修改 `lib/domain`；先修订阶段 03 Spec。

### 7.2 回退

- 本阶段没有数据库或持久数据迁移。
- 模型模块是新增隔离目录，可按文件级恢复，不使用破坏性 Git 命令。
- `.env.example` 仅含空 Key 和公开示例，可恢复旧行但不得删除用户真实 `.env.local`。
- 不清理、覆盖或提交当前工作树中的阶段 00–03 既有修改。

## 8. 明确不执行的工作

- 不创建真实 API Key 或修改 `.env.local`。
- 不执行真实 DeepSeek/LongCat 请求、计费调用或模型下载。
- 不启动 SGLang、vLLM 或本地 LongCat 服务。
- 不实现 Agent while loop、模型迭代、终止条件或上下文压缩。
- 不把模型 delta 转成 AgentEvent；事件生成属于阶段 09。
- 不实现具体工具 Schema、风险审批或进程执行。
- 不持久化 continuation 或 reasoning。
- 不实现 Responses API、Anthropic API、图片、文件或 web search。
- 不开发终端、Web API、UI 或 Playwright 产品流程。
- 不修改依赖、构建目标或测试框架配置。

## 9. Task 审批清单

- [x] 任务完全来源于已批准 Spec。
- [x] 文件范围、禁止范围和重新审批条件明确。
- [x] 任务按类型→配置/SSE→映射→聚合→client→导出依赖排序。
- [x] 每项输入、输出、实现行为和完成条件明确。
- [x] 每项公共行为和安全边界都有直接测试。
- [x] timeout、abort、retry、partial stream 和 private reasoning 均有失败路径。
- [x] 没有提前创建模型代码、测试、环境修改或 Summary。
- [x] 没有添加依赖或真实网络操作。

**Task 内部门禁：通过。当前状态：已批准。**

## 10. 用户审批记录

- 审批结果：阶段 04 Task 已获用户批准。
- 解锁动作：允许严格按 T04-01 至 T04-10 开发、验证并生成 Summary。
- 后续门禁：阶段 04 Summary 获批前不得开始阶段 05 观察。
