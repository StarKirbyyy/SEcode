import type { Route } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  createSyntheticHistorySession,
  type SyntheticRunEnding,
} from "./support/history-fixture";

function eventAfter(url: string, sessionId: string): number | undefined {
  const parsed = new URL(url);
  if (parsed.pathname !== `/api/sessions/${sessionId}/events`) return undefined;
  const value = parsed.searchParams.get("after");
  return value === null ? undefined : Number(value);
}

test("538 条 failed 历史按页恢复，流后协调期间不回退", async ({ page, runtime }) => {
  test.setTimeout(180_000);
  const fixture = await createSyntheticHistorySession(runtime, {
    totalEvents: 538,
    ending: "failed",
  });
  const cursors: number[] = [];
  page.on("request", (request) => {
    const after = eventAfter(request.url(), fixture.sessionId);
    if (after !== undefined) cursors.push(after);
  });

  await page.goto(`/sessions/${fixture.sessionId}`);
  await expect(page.getByText(fixture.tailMarker, { exact: true })).toBeVisible();
  await expect(page.getByText("任务运行失败", { exact: true })).toBeVisible();
  await expect(page.getByText(/SYNTHETIC_HISTORY_FAILED/)).toBeVisible();
  expect(cursors.slice(0, 2)).toEqual([0, 500]);
  expect(cursors).not.toContain(538);

  await page.getByRole("button", { name: "详情" }).click();
  let details = page.getByRole("dialog", { name: "运行详情" });
  await expect(details.getByText("failed", { exact: true })).toBeVisible();
  await details.getByRole("button", { name: "关闭运行详情" }).last().click();

  let releaseSecondPage!: () => void;
  const secondPageGate = new Promise<void>((resolve) => { releaseSecondPage = resolve; });
  let secondPageBlocked!: () => void;
  const blocked = new Promise<void>((resolve) => { secondPageBlocked = resolve; });
  let delayReconciliation = true;
  const routeHandler = async (route: Route) => {
    if (delayReconciliation && eventAfter(route.request().url(), fixture.sessionId) === 500) {
      secondPageBlocked();
      await secondPageGate;
    }
    await route.continue();
  };
  await page.route(`**/api/sessions/${fixture.sessionId}/events?after=*`, routeHandler);

  try {
    await page.getByLabel("编程任务").fill("完成一个无需修改文件的短检查。");
    await page.getByRole("button", { name: "发送任务" }).click();
    await expect(page.getByText("E2E 假模型已完成本轮响应。", { exact: true })).toBeVisible();
    await expect(page.getByText("任务运行完成", { exact: true }).last()).toBeVisible();
    await blocked;

    await expect(page.getByText(fixture.tailMarker, { exact: true })).toBeVisible();
    await expect(page.getByText("E2E 假模型已完成本轮响应。", { exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "详情" }).click();
    details = page.getByRole("dialog", { name: "运行详情" });
    await expect(details.getByText("completed", { exact: true })).toBeVisible();
    await details.getByRole("button", { name: "关闭运行详情" }).last().click();
  } finally {
    delayReconciliation = false;
    releaseSecondPage();
  }

  await expect(page.getByText("E2E 假模型已完成本轮响应。", { exact: true })).toHaveCount(1);
  await expect(page.getByText(fixture.tailMarker, { exact: true })).toBeVisible();
});

const endings: ReadonlyArray<{
  ending: SyntheticRunEnding;
  header: string;
  details: string;
  terminalText?: string;
}> = [
  { ending: "completed", header: "已完成", details: "completed", terminalText: "任务运行完成" },
  { ending: "cancelled", header: "已取消", details: "cancelled", terminalText: "任务运行已取消" },
  { ending: "interrupted", header: "已中断", details: "interrupted", terminalText: "任务运行已中断" },
  { ending: "open", header: "已中断", details: "interrupted", terminalText: "任务运行已中断" },
];

for (const scenario of endings) {
  test(`501 条 ${scenario.ending} 历史保持 durable 投影`, async ({ page, runtime }) => {
    test.setTimeout(120_000);
    const fixture = await createSyntheticHistorySession(runtime, {
      totalEvents: 501,
      ending: scenario.ending,
    });
    if (scenario.ending === "open") expect(fixture.openRunIds).toContain(fixture.runId);
    await page.goto(`/sessions/${fixture.sessionId}`);
    await expect(page.getByText(fixture.tailMarker, { exact: true })).toBeVisible();
    await expect(page.locator(".run-status")).toContainText(scenario.header);
    if (scenario.terminalText === undefined) {
      await expect(page.getByText(/1 个运行曾被中断/)).toBeVisible();
    } else {
      await expect(page.getByText(scenario.terminalText, { exact: true }).last()).toBeVisible();
    }
    await page.getByRole("button", { name: "详情" }).click();
    const details = page.getByRole("dialog", { name: "运行详情" });
    await expect(details.getByText(scenario.details, { exact: true })).toBeVisible();
  });
}

test("1001 条历史使用三页 cursor 并显示最终尾部", async ({ page, runtime }) => {
  test.setTimeout(240_000);
  const fixture = await createSyntheticHistorySession(runtime, {
    totalEvents: 1001,
    ending: "completed",
  });
  const cursors: number[] = [];
  page.on("request", (request) => {
    const after = eventAfter(request.url(), fixture.sessionId);
    if (after !== undefined) cursors.push(after);
  });
  await page.goto(`/sessions/${fixture.sessionId}`);
  await expect(page.getByText(fixture.tailMarker, { exact: true })).toBeVisible();
  await expect(page.getByText("任务运行完成", { exact: true }).last()).toBeVisible();
  expect(cursors.slice(0, 3)).toEqual([0, 500, 1000]);
});
