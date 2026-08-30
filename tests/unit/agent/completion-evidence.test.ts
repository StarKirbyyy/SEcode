import { describe, expect, it } from "vitest";

import {
  createCompletionEvidenceState,
  completionEvidenceCorrectionBudgetExceeded,
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
        expectedSha256: "0".repeat(64),
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
    expect(requestCompletionEvidenceCorrection(state)).toBe(2);
    expect(requestCompletionEvidenceCorrection(state)).toBeUndefined();
  });

  it("bounds no-progress correction by model requests and tools, then resets on coverage", () => {
    const state = createCompletionEvidenceState();
    recordCompletionEvidenceToolResult(state, 1, invocation({
      name: "write_file",
      arguments: { path: "server/a.ts", content: "x" },
    }), success);
    expect(requestCompletionEvidenceCorrection(state, 2, 3)).toBe(1);
    expect(completionEvidenceCorrectionBudgetExceeded(state, 5, 10)).toBe(false);
    expect(completionEvidenceCorrectionBudgetExceeded(state, 6, 10)).toBe(true);
    expect(completionEvidenceCorrectionBudgetExceeded(state, 5, 11)).toBe(true);
    expect(recordCompletionEvidenceToolResult(state, 12, invocation({
      name: "run_process",
      arguments: { program: "pnpm", args: ["test"], cwd: "server", timeoutMs: 1_000 },
    }), success)).toBe(1);
    expect(state.correctionAttempts).toBe(0);
    expect(completionEvidenceCorrectionBudgetExceeded(state, 20, 20)).toBe(false);
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
