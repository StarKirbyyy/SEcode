# 阶段 04 Spec：模型协议层

## 1. 文档状态

- 状态：已批准。
- 当前子阶段：只读观察与 Spec。
- 前置阶段：阶段 03 Summary 已获用户批准，阶段 03 正式完成。
- 后续动作：本 Spec 获批后才能生成 `04-model-protocol-tasks.md`。
- 禁止动作：审批前不得编写模型配置、HTTP、SSE、适配器代码或相关测试，不得生成 Task/Summary。

## 2. 阶段目标与需求追踪

使用 Node.js 原生 `fetch` 和自研解析器建立提供方无关的流式 Chat Completions 模型层，使后续 Agent 可以向 DeepSeek、LongCat 或通用 OpenAI-compatible 端点发送同一套消息与工具定义，并得到经过验证的可见文本、工具调用、usage、终止原因和结构化错误。

覆盖需求：

- `FR-004`：为 Agent 的“模型决策”步骤提供稳定输入和输出。
- `FR-009`：支持 DeepSeek、LongCat 和通用 OpenAI-compatible 配置。
- `NFR-002`：所有环境配置、外部 JSON 和归一化输出均运行时校验。
- `NFR-003`：HTTP、网络、超时、SSE 和工具参数错误结构化。
- `NFR-005`：单次模型请求默认超时 120 秒，并限制异常输出大小。
- `NFR-006`：模型层不依赖 React、浏览器或 Next.js 路由，可在 Node Vitest 中独立测试。
- `SEC-006`：API Key、Authorization 和私有推理不进入公共配置、事件或日志。
- `COM-001`：不引入 Agent 框架或模型 SDK。
- `COM-003`：自行实现模型请求、流式解析、工具调用归一化和错误处理。

## 3. 观察范围与证据

### 3.1 已阅读的项目资料

- [阶段开发与三级审批门禁规范](./00-process.md)。
- [阶段 01 需求](./01-requirements.md)。
- [阶段 03 Spec](./03-domain-protocol-spec.md)。
- [阶段 03 Summary](./03-domain-protocol-summary.md)。
- 当前 `.env.example`、`package.json`、`vitest.config.mts`。
- 当前 `lib/domain/**` 与领域单元测试。
- 当前 Git 工作树和目录结构。

### 3.2 已核对的官方资料

- [DeepSeek Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)。
- [DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)。
- [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)。
- [DeepSeek Error Codes](https://api-docs.deepseek.com/quick_start/error_codes/)。
- [DeepSeek Rate Limit & Isolation](https://api-docs.deepseek.com/quick_start/rate_limit/)。
- [DeepSeek Change Log](https://api-docs.deepseek.com/updates/)。
- [LongCat-2.0 官方仓库](https://github.com/meituan-longcat/LongCat-2.0)。
- [LongCat-2.0 官方模型页](https://huggingface.co/meituan-longcat/LongCat-2.0)。

仅以官方文档、官方仓库和官方模型页作为协议事实来源；社区 issue 只用于识别文档缺口，不作为接口承诺。

## 4. 观察事实

### 4.1 当前工程事实

1. 项目已安装 Zod，无 OpenAI SDK、AI SDK、LangChain 或其他 Agent 框架。
2. Node 版本要求 `>=20.9.0`，可使用原生 `fetch`、Web Streams、TextDecoder 和 AbortController。
3. `lib/domain` 已提供 ModelProfile、ChatMessage、ToolCall、ToolDefinition、ErrorInfo、JsonObject 和脱敏函数。
4. ModelProfile 是公共脱敏结构，不含 API Key 或 `apiKeyEnv`。
5. ChatToolCall 的内部 ID 必须是 UUID，而 OpenAI-compatible 服务常返回 `call_...` 等非 UUID ID。
6. 领域事件明确禁止记录 private reasoning；`assistant.delta` 只能携带最终可见 content。
7. 当前不存在 `lib/model`、配置注册表、请求映射器、SSE 解析器或模型测试。
8. Vitest 已在 Node 环境运行，并支持 `@` 根目录 alias。

### 4.2 提供方协议事实

1. DeepSeek Chat Completions 使用 `/chat/completions`、Bearer 鉴权和 OpenAI-compatible 消息/工具结构。
2. DeepSeek 流式响应为 SSE，以 `data: [DONE]` 结束；等待调度时可能持续发送 `: keep-alive` 注释。
3. 流式 content、reasoning_content 和 tool-call arguments 都可能跨任意网络 chunk 分片。
4. DeepSeek 工具 arguments 是 JSON 字符串，官方明确要求调用方自行校验，因为模型可能输出非法 JSON 或未声明参数。
5. LongCat-2.0 官方模板的 tool-call arguments 可以直接是对象，并明确指出这不同于标准 OpenAI 字符串格式。
6. LongCat-2.0 可通过 SGLang/vLLM 暴露 OpenAI-compatible `/v1/chat/completions`，但官方没有可安全写死的统一云端 base URL、凭据规则和模型 ID。
7. DeepSeek thinking 工具回合要求后续请求完整回传 reasoning_content；缺失时可能返回 400。
8. DeepSeek 官方模型已迁移到 V4。当前 `.env.example` 的 `deepseek-chat` 已在 2026-07-24 后停止兼容，应更新为当前可用、适合 Agent 的可配置 V4 模型示例。
9. DeepSeek 400/422 表示请求问题，401 表示认证问题，402 表示余额问题，429 表示并发/限速，500/503 表示服务端临时错误。
10. OpenAI-compatible 实现对 usage 尾块、空 choices、tool-call ID、arguments 类型和额外字段的处理存在差异，不能用只匹配一个厂商完整对象的严格 Schema 解析整个响应。

## 5. 当前差距

- 环境配置未转为经过验证且不泄密的运行时注册表。
- `.env.example` 的 DeepSeek 默认模型和上下文窗口已落后于当前官方接口。
- 尚无安全的 Chat Completions URL 拼接和鉴权策略。
- 尚无跨字节 chunk、CRLF、多 data 行、注释和 `[DONE]` 的 SSE 状态机。
- 尚无 tool-call 分片聚合、对象/字符串 arguments 归一化和外部 ID 映射。
- 尚无 private reasoning 的安全续传机制。
- 尚无 timeout、AbortSignal 组合、重试、Retry-After 或结构化错误映射。
- 尚无明确规则区分“可重试的 HTTP 失败”和“已经输出部分 delta 后不可自动重试的流中断”。
- 后续 Agent 若直接接触厂商响应，会导致厂商差异、安全策略和错误处理散落到状态机。

## 6. 范围

### 6.1 范围内

- 服务端模型配置注册表与公共配置快照。
- DeepSeek、LongCat、generic 三类 OpenAI-compatible Chat Completions 映射。
- 原生 fetch 请求、Bearer 鉴权、超时、取消和有限重试。
- 通用 SSE 字节流解析器。
- Chat completion chunk 解析和文本/tool-call 增量聚合。
- 工具参数字符串/对象归一化。
- 外部工具调用 ID 与内部 UUID 的稳定映射。
- 仅内存的不透明 provider continuation，用于回放外部 ID 和必要的 private reasoning。
- finish reason、usage 和错误归一化。
- 基于假 fetch/本地假响应的纯 Node 单元测试。
- 更新 `.env.example` 中阶段 04 涉及的模型配置示例。

### 6.2 范围外

- Agent 循环、迭代限制和终止状态转换，属于阶段 09。
- 工具注册、参数 Schema 和执行，属于阶段 06。
- 将非法工具调用反馈给模型的循环策略，属于阶段 09；本阶段只返回结构化结果。
- JSONL 持久化和恢复，属于阶段 08。
- 上下文选择和压缩，属于阶段 10。
- 终端、Route Handler、NDJSON 和 UI，属于阶段 11、13、14。
- DeepSeek Responses API、Anthropic API、LongCat 原始 tokenizer/XML 协议。
- 图片、文件、FIM、JSON Output、prefix completion、web search 和批处理 API。
- 自动下载、部署或启动 LongCat 权重、SGLang 或 vLLM。
- 真实凭据冒烟测试；安排在阶段 12 与最终验收，且不得记录密钥。

## 7. 设计原则

1. **标准核心、提供方薄适配**：请求主体采用 Chat Completions 公共子集，差异只进入映射器。
2. **外部数据默认不可信**：HTTP body、SSE data、tool arguments 和 usage 逐层解析，不用 TypeScript 断言替代运行时校验。
3. **最终可见内容与私有状态分离**：content 可通过回调输出，reasoning 永不进入公共事件。
4. **可重放事实与瞬时传输分离**：外部 call ID 和 reasoning 只服务当前活跃模型回合，不成为 JSONL 事实。
5. **取消优先**：调用方 AbortSignal 一旦触发，不重试、不包装成普通提供方错误。
6. **避免重复副作用**：2xx 流一旦开始消费模型 payload，流中断不自动重发请求。
7. **大小有界**：错误 body、单个 SSE 帧、可见输出、reasoning 和工具参数均有上限。
8. **依赖可注入**：fetch、时钟、随机数和 sleep 可替换，重试与超时测试不依赖真实网络或真实等待。
9. **不记录请求正文**：消息可能包含用户代码；默认日志只记录模型配置 ID、尝试次数、状态码和结构化摘要。

## 8. 模型配置规格

### 8.1 服务端定义

运行时内部定义不跨 API 边界：

```ts
interface ServerModelProfileDefinition {
  profile: ModelProfile;
  apiKeyEnv: string;
  requiresApiKey: boolean;
  adapter: "deepseek" | "longcat" | "generic";
}
```

`apiKeyEnv` 只保存允许读取的环境变量名称。API Key 不长期复制到 Profile 中；发送请求前按 profile 定向读取注入的环境对象。代码不得枚举或序列化整个 `process.env`。

### 8.2 配置快照

```ts
interface ModelConfigIssue {
  profileId: string;
  code: "MISSING_BASE_URL" | "MISSING_MODEL" | "MISSING_API_KEY" | "INVALID_VALUE";
  message: string;
}

interface ModelRegistrySnapshot {
  profiles: ModelProfile[];
  issues: ModelConfigIssue[];
}
```

- DeepSeek Profile 始终出现在 profiles；base URL 和 model 有示例默认值，缺少 Key 时 `configured: false` 并产生 issue。
- LongCat 和 generic 只有在 base URL 与 model 均存在且有效时进入 profiles；缺失或部分配置进入 issues。
- LongCat/generic 允许无 Key 的本机自托管端点；存在 Key 时发送 Bearer header。
- issues 只能说哪个环境变量缺失或格式无效，不能包含环境变量实际值。

### 8.3 环境变量

保留并校验：

```text
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL
DEEPSEEK_MODEL
DEEPSEEK_CONTEXT_WINDOW
LONGCAT_API_KEY
LONGCAT_BASE_URL
LONGCAT_MODEL
LONGCAT_CONTEXT_WINDOW
OPENAI_COMPAT_API_KEY
OPENAI_COMPAT_BASE_URL
OPENAI_COMPAT_MODEL
OPENAI_COMPAT_CONTEXT_WINDOW
```

新增可选能力开关：

```text
LONGCAT_SUPPORTS_THINKING
OPENAI_COMPAT_SUPPORTS_THINKING
```

布尔值只接受 `true` 或 `false`，上下文窗口只接受正整数。DeepSeek 的 supportsThinking 固定为 true。

`.env.example` 的 DeepSeek 示例更新为：

```text
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_CONTEXT_WINDOW=1000000
```

模型名始终允许用户覆盖，不把易变化的模型列表写死在 Schema 中。

### 8.4 URL 安全与路径拼接

- 只接受 `https:`，或指向 `localhost`、`127.0.0.1`、`::1` 的 `http:`。
- 拒绝 URL 中的 username、password、query 和 hash。
- base URL 可以是域名根、带 `/v1` 的网关根，或完整 `/chat/completions`。
- 若末尾不是 `/chat/completions`，在保留已有路径的前提下追加该路径；不能使用会覆盖 `/v1` 的相对 URL 解析方式。
- 去除重复斜线，不修改主机、端口和已有路径大小写。
- 不提供任意请求 headers 环境变量，防止用户配置内容意外进入日志或客户端。

## 9. 模型层公共运行接口

### 9.1 请求

```ts
interface ModelRequest {
  profileId: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  signal: AbortSignal;
  continuation?: ModelContinuation;
  thinking?: {
    enabled: boolean;
    effort?: "low" | "high" | "max";
  };
  onTextDelta?: (content: string) => void | Promise<void>;
}
```

- messages 与 tools 在发请求前再次通过阶段 03 Schema。
- 首版不发送 temperature、top_p、frequency_penalty、presence_penalty 或并行 choice 数。
- 有 tools 时依赖提供方默认 auto，不主动发送 tool_choice，以兼容 DeepSeek thinking 模式和不同网关。
- `onTextDelta` 只接收最终可见 content，按解析顺序串行 await，不能接收 reasoning。
- 默认 thinking disabled。DeepSeek 显式发送 `{ thinking: { type: "disabled" } }`，避免官方默认 thinking 导致隐式 reasoning 续传要求。
- 只有 profile 声明 supportsThinking 时才允许 enabled；DeepSeek 映射官方 thinking 与 reasoning_effort，LongCat/generic 首版只解析返回的 reasoning，不发送非标准启用字段。

### 9.2 正常结果

```ts
type NormalizedFinishReason = "stop" | "tool_calls";

interface ModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

type NormalizedModelToolCall =
  | { ok: true; call: ToolCall }
  | {
      ok: false;
      id: ToolCallId;
      name: string | null;
      rawArgumentsPreview: string;
      error: ErrorInfo;
    };

interface ModelCompletion {
  content: string | null;
  toolCalls: NormalizedModelToolCall[];
  finishReason: NormalizedFinishReason;
  usage?: ModelUsage;
  continuation: ModelContinuation;
}
```

不变量：

- stop 必须有非空可见 content，且不得有工具调用。
- tool_calls 必须至少有一个合法或非法工具调用结果；content 可以为 null、空或非空。
- arguments 是对象时直接校验；是字符串时 JSON.parse 后必须为普通 JSON 对象。
- JSON 非法、解析后为数组/primitive、工具名非法时，不使整个请求崩溃，而是生成 `ok: false` 结果。
- 未知但名称合法的工具仍是 `ok: true` ToolCall；是否存在于注册表由阶段 06/09 判断。
- content 与有效工具参数必须通过阶段 03 Schema；不得把原始厂商对象直接暴露给 Agent。

### 9.3 不透明 continuation

`ModelContinuation` 是只能原样传回模型客户端的不透明类型：

- 对外对象没有可枚举字段，`JSON.stringify` 结果不包含 private reasoning、外部 ID 或原始响应。
- 真正数据保存在模型模块内部 WeakMap 中。
- continuation 绑定 profile ID，跨 profile 使用直接拒绝。
- 内部保存活跃运行所需的外部 tool-call ID 映射、原始 arguments 形态和必要 reasoning_content。
- 每次完成返回累积后的新 continuation，供下一次工具回合请求使用。
- 运行终止后由 Agent 丢弃；不得写 JSONL、事件、终端历史、API 或 UI。
- 崩溃恢复时不恢复 private continuation。恢复运行必须基于持久可见历史发起新模型决策；thinking 默认 disabled 保证首版可恢复路径不依赖私有推理。

## 10. 请求映射

### 10.1 公共消息

- system/user 映射为相同 role 与 content。
- assistant 文本映射为 role/content。
- assistant 工具调用映射为 role、content 和 `tool_calls`。
- tool 映射为 role、content 和提供方原始 tool_call_id；DeepSeek/generic 不额外发送 name。
- 若 continuation 中存在对应的 provider assistant message，优先恢复原始外部 ID、arguments 形态和必要 reasoning_content。
- 若没有 continuation，使用内部 UUID 作为外部 ID，arguments 使用 JSON 字符串；该降级只服务新鲜上下文，不承诺恢复 thinking 子回合。

### 10.2 工具定义

- 直接映射 `type: function`、name、description、parameters。
- 首版不启用 DeepSeek beta strict，以避免 beta base URL 和受限 JSON Schema 子集影响 LongCat/generic 兼容性。
- 执行层仍必须使用阶段 06 的 Zod Schema，不信任模型或提供方 strict。

### 10.3 提供方差异

| 项目 | DeepSeek | LongCat | generic |
| --- | --- | --- | --- |
| endpoint | base + `/chat/completions` | 支持 base `/v1` 后追加 | 同 LongCat |
| Key | 必需 | 可选 | 可选 |
| thinking disabled | 显式发送官方字段 | 不发送非标准字段 | 不发送非标准字段 |
| thinking enabled | 官方字段与 effort | 首版不主动启用 | 首版不主动启用 |
| arguments 输入 | 标准 JSON 字符串 | 保留 continuation 中原始 string/object | 标准字符串，响应兼容对象 |
| tool result | tool_call_id | tool_call_id；按 continuation 复原 | tool_call_id |
| reasoning | 仅不透明续传 | 若返回则仅不透明保存 | 若返回则仅不透明保存 |

LongCat 的云端/自托管细节不写死；真实端点只需满足本 Spec 接受的 Chat Completions 子集。

## 11. SSE 字节流解析规格

### 11.1 解析层次

```text
ReadableStream<Uint8Array>
  → TextDecoder(stream=true)
  → SSE 行与事件状态机
  → data 字符串 / [DONE]
  → JSON chunk 运行时校验
  → content/tool/reasoning/usage 聚合器
  → ModelCompletion
```

分层实现，SSE parser 不认识 Chat Completions；chunk aggregator 不自行读取网络。

### 11.2 SSE 状态机

- 正确处理 UTF-8 字符跨 byte chunk。
- 接受 LF 与 CRLF，结尾单独 CR 必须等待下一个 chunk 决定。
- 空行结束一个 SSE event。
- 同一 event 的多个 `data:` 行用换行连接。
- 忽略 `: comment`，包括 DeepSeek `: keep-alive`。
- 忽略 event、id、retry 和未知字段；首版只消费 data。
- `data: [DONE]` 产生终止标记，不作为 JSON 解析。
- EOF 前刷新 TextDecoder；若仍有完整未空行结尾的 data event，可以提交该 event，但完整 completion 仍必须看到 `[DONE]`。
- 无 `[DONE]`、无 response body、data JSON 非法或 SSE 帧超限，返回 MODEL_PROTOCOL_ERROR。

### 11.3 大小限制

- 单个 SSE event data 最大 8 MiB。
- 累积可见 content 最大 8 MiB。
- 单个工具 arguments 最大 4 MiB。
- 当前活跃 continuation 的 reasoning 总量最大 8 MiB。
- HTTP 错误 body 只读取并脱敏最多 8 KiB。

超过限制立即中止 response body，并返回不含原始大内容的 MODEL_RESPONSE_TOO_LARGE。

## 12. Chat chunk 聚合

### 12.1 choice 规则

- 请求不设置 n，只接受 choice index 0。
- usage-only 或兼容端点空 choices chunk 可以接受。
- 多 choice 或非 0 choice 视为不支持的协议。
- 未知顶层和 delta 字段忽略，以兼容提供方扩展；已识别字段类型错误必须拒绝。

### 12.2 content 与 reasoning

- content 字符串按到达顺序拼接，并逐片调用 onTextDelta。
- null/缺失 content 不产生 delta。
- reasoning_content 单独拼接到 continuation，永不调用 onTextDelta。
- 同一 chunk 同时有 content 和 reasoning 时分别处理，不能用 `else` 丢弃其中一项。

### 12.3 tool_calls

- 以 tool call `index` 聚合；缺 index 时以该 chunk 中数组位置作为兼容回退。
- id、function.name 和 function.arguments 都可能分片。
- arguments 字符串按顺序拼接。
- arguments 对象只允许作为单次完整值；对象后又出现片段属于协议错误。
- provider ID 缺失时，基于 completion ID、tool index 和名称生成稳定外部 call ID。
- 所有外部 ID，不论是否 UUID，都基于 provider、completion ID、外部 ID 和 index 生成确定性的内部 UUID。
- 内部 UUID 写入 ToolCall/事件；外部 ID 只留在 continuation。
- 多个调用按 index 升序输出，所有写入/执行仍由后续 Agent 串行处理。

### 12.4 finish reason

- `stop` → 正常 stop。
- `tool_calls` → 正常 tool_calls。
- `length` → MODEL_OUTPUT_TRUNCATED，recoverable=true。
- `content_filter` → MODEL_CONTENT_FILTERED，recoverable=false。
- `insufficient_system_resource` → MODEL_PROVIDER_UNAVAILABLE，recoverable=true。
- null 只允许出现在中间 chunk。
- 未知非空 finish reason → MODEL_PROTOCOL_ERROR，并在安全 details 中记录该短字符串。

必须在 `[DONE]` 前观察到一个非 null finish reason，且它与聚合结果不矛盾。

## 13. HTTP、超时、取消与重试

### 13.1 请求

- 方法固定 POST。
- headers 固定 Content-Type、Accept 与可选 Authorization Bearer。
- body 固定 stream=true，并请求 usage 尾块；兼容端点不返回 usage 也不失败。
- 不设置或记录 Cookie、Referer、用户环境变量或自定义任意 header。
- 请求 body 不进入日志、ErrorInfo details 或事件。

### 13.2 超时和取消

- 每次尝试默认 120 秒，从发起 fetch 到读取完整 `[DONE]`。
- 内部 timeout 与调用方 signal 组合；清理 timer，避免泄漏。
- 调用方 signal 触发时立即取消 body reader，并抛出专用 ModelAbortError 供阶段 09 转成 run.cancelled，不进行重试。
- timeout 产生 MODEL_TIMEOUT；在调用方未取消且尚未消费 2xx payload 时允许按重试策略重试。

### 13.3 重试

总尝试次数最多 3 次，包括第一次请求。

可重试：

- HTTP 408、429、500–599。
- fetch 在取得 Response 前的临时网络错误。
- 单次 attempt timeout，前提是尚未消费模型 payload。

不可重试：

- 400、401、402、403、404、422 等确定性客户端/配置错误。
- 调用方取消。
- 2xx 响应开始消费任何非 keep-alive 模型 payload 后的 JSON、协议或网络错误。
- arguments 非法；它作为结构化工具调用错误返回给 Agent，而不是重发同一模型请求。

退避：

- 无 Retry-After 时使用 500ms、1000ms 的指数基数，并乘 0.5–1.5 随机抖动。
- 合法 Retry-After 支持秒数和 HTTP 日期，最大等待 30 秒。
- sleep 必须响应调用方 signal。
- 测试注入固定随机数和虚拟 sleep，不真实等待。

2xx 流已开始后禁止自动重试，是为了避免 UI 收到重复 delta、工具调用重复聚合以及模型随机生成不同结果。此时 ErrorInfo details 标记 `partialOutputDiscarded: true`，后续 Agent 决定是否发起新的完整决策。

## 14. 结构化错误模型

模型层使用阶段 03 ErrorInfo，稳定错误码如下：

| code | recoverable | 典型原因 |
| --- | --- | --- |
| MODEL_CONFIG_MISSING | false | profile、base、model 或必需 Key 缺失 |
| MODEL_CONFIG_INVALID | false | URL、上下文窗口、布尔值非法 |
| MODEL_AUTH_ERROR | false | 401/403 |
| MODEL_PAYMENT_REQUIRED | false | 402 |
| MODEL_REQUEST_INVALID | false | 400/404/422 等请求问题 |
| MODEL_RATE_LIMITED | true | 429 且重试耗尽 |
| MODEL_PROVIDER_UNAVAILABLE | true | 5xx、容量 finish reason、重试耗尽 |
| MODEL_NETWORK_ERROR | true | 建连前网络错误或流中断 |
| MODEL_TIMEOUT | true | 120 秒 attempt timeout 且重试耗尽 |
| MODEL_PROTOCOL_ERROR | false | SSE/JSON/chunk 结构不支持 |
| MODEL_RESPONSE_TOO_LARGE | false | 帧、content、reasoning 或 arguments 超限 |
| MODEL_OUTPUT_TRUNCATED | true | finish_reason=length |
| MODEL_CONTENT_FILTERED | false | finish_reason=content_filter |
| MODEL_INVALID_TOOL_CALL | true | 工具名或 arguments 不能归一化 |

ErrorInfo details 只允许：provider、profileId、attempt、status、requestId、finishReason、safeBodyPreview、partialOutputDiscarded 和字段级校验摘要。所有字符串先脱敏并截断；不得包含 headers、Key、完整 URL query、请求 body、reasoning 或完整原始响应。

## 15. 私有推理处理

1. reasoning_content 不是用户可审计事件，不展示、不持久化、不进入普通日志。
2. 默认关闭 DeepSeek thinking，减少隐式协议状态并提高兼容性。
3. 显式启用 DeepSeek thinking 时，只在当前活跃运行的 continuation WeakMap 保存必要内容。
4. onTextDelta 只接收 content；测试使用“秘密哨兵推理文本”验证它从未进入回调或公共结果。
5. continuation 不可跨模型、不可 JSON 序列化、不可恢复。
6. 如果 continuation 丢失，不尝试猜测或伪造 reasoning；发起新的非 thinking 决策。
7. LongCat/generic 即使返回 reasoning_content，也按相同最少披露规则处理。

这一区分不是丢弃协议必要信息：它保留在传输层瞬时状态中，但不会成为产品历史或用户可见内容。

## 16. 安全与合规约束

- 只从服务端允许列表环境变量读取 Key。
- 非 loopback HTTP 端点拒绝，避免明文发送凭据和工作区代码。
- Authorization header 不进入 ErrorInfo、测试快照或日志。
- 单元测试只用假 Key，例如 `test-key`，不访问真实提供方。
- 模型请求正文可能包含本地代码；任何调试输出只能记录计数和摘要，不能默认记录正文。
- 网络响应有大小限制，防止兼容端点造成无界内存占用。
- 不使用 OpenAI SDK、厂商 SDK、AI SDK 或 Agent 框架。
- 不把模型输出视为可信工具参数；阶段 06 还必须按具体 Zod Schema 校验。
- 本阶段只访问用户通过服务端环境配置的模型端点，不添加浏览器侧网络能力。

## 17. 建议模块边界

预计实现职责，不在 Spec 审批前创建：

```text
lib/model/config.ts          环境配置、公共快照、endpoint 规范化
lib/model/types.ts           ModelRequest/Completion/Error/opaque continuation 类型
lib/model/sse.ts             通用 SSE 字节流解析
lib/model/chat-mapper.ts     公共 ChatMessage/ToolDefinition → wire request
lib/model/chat-accumulator.ts wire chunk → content/tool/usage/continuation
lib/model/client.ts          fetch、timeout、abort、retry、错误映射
lib/model/index.ts           唯一公共导出
tests/unit/model/**          配置、SSE、映射、聚合、客户端测试
```

依赖方向：

```text
lib/domain
  ↑
model types/config
  ↑
sse + mapper + accumulator
  ↑
model client
  ↑
model index
```

- `sse.ts` 不导入领域消息或模型 client。
- `config.ts` 不执行网络请求。
- `client.ts` 不包含 Agent 循环。
- 内部 wire Schema 不从 model barrel 导出，避免后续模块依赖厂商字段。

## 18. 测试规格

### 18.1 配置与 URL

- DeepSeek 完整/缺 Key、LongCat 本机无 Key、generic 部分配置。
- 正整数和严格布尔环境值。
- 公共快照无 apiKey、apiKeyEnv 或环境值。
- root、`/v1`、完整 chat endpoint 正确拼接。
- query、hash、userinfo、非 loopback HTTP 拒绝。
- 当前 DeepSeek 示例模型和 1M context 可加载。

### 18.2 SSE

- 每个可能 byte boundary 分割同一夹具。
- 中文 UTF-8 字符中间分割。
- LF、CRLF、CR 跨 chunk。
- 多 data 行、空 data、comment、keep-alive、未知字段。
- `[DONE]`、EOF 无 DONE、非法 JSON、超大帧。

### 18.3 映射与聚合

- 四类 ChatMessage 与工具定义映射。
- content 与 reasoning 同块时均正确处理，但只有 content 进入回调。
- 单个和多个 tool calls 的 id/name/arguments 任意分片。
- arguments 字符串、对象、非法 JSON、数组、primitive。
- provider `call_*`、缺失 ID 与内部稳定 UUID。
- LongCat 对象 arguments 原样续传，DeepSeek 字符串 arguments 正常续传。
- usage 尾块有 choices、空 choices或完全缺失。
- stop/tool_calls 不变量和所有异常 finish reason。
- continuation JSON 序列化不泄露哨兵 reasoning 或外部 ID。

### 18.4 client

- headers 与 body 精确检查，但测试输出不打印 Authorization。
- 401/402/403/422 立即终止。
- 408/429/500/503、建连错误和 timeout 按最多 3 attempts 重试。
- Retry-After 秒数/日期与 30 秒上限。
- caller abort 在 fetch、sleep 和读取 body 三个位置均立即停止。
- 首个 payload 前断开可重试；首个 payload 后断开不自动重试。
- onTextDelta 保持顺序，异步回调不会并发。
- reasoning 哨兵不进入公共 completion、delta 回调或 ErrorInfo。

全部测试使用构造的 Response/ReadableStream 或注入 fetch，不读取真实 Key，不访问互联网。

## 19. 可测试验收标准

### 19.1 正常能力

- 同一 ModelRequest 可映射到 DeepSeek、LongCat、generic 的兼容请求。
- arbitrary byte chunk 下最终 content、tool calls 和 usage 完全一致。
- 多工具调用按 index 稳定归一化为阶段 03 ToolCall UUID。
- DeepSeek 字符串参数和 LongCat 对象参数得到相同 JsonObject。
- tool result 下一轮使用原始 provider call ID，不误用内部 UUID。
- caller 可以收到逐片可见 content 和最终 ModelCompletion。

### 19.2 失败能力

- 配置、HTTP、timeout、abort、SSE、JSON、大小和 finish reason 均有确定错误语义。
- 非法工具参数变成 MODEL_INVALID_TOOL_CALL，不崩溃、不执行工具。
- 401/403 不重试；429/5xx 最多 3 attempts。
- 部分流中断不会自动重发。
- 没有 `[DONE]` 的流不能伪装成成功 completion。

### 19.3 安全能力

- 公共 Profile、ModelCompletion、ErrorInfo、delta 回调和 JSON.stringify(continuation) 均不含 Key。
- private reasoning 只存在于不可枚举、仅内存 continuation。
- 非 loopback HTTP 拒绝。
- 模型层不依赖 React、Next.js、浏览器、模型 SDK 或 Agent 框架。

## 20. 备选方案与取舍

### 20.1 使用 OpenAI SDK 或 Vercel AI SDK

拒绝。它减少传输代码，但会隐藏题目要求自行实现的流解析和工具调用归一化，也增加提供方行为不透明性。

### 20.2 同时支持 Chat Completions 与 Responses API

首版拒绝。DeepSeek 当前 Responses API 的模型覆盖与流事件不同，LongCat 自托管主要暴露 Chat Completions；双协议会扩大测试矩阵而不改善首版闭环。

### 20.3 将 reasoning_content 加入阶段 03 ChatMessage 或事件

拒绝。它会泄露私有推理并破坏已经批准的最少披露协议。使用不透明 continuation 满足 DeepSeek 活跃工具回合的回传要求。

### 20.4 永久关闭 thinking，不解析 reasoning

拒绝完全忽略。默认关闭可以提高稳定性，但兼容端点仍可能返回 reasoning；显式 thinking 也可能在终端验收中需要，因此必须安全解析和隔离。

### 20.5 流中断后透明重试

拒绝。已经发送的 delta 无法撤销，新请求可能产生不同工具调用，会导致重复显示和潜在重复执行。

### 20.6 把 LongCat XML/tool template 直接拼入提示词

拒绝。用户要求 OpenAI-compatible 端点；SGLang/vLLM 应负责模板与协议转换。客户端自行拼 XML 会把模型版本细节扩散到 Agent 上下文。

### 20.7 为所有外部工具 ID直接使用原字符串

拒绝。阶段 03 内部协议要求 UUID，且外部 ID 可能缺失或重复。使用确定性内部 UUID并在 continuation 保留外部 ID。

## 21. 风险、假设与待确认决策

### 21.1 风险

- LongCat 官方没有统一公开云端 API 契约，不同 SGLang/vLLM 版本可能在 arguments 和 tool result 字段上有差异。
- DeepSeek 官方接口在 2026 年变化较快；模型名必须环境可配，测试不能只固定一个版本。
- 不持久化 reasoning 意味着 thinking 工具回合在进程崩溃后不能原样继续，只能从持久可见历史重新决策。
- 通用 OpenAI-compatible 名称不保证完全兼容；本项目只承诺本文定义的子集。
- 8 MiB/4 MiB 响应限制可能拒绝异常大的生成内容，但可防止本地进程内存失控。

### 21.2 假设

- 首版 Agent 每次模型请求只需要一个 choice。
- 六个工具定义数量远小于 DeepSeek 的 128 工具上限。
- LongCat/generic 端点由可信本地用户配置，且可用 Chat Completions SSE。
- Agent 会串行发模型请求，不需要模型客户端内部并发队列。
- 阶段 09 会保管并传递 continuation，但不会持久化或展示它。

### 21.3 本次审批将确认的决策

批准本 Spec 即表示确认：

1. 首版只实现流式 Chat Completions，不实现 Responses/Anthropic API。
2. DeepSeek 示例默认更新为 `deepseek-v4-flash` 与 1M context，但仍允许环境覆盖。
3. DeepSeek thinking 默认显式关闭；启用时 reasoning 只在不透明内存 continuation 中续传。
4. LongCat/generic 允许本机无 Key 端点，不写死 LongCat base URL 或模型 ID。
5. 字符串和对象两种 tool arguments 均接受，非法参数以结构化结果交给后续 Agent 修正。
6. 所有外部 tool-call ID 映射为内部确定性 UUID，原 ID 仅存在于 continuation。
7. 总尝试最多 3 次；2xx 模型 payload 开始后不透明重试。
8. 非 loopback HTTP、含 userinfo/query/hash 的模型 URL 直接拒绝。
9. 采用 8 MiB SSE/content/reasoning 和 4 MiB 单工具参数上限。
10. 本阶段不修改阶段 03 公共领域协议；模型专用瞬时状态留在 `lib/model` 内部。

## 22. Spec 内部门禁

- [x] 已记录阶段 03 Summary 用户批准并完成阶段切换。
- [x] 已完成需求、代码、配置、测试和 Git 状态只读观察。
- [x] 已核对 DeepSeek 与 LongCat 当前官方资料。
- [x] 当前差距、范围内外和依赖边界明确。
- [x] 请求、结果、SSE、工具调用、continuation、错误和安全设计明确。
- [x] 正常、失败、取消、重试、兼容和泄密测试标准明确。
- [x] 未创建模型代码、模型测试、Task 或 Summary。
- [x] 未安装依赖、访问真实模型端点或读取真实凭据。

**Spec 内部门禁：通过。当前状态：已批准。**

## 23. 用户审批记录

- 审批结果：阶段 04 Spec 已获用户批准。
- 已确认决策：流式 Chat Completions、DeepSeek V4 示例、thinking 默认关闭、不透明 continuation、LongCat 对象参数兼容、内部稳定 UUID、最多 3 次尝试、URL 与响应大小限制。
- 解锁动作：允许生成 `04-model-protocol-tasks.md`。
- 仍然禁止：Task 获批前不得编写模型协议代码、模型测试或修改 `.env.example`。
