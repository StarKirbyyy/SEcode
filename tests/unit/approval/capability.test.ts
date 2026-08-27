import { describe, expect, it } from "vitest";

import { assessLocalToolRisk } from "@/lib/approval/assessment";
import {
  consumeAuthorizedLocalToolInvocation,
  createAuthorizedLocalToolInvocation,
  createPendingToolApproval,
  getPendingToolApprovalViewInternal,
  resolvePendingToolApproval,
} from "@/lib/approval/capability";
import type {
  AuthorizedLocalToolInvocation,
  PendingToolApproval,
  RiskAssessment,
} from "@/lib/approval/types";

import {
  APPROVAL_ID,
  OTHER_APPROVAL_ID,
  TOOL_CALL_ID,
  prepared,
} from "./helpers";

function approvalInvocation() {
  return prepared("run_process", { program: "pnpm", args: ["install"] });
}

function approvalAssessment() {
  return assessLocalToolRisk(approvalInvocation()) as Extract<
    RiskAssessment,
    { decision: "require_approval" }
  >;
}

describe("pending tool approval capability", () => {
  it("exposes only the event-compatible frozen public view", () => {
    const invocation = approvalInvocation();
    const assessment = approvalAssessment();
    const pending = createPendingToolApproval(
      APPROVAL_ID,
      TOOL_CALL_ID,
      invocation,
      assessment,
    );
    const view = getPendingToolApprovalViewInternal(pending);
    expect(view).toEqual({
      approvalId: APPROVAL_ID,
      toolCallId: TOOL_CALL_ID,
      reason: assessment.reason,
      toolSummary: assessment.toolSummary,
    });
    expect(Object.isFrozen(pending)).toBe(true);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.keys(pending)).toEqual([]);
    expect(JSON.stringify(pending)).toBe("{}");
  });

  it("rejects forged pending objects", () => {
    const forged = {} as PendingToolApproval;
    expect(getPendingToolApprovalViewInternal(forged)).toMatchObject({
      code: "APPROVAL_INVALID",
      recoverable: false,
    });
    expect(
      resolvePendingToolApproval(forged, APPROVAL_ID, { approved: true }),
    ).toMatchObject({
      status: "invalid",
      error: { code: "APPROVAL_INVALID" },
    });
  });

  it("keeps pending after ID or decision errors, then authorizes exactly once", () => {
    const invocation = approvalInvocation();
    const pending = createPendingToolApproval(
      APPROVAL_ID,
      TOOL_CALL_ID,
      invocation,
      approvalAssessment(),
    );
    expect(
      resolvePendingToolApproval(pending, OTHER_APPROVAL_ID, { approved: true }),
    ).toMatchObject({
      status: "invalid",
      error: { code: "APPROVAL_ID_MISMATCH" },
    });
    expect(
      resolvePendingToolApproval(pending, APPROVAL_ID, {
        approved: true,
        always: true,
      }),
    ).toMatchObject({
      status: "invalid",
      error: { code: "APPROVAL_DECISION_INVALID" },
    });

    const approved = resolvePendingToolApproval(pending, APPROVAL_ID, {
      approved: true,
      reason: "本次允许",
    });
    expect(approved.status).toBe("authorized");
    expect(
      resolvePendingToolApproval(pending, APPROVAL_ID, { approved: true }),
    ).toMatchObject({
      status: "invalid",
      error: { code: "APPROVAL_ALREADY_RESOLVED" },
    });
  });

  it("turns rejection into a recoverable ToolResult and resolves pending", () => {
    const invocation = approvalInvocation();
    const pending = createPendingToolApproval(
      APPROVAL_ID,
      TOOL_CALL_ID,
      invocation,
      approvalAssessment(),
    );
    expect(
      resolvePendingToolApproval(pending, APPROVAL_ID, { approved: false }),
    ).toMatchObject({
      status: "rejected",
      result: {
        ok: false,
        error: { code: "TOOL_APPROVAL_REJECTED", recoverable: true },
      },
    });
    expect(
      resolvePendingToolApproval(pending, APPROVAL_ID, { approved: false }),
    ).toMatchObject({
      status: "invalid",
      error: { code: "APPROVAL_ALREADY_RESOLVED" },
    });
  });
});

describe("authorized invocation capability", () => {
  it("is opaque, frozen and consumed once", () => {
    const invocation = prepared("read_file", { path: "a.ts" });
    const assessment = assessLocalToolRisk(invocation) as Extract<
      RiskAssessment,
      { decision: "allow" }
    >;
    const authorization = createAuthorizedLocalToolInvocation(
      TOOL_CALL_ID,
      invocation,
      assessment,
    );
    expect(Object.isFrozen(authorization)).toBe(true);
    expect(Object.keys(authorization)).toEqual([]);
    expect(JSON.stringify(authorization)).toBe("{}");

    expect(consumeAuthorizedLocalToolInvocation(authorization)).toMatchObject({
      ok: true,
      toolCallId: TOOL_CALL_ID,
      invocation,
    });
    expect(consumeAuthorizedLocalToolInvocation(authorization)).toMatchObject({
      ok: false,
      result: { error: { code: "TOOL_AUTHORIZATION_INVALID" } },
    });
  });

  it.each([
    {} as AuthorizedLocalToolInvocation,
    JSON.parse("{}") as AuthorizedLocalToolInvocation,
  ])("rejects a forged or round-tripped authorization", (authorization) => {
    expect(consumeAuthorizedLocalToolInvocation(authorization)).toMatchObject({
      ok: false,
      result: { error: { code: "TOOL_AUTHORIZATION_INVALID" } },
    });
  });
});
