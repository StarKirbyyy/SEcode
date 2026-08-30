import { expect, selectWorkspace, startTask, test } from "./fixtures";

const ENGLISH_FINAL = "I inspected the project and the requested task is complete.";
const ENGLISH_PLAN = "I will inspect the project, make the smallest change, and run the tests.";
const ENGLISH_TOOL_NARRATIVE = "I will read the requested file before reporting the result.";

async function startPlanningTask(
  page: Parameters<typeof startTask>[0],
  prompt: string,
) {
  await selectWorkspace(page);
  await page.getByRole("checkbox", { name: "先规划后执行" }).check();
  await page.getByLabel("编程任务").fill(prompt);
  await page.getByRole("button", { name: "开始任务" }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/u);
}

test("英文最终回答被抑制并在同一 run 中文重述，刷新后只恢复合规正文", async ({ page, setScenario }) => {
  await setScenario("english-final-retry");
  await startTask(page, "检查项目并总结结果。");

  await expect(page.getByText("模型输出未通过中文要求", { exact: true })).toBeVisible();
  await expect(page.getByText("正在请求中文重述（1/2）", { exact: true })).toBeVisible();
  await expect(page.getByText("已检查项目，请求的任务已经完成。", { exact: true })).toBeVisible();
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible();
  await expect(page.getByText(ENGLISH_FINAL, { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("已检查项目，请求的任务已经完成。", { exact: true })).toHaveCount(1);
  await expect(page.getByText("模型输出未通过中文要求", { exact: true })).toHaveCount(1);
  await expect(page.getByText(ENGLISH_FINAL, { exact: true })).toHaveCount(0);
});

test("英文计划先中文重述，批准后在同一 run 完成", async ({ page, setScenario }) => {
  await setScenario("english-plan-retry");
  await startPlanningTask(page, "先制定计划，批准后执行。 ");

  await expect(page.getByText("正在请求中文重述（1/2）", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "实施计划", exact: true })).toBeVisible();
  await expect(page.getByText(ENGLISH_PLAN, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "同意计划并开始执行" }).click();
  await expect(page.getByText("计划已经按批准内容执行完成。", { exact: true })).toBeVisible();
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible();

  const sessionId = new URL(page.url()).pathname.split("/").at(-1)!;
  const history = await (await page.request.get(`/api/sessions/${sessionId}/events?after=0`)).json() as {
    events: Array<{ type: string; runId?: string }>;
  };
  const runIds = new Set(history.events.map((event) => event.runId).filter(Boolean));
  expect(runIds.size).toBe(1);
  expect(history.events.filter((event) => event.type === "plan.proposed")).toHaveLength(1);
});

test("英文工具说明只被抑制一次，工具卡片与调用都不重复", async ({ page, setScenario }) => {
  await setScenario("english-tool-narrative");
  await startTask(page, "只读取 README.md 并总结。 ");

  await expect(page.getByText("已忽略工具调用前的非中文说明，工具将按原请求执行一次", { exact: true })).toBeVisible();
  await expect(page.getByText("read_file", { exact: true })).toHaveCount(1);
  await expect(page.getByText("已读取 README.md，并基于工具事实完成总结。", { exact: true })).toBeVisible();
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible();
  await expect(page.getByText(ENGLISH_TOOL_NARRATIVE, { exact: true })).toHaveCount(0);

  const sessionId = new URL(page.url()).pathname.split("/").at(-1)!;
  const history = await (await page.request.get(`/api/sessions/${sessionId}/events?after=0`)).json() as {
    events: Array<{ type: string; data: { action?: string; toolName?: string } }>;
  };
  expect(history.events.filter((event) => event.type === "tool.requested" && event.data.toolName === "read_file")).toHaveLength(1);
  expect(history.events.filter((event) => event.type === "model.output.rejected" && event.data.action === "content_suppressed")).toHaveLength(1);
});

test("连续三次英文响应有限失败且正文不进入页面或历史", async ({ page, setScenario }) => {
  await setScenario("always-english");
  await startTask(page, "验证连续英文响应的有限失败。 ");

  await expect(page.getByText("任务运行失败", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/AGENT_OUTPUT_LANGUAGE_INVALID/u)).toBeVisible();
  await expect(page.getByText("模型输出未通过中文要求", { exact: true })).toHaveCount(3);
  await expect(page.getByText(/The model keeps returning English prose/u)).toHaveCount(0);

  const sessionId = new URL(page.url()).pathname.split("/").at(-1)!;
  const history = await (await page.request.get(`/api/sessions/${sessionId}/events?after=0`)).json() as {
    events: Array<{ type: string; data: unknown }>;
  };
  expect(history.events.filter((event) => event.type === "model.output.rejected")).toHaveLength(3);
  expect(JSON.stringify(history)).not.toContain("The model keeps returning English prose");
});

test("中文重述请求等待期间可以取消并恢复 durable cancelled", async ({ page, setScenario }) => {
  await setScenario("english-retry-cancel");
  await startTask(page, "验证中文重述期间取消。 ");

  await expect(page.getByText("正在请求中文重述（1/2）", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "停止" }).click();
  await expect(page.getByText("任务运行已取消", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/I will keep the next response open/u)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("任务运行已取消", { exact: true })).toBeVisible();
  await expect(page.getByText("模型输出未通过中文要求", { exact: true })).toBeVisible();
});
