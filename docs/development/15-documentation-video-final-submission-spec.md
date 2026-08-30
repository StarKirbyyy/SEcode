# 历史草稿：原阶段 15 Spec（项目文档、演示视频与最终交付）

> 2026-08-28，用户在审批前提出重新设计主页、工作区选择和整体工作台布局。本 Spec 因前置产品基线将变化而被后续流程修订取代；内容只作为未来阶段 16 重新观察的输入，不得据此生成 Task 或实施交付。

## 1. 文档状态与审批门禁

- 当前状态：被后续修订取代。
- 观察日期：2026-08-28（北京时间）。
- 前置阶段：[阶段 14 Summary](./14-chinese-workbench-ui-e2e-summary.md) 已由用户于 2026-08-28 批准。
- 本阶段主题：文档、演示视频、公开仓库核验、提交 ZIP 与最终质量门禁。
- 当前允许：只允许审阅和修订本 Spec。
- 当前禁止：生成阶段 15 Task、修改项目说明、创建 README.txt、录制或编辑视频、创建 ZIP、Git commit/push、打开或提交评测表单。
- 下一门禁：先完成新的阶段 15“主页、工作区与 Session 体验重构”；阶段 15 Summary 获批后，重新观察并生成阶段 16 最终交付 Spec。

审批链：

```text
阶段 14 Summary（已批准）
  → 阶段 15 只读观察（已完成）
  → 本 Spec（待用户审批）
  → 阶段 15 Task（尚未生成）
  → 用户审批 Task
  → 文档与演示准备
  → 用户完成/授权录屏与发布动作
  → 最终门禁、ZIP 与远端核验
  → 阶段 15 Summary
  → 用户审批 Summary
  → 项目正式完成
```

## 2. 目标与需求追踪

阶段 15 不扩展 Agent 功能，而是把已验收产品整理成可运行、可演示、可审计、可提交的最终成果，并确保对题目要求、真实实现和已知限制的表述完全一致。

覆盖需求：

- `NFR-007`：中文工作台可用于桌面演示。
- `NFR-008`：关键设计和验证证据可追踪。
- `SEC-006`：API Key 不进入客户端、仓库、日志或交付材料。
- `SEC-008`：明确可信本地用户边界，不冒充强沙箱。
- `COM-001`～`COM-004`：自研 Agent 核心、无托管工具依赖、无凭据泄漏。
- `COM-005`：公开仓库与完整提交历史。
- `COM-006`：README.txt 不超过 1000 汉字。
- `COM-007`：MP4 不超过 2 分钟和 200 MB。
- `COM-008`：2026-09-02 24:00 北京时间后停止推送。

## 3. 观察范围与方法

### 3.1 已检查来源

1. 原题 [推免考核题目学生版.pdf](../推免考核题目学生版.pdf) 共 2 页；用 `pdfinfo` 检查元数据并将全部页面渲染为 PNG 逐页观察。没有编辑或重新导出原 PDF。
2. [00-process.md](./00-process.md)、[01-requirements.md](./01-requirements.md)、[02-engineering-baseline.md](./02-engineering-baseline.md)。
3. 阶段 12 的真实终端验收与 LongCat 范围豁免，以及阶段 14 的 UI、E2E、质量和安全证据。
4. 根 `README.md`、`.env.example`、`.gitignore`、`package.json`、质量脚本和当前文件清单。
5. Git branch、remote、最近提交、HEAD 与 `origin/main`、工作区状态和公开仓库匿名页面。
6. 本机交付工具可用性：`zip`、`shasum` 可用；`ffmpeg`、`ffprobe` 不可用。
7. 对所有 Git tracked 与 non-ignored untracked 文件执行只返回计数/文件名的秘密模式观察，并对命中进行脱敏分类。

### 3.2 本轮未执行

- 未重跑 lint、typecheck、unit、coverage、build 或 E2E；阶段 14 已批准的串行门禁作为当前质量基线。
- 未读取 `.env.local` 或任何真实 API Key。
- 未启动真实 DeepSeek 请求，未尝试 LongCat。
- 未创建 README.txt、视频、ZIP 或演示工作区。
- 未修改 production、test、package、lockfile 或 Git 历史。
- 未执行 commit、push、force-push、rebase、squash、release、deploy 或表单提交。

## 4. 原题权威交付约束

原题要求在 2026-09-02 24:00（北京时间，即 9 月 3 日 0 点）前完成，提交物共三项：

| 交付物 | 原题约束 | 本 Spec 的保守解释 |
| --- | --- | --- |
| Git 仓库 | 题目发布后新建的公开 GitHub/Gitee 仓库；保留完整提交历史；不得压缩或改写已推送历史；截止后不得推送新提交；URL 写入 README.txt | 使用现有公开 `StarKirbyyy/SEcode`；只做前进式提交；禁止 force-push/rebase/squash 已推送提交；最终远端必须包含阶段 14/15 成果 |
| README.txt | 1000 汉字以内；含 Git 仓库地址、运行方法、特色功能和其他必要说明 | 使用纯文本 UTF-8；总 Unicode code point（含空白）也控制在 1000 内，并报告总字符数与汉字数，目标不超过 900 总字符以留余量 |
| 视频 | 2 分钟以内；演示 Agent 完成一个真实编程任务，并简要讲解功能实现；允许剪辑和加速；MP4；不超过 200 MB | 最终 duration `<=120.0s`、size `<=200,000,000 bytes`；目标 110～118 秒、H.264/AAC、30 fps、不超过 150 MB，保留安全余量 |

提交包约束：

- 只提交一个以用户姓名命名的 ZIP。
- ZIP 根目录只包含 `README.txt` 和一个 MP4 视频文件，不包含源代码、`.env`、Key、日志、系统隐藏文件或额外目录。
- 提交地址为原题给出的清华表单；允许重复提交，以最后一次为准。
- 表单提交属于外部不可逆动作，必须由用户本人完成，本 Agent 只准备和验证本地 ZIP。

面试环节要求现场播放视频、简述设计并回答评委问题；因此仓库文档和答辩提纲必须能够解释 Agent 为什么如此运转，并为关键设计决策辩护。

## 5. 当前事实基线

### 5.1 已满足或已有证据

| 事实 | 状态 | 证据 |
| --- | --- | --- |
| 公开仓库存在 | 已满足 | `https://github.com/StarKirbyyy/SEcode` 可匿名打开并标记 Public |
| 完整增量历史存在 | 已满足到阶段 13 | `main` 有 10 个提交；无观察到的历史压缩动作 |
| 本地与远端已提交 HEAD 一致 | 已满足 | 本地 HEAD 与 `origin/main` 均为 `1f8bcff25ae26dd2aa3fc25de4451bcc19c553ac` |
| Agent 核心闭环 | 已验收 | 阶段 12 真实 DeepSeek 完成读、改、测试与总结；六工具、审批、取消、恢复通过 |
| Web 完整闭环 | 已验收 | 阶段 14 production E2E 14/14，通过刷新恢复、审批、取消、错误与响应式路径 |
| 全仓质量门禁 | 已验收基线 | 阶段 14：98 files / 739 tests；coverage、lint、typecheck、build、E2E、diff check 通过 |
| 公开配置无真实值 | 已满足 | `.env.example` 仅有空 Key；`.env*`、`.secode-data` 和测试产物被忽略 |
| LongCat 事实披露 | 已记录 | 用户暂无端点；真实冒烟保持 `blocked_external`，不得写成通过 |

### 5.2 当前缺口

| 缺口 | 当前事实 | 必须达到的状态 |
| --- | --- | --- |
| 阶段 14/15 尚未发布 | 工作区有大量阶段 14 modified/untracked 文件；远端只到阶段 13 | 经完整门禁、用户授权和前进式提交后，远端包含最终成果 |
| 根项目说明 | `README.md` 仍是 create-next-app 英文模板 | 改为真实的中文项目说明、架构、运行、安全、测试和限制 |
| 提交 README | `README.txt` 不存在 | 生成、计数、审阅并放入 ZIP 根目录 |
| 演示视频 | 无 MP4/MOV/WebM | 完成真实 DeepSeek 编程任务录屏并验证格式、时长、体积和隐私 |
| 姓名 ZIP | 不存在，且尚未知用户要求的精确文件名 | 获得姓名后生成精确命名 ZIP，并验证内部仅两个文件 |
| 视频元数据工具 | 系统无 `ffmpeg`/`ffprobe` | 不在观察阶段安装；实施时优先用 macOS `mdls` + QuickTime 检查，若用户已有/允许工具再用 `ffprobe` 交叉验证 |
| 发布与表单动作 | 未授权 | 单独设置用户 checkpoint；Spec/Task 审批均不等价于 commit、push 或表单提交授权 |

### 5.3 秘密模式观察结论

对 316 个 tracked/non-ignored 文件的保守正则扫描会命中：

- `sk-*`：9 个测试文件。
- `Bearer ...`：1 个模型客户端测试文件。
- 非空 API Key assignment：2 个安全/脱敏测试文件；`.env.example` 的三个 Key 为空。

脱敏检查确认这些命中均为刻意验证 redaction/security 的测试夹具或空配置，不是真实凭据。因此最终审计不能把“正则命中必须为 0”作为唯一标准，而必须执行“自动扫描 + 文件级白名单 + 脱敏人工复核”；任何非白名单命中仍直接阻断发布。

## 6. 范围

### 6.1 范围内

1. 将根 `README.md` 改为与真实代码一致的中文项目文档。
2. 创建符合字数和内容限制的根 `README.txt`。
3. 创建演示脚本、镜头表、录制清单、答辩提纲和最终提交清单。
4. 使用隔离的临时示例项目和真实 DeepSeek 完成一次可录制的 Web 编程任务。
5. 由用户控制录屏/旁白，或在用户另行明确授权后协助操作本机录屏；随后检查用户提供的 MP4。
6. 验证视频时长、格式、体积、画面、音频、隐私和事实表述。
7. 在被 Git 忽略的本地 `delivery/` 目录组装最终视频和姓名 ZIP。
8. 串行执行全仓质量、合规、秘密、Git 历史、远端公开性和 ZIP 内容检查。
9. 在用户单独授权的前提下执行或指导前进式 Git commit/push，并在匿名页面复核最终 commit。
10. 生成阶段 15 Summary，记录真实结果、hash、剩余用户动作和截止时间状态。

### 6.2 范围外

- 新增 Agent、工具、模型、API、UI 或存储功能。
- 为演示临时修改产品事实、跳过安全审批、伪造工具事件或使用假模型冒充真实 provider。
- 安装 Agent 框架、模型 SDK、视频编辑 npm 包或其他项目依赖。
- 将视频、ZIP、`.env.local`、`.secode-data`、Playwright 产物或真实会话提交到 Git。
- 自动 force-push、rebase、squash、改写已推送历史、创建 release 或部署。
- 在未单独授权时执行 commit/push；在任何情况下代替用户提交清华表单。
- 把缺少 LongCat 端点描述成“双 provider 真实验证通过”。
- 在截止时间后产生任何远端新提交。

## 7. 预期文档与本地产物

### 7.1 公开仓库内

```text
README.md
README.txt
.gitignore
docs/delivery/video-script.md
docs/delivery/final-submission-checklist.md
docs/delivery/interview-defense.md
docs/development/15-documentation-video-final-submission-spec.md
docs/development/15-documentation-video-final-submission-tasks.md
docs/development/15-documentation-video-final-submission-summary.md
docs/development/README.md
```

`.gitignore` 只需增加根 `/delivery/`，避免视频与 ZIP 被误提交。除非实施时发现文档链接必须修正，否则不修改 production、tests、package 或 lockfile。

### 7.2 仅本地、不得进入 Git

```text
delivery/
  README.txt                 # 根 README.txt 的逐字复制
  SEcode-demo.mp4            # 建议稳定视频名
  <用户姓名>.zip             # ZIP 根目录只含上述两个文件
```

SHA-256、视频元数据和 ZIP 清单写入 Summary/提交清单，不额外塞入 ZIP。

## 8. 根 README.md 规格

根 README 面向仓库审阅者和本地运行者，至少包含：

1. 项目目标和“自研 Agent 核心、Next.js 本地全栈”的一句话定位。
2. 架构图：Browser → Route Handlers → Agent 状态机 → Model/Tools/Security/Event Store。
3. 核心能力：DeepSeek/LongCat-compatible、六工具、审批、取消、JSONL 恢复、上下文压缩、中文工作台。
4. 安全边界：工作区 realpath/symlink 防逃逸、无 shell 默认、风险分级、可信本地单用户、非 OS 强沙箱。
5. 环境要求：Node `>=20.9.0`、pnpm `10.33.3`，并说明 Next.js `16.3.3`。
6. 安装和配置：`pnpm install --frozen-lockfile`、复制 `.env.example` 到被忽略的 `.env.local`、模型变量与 picker root；示例不得含真实 Key。
7. Web 运行：`pnpm dev`、浏览器地址、受限工作区根配置。
8. Terminal 运行：`pnpm agent -- --workspace ... --model deepseek` 的安全示例，以及交互命令入口。
9. 质量命令：lint、typecheck、test、coverage、build、E2E。
10. 数据位置、会话恢复、危险审批与取消说明。
11. 已知限制：LongCat 未完成真实端点冒烟、无强沙箱、无多租户、无自动 commit/push/deploy、远程百合图不可用时视觉降级。
12. 文档索引、题目原文和关键设计证据链接。

README 不得宣称 Vercel/Serverless 部署可用，不保留 create-next-app 模板内容，不泄露用户真实绝对路径、endpoint、Key 或 Session ID。

## 9. README.txt 规格

README.txt 是提交包中的极简入口，不是根 README.md 的复制。建议结构：

```text
SEcode 编程智能体
仓库：<公开 HTTPS URL>
运行：<Node/pnpm、配置、安装、dev/agent 的最短步骤>
特色：<自研循环、六工具、安全审批、JSONL、中文 UI>
说明：<可信本地用户边界、LongCat 实测限制、必要环境>
```

约束：

- UTF-8 纯文本，无 Markdown 表格、图片、HTML 或 ANSI 控制字符。
- 仓库 URL 使用匿名可访问的 HTTPS URL，不使用 SSH remote。
- 不包含真实 Key、真实 endpoint、用户名、本机绝对路径或会话日志。
- 总 Unicode code point（换行和空白计入）`<=1000`，目标 `<=900`；同时报告 `\p{Script=Han}` 汉字数和 UTF-8 bytes。
- 运行命令必须与 `package.json` 和 `.env.example` 一致。
- 真实说明 LongCat-compatible 支持已有自动测试，但用户无端点，未完成真实 LongCat 冒烟。

## 10. 视频方案

### 10.1 录制事实与安全前提

- 使用真实 DeepSeek 配置，不在屏幕上打开或输入 API Key。
- 演示工作区使用独立 disposable slug fixture，放在专用 picker root 下；不选择 SEcode 仓库或真实私人项目。
- 录制前关闭通知，隐藏浏览器书签、其他标签、终端环境和个人文件；UI 中不得出现真实用户名、Key、endpoint 或不适合公开的路径。
- 视频只展示最终回答、工具参数、工具结果和状态事件，不展示私有 reasoning。
- 演示任务必须真实执行：读取契约/源码/测试 → 运行测试失败 → 最小修改 → 测试转绿 → 最终总结；不能用剪辑伪造未发生的工具事实。

### 10.2 建议 110～118 秒脚本

| 时间 | 画面与讲解 | 验收事实 |
| --- | --- | --- |
| 0～12 秒 | SEcode 标题、模型与受限工作区弹窗 | 产品定位、DeepSeek、canonical workspace |
| 12～25 秒 | 选择隔离 fixture 并提交真实 slug 修复任务 | 无可编辑绝对路径，Session 绑定工作区 |
| 25～75 秒 | 时间线展示 list/read/search、失败测试、replace、复测 | 自研工具调用、结构化失败、最小修复、4/4 通过 |
| 75～92 秒 | 最终回答、工具卡和刷新恢复 | durable JSONL、无重复 final、任务状态 |
| 92～110 秒 | 快速展示审批/取消的已有可控路径或 inspector | 风险分级和用户控制；不得伪造执行 |
| 110～118 秒 | 架构图/README 结束页 | 自研 Agent 循环、安全边界、无 Agent 框架 |

模型等待可剪掉或加速，但工具顺序、测试结果和最终结论必须保持真实。若审批/取消无法在时限内自然加入，则以工作台 inspector 的现有事实加旁白说明，不为视频改产品。

### 10.3 编码与质量目标

- 容器：MP4；建议视频 H.264、音频 AAC。
- 建议分辨率：1920×1080 或 1440×900；帧率 30 fps。
- 最终时长：`<=120.0s`；目标 `110～118s`。
- 最终体积：`<=200,000,000 bytes`；目标 `<150 MB`。
- 文字在 100% 播放速度下可读；无鼠标乱晃、裁切、黑帧、长静音或明显通知弹窗。
- 旁白语言中文，简洁解释“为什么这样设计”，不逐行念日志。

本机当前没有 `ffmpeg`/`ffprobe`，阶段 15 不以安装系统软件为默认方案。优先使用用户已有的 QuickTime/录屏工具生成 MP4，并用 `mdls`、`file`、QuickTime 信息面板和完整播放核验；若用户另行提供可用 ffprobe，再增加机器可读交叉验证。

## 11. 演示工作区与真实任务设计

演示 fixture 应固定包含：

- `README.md`：声明 `slugify` 必须 trim、折叠任意连续空白并 lower-case；禁止改测试、安装依赖和 commit。
- `src/slug.mjs`：有意只替换第一个普通空格的错误实现。
- `tests/slug.test.mjs`：4 个测试，初始 2 pass/2 fail，修复后 4/4。
- `package.json`：只调用 Node 内置 test runner，不需安装依赖。

任务提示必须明确要求：先读取约束和测试，建立失败基线，只改源码，运行测试验证，并总结实际改动；不得安装依赖、修改测试或执行 Git。它复用阶段 12 已真实验证的缺陷形状，但录制时必须创建新的隔离副本并产生新的真实事件链。

演示完成后，应校验：

- tests、README 和 package 未变化。
- 只有 `src/slug.mjs` 发生预期最小修改。
- 初始失败与最终通过都能从 durable 事件中看到。
- fixture、独立 `SECODE_DATA_DIR` 和临时 picker root 可精确清理，不接触用户项目。

## 12. Git、公开发布与截止门禁

### 12.1 当前事实

- remote：`git@github.com:StarKirbyyy/SEcode.git`。
- branch：`main`。
- 已提交 HEAD 与 `origin/main` 一致，均为阶段 13 commit `1f8bcff...`。
- 公开页面当前显示 Public 和 10 commits。
- 阶段 14 及本阶段审批文档仍在本地工作区，尚未进入远端。

### 12.2 发布规则

1. 先完成文档、视频、ZIP 和全部本地门禁，再进入发布 checkpoint。
2. 禁止 `git add .`；按 Task 白名单精确暂存，并在 commit 前检查 staged diff 与秘密。
3. 只允许普通前进式 commit；禁止 force-push、rebase、squash、amend 已推送提交或删除历史。
4. 视频、ZIP、`.env.local`、本地 data 和测试产物必须保持 ignored/untracked，不进入 staged set。
5. commit/push 是外部状态改变：需要用户在该时点另行明确授权，或由用户亲自执行 Task 提供的命令。批准本 Spec 或未来 Task 均不自动授权。
6. push 后必须从匿名公开页面确认最终 commit、README 和源文件可见，并确认仓库 URL 与 README.txt 一致。
7. 北京时间到达 2026-09-02 24:00 后，任何缺陷都不得通过新 push 修复；只能保留截止前最后一次公开状态并如实记录。

## 13. ZIP 与提交验证

ZIP 生成前必须获得用户希望用于文件名的精确姓名。建议最终路径：

```text
delivery/<用户姓名>.zip
```

ZIP 根目录只能有：

```text
README.txt
SEcode-demo.mp4
```

不得包含 `delivery/` 父目录、`__MACOSX/`、`.DS_Store` 或资源 fork。验证至少包括：

- `zipinfo -1` 返回且只返回两行目标文件。
- `unzip -t` 完整性通过。
- 解压到新临时目录后，README.txt 与根文件 SHA-256 相同。
- MP4 SHA-256、bytes、duration、codec 和分辨率已记录。
- ZIP SHA-256 和 bytes 已记录。
- 在提交前再次人工打开 ZIP 内 README.txt 并播放 ZIP 内视频，而不是只检查源副本。

表单最终提交和“最后一次为准”的选择由用户完成；Summary 只能写“本地提交包已验证”或用户明确回报的提交事实，不能擅自宣称表单提交成功。

## 14. 最终验证策略

### 14.1 串行工程门禁

以下命令必须串行执行，避免 `.next`、JSONL singleton 和 E2E 环境竞态：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm test:e2e
git diff --check
```

要求：

- lint/typecheck/build exit 0。
- unit/integration 全部通过；coverage 不低于已批准阈值。
- E2E 14/14 或更多全部通过，`workers=1`、`retries=0`。
- package/lock 不变化，除非先回到 Spec 修订并重新审批。
- 不以 `.skip`、`.only`、降低阈值、删除测试或忽略规则制造通过。

### 14.2 文档与交付门禁

- README.md 的命令、环境变量、路由数量、工具数量、限制与代码一致。
- README.txt 字符数、汉字数、bytes 自动报告并满足保守阈值。
- 所有相对文档链接和公开 HTTPS URL 可访问。
- MP4 格式、duration、size、codec、分辨率、音频和完整播放通过。
- ZIP 只有两个根文件，完整性与 SHA 一致。
- `git status` 中没有应该发布但遗漏的文件；staged set 中没有本地交付物。
- 匿名 GitHub 页面显示最终前进式 commit 和 README。

### 14.3 秘密与合规门禁

- 扫描 tracked + non-ignored untracked + staged 内容；对所有命中执行脱敏文件级复核。
- 测试夹具白名单只能包含显然虚假的固定字符串，不能扩展到 production/docs/video/README.txt。
- 检查仓库历史、README.txt、视频每个镜头、ZIP 和录制用浏览器，确认无 Key、Bearer、Cookie、真实 endpoint、`.env.local` 内容或私密路径。
- 依赖清单不得出现 Agent 框架、厂商 SDK、服务端托管代码/文件工具。
- README 和视频都准确说明 Agent 循环、工具解析、上下文、终止与错误恢复为自研。
- LongCat 只能表述为“适配器与自动测试已完成；因无真实端点未冒烟”，不能宣称真实通过。

## 15. 可测试验收标准

| ID | 验收标准 | 对应要求 |
| --- | --- | --- |
| AC15-01 | 根 README.md 完整、真实、可按步骤启动 Terminal 与 Web | `NFR-008`、`SEC-008` |
| AC15-02 | README.txt 含 HTTPS 仓库、运行、特色和必要限制；总字符 `<=1000`，目标 `<=900` | `COM-004`、`COM-006` |
| AC15-03 | 视频为 MP4、`<=120.0s`、`<=200,000,000 bytes`，完整展示一次真实编程任务 | `NFR-007`、`COM-004`、`COM-007` |
| AC15-04 | 视频任务具有真实失败基线、最小源码修改、测试转绿和最终总结，不修改测试/装依赖/commit | `FR-003`～`FR-005`、`COM-003` |
| AC15-05 | 视频和文档无 Key、私有 reasoning、真实用户项目或敏感路径 | `SEC-006`、`COM-004` |
| AC15-06 | 姓名 ZIP 根目录只含 README.txt 与 MP4；完整性、hash 和内容均核验 | 原题提交物规则 |
| AC15-07 | 公开仓库匿名可访问，包含最终成果和完整前进式历史；截止后无新 push | `COM-005`、`COM-008` |
| AC15-08 | lint、typecheck、test、coverage、build、E2E、diff check 全部通过 | `NFR-001`～`NFR-008` |
| AC15-09 | package/lock 无新增 Agent 框架或模型 SDK，视频/ZIP/data 未进入 Git | `COM-001`、`COM-002` |
| AC15-10 | README、视频与 Summary 对 LongCat 外部阻塞和可信本地安全边界表述一致 | `SEC-008`、`FR-009` 范围豁免 |
| AC15-11 | 用户能够依据答辩提纲解释状态机、工具、安全、JSONL、上下文和关键权衡 | 原题面试环节 |
| AC15-12 | Summary 区分“本地包已验证”“远端已发布”“表单已由用户提交”三种事实，不越权宣称 | 流程与外部状态纪律 |

## 16. 失败处理、回退与风险

### 16.1 失败处理

- 文档事实与代码不一致：先修正文档；若发现产品缺陷，停止阶段 15 实施并修订 Spec/Task，不在交付阶段偷偷改业务语义。
- DeepSeek 鉴权、限流或模型行为不稳定：保留结构化失败，检查配置后重试；不得切换假模型并把结果冒充真实录制。
- 演示 Agent 偏离任务：丢弃该录制副本，重置隔离 fixture 和独立 data dir 后重新录制。
- 视频超过 120 秒/200 MB：使用用户现有编辑工具剪辑、加速或重新导出；每次导出都重新做完整播放和元数据检查。
- 视频出现秘密/通知/私人路径：视为不可修补的泄漏风险，必须删除公开候选并重新录制。
- ZIP 内容多余：删除候选 ZIP，使用显式两文件列表重新创建，不靠排除通配符补救。
- 最终工程门禁失败：修复真实原因并完整重跑；不得通过跳过测试或降低阈值通过。
- 远端落后或匿名不可见：不提交表单，先由用户处理发布授权/网络/权限问题。
- 已过截止时间：绝不 push；保留截止前最后公开状态并在 Summary 明确未完成项。

### 16.2 回退策略

- 文档修改均为普通 Git diff，可逐文件审阅；禁止覆盖用户其他改动。
- 视频和 ZIP 只存在于 ignored `delivery/`；候选失败时只处理精确文件，不影响仓库或用户项目。
- 演示 fixture 和 data 使用登记的精确临时 root；清理前复核 canonical path，不宽泛递归操作 HOME、仓库根或系统临时根。
- 发布前如发现 staged set 错误，停止并让用户决定如何取消暂存；不使用 `git reset --hard` 或 `git checkout --`。
- 已推送历史不回退、不改写；只能通过新的前进式修正提交，且必须在截止前并得到授权。

### 16.3 主要风险

1. 当前距离截止时间较短，视频录制、用户审阅、发布和表单提交需要预留缓冲。
2. 阶段 14 尚未提交；公开仓库当前不是最终产品状态。
3. 用户姓名、录屏方式和 Git 发布责任尚未确定，阻止 Task 固定最终操作人和文件名。
4. 本机缺少 ffmpeg/ffprobe，视频元数据验证需使用 macOS 工具或用户另行提供工具。
5. 真实模型具有延迟和非确定性；演示必须先做不录屏的完整预演。
6. LongCat 外部阻塞是已接受限制，但公开材料的措辞必须准确且一致。

## 17. 用户审批时需要补充的输入

为使后续 Task 不再临时决定交付语义，请用户在批准本 Spec 时一并给出：

1. **ZIP 文件名使用的精确姓名**：例如 `张三.zip`；必须确认是完整姓名还是仅姓氏。
2. **视频录制责任**：建议用户本人使用 QuickTime/现有录屏工具录制并提供 MP4，Agent 负责脚本、预演、检查和打包；若希望 Agent 协助操作本机录屏，需要另行明确授权并接受系统录屏权限可能需要人工确认。
3. **Git 发布方式**：建议 Agent 完成文件与门禁后停止，由用户本人 commit/push；若希望 Agent 执行 commit/push，必须在发布 checkpoint 另行明确授权，当前 Spec 审批不构成授权。

默认假设：

- 公开仓库继续使用 `https://github.com/StarKirbyyy/SEcode`，不迁移仓库。
- 视频文件名使用 `SEcode-demo.mp4`。
- 表单始终由用户本人提交。
- 未明确允许安装 ffmpeg/ffprobe 时，不安装系统软件或项目依赖。

## 18. 反思与规格修正

### 18.1 观察带来的修正

1. 原计划只写“公开仓库、README.txt、视频”，但原 PDF 还要求 ZIP 仅含两个文件、按姓名命名；本 Spec 将 ZIP 内容和命名提升为独立门禁。
2. 原计划说最终做秘密扫描，但仓库安全测试本身包含假 `sk-*`/Bearer 夹具；因此使用语义白名单审计，而不是错误要求所有模式计数为零。
3. 当前远端公开但只到阶段 13；“公开”不等于“最终代码已发布”，本 Spec 将本地通过、远端发布和表单提交分成三种独立事实。
4. 视频不仅要展示 UI，还必须展示真实编程任务；因此选择真实 DeepSeek + 隔离 fixture，并保留测试失败到转绿的事件证据。
5. 本机没有 ffprobe；本 Spec 不擅自安装工具，先定义 macOS 元数据与完整播放验证，并保留可选交叉验证。
6. commit/push 和表单提交属于外部状态变化；阶段文档审批不能隐式扩大为发布授权。

### 18.2 与既有阶段的关系

- 不修改阶段 12 的 LongCat 范围豁免。
- 不改变阶段 13 API 契约和阶段 14 UI/视觉事实。
- 阶段 14 的 739 tests、14 E2E 和 package/lock hash 是观察基线；阶段 15 实施后仍需完整重跑。
- 若最终文档暴露产品实现与已批准文档存在实质冲突，必须先记录并回到相应规格，而不是在 README 中选择性隐瞒。

## 19. Spec 内部门禁与审批请求

- [x] 原 PDF 两页已完整视觉检查，截止时间和三项交付物已逐项映射。
- [x] 既有流程、需求、阶段 12/14 证据和当前仓库状态已观察。
- [x] 当前公开仓库、提交历史、未提交变化和工具可用性已记录。
- [x] README.md、README.txt、视频、ZIP、Git 发布和表单边界已分别规格化。
- [x] 真实演示、秘密、LongCat、工作区隔离和截止风险已定义。
- [x] 验收标准可测试，失败与回退策略已定义。
- [x] 本轮没有实施业务、交付、发布或表单动作。

**历史结论：本草稿已被后续流程修订取代，不再接受审批。**

不得基于本草稿生成 Task。未来阶段 16 必须在新 UI 基线完成后重新观察 README、视频脚本、测试证据、远端状态和提交材料。
