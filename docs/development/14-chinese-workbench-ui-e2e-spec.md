# 阶段 14 Spec（修订 2）：中文工作台、受限目录弹窗、海报视觉层与 UI E2E

## 0. 修订记录

- 2026-08-28 初稿：定义中文三栏工作台、客户端事件状态与产品级 E2E。
- 2026-08-28 修订 1：用户补充一份 Orbit 单文件海报提示词，要求前端 UI 参考其布局、字体、色彩、双百合图、入场动画、移动菜单和鼠标 morph-reveal。
- 2026-08-28 修订 2：用户批准将“手工输入绝对路径”替换为“从电脑预先指定区域中选择工作区”的内置目录弹窗方案。
- 补充输入文件：`pasted-text.txt`，SHA-256 `bf37677a4adcc1d57103649abb10de64fa3620278ed71a897d9c78ef852f0988`，共 266 行。
- 修订原则：把提示词作为视觉母版完整映射到 SEcode，但不允许它覆盖已批准的 Next.js 架构、中文产品语义、Agent 功能、安全边界和 E2E 要求。所有不可同时满足之处在第 11.1 节显式说明，不声称“像素级完全复刻”。

## 1. 文档状态与审批门禁

- 当前状态：已批准（修订 2）。
- 生成日期：2026-08-28。
- 前置阶段：阶段 13 Next.js Route Handlers Summary 已于 2026-08-28 获用户批准。
- 当前已完成：阶段 14 只读观察、视觉补充输入对照、目录选择可行性复核与本 Spec 修订 2。
- 当前允许：依据本 Spec 生成阶段 14 Task 文档。
- 当前禁止：修改 UI/客户端/服务端业务代码、测试或工程配置；Task 再次获批前仍不得开发。

## 2. 阶段目标

在不改变阶段 03–13 已批准的 Agent、事件、工具、安全、存储和 HTTP 公共语义的前提下，为 SEcode 建立中文优先的浏览器工作台。视觉上以用户补充的 Orbit 海报提示词为母版，将其固定视口、深色舞台、白/粉字标、双层百合、入场编排、移动端磨砂层和鼠标有机 morph-reveal 转译为 SEcode 品牌体验；功能上仍用确定性浏览器测试验证真实的本地 Agent 闭环。

本阶段完成后，用户应能在浏览器中：

1. 查看可用模型、最近工作区和历史会话。
2. 打开内置目录弹窗，在服务端预先指定的电脑区域中浏览并选择目录，验证后创建固定绑定工作区与模型的会话。
3. 提交自然语言任务，并实时观察模型状态、消息、工具请求、工具结果、错误和上下文压缩。
4. 对危险工具明确允许或拒绝，取消正在运行的任务。
5. 刷新页面后从 JSONL durable events 恢复历史。
6. 在桌面端完成清晰的两分钟演示，在窄屏上通过抽屉完成主要操作。

## 3. 覆盖需求与阶段边界

### 3.1 直接覆盖

| 需求 ID | 本阶段覆盖方式 |
| --- | --- |
| FR-001 | 受限目录弹窗选择、服务端绝对路径校验、模型选择、创建并切换会话 |
| FR-002 | 会话底部任务输入与 NDJSON run 提交 |
| FR-005 | 事件时间线、工具卡片、参数、结果、错误和运行状态 |
| FR-006 | 待审批面板与允许/拒绝动作 |
| FR-007 | 启动阶段中止与已获得 run ID 后的服务端取消 |
| FR-008 | 会话列表与 durable events 分页恢复 |
| FR-009 | 只允许选择 `/api/config` 返回且已配置的模型 |
| FR-010 | `context.compacted` 可见状态与摘要信息 |
| NFR-001 | Next.js 16.3.3 App Router，页面使用 Server/Client Component 边界 |
| NFR-002 | 客户端 TypeScript 严格模式，API 与 NDJSON 响应运行时校验 |
| NFR-003 | 网络、HTTP、流、协议与 Agent 错误均呈现结构化反馈 |
| NFR-007 | 中文工作台、桌面演示布局与基本响应式抽屉 |
| NFR-008 | Spec、Task、Summary 和验证证据完整回写 |
| SEC-006 | 客户端不接收 base URL、Key 环境变量名或凭据 |
| SEC-008 | 界面持续声明“可信本地单用户、非 OS 强沙箱”边界 |

### 3.2 回归覆盖但不重新实现

- FR-003、FR-004：UI 仅显示并驱动既有工具与 Agent 循环，不在 React 层复制执行逻辑。
- NFR-004、NFR-005：限制由 config 与既有 Agent 执行，UI 只展示，不自行改变。
- SEC-001–SEC-005、SEC-007：仍由工作区、工具和审批层强制执行；浏览器提示不能替代服务端检查。
- COM-001–COM-004：不引入 Agent 框架、托管执行或凭据；模型流仍由自研服务端实现。

## 4. 只读观察

### 4.1 观察范围

本次只读检查了：

- 已批准的 `00-process.md`、`01-requirements.md`、阶段 13 Spec/Task/Summary 与开发索引。
- `app/page.tsx`、`app/layout.tsx`、`app/globals.css` 和现有 API Route Handlers。
- `lib/server` 的公开 DTO、请求 Schema、错误映射和事件分页结果。
- `lib/domain/event.ts` 的完整 `AgentEvent` 判别联合。
- `package.json`、`tsconfig.json`、`next.config.ts`、PostCSS、Playwright 配置与现有 E2E。
- 本仓库安装的 Next.js 16.3.3 文档：Server/Client Components、CSS、字体、错误处理和 Playwright 指南。
- 浏览器 File System Access API 的当前能力：`showDirectoryPicker()` 返回浏览器 `FileSystemDirectoryHandle`，兼容性受限，不能作为本机 Node Agent 所需绝对路径的跨浏览器传输协议。
- Git 工作区状态。

### 4.2 观察方法

- 只使用文件读取、`rg` 文件/符号检索和 `git status --short`。
- 未启动开发服务器、未发起真实模型请求、未访问真实用户项目。
- 未执行会改写受版本控制文件的格式化、安装、构建或测试命令。
- 除批准记录、开发索引和本 Spec 外，未修改业务代码或配置。

### 4.3 当前事实证据

1. 当前根页面仍是 Create Next App 默认模板，包含 Next.js/Vercel 外链和 logo，不能完成任何 SEcode 操作。
2. 根布局仍使用英文 `lang="en"` 与默认 metadata；全局 CSS 只有模板明暗色和 Arial body。
3. 浏览器基础 E2E 只有一条“页面可访问、html 有 lang、body 可见”，尚未覆盖产品行为。
4. 工程已经安装 React 19.2.8、Tailwind CSS 4、`react-markdown`、`remark-gfm`、Zod、Vitest 和 Playwright，不需要为首版 UI 新增运行时依赖。
5. 阶段 13 已提供九个稳定 method contracts：config、recent workspaces、workspace validate、sessions list/create、events、runs、approval、cancel。
6. run 路由返回 `application/x-ndjson`，每行只含一个 `AgentEvent`；durable events 用 `seq`，实时 `assistant.delta` 用 `streamSeq`。
7. events 路由以 `after` 和 `limit` 正向分页，响应包含 `events`、`lastSeq`、`hasMore` 和 `recovery`。
8. public config 已脱敏，不含 base URL、Key 或 `apiKeyEnv`；模型条目具有 `configured` 状态。
9. JSONL 是唯一 durable 事实源；客户端不应维护另一套持久化任务真相。
10. Git 当前只包含阶段 13 审批记录与开发索引的文档变化，没有待保护的 UI 代码改动。
11. 当前服务端可以验证已知绝对路径，但没有在受限根目录内列举子目录的公共接口；因此仅修改 React 表单无法实现该弹窗。
12. 原生浏览器目录选择器需要用户激活并只返回目录 handle，且不是所有主流浏览器的 Baseline 能力；SEcode 采用服务端受限目录浏览器，而不是让浏览器读取/上传目录内容。[MDN：`showDirectoryPicker()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)

## 5. 当前差距

### 5.1 产品差距

- 没有会话导航、受限目录选择弹窗、模型选择、任务输入或运行控制。
- 没有 NDJSON 字节流解析、事件归并、增量回答或刷新恢复。
- 没有工具生命周期、审批、取消、错误和上下文压缩的可视化。
- 没有安全 Markdown、命令输出、文件替换前后差异展示。
- 没有中文文案、产品 metadata、可信本地边界说明或响应式交互。

### 5.2 质量差距

- 没有客户端 API 错误 envelope 校验。
- 没有跨任意 chunk 边界的浏览器 NDJSON 解析测试。
- 没有事件去重、assistant delta/final 合并、工具分组和待审批派生测试。
- 没有使用临时工作区和假模型的真实浏览器闭环。
- 没有 picker root 配置、目录枚举服务、相对段校验或 symlink 逃逸测试。
- 没有审批、取消和刷新恢复的 Playwright 验收。

## 6. 范围

### 6.1 范围内

- 单页中文工作台和必要的客户端纯模块。
- 单路由、固定视口的海报视觉舞台；页面本身无滚动，长会话仅在时间线面板内滚动。
- 使用用户指定的两个 Higgsfield 图片 URL 构成百合前景/揭示双层，不替换为其他图片。
- 用户指定常量的 Canvas 有机 morph-reveal、一次性 CSS 入场动画和 reduced-motion 降级。
- 星形品牌标记、白/粉 SECODE 字标、顶部功能导航、安全状态胶囊和中文角落文案。
- 由 `SECODE_WORKSPACE_PICKER_ROOT` 限定的服务端目录浏览能力，以及工作区选择模态弹窗。
- 一个新增的 Node-only workspace browse Route Handler；既有九个 method contracts 保持不变。
- Server Component 页面外壳与一个明确的 Client Component 工作台边界。
- 调用阶段 13 的全部公开 UI 所需 API。
- NDJSON 增量解析、事件 reducer、durable/live 去重与历史重建。
- 会话创建、选择、运行、审批、拒绝、取消和恢复。
- 安全 Markdown、折叠工具卡片、命令输出、简单文件替换差异。
- 桌面三栏布局、窄屏抽屉、键盘和基本无障碍状态。
- 客户端纯模块单元测试、API/UI 集成行为测试和产品级 Playwright E2E。
- 用本地假 OpenAI-compatible 模型和临时工作区执行确定性 E2E；绝不读取真实 API Key。

### 6.2 范围外

- 修改 Agent 循环、工具实现、风险规则、事件 Schema、JSONL 格式或九个 Route Handler 的公共语义。
- 删除既有 `/api/workspaces/validate` 或拒绝终端/API 客户端继续传入绝对路径；本次只替换 Web UI 的输入方式。
- 登录、多用户、远程部署、容器/虚拟机强沙箱。
- 原生系统目录选择器、拖拽目录或浏览器直接访问本机文件系统。
- 从配置根目录向上导航、浏览多个磁盘根、在弹窗中创建/重命名/删除目录或显示文件。
- Git commit/push、部署、MCP、语音、图片理解和多 Agent UI。
- token 级模型私有推理展示；UI 不显示或推断 reasoning。
- 会话重命名、删除、归档、分支管理、全文历史搜索和事件虚拟列表。
- 富文本编辑器、原始 HTML、Mermaid，以及模型生成 Markdown 中的远程图片自动加载；第 11 节两张受控产品图片是唯一例外。
- 交付一个脱离本仓库的原生单文件 `index.html`；SEcode 仍必须由 Next.js 16.3.3 构建。
- 原样保留 Orbit 品牌、英文 Home/Resources/Benefits/Contact、英文营销文案或与 Agent 无关的 `#home` 锚点。
- 在缺少原始 TTF 数据时伪造、反向生成或声称已经复刻 Orbit 字体。
- 让装饰动画遮挡、延迟或劫持任务输入、审批、停止和错误处理。
- LongCat 真实端点冒烟；该项已由用户明确跳过且仍记录为外部阻塞。
- 阶段 15 的 README.txt、演示视频和最终提交材料。

## 7. 页面架构与 Next.js 边界

### 7.1 组件边界

建议结构如下，具体文件清单在 Spec 批准后的 Task 中冻结：

```text
app/page.tsx                         Server Component 页面外壳
app/layout.tsx                       中文 metadata、lang 与字体变量
app/error.tsx                        意外渲染错误边界
app/globals.css                      设计 token、布局与基础可访问样式
app/api/workspaces/browse/route.ts   受限根目录浏览 Route Handler
app/ui/workbench/workbench.tsx       唯一主要 `use client` 入口
app/ui/workbench/*                   侧栏、时间线、检查器、输入区、抽屉
app/ui/visual-stage/*                海报舞台、品牌字标、百合与 morph trail
lib/client/api-client.ts             fetch、JSON envelope 与 abort 处理
lib/client/ndjson.ts                 增量字节流解析
lib/client/event-state.ts            纯事件归并和视图投影
lib/client/view-model.ts             标签、格式化和工具分组
lib/server/workspace-picker.ts       picker 配置、目录枚举与边界复用
```

- `app/page.tsx` 保持 Server Component，只渲染静态产品外壳和工作台入口。
- 浏览器状态、`fetch`、`ReadableStream`、`AbortController` 和交互位于 Client Component 图中。
- Canvas、pointer tracking、移动端 sheet 和入场结束监听位于独立的客户端视觉子树，不进入 Agent 事件 reducer。
- 不使用 Server Action：长运行和审批/取消继续走已批准的 Node Route Handlers。
- 目录弹窗同样通过 Node-only Route Handler 读取服务端文件系统，不使用 Server Action、File System Access API 或文件上传。
- 客户端模块不得运行时导入 `lib/server` 的 Node-only barrel；共享类型只能 `import type`，运行时事件验证使用浏览器安全的 Zod Schema。
- 不通过关闭 SSR、全页动态导入或 hydration suppression 回避组件边界问题。

### 7.2 页面加载

初次加载在客户端并行请求：

```text
GET /api/config
GET /api/workspaces/recent
GET /api/sessions
```

三项分别保留 loading/error/result，不因一个次要请求失败隐藏整个工作台。会话存在时默认选择返回列表中的最新会话，并从 `after=0` 开始分页加载 durable events，直到 `hasMore=false`。刷新后的历史、终态和 recovery 提示全部从这些事件重建，不从 `localStorage` 恢复任务事实。

会话很多或历史较长时显示渐进加载状态。首版不引入虚拟列表；事件条目使用稳定 key、折叠详情和 CSS `content-visibility` 控制常见长记录的渲染成本。

### 7.3 受限目录浏览接口

新增一个阶段 14 公共接口，不修改阶段 13 已有九个接口：

```text
POST /api/workspaces/browse
runtime = "nodejs"
Content-Type: application/json
```

请求使用 strict Schema，只接受相对目录段，不接受客户端绝对路径：

```ts
interface BrowseWorkspaceRequest {
  segments: string[];
}
```

约束：

- `segments` 最多 64 段；每段 1–255 个字符。
- 拒绝空段、`.`、`..`、`/`、`\\`、NUL、控制字符、drive/URL/tilde 语义。
- 组合后的 UTF-8 相对路径不得超过既有 4096-byte 工作区路径上限。
- route 使用既有有限 JSON reader、loopback/Origin guard、no-store/no-transform/nosniff headers，不用 `request.json()`。

成功响应：

```ts
interface BrowseWorkspaceResponse {
  root: {
    label: string;
    workspacePath: string;
  };
  current: {
    label: string;
    segments: string[];
    workspacePath: string;
  };
  parentSegments: string[] | null;
  directories: Array<{
    name: string;
    segments: string[];
    symbolicLink: boolean;
  }>;
  blockedEntries: number;
  ignoredEntries: number;
  truncated: boolean;
}
```

- `workspacePath` 只来自服务端 `realpath`，用于可见确认和随后调用既有 validate；客户端不得自行拼出绝对路径。
- 只列目录，不返回文件名、大小、内容、owner、mode 或其他文件系统 metadata。
- 名称按确定性字典序排序；单层最多返回 500 个目录，超出时 `truncated=true` 并在 UI 明示限制。
- 固定忽略 `.git`、`node_modules`、`.next`、`.secode-data`；其他 dot-directory 可见。
- 内部 symlink 只有在 `realpath` 后仍位于 picker root 内才可返回，并标记 `symbolicLink=true`；逃逸、断链、权限拒绝或类型变化不返回条目，只计入 `blockedEntries`。
- 请求的当前目录若逃逸、失效、变为文件或不可读，整次请求失败，不能静默回到根目录。

### 7.4 Picker root 配置与生命周期

```env
SECODE_WORKSPACE_PICKER_ROOT=/absolute/path/to/code-area
```

- 该变量不是秘密，但只在 Node 服务端读取；仓库只提供无用户路径的 `.env.example` 说明。
- 必须为非空绝对路径、存在且为目录；启动后通过 `realpath` 规范化并绑定 dev/inode identity。
- 文件系统根目录 `/`、Windows volume root 等过宽根继续拒绝；配置为 symlink 时绑定其 canonical target。
- 单进程生命周期内复用同一不可变 picker root handle；配置变化需要重启开发服务器，不在浏览器中动态修改。
- 未配置或配置失效时，现有历史会话和 Agent 功能仍可恢复，但“新建会话”弹窗显示明确的本地配置说明并禁止选择，不回退到任意绝对路径输入。

新增有限公共错误：

| code | HTTP | 含义 |
| --- | --- | --- |
| `API_WORKSPACE_PICKER_UNAVAILABLE` | 503 | picker root 未配置或启动后失效 |
| `API_WORKSPACE_PICKER_CONFIG_INVALID` | 503 | 配置不是合法、存在、非文件系统根的目录 |
| `API_WORKSPACE_PICKER_PATH_INVALID` | 400 | segments 结构、字符或长度非法 |
| `API_WORKSPACE_PICKER_PATH_FORBIDDEN` | 403 | 路径或 symlink 试图逃出配置根 |
| `API_WORKSPACE_PICKER_IO_ERROR` | 500 | 有限、已脱敏的目录读取错误 |

错误 envelope 仍为 `{ error: ErrorInfo }`，不得包含原始 Node error、stack、系统调用参数或配置之外的路径。

## 8. 客户端数据与状态模型

### 8.1 状态分类

客户端只维护三类状态：

1. **服务端事实**：config、session metadata、durable events、live events。
2. **传输状态**：bootstrap/loading、stream starting/reading、审批提交中、取消提交中、网络错误。
3. **纯展示状态**：当前选中会话、抽屉开关、展开的工具卡、输入草稿、滚动位置。

JSONL durable events 仍是历史事实源。传输状态不会写入 JSONL，页面刷新后可以重新计算；展示状态不冒充任务状态。

### 8.2 事件账本与去重

- durable event 以 `sessionId + seq + id` 校验和排序；重复分页或流事件只保留一份。
- live event 以 `runId + streamSeq + id` 去重，只存在当前页面内存中。
- 不接受 `seq` 倒退、同 seq 不同 id、错误 sessionId 或不符合 `AgentEventSchema` 的数据；转换为有限客户端协议错误。
- `assistant.delta` 按 `streamSeq` 拼接为运行中的临时回答；匹配的 durable `assistant.message` 到达后替代临时文本，避免重复显示。
- stream 关闭后重新读取该会话的 durable 增量，以协调 HTTP 尾部丢失、终态落盘和页面渲染之间的竞态。

### 8.3 运行投影

运行状态由事件和当前传输共同投影：

```text
尚未发起                    idle
POST 已发出、run.started 前 starting
run.started                 running
model.requested             requesting_model
approval.required 未解决    awaiting_approval
tool.started                executing_tool
run.completed               completed
run.failed                  failed
run.cancelled               cancelled
run.interrupted             interrupted
```

`model.completed`、工具结果和上下文压缩只更新运行详情，不伪造新的服务端状态。迭代数取最新 `model.requested/model.completed` 的 iteration；上下文压缩状态取最新 `context.compacted`。

### 8.4 工具生命周期分组

使用 `toolCallId` 将下列事件组成一个工具卡：

```text
tool.requested
  → approval.required? → approval.resolved?
  → tool.started?
  → tool.result
```

卡片摘要显示工具名、当前阶段、成功/失败、持续时间可计算时的耗时。默认折叠；展开后以纯文本/结构化列表显示 public arguments、result summary、output、metadata 和有限 error。未知或不完整生命周期仍需显示原始事实并标为“不完整”，不得丢弃。

## 9. API 客户端与错误模型

### 9.1 JSON 请求

统一客户端负责：

- `Accept`/`Content-Type`、same-origin URL、AbortSignal 和响应状态处理。
- 在非 2xx 时校验 `{ error: ErrorInfo }`；格式错误时生成客户端有限错误。
- 运行时校验关键响应，不把 `response.json()` 结果直接断言为 TypeScript 类型。
- 不记录 request headers、环境变量、完整内部异常或任何可能的凭据。

建议客户端错误码：

| 错误码 | 含义 | UI 行为 |
| --- | --- | --- |
| `UI_NETWORK_ERROR` | fetch 失败或服务不可达 | 保留当前事实并提供重试 |
| `UI_RESPONSE_INVALID` | JSON/Content-Type/Schema 不合法 | 显示协议错误，不猜测结果 |
| `UI_STREAM_INVALID` | NDJSON 行、UTF-8 或事件非法 | 停止本地消费，随后尝试历史协调 |
| `UI_STREAM_ENDED_EARLY` | 无 terminal event 即结束 | 重新拉取 durable events，并显示恢复提示 |
| `UI_OPERATION_ABORTED` | 用户或卸载主动中止 | 不显示为系统崩溃 |

服务端 `ErrorInfo` 的 `code`、`message` 和 `recoverable` 原样用于有限展示；不得向用户展示 JS stack/cause。

### 9.2 NDJSON 解析

- 使用 `TextDecoder` 的 streaming 模式处理跨字节 chunk 的 UTF-8。
- 用缓冲区按换行拆分，支持一行跨任意 chunk；空行忽略。
- 单行最多 8 MiB，与服务端常量一致；超限立即产生 `UI_STREAM_INVALID`。
- 每一非空行先 `JSON.parse`，再通过 `AgentEventSchema`。
- EOF 时仅允许空白尾部；非空但不完整的尾行视为协议错误。
- 解析器是无 React 依赖的 async iterable/回调纯模块，可用人工切分 chunk 的单元测试验证。

## 10. 主要用户流程

### 10.1 创建会话

1. 用户点击“选择工作区”，打开带 `aria-modal` 的内置目录弹窗；页面不显示绝对路径文本输入框。
2. 弹窗以 `segments=[]` 请求配置根，显示根标签、canonical path、面包屑和当前层子目录。
3. 点击目录只使用服务端返回的 `segments` 重新 browse；“返回上级”在根目录禁用，不能越过 root。
4. 用户点击“选择当前目录”，弹窗先关闭并把 `current.workspacePath` 作为只读候选显示在创建表单。
5. 客户端立即调用既有 `/api/workspaces/validate` 重新验证；只有返回的 canonical path 与当前候选一致时才标记为已验证。
6. 用户选择一个 `configured=true` 的模型；未配置模型显示原因但不可提交。
7. 可选输入会话标题；为空时由服务端现有规则生成。
8. 创建成功后把 Session 插入列表、选中该会话并展示 `session.created`。

重新打开 picker 并选择另一个目录会清除之前的验证结果；browse/validate 任何一步失败都不得沿用陈旧候选。最近工作区只作为历史信息显示，不能绕过 picker root 直接创建新会话。现有会话的工作区和模型不可修改，切换工作区仍然创建新会话。

弹窗交互要求：

- 标题“选择工作区”，显示当前位置、目录列表、loading/empty/truncated/blocked/error 状态。
- 双击目录与“进入”按钮语义一致；单击只选择行，不立即创建 Session。
- 提供“取消”和“选择当前目录”，后者必须显示将绑定的 canonical path。
- Escape 关闭、Tab focus trap、打开时背景 inert、关闭后焦点回到触发按钮。
- 不提供手工路径编辑、文件上传、显示隐藏文件切换或目录写操作。

### 10.2 提交任务与实时流

1. 非空 prompt 且选中会话时允许发送。
2. POST run 后立即进入 `starting`，输入框保留内容直至请求被接受；首个 `user.message` 后清空。
3. 每个 NDJSON event 立即进入账本并更新 UI。
4. terminal event 后关闭本地运行状态，执行 durable 增量协调，保留最终结果。
5. HTTP/协议失败时不伪造 `run.failed`；显示独立传输错误并拉取 durable 历史。

同一标签页同一时刻只允许一个本地 active stream。运行中禁用新会话创建和会话切换，明确提示先停止当前任务，避免隐藏仍有副作用的后台执行。

### 10.3 审批

- 未解决的 `approval.required` 同时出现在时间线和右侧检查器。
- 允许/拒绝均可填写可选原因；提交后按钮进入 pending，直至收到 `approval.resolved` 或请求失败。
- 拒绝不是 UI 错误；按事件事实显示工具未执行或后续模型处理。
- 多次点击必须被前端禁用，服务端 404/409 仍按真实错误展示。

### 10.4 取消

- `run.started` 前点击停止：中止本地 POST signal。
- 已知 runId 后点击停止：先 DELETE `/api/runs/[id]`，继续消费流直到 `run.cancelled` 或协调超时，不立即丢弃终态。
- 取消按钮提交期间防止重复；`already_requested` 显示“已请求停止”。
- 页面卸载/请求断开由既有服务端连接取消语义处理；再次打开时由 events recovery 呈现 `run.interrupted` 或已有 terminal event。

### 10.5 继续上次任务

“继续上次任务”只在最新运行是 failed/cancelled/interrupted 时出现。点击后仅把一段清晰可编辑的中文继续提示填入输入框，不自动启动新 run，避免用户无确认地产生本地副作用。

## 11. 信息架构与海报视觉规格

### 11.1 补充提示词的兼容性裁决

补充提示词是为 Orbit 静态海报编写的，而 SEcode 是 Next.js 中文功能应用。以下裁决在开发前必须明确：

| 提示词要求 | SEcode 视觉裁决 | 原因 |
| --- | --- | --- |
| 单文件 `index.html`、无框架 | 不采用；保持 Next.js App Router 多模块实现 | NFR-001 与既有阶段明确要求 Next.js，单文件会绕过产品架构 |
| full viewport、body 无滚动 | 采用；页面固定视口，只有会话列表、时间线和详情区内部滚动 | 保留海报构图，同时支持长 Agent 历史 |
| Orbit 品牌和英文营销导航 | 转译为 SECODE、工作区/会话/运行/安全 | 中文优先与 Agent 功能不可被静态营销内容替换 |
| 白色 OR + 粉色 BIT | 转译为白色 `SE` + 粉色渐变 `CODE` | 保留双色巨型字标语言但使用真实产品品牌 |
| Orbit Sans / Display base64 TTF | 原始字体数据缺失；见第 11.6 节 | 附件只有提示文字，没有原 `index.html` 或 TTF/base64 |
| 两张指定百合图 | 采用原始两个代理 URL，不替换 | 用户明确指定，作为受控产品视觉资产 |
| 精确 morph trail 常量与算法 | 在 fine-pointer 且允许动画的视觉舞台采用 | 不影响 Agent 状态和键盘操作；移动/减弱动画需安全降级 |
| 精确入场编排 | 采用相同顺序、时长、延迟与 easing；品牌文字映射到 SECODE | 一次性装饰动画不改变功能语义 |
| burger、scrim、frosted sheet | 采用交互与视觉，内容映射到会话/检查器 | 满足移动端产品操作，不保留无功能锚点 |
| “No redesign / exactly” | 仅对已映射的视觉层精确执行；不对整套产品声称像素级复刻 | 原提示和已批准产品需求存在不可消除的结构冲突 |

因此本阶段验收术语为“按映射精确实现”，不是“原样交付 Orbit 海报”。如果用户要求原样 Orbit 单文件，应另建独立项目，不能作为 SEcode 阶段 14 的替代品。

### 11.2 文档壳与分层

- 根 `<html>` 初始带用于首轮入场的 `anim` class；客户端在最后一个 `orb-*` animation 结束后移除，并设 6000ms 安全收口。该 class 只在首次 hydration 后使用，不因 React rerender 或会话切换重放。
- `html, body`：宽高 100%、margin 0、overflow hidden、背景 `#161616`。
- 主壳使用固定 `main.viewport` 与绝对 `section.stage`；stage 使用 `contain: strict`、`isolation: isolate`。
- 基础变量固定为：`--ink:#fff`、`--surface:#161616`、`--orb-reveal:cubic-bezier(.16,1,.3,1)`、`--orb-soft:cubic-bezier(.25,.8,.28,1)`。
- 视觉层 z-order：字标 1、百合 2、角落文案 3、品牌/功能导航/安全胶囊 4；实际工作台面板 5–8；移动 scrim 9、sheet 10、burger 12。
- 工作台面板使用深色半透明/磨砂表面，让百合与字标作为环境层可见，但文字对比和操作命中区必须优先。

### 11.3 空态海报与工作台模式

首次没有会话时显示完整海报构图：

- 左上白色四轴星形 SVG，几何沿用补充提示词的 66×62 viewBox、四条 5px 方帽线。
- 顶部功能导航为“工作区 / 会话 / 运行 / 安全”，分别聚焦创建区、历史区、Composer 和安全说明；不是页面锚点滚动。
- 右上白色胶囊文字为“本地安全系统”。
- 巨型字标为 `SECODE`：`SE` 纯白，`CODE` 使用 `linear-gradient(180deg,#ffc5dc 0%,#fd86db 100%)`。
- 左下文案为“每一次代码流转，\n都被智能连接。”；右下为“更少手动操作。\n更多有效产出。”。
- 创建会话表单作为可访问的前景玻璃面板进入主视觉，不能只保留海报而让用户找不到入口。

选中会话后进入工作台模式：

```text
┌────────────── 272px ┬──────────── minmax(0, 1fr) ┬──── 320px ────┐
│ 会话与工作区        │ 事件时间线                  │ 运行检查器       │
│ 模型状态            │ 用户/助手/工具/错误          │ 状态/迭代/审批    │
│ 历史列表            │ sticky 底部任务输入          │ 上下文/安全边界    │
└─────────────────────┴─────────────────────────────┴───────────────┘
```

- 百合、星形与巨型字标保留为低干扰环境背景；三栏是实际交互层。
- 中栏内部滚动，Composer 固定在中栏底部；页面 body 始终无滚动。
- 长输出默认折叠，代码与命令使用等宽字体。
- 面板不会因视觉动画缩放或移动，避免输入焦点和点击目标漂移。

### 11.4 双层百合

只允许以下两个图片 URL：

```text
FRONT
https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260808_192942_e1086505-d7da-433b-a59b-8220f4e6c808.png&w=1280&q=85

REVEAL
https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260808_151324_bf318a5f-5525-4fc7-aab5-e9a341018828.png&w=1280&q=85
```

- FRONT 可访问文本为 `Pixel-art pink and violet lily`；REVEAL 与布局 sizer 为装饰，使用空 alt/aria-hidden。
- 桌面基准位置沿用提示：`top:14.749065dvh`、`left:49.121328vw`、`height:106.109034dvh`、`translateX(-50%)`。
- 前后层共享完全相同的几何盒，REVEAL 初始完全 mask out；文字透过透明花瓣保持可见。
- 为满足 Next.js 资源规则，实施时优先使用 `next/image` 的 unoptimized/自定义 loader 保持最终图片 URL 不被替换；如精确 intrinsic sizer 无法由 `next/image` 表达，必须在 Task 中记录最小、可审计的例外，而不是静默关闭 lint。
- 产品运行依赖网络加载这两张装饰图；加载失败时功能面板、文字与审批必须仍可用，并显示纯色背景，不出现无限 loading。

### 11.5 鼠标 morph-reveal

fine pointer 桌面环境严格使用以下常量：

```text
TRAIL_MAX_POINTS  = 60
TRAIL_HEAD_R      = 140
TRAIL_NOISE_AMP   = 44
TRAIL_BLOB_PTS    = 24
TRAIL_FADE_SPEED  = 0.92
TRAIL_SAMPLE_DIST = 8
```

- 每个 MorphTrailLayer 使用与 flower 尺寸一致的隐藏 canvas 和一个可见图片层。
- 同一 trail 生成 FRONT 的 `destination-out` 洞和 REVEAL 的白色 mask；每个 active frame 将 canvas data URL 更新为 mask。
- pointer 坐标通过 flower bounding rect 转为 canvas 空间；stage 上的移动事件即使来自工作台子元素也可更新装饰效果，但 layer 本身 `pointer-events:none`。
- head radius 按提示规定的 hover `0.14`/leave `0.04` 插值，超过 8px 采样，最多 60 点；每帧 alpha 乘 `0.92`、r 乘 `0.995`，alpha 小于 `0.01` 删除。
- 每个 blob 使用 24 个点和提示词给定的 3/5/2 次正弦噪声公式，通过 midpoint + `quadraticCurveTo` 闭合，不能退化为 CSS 圆形 spotlight。
- `requestAnimationFrame` 在无 active points、页面 hidden、coarse pointer 或 reduced-motion 时停止；组件卸载时移除 listener 并取消帧，不能形成后台循环。
- 该效果只改变装饰 mask，不可读写 Agent 事件、工作区或用户输入。

### 11.6 字体策略与缺失输入

用户提示要求 Orbit Sans 与 Orbit Display 的原始 base64 TTF，但当前附件目录只有文本提示，没有原 `index.html`、TTF 或 base64 数据。因此不能满足“精确字体文件”且不能凭空伪造。

默认处理规则：

- 若用户在 Task 审批前补充原始 `index.html` 或两份有授权的 TTF，则使用 `next/font/local` 纳入 Next.js 构建，并分别映射导航/胶囊/角落文案和巨型字标；不把巨型 base64 直接散落在 React 组件中。
- 若用户直接批准修订 2 且未补充字体，视为明确接受兼容回退：正文/导航使用现有 Geist Sans 加 Arial/Helvetica，巨型字标使用 Georgia/Times New Roman，代码使用 Geist Mono。
- 两种路径都不引入 Inter、Roboto、system-ui 或 Playfair，也不从未知第三方站点下载字体。
- Summary 必须如实写明最终采用哪条路径，未获得字体时不得使用“exact font”表述。

### 11.7 入场动画

- `orb-word`：字标 inner 从 `translateY(118%)` 到 0，不淡入；mask 通过 padding/negative margin 防止衬线裁切。
- `orb-subject`：百合淡入并从 `translateX(-50%) translateY(3.4dvh)` 到基准位置，不缩放。
- `orb-corner`/`orb-quiet`：小幅上升加淡入；`orb-dim` 只淡入。
- 桌面时序沿用补充提示：brand 620/100ms；4 个导航 550ms、180/225/270/315ms；pill 620/340ms；word 1150/300ms；flower 1150/660ms；两个角落共同 720/980ms。
- word/flower 使用 `--orb-reveal`，其余使用 `--orb-soft`。光学 scaleX 放在不可动画的父层，动画只作用于 inner。
- `prefers-reduced-motion: reduce` 时取消分件 choreography，只做整个舞台 280ms 淡入；Canvas trail 完全禁用。
- 动画只运行一次，结束后删除 `.anim`，不会因 Fast Refresh 之外的产品状态变化重播。

### 11.8 响应式与移动 chrome

- ≥1180px 且横向：完整三栏与完整海报比例。
- 901–1179px 或 portrait：字标居中；保留会话栏与主区，检查器进入右侧 sheet。
- `(max-width:900px)` 或 `(max-aspect-ratio:4/5)`：显示白色圆形 burger、scrim 和磨砂 sheet；桌面导航/胶囊隐藏。
- `<768px`：主区优先，会话与检查器通过 sheet 切换，Composer 始终可操作。
- `max-aspect-ratio:4/5`：百合 `height:min(55dvh,110vw)`，字标 `min(27.5vw,18dvh)`，角落文案允许换行。
- sheet 支持 Escape、Tab focus trap、打开时背景 inert/scroll lock、关闭后焦点回 burger；burger 层级 12、scrim 9、sheet 10。
- coarse pointer/mobile 不运行鼠标 trail，避免耗电和不存在的 hover 语义。

## 12. 时间线与内容渲染

### 12.1 事件表现

| 事件 | 主要呈现 |
| --- | --- |
| `session.created` | 会话起点、工作区和模型标签 |
| `user.message` | 用户消息气泡 |
| `model.requested/completed` | 紧凑状态行、轮次和公开 usage |
| `assistant.delta` | 临时流式 Markdown 文本 |
| `assistant.message` | intermediate/final 助手消息 |
| `tool.*` | 按 toolCallId 合并的折叠工具卡 |
| `approval.*` | 琥珀色审批状态与决定 |
| `context.compacted` | 压缩到的序号、保留范围和折叠摘要 |
| `run.completed` | 轮次、耗时和成功终态 |
| `run.failed` | 有限错误码、消息和 recoverable |
| `run.cancelled/interrupted` | 原因、轮次或稳定序号 |

### 12.2 Markdown 安全

- 使用已安装的 `react-markdown` 与 `remark-gfm`。
- 不安装/启用 `rehype-raw`，不使用 `dangerouslySetInnerHTML`。
- raw HTML 作为文本而非 DOM 执行。
- 链接只允许安全协议；外链使用 `target="_blank"` 与 `rel="noopener noreferrer"`。
- Markdown 图片不自动发起远程请求，只显示 alt 与可检查的安全链接，降低跟踪和意外网络访问。
- code fence、表格、列表和引用使用受控组件；所有工具 output/arguments 使用 React 文本节点。

### 12.3 文件与命令细节

- `replace_in_file` 若 public arguments 同时含旧/新文本，显示小型前后对照；不伪造仓库完整 diff。
- `write_file` 只显示已公开的路径、字节/哈希等 metadata，不额外读取文件。
- `run_process` 显示 program、argv、cwd、exitCode、signal、timedOut、truncated 和 stdout/stderr 文本。
- 64 KiB 服务端截断标记必须明显；浏览器不尝试绕过工具输出上限。

## 13. 可访问性与交互约束

- 根文档使用 `lang="zh-CN"`，metadata 为 SEcode 产品描述。
- 页面提供 header/nav/main/aside/form 等语义 landmarks 和唯一可辨名称。
- 每个输入均有可见 label；错误通过 `aria-describedby` 关联。
- 状态更新使用节制的 `aria-live="polite"`；危险审批不自动抢焦点。
- 所有按钮有文字或 accessible name，并有键盘 focus-visible 状态。
- 工具详情优先使用原生 `details/summary` 或等价的键盘可操作 disclosure。
- 颜色不是成功、失败、审批的唯一信息；同时显示文字与图标。
- 自动滚动只在用户接近时间线底部时发生；用户向上阅读时显示“有新事件”按钮。
- 发送快捷键为 `Cmd/Ctrl+Enter`，普通 Enter 保留换行；停止必须使用显式按钮，避免误触。
- 海报巨型字标使用语义 `h1` 和 `aria-label="SEcode"`；分色/光学拆字不能让读屏重复朗读。
- 百合 reveal、canvas、mask 和 sizer 均从可访问树隐藏；只有 FRONT 暴露一次描述。
- 动画前的内容不能因 `opacity:0` 长期不可达；JS 失败时 6000ms CSS/JS 安全收口保证可见。

## 14. 安全与隐私约束

1. 客户端不得运行时导入 Node-only 模块、工具执行器、存储或模型配置实现。
2. 不向 UI 增加读取任意路径、任意 fetch URL 或执行命令的旁路。
3. 所有 mutation 仍发送到 same-origin Route Handler，服务端 Origin/loopback 校验继续生效。
4. 不在浏览器存储 AgentEvent、API response、workspace 内容、模型配置或审批理由。
5. 不输出 base URL、API Key、Key 后缀、环境变量名、Authorization、Cookie、stack 或 reasoning。
6. 页面持续展示：“仅适用于可信本地单用户；危险命令需要审批；不提供操作系统级沙箱。”
7. 审批卡必须完整显示服务端 `toolSummary` 和 reason；UI 不缩写成模糊的“确认”。
8. 客户端校验提升错误可解释性，但不能被描述为安全边界；服务端仍是最终强制层。
9. 用户指定的两个 Higgsfield URL 是产品 chrome 的唯一远程图片白名单；它们不能被模型消息、事件参数或 URL query 替换。
10. Canvas 只绘制本地计算的白色 mask，不把跨源图片像素绘入 canvas，不读取或导出图片数据。
11. Markdown 远程图片策略不因产品百合例外而放宽；模型内容仍降级为文本/安全链接。
12. Browse API 的所有路径都从服务端 picker root handle 与已验证 `segments` 解析；不能将 client path 直接传给 `fs.readdir` 或字符串前缀判断。
13. 目录枚举前后都复核 root identity；每个 symlink 子目录通过 `realpath` 和边界 containment，不能借 TOCTOU、`..`、绝对段或 symlink 浏览配置区域之外。
14. Browse API 不返回文件、内容、权限、owner 或 root 之外的错误路径；日志也不记录未脱敏的失败路径。
15. Picker root 未配置时绝不自动扩大到 cwd parent、用户 HOME、文件系统根或最近工作区；必须由本地操作者显式配置。

## 15. 测试设计

### 15.1 客户端单元测试

使用现有 Vitest，不新增组件测试框架：

- NDJSON 在每个字节边界切分时保持 UTF-8、行与事件正确。
- 空行、CRLF、8 MiB 边界、超限行、非法 JSON、非法 Schema、不完整尾行。
- durable/live 去重、乱序拒绝、session mismatch、delta 拼接与 final 替换。
- 工具生命周期分组、审批 pending/resolved、终态和上下文压缩投影。
- JSON success/error envelope、非 JSON、错误 Content-Type、AbortError 和网络错误。
- Markdown URL 与远程图片策略的纯函数边界。
- morph trail 的采样阈值、60 点上限、衰减清理、24 点 path 生成和坐标换算。
- reduced-motion/coarse pointer/hidden document 下不创建持续动画帧，卸载后 listener 与 RAF 全部释放。
- 入场结束只移除一次 `.anim`，6000ms safety 不会重放动画。

### 15.2 Picker 服务与 Route Handler 测试

使用独立临时目录和注入式文件系统边界验证：

- 环境变量缺失、相对值、文件、文件系统根、失效 root 和 canonical symlink root。
- 空 segments、合法 Unicode 名称、64/255/4096 边界，以及 `.`, `..`, slash, backslash, drive, URL, tilde、NUL 和控制字符。
- 只返回目录；固定忽略项、dot-directory、确定性排序、500 条截断和 blocked/ignored 计数。
- 内部 symlink 可浏览并标记，外部 symlink、断链、权限拒绝和枚举期间 identity 变化不可越界。
- POST 的 loopback、Origin、Content-Type、8 MiB body、strict JSON、no-store 与有限 error envelope。
- 响应和日志不含文件内容、root 外绝对路径、Node stack/cause、Key 或未分类系统错误。
- browse 选中路径经过既有 validate 后可创建 Session；browse 到 validate 之间目录变化时创建必须失败。

### 15.3 浏览器测试环境

完整产品 E2E 不使用真实 DeepSeek/LongCat，也不触碰真实用户项目：

```text
Playwright Chromium
  → 真实 Next.js dev server / Route Handlers
  → 真实 Agent、JSONL、workspace、tools
  → 本地脚本化 OpenAI-compatible 假模型
  → test-results 下登记的临时 data/workspace root
```

- Playwright web server 注入专用 generic 假模型 profile 与独立 `SECODE_DATA_DIR`。
- Playwright 同时把 `SECODE_WORKSPACE_PICKER_ROOT` 指向该测试登记根；UI 不接触其外部目录。
- 测试进程启动只监听 loopback 的脚本化模型服务器；每个场景显式重置 completion 队列。
- fixture 只在测试登记的临时根内创建，结束后仅删除该精确根。
- 假模型只决定工具调用；实际文件修改、测试命令、审批和取消必须走 production Agent/tool/API。
- 不读取任何真实 provider 环境变量，不在 trace/screenshot/report 写入秘密。
- `reuseExistingServer` 不能让一个带真实开发环境的旧 server 污染产品 E2E；Task 中需冻结确定性启动策略。
- 自动 E2E 不依赖 Higgsfield 网络可用性：浏览器请求仍必须是两个精确 URL，但测试路由用登记的透明 fixture 响应，另用 URL 断言证明没有第三张图片。

### 15.4 Playwright 验收场景

至少覆盖：

1. 中文文档、三栏桌面结构、模型配置与可信本地安全提示。
2. 点击“选择工作区”，在临时 picker root 内通过面包屑进入 fixture、选择当前目录并创建会话；页面不存在绝对路径编辑框。
3. 提交 slug 修复任务，实时看到 read/replace/process 工具卡、最终回答和真实测试通过。
4. 假模型请求需审批的 `pnpm run slow`，UI 显示原因；分别验证允许与拒绝。
5. 启动慢进程后点击停止，最终显示 `run.cancelled` 且无残留子进程。
6. 刷新页面，重新加载会话和 durable 历史，live delta 不重复成第二条消息。
7. 失败运行显示错误码与可恢复性；点击继续只填入草稿，不自动执行。
8. 手机 viewport 打开/关闭会话和检查器抽屉，键盘可达。
9. 恶意 Markdown/raw HTML 不执行脚本、不生成自动远程图片请求。
10. 空态无 body scroll，SECODE 白/粉字标、星形、胶囊、两个精确百合 URL 和图层顺序存在。
11. fine-pointer 下移动鼠标会产生非圆形双层 mask trail；leave 后 trail 清空，切换到 reduced-motion 后不运行。
12. 入场 class 只移除一次；移动 viewport 使用 burger/scrim/sheet，Escape 与 Tab focus trap 生效。
13. picker 根目录无法向上导航，外部 symlink 不可见/不可进入，文件和固定忽略目录不出现在列表。
14. picker 未配置、目录为空、读取失败、truncated 和快速切换目录的陈旧响应均有确定 UI，旧选择不会被误提交。

### 15.5 阶段整体验证

开发完成后按 Task 冻结的顺序串行运行，最低门禁为：

```text
pnpm exec vitest run <阶段14客户端与picker测试路径>
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
git diff --check
```

覆盖率阈值不得降低；测试失败不得通过跳过、弱化断言或改用 mock 工具执行来制造通过。

## 16. 可测试验收标准

### AC14-01 启动与配置

- `/` 为 `zh-CN` 中文 SEcode 工作台，不再出现默认模板内容。
- body 固定视口且无页面滚动；无会话时显示可操作的 SEcode 海报空态，而不是静态 Orbit 页面。
- config/recent/sessions 可独立 loading/error/retry。
- 未配置模型不可创建会话，且错误不泄漏环境变量或 endpoint。
- picker root 未配置时历史仍可用，新建会话显示 `SECODE_WORKSPACE_PICKER_ROOT` 配置指引且不出现手工路径回退。

### AC14-02 会话与工作区

- Web UI 通过受限目录弹窗选择工作区，不提供可编辑的绝对路径输入框。
- 只有 browse 返回的当前目录再次通过 validate，且 canonical path 一致后才能创建。
- 根目录不能向上；文件、固定忽略目录和逃逸 symlink 不可选择；blocked/truncated 状态可见。
- 会话创建后固定显示 canonical workspace 和 model。
- 刷新后自动恢复会话列表、选中最新会话并还原完整 durable 历史。

### AC14-03 事件流

- 任意网络 chunk 边界下每个合法事件恰好处理一次。
- assistant delta 实时出现，final durable message 不重复。
- stream 异常后执行 durable 协调并给出可解释状态。

### AC14-04 工具可观察性

- 六种工具均有一致卡片结构，参数、结果、错误和截断事实可查看。
- replace 提供有限前后对照；process 提供 argv、exit 与输出事实。
- 工具生命周期不完整时仍保留原始事件。

### AC14-05 审批与取消

- 危险操作执行前必须出现待审批 UI；允许/拒绝均只提交一次。
- 已知 runId 的停止调用 DELETE，并最终显示 durable cancel/terminal 事实。
- 慢进程取消后无后台子进程或临时目录残留。

### AC14-06 安全内容

- raw HTML/脚本不执行，危险协议链接不可点击，远程 Markdown 图片不自动加载。
- 浏览器 DOM、控制台、trace、截图和构建产物不含 Key、Authorization 或 reasoning。
- 界面明确声明可信本地应用级边界。

### AC14-07 响应式与可访问性

- 1440×900 下三栏无横向溢出，任务输入和运行状态在首屏可操作。
- 手机 viewport 下通过抽屉完成会话选择与审批。
- 核心流程可用键盘操作，焦点、label、aria-live 和 reduced motion 满足本文约束。
- ≤900px 或窄纵横比下使用白色 burger、scrim 与磨砂 sheet；Escape、focus trap 和焦点归还通过浏览器测试。

### AC14-08 工程质量

- 不新增 Agent 框架，不修改阶段 13 九个公共 API/事件语义；只新增本 Spec 批准的 browse endpoint，且不新增非必要依赖。
- lint、typecheck、全量 unit/integration、build 和 Playwright 全部通过。
- Stage14 Summary 如实记录全部首次失败、修正、偏差和验证证据。

### AC14-09 海报视觉层

- 根舞台使用 `#161616`、四轴白色星形、白/粉 `SECODE` 字标、中文角落文案和“本地安全系统”胶囊。
- FRONT/REVEAL 的网络请求 URL 与第 11.4 节逐字一致，DOM 中没有第三张产品图片。
- 桌面 fine pointer 的 trail 使用 140px head、44 noise、24 blob points、0.92 fade、8px sampling 和 60 点上限；效果同时挖空 FRONT 并显示 REVEAL，不能用圆形 CSS spotlight 代替。
- 入场顺序、duration、delay 和 easing 符合第 11.7 节，两个角落在同一 980ms delay 入场；完成后 `.anim` 被永久移除。
- reduced-motion 只有 280ms 全舞台淡入且无 trail；图片加载失败不影响创建会话、运行、审批或取消。
- 若用户未提供原字体，验收按第 11.6 节批准的 fallback 执行并在 Summary 标明，不以 fallback 冒充 Orbit 字体。

### AC14-10 Picker API 安全

- API 只接受相对 segments，绝对路径、父目录、分隔符、控制字符和超限输入得到固定 400/403 error envelope。
- 配置根经 realpath 与 identity 绑定，文件系统根被拒；目录替换或 root identity 变化后不继续枚举。
- 枚举结果只有 root/current 和子目录所需字段，不包含文件、内容、权限、owner 或 root 外路径。
- 外部 symlink、断链、权限拒绝和 TOCTOU 变化不能越过 picker root；对应单元/集成测试在临时根内通过。
- Route Handler 显式 Node runtime、非缓存、loopback/Origin/body guard 与阶段 13 HTTP 纪律保持一致。

## 17. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| live event 与随后分页的 durable event 重复 | 重复消息/工具卡 | durable/live 分账、id/seq 去重、final 替代 delta |
| fetch 断开时服务器取消与 UI 协调竞态 | 假失败或丢终态 | DELETE 后继续读流，结束后再拉 durable 增量 |
| 页面刷新遇到 open run | 状态悬空 | 依赖 events API 既有 interrupted 恢复，不伪造 active |
| 长输出/长历史阻塞浏览器 | 演示卡顿 | 默认折叠、有限输出、稳定 key、content-visibility；虚拟化留后续 |
| 客户端误导为强沙箱 | 安全预期错误 | 固定安全边界文案，审批展示完整原因 |
| Markdown 触发 XSS/外部跟踪 | 本机信息泄漏 | 禁 raw HTML、协议白名单、远程图片降级为链接 |
| Playwright 误用真实环境 | 改动真实项目/调用付费模型 | 独立 data root、登记临时 workspace、loopback 假模型、禁真实 Key |
| Next dev 复用旧 server | E2E 配置不确定 | 产品 E2E 使用可验证的专用启动环境，不静默复用 |
| Client bundle 引入 Node 代码 | 构建失败或泄漏配置 | runtime import 边界测试与 build 产物扫描 |
| UI 开发范围过大 | 截止期风险 | 不做会话删除/搜索/虚拟化/富编辑器，复用已有依赖 |
| 静态海报要求与功能工作台冲突 | 关键操作被视觉遮挡或无法滚动 | 海报作为环境层，功能面板独立分层并只内部滚动 |
| 每帧 canvas data URL 成本高 | 桌面卡顿、耗电 | 仅 active trail RAF、无点即停、hidden/coarse/reduced-motion 禁用、性能 E2E/人工检查 |
| 远程 Higgsfield 图片不可用 | 装饰缺失或 E2E 不稳定 | 功能降级、自动测试 route fixture、URL 精确断言 |
| Orbit TTF 未提供 | 无法精确复刻字体 | Task 前提供合法字体；否则按明确批准的 fallback，禁止虚假宣称 |
| Next Image 与精确原 URL/层尺寸冲突 | 视觉偏差或 lint 例外 | 优先 unoptimized/custom loader；任何例外先在 Task 冻结并审计 |
| Picker root 配置过宽 | 暴露无关目录名称 | 拒绝文件系统根，不做自动扩大，要求本地操作者显式指定代码区域 |
| 相对段或 symlink 逃逸 | 枚举指定区域之外 | strict segments、真实路径 containment、identity 复核和外部 symlink 测试 |
| Browse 与 validate 之间目录变化 | 绑定错误或失效项目 | 选中后重新 validate，Session 创建继续执行既有 realpath/identity 检查 |
| 大目录或权限异常 | 弹窗卡顿/泄漏系统错误 | 单层 500 上限、只列目录、有限 error、blocked/truncated 明示 |
| 浏览器原生 picker 与服务端路径语义不一致 | Agent 无法使用选择结果 | 不使用 `showDirectoryPicker()`，统一走 Node-only browse Route Handler |

## 18. 固定假设与待确认项

本 Spec 提议固定以下决定：

1. 工作台采用用户补充提示词转译后的 `#161616` 固定视口海报舞台和深色三栏功能层，中文优先。
2. 首版不增加 UI 组件库、状态库或图标库；使用 React、Tailwind/CSS 与小型内联 SVG。
3. 页面刷新默认选择最新会话，不把事件历史写入浏览器存储。
4. 同一标签页只维护一个 active stream，运行中禁止切换会话或创建会话。
5. “继续上次任务”只填入可编辑草稿，不自动运行。
6. 模型生成的 Markdown 不渲染 raw HTML，且其中的远程图片不自动加载。
7. E2E 使用 generic 假模型和临时工作区；真实 DeepSeek/LongCat 不作为自动 UI 测试依赖。
8. LongCat 真实端点继续按用户指示跳过，不影响阶段 14 自动化验收，但必须留在最终限制中。
9. 阶段 13 的九个 method contracts 与 `AgentEvent` Schema 不变；若开发发现必须更改，应停止并回到本 Spec 重新审批。
10. Orbit 品牌被映射为 SECODE，英文营销导航/文案被映射为中文 Agent 功能；批准本 Spec 即批准该兼容性裁决，而不是要求另交一个静态 Orbit 页面。
11. 两个 Higgsfield URL 按用户输入精确使用，允许它们作为产品 chrome 主动加载；模型 Markdown 图片仍不自动加载。
12. 若用户在 Task 审批前没有提供原始 Orbit TTF/base64，则批准本 Spec 视为批准第 11.6 节的 Geist/Georgia/Times fallback。
13. Canvas morph 常量和入场 timing 按提示词固定；但 reduced-motion、coarse pointer、页面 hidden 与功能可用性降级优先于动画“完全一致”。
14. Web UI 不再提供绝对路径输入；新 Session 只能从 `SECODE_WORKSPACE_PICKER_ROOT` 内的目录弹窗创建。
15. 既有 validate 与 session create 接口继续接受绝对路径，供终端、测试和服务端复核使用；本阶段只新增 browse，不破坏旧客户端。
16. Picker root 必须由本地操作者显式配置，不默认使用 HOME、cwd parent、文件系统根或最近工作区。
17. 最近工作区和历史 Session 可以显示，但不能作为新建会话时绕过 picker root 的快捷入口。
18. 首版只有一个 picker root；多根、收藏夹、目录创建和操作系统原生选择器不在本阶段。

目录弹窗方案已获得用户原则批准并用于生成本修订；现在待用户确认完整修订 2，包括 browse 公共接口、单根配置、弹窗交互、安全策略、视觉映射、字体缺失默认方案与 E2E 隔离方案。若用户需要真正的 Orbit Sans/Display，请在批准 Task 前补充原始 `index.html` 或两份合法 TTF；否则按 fallback 进入后续任务拆分。完整 Spec 批准后下一步仅生成详细 Task 文档，仍不会直接开发。

## 19. Spec 内部门禁

- [x] 前置 Summary 已获用户批准。
- [x] 已执行只读观察并记录方法与证据。
- [x] 需求 ID、范围内外和当前差距明确。
- [x] 组件边界、数据流、状态投影和错误模型明确。
- [x] 审批、取消、刷新恢复与安全 Markdown 行为明确。
- [x] 响应式、可访问性、测试环境与验收标准可验证。
- [x] 已逐项裁决补充海报提示词与 Next.js Agent 产品之间的冲突。
- [x] 已记录指定图片、morph 常量、入场时序与字体缺失事实。
- [x] 已冻结 picker root 配置、browse contract、segments 边界、弹窗流程和安全测试。
- [x] 未生成 Task 或 Summary。
- [x] 未修改 UI、测试、依赖或工程配置。
- [x] 开发索引已更新为“Spec 待用户审批”。

**内部门禁结论：通过。当前状态：已批准（修订 2）。**

## 20. 用户审批记录

- 目录弹窗方案原则审批：用户已于 2026-08-28 批准，仅解锁本 Spec 修订。
- 完整 Spec 审批结果：用户已于 2026-08-28 明确批准修订 2。
- 本次批准解锁：阶段 14 Task 文档编写。
- 仍未解锁：阶段 14 实际开发，必须等待 Task 获得用户批准。
