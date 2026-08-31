import { mkdir, writeFile } from "node:fs/promises";

import { expect, startTask, test } from "./fixtures";

test("后写的明确 verify 脚本直接收敛且不触发纠正", async ({ page, runtime, setScenario }) => {
  await mkdir(`${runtime.workspace}/client`, { recursive: true });
  await writeFile(
    `${runtime.workspace}/client/package.json`,
    JSON.stringify({ scripts: { test: "node --test *.mjs" } }),
    "utf8",
  );
  await setScenario("late-validation-script");
  await startTask(page, "构建客户端，新增集成验证脚本并完成认可验证");

  await expect(page.getByRole("heading", { name: "需要人工审批" })).toBeVisible();
  await page.getByRole("button", { name: "批准本次" }).click();

  await expect(page.getByText("直接 verify 脚本已覆盖其自身变更，任务完成。", { exact: true }))
    .toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible();
  await expect(page.getByText("完成声明缺少变更后验证", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("编程任务")).toBeEnabled();
  const sessionId = page.url().split("/").at(-1);
  expect(sessionId).toMatch(/^[0-9a-f-]+$/u);
  await expect.poll(async () => {
    const response = await page.request.get(`/api/sessions/${sessionId}/events?after=0`);
    return response.status();
  }).toBe(200);

  await page.reload();
  await expect(page.getByText("直接 verify 脚本已覆盖其自身变更，任务完成。", { exact: true })).toBeVisible();
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible();
});
