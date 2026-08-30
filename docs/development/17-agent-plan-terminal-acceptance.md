# 阶段 17：Plan Mode 终端人工验收

## 1. 当前门禁

- 对应 Spec：[`17-agent-orchestration-plan-mode-spec.md`](./17-agent-orchestration-plan-mode-spec.md) 修订 6（已批准）。
- 对应 Task：[`17-agent-orchestration-plan-mode-tasks.md`](./17-agent-orchestration-plan-mode-tasks.md) 修订 7（已批准并实施）。
- 当前实现范围：T17-00～T17-14 及 R2～R6。
- 历史终端门禁：用户已分别通过原 Plan Mode、中文化和中文输出强制人工验收；对应记录保留在下文。
- 当前状态：R6-06 真实 LongCat 回归已完成事实记录，`AC17-31` / `AC17-36` 总体未通过；Summary 修订 6 已于 2026-08-29 获用户批准。
- 当前门禁：阶段 17 已完成，阶段 18 只读观察与 Spec 已解锁；阶段 18 Spec 获批前禁止生成 Task 或修改产品代码。

本文默认使用只监听 `127.0.0.1` 的确定性假模型，不需要 API Key，不连接外网，不修改真实项目。所有文件与 JSONL 均写入本次自动创建的系统临时目录。

## 2. 验收目标

人工确认以下事实：

1. Plan Mode 默认关闭，用户可在空闲时用 `/plan on|off` 选择下一任务模式。
2. 开启后 Agent 只能读取项目，生成完整计划并进入 `awaiting_plan_approval`。
3. 等待批准时工作区总哈希不变，且目标文件不存在。
4. `/approve-plan` 后同一 run 自动继续，写入文件、运行测试并最终完成。
5. `/reject-plan` 后运行取消，拒绝前后的工作区总哈希相同。
6. `/status` 分别显示 phase、模型请求计数/上限、工具调用计数/上限。
7. `/approve` 与 `/reject` 仍只用于危险工具审批，不会批准计划。
8. Plan Mode 关闭时直接执行正常流程，不出现 `plan.proposed` 或计划审批等待。

## 3. 准备三个终端

### 3.1 终端 A：启动确定性假模型

```bash
cd /Users/starkirby/Codes/secode
pnpm exec tsx tests/manual/openai-compatible-server.ts
```

保持终端 A 运行。它会输出四行配置，例如：

```text
OPENAI_COMPAT_BASE_URL=http://127.0.0.1:<随机端口>/v1
OPENAI_COMPAT_MODEL=secode-stage12-fixture
OPENAI_COMPAT_CONTEXT_WINDOW=14000
OPENAI_COMPAT_SUPPORTS_THINKING=false
```

### 3.2 终端 B：创建临时 fixture

```bash
cd /Users/starkirby/Codes/secode
SECODE_STAGE17_ROOT="$(pnpm exec tsx tests/manual/stage17-fixture.ts create)"
export SECODE_STAGE17_ROOT
printf '%s\n' "$SECODE_STAGE17_ROOT"
```

输出必须是位于系统临时目录、名称以 `secode-stage17.` 开头的绝对路径。不要把该变量手工改成其他目录。

把终端 A 输出的真实随机端口填入并执行：

```bash
export OPENAI_COMPAT_BASE_URL="http://127.0.0.1:<随机端口>/v1"
export OPENAI_COMPAT_MODEL="secode-stage12-fixture"
export OPENAI_COMPAT_CONTEXT_WINDOW="14000"
export OPENAI_COMPAT_SUPPORTS_THINKING="false"
```

不要设置或打印真实 API Key。然后启动 SEcode：

```bash
pnpm agent -- \
  --workspace "$SECODE_STAGE17_ROOT/workspace" \
  --model generic \
  --data-dir "$SECODE_STAGE17_ROOT/data" \
  --title "Stage 17 Plan Mode 人工验收"
```

### 3.3 终端 C：定义只读工作区哈希命令

```bash
cd /Users/starkirby/Codes/secode
export SECODE_STAGE17_ROOT="<复制终端 B 输出的绝对临时根>"

stage17_tree_hash() {
  find "$SECODE_STAGE17_ROOT/workspace" -type f -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 shasum -a 256 \
    | shasum -a 256 \
    | awk '{print $1}'
}

STAGE17_INITIAL_HASH="$(stage17_tree_hash)"
printf 'initial=%s\n' "$STAGE17_INITIAL_HASH"
```

## 4. 用例 A：开启、只读规划与状态

在终端 B 的 SEcode 交互界面逐行输入：

```text
/plan on
请按 README 要求创建验收标记文件并运行测试。
```

预期：

- 显示 `Plan Mode 已开启`。
- `run.started` 显示 `Plan Mode on`、模型请求上限 60、工具调用上限 120。
- 规划阶段只调用一次 `read_file README.md`。
- 随后显示包含目标、观察事实、文件、任务顺序、逐步验证、风险和不执行项的完整计划。
- 显示 `/approve-plan` 与 `/reject-plan` 提示，但不出现 `write_file`、`run_process` 或工具审批。

在终端 B 输入：

```text
/status
```

预期状态类似：

```text
awaiting_plan_approval；phase=awaiting_plan_approval；模型请求 2/60；工具调用 1/120
```

此时在终端 C 执行：

```bash
STAGE17_PENDING_HASH="$(stage17_tree_hash)"
printf 'initial=%s\npending=%s\n' "$STAGE17_INITIAL_HASH" "$STAGE17_PENDING_HASH"
test "$STAGE17_INITIAL_HASH" = "$STAGE17_PENDING_HASH"
test ! -e "$SECODE_STAGE17_ROOT/workspace/notes/plan-result.txt"
```

两个 `test` 都必须退出 0，证明批准前零写入。

## 5. 用例 B：批准后同一 run 执行

记录终端 B 当前显示的 run 短 ID，然后输入：

```text
/approve-plan 允许临时验收计划
```

预期按顺序出现：

1. `plan.approval.resolved` 对应的“已批准，继续同一运行”。
2. 仍是原 run，不创建新 Session，不要求再次输入任务。
3. 第 3 次模型请求调用 `write_file notes/plan-result.txt`。
4. 第 4 次模型请求调用 `run_process`，参数为 `pnpm test`。
5. 测试输出 `pass 1`、`fail 0`，退出码 0。
6. 第 5 次模型请求返回最终总结，随后 `run.completed`。

在终端 C 验证：

```bash
test "$(cat "$SECODE_STAGE17_ROOT/workspace/notes/plan-result.txt")" = "stage17 approved execution"
STAGE17_APPROVED_HASH="$(stage17_tree_hash)"
test "$STAGE17_APPROVED_HASH" != "$STAGE17_PENDING_HASH"
```

## 6. 用例 C：拒绝计划且零执行

终端 B 中 Plan Mode 仍为 on。输入：

```text
请再次提出同类计划，但不要直接执行。
```

等待新计划进入审批状态。在终端 C 记录：

```bash
STAGE17_BEFORE_REJECT_HASH="$(stage17_tree_hash)"
```

回到终端 B 输入：

```text
/reject-plan 演示拒绝
```

等待出现 `运行已取消：用户拒绝执行计划` 后，再在终端 C 执行：

```bash
STAGE17_AFTER_REJECT_HASH="$(stage17_tree_hash)"
printf 'before=%s\nafter=%s\n' "$STAGE17_BEFORE_REJECT_HASH" "$STAGE17_AFTER_REJECT_HASH"
test "$STAGE17_BEFORE_REJECT_HASH" = "$STAGE17_AFTER_REJECT_HASH"
```

拒绝后不得出现该 run 的写工具、进程工具或工具审批。

## 7. 用例 D：关闭 Plan Mode 的正常流程

必须等待上一 run 已显示 cancelled，再在终端 B 输入：

```text
/plan off
/status
请只读取 README 并总结，不要修改文件。
```

预期：

- 显示 `Plan Mode 已关闭`，空闲状态显示 `Plan Mode off`。
- 新 run 直接调用 `read_file README.md`，随后最终完成。
- 不显示完整计划、`plan.proposed`、`/approve-plan` 或 `awaiting_plan_approval`。

## 8. 清理

在终端 B 输入：

```text
/exit
```

在终端 A 按 `Ctrl+C` 停止假模型。最后在普通 shell 中执行：

```bash
cd /Users/starkirby/Codes/secode
pnpm exec tsx tests/manual/stage17-fixture.ts clean "$SECODE_STAGE17_ROOT"
test ! -e "$SECODE_STAGE17_ROOT"
unset SECODE_STAGE17_ROOT
unset OPENAI_COMPAT_BASE_URL OPENAI_COMPAT_MODEL
unset OPENAI_COMPAT_CONTEXT_WINDOW OPENAI_COMPAT_SUPPORTS_THINKING
```

清理器会重新验证：目标是非符号链接真实目录、位于系统临时根、目录名前缀正确、内部身份 marker 内容完全匹配。任一验证失败都会拒绝删除。

## 9. 可选真实 DeepSeek 冒烟

确定性验收通过后，可在另一个新临时 fixture 上使用真实 DeepSeek。只确认变量是否存在，不打印值：

```bash
if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "DEEPSEEK_API_KEY=set"
else
  echo "DEEPSEEK_API_KEY=missing"
fi
```

使用 `--model deepseek` 启动后，重复用例 A～D。模型输出内容允许不同，但安全状态、审批顺序、同 run、计数和哈希要求必须相同。真实凭据测试不是自动质量门禁；LongCat 继续按用户已确认的“暂无端点”处理。

## 10. 已完成的内部验证

- 专项：40 个测试文件、289 项测试通过。
- 全量：104 个测试文件、792 项测试通过。
- `pnpm typecheck`：通过。
- `pnpm agent -- --help`：通过，帮助包含全部 Plan Mode 命令。
- 确定性 CLI 实测：只读规划、pending 状态、批准后写入/测试/final、拒绝零变化均通过。
- 实测批准前目标文件不存在；拒绝前后树哈希均为 `f0aaa08f6814700e06d89333705ae3b70c8f5c0761894db110dd5e430d22d85b`。
- 实测临时 fixture 已由身份校验清理器删除。

## 11. 用户验收回复

用户于 2026-08-28 回复：

```text
阶段17终端人工验收通过
```

因此本节门禁已满足，后续 HTTP/Client/Web 工作可按已批准 Task 开始。

全部通过后，请明确回复：

```text
阶段17终端人工验收通过
```

若失败，请提供：用例编号、完整结构化错误码、从对应 run 开始到终态的终端输出，以及哈希是否变化。不要粘贴 API Key。收到通过回复后，才允许开始 T17-10 的 HTTP/Client/Web 工作。

## 12. 修订 2：中文模型上下文人工验收目标

本节是阶段 17 修订 2 的新增门禁，不取代前述已通过的 Plan Mode 原验收。需要确认：

1. 正常、规划和批准执行阶段的模型回答默认使用中文。
2. 工具协议名和参数键仍为英文，例如 `read_file`、`path`、`startLine`。
3. Plan Mode 计划正文和最终总结为中文，批准后仍在同一个 run 执行。
4. 工具错误摘要为中文，Agent 能改变参数后重试。
5. README 英文原文、路径、命令、哈希和 stdout/stderr 不被翻译或改写。
6. System Prompt、工具 descriptions 和参数 descriptions 不出现在事件、终端日志或用户输出中。

自动测试已经捕获真实传给 OpenAI-compatible endpoint 的请求，并确认中文工具说明到达 wire。本人工步骤只检查用户可观察行为，不要求显示或泄露 System Prompt。

## 13. 修订 2：准备三个终端

### 13.1 终端 A：启动中文 Phase 确定性假模型

```bash
cd /Users/starkirby/Codes/secode
pnpm exec tsx tests/manual/openai-compatible-server.ts
```

保持运行，并记录它输出的随机 `OPENAI_COMPAT_BASE_URL`。不得把真实 API Key 传给该本地假模型。

### 13.2 终端 B：创建全新临时工作区并启动 SEcode

```bash
cd /Users/starkirby/Codes/secode
SECODE_STAGE17_R2_ROOT="$(pnpm exec tsx tests/manual/stage17-fixture.ts create)"
export SECODE_STAGE17_R2_ROOT
printf '%s\n' "$SECODE_STAGE17_R2_ROOT"
```

把终端 A 的真实随机端口填入：

```bash
export OPENAI_COMPAT_BASE_URL="http://127.0.0.1:<随机端口>/v1"
export OPENAI_COMPAT_MODEL="secode-stage12-fixture"
export OPENAI_COMPAT_CONTEXT_WINDOW="14000"
export OPENAI_COMPAT_SUPPORTS_THINKING="false"

pnpm agent -- \
  --workspace "$SECODE_STAGE17_R2_ROOT/workspace" \
  --model generic \
  --data-dir "$SECODE_STAGE17_R2_ROOT/data" \
  --title "Stage 17 中文模型上下文验收"
```

### 13.3 终端 C：只读观察工作区

```bash
cd /Users/starkirby/Codes/secode
export SECODE_STAGE17_R2_ROOT="<复制终端 B 输出的临时根目录>"

stage17_r2_tree_hash() {
  find "$SECODE_STAGE17_R2_ROOT/workspace" -type f -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 shasum -a 256 \
    | shasum -a 256 \
    | awk '{print $1}'
}

STAGE17_R2_INITIAL_HASH="$(stage17_r2_tree_hash)"
printf 'initial=%s\n' "$STAGE17_R2_INITIAL_HASH"
```

## 14. 修订 2 用例 A：正常模式中文回答与英文事实保真

在终端 B 输入：

```text
/plan off
必须只读取 README.md 并总结约束，不要修改文件。最终使用中文回答；README 标题、文件路径和命令必须保持原样。
```

预期：

- 工具请求仍显示英文协议名 `read_file`，参数键为 `path/startLine`。
- 工具结果原样显示英文标题 `# Stage 17 terminal fixture`、`notes/plan-result.txt`、`pnpm test` 等事实。
- 最终回答为中文；不得把文件名、路径或命令翻译成中文。
- 不出现计划审批，不修改工作区。

终端 C 验证：

```bash
test "$STAGE17_R2_INITIAL_HASH" = "$(stage17_r2_tree_hash)"
```

## 15. 修订 2 用例 B：中文计划、同 run 执行与中文总结

在终端 B 输入：

```text
/plan on
请按 README 要求创建验收标记文件并运行测试。
```

预期：

1. 规划阶段调用英文协议工具 `read_file`，工具输出保留 README 英文原文。
2. 完整计划使用中文，包含目标、事实、文件、任务顺序、验证、风险和不执行项。
3. 等待阶段无 `write_file` 或 `run_process`，工作区哈希不变。

终端 C 验证等待阶段：

```bash
STAGE17_R2_PENDING_HASH="$(stage17_r2_tree_hash)"
test "$STAGE17_R2_INITIAL_HASH" = "$STAGE17_R2_PENDING_HASH"
test ! -e "$SECODE_STAGE17_R2_ROOT/workspace/notes/plan-result.txt"
```

回到终端 B：

```text
/approve-plan 允许中文上下文验收计划
```

预期：

- 同一个 run 进入批准执行阶段，不要求再次输入任务。
- 依次使用 `write_file` 和 `run_process`，参数键和 `pnpm test` 保持英文原样。
- 测试 stdout 保持原始格式，显示通过且退出码为 0。
- 最终总结使用中文，并准确报告英文路径 `notes/plan-result.txt` 与命令 `pnpm test`。

终端 C 验证：

```bash
test "$(cat "$SECODE_STAGE17_R2_ROOT/workspace/notes/plan-result.txt")" = "stage17 approved execution"
test "$STAGE17_R2_PENDING_HASH" != "$(stage17_r2_tree_hash)"
```

## 16. 修订 2 用例 C：真实 DeepSeek 的错误修正（建议执行）

确定性假模型保持固定成功轨迹，不主动生成错误参数。要人工观察模型利用中文参数说明自行修正，先退出终端 B 中的 generic Session，再创建一个全新临时 fixture，并使用已验证有效的 DeepSeek 配置启动：

```bash
if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "DEEPSEEK_API_KEY=set"
else
  echo "DEEPSEEK_API_KEY=missing"
fi

SECODE_STAGE17_R2_DEEPSEEK_ROOT="$(pnpm exec tsx tests/manual/stage17-fixture.ts create)"
export SECODE_STAGE17_R2_DEEPSEEK_ROOT
stage17_r2_deepseek_hash() {
  find "$SECODE_STAGE17_R2_DEEPSEEK_ROOT/workspace" -type f -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 shasum -a 256 \
    | shasum -a 256 \
    | awk '{print $1}'
}
STAGE17_R2_DEEPSEEK_BEFORE="$(stage17_r2_deepseek_hash)"

pnpm agent -- \
  --workspace "$SECODE_STAGE17_R2_DEEPSEEK_ROOT/workspace" \
  --model deepseek \
  --data-dir "$SECODE_STAGE17_R2_DEEPSEEK_ROOT/data" \
  --title "Stage 17 中文工具错误验收"
```

不要输出 Key 值。在 SEcode 中输入：

```text
第一次必须调用 read_file，参数 path="README.md"、startLine=1、endLine=9007199254740991；若收到行范围错误，只允许再调用一次 read_file，重试时省略 endLine。不要修改文件，最终用中文报告 SHA-256。
```

预期：

- 第一次工具调用结构化失败，错误摘要为中文。
- 第二次不再用极大行号，省略 `endLine` 后读取到文件末尾。
- 最终回答为中文，并原样报告 64 位 SHA-256。
- 两次调用都使用英文工具名和参数键；工作区哈希不变。

退出该 DeepSeek Session 后验证：

```bash
test "$STAGE17_R2_DEEPSEEK_BEFORE" = "$(stage17_r2_deepseek_hash)"
```

如果没有可用 DeepSeek 凭据，可跳过本用例，但回复验收结果时必须注明“用例 C 因无凭据跳过”。中文错误和窄化重试仍有自动测试保护。

## 17. 修订 2 清理

在所有 SEcode 终端输入 `/exit`，终端 A 按 `Ctrl+C`。随后执行：

```bash
cd /Users/starkirby/Codes/secode
pnpm exec tsx tests/manual/stage17-fixture.ts clean "$SECODE_STAGE17_R2_ROOT"
test ! -e "$SECODE_STAGE17_R2_ROOT"
if [[ -n "${SECODE_STAGE17_R2_DEEPSEEK_ROOT:-}" ]]; then
  pnpm exec tsx tests/manual/stage17-fixture.ts clean "$SECODE_STAGE17_R2_DEEPSEEK_ROOT"
  test ! -e "$SECODE_STAGE17_R2_DEEPSEEK_ROOT"
fi
unset SECODE_STAGE17_R2_ROOT
unset SECODE_STAGE17_R2_DEEPSEEK_ROOT
unset OPENAI_COMPAT_BASE_URL OPENAI_COMPAT_MODEL
unset OPENAI_COMPAT_CONTEXT_WINDOW OPENAI_COMPAT_SUPPORTS_THINKING
```

如执行了 DeepSeek 用例，只取消变量导出，不打印变量值。

## 18. 修订 2 用户验收回复

用例 A、B 和清理全部通过后，请回复：

```text
阶段17修订2终端人工验收通过
```

若用例 C 因无凭据跳过，请同时注明。若失败，请提供用例编号、结构化错误码、该 run 的完整终端输出以及工作区哈希是否变化，不要粘贴 API Key。

收到上述通过回复后，才允许执行 T17-R2-05 全量回归和 Summary 修订。

## 19. 修订 2 自动验证记录

```text
模型上下文、工具、Plan Mode、Terminal：16 个测试文件、82 项通过
pnpm typecheck：通过
pnpm lint：0 error；coverage 生成目录 2 条既有 warning
git diff --check：通过
应用固定英文模型文案扫描：零命中
package.json：5cf055c14f6010a41007d4b8af068720de720b28880f6d27677356e193661f13
pnpm-lock.yaml：5b4697de2b93fab4e7f755ffe4dbb0b0aa8d082d74bb6718d0c9804ec2dce683
```

自动请求捕获覆盖 normal、planning、approved execution 和 context summary；六工具 function descriptions 与 21 个 property descriptions 均从最终 OpenAI-compatible wire 结构检查。原始英文用户目标、计划正文、代码路径、命令参数和 stdout/stderr 保真断言通过。

**历史状态：修订 2 已由用户回复“验证通过”；当前验收门禁见下方修订 3。**

## 20. 修订 3：中文输出强制验收目标

本节验证真实模型输出，而不只检查 System Prompt 或工具描述。验收目标：

1. 新的计划、过程说明和最终回答固定使用简体中文。
2. 模型若返回英文 `stop` 正文，终端只显示中文拒绝状态和后续中文重述，不显示英文原文。
3. 模型若在工具调用前返回英文说明，只抑制说明；原工具调用、危险审批和副作用各发生一次。
4. 连续三次不符合中文要求时，以 `AGENT_OUTPUT_LANGUAGE_INVALID` 有限失败，不无限请求。
5. 代码、路径、命令、URL、JSON、哈希、README 原文及进程真实输出保持原样。
6. `model.output.rejected` 只记录次数、动作、字符数和 SHA-256，不记录被拒正文或私有 reasoning。

确定性假模型已经自动覆盖“先英文后中文”“三次英文”“英文工具说明”和取消轨迹；真实 DeepSeek 人工验收用于确认线上模型、终端和完整 Agent 循环协同正常。LongCat 按用户已确认的“暂无端点”继续跳过。

## 21. 修订 3：准备临时工作区

在新终端执行：

```bash
cd /Users/starkirby/Codes/secode

if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "DEEPSEEK_API_KEY=set"
else
  echo "DEEPSEEK_API_KEY=missing"
fi

SECODE_STAGE17_R3_ROOT="$(pnpm exec tsx tests/manual/stage17-fixture.ts create)"
export SECODE_STAGE17_R3_ROOT
printf 'fixture=%s\n' "$SECODE_STAGE17_R3_ROOT"

stage17_r3_tree_hash() {
  find "$SECODE_STAGE17_R3_ROOT/workspace" -type f -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 shasum -a 256 \
    | shasum -a 256 \
    | awk '{print $1}'
}

STAGE17_R3_INITIAL_HASH="$(stage17_r3_tree_hash)"
export STAGE17_R3_INITIAL_HASH
printf 'initial=%s\n' "$STAGE17_R3_INITIAL_HASH"
```

要求：

- 只检查 Key 是否存在，绝不打印 Key 内容。
- 继续使用此前已经通过 200 冒烟测试的 DeepSeek `base URL` 和模型配置；不要临时改成未经验证的模型 ID。
- 若 Key 显示 `missing`，停止并在当前 shell 正确 `export DEEPSEEK_API_KEY="实际密钥"` 后重新检查。

启动 SEcode：

```bash
pnpm agent -- \
  --workspace "$SECODE_STAGE17_R3_ROOT/workspace" \
  --model deepseek \
  --data-dir "$SECODE_STAGE17_R3_ROOT/data" \
  --title "Stage 17 修订 3 中文输出强制验收"
```

## 22. 修订 3 用例 A：普通只读任务

在 SEcode 终端输入：

```text
/plan off
只读取 README.md，说明项目约束和当前状态。不要修改文件，不要运行命令。最终回答必须保留 README.md、notes/plan-result.txt、pnpm test 等原始标识。
```

预期：

- 工具协议仍显示 `read_file`，参数键仍为 `path/startLine` 等英文稳定字段。
- README 英文正文、路径和命令保持原样。
- Agent 的过程说明和最终总结为简体中文。
- 若出现“模型输出语言不符合要求，正在请求中文重述（1/2）”，其前后都不应出现被拒绝的英文正文。
- 无 `write_file`、`replace_in_file`、`run_process` 或计划审批。

退出应用前在另一终端验证工作区未变：

```bash
test "$STAGE17_R3_INITIAL_HASH" = "$(stage17_r3_tree_hash)"
```

## 23. 修订 3 用例 B：中文 Plan Mode 与同 run 执行

在 SEcode 终端输入：

```text
/plan on
请按 README.md 要求创建验收标记文件并运行测试。
```

等待计划出现后检查：

1. 计划正文为简体中文，包含目标、事实、文件、任务顺序、验证、风险和不执行项。
2. 计划中的 `README.md`、`notes/plan-result.txt`、`pnpm test` 保持原样。
3. 计划审批前不存在 `notes/plan-result.txt`，也没有 `run_process`。
4. 若发生中文重述，英文计划原文不可见，且只出现一个 `plan.proposed`。

另一终端执行：

```bash
test ! -e "$SECODE_STAGE17_R3_ROOT/workspace/notes/plan-result.txt"
STAGE17_R3_PENDING_HASH="$(stage17_r3_tree_hash)"
test "$STAGE17_R3_INITIAL_HASH" = "$STAGE17_R3_PENDING_HASH"
```

回到 SEcode 输入：

```text
/approve-plan 允许修订3中文输出强制验收
```

预期：

- 同一个 run 自动继续，不需要再次输入任务。
- `write_file` 与 `run_process` 各按计划执行一次；危险工具若要求审批，仍使用独立 `/approve`。
- 进程通道标签为 `[标准输出]`、`[标准错误]`，真实输出内容不被翻译。
- 最终总结为简体中文，准确报告 `notes/plan-result.txt` 和 `pnpm test`。

验证：

```bash
test "$(cat "$SECODE_STAGE17_R3_ROOT/workspace/notes/plan-result.txt")" = "stage17 approved execution"
test "$STAGE17_R3_PENDING_HASH" != "$(stage17_r3_tree_hash)"
```

## 24. 修订 3 用例 C：真实工具修正与零重复

继续在同一 SEcode Session 中输入：

```text
/plan off
第一次调用 read_file 读取 README.md 时，参数必须为 path="README.md"、startLine=1、endLine=9007199254740991；若收到范围错误，只允许窄化重试一次并省略 endLine。不要修改文件，不要运行进程。最后用中文报告成功调用返回的完整 SHA-256。
```

预期：

- 第一次工具结果为中文结构化范围错误。
- 第二次 `read_file` 省略 `endLine` 并成功；总共恰好两个 `read_file`。
- 最终正文为中文，64 位 SHA-256 原样显示。
- 如工具调用前英文说明被抑制，应看到“工具将按原请求执行一次”，但不能多出第三个 `read_file`。
- 本用例前后工作区哈希相同。

验证：

```bash
STAGE17_R3_AFTER_PLAN_HASH="$(stage17_r3_tree_hash)"
# 用例 C 完成后再次执行：
test "$STAGE17_R3_AFTER_PLAN_HASH" = "$(stage17_r3_tree_hash)"
```

## 25. 修订 3 用例 D：事件脱敏与恢复

在 SEcode 输入 `/exit`，然后执行：

```bash
cd /Users/starkirby/Codes/secode

rg -n '"type":"model.output.rejected"' "$SECODE_STAGE17_R3_ROOT/data/sessions" || true
if rg -n 'I will|I inspected|The response|PRIVATE_REASONING' \
  "$SECODE_STAGE17_R3_ROOT/data/sessions"; then
    echo "发现不应持久化的英文正文" >&2
    false
fi
```

说明：第一条命令可能零命中，因为真实 DeepSeek 可能从第一次起就遵守中文要求；这不构成失败。若有拒绝事件，其 JSON 只能含 `iteration/reason/action/retryAttempt/contentCharacters/contentSha256` 等元数据，不能含原正文。

从唯一的临时 Session 目录取得明确 UUID，并使用同一个 data root 恢复：

```bash
SECODE_STAGE17_R3_SESSION_ID="$(
  find "$SECODE_STAGE17_R3_ROOT/data/sessions" -mindepth 1 -maxdepth 1 -type d \
    -exec basename {} \; | head -n 1
)"
test -n "$SECODE_STAGE17_R3_SESSION_ID"

pnpm agent -- \
  --data-dir "$SECODE_STAGE17_R3_ROOT/data" \
  --session "$SECODE_STAGE17_R3_SESSION_ID"
```

恢复后输入 `/status`，应能正常读取历史且没有英文草稿重新出现；随后 `/exit`。

## 26. 修订 3 清理

```bash
cd /Users/starkirby/Codes/secode
pnpm exec tsx tests/manual/stage17-fixture.ts clean "$SECODE_STAGE17_R3_ROOT"
test ! -e "$SECODE_STAGE17_R3_ROOT"
unset SECODE_STAGE17_R3_ROOT STAGE17_R3_INITIAL_HASH STAGE17_R3_PENDING_HASH
unset STAGE17_R3_AFTER_PLAN_HASH SECODE_STAGE17_R3_SESSION_ID
```

清理器只接受系统临时目录中带 Stage 17 身份标记的目录，不会删除真实项目。

## 27. 修订 3 用户验收回复

用例 A～D 和清理全部通过后，请明确回复：

```text
阶段17修订3终端人工验收通过
```

若失败，请提供：用例编号、稳定错误码、对应 run 从开始到终态的终端输出、工具调用次数和工作区哈希是否变化。不要粘贴 API Key、Authorization header 或 `.env` 内容。

收到通过回复前，禁止开始 T17-R3-06 的 HTTP、Client、UI、E2E、全量构建和 Summary 修订 3。

## 28. 修订 3 验收结论

- 验收状态：已通过。
- 用户确认：用户于 2026-08-29 明确回复“批准阶段17修改3”，作为第 27 节通过口令的语义等价确认。
- 解锁范围：仅解锁已批准 Task 修订 4 的 T17-R3-06；不解锁阶段 18。
- 下一门禁：完成 HTTP/Client/UI/E2E、全量回归和 Summary 修订 3 后停止等待 Summary 审批。

## 29. 修订 5：真实 LongCat 多文件回归记录

### 29.1 环境与边界

- 执行日期：2026-08-29。
- 模型：现有 `longcat` profile；仅通过 `/api/config` 确认 `configured=true`、`provider=longcat`、`contextWindow=64000`，未读取或输出 Key。
- 隔离根：系统临时目录 `secode-stage17-r5.QGZdnT`；工作区、Session JSONL 和生成项目均在该根内。
- 真实项目 `/Users/starkirby/Codes/test/web` 未使用；SEcode 产品代码和其他用户项目未被真实 Agent 修改。
- 共使用 3 个隔离 Session、5 个 run、22 次业务模型请求、51 次工具请求；2 次危险工具审批均逐项核对后批准。

### 29.2 实际轨迹

1. 首个 run 读取根 `AGENTS.md`，第一次把空路径传给 `list_directory` 得到 `TOOL_ARGUMENTS_INVALID`，下一轮改为 `path="."` 后继续，证明参数错误可修正。
2. 经独立审批执行官方模板命令：`npx create-next-app@latest login-system --typescript --tailwind --eslint --app --src-dir --import-alias @/* --use-npm --no-turbopack --no-git`。命令成功，生成 Next.js 16.3.3、App Router、TypeScript、Tailwind 和 `package-lock.json`；没有 `pnpm-lock.yaml` 或嵌套 Git 仓库。
3. Agent 读取生成的 `login-system/AGENTS.md` 和本地 Next.js 文档，但对 `authentication.md` 使用了未设 `endLine` 的整文件读取，共返回 1658 行、55785 字节；第 9 次模型请求前后以 `AGENT_CONTEXT_FAILED / CONTEXT_BUDGET_EXCEEDED` 失败。
4. 在同一 Session 提交“继续”后，run 在 0 次模型请求、0 次工具调用时立即以同一错误失败，没有取得新进展，未触发 `context.compacted` 或本地 fallback。
5. 新 Session 明确要求先做 readiness 且不要长读，Agent仍先读取源码和完整文档，第 5 次模型请求再次以同一错误失败。
6. 为单独验证工具能力，新 Session 只执行 `pnpm dev --hostname 127.0.0.1 --port 43127`。经独立审批后 readiness 在 133ms 就绪，`GET /` 返回 200，工具总耗时 2148ms，并确认服务进程已清理、43127 端口释放。模型首次英文总结被语言门拒绝一次，随后在同 run 返回中文并 `run.completed`。
7. 同一短历史 Session 再次要求实现功能且明确禁止重复读取长文档，Agent仍完整读取 1658 行认证文档、612 行数据安全文档等内容，第 5 次模型请求再次上下文失败。此时停止重试，避免重复消耗真实模型额度。

### 29.3 `AC17-31` 结论

| 条目 | 结论 | 证据 |
| --- | --- | --- |
| 1. 官方模板、App Router、TypeScript、Tailwind、npm lock | 通过 | 官方命令成功；`package-lock.json` 存在；无 `pnpm-lock.yaml` |
| 2. 业务修改前 `pnpm dev` readiness | 通过但有顺序偏差 | 业务文件始终未修改；readiness 200 且清理成功；Agent 曾在 readiness 前先读模板文档 |
| 3. 嵌套指令和本地 Next.js 文档 | 通过 | durable `read_file` 事件记录生成项目 `AGENTS.md` 及认证、Cookie、Server Actions、安全文档 |
| 4. 认证、安全边界与 HTTP/E2E | 未通过 | 未生成业务代码，无法验证注册、登录、退出、保护页面、慢哈希、HttpOnly 或身份防伪造 |
| 5. 测试数据、并发与损坏行为 | 未通过 | 未生成测试或持久化实现 |
| 6. lint、test、build 与最终总结 | 未通过 | 真实 Agent 未进入实现和最终质量命令；不得用模板 readiness 代替 |
| 7. Git 与工作区边界 | 通过 | 未执行 commit/push/deploy；仅隔离临时项目与允许的验收文档发生变化 |

最终结论：真实 LongCat 多文件回归未通过。直接阻塞是模型反复整文件读取大型本地文档，Context 在输入预算检查阶段以 `CONTEXT_BUDGET_EXCEEDED` 失败；同 Session 的“继续”在 0 次模型请求时重复失败，修订 5 的摘要 timeout/fallback 没有覆盖此路径。临时根当前保留，未默认递归删除，供 Summary 审批前复核。

## 30. 修订 6：真实 LongCat 多文件回归记录

### 30.1 环境、数量与边界

- 执行日期：2026-08-29。
- 模型：现有 `longcat` profile；未读取或输出 Key。
- 隔离根：系统临时目录 `secode-stage17-r6.8dKUoT`；工作区、Session JSONL、依赖和生成项目均在该根内。
- 共 1 个 Session、2 个 run、133 次业务模型请求、168 次工具请求、15 次 `context.compacted`、17 次危险工具审批请求；16 次获得决定，最后一次在 run 超时时仍未决。
- 两个 run 均以 `AGENT_RUN_TIMEOUT` 结束，分别使用 74/100 和 59/68 次模型请求/工具请求；事件记录的 provider `totalTokens` 累计为 4,172,421，未提供可相加的 input/output 拆分。
- 真实项目、SEcode 产品代码和其他用户工作区未被真实 Agent 修改；隔离根按 Task 要求保留，未默认删除。

### 30.2 分页、投影与恢复结果

1. Agent 对 1658 行 `authentication.md` 按 `startLine=1/201/401/601/801/1001` 连续分页，没有再次把整篇 55KiB 文档注入单个工具结果。
2. 两个 run 共完成 15 次上下文压缩，没有出现修订 5 的 `CONTEXT_BUDGET_EXCEEDED`，也没有出现失败后新 run 在 0 次模型请求立即重复失败。
3. 第一个 run 超时后，同一 Session 的第二个 run 取得 59 次新 `model.requested` 并继续修改、测试和构建，没有重复执行模板创建或首次 readiness。
4. 因此 `AC17-32`～`AC17-35` 对应的真实长历史路径获得正向证据；R5 的分页、上下文投影和同 Session 续跑阻塞已不再复现。

### 30.3 真实任务轨迹

1. 经逐项审批，Agent 使用官方 `create-next-app` 创建 Next.js 16.3.3、App Router、TypeScript、Tailwind 和 npm lock 项目，并在业务功能实现前完成 `127.0.0.1:39187` readiness 200 和进程清理。
2. Agent 读取根及生成项目指令与本地 Next.js 文档，随后实现注册、登录、退出、受保护页面、bcryptjs 12 轮密码哈希、签名 Session、HttpOnly/SameSite Cookie、本地 JSON 持久化和隔离测试数据目录。
3. 真实过程中发生多轮非零测试、lint 和 build，Agent继续修正；最终事件中 `npm run lint`、`npm test` 和 `npm run build` 均得到退出码 0。2026-08-29 的独立复核再次得到：lint 退出码 0；5 个测试文件、49 项测试通过；build 退出码 0。
4. 测试仍输出 Vite 配置 warning，build 仍输出动态文件 tracing warning。两者未造成非零退出；Agent曾在一次同时包含 TypeScript 阻塞错误和 tracing warning 的失败 build 后把两者都当成待修问题，产生非必要 warning 修正。
5. `write_file` 共出现 9 次结构化失败：4 次 `parent_not_found`、4 次 `invalid_expected_hash_semantics`、1 次一般参数校验失败。成功对照均是先确认/创建父目录，或先读取既有文件取得 SHA 后再覆盖。
6. 两个 run 最终都没有产生 `run.completed` 或合规最终总结。第二个 run 在同时请求最终 `npm test` 与 `ls` 后，测试返回成功，`ls` 等待审批期间触发总时限。

### 30.4 `AC17-31` / `AC17-36` 结论

| 条目 | 结论 | 证据 |
| --- | --- | --- |
| 官方模板、App Router、TypeScript、Tailwind、npm lock | 部分通过 | 目标技术栈和 `package-lock.json` 存在，无 `pnpm-lock.yaml`；但 create-next-app 仍生成并保留嵌套 `.git` 与初始提交 |
| 业务修改前 readiness | 通过 | 高位回环地址返回 200，工具清理进程；首次参数错误后修正 |
| 嵌套指令与本地文档分页 | 通过 | 指令已读取；认证文档按 200 行连续分页，未再触发 Context 预算失败 |
| 认证与安全 HTTP/E2E | 未通过 | 源码和单元测试存在，但没有真实 HTTP/E2E 请求验证注册、登录、退出和保护路由 |
| 隔离测试、并发与损坏行为 | 部分通过 | 测试使用独立数据目录且覆盖损坏 JSON；并发断言被放宽为“至少一个成功”，不能证明唯一注册成功 |
| lint、test、build 与最终总结 | 部分通过 | 三条命令最终及独立复核均退出 0；但真实 run 超时，没有最终总结，且保留非阻塞 warning |
| Git 与工作区边界 | 未通过 | 没有 push/deploy，也未修改真实项目；但生成项目保留 `.git`，违背明确的无嵌套 Git 要求 |

最终结论：修订 6 解决了 R5 的分页、Context 投影和同 Session 续跑阻塞，但完整真实回归仍未通过 `AC17-31` / `AC17-36`。剩余失败是 Agent 执行精度与完成控制问题，不得用成功的 lint/test/build 代替缺失的 HTTP/E2E、Git 边界和最终终态。

### 30.5 后续阶段观察

用户已批准把以下两项定义为阶段 18 候选设计。阶段 17 Summary 修订 6 已于 2026-08-29 获批，因此阶段 18 只读观察与 Spec 已解锁：

1. 以 `result.ok`、退出码和 readiness 作为命令成败事实；warning 默认记录而不主动修改，只处理导致非零退出的直接原因或用户明确要求的 warning。
2. `write_file` 前先复用或取得父目录/目标存在事实；父目录缺失时先显式创建，既有文件先 `read_file` 获取最新 SHA，新文件才省略 `expectedSha256`。

### 30.6 Summary 审批与阶段切换

- 用户于 2026-08-29 明确回复“批准”，阶段 17 Summary 修订 6 通过。
- 阶段 17 正式完成；上述真实失败与遗留作为阶段 18 观察输入保留，不追溯改写阶段 17 的实现范围。
- 当前仅允许生成阶段 18 Spec；Task、产品实现与最终交付仍受后续门禁约束。
