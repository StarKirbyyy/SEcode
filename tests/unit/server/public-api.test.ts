import { describe, expect, it } from "vitest";

import * as server from "@/lib/server";

describe("server public barrel", () => {
  it("exports only route-facing runtime helpers", () => {
    expect(Object.keys(server).sort()).toEqual([
      "ApprovalRequestSchema",
      "CancelRequestSchema",
      "CreateSessionRequestSchema",
      "EventPageSearchSchema",
      "NDJSON_RESPONSE_HEADERS",
      "RecentWorkspaceSearchSchema",
      "RouteUuidSchema",
      "RunRequestBodySchema",
      "WorkspaceValidateRequestSchema",
      "apiErrorInfoResponse",
      "apiErrorResponse",
      "assertLocalRequest",
      "assertMutationOrigin",
      "createNdjsonEventBridge",
      "getServerApplication",
      "handleApiRequest",
      "jsonResponse",
      "readJsonBody",
      "searchParamsObject",
    ]);
    expect("createServerApplication" in server).toBe(false);
    expect("createServerApplicationLoader" in server).toBe(false);
    expect("resetServerApplication" in server).toBe(false);
  });
});
