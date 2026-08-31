import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { expect, startTask, test } from "./fixtures";

test.setTimeout(120_000);

async function allocatePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("动态端口分配失败");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function stopSessionServices(dataDir: string, sessionId: string) {
  const eventPath = path.join(dataDir, "sessions", sessionId, "events.jsonl");
  let source: string;
  try {
    source = await readFile(eventPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const pids = source.trim().split("\n").flatMap((line) => {
    if (line.length === 0) return [];
    const event = JSON.parse(line) as { type?: string; data?: { result?: { metadata?: { lifecycle?: string; pid?: number } } } };
    const metadata = event.type === "tool.result" ? event.data?.result?.metadata : undefined;
    return metadata?.lifecycle === "service" && Number.isInteger(metadata.pid) ? [metadata.pid as number] : [];
  });
  for (const pid of new Set(pids)) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}

test("简单 TDD 后启动双服务，并在纠正后的最终总结提供可点击链接", async ({ page, runtime, setScenario }) => {
  const backendPort = await allocatePort();
  let frontendPort = await allocatePort();
  while (frontendPort === backendPort) frontendPort = await allocatePort();
  expect(backendPort).not.toBe(3000);
  expect(frontendPort).not.toBe(3000);
  await mkdir(path.join(runtime.workspace, "stage25-app"));
  await setScenario("tdd-web-handoff");

  await startTask(
    page,
    `使用简单 TDD 创建并启动看板。BACKEND_PORT=${backendPort} FRONTEND_PORT=${frontendPort}；端口不得使用 3000。`,
  );
  const sessionId = new URL(page.url()).pathname.split("/").at(-1);
  if (sessionId === undefined) throw new Error("Session ID 缺失");

  try {
    const failedTest = page.locator(".tool-entry").filter({ hasText: "run_process" }).filter({ hasText: "失败" });
    await expect(failedTest).toBeVisible({ timeout: 30_000 });

    for (const serviceFile of ["backend.mjs", "frontend.mjs"]) {
      const approval = page.locator(".tool-entry")
        .filter({ has: page.getByText("run_process", { exact: true }) })
        .filter({ hasText: '"lifecycle": "service"' })
        .filter({ hasText: serviceFile });
      await expect(approval).toBeVisible({ timeout: 30_000 });
      await approval.getByRole("button", { name: "批准本次" }).click();
      await expect(approval).toContainText("成功", { timeout: 30_000 });
    }

    await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible({ timeout: 60_000 });
    const backendUrl = `http://127.0.0.1:${backendPort}/api/health`;
    const frontendUrl = `http://127.0.0.1:${frontendPort}/`;
    await expect(page.getByRole("link", { name: "后端健康检查" })).toHaveAttribute("href", backendUrl);
    await expect(page.getByRole("link", { name: "打开 Stage 25 看板" })).toHaveAttribute("href", frontendUrl);
    await expect(page.getByText(`node backend.mjs ${backendPort}`, { exact: false })).toBeVisible();
    await expect(page.getByText(`node frontend.mjs ${frontendPort} ${backendPort}`, { exact: false })).toBeVisible();

    const openedPage = page.context().waitForEvent("page");
    await page.getByRole("link", { name: "打开 Stage 25 看板" }).click();
    const dashboard = await openedPage;
    await expect(dashboard).toHaveURL(frontendUrl);
    await expect(dashboard.getByRole("heading", { name: "Stage 25 看板" })).toBeVisible();
    await expect(dashboard.getByText("API 已连接", { exact: true })).toBeVisible({ timeout: 10_000 });
    await dashboard.getByRole("button", { name: "增加计数" }).click();
    await expect(dashboard.getByText("计数：1", { exact: true })).toBeVisible();
    await dashboard.close();
  } finally {
    await stopSessionServices(runtime.dataDir, sessionId);
  }
});

test("service 最终失败时仍交付带警告的 final", async ({ page, setScenario }) => {
  const port = await allocatePort();
  await setScenario("service-failure-soft-final");
  await startTask(page, `启动一个不存在的服务并如实交付。BACKEND_PORT=${port}；端口不得使用 3000。`);

  const approval = page.locator(".tool-entry")
    .filter({ has: page.getByText("run_process", { exact: true }) })
    .filter({ hasText: '"lifecycle": "service"' });
  await expect(approval).toBeVisible({ timeout: 30_000 });
  await approval.getByRole("button", { name: "批准本次" }).click();
  await expect(approval).toContainText("失败", { timeout: 30_000 });

  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/服务未成功启动.*PROCESS_EXIT_NONZERO/u)).toBeVisible();
  await expect(page.getByRole("link", { name: /127\.0\.0\.1/u })).toHaveCount(0);
});
