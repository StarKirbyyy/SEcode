import {
  CreateSessionRequestSchema,
  getServerApplication,
  handleApiRequest,
  jsonResponse,
  readJsonBody,
} from "@/lib/server";

export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return handleApiRequest(request, false, async () => {
    const application = await getServerApplication();
    const sessions = await application.listSessions();
    return jsonResponse({ sessions: [...sessions] });
  });
}

export function POST(request: Request): Promise<Response> {
  return handleApiRequest(request, true, async () => {
    const body = await readJsonBody(request, CreateSessionRequestSchema);
    const application = await getServerApplication();
    return jsonResponse(await application.createSession(body), { status: 201 });
  });
}
