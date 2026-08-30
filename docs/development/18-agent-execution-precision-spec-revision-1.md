# 阶段 18 Spec 修订 1：工作区权限、Token 统计与工作台细节修复

## 1. 文档状态与审批门禁

- 当前状态：`已批准`。
- 生成日期：2026-08-29（北京时间）。
- 修订原因：用户在阶段 18 实施期间报告四项跨层缺陷，涉及客户端统计、审批策略、提示生命周期和工作区会话入口。
- 前置状态：阶段 18 原 Spec 已批准，原 Task 正在实施；本修订改变公共权限语义和 UI 范围，原 Task 不覆盖本修订，须在本 Spec 获批后重新生成 Task。
- 当前允许：编写本修订 Task，并同步 Spec/Task/索引审批状态。
- 当前禁止：Task 获批前修改产品代码、测试、配置或事件协议。
- Spec 审批记录：用户于 2026-08-29 回复“批准”，语义等价于“阶段 18 Spec 修订 1 通过”。

## 2. 目标与需求追踪

| ID | 目标 |
| --- | --- |
| FR-025 | 运行详情显示整个 run 的累计输入、输出和总 Token，并保留每轮统计。 |
| FR-026 | `run_process` 等高风险调用支持“每次询问”“批准本次”和按工作区共享的“完全访问权限”策略。 |
| FR-027 | 顶部临时提示在有限时间后自动消退，错误提示仍可被用户看见并可恢复。 |
| FR-028 | 左侧每个工作区分组可以直接创建使用该工作区的新对话。 |
| NFR-022 | 权限策略按工作区隔离，不能因切换会话或工作区而泄漏授权。 |
| SEC-018 | 完全访问权限只放宽审批策略，不绕过工作区路径边界、硬拒绝规则、取消、预算或事件审计。 |

## 3. 只读观察与事实证据

### 3.1 Token

- [event-state.ts](/Users/starkirby/Codes/secode/lib/client/event-state.ts) 在每个 `model.completed` 中覆盖 `usage`，没有累计。
- [details-drawer.tsx](/Users/starkirby/Codes/secode/app/ui/workbench/details-drawer.tsx) 直接显示 `projection.usage.totalTokens`。
- 运行日志 [events.jsonl](/Users/starkirby/Codes/secode/.secode-data/sessions/9ad0933c-56f2-4e24-a464-ee20e6549483/events.jsonl) 有 71 个带 usage 的模型轮次：累计总 Token 为 1,471,554，最后一轮为 29,333，前端因此少显示约 50 倍。

### 3.2 审批

- [process-policy.ts](/Users/starkirby/Codes/secode/lib/approval/process-policy.ts) 将 `run_process` 的未知、安装、Shell、迁移等调用分类为高风险。
- [capability.ts](/Users/starkirby/Codes/secode/lib/approval/capability.ts) 的授权是一次性 WeakMap 能力，不存在按工作区复用策略。
- [app-shell-provider.tsx](/Users/starkirby/Codes/secode/app/ui/shell/app-shell-provider.tsx) 只有单次审批接口，没有权限策略设置或工作区绑定。
- Codex 官方将“沙箱能力”和“审批策略”分开；Auto 模式允许工作区内常规操作，需要时才请求批准。[Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)

### 3.3 提示与工作区入口

- [app-shell-provider.tsx](/Users/starkirby/Codes/secode/app/ui/shell/app-shell-provider.tsx) 的 `navigationNotice` 没有自动清理计时器。
- [session-navigation.tsx](/Users/starkirby/Codes/secode/app/ui/shell/session-navigation.tsx) 的工作区标题只有展示内容，没有“在此工作区新建对话”动作。
- Codex 的项目视图支持在项目中直接开始新聊天，并在 Chats 下继续访问。[Projects and chats](https://learn.chatgpt.com/docs/projects)

## 4. 范围

### 4.1 范围内

- 累计 run usage 的领域投影、详情展示、轮次展示和对应测试。
- 工作区级权限策略的类型、服务端保存、运行时读取、审批解析、HTTP API、客户端设置和审计事件。
- 单次批准、工作区批准、工作区完全访问三种用户动作及撤销/恢复到逐次询问。
- 顶部临时提示的自动消退、竞态清理和可访问性状态。
- 工作区分组的直接新建对话入口、预选并验证工作区、导航和运行中保护。
- Node.js Route Handler、Client Component、单元/集成/UI 验收所需的最小修改。

### 4.2 范围外

- 不实现真正的 OS 沙箱、权限提升、sudo、系统控制或任意主机访问。
- 完全访问权限不绕过 `deny` 规则，不绕过工作区边界、文件 SHA 并发校验、取消、预算或进程清理。
- 不自动批准计划审批；计划审批仍与工具审批分离。
- 不修改模型 wire 协议，不引入第三方依赖，不删除或重写旧 JSONL 事实。
- 不修改真实用户项目、凭据、部署、Git 历史或最终提交产物。

## 5. 设计规格

### 5.1 Token 累计

`projectRun` 遍历指定 run 的全部 `model.completed`，对存在的字段分别求和：

```text
promptTokens      = Σ 每轮 promptTokens
completionTokens  = Σ 每轮 completionTokens
totalTokens       = Σ 每轮 totalTokens
```

缺失字段保持缺失，不用其他字段推算。详情抽屉显示“输入 / 输出 / 总计”，每轮 transcript 继续显示该轮 usage。旧事件只有部分字段时仍可恢复。

### 5.2 工作区权限策略

权限策略绑定规范化 `workspacePath`，而不是绑定浏览器 URL、会话标题或单个 `runId`。默认值为 `ask`。

```ts
type WorkspacePermissionMode = "ask" | "full";
```

每次审批卡提供：

1. **批准本次**：只解析当前 `approvalId`，保持现有一次性 capability。
2. **完全访问权限**：将当前工作区策略设置为 `full`，并批准当前请求；之后该工作区的可审批工具不再逐次询问。

`full` 只影响原本 `require_approval` 的调用；`deny` 始终拒绝，`allow` 仍自动执行。切换工作区立即切换策略。提供“恢复每次询问”入口，变更有 durable 审计事实；事件中不得写入 invocation、凭据或完整命令秘密。

服务端必须在风险评估前读取当前工作区策略，并在每次执行前重新确认工作区身份。客户端不能单独决定放行。

### 5.3 顶部提示

`navigationNotice` 使用可取消计时器：新提示先清理旧计时器，默认 4 秒后清除；组件卸载时清除计时器。错误状态与运行失败不通过该短提示隐藏，继续使用可恢复的错误区域。

### 5.4 工作区直接新建

每个工作区分组标题增加“新建对话”按钮。点击后：

1. 遵守当前运行中的导航保护；
2. 清空新任务草稿和旧历史；
3. 调用现有工作区验证接口；
4. 成功后跳转 `/`，并将该工作区作为已验证选择；
5. 验证失败时保留在当前页面并显示可恢复错误。

不得从客户端直接提交未经服务端验证的绝对路径。

## 6. 事件、API 与兼容性

- 如权限模式需要新增事件，必须使用新的显式事件类型并更新严格 Schema、投影、恢复和测试；不得把 UI 本地状态伪装成审计事实。
- 现有 `approval.required` / `approval.resolved` 字段保持兼容；单次批准语义不变。
- 旧 Session 没有权限策略时按 `ask` 恢复。
- Token 累计只改变客户端投影与展示，不改写历史 `model.completed` 事件。
- 所有新增 API 必须使用 Node.js Route Handler、strict Schema 和工作区服务端校验。

## 7. 验收标准

| ID | 验收标准 |
| --- | --- |
| AC18-R1-01 | 多轮模型运行的详情总 Token 等于所有轮次 usage 之和；输入/输出/总计分别正确，缺失字段不被伪造。 |
| AC18-R1-02 | 单次批准只允许当前调用；后续同类调用仍请求批准。 |
| AC18-R1-03 | 工作区 A 开启完全访问后，A 的后续高风险调用不重复询问；切到工作区 B 后仍按 B 的策略执行。 |
| AC18-R1-04 | 完全访问不能放行硬拒绝操作，不能绕过工作区边界、取消、预算、哈希校验和事件记录。 |
| AC18-R1-05 | 刷新或恢复旧 Session 时权限模式和审批状态一致；重复提交、过期审批和并发切换不会越权。 |
| AC18-R1-06 | 顶部普通提示在 4 秒后消退；快速连续提示只保留最新计时器；卸载无定时器泄漏。 |
| AC18-R1-07 | 每个工作区分组可直接进入该工作区的新对话；验证失败、运行中切换和移动端导航均有确定性行为。 |
| AC18-R1-08 | 相关单元、集成、lint、typecheck、E2E、build 和 `git diff --check` 按新 Task 验证；不新增依赖、不泄露凭据。 |

## 8. 风险与待审批决策

| 风险 | 防护 |
| --- | --- |
| 工作区完全访问范围过大 | 明确绑定规范化工作区；默认 ask；提供撤销；硬拒绝不可绕过。 |
| 内存策略与事件恢复不一致 | 服务端持久化显式策略事实，旧 Session 默认 ask；恢复测试覆盖。 |
| Token 字段来自不同提供方且不完整 | 按字段独立求和，不互相推算；保留每轮原值。 |
| 提示自动消退掩盖重要错误 | 仅短提示自动消退；错误和审批状态保留在持久 UI 区域。 |

## 9. Spec 审批门禁

本 Spec 记录用户已确认的工作区级权限范围（“当前工作区的所有对话生效”）。用户于 2026-08-29 明确批准本修订；下一步仅生成对应 Task，Task 获批前不得开始实现。
