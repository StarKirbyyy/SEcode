import { expect, startTask, test } from "./fixtures";

async function begin(page: Parameters<typeof startTask>[0], prompt = "执行指定验收命令并报告事实。") {
  await startTask(page, prompt);
  const entry = page.locator(".tool-entry").filter({ hasText: "run_process" });
  await expect(entry).toContainText("等待审批");
  return entry;
}

test("允许高风险命令后继续执行且禁止重复审批", async ({ page, setScenario }) => {
  await setScenario("approval-allow");
  const card = await begin(page);
  await card.getByLabel("审批理由（可选）").fill("E2E 有限无副作用脚本");
  await card.getByRole("button", { name: "批准本次" }).click();
  await expect(page.getByText("审批命令执行完成。")).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("成功");
  await expect(card.getByRole("button", { name: "批准本次" })).toHaveCount(0);
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible();
});

test("拒绝高风险命令后不启动进程并安全结束", async ({ page, setScenario }) => {
  await setScenario("approval-reject");
  const card = await begin(page);
  await card.getByLabel("审批理由（可选）").fill("本次拒绝执行");
  await card.getByRole("button", { name: "拒绝" }).click();
  await expect(page.getByText("审批已拒绝；未执行命令，任务安全结束。")).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("已拒绝");
});

test("运行中的慢进程可取消并产生 durable cancelled 终态", async ({ page, setScenario }) => {
  await setScenario("slow-cancel");
  const card = await begin(page, "执行 pnpm run slow；这是取消验收。");
  await card.getByRole("button", { name: "批准本次" }).click();
  await expect(card).toContainText("执行中", { timeout: 10_000 });
  await page.getByRole("button", { name: "停止" }).click();
  await expect(page.getByText("任务运行已取消", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/用户从 Web 工作台请求停止/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("任务运行已取消", { exact: true })).toBeVisible();
});
