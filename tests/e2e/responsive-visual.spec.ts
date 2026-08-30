import { expect, startTask, test } from "./fixtures";

test("1440×900 使用 264px 导航与居中主区且 body 不滚动", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "会话导航" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今天想一起完成什么？" })).toBeVisible();
  await expect(page.locator(".desktop-navigation")).toHaveCSS("width", "264px");
  await expect(page.locator(".visual-stage")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => ({
    horizontal: document.body.scrollWidth > window.innerWidth,
    vertical: document.body.scrollHeight > window.innerHeight,
    overflow: getComputedStyle(document.body).overflow,
  }))).toEqual({ horizontal: false, vertical: false, overflow: "hidden" });
});

test("reduced motion 保持工作区抽屉可操作且无大位移动画", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "选择工作区" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "选择工作区" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((node) => Number.parseFloat(getComputedStyle(node).animationDuration) || 0)).toBeLessThanOrEqual(0.00002);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("移动端独立会话导航抽屉锁定焦点并用 Escape 恢复", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "打开会话导航" });
  await expect(menu).toBeVisible();
  await expect(page.locator(".desktop-navigation")).toBeHidden();
  await menu.click();
  const dialog = page.getByRole("dialog", { name: "会话与任务" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "新任务" })).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(menu).toBeFocused();
  expect(await page.evaluate(() => document.body.scrollHeight <= innerHeight && document.body.scrollWidth <= innerWidth)).toBe(true);
});

test("Session 常规内容为纯文本，运行详情按需打开", async ({ page }) => {
  await startTask(page, "验证纯文本执行布局。");
  await expect(page.getByRole("region", { name: "Agent 执行记录" })).toBeVisible();
  await expect(page.locator(".inspector-panel,.event-entry,.workbench-grid")).toHaveCount(0);
  const detailsButton = page.getByRole("button", { name: "详情" });
  await detailsButton.click();
  const details = page.getByRole("dialog", { name: "运行详情" });
  await expect(details).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await expect(detailsButton).toBeFocused();
});
