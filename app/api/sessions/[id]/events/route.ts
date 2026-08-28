import {
  EventPageSearchSchema,
  RouteUuidSchema,
  getServerApplication,
  handleApiRequest,
  jsonResponse,
  searchParamsObject,
  type RouteContext,
} from "@/lib/server";

export const runtime = "nodejs";

export function GET(
  request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  return handleApiRequest(request, false, async () => {
    const { id: rawId } = await context.params;
    const sessionId = RouteUuidSchema.parse(rawId);
    const query = EventPageSearchSchema.parse(
      searchParamsObject(new URL(request.url)),
    );
    const application = await getServerApplication();
    const page = await application.readEvents(sessionId, {
      afterSeq: query.after,
      limit: query.limit,
    });
    return jsonResponse({
      events: [...page.events],
      lastSeq: page.lastSeq,
      hasMore: page.hasMore,
      recovery: page.recovery,
    });
  });
}
