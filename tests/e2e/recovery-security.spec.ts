import { expect, startTask, test } from "./fixtures";

test("模型服务失败形成 durable 失败并且继续按钮只填草稿", async ({ page, setScenario }) => {
  await setScenario("provider-failure");
  await startTask(page, "触发有限上游失败验收。");
  await expect(page.getByText("任务运行失败", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/MODEL_PROVIDER_UNAVAILABLE/)).toBeVisible();
  await page.getByRole("button", { name: "继续上次任务" }).click();
  await expect(page.getByLabel("编程任务")).toHaveValue(/请继续上一次任务/);
  await expect(page.getByRole("button", { name: "发送任务" })).toBeEnabled();
  await page.reload();
  await expect(page.getByText("任务运行失败", { exact: true })).toBeVisible();
});

test("Markdown 不执行 raw HTML、javascript URL 或远程图片", async ({ page, setScenario }) => {
  const trackerRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://tracker.invalid/")) trackerRequests.push(request.url());
  });
  await setScenario("markdown-security");
  await startTask(page, "返回安全 Markdown fixture。");
  await expect(page.getByText("安全内容", { exact: false })).toBeVisible();
  await expect(page.locator(".markdown-message script")).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator('img[src*="tracker.invalid"]')).toHaveCount(0);
  expect(await page.evaluate(() => "evil" in window)).toBe(false);
  expect(trackerRequests).toEqual([]);
  await expect(page.getByText("跟踪图", { exact: false })).toBeVisible();
});
