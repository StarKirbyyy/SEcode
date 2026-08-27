import { describe, expect, it } from "vitest";

import * as publicApproval from "@/lib/approval";
import * as publicTools from "@/lib/tools";

describe("approval public API", () => {
  it("exports the approved policy and gateway surface", () => {
    expect(publicApproval).toHaveProperty("ApprovalDecisionSchema");
    expect(publicApproval).toHaveProperty("assessLocalToolRisk");
    expect(publicApproval).toHaveProperty("requestLocalToolAuthorization");
    expect(publicApproval).toHaveProperty("getPendingToolApprovalView");
    expect(publicApproval).toHaveProperty("resolveLocalToolApproval");
    expect(publicApproval).toHaveProperty("executeAuthorizedLocalTool");
  });

  it("keeps factories, capabilities, dependencies and policy helpers private", () => {
    expect(publicApproval).not.toHaveProperty("createApprovalGateway");
    expect(publicApproval).not.toHaveProperty("nativeApprovalDependencies");
    expect(publicApproval).not.toHaveProperty("classifyProcessRisk");
    expect(publicApproval).not.toHaveProperty(
      "createAuthorizedLocalToolInvocation",
    );
    expect(publicApproval).not.toHaveProperty(
      "consumeAuthorizedLocalToolInvocation",
    );
  });

  it("removes the raw executor and authenticity helper from tools barrel", () => {
    expect(publicTools).not.toHaveProperty("executePreparedLocalTool");
    expect(publicTools).not.toHaveProperty("isPreparedLocalToolInvocation");
    expect(publicTools).toHaveProperty("prepareLocalToolCall");
  });
});
