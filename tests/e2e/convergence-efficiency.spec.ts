import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { expect, startTask, test } from "./fixtures";

test.setTimeout(120_000);

async function allocatePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("动态端口分配失败");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

interface StoredEvent {
  seq: number;
  type: string;
  data: Record<string, unknown>;
}

async function sessionEvents(dataDir: string, sessionId: string): Promise<StoredEvent[]> {
  const source = await readFile(path.join(dataDir, "sessions", sessionId, "events.jsonl"), "utf8");
  return source.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as StoredEvent);
}

async function stopSessionServices(dataDir: string, sessionId: string): Promise<void> {
  const events = await sessionEvents(dataDir, sessionId);
  const pids = events.flatMap((event) => {
    const result = event.type === "tool.result"
      ? event.data.result as { metadata?: { lifecycle?: string; pid?: number } } | undefined
      : undefined;
    return result?.metadata?.lifecycle === "service" && Number.isInteger(result.metadata.pid)
      ? [result.metadata.pid as number]
      : [];
  });
  for (const pid of new Set(pids)) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}

test("在 9 次模型请求内按 RED/GREEN、一次 smoke、双 service 后直接完成", async ({
  page,
  runtime,
  setScenario,
}) => {
  const backendPort = await allocatePort();
  let frontendPort = await allocatePort();
  while (frontendPort === backendPort) frontendPort = await allocatePort();
  expect([backendPort, frontendPort]).not.toContain(3000);
  await mkdir(path.join(runtime.workspace, "stage26-app/server"), { recursive: true });
  await mkdir(path.join(runtime.workspace, "stage26-app/client"), { recursive: true });
  await mkdir(path.join(runtime.workspace, "stage26-app/scripts"), { recursive: true });
  await setScenario("convergence-efficient-web");

  await startTask(
    page,
    `用 TDD 创建并启动 Stage 26 看板。BACKEND_PORT=${backendPort} FRONTEND_PORT=${frontendPort}；端口不得使用 3000。`,
  );
  const sessionId = new URL(page.url()).pathname.split("/").at(-1);
  if (sessionId === undefined) throw new Error("Session ID 缺失");

  try {
    await expect(page.locator(".tool-entry").filter({ hasText: "run_process" }).filter({ hasText: "失败" }).first())
      .toBeVisible({ timeout: 30_000 });

    for (const invocation of [
      { file: "backend.mjs", service: true },
      { file: "smoke-api.mjs", service: false },
      { file: "frontend.mjs", service: true },
    ]) {
      let approval = page.locator(".tool-entry")
        .filter({ has: page.getByText("run_process", { exact: true }) })
        .filter({ hasText: invocation.file });
      if (invocation.service) approval = approval.filter({ hasText: '"lifecycle": "service"' });
      await expect(approval).toBeVisible({ timeout: 30_000 });
      await approval.getByRole("button", { name: "批准本次" }).click();
      await expect(approval).toContainText("成功", { timeout: 30_000 });
    }

    await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible({ timeout: 60_000 });
    const backendUrl = `http://127.0.0.1:${backendPort}/api/health`;
    const frontendUrl = `http://127.0.0.1:${frontendPort}/`;
    await expect(page.getByRole("link", { name: "后端健康检查" })).toHaveAttribute("href", backendUrl);
    await expect(page.getByRole("link", { name: "打开 Stage 26 看板" })).toHaveAttribute("href", frontendUrl);
    await expect(page.getByText("限制：仅完成本地 loopback 验收。", { exact: false })).toBeVisible();

    const events = await sessionEvents(runtime.dataDir, sessionId);
    const modelRequests = events.filter((event) => event.type === "model.requested");
    expect(modelRequests).toHaveLength(9);
    const requested = events.filter((event) => event.type === "tool.requested");
    const processRequests = requested.filter((event) => event.data.toolName === "run_process");
    const firstValidatorSeq = processRequests.find((event) =>
      JSON.stringify((event.data.publicArguments as { args?: string[] }).args) === JSON.stringify(["test"])
    )?.seq;
    expect(firstValidatorSeq).toBeDefined();
    expect(modelRequests.filter((event) => event.seq < (firstValidatorSeq ?? 0))).toHaveLength(3);
    expect(modelRequests.filter((event) => event.seq >= (firstValidatorSeq ?? 0)).length).toBeLessThanOrEqual(16);
    expect(processRequests.filter((event) =>
      JSON.stringify((event.data.publicArguments as { args?: string[] }).args)?.includes("smoke-api.mjs")
    )).toHaveLength(1);
    expect(processRequests.filter((event) =>
      (event.data.publicArguments as { lifecycle?: string }).lifecycle === "service"
    )).toHaveLength(2);
    expect(requested.filter((event) => event.data.toolName === "list_directory")).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("COMPLETION_EVIDENCE_REQUIRED");

    const lastServiceResultSeq = Math.max(...events.filter((event) => {
      if (event.type !== "tool.result") return false;
      const result = event.data.result as { metadata?: { lifecycle?: string } } | undefined;
      return result?.metadata?.lifecycle === "service";
    }).map((event) => event.seq));
    expect(modelRequests.filter((event) => event.seq > lastServiceResultSeq)).toHaveLength(1);

    const dashboardPromise = page.context().waitForEvent("page");
    await page.getByRole("link", { name: "打开 Stage 26 看板" }).click();
    const dashboard = await dashboardPromise;
    await expect(dashboard.getByRole("heading", { name: "Stage 26 看板" })).toBeVisible();
    await expect(dashboard.getByText("API 已连接", { exact: true })).toBeVisible();
    await dashboard.getByRole("button", { name: "增加计数" }).click();
    await expect(dashboard.getByText("计数：1", { exact: true })).toBeVisible();
    await dashboard.reload();
    await expect(dashboard.getByText("API 已连接", { exact: true })).toBeVisible();
    await dashboard.close();

    await expect(page.getByLabel("编程任务")).toBeEnabled();
    await page.waitForTimeout(100);
    await page.reload();
    await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "打开 Stage 26 看板" })).toHaveAttribute("href", frontendUrl);
  } finally {
    await stopSessionServices(runtime.dataDir, sessionId);
  }
});
