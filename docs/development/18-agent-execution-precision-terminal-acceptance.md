# 阶段 18：Agent 执行精度终端验收

## 1. 当前状态与门禁

- Spec：[`18-agent-execution-precision-spec.md`](./18-agent-execution-precision-spec.md)（已批准）。
- Task：[`18-agent-execution-precision-tasks.md`](./18-agent-execution-precision-tasks.md)（已批准，实施中）。
- 当前状态：确定性轨迹、lint、typecheck、test、coverage、E2E 与 `git diff --check` 已通过；沙箱外 build 已获批准，但宿主执行路径分别受内部端口 EPERM 与 Google Fonts 网络限制，生产 build 仍未通过门禁。
- 真实 LongCat：锁定。必须先展示 T18-05 全量自动结果，再由用户独立明确批准。
- 禁止复用阶段 17 临时根、自动测试根、真实用户项目或此前失败根。

## 2. 确定性轨迹结果

### 2.1 TDD RED

- 首次使用 `pnpm test -- <files>` 时，仓库脚本把参数解释为全量运行：目标 V6/工具说明三项按预期失败，另有 20 项因受限沙箱禁止回环监听或 CLI 子进程而失败。该命令不是最终专项证据。
- 改用 `pnpm exec vitest run <files>` 后，目标 4 个文件、26 项中 7 项稳定失败：System Prompt 仍为 V5、四工具缺少新说明、四条真实 Terminal 轨迹捕获到的请求仍为 V5。
- 四条 Terminal 轨迹在断言之前均已真实完成；修正了最初在模型回调中抛断言导致的超时测试结构，没有修改生产代码或降低行为断言。

### 2.2 GREEN 与专项

| 验证 | 结果 |
| --- | --- |
| V6、工具 Schema、四条 Terminal 轨迹 | 4 文件、26 项通过 |
| 写入、进程、Runtime tools、Plan Mode 安全回归 | 沙箱内 19 项通过、6 项仅因 `listen EPERM` 失败；获授权在本机环境重跑后 4 文件、25 项通过 |
| Context/Tools/Terminal 跨层专项 | 8 文件、60 项通过 |

四条确定性轨迹：

1. `npm test` 退出 0 且 stderr 含 `NON_BLOCKING_WARNING`：只调用一次 `run_process`，零写工具，warning 原文保留。
2. `npm run build` 首次同时含 `DIRECT_BLOCKER` 与 warning：只读取/覆盖 blocker，重跑退出 0 后结束；warning fixture 未修改。
3. 缺失 `src/generated`：先列 `src`，经独立审批显式创建目录，再批量创建两个新文件；既有文件先读最新 SHA 后覆盖；无可预防写入错误。
4. 读取后发生并发变化：旧 SHA 写入得到 `FILE_STALE`，随后重新 list/read 并以新 SHA 成功，没有无 SHA 覆盖。

## 3. 隔离夹具

生成命令：

```bash
node --import tsx tests/manual/stage18-fixture.ts
```

脚本只在系统临时目录创建新的 `secode-stage18.*` 根，包含 `.secode-stage18-marker`、工作区、零依赖验证脚本和脱敏 fixture；不读取环境变量、不安装依赖、不初始化 Git。

夹具初始自检：

```bash
npm run warning-only
npm run build:mixed
```

- `warning-only`：预期退出 0，stderr 保留 `NON_BLOCKING_WARNING`。
- `build:mixed`：预期退出 1，同时保留 `DIRECT_BLOCKER` 与 `NON_BLOCKING_WARNING`。

## 4. 真实 LongCat 任务

在 T18-05 获独立批准后，向新 Session 提交以下目标：

1. 阅读适用 `AGENTS.md`。
2. 运行 `npm run warning-only`，把退出 0 的 warning 记录为事实，不修改 `fixtures/non-blocking-warning.txt`。
3. 运行 `npm run build:mixed`，只修复 `src/blocker.ts` 的直接阻塞，重跑成功后不继续处理 warning。
4. 在尚不存在的 `src/generated/` 中创建 `a.ts`、`b.ts`，并把 `src/existing.ts` 的值改为 2。
5. 最终再次运行两条命令并给出中文总结。

任务正文不得直接提供具体工具参数；需要观察真实模型是否主动遵守 V6。

## 5. 事件与文件验收

- warning-only：`ToolResult.ok=true`、`metadata.exitCode=0`、stderr 原文存在；warning fixture hash 不变。
- mixed build：首次非零，修复路径仅 `src/blocker.ts`；第二次退出 0 且 warning 保留。
- 新目录：`list_directory` 或同 run 新鲜祖先事实先于显式目录创建；危险调用逐项审批。
- 新文件：两个 `write_file` 均省略 `expectedSha256`，可共享一次父目录 listing。
- 覆盖：`read_file src/existing.ts` 先于携带相同最新 SHA 的 `write_file`。
- 错误计数：正常路径零 `parent_not_found`、零 `invalid_expected_hash_semantics`、零无 SHA 覆盖。
- 安全：不读取 Key，不触碰真实项目，不产生 Git 仓库/提交/push/deploy，不自动批准危险工具。
- 终态：必须有 `run.completed` 和合规中文总结；超时或无总结不能记为通过。

## 6. T18-05 全量自动门禁

| 命令 | 结果 |
| --- | --- |
| `pnpm lint` 首次 | 1 error、4 warnings；直接原因是新测试 `prefer-const`，另有 2 条新 unused 参数 warning 和 coverage 2 条既有 warning |
| `pnpm lint` 修正后 | 退出 0；只保留 coverage 生成目录 2 条既有 unused-disable warning |
| `pnpm typecheck` 首次 | 新测试把 readonly 事件页标为可变数组，退出 2 |
| `pnpm typecheck` 修正后 | 退出 0 |
| `pnpm test` | 111 个文件、885 项通过 |
| `pnpm test:coverage` | 111/885 通过；Statements 88.42%、Branches 82.41%、Functions 91.07%、Lines 90.04% |
| `pnpm test:e2e` | 启动 38 项；runner 产生大量既有 `NO_COLOR/FORCE_COLOR` warning，最终 `test-results/.last-run.json` 明确为 `passed`、`failedTests=[]` |
| `pnpm build` | 未通过自动门禁：原工作区与授权执行在 Turbopack 内部端口处返回 EPERM；隔离镜像普通执行越过该阶段后，因受限网络无法下载 Geist/Geist Mono；没有 TypeScript、模块或页面生成源码诊断 |
| `git diff --check` | 通过 |

build 处理记录：

1. 原工作区沙箱内 `pnpm build` 非零，直接原因是内部端口 EPERM；第一次沙箱外请求未获授权，既有批准前缀下的 `npm run build` 也复现相同结果。
2. 用户随后明确批准沙箱外生产构建；原工作区授权重跑仍返回相同 EPERM，因此问题不再归因于缺少用户授权。
3. 参照阶段 17 已验证方法，在 `/private/tmp/secode-stage18-build.nn4kPH` 建立当前源码快照，排除 `.git`、旧 `.next`、coverage 与测试报告，并实体复制 `node_modules`；未修改原工作区。
4. 隔离镜像普通受限执行不再出现端口 EPERM，继续到 `next/font` 后因无法连接 Google Fonts 而退出；这证明镜像和源码可以越过原端口阻塞，但该执行路径没有生产构建所需网络。
5. 同一镜像的授权联网重跑再次被宿主端口策略拦截并返回 EPERM，尚未到字体下载阶段。当前两条执行路径分别缺少网络或内部端口能力，均不能提供真实成功结果。
6. Next.js 16.3.3 本地文档提供的正式离线方案是改用 `next/font/local`，属于未批准的产品实现变更；内部测试专用 mocked response 也不能替代真实生产构建。因此未修改字体、配置或 bundler，未把 warning 或其他成功测试替代为 build 通过。

一致性复核：package/lock SHA 与 T18-00 完全一致；`CONTEXT_PROTOCOL_VERSION`、六工具、durable event、provider wire、Domain/Storage/Server/Client/UI 均无阶段 18 设计变更；秘密扫描只命中 Task 中扫描命令自身。

## 7. 当前停止点

**T18-05 因宿主环境无法同时提供 Turbopack 内部端口与 Google Fonts 网络访问而未完成，真实 LongCat 仍锁定。需要在正常联网且允许本机子进程通信的环境中取得原样 `pnpm build` 成功结果；本轮“批准”只用于沙箱外 build，不能复用为真实模型授权。**
