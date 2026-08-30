import {
  BrowseWorkspaceRequestSchema,
  getServerApplication,
  handleApiRequest,
  jsonResponse,
  readJsonBody,
} from "@/lib/server";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleApiRequest(request, true, async () => {
    const body = await readJsonBody(request, BrowseWorkspaceRequestSchema);
    const application = await getServerApplication();
    return jsonResponse(await application.browseWorkspaces(body));
  });
}
