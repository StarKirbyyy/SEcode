import {
  getServerApplication,
  handleApiRequest,
  jsonResponse,
} from "@/lib/server";

export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return handleApiRequest(request, false, async () => {
    const application = await getServerApplication();
    return jsonResponse(application.getConfig());
  });
}
