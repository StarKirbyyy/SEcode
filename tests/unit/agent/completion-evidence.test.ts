import { describe, expect, it } from "vitest";

import {
  appendVerificationWarning,
  createCompletionEvidenceState,
  getUncoveredCompletionEvidence,
  getCurrentValidationEvidence,
  getUncoveredCompletionScopes,
  recordCompletionEvidenceToolResult,
  requestCompletionEvidenceCorrection,
} from "@/lib/agent/completion-evidence";
import type { PreparedLocalToolInvocation } from "@/lib/tools";

function invocation(value: unknown): PreparedLocalToolInvocation {
  return value as PreparedLocalToolInvocation;
}

const success = { ok: true, summary: "完成" } as const;
const failure = {
  ok: false,
  summary: "失败",
  error: { code: "PROCESS_EXIT_NONZERO", message: "退出非零", recoverable: true },
} as const;

describe("completion evidence", () => {
  it("appends one bounded redacted verification warning", () => {
    const evidence = {
      scopes: ["src"],
      paths: ["src/sk-abcdefghijklmnopqrstuvwxyz.ts"],
      totalPaths: 18,
      pathsTruncated: true,
    };
    const appended = appendVerificationWarning("修改已交付。", evidence);
    expect(appended).toContain("验证未完整");
    expect(appended).toContain("共 18 项");
    expect(appended).toContain("[REDACTED]");
    expect(appendVerificationWarning(appended, evidence)).toBe(appended);
    expect(appendVerificationWarning("测试未完成，当前交付受限。", evidence))
      .toBe("测试未完成，当前交付受限。");
  });

  it("replays the latest multi-scope run without leaving coordinator or smoke paths pending", () => {
    const state = createCompletionEvidenceState();
    const write = (seq: number, path: string) => recordCompletionEvidenceToolResult(
      state,
      seq,
      invocation({ name: "write_file", arguments: { path, content: "x" } }),
      success,
    );
    const run = (seq: number, program: string, args: string[], cwd: string) =>
      recordCompletionEvidenceToolResult(state, seq, invocation({
        name: "run_process",
        arguments: { program, args, cwd, timeoutMs: 1_000, lifecycle: "oneshot" },
      }), success);

    write(1, "task-board/server/src/db.ts");
    write(2, "task-board/client/src/App.tsx");
    write(3, "task-board/package.json");
    write(4, "task-board/.gitignore");
    run(5, "npm", ["test"], "task-board/server");
    run(6, "npm", ["run", "build"], "task-board/client");
    write(7, "task-board/scripts/smoke-api.js");
    run(8, "node", ["scripts/smoke-api.js"], "task-board");

    expect(getUncoveredCompletionEvidence(state)).toEqual({
      scopes: [],
      paths: [],
      totalPaths: 0,
      pathsTruncated: false,
    });
    expect(state.pendingValidation).toBe(false);
    expect(state.verifiedAfterMutation).toEqual(["test", "build"]);
  });

  it("does not let a server validator cover an unverified client sibling or root coordinator", () => {
    const state = createCompletionEvidenceState();
    for (const [seq, path] of [
      [1, "task-board/server/a.ts"],
      [2, "task-board/client/b.ts"],
      [3, "task-board/package.json"],
    ] as const) {
      recordCompletionEvidenceToolResult(state, seq, invocation({
        name: "write_file",
        arguments: { path, content: "x" },
      }), success);
    }
    recordCompletionEvidenceToolResult(state, 4, invocation({
      name: "run_process",
      arguments: { program: "npm", args: ["test"], cwd: "task-board/server", timeoutMs: 1_000 },
    }), success);

    expect(getUncoveredCompletionEvidence(state).paths).toEqual([
      "task-board/client/b.ts",
      "task-board/package.json",
    ]);
  });

  it("requires a new validator after rewriting a root coordinator", () => {
    const state = createCompletionEvidenceState();
    recordCompletionEvidenceToolResult(state, 1, invocation({
      name: "write_file",
      arguments: { path: "task-board/server/a.ts", content: "x" },
    }), success);
    recordCompletionEvidenceToolResult(state, 2, invocation({
      name: "write_file",
      arguments: { path: "task-board/package.json", content: "{}" },
    }), success);
    recordCompletionEvidenceToolResult(state, 3, invocation({
      name: "run_process",
      arguments: { program: "npm", args: ["test"], cwd: "task-board/server", timeoutMs: 1_000 },
    }), success);
    expect(state.pendingValidation).toBe(false);

    recordCompletionEvidenceToolResult(state, 4, invocation({
      name: "write_file",
      arguments: { path: "task-board/package.json", content: "{\"changed\":true}" },
    }), success);
    expect(getUncoveredCompletionEvidence(state).paths).toEqual(["task-board/package.json"]);
  });

  it("only treats an exact pending test-like node script as direct evidence", () => {
    const state = createCompletionEvidenceState();
    for (const [seq, path] of [
      [1, "scripts/smoke-api.js"],
      [2, "server.js"],
    ] as const) {
      recordCompletionEvidenceToolResult(state, seq, invocation({
        name: "write_file",
        arguments: { path, content: "" },
      }), success);
    }
    recordCompletionEvidenceToolResult(state, 3, invocation({
      name: "run_process",
      arguments: { program: "node", args: ["scripts/smoke-api.js"], cwd: ".", timeoutMs: 1_000 },
    }), success);
    expect(getUncoveredCompletionEvidence(state).paths).toEqual(["server.js"]);

    for (const args of [["server.js"], ["-e", "console.log('PASS')"]]) {
      recordCompletionEvidenceToolResult(state, 4, invocation({
        name: "run_process",
        arguments: { program: "node", args, cwd: ".", timeoutMs: 1_000 },
      }), success);
    }
    expect(getUncoveredCompletionEvidence(state).paths).toEqual(["server.js"]);
  });

  it("does not require validation after writing .gitignore", () => {
    const state = createCompletionEvidenceState();
    recordCompletionEvidenceToolResult(state, 1, invocation({
      name: "write_file",
      arguments: { path: ".gitignore", content: "dist/" },
    }), success);
    expect(state.pendingValidation).toBe(false);
  });

  it("does not require validation after documentation-only writes", () => {
    const state = createCompletionEvidenceState();
    for (const path of ["README.md", "docs/a.mdx", "notes/a.txt", "docs/a.rst"]) {
      recordCompletionEvidenceToolResult(state, 1, invocation({
        name: "write_file",
        arguments: { path, content: "说明" },
      }), success);
    }
    expect(state.pendingValidation).toBe(false);
  });

  it("requires a successful post-change validation that covers the mutation cwd", () => {
    const state = createCompletionEvidenceState();
    recordCompletionEvidenceToolResult(state, 2, invocation({
      name: "replace_in_file",
      arguments: {
        path: "app/page.tsx",
        oldText: "a",
        newText: "b",
      },
    }), success);
    expect(state).toMatchObject({ lastRelevantMutationSeq: 2, pendingValidation: true });

    recordCompletionEvidenceToolResult(state, 3, invocation({
      name: "run_process",
      arguments: { program: "pnpm", args: ["test"], cwd: "tests", timeoutMs: 1_000, lifecycle: "oneshot" },
    }), success);
    expect(state.pendingValidation).toBe(true);

    recordCompletionEvidenceToolResult(state, 4, invocation({
      name: "run_process",
      arguments: { program: "pnpm", args: ["typecheck"], cwd: ".", timeoutMs: 1_000, lifecycle: "oneshot" },
    }), success);
    expect(state.pendingValidation).toBe(false);
    expect(state.verifiedAfterMutation).toEqual(["typecheck"]);
  });

  it.each([
    ["pnpm", ["lint"], "lint"],
    ["npm", ["run", "check"], "typecheck"],
    ["tsc", ["--noEmit"], "typecheck"],
    ["pnpm", ["exec", "vitest", "run"], "test"],
    ["npx", ["playwright", "test"], "test"],
    ["pytest", ["tests"], "test"],
    ["cargo", ["test"], "test"],
    ["go", ["test", "./..."], "test"],
    ["pnpm", ["build"], "build"],
    ["node", ["--test"], "test"],
    ["node", ["--test", "client/verify-integration.mjs"], "test"],
  ] as const)("classifies %s %j as %s", (program, args, expected) => {
    const state = createCompletionEvidenceState();
    recordCompletionEvidenceToolResult(state, 1, invocation({
      name: "write_file",
      arguments: { path: "src/a.ts", content: "x" },
    }), success);
    recordCompletionEvidenceToolResult(state, 2, invocation({
      name: "run_process",
      arguments: { program, args: [...args], cwd: ".", timeoutMs: 1_000, lifecycle: "oneshot" },
    }), success);
    expect(state.verifiedAfterMutation).toEqual([expected]);
    expect(state.pendingValidation).toBe(false);
  });

  it("returns a bounded, stable view of uncovered relative paths", () => {
    const state = createCompletionEvidenceState();
    for (let index = 14; index >= 0; index -= 1) {
      recordCompletionEvidenceToolResult(state, 20 - index, invocation({
        name: "write_file",
        arguments: {
          path: `client/${String(index).padStart(2, "0")}-${"长".repeat(300)}.ts`,
          content: "export {};",
        },
      }), success);
    }

    const view = getUncoveredCompletionEvidence(state);
    expect(view.scopes).toEqual(["client"]);
    expect(view.paths.length).toBeGreaterThan(0);
    expect(view.paths.length).toBeLessThanOrEqual(12);
    expect(view.paths).toEqual([...view.paths].sort());
    expect(view.paths.every((value) => [...value].length <= 256)).toBe(true);
    expect([...view.paths.join("\n")].length).toBeLessThanOrEqual(2_048);
    expect(view).toMatchObject({ totalPaths: 15, pathsTruncated: true });
  });

  it("rejects failed, service, readiness, HTTP and unknown commands as evidence", () => {
    const state = createCompletionEvidenceState();
    recordCompletionEvidenceToolResult(state, 1, invocation({
      name: "write_file",
      arguments: { path: "src/a.ts", content: "x" },
    }), success);
    const commands = [
      { program: "pnpm", args: ["test"], lifecycle: "oneshot" as const, result: failure },
      { program: "pnpm", args: ["dev"], lifecycle: "service" as const, result: success },
      { program: "curl", args: ["http://localhost:3000"], lifecycle: "oneshot" as const, result: success },
      { program: "node", args: ["server.js"], lifecycle: "oneshot" as const, result: success },
    ];
    for (const [index, command] of commands.entries()) {
      recordCompletionEvidenceToolResult(state, index + 2, invocation({
        name: "run_process",
        arguments: {
          program: command.program,
          args: command.args,
          cwd: ".",
          timeoutMs: 1_000,
          lifecycle: command.lifecycle,
          readiness: command.lifecycle === "service"
            ? { url: "http://127.0.0.1:3000", expectedStatus: 200 }
            : undefined,
        },
      }), command.result);
    }
    expect(state.pendingValidation).toBe(true);
    expect(state.verifiedAfterMutation).toEqual([]);
  });

  it("a later relevant mutation resets evidence and correction is bounded", () => {
    const state = createCompletionEvidenceState();
    const write = (seq: number) => recordCompletionEvidenceToolResult(state, seq, invocation({
      name: "write_file",
      arguments: { path: "src/a.ts", content: String(seq) },
    }), success);
    write(1);
    recordCompletionEvidenceToolResult(state, 2, invocation({
      name: "run_process",
      arguments: { program: "pnpm", args: ["lint"], cwd: ".", timeoutMs: 1_000, lifecycle: "oneshot" },
    }), success);
    write(3);
    expect(state).toMatchObject({ pendingValidation: true, verifiedAfterMutation: [] });
    expect(requestCompletionEvidenceCorrection(state)).toBe(1);
    expect(requestCompletionEvidenceCorrection(state)).toBeUndefined();
  });

  it("requests only one correction and resets it after coverage", () => {
    const state = createCompletionEvidenceState();
    recordCompletionEvidenceToolResult(state, 1, invocation({
      name: "write_file",
      arguments: { path: "server/a.ts", content: "x" },
    }), success);
    expect(requestCompletionEvidenceCorrection(state)).toBe(1);
    expect(requestCompletionEvidenceCorrection(state)).toBeUndefined();
    expect(recordCompletionEvidenceToolResult(state, 12, invocation({
      name: "run_process",
      arguments: { program: "pnpm", args: ["test"], cwd: "server", timeoutMs: 1_000 },
    }), success)).toBe(1);
    expect(state.correctionAttempts).toBe(0);
    expect(requestCompletionEvidenceCorrection(state)).toBeUndefined();
  });

  it("combines successful verification evidence from distinct workspace scopes", () => {
    const state = createCompletionEvidenceState();
    for (const [seq, path] of [[1, "server/a.ts"], [2, "client/b.ts"]] as const) {
      recordCompletionEvidenceToolResult(state, seq, invocation({
        name: "write_file",
        arguments: { path, content: "x" },
      }), success);
    }
    recordCompletionEvidenceToolResult(state, 3, invocation({
      name: "run_process",
      arguments: { program: "pnpm", args: ["test"], cwd: "server", timeoutMs: 1_000 },
    }), success);
    expect(state.pendingValidation).toBe(true);
    expect(getUncoveredCompletionScopes(state)).toEqual(["client"]);
    recordCompletionEvidenceToolResult(state, 4, invocation({
      name: "run_process",
      arguments: { program: "pnpm", args: ["build"], cwd: "client", timeoutMs: 1_000 },
    }), success);
    expect(state.pendingValidation).toBe(false);
    expect(getUncoveredCompletionScopes(state)).toEqual([]);
    expect(state.verifiedAfterMutation).toEqual(["test", "build"]);
  });

  it("a later mutation invalidates only its own scope", () => {
    const state = createCompletionEvidenceState();
    for (const [seq, path] of [[1, "server/a.ts"], [2, "client/b.ts"]] as const) {
      recordCompletionEvidenceToolResult(state, seq, invocation({
        name: "write_file",
        arguments: { path, content: "x" },
      }), success);
    }
    recordCompletionEvidenceToolResult(state, 3, invocation({
      name: "run_process",
      arguments: { program: "pnpm", args: ["test"], cwd: ".", timeoutMs: 1_000 },
    }), success);
    recordCompletionEvidenceToolResult(state, 4, invocation({
      name: "write_file",
      arguments: { path: "server/a.ts", content: "changed" },
    }), success);
    expect(getUncoveredCompletionScopes(state)).toEqual(["server"]);
    expect(getCurrentValidationEvidence(state)).toEqual([]);
    recordCompletionEvidenceToolResult(state, 5, invocation({
      name: "run_process",
      arguments: { program: "pnpm", args: ["build"], cwd: "client", timeoutMs: 1_000 },
    }), success);
    expect(getUncoveredCompletionScopes(state)).toEqual(["server"]);
  });
});
