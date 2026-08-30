import {
  RouteUuidSchema,
  getServerApplication,
  handleApiRequest,
  jsonResponse,
  type RouteContext,
} from "@/lib/server";

export const runtime = "nodejs";

export function DELETE(
  request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  return handleApiRequest(request, true, async () => {
    const { id: rawId } = await context.params;
    const sessionId = RouteUuidSchema.parse(rawId);
    const application = await getServerApplication();
    return jsonResponse(await application.deleteSession(sessionId));
  });
}
