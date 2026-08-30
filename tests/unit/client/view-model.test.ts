import { describe, expect, it } from "vitest";

import { AgentEventSchema, type AgentEvent } from "@/lib/domain";
import {
  buildToolCards,
  formatProcessDetails,
  formatReplaceComparison,
  pendingApprovalCards,
} from "@/lib/client/view-model";

const SESSION = "00000000-0000-4000-8000-000000000001";
const RUN = "00000000-0000-4000-8000-000000000010";
const CALL = "00000000-0000-4000-8000-000000000020";
const APPROVAL = "00000000-0000-4000-8000-000000000021";

function event(seq: number, type: string, data: object, createdAt = `2026-08-28T00:00:0${seq}.000Z`): AgentEvent {
  return AgentEventSchema.parse({ protocolVersion: 1, durable: true, id: `00000000-0000-4000-8000-${String(seq + 100).padStart(12, "0")}`, seq, sessionId: SESSION, runId: RUN, type, createdAt, data });
}

describe("tool card view model", () => {
  it("groups a complete approved tool lifecycle and computes duration", () => {
    const events = [
      event(1, "tool.requested", { toolCallId: CALL, toolName: "run_process", publicArguments: { program: "pnpm", args: ["test"] }, argumentsTruncated: false }),
      event(2, "approval.required", { approvalId: APPROVAL, toolCallId: CALL, reason: "command", toolSummary: "pnpm test" }),
      event(3, "approval.resolved", { approvalId: APPROVAL, approved: true }),
      event(4, "tool.started", { toolCallId: CALL, toolName: "run_process" }),
      event(5, "tool.result", { toolCallId: CALL, toolName: "run_process", result: { ok: true, summary: "tests pass", metadata: { exitCode: 0 } } }),
    ];
    expect(buildToolCards(events)).toEqual([expect.objectContaining({ toolCallId: CALL, toolName: "run_process", status: "succeeded", durationMs: 1000, approval: expect.objectContaining({ approved: true }) })]);
    expect(pendingApprovalCards(events)).toEqual([]);
  });

  it("keeps incomplete and rejected lifecycles visible", () => {
    const requested = event(1, "tool.requested", { toolCallId: CALL, toolName: "write_file", publicArguments: { path: "a" }, argumentsTruncated: false });
    const required = event(2, "approval.required", { approvalId: APPROVAL, toolCallId: CALL, reason: "write", toolSummary: "write a" });
    expect(buildToolCards([requested])).toEqual([expect.objectContaining({ status: "requested", incomplete: true })]);
    expect(pendingApprovalCards([requested, required])).toEqual([expect.objectContaining({ approval: expect.objectContaining({ approvalId: APPROVAL }) })]);
    const rejected = event(3, "approval.resolved", { approvalId: APPROVAL, approved: false });
    expect(buildToolCards([requested, required, rejected])).toEqual([expect.objectContaining({ status: "rejected", incomplete: false })]);
    const rejectionResult = event(4, "tool.result", { toolCallId: CALL, toolName: "write_file", result: { ok: false, summary: "用户拒绝执行该工具调用", error: { code: "TOOL_APPROVAL_REJECTED", message: "用户拒绝执行该工具调用", recoverable: true } } });
    expect(buildToolCards([requested, required, rejected, rejectionResult])).toEqual([expect.objectContaining({ status: "rejected", incomplete: false })]);
  });

  it("formats replace previews and process facts without inventing content", () => {
    expect(formatReplaceComparison({ path: "src/a.ts", oldTextPreview: "old", newTextPreview: "new", oldTextBytes: 3, newTextBytes: 3 })).toEqual({ path: "src/a.ts", before: "old", after: "new", beforeBytes: 3, afterBytes: 3 });
    expect(formatProcessDetails(
      { program: "pnpm", args: ["test"], cwd: ".", timeoutMs: 120000 },
      { ok: false, summary: "failed", output: "line", metadata: { exitCode: 1, truncated: true }, error: { code: "PROCESS_EXIT_NONZERO", message: "failed", recoverable: true } },
    )).toEqual({ argv: ["pnpm", "test"], cwd: ".", timeoutMs: 120000, output: "line", exitCode: 1, truncated: true, error: { code: "PROCESS_EXIT_NONZERO", message: "failed", recoverable: true } });
  });
});
