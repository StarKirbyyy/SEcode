# 阶段 25 Spec：Agent 简化写入、基础 TDD、端口启动与可访问交付

## 1. 文档状态与审批门禁

- 当前状态：`v3 草案被阶段 26 取代`。v2 曾获批准，但 2026-08-31 最新真实运行证明 AC25-05、AC25-07、AC25-10 与完成证据收敛仍未满足；用户随后明确允许新开阶段处理完整收敛效率问题，因此未审批的 v3 草案并入阶段 26。
- 观察日期：2026-08-31（北京时间）。
- 前置阶段：阶段 24 Summary 已于 2026-08-31 获用户明确批准，阶段 24 正式完成。
- 立项记录：用户要求检查最新 Agent 运行，并明确指出端口问题被反复处理、SHA 等防御性编程过重、未按简单 TDD 收敛、最终没有保持项目运行或给出直接访问链接。只读诊断完成后，用户回复“开始写 spec”，授权生成本 Spec。
- 初始授权仅允许生成和审阅阶段 25 Spec、同步阶段索引与流程顺序，不等价于批准本 Spec、生成 Task 或实施代码。
- 审批记录：用户于 2026-08-31 在本 Spec 待审批后回复“批准”，语义等价于“阶段 25 Spec 通过”；该批准只解锁阶段 25 Task 的编写，不构成 Task 批准或开发授权。
- 修订记录：Task 待审批期间，用户进一步明确“生成项目端口号避开 3000 即可”。该要求收窄端口设计与验收范围，因此回退到 Spec：不再规定固定端口、固定高位端口、`strictPort` 或端口冲突后的重试次数；此前 Task 暂时失效，待本版 Spec 重新批准后再修订。
- v2 审批记录：用户于 2026-08-31 对上述收窄后的端口要求回复“批准”；Spec v2 获批，只解锁 Task 重写，不构成 Task 或开发批准。
- v3 修订记录：用户随后要求检查磁盘上最新 Agent 运行、总结问题并修复。只读诊断确认 run `ab562cd1-c1a4-496b-9cb0-86e7c1cf92b6` 最终因完成证据误收敛失败，同时真实轨迹仍违反简单 TDD，并继承宿主 `PORT=3000`。这些事实改变验收与实现策略，因此按流程从待审 Summary 回退到本 Spec v3；v3 获批前不得修改 Runtime、Prompt、测试或 Production。
- Task 获批前不得修改 Production、测试、配置、工具协议、真实 Session 或真实用户工作区。
- 原“文档、视频与最终提交”顺延为阶段 26；阶段 19～22 的历史失败、缺失 Summary 和既有审批事实保持不变。

审批链：

```text
阶段 24 Summary（已批准）
  → 阶段 25 只读观察（已完成）
  → 本 Spec v2（已批准）
  → 用户审批 Spec
  → 阶段 25 Task
  → 用户审批 Task
  → TDD 实施、自动验证与真实 Agent 回归
  → 阶段 25 Summary
  → 用户审批 Summary
  → 阶段 26 文档、视频与最终提交
```

## 2. 阶段目标

本阶段把 Agent 从“模型显式管理文件哈希、通过多轮防御性检查收尾”调整为“工具负责基础安全，Agent 采用简单 TDD，成功启动后直接交付可访问服务”。目标不是删除工作区边界或危险操作审批，而是移除与用户目标无关、容易诱发模型循环的模型可见 SHA 仪式，并修复真实运行中的端口与最终交付缺口。

完成后应满足：

1. Agent 不再读取、计算、传递或解释 `expectedSha256` 才能修改文件。
2. 功能和缺陷任务默认采用最小 RED → GREEN → 必要重构；文档、纯配置和样式不被强制伪造测试。
3. 新 Web 项目启动端口只需避开 3000；不指定固定端口或换端口次数。
4. readiness 检查的 URL 必须等于服务实际监听 URL；不得依赖 Vite 自动换端口后继续检查旧端口。
5. 用户要求创建并运行 Web 项目时，成功终态必须保留最终服务，并在最终回答中给出重启命令和可点击访问链接。

## 3. 需求与安全边界变更

### 3.1 既有需求映射

| 需求 ID | 本阶段解释 |
| --- | --- |
| FR-003 | `write_file` 与 `replace_in_file` 继续是六工具的一部分，但模型可见输入不再要求 `expectedSha256`。 |
| FR-004 | Agent 以最小测试驱动循环完成行为变更，避免“先写完全部实现、再靠 build 逐项修补”的长链。 |
| FR-005 | Web 与 Terminal 必须展示真实服务就绪事实、最终运行状态和最终回答中的访问链接。 |
| FR-012 | System Prompt 删除模型管理 SHA、复杂端口策略和扩张式收尾指令，增加简单 TDD、“避开 3000”和最终交付契约。 |
| FR-020 | `run_process` 的 service/readiness 继续有界；最终交付服务在成功 run 后保持运行，失败、超时、取消和被替代的本 run 服务仍须清理。 |
| FR-021 | `read_file` 可继续返回 SHA 作为兼容审计 metadata，但 SHA 不再是后续写工具的模型可见前置条件。 |
| FR-023 | 端口和验证结论继续以结构化 `ToolResult.ok/error/metadata` 为事实，不以日志中的“ready”字样替代 readiness。 |
| FR-024 | 写入前只要求确认工作区路径、父目录和目标存在语义；不再要求模型取得或复用内容 SHA。 |
| NFR-003 | 写入冲突、端口冲突和最终交付缺失必须结构化、简短且可恢复，不能诱发无界重试。 |
| NFR-018 | 功能修改先取得预期失败测试，再做最小实现并重跑；最终只补任务真实需要的 typecheck/build/E2E。 |
| NFR-021 | 新鲜目录与目标事实仍可复用，但不再维护逐目标 SHA 账本或以 hash 作为正常写入流程。 |

### 3.2 对 `SEC-007` 与 `SEC-017` 的明确修订

本 Spec 获批后，阶段 25 Task 必须把同步修订 `01-requirements.md` 列为实施任务；只有 Task 再获批准后才可实际修改：

- `SEC-007` 从“覆盖文件需使用读取时的内容哈希防止陈旧写入”改为“写工具在执行时重新验证工作区真实路径、目标类型和符号链接边界，并以同目录临时文件和原子替换避免部分写入；模型不管理内容哈希”。
- `SEC-017` 从“写入前置观察不得削弱 SHA-256 并发保护”改为“简化写入不得削弱工作区、真实父目录、符号链接、敏感路径、原子写入、Plan Mode 只读和危险操作审批；不再把 SHA-256 作为模型授权或覆盖前置条件”。

这是用户明确要求的安全取舍：可信本地单用户场景下，普通整文件覆盖采用执行时最新目标并原子写入，不再保证“模型读取后、工具执行前”发生的外部并发编辑一定被拒绝。`replace_in_file` 仍必须在执行时验证 `oldText` 唯一匹配；从取得执行快照到原子替换之间若目标再次变化，工具仍可在内部拒绝竞态，但内部实现不得要求模型提供 hash。

以下边界不变：

- 相对工作区路径、realpath 和 symlink 防逃逸；
- 真实父目录、普通文件、UTF-8、大小和敏感路径校验；
- 同目录临时文件、完整写入和原子 rename；
- planning phase 只读；
- 安装、未知程序、Shell、Git 写入和危险操作审批；
- 秘密过滤、JSONL 事实源和旧事件不迁移。

## 4. 只读观察与真实运行证据

### 4.1 观察对象

阶段 25 v2 立项观察时磁盘上最新的 Agent 事件文件为：

```text
.secode-data/sessions/fb815fde-e5a4-4ee2-b951-0fa2e24eda5c/events.jsonl
```

IDE 中打开的 `.secode-data/sessions/82b8d34a-2d3a-41dc-b47b-44492ab00abf/events.jsonl` 当前已不存在，因此本 Spec 不把该陈旧标签当作最新运行事实。观察未读取 `.env.local`、API Key、provider 私有 body 或模型私有推理。

目标 run：`7ec7b23a-6c9a-4cef-8f72-8d53332a13c3`。

| 指标 | 结果 |
| --- | ---: |
| 持续时间 | 445149 ms（约 7 分 25 秒） |
| 模型请求 | 70 |
| 工具请求 | 83 |
| 工具失败 | 12 |
| 危险工具审批 | 16 |
| Context 压缩 | 4 |
| 最终事件 | `run.completed` |

### 4.2 SHA 与写入循环

- 运行包含 26 次 `write_file`、16 次 `replace_in_file` 和 9 次 `read_file`。
- 3 次写入因 `invalid_expected_hash_semantics` 失败；另有多个替换因参数形状错误后重新读取、重写或拆分。
- 模型先写入后端实现，再写测试；后端第一次实际测试直到 seq 158 才执行。前端没有功能测试，只执行 TypeScript/Vite build，因此不属于简单 TDD。
- 当前行为不是模型单方面偏好：System Prompt V10、工具 Schema、`SEC-007` 和 `SEC-017` 均显式要求模型管理 SHA。仅修改提示词不足以解决，公共工具输入和安全要求必须一起修订。

### 4.3 端口循环

真实时间线：

```text
seq 322～326  后端预期 4000，实际继承 SERVER_PORT=3000，EADDRINUSE
seq 336       修改业务代码，专门跳过 3000
seq 348～352  改到 4000，仍 EADDRINUSE
seq 356～360  批量探测 9 个端口
seq 364       再改业务代码，增加命令行端口解析
seq 376～380  后端 4141 readiness 成功
seq 424～428  新后端 4242 readiness 成功
seq 467～471  Vite 因 5173 占用自动换到 5174，但 readiness 仍检查 5173，超时后 SIGTERM
seq 440/475  Agent 主动终止 4141 和 4242 两个已启动后端
```

阶段 19 的确定性测试覆盖宿主 `PORT=3000`，而真实宿主暴露的是 `SERVER_PORT=3000`。生成代码遵守“使用 `SERVER_PORT`”的旧提示后仍被导向 3000，说明既有测试没有覆盖真实环境变量冲突。

### 4.4 最终回答缺口

最终 assistant 正文包含以下事实：

- 前端 dev server 联调未完成；
- 后端当前未运行；
- 4141/4242 服务已被终止；
- Vite 超时后已被 SIGTERM；
- 正文以“完成。写最终报告”“最终回答”结束，但没有真正的成果摘要、启动命令或链接。

Runtime 当前只要求最终正文非空、未超限、通过中文合规并满足已有完成证据；它不验证服务交付事实或访问链接。因此该正文仍被持久化为 `assistant.message(kind=final)`，随后产生 `run.completed`。

### 4.5 v3 最新真实运行证据

最新事件文件为：

```text
.secode-data/sessions/e804e0e7-43ec-4c84-96b5-6fbd0c3fc21a/events.jsonl
```

目标 run：`ab562cd1-c1a4-496b-9cb0-86e7c1cf92b6`，06:09:14～06:17:05 UTC，持续约 7 分 52 秒。

| 指标 | 结果 |
| --- | ---: |
| 模型请求 | 63 |
| 工具请求 / 失败 | 73 / 8 |
| 写入或替换 | 38 |
| `run_process` | 27 |
| 危险工具审批 | 19 |
| service 尝试 / 成功 | 5 / 2 |
| Context 压缩 | 1 |
| 最终 assistant 消息 | 0 |
| 终态 | `run.failed / AGENT_COMPLETION_EVIDENCE_MISSING` |

已确认问题：

1. 计划虽写了“最小测试”，实际先写后端与前端 Production，直到后端实现完成后才在 seq 202 写首个测试，不满足 RED → GREEN。
2. 后端使用 `process.env.PORT ?? 4567`，宿主 `PORT=3000` 使首次 service 实际监听 3000 并 `EADDRINUSE`；模型随后改为 4567 才成功。v11 只写“最终不得为 3000”，没有明确拒绝继承值 3000。
3. 前端先后使用 `npm run dev` 和错误的 `npm exec vite run dev -- --host ...`，日志出现 ready 但 readiness 未收敛；第三次直接执行 Vite 并显式绑定 `127.0.0.1:5173` 才成功。
4. 后端 test、前端 typecheck/build、API smoke、前端/代理/后端 HTTP 检查均成功，两个最终 service 也已 ready；但完成证据只按 validator `cwd` 向下覆盖，留下 `task-board/.gitignore`、根 `package.json` 和已成功执行的 `scripts/smoke-api.js`。
5. `.gitignore` 不应触发代码完成门；`node scripts/smoke-api.js` 因不是精确 `node --test` 被视为未知命令；根协调 `package.json` 又无法由已分别通过验证的 server/client 子项目收敛。两次 correction 后 Runtime 错误失败，并按失败语义清理了原本已就绪的服务。
6. 独立回放 `completion-evidence.ts` 可确定性复现完全相同的 3 个 uncovered paths，构成 v3 RED 反馈环。

## 5. 方案比较与选定方案

### 5.1 方案 A：只压缩 System Prompt

删除部分防御性措辞，保留 `expectedSha256` Schema、完成门和现有端口策略。

- 优点：改动最小。
- 缺点：模型仍必须读取和传递 SHA，工具仍会拒绝无 hash 覆盖；真实端口继承和最终交付没有确定修复。
- 结论：不采用。

### 5.2 方案 B：模型不可见 SHA + 简单 TDD + 避开 3000 与窄最终交付门

模型工具输入移除 `expectedSha256`，基础路径/原子写安全留在工具内部；Agent 按最小 TDD 循环工作；生成项目只需避开 3000，并以最终实际监听 URL 做 readiness 与交付；只对已有 service 事实做轻量最终交付校验。

- 优点：直接消除本次主要循环来源；仍保留工作区和原子写安全；最终交付可由结构化 service 事实验证。
- 缺点：整文件覆盖不再提供读取时并发保护；工具 Schema 和既有测试需要兼容调整。
- 结论：采用。

### 5.3 方案 C：删除全部写入和进程保护

允许任意路径覆盖、Shell 启动、自动杀占用端口进程，并移除 completion/readiness 检查。

- 优点：表面调用最少。
- 缺点：会破坏工作区隔离、秘密保护和本地进程安全，也不等于 TDD。
- 结论：明确排除。

## 6. 详细设计

### 6.1 模型可见写工具简化

`write_file` 模型可见输入调整为：

```ts
{ path: string; content: string }
```

`replace_in_file` 保留单项与批量形式，但移除 `expectedSha256`：

```ts
{ path: string; oldText: string; newText: string }

{
  path: string;
  replacements: Array<{ oldText: string; newText: string }>;
}
```

语义：

1. `write_file` 在执行时观察目标；缺失则创建，存在普通文本文件则原子覆盖，不要求模型先读 hash。
2. `replace_in_file` 在执行时读取最新快照，并要求每个 `oldText` 唯一、批量项互不重叠；任一失败则零写入。
3. 工具内部可继续用 hash 实现原子写竞态检测和审计 metadata，但 hash 不得出现在模型必填参数、System Prompt 步骤、审批理由或完成条件中。
4. `read_file.metadata.sha256` 可为旧事件和用户审计保留；模型可见描述必须明确它不是写入凭据。
5. 历史 JSONL 中已有的 `expectedSha256` 和 hash metadata 原样恢复，不迁移、不重写，也不重放旧工具副作用。
6. 删除“每个既有目标先读 SHA”“同 SHA 多替换”“逐目标 SHA 账本”等模型指导；同文件批量替换仅作为可选效率能力，不成为新的仪式。

### 6.2 简单 TDD 契约

对功能新增和缺陷修复，默认执行：

```text
选择一个最小可观察行为
  → 写一个最小测试
  → 运行并确认因目标行为缺失而失败（RED）
  → 写最少实现
  → 重跑同一测试并通过（GREEN）
  → 仅在确有重复或结构问题时重构
  → 重跑相关测试
```

约束：

1. 空项目允许先创建最小 package、测试入口和必要目录；不得先写完整业务系统再补测试。
2. 每次只推进一个垂直行为，不一次生成大量未运行测试或一次实现全部功能。
3. RED 必须因目标行为缺失而失败；依赖未安装、语法错误或测试脚手架损坏不算有效 RED。
4. GREEN 后停止扩张；warning、风格偏好和未要求的兼容层不触发额外改写。
5. 文档、纯配置、样式和静态资源不强制单元测试；按任务使用解析、typecheck、build 或人工/浏览器检查。
6. 阶段性最小测试通过后，最终只运行任务需要的相关 test，并在可用时补一次 typecheck/build；不得为了满足固定类别重复运行已有效且未被后续变更失效的验证。
7. 不新增 hash、baseline、contract freeze 或额外完成 gate 来证明普通功能正确。

### 6.3 端口选择与启动

1. 3000 继续视为 SEcode 自身保留端口。
2. 生成项目最终监听端口不得为 3000。可以使用框架参数、项目配置或项目专用变量；本 Spec 不指定具体端口号。
3. 监听、代理、CORS（如有）、README、API 检查、readiness 和最终访问链接必须使用同一个实际端口事实，不能继续检查或展示旧端口。
4. `strictPort`、自动选端口或冲突后改用其他端口均属于框架与实现细节，不作为本阶段独立验收门；唯一端口约束是最终端口不为 3000 且交付链接真实可访问。
5. 不得为了找端口批量扫描系统端口或杀死未知占用进程；除此之外不限定端口冲突后的重试次数。
6. 被失败尝试或新实例取代的本 run 服务应清理；最终通过 readiness 的前后端交付服务不得在总结前主动终止。
7. HTTP readiness 仍只允许安全 loopback 端口；页面功能必须使用 `agent-browser` 在真实开发服务上检查，HTTP 200 不替代页面验收。

### 6.4 最终交付与成功终态

当 run 中存在成功的 service readiness 事实时，Runtime 维护一个有限的 run-local 交付视图：`cwd`、脱敏后的 `program/args`、`readinessUrl` 和成功 seq。该视图不新增永久服务注册表，不读取进程环境，也不把 PID 当作用户链接。

最终回答的最低要求：

- 结果：完成了什么；
- 启动：从哪个目录运行哪些命令；
- 访问：实际通过 readiness 的可点击 URL；
- 验证：真实执行的 test/typecheck/build/浏览器结果；
- 限制：未完成或未运行的项目。

Web 项目的推荐最小格式：

```md
项目已启动并通过验证。

- 后端：`cd server && npm run dev -- --port 4141`
- 前端：`cd client && npm run dev -- --port 5174`
- API：[查看后端健康状态](http://127.0.0.1:4141/health)
- 访问：[打开任务看板](http://127.0.0.1:5174/)
- 验证：相关测试、类型检查、构建和页面检查均通过。
```

Runtime 只增加窄校验，不做通用自然语言评分：

1. 已有成功 service 时，final 必须逐字包含对应用户可见 readiness URL；缺失时最多请求一次中文纠正，并把有限 service 事实提供给模型。
2. 如果最后一次 service 尝试失败，且没有后续成功 service，最终回答不得被接受为已完成；一次纠正后仍无成功事实则结构化失败。
3. 不要求固定标题、固定句式、hash、冗长清单或全部工具历史。
4. 最终正文不得包含“让我最终确认”“完成，写最终回答”等尚未执行的元叙述。
5. 对不需要运行服务的普通代码任务，不触发 service 交付校验，沿用中文与完成证据规则。

### 6.5 服务生命周期

- service 只在实现、测试、typecheck/build 和必要修正完成后作为最终交付步骤启动；同一组件不得先后保留多个成功实例。
- `service` readiness 成功后继续保持运行；run 完成不得自动向最终交付服务发送取消信号。
- readiness 前失败、超时、用户取消或 run 失败时，当前 run 启动的服务仍须清理完整进程树。
- 本阶段不新增跨重启服务管理器、后台守护进程、端口占用 UI 或一键停止按钮；最终回答可以给出停止说明，但不把它作为成功条件。
- SEcode 主进程退出后子服务是否继续存活不作跨应用重启保证；本阶段只保证当前 SEcode 进程和成功 run 结束后的直接访问。

## 7. 范围

### 7.1 范围内

1. 修订 `SEC-007`、`SEC-017`、FR-024、NFR-021 的需求表述。
2. 移除 `write_file`/`replace_in_file` 模型输入中的 `expectedSha256` 及相关 Prompt、Schema 和审批文案。
3. 保留工作区、symlink、敏感路径、文本、大小、原子写和危险操作边界。
4. 将 System Prompt 调整为简单 TDD、最小验证、生成项目避开 3000 和最终交付。
5. 修复 `PORT` 与 `SERVER_PORT` 均为 3000 时的新项目端口回归。
6. 增加“最终端口不为 3000”以及实际 readiness URL 与代理/README 一致性验证。
7. 增加有限 service 交付事实和一次最终回答纠正。
8. 使用 Terminal、Web、`agent-browser` 和隔离临时工作区验证完整项目创建、测试、启动、页面访问与最终链接。
9. 在自动门禁通过并向用户展示结果后，另行取得授权再执行一次真实 DeepSeek/LongCat provider 回归。

### 7.2 范围外

- 删除工作区 realpath/symlink、安全路径、审批或秘密保护。
- 启用 Shell、允许任意绝对路径、自动 `sudo` 或杀死未知端口进程。
- 新增完整后台服务管理中心、跨 SEcode 重启守护或部署能力。
- 强迫文档、CSS、静态资源使用单元测试。
- 自动 Git commit、push、发布、部署或打开外网端口。
- 修改模型协议、Context 压缩、Session 存储格式或 UI 信息架构。
- 在未获独立授权时读取真实凭据或调用真实 provider。

## 8. 预期影响模块

Task 可在本 Spec 获批后细化文件范围，预期涉及：

- 需求与 Context：`docs/development/01-requirements.md`、`lib/context/system-prompt.ts`。
- 工具：`lib/tools/schemas.ts`、`lib/tools/types.ts`、`lib/tools/write-file.ts`、`lib/tools/replace-in-file.ts`、`lib/tools/atomic-write.ts`、`lib/tools/registry.ts`。
- Agent：`lib/agent/runtime.ts` 及一个聚焦的 service handoff 状态模块（仅在确有必要时新增）。
- 完成证据：`lib/agent/completion-evidence.ts`；只修正路径相关性、已执行 smoke/check 脚本和项目根协调 metadata 的有限覆盖，不把任意 Node/HTTP/readiness 当作验证。
- 审批/展示：仅更新受工具参数变化直接影响的摘要与投影；不重构 UI。
- 测试：tools、approval、runtime、execution precision、Terminal 集成、E2E 和阶段 25 真实回归 fixture。

不得在 Task 中以“顺手清理”为由修改无关组件、依赖或页面视觉。

## 9. 验收标准

| ID | 验收标准 |
| --- | --- |
| AC25-01 | 生成给模型的 `write_file` 与 `replace_in_file` Schema 不包含 `expectedSha256`；System Prompt 不要求模型读取、传递或管理 SHA。 |
| AC25-02 | 新写入契约覆盖 create、existing overwrite、single replace、batch replace、oldText 缺失/非唯一和执行期竞态；失败为零部分写入。 |
| AC25-03 | 工作区穿越、绝对路径、symlink 逃逸、真实父目录、敏感文件、二进制、过大文件、Plan Mode 和危险审批安全回归全部通过。 |
| AC25-04 | 冻结旧 JSONL 中含 `expectedSha256`、读写 SHA metadata 和旧工具事件的 Session 无迁移恢复，且不重复执行旧副作用。 |
| AC25-05 | 确定性功能任务的工具顺序表现为有效 RED → 最小实现 → GREEN；不会先完成全部 Production 再补测试，也不会为文档/CSS 伪造测试。 |
| AC25-06 | GREEN 后只执行相关 test 和一次必要的 typecheck/build；同一有效验证未被后续相关变更失效时不重复运行。 |
| AC25-07 | 无论宿主是否存在 `PORT=3000` 或 `SERVER_PORT=3000`，生成项目最终监听端口都不是 3000；不要求某个固定替代端口。 |
| AC25-08 | 监听、代理、README、API 检查、readiness 和最终链接使用同一个实际端口；不把 `strictPort`、自动选端口或冲突重试次数设为验收条件。 |
| AC25-09 | Agent 不批量扫描端口、不杀死未知占用进程；失败和被替代的本 run 服务清理，最终交付服务在 `run.completed` 后仍可访问。 |
| AC25-10 | 成功 Web run 的 final 包含实际重启命令、通过 readiness 的可点击 URL、验证结果和限制；不存在“最终回答”元叙述。 |
| AC25-11 | 成功 service 的 URL 缺失时只纠正一次；最新 service 失败且无后续成功时不得产生虚假 `run.completed`，而是有限结构化失败。 |
| AC25-12 | `agent-browser` 在真实开发服务上完成页面加载、核心看板交互、API 联通和 console 检查，最终回答中的链接可直接打开。 |
| AC25-13 | 全量 lint、typecheck、unit/integration、coverage、E2E、双 production build 与 `git diff --check` 按 Task 通过；不通过不得生成成功 Summary。 |
| AC25-14 | 自动门禁展示后，经用户独立授权，在全新临时根用真实 provider 创建轻量前后端项目；事件证明简单 TDD、最终端口均非 3000、双服务就绪、页面可访问和最终链接完整。 |
| AC25-15 | `.gitignore` 等纯忽略规则不进入代码完成证据；直接成功执行本 run 刚写入且文件名明确含 `test/spec/check/verify/smoke` 的脚本只覆盖该脚本，不把普通 `node server.js` 扩大为 test。 |
| AC25-16 | 同一项目根下所有仍相关的已修改子范围分别取得成功 lint/typecheck/test/build 后，根协调 metadata（如聚合 `package.json`）可收敛；任一 sibling Production 未验证时不得被另一个子项目验证误覆盖。 |
| AC25-17 | 冻结回放最新 run 的关键路径与命令后，最终无 uncovered paths；删除 server test、client build 或 smoke 执行中的任一项都会稳定留下对应范围并失败。 |
| AC25-18 | Planning/Executing Prompt 把 RED 顺序置于对应阶段的首要执行检查点；真实 provider 轨迹必须先写最小行为测试并取得因行为缺失导致的失败，再写对应 Production。纯配置、样式、文档继续豁免。 |
| AC25-19 | 生成服务读取 `PORT`/`SERVER_PORT` 时必须显式拒绝值 3000 或由启动参数覆盖；service 的绑定 host、port 与 readiness URL 完全一致，失败重试必须针对上一次结构化原因改变一个变量。 |

## 10. 测试策略

### 10.1 RED 优先

Task 实施前必须先增加并运行以下失败测试：

1. 无 `expectedSha256` 的 existing `write_file` 当前被 Schema/工具拒绝。
2. 无 `expectedSha256` 的 `replace_in_file` 当前被拒绝。
3. 宿主 `PORT=3000`、`SERVER_PORT=3000` 时，旧确定性轨迹生成的服务仍监听 3000。
4. 服务实际监听端口与 readiness/final 链接不一致时，当前链路无法形成正确交付。
5. service 已成功但 final 不含 URL 时，当前 Runtime 仍错误接受完成。
6. 最后 service 失败且无成功服务时，当前 Runtime 仍可接受普通中文完成正文。
7. 回放最新 run 的 server/client/root/smoke 路径，当前稳定遗留 3 个 uncovered paths。
8. 移除 client build 后，根协调 metadata 不得被 server test 单独覆盖。
9. 普通 `node server.js` 成功不得覆盖 Production；刚写入 `scripts/smoke-api.js` 并直接成功执行时只覆盖该脚本。
10. 宿主 `PORT=3000` 与 `SERVER_PORT=3000` 下，Prompt 确定性轨迹必须显式选择非 3000 端口并让绑定/readiness 一致。

每个 RED 必须先确认因目标缺口失败，再实施对应最小修复。

### 10.2 分层验证

- 工具单元：Schema、create/overwrite/replace、原子性、竞态和安全边界。
- Agent 单元/集成：简单 TDD 请求轨迹、service handoff、一次 final 纠正和失败终态。
- Terminal：空临时工作区前后端项目完整轨迹。
- Web E2E：事件展示、最终链接、刷新恢复和终态一致。
- `agent-browser`：真实页面、API、console 和链接检查。
- 全量门禁：lint、typecheck、test、coverage、E2E、Webpack/Turbopack build、diff check、secret/skip 审计。

所有自动测试只能使用临时 workspace、临时 dataDir 和随机/显式隔离端口，不得写入真实 `.secode-data`、真实用户项目或读取 `.env.local`。

## 11. 风险与取舍

| 风险 | 处理 |
| --- | --- |
| 移除模型管理 SHA 后，整文件覆盖可能覆盖读取后发生的外部编辑 | 作为用户明确接受的本地单用户取舍记录；保留执行时路径/类型校验和原子写，不扩大到工作区外。 |
| 内部仍保留 hash 会被重新暴露成模型仪式 | 明确内部 hash 只能是实现与审计细节；Schema、Prompt、审批和完成条件不得依赖它。 |
| 简单 TDD 被误解为所有文件都必须先写测试 | 限定为功能和缺陷行为；文档、CSS、静态配置使用适当验证。 |
| 所选非 3000 端口仍可能被占用 | 允许按框架正常机制或 Agent 重试改用其他非 3000 端口；不规定次数，不扫描大量端口、不杀未知进程。 |
| 保持服务运行可能留下本地进程 | 只保留最终交付 service；失败、取消和被替代服务必须清理，最终回答给出启动/停止事实。 |
| 只校验 URL 不能完全理解自然语言质量 | final gate 只验证结构化 service 事实，不做通用文本评分；真实 provider 与 agent-browser 验收完整交付体验。 |
| 工具输入变更影响旧测试与历史事件 | 旧 JSONL 原样恢复；新 Schema 不重放旧调用；用冻结 fixture 验证兼容。 |
| 放宽根 metadata 覆盖会掩盖 sibling 未验证 | 只在同根下所有仍相关的已修改子范围均已分别验证后收敛协调 metadata；增加删除任一验证即失败的负向测试。 |
| 把任意脚本执行当 test 会伪造证据 | 只认本 run 已写入、名称明确为 test/spec/check/verify/smoke 且直接成功执行的脚本，并且只覆盖脚本自身；普通 Node 与 HTTP 仍不认可。 |

### 11.1 v3 选定修复策略

1. `isRelevantMutationPath` 排除 `.gitignore` 一类不影响可执行行为的忽略清单；不扩大到 `package.json`、构建配置或源代码。
2. 完成证据记录直接脚本执行事实：只对本 run 待验证且名称含 `test/spec/check/verify/smoke` 的相对脚本，在成功 oneshot 直接执行后标记该脚本已覆盖；验证类型记为 `test`，不信任 stdout 中的“PASS”。
3. 增加根协调 metadata 的有限收敛：只有其下所有仍相关、已修改的 Production 子范围都已由认可 validator 覆盖，才允许最近共同祖先处的聚合 `package.json` 等协调文件随之覆盖。不得用 server test 覆盖尚未验证的 client Production。
4. correction 文案继续列出精确相对路径，但同时指出最近可执行范围；不增加 correction 次数，不接受 HTTP 200/readiness 替代 lint/typecheck/test/build。
5. TDD 不新增启发式写拦截或自然语言评分器。改为把 RED → Production → GREEN 写入 Planning 与 Executing 的阶段首要规则，并由确定性轨迹、真实 provider 事件顺序和失败即不通过的验收共同约束。
6. 端口规则明确为：读取宿主 `PORT`/`SERVER_PORT` 后若值为 3000 必须改用项目选择的非 3000 端口，或由显式启动参数覆盖；host/port/readiness 必须取同一事实。Vite 等服务重试先依据结构化失败修正启动参数，不进行无变化重试。

## 12. 待用户确认与审批结果

本 Spec 已选择以下明确方案，不保留实现期临时决策：

- 模型不再管理 `expectedSha256`；
- 基础工作区、symlink、敏感路径和原子写安全继续保留；
- 接受整文件覆盖不再具备读取时并发保护；
- 功能任务采用简单 TDD，非行为文件使用适当验证；
- 生成项目端口只要求避开 3000，不指定固定端口、`strictPort` 或冲突重试次数；
- 最终 Web 服务保持运行并给出可点击链接；
- 只新增窄 service final 校验，不建立通用自然语言评分系统。

**当前状态：v3 草案被阶段 26 取代。**

审批记录：用户先批准初版，随后将端口要求收窄为“生成项目端口号避开 3000 即可”，并于 2026-08-31 再次回复“批准”，形成 v2。v2 实施后的最新真实运行暴露上述缺口；用户进一步指出功能约 25 次模型调用内完成、随后 38 次调用仍未完成测试与启动，明确允许新开阶段。未获审批的 v3 草案因此不再单独等待审批，其诊断与方案全部转入阶段 26；阶段 25 保留真实失败历史，不生成成功 Summary。
