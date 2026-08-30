import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { expect, startTask, test } from "./fixtures";

const execFileAsync = promisify(execFile);

test("真实 Agent 完成读取、最小替换、测试与 durable 恢复", async ({ page, runtime, setScenario }) => {
  const prompt = "修复 slugify，使 README 契约与所有测试通过；不要修改测试、安装依赖或提交。";
  await setScenario("slug-fix");
  await startTask(page, prompt);

  await expect(page.getByText("read_file", { exact: true })).toBeVisible();
  await expect(page.getByText("replace_in_file", { exact: true })).toBeVisible();
  await expect(page.getByText("run_process", { exact: true })).toBeVisible();
  await expect(page.getByText("修复完成：已读取实现、最小替换并运行测试，4/4 全部通过。")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "详情" }).click();
  const details = page.getByRole("dialog", { name: "运行详情" });
  await expect(details.getByRole("heading", { name: "当前 run 用量" })).toBeVisible();
  await expect(details.getByRole("heading", { name: "整个 Session 用量" })).toBeVisible();
  await expect(details.getByRole("heading", { name: "供应商 Prompt Cache" })).toBeVisible();
  await expect(
    details.getByRole("region", { name: "供应商缓存" }).getByText(/57\.4%/u),
  ).toBeVisible();
  await expect(details.getByRole("heading", { name: "本地 Context Cache" })).toBeVisible();
  await expect(details.getByRole("heading", { name: "上下文压缩" })).toBeVisible();
  await details.getByRole("button", { name: "关闭运行详情" }).click();

  const source = await readFile(`${runtime.workspace}/src/slug.mjs`, "utf8");
  expect(source).toContain('value.trim().toLowerCase().replace(/\\s+/g, "-")');
  const result = await execFileAsync("pnpm", ["test"], { cwd: runtime.workspace, timeout: 30_000 });
  expect(result.stdout).toContain("pass 4");
  expect(result.stdout).toContain("fail 0");

  await page.reload();
  await expect(page.getByText("修复完成：已读取实现、最小替换并运行测试，4/4 全部通过。")).toHaveCount(1);
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /修复 slugify/ })).toBeVisible();
});

test("多 scope 验证在 UI 中显示未覆盖范围并在刷新后保持 durable 事实", async ({ page, runtime, setScenario }) => {
  for (const scope of ["server", "client"]) {
    await mkdir(`${runtime.workspace}/${scope}`, { recursive: true });
    await writeFile(
      `${runtime.workspace}/${scope}/package.json`,
      JSON.stringify({ scripts: { test: `node --check ${scope}.mjs` } }),
      "utf8",
    );
  }
  await setScenario("multi-scope-validation");
  await startTask(page, "分别修改并验证前后端 scope");

  await expect(page.getByText("完成声明缺少变更后验证", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/待验证路径：client\/client\.mjs/u)).toBeVisible();
  await expect(page.getByText("前后端验证均已完成。", { exact: true })).toBeVisible();
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("完成声明缺少变更后验证", { exact: true })).toHaveCount(1);
  await expect(page.getByText(/待验证路径：client\/client\.mjs/u)).toBeVisible();
  await expect(page.getByText("任务运行完成", { exact: true })).toBeVisible();
});
