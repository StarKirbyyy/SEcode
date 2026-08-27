import { describe, expect, it } from "vitest";

import { ApprovalDecisionSchema } from "@/lib/approval/schemas";
import {
  APPROVAL_LIFECYCLE_ERROR_CODES,
  APPROVAL_TOOL_ERROR_CODES,
  MAX_APPROVAL_REASON_CHARACTERS,
  RISK_DECISIONS,
  RISK_LEVELS,
  RISK_REASON_CODES,
} from "@/lib/approval/types";

describe("approval decision schema", () => {
  it("accepts both decisions and preserves the optional reason", () => {
    expect(ApprovalDecisionSchema.parse({ approved: true })).toEqual({
      approved: true,
    });
    expect(
      ApprovalDecisionSchema.parse({ approved: false, reason: "" }),
    ).toEqual({ approved: false, reason: "" });
    const reason = "中".repeat(MAX_APPROVAL_REASON_CHARACTERS);
    expect(
      ApprovalDecisionSchema.parse({ approved: true, reason }).reason,
    ).toBe(reason);
  });

  it("rejects unknown fields, invalid decisions and oversized reasons", () => {
    expect(
      ApprovalDecisionSchema.safeParse({ approved: true, always: true }).success,
    ).toBe(false);
    expect(ApprovalDecisionSchema.safeParse({ approved: "yes" }).success).toBe(
      false,
    );
    expect(ApprovalDecisionSchema.safeParse(null).success).toBe(false);
    expect(ApprovalDecisionSchema.safeParse([]).success).toBe(false);
    expect(
      ApprovalDecisionSchema.safeParse({
        approved: false,
        reason: "x".repeat(MAX_APPROVAL_REASON_CHARACTERS + 1),
      }).success,
    ).toBe(false);
  });
});

describe("approval constants", () => {
  it("contains the approved decisions, levels and stable errors", () => {
    expect(RISK_DECISIONS).toEqual(["allow", "require_approval", "deny"]);
    expect(RISK_LEVELS).toEqual(["low", "medium", "high", "blocked"]);
    expect(RISK_REASON_CODES).toContain("DENY_INVALID_INVOCATION");
    expect(APPROVAL_TOOL_ERROR_CODES).toEqual([
      "TOOL_POLICY_DENIED",
      "TOOL_APPROVAL_REJECTED",
      "TOOL_AUTHORIZATION_INVALID",
    ]);
    expect(APPROVAL_LIFECYCLE_ERROR_CODES).toHaveLength(4);
  });
});
