import type {
  ApprovalId,
  ToolCallId,
  ToolResult,
} from "@/lib/domain";

export const RISK_DECISIONS = [
  "allow",
  "require_approval",
  "deny",
] as const;
export const RISK_LEVELS = ["low", "medium", "high", "blocked"] as const;

export const RISK_REASON_CODES = [
  "TOOL_READ_ONLY",
  "TOOL_WORKSPACE_WRITE",
  "PROCESS_VERIFICATION",
  "PROCESS_GIT_READ_ONLY",
  "PROCESS_DEPENDENCY_CHANGE",
  "PROCESS_REPOSITORY_WRITE",
  "PROCESS_SHELL",
  "PROCESS_MIGRATION",
  "PROCESS_REPO_FORMAT",
  "PROCESS_FILE_DELETE",
  "PROCESS_UNKNOWN",
  "PROCESS_PATH_QUALIFIED",
  "DENY_PRIVILEGE_ESCALATION",
  "DENY_SYSTEM_CONTROL",
  "DENY_PROCESS_CONTROL",
  "DENY_BROAD_DELETE",
  "DENY_GIT_HARD_RESET",
  "DENY_EXPLICIT_WORKSPACE_ESCAPE",
  "DENY_INVALID_INVOCATION",
] as const;

export const APPROVAL_TOOL_ERROR_CODES = [
  "TOOL_POLICY_DENIED",
  "TOOL_APPROVAL_REJECTED",
  "TOOL_AUTHORIZATION_INVALID",
] as const;

export const APPROVAL_LIFECYCLE_ERROR_CODES = [
  "APPROVAL_INVALID",
  "APPROVAL_ALREADY_RESOLVED",
  "APPROVAL_ID_MISMATCH",
  "APPROVAL_DECISION_INVALID",
] as const;

export const MAX_APPROVAL_REASON_CHARACTERS = 4_096;
export const MAX_TOOL_SUMMARY_CHARACTERS = 1_024;

export type RiskDecision = (typeof RISK_DECISIONS)[number];
export type RiskLevel = (typeof RISK_LEVELS)[number];
export type RiskReasonCode = (typeof RISK_REASON_CODES)[number];
export const WORKSPACE_PERMISSION_MODES = ["ask", "full"] as const;
export type WorkspacePermissionMode = (typeof WORKSPACE_PERMISSION_MODES)[number];
export type ApprovalToolErrorCode =
  (typeof APPROVAL_TOOL_ERROR_CODES)[number];
export type ApprovalLifecycleErrorCode =
  (typeof APPROVAL_LIFECYCLE_ERROR_CODES)[number];

interface AssessmentFields {
  reasonCode: RiskReasonCode;
  reason: string;
  toolSummary: string;
}

export type RiskAssessment =
  | Readonly<
      AssessmentFields & {
        decision: "allow";
        level: "low" | "medium";
      }
    >
  | Readonly<
      AssessmentFields & {
        decision: "require_approval";
        level: "high";
      }
    >
  | Readonly<
      AssessmentFields & {
        decision: "deny";
        level: "blocked";
      }
    >;

export interface ApprovalLifecycleError {
  readonly code: ApprovalLifecycleErrorCode;
  readonly message: string;
  readonly recoverable: false;
}

declare const pendingToolApprovalBrand: unique symbol;
declare const authorizedLocalToolInvocationBrand: unique symbol;

export type PendingToolApproval = Readonly<{
  [pendingToolApprovalBrand]: true;
}>;

export type AuthorizedLocalToolInvocation = Readonly<{
  [authorizedLocalToolInvocationBrand]: true;
}>;

export interface PendingToolApprovalView {
  approvalId: ApprovalId;
  toolCallId: ToolCallId;
  reason: string;
  toolSummary: string;
}

export type AuthorizationRequestResult =
  | Readonly<{
      status: "authorized";
      assessment: Extract<RiskAssessment, { decision: "allow" }>;
      authorization: AuthorizedLocalToolInvocation;
    }>
  | Readonly<{
      status: "approval_required";
      assessment: Extract<
        RiskAssessment,
        { decision: "require_approval" }
      >;
      pending: PendingToolApproval;
    }>
  | Readonly<{
      status: "denied";
      assessment: Extract<RiskAssessment, { decision: "deny" }>;
      result: ToolResult;
    }>;

export type ApprovalResolutionResult =
  | Readonly<{
      status: "authorized";
      authorization: AuthorizedLocalToolInvocation;
    }>
  | Readonly<{
      status: "rejected";
      result: ToolResult;
    }>
  | Readonly<{
      status: "invalid";
      error: ApprovalLifecycleError;
    }>;
