import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const cwd = process.cwd();
const cleanups: string[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function run(
  args: readonly string[],
  environment: Record<string, string> = {},
  direct = false,
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const childEnvironment: NodeJS.ProcessEnv = { ...process.env, ...environment };
    const child = spawn(
      "pnpm",
      direct ? ["exec", "tsx", "cli/secode.ts", ...args] : ["agent", "--", ...args],
      {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnvironment,
      },
    );
    child.stdin.end();
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("terminal child timed out"));
    }, 10_000);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

describe("terminal CLI subprocess", () => {
  it("prints help with exit 0 and no durable side effects", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "secode-process-help-"));
    cleanups.push(root);
    const dataDir = path.join(root, "data");
    const result = await run(["--help"], { SECODE_DATA_DIR: dataDir, DEEPSEEK_API_KEY: "sk-process-secret" });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("SEcode 本地编程智能体");
    expect(`${result.stdout}${result.stderr}`).not.toContain("sk-process-secret");
    await expect(access(dataDir)).rejects.toBeDefined();
  });

  it("rejects non-TTY setup before creating the data root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "secode-process-tty-"));
    cleanups.push(root);
    const dataDir = path.join(root, "data");
    const result = await run(["--data-dir", dataDir]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("TERMINAL_TTY_REQUIRED");
    await expect(access(dataDir)).rejects.toBeDefined();
  });

  it("rejects illegal argv without stack, secret or unhandled rejection", async () => {
    const secret = "sk-process-invalid-secret";
    const result = await run(["--api-key", secret], {}, true);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("TERMINAL_ARGUMENT_INVALID");
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/(?:at .+\.ts:\d+|UnhandledPromiseRejection|Error:)/);
  });
});
