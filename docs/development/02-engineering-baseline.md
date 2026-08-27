# 阶段 02：工程基线

## 1. 阶段目标

建立后续所有功能共享的依赖、命令、环境配置、测试工具和忽略规则，并证明当前 Next.js 16.3.3 模板在目标 Node.js 环境中可稳定检查和构建。

## 2. 前置输入与需求追踪

- 前置文档：[阶段 01：需求、范围与验收标准](./01-requirements.md)，已由用户批准。
- 覆盖需求：`NFR-001`、`NFR-002`、`NFR-006`、`NFR-008`、`SEC-006`、`COM-001`、`COM-004`。
- Next.js 本地版本文档：Vitest 用于同步纯模块测试；异步 Server Component 后续使用 E2E 测试；Playwright 通过 `webServer` 启动应用。

## 3. 范围

### 范围内

- 审查并锁定通用依赖。
- 建立 lint、类型检查、单元测试、覆盖率、E2E 和生产构建命令。
- 建立 Vitest 与 Playwright 配置。
- 建立无凭据的环境变量示例和本地数据忽略规则。
- 添加不依赖业务逻辑的最小运行时测试。

### 范围外

- 领域类型、事件协议和 Agent 业务逻辑。
- 模型、工具、存储、API 和工作台实现。
- 覆盖率阈值；待业务模块形成后在阶段 13 设定。

## 4. 需求拆分

| 编号 | 子需求 | 完成条件 |
| --- | --- | --- |
| EB-01 | 固定运行时与包管理器 | `packageManager` 和 Node.js 最低版本明确 |
| EB-02 | 建立统一质量命令 | 六个开发/验证脚本可执行 |
| EB-03 | 建立 Node 单元测试环境 | Vitest 能发现并通过基线测试 |
| EB-04 | 建立浏览器测试环境 | Playwright 配置可启动 Next.js 并执行 Chromium 测试 |
| EB-05 | 防止秘密和本地状态入库 | `.env.local`、事件数据和测试产物被忽略，`.env.example` 可提交 |
| EB-06 | 审查依赖合规性 | 无 Agent 框架或模型托管工具依赖 |
| EB-07 | 证明模板健康 | lint、typecheck、test、E2E 和 build 通过 |

## 5. 任务清单

- [x] 对照阶段 01 和当前 Next.js 16 本地测试文档。
- [x] 审查现有 `package.json` 和已安装依赖。
- [x] 增加 Node.js 最低版本与质量脚本。
- [x] 添加 Vitest Node 环境配置。
- [x] 添加 Playwright Chromium 与 `webServer` 配置。
- [x] 添加运行时基线单元测试和页面可用性 E2E 测试。
- [x] 添加 `.env.example`，确保没有真实密钥。
- [x] 忽略 `.secode-data`、覆盖率和 Playwright 产物。
- [x] 运行 lint、typecheck、test、test:e2e 和 build。
- [x] 记录验证结果并完成反思修正。

## 6. 设计与实现记录

### 6.1 依赖审查

- `zod`：通用运行时数据校验，不提供 Agent 能力，符合 `COM-001`。
- `react-markdown`、`remark-gfm`：仅用于后续安全展示模型 Markdown，不参与 Agent 循环。
- `vitest`、`@vitest/coverage-v8`：纯 Node 核心模块和集成测试。
- `@playwright/test`：Next.js 页面和完整用户流程验证。
- 未安装模型厂商 SDK、AI SDK 或任何 Agent 框架。

### 6.2 测试分工

- Vitest 默认使用 `node` 环境，匹配文件系统、子进程、流和状态机的运行环境。
- Playwright 只承担浏览器和 Next.js 全栈流程，不用它测试纯函数。
- 阶段 02 的测试只证明测试设施和平台能力，不声明业务功能完成。

### 6.3 配置安全

- `.env.example` 只包含空密钥和非敏感默认值。
- 真实配置放入默认被 Git 忽略的 `.env.local`。
- `.secode-data` 永不入库。

## 7. 验证记录

### 首次验证

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `pnpm lint` | 通过 | ESLint 无错误 |
| `pnpm typecheck` | 通过 | TypeScript 无错误 |
| `pnpm test` | 失败 | Web `Response` 拒绝字符串流块；Vitest 配置出现 ESM 兼容警告 |

首次失败属于有效门禁反馈，没有进入构建或 E2E 阶段。

### 第二次验证

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `pnpm lint` | 通过 | 修正后完整重跑 |
| `pnpm typecheck` | 通过 | 修正后完整重跑 |
| `pnpm test` | 通过 | 1 个文件、3 项测试通过 |
| `pnpm build` | 通过 | Next.js 16.3.3 Turbopack 生产构建成功 |
| `pnpm test:e2e` | 失败 | Playwright Chromium 尚未安装，应用测试未开始 |

## 8. 反思与修正

### 首次验证反思

1. Web `ReadableStream` 本身允许任意块类型，但传给 `Response` 的正文流必须产生 `Uint8Array`；这与后续 NDJSON 编码实现直接相关。
2. TypeScript 配置文件在 CommonJS 包中可能被未来 Vite 原生加载器拒绝 ESM 语法。

### 修正

1. 基线测试加入 `TextEncoder`，显式产生 `Uint8Array`。
2. 将 `vitest.config.ts` 改为 `vitest.config.mts`，明确采用 ESM 配置。
3. 修正后必须重新执行 lint、typecheck 和完整单元测试，不能只重跑失败用例。

### 第二次验证反思

Playwright npm 包与浏览器二进制是两个独立依赖。仅安装 `@playwright/test` 不能保证新环境可以直接运行 E2E。

### 第二次修正

新增 `pnpm test:e2e:install`，统一执行 `playwright install chromium`。开发机或 CI 第一次运行 E2E 前必须先执行该脚本。

### 第三次验证与修正

本机下载约 179 MB 的 Playwright Chromium 时长期停留在 0%，但已经安装 Google Chrome。为了避免本地开发被下载源阻塞：

1. 本地 Playwright 默认使用系统 `chrome` channel。
2. CI 不指定 channel，继续使用 `pnpm test:e2e:install` 安装的 Playwright Chromium。
3. 中止无进度的下载后重新执行 E2E；中止不会修改仓库文件。

## 9. 最终验证

| 检查 | 最终结果 | 证据摘要 |
| --- | --- | --- |
| `pnpm lint` | 通过 | ESLint 退出码 0 |
| `pnpm typecheck` | 通过 | TypeScript 退出码 0 |
| `pnpm test` | 通过 | 1 个文件、3 项测试通过 |
| `pnpm test:e2e` | 通过 | 系统 Chrome 中 1 项页面测试通过 |
| `pnpm build` | 通过 | Next.js 16.3.3 生产构建成功，`/` 正常静态生成 |
| `git diff --check` | 通过 | 无空白或补丁格式错误 |
| 依赖审查 | 通过 | 17 个顶层依赖中无 Agent 框架或模型 SDK |
| 秘密扫描 | 通过 | 未发现实际 API Key 或 Bearer Token；`.env.example` 中密钥为空 |

## 10. 反思总结

### 有效发现

1. NDJSON 后续实现必须先用 `TextEncoder` 将字符串转换为字节流，这一契约已由基线测试固定。
2. Vitest 配置必须显式使用 `.mts`，避免未来 Vite 原生配置加载器产生兼容问题。
3. Playwright 包和浏览器二进制相互独立；本地可以复用系统 Chrome，CI 需显式安装 Chromium。

### 最终修正

- 增加 `test:e2e:install` 作为 CI/新环境浏览器安装入口。
- 本地 Playwright 默认采用系统 Chrome，避免无必要的大文件下载阻塞开发。
- E2E 测试不依赖默认模板的具体文案，因此阶段 12 更换 UI 后仍保持有效。

### 遗留限制

- 本轮未验证外部 CDN 上的 Chromium 完整下载；这属于 CI 环境准备事项，不影响本机基线。
- 当前仅验证工程设施，不代表任何 Agent 功能已经实现。

## 11. 阶段门禁

- [x] `pnpm lint` 通过。
- [x] `pnpm typecheck` 通过。
- [x] `pnpm test` 通过。
- [x] `pnpm test:e2e` 通过。
- [x] `pnpm build` 通过。
- [x] 不含 Agent 框架或真实凭据。
- [x] 实现与文档一致。
- [x] 反思已记录并完成必要修正。
- [x] 开发索引状态更新为“待用户审阅”。

**内部门禁结论：通过。当前状态：待用户审阅。**

在用户明确批准本阶段前，不得开始阶段 03。

## 12. 流程修订说明

阶段 02 的开发和总结发生在三级审批流程建立之前，因此没有追溯生成或伪造 Spec、Task 审批记录。本阶段继续按历史流程等待总结审批；阶段 03 起必须严格执行 `Spec → 审批 → Task → 审批 → 开发 → Summary → 审批`。
