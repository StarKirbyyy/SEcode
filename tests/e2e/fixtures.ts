import { expect, test as base, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { readRuntimeManifest, type RuntimeManifest } from "./support/runtime-manifest";
import type { FakeModelScenario } from "./support/fake-model-server";

type ScenarioSetter = (scenario: FakeModelScenario) => Promise<void>;
type Fixtures = {
  runtime: RuntimeManifest;
  setScenario: ScenarioSetter;
  scenarioReset: void;
  workspaceIsolation: void;
  browserDiagnostics: void;
};

const BROKEN_SLUG_SOURCE = [
  'export const FIXTURE_MARKER = "SECODE_STAGE14_SLUG";',
  "",
  "export function slugify(value) {",
  '  return value.toLowerCase().replace(" ", "-");',
  "}",
  "",
].join("\n");

export const test = base.extend<Fixtures>({
  runtime: async ({}, provide) => {
    await provide(await readRuntimeManifest());
  },
  setScenario: async ({ runtime }, provide) => {
    const setScenario: ScenarioSetter = async (scenario) => {
      const response = await fetch(`http://127.0.0.1:${runtime.fakeModelPort}/scenario`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      expect(response.ok).toBe(true);
    };
    await setScenario("idle");
    await provide(setScenario);
  },
  scenarioReset: [async ({ setScenario }, provide) => {
    await setScenario("idle");
    await provide();
  }, { auto: true }],
  workspaceIsolation: [async ({ runtime }, provide) => {
    const protectedPaths = ["README.md", "package.json", "tests/slug.test.mjs"];
    await writeFile(path.join(runtime.workspace, "src/slug.mjs"), BROKEN_SLUG_SOURCE);
    const before = await Promise.all(protectedPaths.map((file) => readFile(path.join(runtime.workspace, file), "utf8")));
    await provide();
    const after = await Promise.all(protectedPaths.map((file) => readFile(path.join(runtime.workspace, file), "utf8")));
    expect(after, "E2E 场景不得修改 README、package 或测试").toEqual(before);
  }, { auto: true }],
  browserDiagnostics: [async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    await provide();
    expect(errors, "unexpected browser console/page errors").toEqual([]);
  }, { auto: true }],
});

export async function selectWorkspace(page: Page, options: { navigate?: boolean } = {}) {
  if (options.navigate !== false) await page.goto("/");
  await page.getByRole("button", { name: "选择工作区" }).click();
  const dialog = page.getByRole("dialog", { name: "选择工作区" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("option", { name: /slug-project/ }).click();
  await dialog.getByRole("button", { name: "进入所选目录" }).click();
  await expect(dialog.getByText(/slug-project/, { exact: false }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "选择当前目录" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".composer-workspace")).toHaveAttribute("data-state", "valid");
}

export async function startTask(page: Page, prompt: string) {
  await selectWorkspace(page);
  await page.getByLabel("编程任务").fill(prompt);
  await page.getByRole("button", { name: "开始任务" }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/u);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

export { expect };
