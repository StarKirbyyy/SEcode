import {
  WorkspacePermissionQuerySchema,
  WorkspacePermissionRequestSchema,
  getServerApplication,
  handleApiRequest,
  jsonResponse,
  readJsonBody,
} from "@/lib/server";

export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return handleApiRequest(request, false, async () => {
    const path = new URL(request.url).searchParams.get("path");
    const query = WorkspacePermissionQuerySchema.parse({ path });
    const application = await getServerApplication();
    return jsonResponse(await application.getWorkspacePermission(query.path));
  });
}

export function POST(request: Request): Promise<Response> {
  return handleApiRequest(request, true, async () => {
    const body = await readJsonBody(request, WorkspacePermissionRequestSchema);
    const application = await getServerApplication();
    return jsonResponse(await application.setWorkspacePermission(body.path, body.mode));
  });
}
