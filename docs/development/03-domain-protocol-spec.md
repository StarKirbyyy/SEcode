# 阶段 03 Spec：领域类型与事件协议

## 1. 文档状态

- 状态：已批准
- 当前子阶段：只读观察与 Spec
- 后续动作：本 Spec 获批后才能生成 `03-domain-protocol-tasks.md`
- 禁止动作：审批前不得编写领域代码、测试或 Task/Summary 文档

## 2. 阶段目标与需求追踪

定义所有后续模块共同使用的领域语言、可序列化数据结构和事件协议，使模型适配、工具、存储、终端、API 与 UI 共享同一套经过运行时校验的契约。

覆盖需求：

- `FR-004`：Agent 循环需要统一的消息、工具调用和运行状态。
- `FR-005`：终端与 UI 需要消费统一事件。
- `FR-006`、`FR-007`：审批和取消必须有明确事件语义。
- `FR-008`：事件必须能安全写入 JSONL 并重放。
- `FR-009`：模型配置需要提供方无关的公共类型。
- `FR-010`：上下文压缩需要可持久化的摘要事件。
- `NFR-002`：公共输入必须由严格 TypeScript 和运行时 Schema 共同约束。
- `NFR-003`：错误必须结构化且可解释。
- `NFR-006`：领域层不得依赖 React、浏览器或 Next.js。
- `SEC-006`：事件与公共类型不得泄露 API Key、环境变量值或私有推理。
- `COM-003`：对话、工具、终止和错误协议由项目自行实现。

## 3. 观察范围与方法

### 3.1 已阅读资料

- 已批准的 [阶段 01 需求](./01-requirements.md)。
- 已批准的 [阶段 02 工程基线](./02-engineering-baseline.md)。
- 已批准的 [三级审批流程](./00-process.md)。
- 当前 `package.json`、`tsconfig.json`、测试配置和代码目录。
- 当前 Next.js 16 的 Server/Client 可序列化边界规则。

### 3.2 实际工程事实

1. TypeScript 已启用 `strict`、`isolatedModules` 和 `moduleResolution: bundler`。
2. Zod 4.4.3 已安装，可作为运行时 Schema 和 TypeScript 类型的单一来源。
3. Vitest 使用 Node 环境，适合测试不依赖 React 的领域协议。
4. 当前不存在 `lib` 目录、领域类型、事件 Schema 或 Agent 业务代码。
5. 当前页面仍是 Next.js 默认模板，因此没有需要兼容的旧客户端协议。
6. 后续数据需要在 Node 核心、JSONL、NDJSON、终端和 React Client Component 之间传递。
7. Next.js 的服务端到客户端边界不适合传递 `Date`、`Map`、`Set`、类实例、函数和循环引用。

## 4. 当前差距

- 尚无稳定的 Session、Run、Model、Message、Tool 和 Error 类型。
- 尚无事件版本、事件序号或事件生命周期约束。
- 尚未区分需要持久化的事实与仅用于实时显示的文本增量。
- 尚无运行时输入校验，外部模型、JSONL 和 API 数据无法建立可信边界。
- 尚无日志脱敏和大小限制协议。
- 后续阶段若各自定义类似结构，会产生类型漂移和无法可靠重放的问题。

## 5. 范围

### 5.1 范围内

- JSON 基础类型与通用标识符约定。
- 模型公共配置、会话、运行状态和结构化错误。
- 提供方无关的聊天消息与工具调用结构。
- 工具定义与工具结果结构。
- 持久事件和实时事件的判别联合。
- Zod Schema、TypeScript 推导类型和协议版本。
- 协议序列化、安全、大小与顺序约束。
- 领域 Schema 的单元验收标准。

### 5.2 范围外

- DeepSeek、LongCat 请求和 SSE 解析，属于阶段 04。
- 路径解析和工作区安全，属于阶段 05。
- 六个工具的参数细节与执行，属于阶段 06。
- 风险分类和审批等待实现，属于阶段 07。
- JSONL 文件布局、锁和恢复算法，属于阶段 08。
- Agent 状态转换与终止算法，属于阶段 09。
- 上下文压缩算法，属于阶段 10。
- 终端、Route Handlers 和 UI 实现，属于阶段 11、13、14。

## 6. 领域设计原则

1. **Schema 是运行时事实来源**：使用 Zod 定义结构，再通过 `z.infer` 导出类型，避免手写类型与验证规则漂移。
2. **只传递 JSON 数据**：领域对象只允许字符串、数字、布尔值、null、数组和普通对象。
3. **时间使用 ISO 字符串**：禁止在公共协议中使用 `Date` 实例。
4. **错误是数据**：跨边界传递结构化错误，不直接序列化 JavaScript `Error`。
5. **事件不可变**：事件一旦持久化不得原地修改；修正通过后续事件表达。
6. **事实与显示分离**：最终消息、工具结果和状态变化是持久事实；token 文本增量只用于实时体验。
7. **默认最少披露**：事件不记录 API Key、环境变量值、模型私有推理或未经处理的大段敏感参数。
8. **核心不依赖框架**：领域文件不得导入 `next/*`、React、Node 文件系统或模型 SDK。

## 7. 基础类型规格

### 7.1 JSON 类型

```ts
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };
```

运行时 Schema 必须拒绝 `undefined`、`bigint`、函数、Symbol、类实例、循环引用和非有限数字。

### 7.2 标识符与时间

- `SessionId`、`RunId`、`EventId`、`ToolCallId`、`ApprovalId` 在 TypeScript 中均为字符串别名。
- 运行时要求使用 UUID。
- `seq` 是会话内从 1 开始严格递增的正整数，只用于持久事件。
- `streamSeq` 是一次运行内从 1 开始递增的正整数，只用于实时事件。
- `createdAt` 是带时区的 ISO 8601 字符串，由服务端生成。

不使用 TypeScript branded string，避免在服务端、终端和 UI 之间增加不必要的强制转换；身份正确性由 Schema 和关联不变量保证。

### 7.3 协议版本

所有事件携带：

```ts
protocolVersion: 1
```

首版读取器只接受版本 1。未来不兼容变更必须提升版本并提供显式迁移，不静默猜测旧数据。

## 8. 模型与会话规格

### 8.1 公共模型信息

```ts
interface ModelProfile {
  id: string;
  label: string;
  provider: "deepseek" | "longcat" | "generic";
  baseUrl: string;
  model: string;
  contextWindow: number;
  supportsThinking: boolean;
  configured: boolean;
}
```

公共结构禁止出现 `apiKey` 或密钥值。服务端后续可定义不跨边界的配置结构，使用 `apiKeyEnv` 指向环境变量名称。

### 8.2 会话

```ts
interface SessionRecord {
  id: SessionId;
  title: string;
  workspacePath: string;
  modelProfileId: string;
  status: RunStatus | "idle";
  createdAt: string;
  updatedAt: string;
}
```

一个会话固定绑定一个规范化工作区和一个模型配置。工作区或模型变化时创建新会话，不修改旧会话语义。

### 8.3 运行状态

```ts
type RunStatus =
  | "queued"
  | "requesting_model"
  | "awaiting_approval"
  | "executing_tool"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";
```

`completed`、`failed`、`cancelled`、`interrupted` 为终态。具体转换规则在阶段 09 定义，本阶段只锁定词汇和序列化形式。

## 9. 消息与工具规格

### 9.1 提供方无关聊天消息

```ts
type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      toolCalls?: ChatToolCall[];
    }
  | {
      role: "tool";
      toolCallId: ToolCallId;
      name: string;
      content: string;
    };
```

`ChatToolCall` 使用已经归一化的 JSON 对象参数。各厂商的 `tool_calls` 字段差异只允许存在于阶段 04 的适配器内部。

### 9.2 工具调用

```ts
interface ToolCall {
  id: ToolCallId;
  name: string;
  arguments: JsonObject;
}
```

未知工具和非法参数仍可表示为 ToolCall，但执行前必须由具体工具 Schema 拒绝并转换为结构化工具错误。

### 9.3 工具定义

```ts
interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonObject;
  };
}
```

`parameters` 使用 JSON Schema 兼容对象，只描述模型可见接口。真正的执行边界仍由 Zod Schema 校验。

### 9.4 结构化错误与结果

```ts
interface ErrorInfo {
  code: string;
  message: string;
  recoverable: boolean;
  details?: JsonObject;
}

interface ToolResult {
  ok: boolean;
  summary: string;
  output?: string;
  metadata?: JsonObject;
  error?: ErrorInfo;
}
```

不变量：

- `ok: true` 时不得存在 `error`。
- `ok: false` 时必须存在 `error`。
- `summary` 始终是适合终端和 UI 展示的短文本。
- `output` 上限由 `NFR-005` 固定为 64 KiB，超限必须显式标记截断。

## 10. 事件协议

### 10.1 持久事件信封

```ts
interface DurableEvent<TType extends string, TData extends JsonObject> {
  protocolVersion: 1;
  durable: true;
  id: EventId;
  seq: number;
  sessionId: SessionId;
  runId?: RunId;
  type: TType;
  createdAt: string;
  data: TData;
}
```

持久事件必须进入 JSONL，并可在刷新或重启后重放。

### 10.2 实时事件信封

```ts
interface LiveEvent<TType extends string, TData extends JsonObject> {
  protocolVersion: 1;
  durable: false;
  id: EventId;
  streamSeq: number;
  sessionId: SessionId;
  runId: RunId;
  type: TType;
  createdAt: string;
  data: TData;
}
```

首版唯一实时事件为 `assistant.delta`，数据为 `{ content: string }`。它通过终端回调或 NDJSON 实时传递，但不写入 JSONL；最终完整文字由 `assistant.message` 持久化。

选择该设计的理由：

- 避免每个 token 触发磁盘同步和大量事件。
- 刷新后不需要重新拼接半截文本。
- 持久历史不会同时包含 delta 与完整消息造成重复展示。

### 10.3 持久事件类型

| 事件 | 关键数据 | 语义 |
| --- | --- | --- |
| `session.created` | `session` | 会话事实建立 |
| `run.started` | `promptPreview`、限制配置 | 一次运行开始 |
| `user.message` | `content` | 用户提交任务 |
| `model.requested` | `iteration`、`modelProfileId` | 开始一次模型决策 |
| `model.completed` | `iteration`、`finishReason`、可选 usage | 模型决策结束，不含私有推理 |
| `assistant.message` | `content`、`kind` | 中间说明或最终回答 |
| `tool.requested` | 调用 ID、工具名、脱敏参数 | 模型请求使用工具 |
| `approval.required` | 审批 ID、风险原因、工具摘要 | 运行进入审批等待 |
| `approval.resolved` | 审批 ID、是否允许 | 用户给出审批决定 |
| `tool.started` | 调用 ID、工具名 | 工具开始执行 |
| `tool.result` | 调用 ID、工具名、ToolResult | 工具成功或失败 |
| `context.compacted` | `throughSeq`、摘要、保留范围 | 上下文投影被压缩 |
| `run.completed` | 迭代数、耗时 | 运行成功结束 |
| `run.failed` | ErrorInfo、迭代数 | 运行不可恢复失败 |
| `run.cancelled` | 原因、迭代数 | 用户或系统取消 |
| `run.interrupted` | 原因、最后稳定序号 | 进程异常退出后的恢复事实 |

`assistant.message.kind` 只能为 `intermediate` 或 `final`。一次成功运行必须且只能有一个 final 消息和一个 `run.completed`。

## 11. 顺序与关联不变量

1. `seq` 在同一会话内唯一且严格递增；不同会话互不比较。
2. 一次 run 必须先有 `run.started`，最终只能出现一个运行终态事件。
3. `model.completed` 必须对应同 iteration 的 `model.requested`。
4. `tool.started` 和 `tool.result` 必须引用已经出现的 `tool.requested`。
5. `approval.resolved` 必须引用已经出现且未处理的 `approval.required`。
6. 需要审批的工具只有在批准后才能产生 `tool.started`；拒绝时直接产生失败的 `tool.result`。
7. `assistant.delta` 的 `streamSeq` 只保证同一 run 的实时顺序，不参与恢复。
8. JSONL 重放只使用持久事件，不能依赖实时 delta。
9. 领域 Schema 只验证单个结构；跨事件生命周期不变量由阶段 08/09 的存储和状态机验证。

## 12. 数据最小化与脱敏

- 永不保存 API Key、Authorization 请求头、完整 `process.env` 或模型私有 reasoning。
- `tool.requested` 不直接持久化原始内部参数；先生成 `publicArguments`。
- `write_file` 等含大段内容的工具只记录路径、字节数、内容哈希和简短预览，不记录完整待写内容。
- 通用公共参数序列化后默认不超过 16 KiB；超过时截断并记录 `truncated: true`。
- 工具输出遵循 64 KiB 上限，并在 metadata 中记录是否截断。
- 错误 details 只能包含排错必要的 JSON 数据，不包含请求头、密钥或完整环境变量。
- 对常见 Bearer Token、API Key 格式提供统一脱敏函数；具体实现进入后续 Task。

## 13. Schema 与模块边界

建议领域层按职责分为：

- 基础 JSON、ID、时间和错误 Schema。
- 模型、会话、消息和工具 Schema。
- 持久事件与实时事件的判别联合 Schema。
- 纯函数辅助项：终态判断、JSON 序列化安全检查、公共日志脱敏。

实现必须满足：

- 类型由 Schema 推导，不维护第二份手写接口。
- 所有导出均可在 Node Vitest 环境直接导入。
- 不导入 `next/*`、React、文件系统、子进程或网络模块。
- 公共解析入口返回明确的 Zod 成功/失败结果，不吞掉具体字段错误。

## 14. 可测试验收标准

### 14.1 正常结构

- 每类 Session、Message、ToolResult、DurableEvent 和 LiveEvent 示例均可通过 Schema。
- 通过 Schema 后的值可执行 JSON stringify/parse 并再次通过同一 Schema。
- 事件判别联合能够根据 `durable` 与 `type` 正确收窄类型。

### 14.2 非法结构

- UUID、ISO 时间、正整数 seq、协议版本错误时拒绝。
- `undefined`、NaN、Infinity、函数、Date、Map 等非 JSON 数据被拒绝。
- `ToolResult` 的 `ok/error` 组合不符合不变量时拒绝。
- durable 事件缺少 `seq`，live 事件缺少 `streamSeq` 时拒绝。
- unsupported event type、额外敏感字段或超过约束的字符串被拒绝。

### 14.3 安全与兼容

- ModelProfile 公共 Schema 拒绝 `apiKey` 字段。
- 脱敏函数覆盖 Bearer Token、常见 API Key 和环境变量式秘密。
- assistant delta 不属于可持久事件联合。
- 所有领域测试在 `node` 环境通过，无浏览器或 Next.js 运行时依赖。

## 15. 备选方案与取舍

### 15.1 所有事件使用一个宽泛 `data: Record<string, unknown>`

拒绝。它实现简单，但无法在 TypeScript 中穷尽处理事件，也无法逐类校验 JSONL。

### 15.2 持久化每个 assistant token delta

拒绝。会放大磁盘写入、日志体积和重放复杂度，且与最终消息重复。

### 15.3 公共对象直接使用 Date、Error 或类实例

拒绝。它们不适合 JSONL 和 Next.js Client Component 边界，也容易丢失字段或方法。

### 15.4 仅使用 TypeScript 类型，不做运行时校验

拒绝。模型输出、JSONL 和 HTTP 请求均属于不可信运行时数据，编译期类型无法保护这些边界。

## 16. 风险、假设与待确认决策

### 16.1 风险

- 事件类型过多可能增加初始实现量，但能显著降低后续模块之间的隐式约定。
- `publicArguments` 的工具特定脱敏只能在具体工具定义形成后完全实现；本阶段先定义通用协议。
- 协议版本 1 暂不提供迁移器；在公开发布前应尽量稳定事件字段。

### 16.2 假设

- 应用是可信本地单用户，工作区路径可以保存在本地 Session 元数据中。
- API、终端和 UI 都以同一事件联合为输入，不分别定义 DTO。
- 模型 reasoning 不属于用户可审计的必要事件，只记录可解释的工具决策和最终输出。

### 16.3 本次审批将确认的决策

批准本 Spec 即表示确认：

1. `assistant.delta` 是实时事件，不写入 JSONL；完整消息才持久化。
2. 事件采用 `protocolVersion: 1`，不兼容变更必须显式升级。
3. 领域 Schema 采用 Zod 并作为 TypeScript 类型来源。
4. 事件不记录模型私有推理、密钥和未经脱敏的大段工具参数。
5. 完整终端/API/UI 共享同一事件协议，不建立三套 DTO。

## 17. Spec 门禁

- [x] 已对照批准的阶段 01、02 和 00 流程文档。
- [x] 已完成只读代码、配置和测试环境观察。
- [x] 当前状态与差距有事实证据。
- [x] 范围、公共结构、事件类型和不变量明确。
- [x] 安全、序列化、版本和验收标准明确。
- [x] 未修改业务代码、依赖、配置或测试。
- [x] 未生成 Task 或 Summary 文档。

**Spec 内部门禁：通过。当前状态：待用户审批。**

用户批准前不得生成阶段 03 Task 文档或编写领域代码。

## 18. 用户审批记录

- 审批结果：阶段 03 Spec 已获用户批准。
- 已确认决策：实时 delta 不持久化、协议版本 1、Zod 为类型来源、默认最少披露、终端/API/UI 共用事件协议。
- 解锁动作：允许生成 `03-domain-protocol-tasks.md`。
- 仍然禁止：Task 获批前不得编写领域代码或测试。
