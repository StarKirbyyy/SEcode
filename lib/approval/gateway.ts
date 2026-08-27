import {
  ToolResultSchema,
  UuidSchema,
  type ApprovalId,
  type ToolCallId,
} from "@/lib/domain";
import type {
  LocalToolExecutionContext,
  PreparedLocalToolInvocation,
} from "@/lib/tools";

import {
  assessLocalToolRisk,
  createInvalidInvocationAssessment,
} from "./assessment";
import {
  consumeAuthorizedLocalToolInvocation,
  createApprovalToolFailure,
  createAuthorizedLocalToolInvocation,
  createPendingToolApproval,
  getPendingToolApprovalViewInternal,
  resolvePendingToolApproval,
} from "./capability";
import {
  nativeApprovalDependencies,
  type ApprovalDependencies,
} from "./dependencies";
import type {
  ApprovalLifecycleError,
  ApprovalResolutionResult,
  AuthorizationRequestResult,
  AuthorizedLocalToolInvocation,
  PendingToolApproval,
  PendingToolApprovalView,
} from "./types";

export interface ApprovalGateway {
  requestLocalToolAuthorization(
    toolCallId: ToolCallId,
    invocation: PreparedLocalToolInvocation,
  ): AuthorizationRequestResult;
  getPendingToolApprovalView(
    pending: PendingToolApproval,
  ): PendingToolApprovalView | ApprovalLifecycleError;
  resolveLocalToolApproval(
    pending: PendingToolApproval,
    approvalId: ApprovalId,
    decision: unknown,
  ): ApprovalResolutionResult;
  executeAuthorizedLocalTool(
    context: LocalToolExecutionContext,
    authorization: AuthorizedLocalToolInvocation,
  ): Promise<ReturnType<typeof ToolResultSchema.parse>>;
}

export function createApprovalGateway(
  dependencies: ApprovalDependencies,
): ApprovalGateway {
  return Object.freeze({
    requestLocalToolAuthorization(
      toolCallId: ToolCallId,
      invocation: PreparedLocalToolInvocation,
    ) {
      if (
        !UuidSchema.safeParse(toolCallId).success ||
        !dependencies.isPreparedInvocation(invocation)
      ) {
        const assessment = createInvalidInvocationAssessment();
        return Object.freeze({
          status: "denied",
          assessment,
          result: createApprovalToolFailure(
            "TOOL_AUTHORIZATION_INVALID",
            "工具调用身份或调用标识无效",
            false,
          ),
        });
      }

      const assessment = assessLocalToolRisk(invocation);
      if (assessment.decision === "allow") {
        return Object.freeze({
          status: "authorized",
          assessment,
          authorization: createAuthorizedLocalToolInvocation(
            toolCallId,
            invocation,
            assessment,
          ),
        });
      }
      if (assessment.decision === "require_approval") {
        const approvalId = UuidSchema.parse(dependencies.randomUUID());
        return Object.freeze({
          status: "approval_required",
          assessment,
          pending: createPendingToolApproval(
            approvalId,
            toolCallId,
            invocation,
            assessment,
          ),
        });
      }
      return Object.freeze({
        status: "denied",
        assessment,
        result: createApprovalToolFailure(
          "TOOL_POLICY_DENIED",
          assessment.reason,
          false,
        ),
      });
    },

    getPendingToolApprovalView: getPendingToolApprovalViewInternal,
    resolveLocalToolApproval: resolvePendingToolApproval,

    async executeAuthorizedLocalTool(
      context: LocalToolExecutionContext,
      authorization: AuthorizedLocalToolInvocation,
    ) {
      const consumed = consumeAuthorizedLocalToolInvocation(authorization);
      if (!consumed.ok) return consumed.result;
      const result = await dependencies.executePrepared(
        context,
        consumed.invocation,
      );
      return ToolResultSchema.parse(result);
    },
  });
}

const defaultGateway = createApprovalGateway(nativeApprovalDependencies);

export const requestLocalToolAuthorization =
  defaultGateway.requestLocalToolAuthorization;
export const getPendingToolApprovalView =
  defaultGateway.getPendingToolApprovalView;
export const resolveLocalToolApproval = defaultGateway.resolveLocalToolApproval;
export const executeAuthorizedLocalTool =
  defaultGateway.executeAuthorizedLocalTool;
