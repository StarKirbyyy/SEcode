import { expect, selectWorkspace, startTask, test } from "./fixtures";

test("访问根路径始终停留在新任务主页而不自动打开历史会话", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole("heading", { name: "今天想一起完成什么？" })).toBeVisible();
  await expect(page.getByLabel("编程任务")).toHaveValue("");
});

test("工作区抽屉不清空预先输入的任务草稿", async ({ page }) => {
  await page.goto("/");
  const prompt = "保留这段尚未提交的任务描述。";
  await page.getByLabel("编程任务").fill(prompt);
  await selectWorkspace(page, { navigate: false });
  await expect(page.getByLabel("编程任务")).toHaveValue(prompt);
});

test("一次提交创建一个 Session、进入稳定 URL 并启动运行", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("正在恢复会话…", { exact: true })).toHaveCount(0);
  const before = await page.locator(".session-link").count();
  await startTask(page, `一次提交验收 ${Date.now()}`);
  await expect(page.getByText("任务运行已开始", { exact: true })).toBeVisible();
  await expect(page.locator(".session-link")).toHaveCount(before + 1);
  await expect(page.locator(".session-link[aria-current='page']")).toHaveCount(1);
});

test("运行中阻止新任务导航并保留停止与审批入口", async ({ page, setScenario }) => {
  await setScenario("approval-reject");
  await startTask(page, "等待审批期间验证导航保护。 ");
  const entry = page.locator(".tool-entry").filter({ hasText: "run_process" });
  await expect(entry).toContainText("等待审批");
  const current = page.url();
  await page.getByRole("button", { name: "新任务" }).click();
  await expect(page).toHaveURL(current);
  await expect(page.getByText("当前任务仍在运行。请先停止任务，再切换会话。")).toBeVisible();
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible();
  await entry.getByRole("button", { name: "拒绝" }).click();
  await expect(page.getByText("审批已拒绝；未执行命令，任务安全结束。")).toBeVisible();
});
