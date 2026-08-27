import {
  ToolResultSchema,
  type ApprovalId,
  type ToolCallId,
  type ToolResult,
} from "@/lib/domain";
import type { PreparedLocalToolInvocation } from "@/lib/tools";

import { ApprovalDecisionSchema, type ApprovalDecision } from "./schemas";
import type {
  ApprovalLifecycleError,
  ApprovalLifecycleErrorCode,
  ApprovalResolutionResult,
  ApprovalToolErrorCode,
  AuthorizedLocalToolInvocation,
  PendingToolApproval,
  PendingToolApprovalView,
  RiskAssessment,
} from "./types";

interface PendingState {
  approvalId: ApprovalId;
  toolCallId: ToolCallId;
  invocation: PreparedLocalToolInvocation;
  assessment: Extract<RiskAssessment, { decision: "require_approval" }>;
  status: "pending" | "resolved";
}

interface AuthorizationState {
  toolCallId: ToolCallId;
  invocation: PreparedLocalToolInvocation;
  assessment: Extract<
    RiskAssessment,
    { decision: "allow" | "require_approval" }
  >;
  status: "unused" | "consumed";
}

const pendingStates = new WeakMap<object, PendingState>();
const authorizationStates = new WeakMap<object, AuthorizationState>();

function capabilityObject<T>(): T {
  return Object.freeze({}) as T;
}

export function createApprovalToolFailure(
  code: ApprovalToolErrorCode,
  message: string,
  recoverable: boolean,
): ToolResult {
  const result = ToolResultSchema.parse({
    ok: false,
    summary: message,
    error: { code, message, recoverable },
  });
  if (result.error === undefined) {
    throw new TypeError("approval failure result must contain an error");
  }
  return Object.freeze({
    ...result,
    error: Object.freeze({ ...result.error }),
  });
}

export function createApprovalLifecycleError(
  code: ApprovalLifecycleErrorCode,
  message: string,
): ApprovalLifecycleError {
  return Object.freeze({ code, message, recoverable: false });
}

function lookupPending(value: unknown): PendingState | undefined {
  if (value === null || typeof value !== "object") return undefined;
  return pendingStates.get(value);
}

function lookupAuthorization(value: unknown): AuthorizationState | undefined {
  if (value === null || typeof value !== "object") return undefined;
  return authorizationStates.get(value);
}

export function createPendingToolApproval(
  approvalId: ApprovalId,
  toolCallId: ToolCallId,
  invocation: PreparedLocalToolInvocation,
  assessment: Extract<RiskAssessment, { decision: "require_approval" }>,
): PendingToolApproval {
  const pending = capabilityObject<PendingToolApproval>();
  pendingStates.set(pending, {
    approvalId,
    toolCallId,
    invocation,
    assessment,
    status: "pending",
  });
  return pending;
}

export function createAuthorizedLocalToolInvocation(
  toolCallId: ToolCallId,
  invocation: PreparedLocalToolInvocation,
  assessment: Extract<
    RiskAssessment,
    { decision: "allow" | "require_approval" }
  >,
): AuthorizedLocalToolInvocation {
  const authorization = capabilityObject<AuthorizedLocalToolInvocation>();
  authorizationStates.set(authorization, {
    toolCallId,
    invocation,
    assessment,
    status: "unused",
  });
  return authorization;
}

export function getPendingToolApprovalViewInternal(
  pending: PendingToolApproval,
): PendingToolApprovalView | ApprovalLifecycleError {
  const state = lookupPending(pending);
  if (state === undefined) {
    return createApprovalLifecycleError(
      "APPROVAL_INVALID",
      "待审批对象无效",
    );
  }
  return Object.freeze({
    approvalId: state.approvalId,
    toolCallId: state.toolCallId,
    reason: state.assessment.reason,
    toolSummary: state.assessment.toolSummary,
  });
}

function parseDecision(value: unknown): ApprovalDecision | undefined {
  const result = ApprovalDecisionSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function resolvePendingToolApproval(
  pending: PendingToolApproval,
  approvalId: ApprovalId,
  decisionValue: unknown,
): ApprovalResolutionResult {
  const state = lookupPending(pending);
  if (state === undefined) {
    return Object.freeze({
      status: "invalid",
      error: createApprovalLifecycleError(
        "APPROVAL_INVALID",
        "待审批对象无效",
      ),
    });
  }
  if (state.status === "resolved") {
    return Object.freeze({
      status: "invalid",
      error: createApprovalLifecycleError(
        "APPROVAL_ALREADY_RESOLVED",
        "该审批已经处理",
      ),
    });
  }
  if (approvalId !== state.approvalId) {
    return Object.freeze({
      status: "invalid",
      error: createApprovalLifecycleError(
        "APPROVAL_ID_MISMATCH",
        "审批标识不匹配",
      ),
    });
  }
  const decision = parseDecision(decisionValue);
  if (decision === undefined) {
    return Object.freeze({
      status: "invalid",
      error: createApprovalLifecycleError(
        "APPROVAL_DECISION_INVALID",
        "审批决定格式无效",
      ),
    });
  }

  state.status = "resolved";
  if (!decision.approved) {
    return Object.freeze({
      status: "rejected",
      result: createApprovalToolFailure(
        "TOOL_APPROVAL_REJECTED",
        "用户拒绝执行该工具调用",
        true,
      ),
    });
  }
  return Object.freeze({
    status: "authorized",
    authorization: createAuthorizedLocalToolInvocation(
      state.toolCallId,
      state.invocation,
      state.assessment,
    ),
  });
}

export type ConsumeAuthorizationResult =
  | Readonly<{
      ok: true;
      toolCallId: ToolCallId;
      invocation: PreparedLocalToolInvocation;
    }>
  | Readonly<{ ok: false; result: ToolResult }>;

export function consumeAuthorizedLocalToolInvocation(
  authorization: AuthorizedLocalToolInvocation,
): ConsumeAuthorizationResult {
  const state = lookupAuthorization(authorization);
  if (state === undefined || state.status !== "unused") {
    return Object.freeze({
      ok: false,
      result: createApprovalToolFailure(
        "TOOL_AUTHORIZATION_INVALID",
        "工具执行授权无效或已使用",
        false,
      ),
    });
  }
  state.status = "consumed";
  return Object.freeze({
    ok: true,
    toolCallId: state.toolCallId,
    invocation: state.invocation,
  });
}
