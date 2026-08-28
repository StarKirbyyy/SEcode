import {
  RecentWorkspaceSearchSchema,
  getServerApplication,
  handleApiRequest,
  jsonResponse,
  searchParamsObject,
} from "@/lib/server";

export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return handleApiRequest(request, false, async () => {
    const query = RecentWorkspaceSearchSchema.parse(
      searchParamsObject(new URL(request.url)),
    );
    const application = await getServerApplication();
    const workspaces = await application.listRecentWorkspaces(query.limit);
    return jsonResponse({ workspaces: [...workspaces] });
  });
}
