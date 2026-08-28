import {
  ApprovalRequestSchema,
  RouteUuidSchema,
  apiErrorInfoResponse,
  getServerApplication,
  handleApiRequest,
  jsonResponse,
  readJsonBody,
  type RouteContext,
} from "@/lib/server";

export const runtime = "nodejs";

export function POST(
  request: Request,
  context: RouteContext<{ id: string; approvalId: string }>,
): Promise<Response> {
  return handleApiRequest(request, true, async () => {
    const params = await context.params;
    const runId = RouteUuidSchema.parse(params.id);
    const approvalId = RouteUuidSchema.parse(params.approvalId);
    const decision = await readJsonBody(request, ApprovalRequestSchema);
    const application = await getServerApplication();
    const result = await application.resolveApproval(runId, approvalId, decision);
    if (result.status === "invalid") return apiErrorInfoResponse(result.error);
    return jsonResponse({
      runId,
      approvalId,
      status: "resolved",
      approved: result.approved,
    });
  });
}
