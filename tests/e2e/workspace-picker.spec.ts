import { expect, selectWorkspace, startTask, test } from "./fixtures";

test("从受限目录弹窗选择 canonical 工作区并创建会话", async ({ page, runtime }) => {
  await startTask(page, `验证 canonical 工作区 ${Date.now()}`);
  await page.getByRole("button", { name: "详情" }).click();
  const details = page.getByRole("dialog", { name: "运行详情" });
  await expect(details.getByText(runtime.workspace, { exact: true })).toBeVisible();
  await expect(details.getByText("模型：generic", { exact: true })).toBeVisible();
  expect(await page.locator("input").evaluateAll((inputs, workspace) => inputs.every((input) => (input as HTMLInputElement).value !== workspace), runtime.workspace)).toBe(true);
});

test("目录弹窗隐藏文件、ignore 与越界链接，并呈现空目录和截断事实", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "选择工作区" }).click();
  const dialog = page.getByRole("dialog", { name: "选择工作区" });

  await expect(dialog.getByRole("option", { name: /slug-project/ })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /\.visible-project/ })).toBeVisible();
  await expect(dialog.getByText("node_modules", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("not-a-directory.txt", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("escape-link", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/1 个越界、失效或不可访问条目已阻止/)).toBeVisible();

  await dialog.getByRole("option", { name: /empty-project/ }).dblclick();
  await expect(dialog.getByText("当前目录没有可选择的子目录。")).toBeVisible();
  await dialog.getByRole("button", { name: "返回上级" }).click();
  await dialog.getByRole("option", { name: /many-projects/ }).dblclick();
  await expect(dialog.getByRole("option")).toHaveCount(500);
  await expect(dialog.getByText("仅显示排序后的前 500 个目录。")).toBeVisible();
});

test("重复进入请求只保留最后一次目录响应", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "选择工作区" }).click();
  const dialog = page.getByRole("dialog", { name: "选择工作区" });
  await dialog.getByRole("option", { name: /slug-project/ }).click();
  await dialog.getByRole("button", { name: "进入所选目录" }).dblclick();
  await expect(dialog.locator(".picker-location code")).toContainText("slug-project");
  await expect(dialog.getByRole("option", { name: /src/ })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /tests/ })).toBeVisible();
});

test("先输入任务再选择工作区时草稿保持不变", async ({ page }) => {
  await page.goto("/");
  const prompt = "先写下这段任务，再打开工作区抽屉。";
  await page.getByLabel("编程任务").fill(prompt);
  await selectWorkspace(page, { navigate: false });
  await expect(page.getByLabel("编程任务")).toHaveValue(prompt);
});
