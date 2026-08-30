# 阶段 18 Spec 修订 2：启动验收、服务进程生命周期与完整用量计量

## 1. 文档状态与审批门禁

- 当前状态：`已批准`。
- 生成日期：2026-08-29（北京时间）。
- 修订原因：用户继续反馈开发完成后的项目启动验收缺失、`run_process` 启动服务经常超时、readiness 成功后子进程被关闭，以及前端 Token 仍明显低于实际消耗。
- 前置状态：Spec/Task 修订 1 已批准并已完成实现；Summary 修订 1 尚待审批。本修订改变 `run_process` 公共参数、进程生命周期、启动验收流程和 usage 事件范围，因此 Summary 修订 1 的审批范围暂时挂起，需先完成本 Spec 及后续 Task 的重新审批。
- 当前允许：根据本 Spec 编写对应 Task，并同步阶段索引状态。
- 当前禁止：对应 Task 获批前，不修改产品代码、测试、配置或事件协议。

## 2. 目标与需求追踪

| ID | 目标 |
| --- | --- |
| FR-029 | Agent 在开发完成后自动执行依赖安装（按锁文件选择包管理器）、构建和服务启动就绪验收，并区分安装失败、构建失败、启动失败和就绪失败。 |
| FR-030 | `run_process` 支持一次性命令与持久在线服务两种明确生命周期；服务 readiness 成功后默认不关闭子进程。 |
| FR-031 | 服务启动使用独立、可配置的就绪等待窗口，兼容受限的本机回环地址，避免将探测窗口误当作整个进程执行窗口。 |
| FR-032 | 前端 Token 计量覆盖每一个实际发出的模型请求，包括上下文摘要请求和重试/部分失败请求中可取得的 provider usage；无法取得时显式标记未计量，不静默显示为完整总量。 |
| NFR-023 | readiness 成功返回不能阻塞 Agent 主进程；启动服务的 stdout/stderr 持续排空且不会因工具 Promise 结束而被隐式杀死。 |
| NFR-024 | 所有启动验收和 usage 计量均由事件事实驱动，可在刷新、恢复和跨页面查看时重建。 |
| SEC-019 | 只允许工作区内命令和受限 loopback readiness；失败、取消、未就绪超时仍清理进程组；持久在线服务只在显式停止、取消或受控清理时终止。 |

## 3. 只读观察与事实证据

### 3.1 启动和 readiness

- 当前实现 [run-process.ts](/Users/starkirby/Codes/secode/lib/tools/run-process.ts) 在 `readiness` 成功时调用 `terminateChild()`，随后以“服务已就绪并完成进程清理”返回；这与用户希望保留前后端服务直接矛盾。现有单元测试也把端口释放作为成功条件，说明旧契约被代码和测试共同固化。
- 当前实现把 `arguments_.timeoutMs` 同时用于进程运行和 readiness 探测；探测从 0ms 开始每 100ms 重试，服务启动较慢、首次编译或端口绑定延迟时会把启动检查误判为整体超时。
- readiness schema 只接受 `http://127.0.0.1:<高位端口>`。日志中 Vite 已输出 `Local http://localhost:5173`，但 127.0.0.1 探测在 30s、60s 均超时；改为显式 `--host 127.0.0.1` 后才成功，表明地址族/绑定地址差异会制造假阴性。
- 19:49–20:19 的运行记录（阶段 17 终端验收文档第 29 节及后续记录）显示：`npm install` 因 Node.js v24 下 `better-sqlite3` 原生编译缺少 `climits` 失败约 42.8s，改用 `sql.js` 后安装成功约 23.6s；后端 3000 端口 readiness 遇到 `EADDRINUSE`，改用 3001 成功；前端 Vite 的 localhost 输出与 127.0.0.1 探测不一致造成两次超时。该运行中仅 process timeout 就累计约 340s。

### 3.2 Token 计量

- [event-state.ts](/Users/starkirby/Codes/secode/lib/client/event-state.ts) 已按 run 累加 `model.completed`，但它只能看到 Agent 主循环发布的事件。
- [summary-generator.ts](/Users/starkirby/Codes/secode/lib/context/summary-generator.ts) 直接调用 `modelClient.complete()` 生成上下文摘要，其 completion usage 未返回给 context provider 或事件发布链；每次压缩都会产生未计量的模型请求。
- [client.ts](/Users/starkirby/Codes/secode/lib/model/client.ts) 对一次模型请求最多执行三次 provider attempt；失败、超时或流已开始后失败时，已取得的 usage 没有作为公开计量事实带回 Agent。因而供应商已计费但没有最终 `model.completed` 的请求会被前端静默遗漏。
- [event.ts](/Users/starkirby/Codes/secode/lib/domain/event.ts) 的 usage 仅有 prompt/completion/total 三字段。provider 返回的字段可能缺失，当前 UI 没有区分“已报告总量”和“仍有请求未返回 usage”，所以即使继续累加也会给出过于确定的偏小数字。
- 现有历史日志已证明“最后一轮覆盖累计”是一个独立问题；修订 1 已修复该问题，但新证据表明仍需纳入摘要/重试请求并公开未计量状态，不能把修订 1 的累计结果宣称为供应商账单的完整值。

## 4. 范围

### 4.1 范围内

- 为 `run_process` 增加显式服务生命周期参数（一次性命令/持久在线服务），并定义 readiness 成功、提前退出、启动失败、超时、取消和显式停止的结构化结果。
- 将服务 readiness 等待窗口与一次性命令超时解耦；支持受限 loopback 的 `localhost`、`127.0.0.1` 和 IPv6 loopback 表达，保持禁止重定向和外部地址。
- 服务就绪后保留子进程及其进程组，持续排空输出并返回可审计的 PID/生命周期元数据；未就绪失败或取消仍清理，避免孤儿进程。
- 在系统提示和 Agent 验收策略中加入“开发完成后安装、构建、逐服务 readiness 验收”的中文流程；按 lockfile 选择 npm/pnpm/yarn 等已存在工具，不擅自修改依赖解决安装错误。
- 为上下文摘要模型调用和 provider attempt 的可得 usage 建立公开、可恢复的事件事实；前端显示已报告输入/输出/总量、未计量请求数或不完整标记，并保留每轮主循环 usage。
- 增加工具、Agent、上下文、事件恢复、客户端投影和终端/UI 所需的最小测试与验收记录。

### 4.2 范围外

- 不承诺把 provider 缺失或供应商内部缓存/折扣口径推算成精确账单；无法取得 usage 时必须显示“不完整/至少值”，不得伪造估算为实际值。
- 不向用户或事件公开 reasoning 私有正文；若 provider 的 `total_tokens` 已包含 reasoning，只公开合计字段，不新增私有推理文本字段。
- 不实现通用进程管理平台、跨机器服务编排、自动杀掉用户已有端口占用的进程或任意外部主机探测。
- 不修改用户项目依赖、锁文件、凭据、部署或 Git 历史；不引入第三方 Agent/进程管理框架。

## 5. 设计规格

### 5.1 开发完成后的启动验收

1. Agent 先读取工作区 lockfile 和各 package manifest，选择已有包管理器；在项目根或明确子项目目录执行安装。
2. 安装失败时记录命令、退出码、结构化错误和可见根因（例如原生模块/Node ABI），停止把项目称为“可启动”；只有用户明确要求才调整依赖或技术栈。
3. 安装成功后执行项目声明的 build/typecheck（若存在），再为后端、前端等每个长期服务使用 `run_process` 的 service + readiness 模式。
4. 每个 readiness 必须记录 URL、实际状态码、等待耗时、绑定地址、PID 和生命周期；成功后可以继续 API/页面检查，失败时区分端口占用、进程提前退出和等待窗口耗尽。
5. 最终回答必须分别报告 install/build/readiness 结果；任一关键步骤未运行或失败，不得笼统声称项目启动正常。

### 5.2 `run_process` 生命周期与 readiness

建议公共参数（具体字段名在 Task 中冻结）：

```ts
{
  program: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;             // 一次性命令或未就绪失败的总上限
  lifecycle?: "oneshot" | "service"; // 默认 oneshot
  readiness?: {
    url: string;
    expectedStatus?: number;
    timeoutMs?: number;           // service 的独立启动等待窗口
  };
}
```

- `oneshot` 保持现有等待退出语义；无 readiness 时以退出码决定成败。
- `service` 必须带 readiness。进程以 detached process group 启动；在独立 readiness 窗口内探测成功后返回 `ok=true`，不发送终止信号，返回 `metadata.lifecycle="service"`、`pid`、`ready=true` 和最近一次状态码。
- service readiness 成功后，工具停止等待退出但继续排空 stdout/stderr；工具 Promise 结束不触发 cleanup。显式停止/运行取消/应用受控清理时才终止该进程组。
- service 在 readiness 前提前退出、spawn 失败、readiness 窗口耗尽或外部取消时仍按现有 SIGTERM→SIGKILL 纪律清理，并返回结构化错误。
- `timeoutMs` 不得在 readiness 成功后重新杀掉 service；oneshot 和 service 未就绪阶段都必须有硬上限。高位 loopback URL 只允许 `localhost`、`127.0.0.1` 或 `[::1]`，不跟随重定向，不发送凭据。
- 对 `localhost` 可按解析到的 loopback 地址尝试有限候选；不得把任意 DNS 名称放入允许列表。端口占用只报告事实，不自动杀死未知 PID。

### 5.3 完整 Token 计量

- 每个真实 provider attempt 若返回 usage，必须产生可追溯的公开 usage 事实；Agent 主循环、上下文摘要和重试 attempt 不得共用“最后一轮覆盖”字段。
- 新事件或扩展事件严格区分 `source`（`agent_model`、`context_summary`、`retry`）和 `requestId/attempt`，并按字段累加 prompt/completion/total；不得公开 reasoning 正文或内部 continuation。
- 若 provider 在超时/断流前只返回部分 usage，保存已知值并标记 `complete=false`；若完全没有 usage，保存 `unreported=true`。一次请求最多计一次最终已知值，重试 attempt 按实际请求分别计量，避免重复或漏算。
- `projectRun` 和详情抽屉显示：已报告输入/输出/总计、未计量请求数以及“不完整/至少”状态。只有所有已发请求都有完整 usage 时才显示“总计”；否则明确说明该值是 provider 已报告下限。
- 旧事件没有新字段时按兼容规则恢复；不回写或删除原 JSONL。

## 6. 安全、兼容性与错误模型

- 所有命令继续经过工作区边界、风险审批、取消和预算检查；`service` 只改变成功后的生命周期，不降低危险命令审批。
- readiness 仍是本机回环探测，禁止外部地址、凭据、重定向和绝对工作区路径；服务 PID 仅作为受限本地事实返回。
- 明确区分 `PROCESS_SPAWN_FAILED`、`PROCESS_EXIT_NONZERO`、`PROCESS_TIMEOUT`、`PROCESS_READINESS_TIMEOUT`（如新增）和取消；错误不得包含秘密、完整环境或私有推理。
- 运行恢复时，未结束的 service 只恢复为“外部服务可能仍在运行”的事实，不假装拥有可继续控制的旧 ChildProcess；提供受控清理或明确提示，避免重启后误杀无关 PID。
- 批准的工作区完全访问权限仍只影响审批策略，不绕过上述边界。

## 7. 验收标准

| ID | 验收标准 |
| --- | --- |
| AC18-R2-01 | 一个带 `npm install` 的新项目在开发完成后实际执行安装；成功、原生依赖失败和网络失败均以结构化结果报告，失败时不称“可启动”。 |
| AC18-R2-02 | service readiness 在启动耗时超过首次探测间隔时不会误报；`localhost`/`127.0.0.1`/`[::1]` 的受限 loopback 探测按实际绑定地址正确判定，外部地址和重定向仍拒绝。 |
| AC18-R2-03 | service readiness 成功后工具返回且子进程仍存活、端口仍可访问；工具 Promise 结束不发送 SIGTERM/SIGKILL。 |
| AC18-R2-04 | service 在 readiness 前退出、未就绪超时、取消和显式停止均清理进程组；不会遗留测试夹具子进程，也不会自动杀未知端口占用者。 |
| AC18-R2-05 | install、build、后端 readiness、前端 readiness 的结果在最终事件和 UI 中可区分恢复。 |
| AC18-R2-06 | 主循环、上下文摘要和重试请求的 provider usage 均进入可恢复累计；缺失 usage 显示未计量/至少值，不再静默低估或把估算称作实际账单。 |
| AC18-R2-07 | 旧 Session/旧事件可读取；客户端详情、轮次 transcript 和终端输出对完整/不完整 usage 语义一致。 |
| AC18-R2-08 | 相关单元、集成、终端/UI 验收、lint、typecheck、E2E、build 和 `git diff --check` 按后续 Task 执行；不新增依赖、不泄露凭据。 |

## 8. 风险与待用户确认

| 风险/决策 | 建议 |
| --- | --- |
| service 成功后默认常驻可能产生长期进程 | 仅 `lifecycle="service"` 常驻；失败/取消清理；返回 PID 并提供受控停止路径，oneshot 保持兼容。 |
| Node 进程重启后无法安全持有旧 ChildProcess | 不自动按旧 PID 杀进程；恢复显示未知外部服务，清理必须重新验证 PID/工作区和进程归属。 |
| provider usage 缺失导致无法精确对账 | UI 明确显示 provider 已报告下限与未计量请求数；不伪造精确账单。 |
| `localhost` 的 IPv4/IPv6 行为依赖操作系统 | 只接受 loopback，按有限候选探测并记录实际 URL/状态；不得放宽到任意主机名。 |

## 9. Spec 审批门禁

Spec 审批记录：用户于 2026-08-29 回复“批准”，语义等价于“阶段 18 Spec 修订 2 通过”，仅解锁对应 Task 编写，不解锁代码实现。
