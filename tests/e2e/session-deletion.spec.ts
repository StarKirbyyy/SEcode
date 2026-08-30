import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, startTask, test } from "./fixtures";

async function waitForIdleResponse(page: Parameters<typeof startTask>[0]) {
  await expect(page.getByText("E2E 假模型已完成本轮响应。", { exact: true })).toBeVisible();
}

test("取消删除保留当前 Session 和历史", async ({ page }) => {
  const prompt = `取消删除验收 ${Date.now()}`;
  await startTask(page, prompt);
  await waitForIdleResponse(page);
  const current = page.locator(".session-row[data-active='true']");
  await current.getByRole("button", { name: /删除会话/ }).click();
  const dialog = page.getByRole("alertdialog", { name: "删除这个对话？" });
  await expect(dialog).toContainText("不会删除工作区中的项目文件");
  await expect(dialog.getByRole("button", { name: "取消" })).toBeFocused();
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toBeHidden();
  await expect(current).toHaveCount(1);
  await expect(page.getByText("E2E 假模型已完成本轮响应。", { exact: true })).toBeVisible();
});

test("删除非当前 Session 保留当前 URL 和 transcript", async ({ page }) => {
  const firstPrompt = `待删除旧会话 ${Date.now()}`;
  await startTask(page, firstPrompt);
  await waitForIdleResponse(page);
  await page.getByRole("button", { name: "新任务" }).click();
  const secondPrompt = `保留当前会话 ${Date.now()}`;
  await startTask(page, secondPrompt);
  await waitForIdleResponse(page);
  const currentUrl = page.url();
  const oldRow = page.locator(".session-row").filter({ hasText: firstPrompt });
  await oldRow.getByRole("button", { name: /删除会话/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除对话" }).click();

  await expect(page).toHaveURL(currentUrl);
  await expect(oldRow).toHaveCount(0);
  await expect(page.getByText("E2E 假模型已完成本轮响应。", { exact: true })).toBeVisible();
});

test("删除当前 Session 回到主页且刷新后不会恢复", async ({ page, runtime }) => {
  const markerPath = path.join(runtime.workspace, "README.md");
  const markerBefore = await readFile(markerPath, "utf8");
  const prompt = `删除当前会话 ${Date.now()}`;
  await startTask(page, prompt);
  await waitForIdleResponse(page);
  const deletedUrl = page.url();
  await page.locator(".session-row[data-active='true']").getByRole("button", { name: /删除会话/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除对话" }).click();

  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByText("工作区项目文件未受影响", { exact: false })).toBeVisible();
  await expect(page.locator(".session-row").filter({ hasText: prompt })).toHaveCount(0);
  expect(await readFile(markerPath, "utf8")).toBe(markerBefore);

  await page.goto(deletedUrl);
  await expect(page.getByRole("heading", { name: "会话不存在" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "会话不存在" })).toBeVisible();
});

test("活动 Session 先停止后才允许删除", async ({ page, setScenario }) => {
  await setScenario("slow-cancel");
  await startTask(page, `运行中删除保护 ${Date.now()}`);
  const deleteButton = page.locator(".session-row[data-active='true']").getByRole("button", { name: /删除会话/ });
  await expect(deleteButton).toBeDisabled();
  await expect(deleteButton).toHaveAttribute("title", "请先停止任务，再删除对话");

  await page.getByRole("button", { name: "停止" }).click();
  await expect(page.getByText(/已请求停止|已取消/).first()).toBeVisible();
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除对话" }).click();
  await expect(page).toHaveURL(/\/$/u);
});

test("移动导航可用键盘打开并取消删除", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startTask(page, `移动删除入口 ${Date.now()}`);
  await waitForIdleResponse(page);
  await page.getByRole("button", { name: "打开会话导航" }).click();
  const navigation = page.getByRole("dialog", { name: "会话与任务" });
  await navigation.locator(".session-row[data-active='true']").getByRole("button", { name: /删除会话/ }).click();
  const dialog = page.getByRole("alertdialog", { name: "删除这个对话？" });
  await expect(dialog.getByRole("button", { name: "取消" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(navigation).toBeHidden();
  await expect(page.getByRole("button", { name: "打开会话导航" })).toBeFocused();
});
