# 阶段 28 Task：README.txt、视频核验、ZIP 与最终提交

> **状态：被 Spec 修订 1 取代，未获有效实施授权。** 用户于 2026-08-31 回复“批准”时同时把范围收窄为只提供 README.txt，并明确视频与 ZIP 由用户自行处理。该变更触发 Spec 回退，本 Task 不再可执行；不得据此创建 README.txt、处理视频、修改 `.gitignore`、生成 ZIP 或执行 Git 写入。

## 1. 批准基线与待补输入

- 前置 Summary：[阶段 27 Summary](./27-project-readme-summary.md)，用户于 2026-08-31 明确批准。
- 批准 Spec：[阶段 28 Spec](./28-final-delivery-spec.md)，用户于 2026-08-31 明确回复“批准，我需要一份README.txt”。
- 本 Task 覆盖：`NFR-007`、`NFR-008`、`SEC-006`、`SEC-008`、`COM-001`～`COM-008`，以及 `AC28-01`～`AC28-10`。
- 实施前仍需用户提供：演示视频的精确绝对路径、ZIP 使用的精确姓名。
- 默认决策：视频不符合 MP4、120 秒、200,000,000 bytes 或隐私要求时停止并请用户提供修正版，不自动转码、裁剪、覆盖或删除原件。
- Task 审批不授权 Git commit/push；完成本地门禁后必须再次取得独立授权。

## 2. 实施原则

1. 先产出用户明确需要的根 `README.txt`，再处理视频与 ZIP；视频输入缺失不得阻止 README.txt 的完成。
2. 只读取用户明确提供的单个视频路径，不搜索整个 Home 或其他个人目录。
3. 视频原件只读；复制前后分别计算 SHA-256，原件哈希必须保持一致。
4. `delivery/` 只存本地交付副本且必须被 Git 忽略；视频、ZIP 和交付目录不得被跟踪或暂存。
5. 所有结论以真实命令结果和用户人工确认为准；元数据不足时标记证据不足，不推断通过。
6. 不读取 `.env.local`，不调用真实 provider，不在文档、日志、视频或 ZIP 中保留凭据。
7. Git commit/push、发布、部署和最终表单提交不随本 Task 自动授权。

## 3. 依赖顺序与停止点

```text
T28-00 审批、工作区与输入基线
  → T28-01 创建并核验 README.txt
  → T28-02 建立 ignored 本地交付目录
  → T28-03 视频机器核验与人工确认 checkpoint
  → T28-04 复制视频、生成 ZIP 与哈希复核
  → T28-05 全量工程、浏览器、安全与 Git 门禁
  → T28-06 最终清单与本地交付 checkpoint
  → 用户独立授权 Git commit/push
  → T28-07 普通前进式提交、push 与匿名远端核验
  → T28-08 Summary 与最终停止点
```

若视频路径或 ZIP 姓名尚未提供，T28-00、T28-01 和 T28-02 可以完成，随后必须停在 T28-03，不得猜测个人文件路径或姓名。若本地交付全部完成但没有 Git 写入授权，则停在 T28-06，不得生成宣称远端完成的成功 Summary。

## 4. 任务清单

### T28-00：审批、工作区与输入基线

**允许修改：**

- `docs/development/28-final-delivery-tasks.md` 的实施记录

**步骤：**

1. 运行 `git status --short`，识别并保留现有文档修改，不 reset、stash 或覆盖用户内容。
2. 读取 `.gitignore`、`README.md`、`package.json`、`.env.example`、阶段 28 Spec 和阶段 27 Summary 的交付相关事实。
3. 记录 `HEAD`、`origin/main` 和当前分支，但不 fetch、pull、commit 或 push。
4. 接收并逐字记录于本地实施上下文而非公开文档：视频绝对路径、ZIP 精确姓名；公开文档只记录脱敏文件名。
5. 若输入缺失，明确把 T28-03 标记为等待用户输入，不自行搜索个人目录。

**完成条件：** 审批范围、已有修改、输入状态和 Git 基线清楚；没有越界读取或写入。

### T28-01：创建并核验根 README.txt

**允许新增/修改：**

- `README.txt`
- `docs/development/28-final-delivery-tasks.md` 的实施记录

**步骤：**

1. 创建 UTF-8、LF 换行的纯文本 `README.txt`，不使用 Markdown 表格、HTML、ANSI 控制符或图片。
2. 内容按简洁顺序覆盖：项目名称与定位、公开 HTTPS 仓库、Node/pnpm 要求、配置、Web/Terminal 最短启动、核心特色、安全与 provider 限制。
3. 命令和环境变量必须与 `package.json`、`.env.example`、当前 CLI 和根 README 一致；不复制真实 Key、endpoint、用户名、绝对路径、Session ID 或日志。
4. 统计总 Unicode code points、汉字数和 UTF-8 bytes；code points 必须 `<=1000`，目标 `<=900`。
5. 检查 UTF-8 解码、LF、NUL/控制字符、尾部换行、公开 URL、命令事实和秘密/路径模式。
6. 运行 `git diff --check -- README.txt` 并人工通读，修正文案错误后重跑全部专项检查。

**完成条件：** `AC28-01` 通过；README.txt 独立可读、长度合规、事实准确且无秘密。

### T28-02：建立 ignored 本地交付目录

**允许新增/修改：**

- `.gitignore`
- `delivery/README.txt`（ignored 本地副本）
- `docs/development/28-final-delivery-tasks.md` 的实施记录

**步骤：**

1. 在 `.gitignore` 增加根级 `/delivery/`，不扩大到其他同名目录。
2. 确认 `git check-ignore -v delivery/` 命中新增规则后创建 `delivery/`。
3. 把根 README.txt 复制为 `delivery/README.txt`，对两者计算 SHA-256 并确认一致。
4. 使用 `git status --short --ignored`、`git ls-files delivery` 和 staged 检查确认本地交付物未被跟踪或暂存。

**完成条件：** `AC28-04` 的 ignore 边界成立；README.txt 副本一致，delivery 内容没有进入 Git tracked/staged set。

### T28-03：视频机器核验与人工确认 checkpoint

**允许读取：**

- 用户明确提供的单个视频绝对路径

**允许修改：**

- `docs/development/28-final-delivery-tasks.md` 的脱敏实施记录
- 后续 `docs/delivery/final-submission-checklist.md` 的脱敏证据草稿

**步骤：**

1. 验证路径存在、是普通文件且不是符号链接；不枚举父目录或其他个人文件。
2. 在任何复制前记录原件 SHA-256、bytes、扩展名和 `file` 结果。
3. 使用 `mdls` 读取系统可提供的 duration、dimensions、codecs/content type；duration 必须 `<=120.0s`，bytes 必须 `<=200,000,000`，容器必须支持 MP4 结论。
4. 若元数据为空、格式不符、超时长或超体积，立即停止视频/ZIP 流程并报告，不安装工具或自动处理原件。
5. 请用户确认已完整播放并检查：画面/音频正常、真实展示编程任务、没有 Key/Cookie/私有 endpoint/通知/敏感路径/私人仓库/私有推理。
6. 用户未提供明确人工确认前，标记 `AC28-03` 未通过，不进入最终成功交付。

**完成条件：** `AC28-02` 的机器证据成立，`AC28-03` 有用户人工确认；视频原件仍未改变。

### T28-04：复制视频、生成 ZIP 与哈希复核

**允许新增/修改：**

- `delivery/SEcode-demo.mp4`（ignored）
- `delivery/<用户精确姓名>.zip`（ignored）
- `docs/development/28-final-delivery-tasks.md` 的脱敏实施记录

**步骤：**

1. 仅在 T28-03 通过后把视频复制为 `delivery/SEcode-demo.mp4`，不移动、重命名或覆盖原件。
2. 比较原件与副本 SHA-256 和 bytes；再次计算原件 SHA-256，确认操作前后不变。
3. 使用显式文件列表创建 `<用户精确姓名>.zip`，ZIP 根目录只放 `README.txt` 和 `SEcode-demo.mp4`。
4. 使用 `zipinfo -1` 验证恰好两个根条目，无目录、隐藏文件、`__MACOSX` 或额外元数据。
5. 解压到 `mktemp -d` 创建的临时目录并复核 README、视频哈希；不使用仓库或用户目录作为解压覆盖目标。
6. 记录 ZIP SHA-256、bytes 和最终文件名；再次确认 delivery 全部 ignored、未 tracked、未 staged。

**完成条件：** `AC28-05` 通过，原件与视频副本一致，ZIP 内容和解压哈希准确。

### T28-05：全量工程、浏览器、安全与 Git 门禁

**允许修改：**

- 仅修正本阶段文档或 README.txt 发现的问题；业务代码失败必须停止并报告，不在本交付阶段擅自修复
- `docs/development/28-final-delivery-tasks.md` 的实施记录

**步骤：**

1. 依次运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:coverage`、`pnpm test:e2e`。
2. 使用相互隔离的构建目录连续运行两次 `pnpm build`，确认 production build 可重复通过。
3. 按仓库规则启动真实本地环境并使用 agent-browser 检查首页、新任务入口、工作区选择、Session/运行主路径、控制台错误和关键响应式布局；不调用真实 provider。
4. 运行 `git diff --check`，并核对工作区修改只落在批准范围。
5. 扫描 tracked 工作树、README.txt、delivery README 和 ZIP 条目中的秘密模式、真实绝对路径、UUID、Cookie/Bearer/API Key；不读取 `.env.local` 值。
6. 核对视频和 ZIP 不在 `git ls-files`、staged 或待提交 diff 中；核对没有截止后提交、force-push、rebase、squash 或历史改写动作。
7. 任一门禁失败都记录真实症状；文档问题可在范围内修正并重跑，业务/测试问题则停止并请求新授权。

**完成条件：** `AC28-06`、`AC28-07` 通过，实际测试数量、coverage、build 和 agent-browser 结果有记录。

### T28-06：最终清单与本地交付 checkpoint

**允许新增/修改：**

- `docs/delivery/final-submission-checklist.md`
- `docs/development/28-final-delivery-tasks.md` 的实施记录
- `docs/development/README.md` 的阶段状态

**步骤：**

1. 创建最终提交清单，记录 README.txt 计数、视频与 ZIP 的脱敏元数据/SHA-256、ZIP 条目、全部门禁、当前 Git 基线和用户仍需提交表单。
2. 清单不得写入用户视频绝对路径、真实姓名以外的个人信息、凭据、私有 endpoint 或日志内容。
3. 更新阶段索引为“本地交付完成，等待 Git 独立授权”，但不写成阶段完成。
4. 向用户提供本地 ZIP 的绝对可点击路径和核验摘要，并立即停止等待 Git commit/push 授权。

**完成条件：** `AC28-10` 的本地部分完整；未执行任何 Git 写入或远端操作。

### T28-07：普通前进式提交、push 与匿名远端核验

**前置授权：** 用户在 T28-06 后明确授权具体的 Git commit/push。本 Task 审批本身不满足此前置条件。

**允许 Git 写入：**

- 只提交已批准的 tracked 文档、`README.txt` 和 `.gitignore`
- 只向现有 `main` 执行普通前进式 push

**步骤：**

1. 在北京时间 2026-09-02 24:00 前重新核对 staged 文件清单，确保不含 `delivery/`、视频、ZIP、`.env.local`、数据或测试产物。
2. 创建普通 commit；禁止 amend、rebase、squash、force-push 或改写已推送历史。
3. push 到现有远端 `main`，记录最终 commit SHA；若权限、网络或分支状态异常则停止，不采取绕过措施。
4. 使用匿名 HTTPS 核验仓库可公开访问，最终 commit、根 README.md 与 README.txt 可见且仓库 URL 一致。
5. 若匿名核验失败，记录失败并停在阻塞状态，不宣称远端交付完成。

**完成条件：** `AC28-08`、`AC28-09` 通过；远端历史前进且公开页面真实可见。

### T28-08：Summary 与最终停止点

**允许新增/修改：**

- `docs/development/28-final-delivery-summary.md`
- `docs/development/README.md`
- `docs/development/28-final-delivery-tasks.md` 的最终实施记录

**步骤：**

1. 生成阶段 28 Summary，如实区分 README.txt、本地 ZIP、自动门禁、人工视频确认、Git push、匿名核验和用户表单动作的完成状态。
2. 记录所有失败、修正、重跑、证据不足和未执行项；不把用户尚未提交的表单写成完成。
3. 更新索引为“Summary 待用户审批”并立即停止。
4. 用户批准 Summary 后，项目工程交付可标记完成；最终表单仍由用户本人提交。

**完成条件：** Summary 与真实证据一致，没有越过用户审批或表单边界。

## 5. 验收追踪

| Spec 验收 | Task |
| --- | --- |
| AC28-01 | T28-01、T28-02、T28-05 |
| AC28-02 | T28-03、T28-04 |
| AC28-03 | T28-03 |
| AC28-04 | T28-02、T28-04、T28-05 |
| AC28-05 | T28-04 |
| AC28-06 | T28-05 |
| AC28-07 | T28-05、T28-07 |
| AC28-08 | T28-06、T28-07 |
| AC28-09 | T28-07 |
| AC28-10 | T28-06～T28-08 |

## 6. 预期 tracked 文件范围

Task 实施与最终 Git checkpoint 最多涉及：

```text
.gitignore
README.txt
docs/delivery/final-submission-checklist.md
docs/development/00-process.md
docs/development/27-project-readme-summary.md
docs/development/28-final-delivery-spec.md
docs/development/28-final-delivery-tasks.md
docs/development/28-final-delivery-summary.md
docs/development/README.md
```

仅本地且必须 ignored：

```text
delivery/README.txt
delivery/SEcode-demo.mp4
delivery/<用户精确姓名>.zip
```

若验证发现需要修改 Production、测试、依赖、配置或上述范围外文件，立即停止并回到 Spec/Task 修订。

## 7. 不执行

- 不搜索用户整个 Home，不读取未明确提供的视频或个人文件。
- 不安装 ffmpeg/ffprobe，不自动转码、裁剪、降码率、覆盖或删除视频原件。
- 不读取 `.env.local`，不调用真实 provider，不记录模型私有推理。
- 不将视频、ZIP、delivery、真实日志、凭据或本地数据提交到 Git。
- 不执行 force-push、rebase、squash、amend、release 或部署。
- 不代替用户填写或提交最终表单。
- 不把 Task 审批解释为 Git commit/push 的独立授权。

## 8. 失败与回退策略

- README.txt 超限或事实不符：在 T28-01 范围内修正并完整重跑专项检查。
- 视频输入缺失：完成 README.txt 后停在 T28-03，向用户索取精确路径与姓名。
- 视频格式、时长、体积或隐私不合格：阻断复制和 ZIP，保留原件，请用户提供修正版。
- `mdls` 证据不足：记录限制并要求 QuickTime 信息面板与完整播放确认，不伪造 codec/duration。
- ZIP 条目或哈希不符：删除本轮新建的本地 ZIP 后使用显式两文件列表重新生成；不删除源文件。
- 工程门禁失败：文档问题在范围内修复；业务代码或测试问题停止并申请新的阶段授权。
- Git 或匿名远端核验失败：停止并报告，不 force、不重写历史、不声称完成。
- 截止时间已过：禁止 push，只交付本地状态和阻塞说明。

## 9. Task 审批

**当前状态：被 Spec 修订 1 取代，未获有效实施授权。**

- 用户原回复同时包含批准与实质范围收窄，不能视为对本 Task 原范围的实施授权。
- 视频核验、ZIP、delivery、`.gitignore`、全量交付门禁和 Git 写入全部移出 Codex 当前交付范围。
- 后续以 [阶段 28 Spec 修订 1](./28-final-delivery-spec.md) 及其获批后生成的 Task 修订 1 为准。
