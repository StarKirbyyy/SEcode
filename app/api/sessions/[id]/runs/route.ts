import {
  NDJSON_RESPONSE_HEADERS,
  RouteUuidSchema,
  RunRequestBodySchema,
  createNdjsonEventBridge,
  getServerApplication,
  handleApiRequest,
  readJsonBody,
  type RouteContext,
} from "@/lib/server";

export const runtime = "nodejs";

export function POST(
  request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  return handleApiRequest(request, true, async () => {
    const { id: rawId } = await context.params;
    const sessionId = RouteUuidSchema.parse(rawId);
    const body = await readJsonBody(request, RunRequestBodySchema);
    const application = await getServerApplication();
    const bridge = createNdjsonEventBridge();
    const handle = await application.startRun(
      {
        sessionId,
        prompt: body.prompt,
        planningEnabled: body.planningEnabled,
        limits: body.limits,
        ...(body.thinking === undefined ? {} : { thinking: body.thinking }),
      },
      { signal: request.signal, onEvent: bridge.publish },
    );
    bridge.bindRunHandle(handle);
    void handle.completion.then(
      () => bridge.close(),
      (error) => bridge.fail(error),
    );
    return new Response(bridge.stream, { status: 200, headers: NDJSON_RESPONSE_HEADERS });
  });
}
