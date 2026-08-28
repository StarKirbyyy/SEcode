import {
  CancelRequestSchema,
  RouteUuidSchema,
  getServerApplication,
  handleApiRequest,
  jsonResponse,
  readJsonBody,
  type RouteContext,
} from "@/lib/server";

export const runtime = "nodejs";

export function DELETE(
  request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  return handleApiRequest(request, true, async () => {
    const { id: rawId } = await context.params;
    const runId = RouteUuidSchema.parse(rawId);
    const body = await readJsonBody(request, CancelRequestSchema, { allowEmpty: true });
    const application = await getServerApplication();
    const result = application.cancelRun(runId, body.reason);
    if (result.status === "not_found") {
      return jsonResponse(
        {
          error: {
            code: "AGENT_RUN_NOT_FOUND",
            message: "当前进程中不存在该活动运行",
            recoverable: true,
          },
        },
        { status: 404 },
      );
    }
    return jsonResponse(result, { status: 202 });
  });
}
