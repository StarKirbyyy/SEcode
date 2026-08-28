import { afterEach, describe, expect, it } from "vitest";

import { POST as createSession } from "@/app/api/sessions/route";
import { POST as startRun } from "@/app/api/sessions/[id]/runs/route";
import { GET as getEvents } from "@/app/api/sessions/[id]/events/route";
import { ModelLayerError } from "@/lib/model";

import { cleanupServerFixtures, createServerFixture, jsonRequest, parseJson } from "./helpers";

afterEach(cleanupServerFixtures);

describe("server recovery and security matrix", () => {
  it("recovers one durable open run as interrupted before returning events", async () => {
    const fixture = await createServerFixture();
    const created = await createSession(jsonRequest("/api/sessions", "POST", { workspacePath: fixture.workspace, modelProfileId: "test-model" }));
    const sessionId = ((await parseJson(created)).session as { id: string }).id;
    const runId = "00000000-0000-4000-8000-000000000077";
    await fixture.store.appendEvent(sessionId, {
      type: "run.started",
      runId,
      data: { promptPreview: "interrupted", limits: { maxIterations: 30, maxDurationMs: 600_000 } },
    });
    const response = await getEvents(new Request(`http://localhost/api/sessions/${sessionId}/events?after=0&limit=20`), { params: Promise.resolve({ id: sessionId }) });
    expect(response.status).toBe(200);
    const events = (await parseJson(response)).events as Array<{ type: string; runId?: string }>;
    expect(events.filter((event) => event.type === "run.interrupted" && event.runId === runId)).toHaveLength(1);
    const again = await getEvents(new Request(`http://localhost/api/sessions/${sessionId}/events?after=0&limit=20`), { params: Promise.resolve({ id: sessionId }) });
    const secondEvents = (await parseJson(again)).events as Array<{ type: string; runId?: string }>;
    expect(secondEvents.filter((event) => event.type === "run.interrupted" && event.runId === runId)).toHaveLength(1);
  });

  it("maps missing sessions and incompatible thinking without leaking internals", async () => {
    const fixture = await createServerFixture();
    const missing = "00000000-0000-4000-8000-000000000099";
    const missingResponse = await startRun(jsonRequest(`/api/sessions/${missing}/runs`, "POST", { prompt: "x" }), { params: Promise.resolve({ id: missing }) });
    expect(missingResponse.status).toBe(404);
    expect(JSON.stringify(await parseJson(missingResponse))).not.toMatch(/stack|cause|apiKeyEnv|reasoning/);

    fixture.model.snapshot.profiles[0]!.supportsThinking = false;
    const created = await createSession(jsonRequest("/api/sessions", "POST", { workspacePath: fixture.workspace, modelProfileId: "test-model" }));
    const sessionId = ((await parseJson(created)).session as { id: string }).id;
    const incompatible = await startRun(jsonRequest(`/api/sessions/${sessionId}/runs`, "POST", { prompt: "x", thinking: { enabled: true } }), { params: Promise.resolve({ id: sessionId }) });
    expect(incompatible.status).toBe(422);
  });

  it.each(["http://evil.test", "http://127.0.0.1:9999"])("rejects mutation origin %s", async (origin) => {
    const fixture = await createServerFixture();
    const response = await createSession(jsonRequest("/api/sessions", "POST", { workspacePath: fixture.workspace, modelProfileId: "test-model" }, { origin }));
    expect(response.status).toBe(403);
    expect(await fixture.store.listSessions()).toHaveLength(0);
  });

  it("persists a bounded run.failed event for provider failures", async () => {
    const fixture = await createServerFixture([
      new ModelLayerError({
        code: "MODEL_RATE_LIMITED",
        message: "模型服务限流",
        recoverable: true,
        details: { retryAfterMs: 100 },
      }),
    ]);
    const created = await createSession(jsonRequest("/api/sessions", "POST", { workspacePath: fixture.workspace, modelProfileId: "test-model" }));
    const sessionId = ((await parseJson(created)).session as { id: string }).id;
    const response = await startRun(jsonRequest(`/api/sessions/${sessionId}/runs`, "POST", { prompt: "fail safely" }), { params: Promise.resolve({ id: sessionId }) });
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; data: { error?: { code?: string } } });
    expect(events.filter((event) => event.type === "run.failed")).toHaveLength(1);
    expect(events.find((event) => event.type === "run.failed")?.data.error?.code).toBe("MODEL_RATE_LIMITED");
    expect(JSON.stringify(events)).not.toMatch(/stack|cause|Bearer|reasoning/);
  });
});
