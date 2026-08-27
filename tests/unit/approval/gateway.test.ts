import { describe, expect, it, vi } from "vitest";

import {
  ToolResultSchema,
  type ToolResult,
} from "@/lib/domain";
import { LocalToolExecutionAbortedError } from "@/lib/tools";
import { isPreparedLocalToolInvocation } from "@/lib/tools/registry";
import {
  createApprovalGateway,
  type ApprovalGateway,
} from "@/lib/approval/gateway";
import type { ApprovalDependencies } from "@/lib/approval/dependencies";
import type { AuthorizedLocalToolInvocation } from "@/lib/approval/types";
import type { PreparedLocalToolInvocation } from "@/lib/tools";

import {
  APPROVAL_ID,
  EMPTY_EXECUTION_CONTEXT,
  OTHER_APPROVAL_ID,
  TOOL_CALL_ID,
  prepared,
} from "./helpers";

function successResult(): ToolResult {
  return ToolResultSchema.parse({ ok: true, summary: "executed" });
}

function createHarness(
  implementation: ApprovalDependencies["executePrepared"] = async () =>
    successResult(),
): {
  gateway: ApprovalGateway;
  executePrepared: ReturnType<typeof vi.fn>;
} {
  const executePrepared = vi.fn(implementation);
  return {
    executePrepared,
    gateway: createApprovalGateway({
      randomUUID: () => APPROVAL_ID,
      isPreparedInvocation: isPreparedLocalToolInvocation,
      executePrepared,
    }),
  };
}

describe("approval gateway request and execution", () => {
  it("automatically authorizes a safe call and executes it once", async () => {
    const { gateway, executePrepared } = createHarness();
    const invocation = prepared("read_file", { path: "a.ts" });
    const requested = gateway.requestLocalToolAuthorization(
      TOOL_CALL_ID,
      invocation,
    );
    expect(requested).toMatchObject({
      status: "authorized",
      assessment: { decision: "allow", reasonCode: "TOOL_READ_ONLY" },
    });
    if (requested.status !== "authorized") return;

    await expect(
      gateway.executeAuthorizedLocalTool(
        EMPTY_EXECUTION_CONTEXT,
        requested.authorization,
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      gateway.executeAuthorizedLocalTool(
        EMPTY_EXECUTION_CONTEXT,
        requested.authorization,
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "TOOL_AUTHORIZATION_INVALID" },
    });
    expect(executePrepared).toHaveBeenCalledTimes(1);
    expect(executePrepared).toHaveBeenCalledWith(
      EMPTY_EXECUTION_CONTEXT,
      invocation,
    );
  });

  it("creates an approval view, tolerates correctable errors and authorizes", async () => {
    const { gateway, executePrepared } = createHarness();
    const invocation = prepared("run_process", {
      program: "pnpm",
      args: ["install"],
    });
    const requested = gateway.requestLocalToolAuthorization(
      TOOL_CALL_ID,
      invocation,
    );
    expect(requested.status).toBe("approval_required");
    if (requested.status !== "approval_required") return;
    expect(gateway.getPendingToolApprovalView(requested.pending)).toEqual({
      approvalId: APPROVAL_ID,
      toolCallId: TOOL_CALL_ID,
      reason: requested.assessment.reason,
      toolSummary: requested.assessment.toolSummary,
    });

    expect(
      gateway.resolveLocalToolApproval(
        requested.pending,
        OTHER_APPROVAL_ID,
        { approved: true },
      ),
    ).toMatchObject({
      status: "invalid",
      error: { code: "APPROVAL_ID_MISMATCH" },
    });
    const resolved = gateway.resolveLocalToolApproval(
      requested.pending,
      APPROVAL_ID,
      { approved: true, reason: "本次允许" },
    );
    expect(resolved.status).toBe("authorized");
    if (resolved.status !== "authorized") return;
    await gateway.executeAuthorizedLocalTool(
      EMPTY_EXECUTION_CONTEXT,
      resolved.authorization,
    );
    expect(executePrepared).toHaveBeenCalledTimes(1);
  });

  it("rejects approval without executing", () => {
    const { gateway, executePrepared } = createHarness();
    const requested = gateway.requestLocalToolAuthorization(
      TOOL_CALL_ID,
      prepared("run_process", { program: "bash", args: ["-c", "echo ok"] }),
    );
    if (requested.status !== "approval_required") {
      throw new Error("expected approval");
    }
    expect(
      gateway.resolveLocalToolApproval(requested.pending, APPROVAL_ID, {
        approved: false,
      }),
    ).toMatchObject({
      status: "rejected",
      result: {
        error: { code: "TOOL_APPROVAL_REJECTED", recoverable: true },
      },
    });
    expect(executePrepared).not.toHaveBeenCalled();
  });

  it("directly denies forbidden commands without creating approval", () => {
    const { gateway, executePrepared } = createHarness();
    expect(
      gateway.requestLocalToolAuthorization(
        TOOL_CALL_ID,
        prepared("run_process", { program: "sudo", args: ["true"] }),
      ),
    ).toMatchObject({
      status: "denied",
      assessment: {
        decision: "deny",
        reasonCode: "DENY_PRIVILEGE_ESCALATION",
      },
      result: { error: { code: "TOOL_POLICY_DENIED", recoverable: false } },
    });
    const denied = gateway.requestLocalToolAuthorization(
      TOOL_CALL_ID,
      prepared("run_process", { program: "sudo", args: ["true"] }),
    );
    expect(Object.isFrozen(denied)).toBe(true);
    if (denied.status === "denied") {
      expect(Object.isFrozen(denied.assessment)).toBe(true);
      expect(Object.isFrozen(denied.result)).toBe(true);
      expect(Object.isFrozen(denied.result.error)).toBe(true);
    }
    expect(executePrepared).not.toHaveBeenCalled();
  });

  it("denies invalid call IDs and forged prepared invocations", () => {
    const { gateway, executePrepared } = createHarness();
    const valid = prepared("read_file", { path: "a.ts" });
    expect(
      gateway.requestLocalToolAuthorization("not-a-uuid", valid),
    ).toMatchObject({
      status: "denied",
      assessment: { reasonCode: "DENY_INVALID_INVOCATION" },
      result: { error: { code: "TOOL_AUTHORIZATION_INVALID" } },
    });
    const forged = {
      name: "read_file",
      arguments: { path: "a.ts", startLine: 1 },
    } as unknown as PreparedLocalToolInvocation;
    expect(
      gateway.requestLocalToolAuthorization(TOOL_CALL_ID, forged),
    ).toMatchObject({
      status: "denied",
      assessment: { reasonCode: "DENY_INVALID_INVOCATION" },
    });
    expect(executePrepared).not.toHaveBeenCalled();
  });

  it("rejects forged and round-tripped authorization without execution", async () => {
    const { gateway, executePrepared } = createHarness();
    for (const authorization of [
      {} as AuthorizedLocalToolInvocation,
      JSON.parse("{}") as AuthorizedLocalToolInvocation,
    ]) {
      await expect(
        gateway.executeAuthorizedLocalTool(
          EMPTY_EXECUTION_CONTEXT,
          authorization,
        ),
      ).resolves.toMatchObject({
        error: { code: "TOOL_AUTHORIZATION_INVALID" },
      });
    }
    expect(executePrepared).not.toHaveBeenCalled();
  });

  it("consumes authorization before failures and propagates cancellation", async () => {
    const aborted = new LocalToolExecutionAbortedError("cancelled");
    const { gateway, executePrepared } = createHarness(async () => {
      throw aborted;
    });
    const requested = gateway.requestLocalToolAuthorization(
      TOOL_CALL_ID,
      prepared("read_file", { path: "a.ts" }),
    );
    if (requested.status !== "authorized") throw new Error("expected allow");
    await expect(
      gateway.executeAuthorizedLocalTool(
        EMPTY_EXECUTION_CONTEXT,
        requested.authorization,
      ),
    ).rejects.toBe(aborted);
    await expect(
      gateway.executeAuthorizedLocalTool(
        EMPTY_EXECUTION_CONTEXT,
        requested.authorization,
      ),
    ).resolves.toMatchObject({
      error: { code: "TOOL_AUTHORIZATION_INVALID" },
    });
    expect(executePrepared).toHaveBeenCalledTimes(1);
  });
});
