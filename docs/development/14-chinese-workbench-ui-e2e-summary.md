# 阶段 14 Summary：中文工作台、受限目录弹窗、海报视觉层与 UI E2E

## 1. 文档状态与审批门禁

- 当前状态：已批准，阶段 14 正式完成。
- 完成日期：2026-08-28。
- 前置 Spec：[14-chinese-workbench-ui-e2e-spec.md](./14-chinese-workbench-ui-e2e-spec.md) 修订 2，用户已批准。
- 前置 Task：[14-chinese-workbench-ui-e2e-tasks.md](./14-chinese-workbench-ui-e2e-tasks.md)，用户已批准。
- Summary 审批记录：用户于 2026-08-28 明确批准。
- 当前允许：进入阶段 15 的只读观察与 Spec 编写。
- 当前禁止：在阶段 15 Spec 获批前生成 Task 或实施交付；Git commit/push/deploy。

## 2. 阶段目标与结论

阶段 14 已把阶段 13 的本地 Node Route Handlers 接成可用的 Next.js 16.3.3 中文编程智能体工作台。浏览器现可从受限目录弹窗选择工作区、创建和恢复 Session、提交 NDJSON 流式任务、检查模型与工具事件、允许/拒绝危险操作、取消运行并查看 durable 终态。

视觉层按批准的海报映射实现：`#161616` 固定舞台、白/粉 SECODE、两张指定百合、一次性入场、fine-pointer morph mask、reduced-motion 与移动 frosted Sheet。它不改变 Agent、工具、JSONL 或风险事实。

最终结论：阶段 14 production、unit、integration、coverage、lint、typecheck、build 和 14 项产品 E2E 全部通过；package/lock 未变化；没有真实 Key、真实用户项目或 E2E 临时资源残留。LongCat 真实端点仍是已记录的外部阻塞。

## 3. 实际开发顺序

1. T14-00 固定五道基线、package/lock hash 与 Next.js 16.3.3 本地文档。
2. T14-01～03 实现 picker DTO/Schema/error、单 root 安全服务与第十个 Route Handler。
3. T14-04～08 实现 typed API client、NDJSON parser、event ledger/projection、安全 Markdown/view model 与 morph 纯数学。
4. T14-09～14 实现 Next 壳、海报舞台、Workspace/Session/Run/Tool/Approval UI、响应式与可访问性。
5. T14-15 建立登记临时 root、loopback 假模型、runtime manifest、图片 fixture 与 graceful Playwright wrapper。
6. T14-16 完成 picker 与 read→replace→test→final→reload 产品 E2E。
7. T14-17 完成审批、拒绝、取消、provider failure、Markdown、视觉、移动与图片失败 E2E。
8. T14-18 串行运行全仓门禁、人工桌面检查和安全/残留审计。
9. T14-19 回写 Task、生成本 Summary 并停止等待审批。

顺序与已批准 Task 一致；没有并行运行会竞争 `.next`、JSONL singleton 或测试数据的完整门禁。

## 4. 实现架构

```text
app/page.tsx (Server Component)
  → Workbench (Client root)
      → lib/client typed JSON + NDJSON
      → durable/live ledger + run/tool projection
      → Session / Timeline / Composer / Inspector / Sheet

POST /api/workspaces/browse
  → lib/server HTTP guards
  → WorkspacePickerService
  → existing workspace handle/resolver
  → configured canonical picker root

VisualStage
  → fixed brand/poster layers
  → two approved Next Image URLs
  → white-only canvas masks + pure morph math
  -X→ Agent/workspace/model facts
```

JSONL durable events 仍是历史唯一事实源。浏览器 live ledger 只暂存流事件；终态、EOF、错误或刷新后都从 events API 重新协调，不写 localStorage 事实。

## 5. 受限工作区选择器

- 配置仅来自 `SECODE_WORKSPACE_PICKER_ROOT`；缺失、空、相对、文件、文件系统根和不可用路径均返回有限错误。
- 客户端只发送最多 64 个 relative segments；单段 255 字符，总路径 4096 bytes。
- 服务复用既有 workspace handle/resolver，绑定 canonical root identity，并在枚举前后复核 root/current identity。
- 只返回目录；固定忽略 `.git`、`node_modules`、`.next`、`.secode-data`；external/断链/不可访问 symlink 计入 blocked，不向客户端泄露目标。
- 结果按确定顺序返回前 500 项并提供 truncated/blocked/ignored 事实。
- validate/create 再次验证 canonical workspace 仍位于 picker root 内，避免选择与创建间替换。
- UI 没有可编辑绝对路径输入；最近路径只展示，不绕过 picker。

## 6. 浏览器协议与运行状态

`lib/client` 使用 strict Zod 校验九类 JSON response、browse response、API error 与每一行 `AgentEvent`。NDJSON parser 按 UTF-8 字节边界增量解码，覆盖 CRLF、空行、EOF、abort、非法 JSON、错误 Session 与 8 MiB 上限。

Workbench 行为：

- config/recent/sessions 独立加载、错误和重试。
- Session events 从 `after=0&limit=500` 分页恢复，使用 seq/id/payload 冲突检查去重。
- 一个标签页最多一个 active stream；运行中禁用 Session 切换与新建。
- 首个 `user.message` 后才清空草稿；已知 runId 的停止调用既有 DELETE API。
- 工具卡按 toolCallId 合并 requested/approval/started/result；拒绝优先显示为 `rejected`。
- failed/cancelled/interrupted 的“继续”只填中文可编辑草稿，不自动发请求。
- Markdown 跳过 raw HTML，拒绝 javascript URL，把模型图片降为 inert 说明/安全链接，不自动加载远程资源。

## 7. UI、视觉与可访问性

- `html lang="zh-CN"`、SEcode metadata、Geist Sans/Mono；因用户未提供 Orbit 文件，标题明确使用 Georgia/Times fallback，未下载或伪造字体。
- 产品图 distinct source 恰为两个批准的 Higgsfield URL；Next Image 使用 identity loader + unoptimized 保留 URL。
- morph trail 只用两个 canvas 生成白色 alpha mask，不读取跨源图片像素；算法由纯函数测试固定为 harmonic blob，而非 CSS circle。
- 最后 `orb-corner` 或 reduced-motion `stage-fade` animationend 移除 `anim`，另有 6 秒非 reduced safety。
- 视口无 body scroll；长 Session、事件、输出只在面板内部滚动。
- 桌面三栏，中屏收起 inspector，移动端使用 burger/frosted Sheet；Sheet 有 dialog semantics、inert、focus trap、Escape 与 focus restore。
- landmarks、labels、aria-live、details/summary、focus-visible 和非颜色状态均已实现；装饰图只暴露一次有意义 alt。

## 8. 隔离 E2E 产品环境

Playwright 的唯一 webServer 是 `start-environment.ts`：

- 在 macOS `tmpdir()` 创建并登记唯一 `secode-stage14-e2e-*` root、picker root、slug project 与 data dir。
- fixture 含错误 slug 实现、4 个真实 Node tests、empty/hidden/ignored/file/external symlink/501 directories。
- loopback OpenAI-compatible server 按 scenario 发送真实 SSE tool calls，不 mock 浏览器 API。
- Next child 用 `spawn("pnpm", args, { shell:false })`；只注入 generic loopback model、独立 data dir 与 picker root，真实 provider env 被清空。
- runtime manifest 验证 root realpath/dev/ino 与所有子路径；清理只删除登记精确 root。
- Playwright `workers=1`、`retries=0`、`reuseExistingServer=false`，使用 localhost same-origin 和系统 Chrome。
- `gracefulShutdown: SIGTERM/10s` 配合幂等 signal/exit cleanup；最终 manifest、temp root、fake server、Next child 和 slow process 均为零。
- 两个 Higgsfield URL 在自动测试中由固定透明 PNG bytes 精确拦截，不依赖外网或第三张产品资产。

## 9. 产品 E2E 证据

14 项 E2E 全部通过：

- 中文 metadata、安全提示、默认模板消失与 no-scroll。
- picker canonical create、file/ignore/external link、empty、500 truncation 与 stale request。
- 真实 Agent `read_file → replace_in_file → run_process(pnpm test)`，fixture 4/4，通过后 final，刷新恢复且 final 不重复。
- approval allow/reject、重复按钮防护、slow process cancel、reload durable cancelled。
- provider 500 重试后的有限 durable failure、continue draft 与刷新恢复。
- raw HTML/javascript/remote Markdown image 均不执行或自动请求。
- 1440×900 三栏、双 URL、z-order、morph data mask、reduced-motion、移动 Sheet 键盘焦点。
- 两张产品图同时 503 时仍可 picker、创建、运行和审批。

每例开始重置假模型和错误 source；结束比较 README、package 与 tests 未改变。测试不安装依赖、不执行 Git、不访问真实用户项目。

## 10. 最终验证

| 门禁 | 最终结果 |
| --- | --- |
| server 指定集 | 10 files / 67 tests，通过 |
| client 指定集 | 9 files / 50 tests，通过 |
| `pnpm test:coverage` | 98 files / 739 tests，通过 |
| Statements | 87.50%，阈值 80% |
| Branches | 80.42%，阈值 70% |
| Functions | 90.17%，阈值 80% |
| Lines | 89.19%，阈值 80% |
| `pnpm lint` | exit 0；0 errors，2 个既有 coverage warning |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 98 files / 739 tests，通过 |
| `pnpm build` | Next.js 16.3.3，通过；`/` + 10 API routes |
| `pnpm test:e2e` | Chrome 14/14，通过，retries=0 |
| `git diff --check` | exit 0 |

Build 只保留既有 `lib/storage/file-safety.ts` 动态文件 tracing warning；本阶段未越权修改 storage 或用 ignore comment 隐藏它。

最终 hash 与 T14-00 相同：

```text
package.json     5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13
pnpm-lock.yaml   5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683
```

## 11. 关键失败、诊断与修正

1. React Hooks lint 拒绝 effect 内同步 bootstrap/history 状态改变；改为直接异步请求和 microtask 历史启动。
2. E2E fixture 参数 `use` 被 Hook rule 误识别，改名；原生 `Response.ok` 的属性/函数误用由 typecheck 修正。
3. Playwright 默认 SIGKILL 遗留登记 temp root；增加 graceful shutdown 与 inode-validated sync exit cleanup，连续扫描为零。
4. 浏览器用 127.0.0.1、Next mutation URL 用 localhost 时 Origin 精确比较返回 403；浏览器 baseURL 固定 localhost，server 仍只监听 loopback。
5. 假模型最初从二次 JSON.stringify 文本提取 SHA，无法匹配 tool content；改为只扫描实际 message content。
6. reduced-motion 没有 `orb-corner`，导致 `anim` 等 6 秒；监听 280ms `stage-fade` 收口。
7. 移动菜单打开后立即 disabled，使 Sheet 捕获不到触发焦点；保留按钮可聚焦并依靠 inert 阻止背景交互。
8. reject 后的有限 tool.result 把状态覆盖为 failed；明确 `approval.resolved=false` 优先为 rejected，并补单元回归。
9. E2E 报告目录一度被全仓 ESLint 扫描；精确删除可再生报告，不改 ESLint 配置或忽略范围。

所有修正都位于批准白名单和既定语义内；未改核心 Agent、事件、模型、工具、存储、workspace 或 approval 实现。

## 12. 安全与边界审计

- `app/ui`/`lib/client` 无 Node built-in、`lib/server`、baseUrl、Key env、Authorization 或 reasoning import/字符串。
- browse route/service 无 shell、raw command、HOME/cwd parent/root 自动扩展、字符串前缀边界或文件内容输出。
- Markdown 无 `dangerouslySetInnerHTML`/raw HTML；模型远程图不会成为 `<img>`。
- production Higgsfield distinct URL 正好两个，query 与事件不能改变它们。
- package/lock 无 diff；未新增依赖、未降低覆盖率、未添加 ignore pragma。
- changed/new 阶段 14 文件均在 Task 白名单；阶段 13 两份审批文档变化是 T14-00 已记录的 pre-existing diff。
- 无 `sk-*`、Bearer、真实 endpoint/Key 或真实凭据日志。
- 正确使用 `tmpdir()` 导出的 manifest 路径审计后：manifest 0、temp root 0、fake server 0、slow process 0。

## 13. 人工检查、限制与偏差

人工浏览器已观察桌面海报、三栏、真实远程百合，完成 picker→slug-project→canonical validate→create Session。尝试在同一仓库再次启动隔离 Next 实例做人工完整 Agent 时，用户已有 `pnpm dev`（PID 72738，端口 3000）持有 dev lock；为保护用户进程没有终止它。完整 Agent 与移动路径由不 mock API 的 14/14 产品 E2E 覆盖。这是人工复跑环境限制，不是产品门禁失败。

保留限制：

- 只适用于可信本地单用户；没有 OS 强沙箱，不安全执行恶意模型生成的任意本机代码。
- 只有一个环境配置的 picker root；无 Finder/Explorer 原生选择器、目录写操作或多 root。
- Higgsfield 网络不可用时视觉降级为纯色功能层；核心操作仍可用。人工检查时远程图片可达，自动测试不依赖它。
- Orbit 字体未提供，固定使用批准的 Geist + Georgia/Times fallback，不能宣称像素级 Orbit 字体一致。
- LongCat 因用户暂无端点继续为 `blocked_external`；本阶段没有把假模型当成真实 LongCat 通过。
- 没有 Session 删除/改名/搜索、富文本编辑器、虚拟列表、多 Agent、MCP、云执行或部署。

没有需要回退 Spec/Task 的公共语义偏差。

## 14. 审批结论

用户于 2026-08-28 批准本 Summary，阶段 14 正式完成。该审批只解锁阶段 15 的只读观察与 Spec 编写，不直接解锁阶段 15 Task、实施、Git commit、push 或 deploy。
