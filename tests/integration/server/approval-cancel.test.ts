import { afterEach, describe, expect, it } from "vitest";

import { DELETE as cancelRun } from "@/app/api/runs/[id]/route";
import { POST as resolveApproval } from "@/app/api/runs/[id]/approvals/[approvalId]/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { POST as startRun } from "@/app/api/sessions/[id]/runs/route";

import {
  cleanupServerFixtures,
  createServerFixture,
  jsonRequest,
  parseJson,
  textCompletion,
  toolCompletion,
  waitForEventType,
  waitForTerminalEvent,
} from "./helpers";

afterEach(cleanupServerFixtures);

async function createSessionId(fixture: Awaited<ReturnType<typeof createServerFixture>>) {
  const response = await createSession(jsonRequest("/api/sessions", "POST", { workspacePath: fixture.workspace, modelProfileId: "test-model" }));
  return ((await parseJson(response)).session as { id: string }).id;
}

describe("approval and cancellation routes", () => {
  it("requires approval for an unrecognized process and resolves it through the shared runtime", async () => {
    const fixture = await createServerFixture([
      toolCompletion("run_process", { program: "pnpm", args: ["run", "slow"], cwd: ".", timeoutMs: 10_000 }),
      textCompletion("审批后的命令已处理"),
    ]);
    const sessionId = await createSessionId(fixture);
    const response = await startRun(jsonRequest(`/api/sessions/${sessionId}/runs`, "POST", { prompt: "run node" }), { params: Promise.resolve({ id: sessionId }) });
    const approvalEvent = await waitForEventType(fixture.store, sessionId, "approval.required");
    const approval = { runId: approvalEvent.runId!, approvalId: String(approvalEvent.data.approvalId) };
    const approved = await resolveApproval(jsonRequest(`/api/runs/${approval.runId}/approvals/${approval.approvalId}`, "POST", { approved: true, reason: "test" }), { params: Promise.resolve({ id: approval.runId, approvalId: approval.approvalId }) });
    expect(approved.status).toBe(200);
    expect(await parseJson(approved)).toMatchObject({ status: "resolved", approved: true });
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string });
    expect(events.some((event) => event.type === "tool.started")).toBe(true);
    await waitForTerminalEvent(fixture.store, sessionId);
  });

  it("rejects approval without starting the tool and refuses a repeated decision", async () => {
    const fixture = await createServerFixture([
      toolCompletion("run_process", { program: "pnpm", args: ["run", "slow"], cwd: ".", timeoutMs: 10_000 }),
      textCompletion("已遵守拒绝决定"),
    ]);
    const sessionId = await createSessionId(fixture);
    const response = await startRun(jsonRequest(`/api/sessions/${sessionId}/runs`, "POST", { prompt: "do not run" }), { params: Promise.resolve({ id: sessionId }) });
    const approvalEvent = await waitForEventType(fixture.store, sessionId, "approval.required");
    const runId = approvalEvent.runId!;
    const approvalId = String(approvalEvent.data.approvalId);
    const rejected = await resolveApproval(jsonRequest(`/api/runs/${runId}/approvals/${approvalId}`, "POST", { approved: false, reason: "reject" }), { params: Promise.resolve({ id: runId, approvalId }) });
    expect(rejected.status).toBe(200);
    expect(await parseJson(rejected)).toMatchObject({ approved: false });
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string });
    expect(events.some((event) => event.type === "tool.started")).toBe(false);
    expect(events.some((event) => event.type === "tool.result")).toBe(true);
    const repeated = await resolveApproval(jsonRequest(`/api/runs/${runId}/approvals/${approvalId}`, "POST", { approved: true }), { params: Promise.resolve({ id: runId, approvalId }) });
    expect([404, 409]).toContain(repeated.status);
  });

  it("cancels once, remains idempotent during wind-down, and rejects unknown runs", async () => {
    let release!: () => void;
    const windDown = new Promise<void>((resolve) => { release = resolve; });
    const fixture = await createServerFixture([
      async (request) => await new Promise((_, reject) => {
        request.signal.addEventListener("abort", () => {
          void windDown.then(() => reject(request.signal.reason));
        }, { once: true });
      }),
    ]);
    const sessionId = await createSessionId(fixture);
    const response = await startRun(jsonRequest(`/api/sessions/${sessionId}/runs`, "POST", { prompt: "wait" }), { params: Promise.resolve({ id: sessionId }) });
    const firstLine = new TextDecoder().decode((await response.body!.getReader().read()).value!);
    const runId = (JSON.parse(firstLine.trim()) as { runId: string }).runId;
    const first = await cancelRun(jsonRequest(`/api/runs/${runId}`, "DELETE", { reason: "stop" }), { params: Promise.resolve({ id: runId }) });
    expect(first.status).toBe(202);
    const repeated = await cancelRun(jsonRequest(`/api/runs/${runId}`, "DELETE", { reason: "again" }), { params: Promise.resolve({ id: runId }) });
    expect(repeated.status).toBe(202);
    expect(await parseJson(repeated)).toMatchObject({ status: "already_requested" });
    const missingId = "00000000-0000-4000-8000-000000000099";
    expect((await cancelRun(jsonRequest(`/api/runs/${missingId}`, "DELETE"), { params: Promise.resolve({ id: missingId }) })).status).toBe(404);
    release();
    await waitForTerminalEvent(fixture.store, sessionId);
  });

  it("connects stream cancellation and request abort to the agent signal", async () => {
    const streamFixture = await createServerFixture([
      async (request) => await new Promise((_, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
      }),
    ]);
    const streamSession = await createSessionId(streamFixture);
    const streamResponse = await startRun(jsonRequest(`/api/sessions/${streamSession}/runs`, "POST", { prompt: "stream cancel" }), { params: Promise.resolve({ id: streamSession }) });
    const streamReader = streamResponse.body!.getReader();
    await streamReader.read();
    await streamReader.cancel();
    await waitForTerminalEvent(streamFixture.store, streamSession);
    const streamEvents = await streamFixture.store.readEvents(streamSession, { afterSeq: 0, limit: 1_000 });
    expect(streamEvents.events.filter((event) => event.type === "run.cancelled")).toHaveLength(1);

    await cleanupServerFixtures();
    const abortFixture = await createServerFixture([
      async (request) => await new Promise((_, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
      }),
    ]);
    const abortSession = await createSessionId(abortFixture);
    const controller = new AbortController();
    const abortRequest = new Request(`http://localhost/api/sessions/${abortSession}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "request abort" }),
      signal: controller.signal,
    });
    const abortResponse = await startRun(abortRequest, { params: Promise.resolve({ id: abortSession }) });
    controller.abort("test abort");
    await waitForTerminalEvent(abortFixture.store, abortSession);
    const abortEvents = await abortFixture.store.readEvents(abortSession, { afterSeq: 0, limit: 1_000 });
    expect(abortEvents.events.filter((event) => event.type === "run.cancelled")).toHaveLength(1);
    await abortResponse.body!.cancel();
  });
});
