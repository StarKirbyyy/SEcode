import { expect, test } from "@playwright/test";

test("the Next.js application serves an accessible document", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", /.+/);
  await expect(page.locator("body")).toBeVisible();
});
