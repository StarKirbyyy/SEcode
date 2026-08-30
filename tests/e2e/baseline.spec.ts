import { expect, test } from "./fixtures";

test("新任务主页提供固定无滚动的本地安全入口", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle(/SEcode/);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("body")).toBeVisible();
  await expect(page.getByRole("heading", { name: "今天想一起完成什么？" })).toBeVisible();
  await expect(page.getByText("危险操作需审批", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByText("Get started by editing", { exact: false })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => ({
    horizontal: document.body.scrollWidth > window.innerWidth,
    vertical: document.body.scrollHeight > window.innerHeight,
    overflow: getComputedStyle(document.body).overflow,
  }))).toEqual({ horizontal: false, vertical: false, overflow: "hidden" });
});
