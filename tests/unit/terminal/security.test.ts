import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const terminalRoot = path.join(root, "lib", "terminal");

async function productionSources() {
  const files = (await readdir(terminalRoot)).filter((name) => name.endsWith(".ts"));
  files.push("../../cli/secode.ts");
  return Promise.all(files.map(async (name) => ({ name: path.basename(name), source: await readFile(path.resolve(terminalRoot, name), "utf8") })));
}

describe("terminal production security boundary", () => {
  it("contains no forbidden framework, process execution or bypass APIs", async () => {
    const files = await productionSources();
    const joined = files.map((file) => file.source).join("\n");
    for (const forbidden of [
      "langchain", "@ai-sdk", "openai-agents", 'from "blessed"', 'from "ink"', "dotenv",
      "node:child_process", "eval(", "new Function", ".complete(", ".appendEvent(",
      "executeAuthorizedLocalTool", "resolveLocalToolApproval", "requestLocalToolAuthorization",
    ]) expect(joined.toLowerCase()).not.toContain(forbidden.toLowerCase());
  });

  it("limits process streams/readline to node-io and the thin CLI", async () => {
    const files = await productionSources();
    for (const file of files) {
      if (file.name === "node-io.ts" || file.name === "secode.ts") continue;
      expect(file.source, file.name).not.toMatch(/process\.(?:stdin|stdout|stderr|argv|env|exitCode)/);
      expect(file.source, file.name).not.toContain("node:readline");
    }
  });

  it("keeps the CLI thin and dependent only on the terminal barrel", async () => {
    const source = await readFile(path.join(root, "cli", "secode.ts"), "utf8");
    expect(source.match(/^import /gm)).toHaveLength(1);
    expect(source).toContain('from "@/lib/terminal"');
    expect(source).not.toMatch(/@\/lib\/(?:agent|model|tools|storage|context|approval|workspace)/);
    expect(source).not.toContain("process.exit(");
  });

  it("adds only tsx as the terminal dependency and one agent script", async () => {
    const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    expect(packageJson.scripts.agent).toBe("tsx cli/secode.ts");
    expect(packageJson.devDependencies.tsx).toMatch(/^\^4\./);
    for (const name of ["langchain", "ai", "openai", "ink", "blessed", "dotenv", "commander", "yargs"])
      expect(packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name]).toBeUndefined();
  });
});
