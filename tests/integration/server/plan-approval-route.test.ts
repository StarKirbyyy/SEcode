import { afterEach, describe, expect, it } from "vitest";

import { POST as resolvePlan } from "@/app/api/runs/[id]/plans/[approvalId]/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { POST as startRun } from "@/app/api/sessions/[id]/runs/route";
import { AgentEventSchema } from "@/lib/domain";

import {
  cleanupServerFixtures,
  createServerFixture,
  jsonRequest,
  parseJson,
  textCompletion,
  waitForEventType,
} from "./helpers";

afterEach(cleanupServerFixtures);

async function startPlanningRun(approvedExecution = true) {
  const fixture = await createServerFixture([
    textCompletion("## 实施计划\n\n1. 检查代码。\n2. 修改并测试。"),
    ...(approvedExecution ? [textCompletion("已按计划完成。") ] : []),
  ]);
  const created = await createSession(jsonRequest("/api/sessions", "POST", {
    workspacePath: fixture.workspace,
    modelProfileId: "test-model",
  }));
  const sessionId = ((await parseJson(created)).session as { id: string }).id;
  const stream = await startRun(
    jsonRequest(`/api/sessions/${sessionId}/runs`, "POST", {
      prompt: "完成任务",
      planningEnabled: true,
      limits: { maxModelRequests: 8, maxToolCalls: 12 },
    }),
    { params: Promise.resolve({ id: sessionId }) },
  );
  const proposal = await waitForEventType(fixture.store, sessionId, "plan.proposed");
  return { fixture, sessionId, stream, proposal };
}

describe("plan approval route", () => {
  it("approves a durable proposal and continues the same NDJSON stream", async () => {
    const { stream, proposal } = await startPlanningRun();
    const response = await resolvePlan(
      jsonRequest(`/api/runs/${proposal.runId}/plans/${proposal.data.approvalId}`, "POST", {
        planId: proposal.data.planId,
        approved: true,
      }),
      { params: Promise.resolve({ id: proposal.runId!, approvalId: proposal.data.approvalId }) },
    );
    expect(response.status).toBe(200);
    expect(await parseJson(response)).toMatchObject({
      runId: proposal.runId,
      planId: proposal.data.planId,
      approvalId: proposal.data.approvalId,
      status: "resolved",
      approved: true,
    });
    const events = (await stream.text()).trim().split("\n").map((line) => AgentEventSchema.parse(JSON.parse(line)));
    expect(new Set(events.map((event) => event.runId).filter(Boolean))).toEqual(new Set([proposal.runId]));
    expect(events.map((event) => event.type)).toContain("plan.approval.resolved");
    expect(events.map((event) => event.type)).toContain("run.completed");
  });

  it("rejects the plan and closes the same stream as cancelled", async () => {
    const { stream, proposal } = await startPlanningRun(false);
    const response = await resolvePlan(
      jsonRequest(`/api/runs/${proposal.runId}/plans/${proposal.data.approvalId}`, "POST", {
        planId: proposal.data.planId,
        approved: false,
        reason: "不执行",
      }),
      { params: Promise.resolve({ id: proposal.runId!, approvalId: proposal.data.approvalId }) },
    );
    expect(response.status).toBe(200);
    const events = (await stream.text()).trim().split("\n").map((line) => AgentEventSchema.parse(JSON.parse(line)));
    expect(events.find((event) => event.type === "plan.approval.resolved")).toMatchObject({ data: { approved: false } });
    expect(events.map((event) => event.type)).toContain("run.cancelled");
  });

  it("returns bounded 404/409 errors and enforces host, origin and strict JSON", async () => {
    const { stream, proposal } = await startPlanningRun(false);
    const route = `/api/runs/${proposal.runId}/plans/${proposal.data.approvalId}`;
    const context = { params: Promise.resolve({ id: proposal.runId!, approvalId: proposal.data.approvalId }) };

    const wrongPlan = await resolvePlan(jsonRequest(route, "POST", {
      planId: "00000000-0000-4000-8000-000000000099",
      approved: true,
    }), context);
    expect(wrongPlan.status).toBe(409);
    expect(await parseJson(wrongPlan)).toMatchObject({ error: { code: "AGENT_PLAN_APPROVAL_INVALID" } });

    const crossOrigin = await resolvePlan(jsonRequest(route, "POST", {
      planId: proposal.data.planId,
      approved: false,
    }, { origin: "http://evil.example" }), context);
    expect(crossOrigin.status).toBe(403);

    const forbiddenHost = await resolvePlan(new Request(`http://evil.example${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: proposal.data.planId, approved: false }),
    }), context);
    expect(forbiddenHost.status).toBe(403);

    const extra = await resolvePlan(jsonRequest(route, "POST", {
      planId: proposal.data.planId,
      approved: false,
      unknown: true,
    }), context);
    expect(extra.status).toBe(400);

    const rejected = await resolvePlan(jsonRequest(route, "POST", {
      planId: proposal.data.planId,
      approved: false,
    }), context);
    expect(rejected.status).toBe(200);
    await stream.text();

    const duplicate = await resolvePlan(jsonRequest(route, "POST", {
      planId: proposal.data.planId,
      approved: false,
    }), context);
    expect([404, 409]).toContain(duplicate.status);

    const missingRun = "00000000-0000-4000-8000-000000000088";
    const missing = await resolvePlan(jsonRequest(`/api/runs/${missingRun}/plans/${proposal.data.approvalId}`, "POST", {
      planId: proposal.data.planId,
      approved: true,
    }), { params: Promise.resolve({ id: missingRun, approvalId: proposal.data.approvalId }) });
    expect(missing.status).toBe(404);
  });
});
