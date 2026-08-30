import { describe, expect, it } from "vitest";

import {
  createValidationRepairState,
  recordValidationRepairToolResult,
} from "@/lib/agent/validation-repair";
import type { ToolResult } from "@/lib/domain";
import type { PreparedLocalToolInvocation } from "@/lib/tools";

function invocation(value: unknown): PreparedLocalToolInvocation {
  return value as PreparedLocalToolInvocation;
}

const failedTypecheck: ToolResult = {
  ok: false,
  summary: "进程退出码非零",
  output: "src/a.ts(1,1): error TS2322: Type 'string' is not assignable",
  error: {
    code: "PROCESS_EXIT_NONZERO",
    message: "进程退出码非零",
    recoverable: true,
  },
};
const success: ToolResult = { ok: true, summary: "完成" };

describe("validation repair", () => {
  it("stops the third identical validator diagnostic after successful mutations", () => {
    const state = createValidationRepairState();
    const validator = invocation({
      name: "run_process",
      arguments: { program: "pnpm", args: ["typecheck"], cwd: ".", timeoutMs: 1_000, lifecycle: "oneshot" },
    });
    const mutation = invocation({
      name: "write_file",
      arguments: { path: "src/a.ts", content: "export {};" },
    });

    expect(recordValidationRepairToolResult(state, validator, failedTypecheck))
      .toMatchObject({ kind: "validator_failure", warning: false, shouldFail: false });
    recordValidationRepairToolResult(state, mutation, success);
    expect(recordValidationRepairToolResult(state, validator, failedTypecheck))
      .toMatchObject({
        kind: "validator_failure",
        verificationKind: "typecheck",
        failedAttempts: 2,
        repeatedDiagnostic: true,
        mutatedPaths: ["src/a.ts"],
        warning: true,
        shouldFail: false,
      });
    recordValidationRepairToolResult(state, mutation, success);
    expect(recordValidationRepairToolResult(state, validator, failedTypecheck))
      .toMatchObject({
        kind: "validator_failure",
        failedAttempts: 3,
        repeatedDiagnostic: true,
        warning: true,
        shouldFail: true,
      });
  });

  it("does not treat a changed diagnostic or an ordinary Node script as the same repair loop", () => {
    const state = createValidationRepairState();
    const validator = invocation({
      name: "run_process",
      arguments: { program: "node", args: ["verify.js"], cwd: ".", timeoutMs: 1_000, lifecycle: "oneshot" },
    });
    expect(recordValidationRepairToolResult(state, validator, failedTypecheck))
      .toEqual({ kind: "ignored" });

    const typecheck = invocation({
      name: "run_process",
      arguments: { program: "pnpm", args: ["typecheck"], cwd: ".", timeoutMs: 1_000, lifecycle: "oneshot" },
    });
    recordValidationRepairToolResult(state, typecheck, failedTypecheck);
    const changed = {
      ...failedTypecheck,
      output: "src/b.ts(2,1): error TS2304: Cannot find name",
    };
    expect(recordValidationRepairToolResult(state, typecheck, changed))
      .toMatchObject({ repeatedDiagnostic: false, shouldFail: false });
  });
});
