import { describe, expect, it } from "vitest";

import * as client from "@/lib/client";

describe("client public barrel", () => {
  it("exports only browser-safe runtime helpers", () => {
    expect(Object.keys(client).sort()).toEqual([
      "UiClientError",
      "advanceTyping",
      "beginSessionDeletion",
      "buildTranscriptItems",
      "createApiClient",
      "createEventLedger",
      "deriveSessionTitle",
      "failSessionDeletion",
      "foldWorkspacePath",
      "groupSessionsByWorkspace",
      "markSessionDeletionPending",
      "mergeAgentEvent",
      "mergeAgentEvents",
      "parseAgentEventStream",
      "projectRun",
      "projectSession",
      "reconcileSessionDeletion",
      "segmentGraphemes",
      "selectConfiguredModelId",
      "workspaceBasename",
    ]);
  });
});
