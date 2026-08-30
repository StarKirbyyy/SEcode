import { readFile } from "node:fs/promises";

import { expect, selectWorkspace, startTask, test } from "./fixtures";

async function startPlanTask(page: Parameters<typeof startTask>[0], prompt: string) {
  await selectWorkspace(page);
  const toggle = page.getByRole("checkbox", { name: "先规划后执行" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByLabel("编程任务").fill(prompt);
  await page.getByRole("button", { name: "开始任务" }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/u);
  await expect(page.getByRole("region", { name: "实施计划", exact: true })).toBeVisible({ timeout: 20_000 });
}

test("Plan Mode 默认关闭并直接执行，不产生计划提案", async ({ page }) => {
  await startTask(page, "直接回答默认模式验收。不要调用工具。");
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "实施计划", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "先规划后执行" })).not.toBeChecked();
});

test("Plan Mode 只读规划后等待决定且工作区不变", async ({ page, runtime, setScenario }) => {
  await setScenario("plan-basic");
  const before = await readFile(`${runtime.workspace}/src/slug.mjs`, "utf8");
  await startPlanTask(page, "先制定计划，等待我决定。不要提前修改。");
  await expect(page.getByText("等待你的决定", { exact: true })).toBeVisible();
  expect(await readFile(`${runtime.workspace}/src/slug.mjs`, "utf8")).toBe(before);
  await page.getByRole("button", { name: "拒绝计划" }).click();
  await expect(page.getByText("任务运行已取消", { exact: true })).toBeVisible({ timeout: 20_000 });
});

test("长 Markdown 计划在批准前完整渲染且批准不补写尾字", async ({ page, setScenario }) => {
  await setScenario("plan-long-markdown");
  await startPlanTask(page, "生成包含标题、表格和代码块的长计划，等待我批准。");
  const plan = page.locator(".transcript-plan");
  await expect(plan.getByRole("heading", { name: "长计划呈现验收" })).toBeVisible();
  await expect(plan.locator("table")).toContainText("durable");
  await expect(plan.locator("pre code")).toContainText("SERVER_PORT=3001");
  await expect(plan.getByText("计划尾部在批准前完整可见", { exact: true })).toBeVisible();
  const before = await plan.locator(".markdown-message").innerText();
  await page.getByRole("button", { name: "同意计划并开始执行" }).click();
  await expect(page.getByText("长计划已经按批准内容执行完成。", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await plan.locator(".markdown-message").innerText()).toBe(before);
  await page.reload();
  const restoredPlan = page.locator(".transcript-plan");
  await expect(restoredPlan.getByRole("heading", { name: "长计划呈现验收" })).toBeVisible();
  await expect(restoredPlan.locator("table")).toContainText("durable");
  await expect(restoredPlan.locator("pre code")).toContainText("SERVER_PORT=3001");
  await expect(restoredPlan.getByText("计划尾部在批准前完整可见", { exact: true })).toBeVisible();
  expect(await restoredPlan.locator(".markdown-message").innerText()).toBe(before);
});

test("移动端长 Markdown 计划完整可见并可用键盘批准", async ({ page, setScenario }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setScenario("plan-long-markdown");
  await startPlanTask(page, "在移动端生成长 Markdown 计划并等待键盘批准。");
  const plan = page.locator(".transcript-plan");
  await expect(plan.getByRole("heading", { name: "长计划呈现验收" })).toBeVisible();
  await expect(plan.locator("table")).toContainText("durable");
  await expect(plan.locator("pre code")).toContainText("SERVER_PORT=3001");
  await expect(plan.getByText("计划尾部在批准前完整可见", { exact: true })).toBeVisible();
  const approve = page.getByRole("button", { name: "同意计划并开始执行" });
  await approve.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("长计划已经按批准内容执行完成。", { exact: true }))
    .toBeVisible({ timeout: 20_000 });
});

test("同意计划后同一 run 继续修改并完成测试", async ({ page, runtime, setScenario }) => {
  await setScenario("plan-slug-fix");
  await startPlanTask(page, "修复 slugify 并运行测试。先给出计划。等待同意后执行。");
  const approvalRequest = page.waitForRequest((request) => /\/api\/runs\/[^/]+\/plans\/[^/]+$/u.test(new URL(request.url()).pathname));
  await page.getByRole("button", { name: "同意计划并开始执行" }).click();
  const approvalUrl = new URL((await approvalRequest).url());
  const approvalRunId = approvalUrl.pathname.split("/")[3];
  await expect(page.getByText("计划执行完成：slugify 已修复，4/4 测试通过。", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible();
  expect(await readFile(`${runtime.workspace}/src/slug.mjs`, "utf8")).toContain('value.trim().toLowerCase().replace(/\\s+/g, "-")');

  const sessionId = new URL(page.url()).pathname.split("/").at(-1)!;
  const history = await (await page.request.get(`/api/sessions/${sessionId}/events?after=0`)).json() as { events: Array<{ runId?: string }> };
  const runIds = new Set(history.events.map((event) => event.runId).filter((value): value is string => value !== undefined));
  expect(runIds).toEqual(new Set([approvalRunId]));
});

test("拒绝计划形成 cancelled 且工作区零变化", async ({ page, runtime, setScenario }) => {
  await setScenario("plan-basic");
  const before = await readFile(`${runtime.workspace}/src/slug.mjs`, "utf8");
  await startPlanTask(page, "生成计划后等待拒绝验收。");
  await page.getByRole("button", { name: "拒绝计划" }).click();
  await expect(page.getByText("已拒绝", { exact: true })).toBeVisible();
  await expect(page.getByText("任务运行已取消", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await readFile(`${runtime.workspace}/src/slug.mjs`, "utf8")).toBe(before);
});

test("计划获批后危险工具仍使用独立工具审批", async ({ page, setScenario }) => {
  await setScenario("plan-danger");
  await startPlanTask(page, "规划并执行有限验收命令。");
  await page.getByRole("button", { name: "同意计划并开始执行" }).click();
  const tool = page.locator(".tool-entry").filter({ hasText: "run_process" });
  await expect(tool).toContainText("等待审批", { timeout: 20_000 });
  await expect(tool.getByRole("button", { name: "批准本次" })).toBeVisible();
  await tool.getByRole("button", { name: "批准本次" }).click();
  await expect(page.getByText("计划内命令已获独立审批并执行完成。", { exact: true })).toBeVisible({ timeout: 20_000 });
});

test("运行活动期间不能切换当前任务的 Plan Mode", async ({ page, setScenario }) => {
  await setScenario("plan-basic");
  await startPlanTask(page, "保持计划待审批以检查开关锁定。");
  const toggle = page.getByRole("checkbox", { name: "先规划后执行" });
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeDisabled();
  await page.getByRole("button", { name: "拒绝计划" }).click();
});

test("运行详情与纯文本记录显示真实模型请求和工具预算", async ({ page, setScenario }) => {
  await setScenario("slug-fix");
  await startTask(page, "修复 slug 并测试。");
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/模型请求 1 · 响应完成/u)).toBeVisible();
  await page.getByRole("button", { name: "详情" }).click();
  const details = page.getByRole("dialog", { name: "运行详情" });
  await expect(details.locator(".details-facts div").filter({ hasText: "模型请求" })).toContainText("4 / —");
  await expect(details.locator(".details-facts div").filter({ hasText: "工具调用" })).toContainText("3 / 300");
  await expect(details.locator(".details-facts div").filter({ hasText: "Plan Mode" })).toContainText("关闭");
});

test("移动端不会默认聚焦同意按钮，Escape 也不会批准计划", async ({ page, runtime, setScenario }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setScenario("plan-basic");
  const before = await readFile(`${runtime.workspace}/src/slug.mjs`, "utf8");
  await startPlanTask(page, "移动端计划审批焦点验收。");
  const approve = page.getByRole("button", { name: "同意计划并开始执行" });
  await expect(approve).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(approve).toBeVisible();
  expect(await readFile(`${runtime.workspace}/src/slug.mjs`, "utf8")).toBe(before);
  await page.getByRole("button", { name: "拒绝计划" }).click();
});

test("刷新后从 durable 历史恢复计划事实但不提供失效批准", async ({ page, setScenario }) => {
  await setScenario("plan-basic");
  await startPlanTask(page, "生成可恢复的计划事实。");
  await page.reload();
  await expect(page.getByRole("region", { name: "实施计划", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("计划未决，运行已结束", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "同意计划并开始执行" })).toHaveCount(0);
});
