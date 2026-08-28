import { afterEach, describe, expect, it } from "vitest";

import { GET as getConfig } from "@/app/api/config/route";
import { GET as getRecent } from "@/app/api/workspaces/recent/route";
import { POST as validateWorkspace } from "@/app/api/workspaces/validate/route";
import { GET as listSessions, POST as createSession } from "@/app/api/sessions/route";
import { GET as getEvents } from "@/app/api/sessions/[id]/events/route";

import { assertNoSecrets, cleanupServerFixtures, createServerFixture, jsonRequest, parseJson } from "./helpers";

afterEach(cleanupServerFixtures);

describe("session route exports", () => {
  it("validates, creates, lists and reports recent workspaces", async () => {
    const fixture = await createServerFixture();
    const config = await getConfig(new Request("http://localhost/api/config"));
    expect(config.status).toBe(200);
    assertNoSecrets(await config.clone().json());

    const validated = await validateWorkspace(jsonRequest("/api/workspaces/validate", "POST", { path: fixture.workspace }));
    expect(await parseJson(validated)).toEqual({ workspacePath: fixture.workspace });

    const created = await createSession(jsonRequest("/api/sessions", "POST", { workspacePath: fixture.workspace, modelProfileId: "test-model" }));
    expect(created.status).toBe(201);
    const createdBody = await parseJson(created);
    const session = createdBody.session as { id: string; title: string };
    expect(session.title).toBe("workspace");

    const listed = await listSessions(new Request("http://localhost/api/sessions"));
    const listedBody = await parseJson(listed);
    expect((listedBody.sessions as unknown[])).toHaveLength(1);
    expect((listedBody.sessions as Record<string, unknown>[])[0]).not.toHaveProperty("status");

    const recent = await getRecent(new Request("http://localhost/api/workspaces/recent?limit=5"));
    expect(await parseJson(recent)).toEqual({ workspaces: [fixture.workspace] });

    const events = await getEvents(new Request(`http://localhost/api/sessions/${session.id}/events?after=0&limit=10`), { params: Promise.resolve({ id: session.id }) });
    expect(events.status).toBe(200);
    expect((await parseJson(events)).events).toHaveLength(1);
  });

  it("rejects unsafe and malformed requests before side effects", async () => {
    const fixture = await createServerFixture();
    expect((await validateWorkspace(jsonRequest("/api/workspaces/validate", "POST", { path: "relative" }))).status).toBe(400);
    expect((await createSession(jsonRequest("/api/sessions", "POST", { workspacePath: fixture.workspace, modelProfileId: "missing" }))).status).toBe(422);
    expect((await createSession(jsonRequest("/api/sessions", "POST", { workspacePath: fixture.workspace, modelProfileId: "test-model", unknown: true }))).status).toBe(400);
    expect((await createSession(jsonRequest("/api/sessions", "POST", { workspacePath: fixture.workspace, modelProfileId: "test-model" }, { origin: "http://evil.test" }))).status).toBe(403);
    expect((await listSessions(new Request("http://192.168.1.2/api/sessions"))).status).toBe(403);
    expect(await fixture.store.listSessions()).toHaveLength(0);
  });

  it("strictly validates event params and queries", async () => {
    await createServerFixture();
    const badId = await getEvents(new Request("http://localhost/api/sessions/bad/events"), { params: Promise.resolve({ id: "bad" }) });
    expect(badId.status).toBe(400);
    const id = "00000000-0000-4000-8000-000000000001";
    expect((await getEvents(new Request(`http://localhost/api/sessions/${id}/events?after=-1`), { params: Promise.resolve({ id }) })).status).toBe(400);
    expect((await getEvents(new Request(`http://localhost/api/sessions/${id}/events?limit=1&limit=2`), { params: Promise.resolve({ id }) })).status).toBe(400);
    expect((await getEvents(new Request(`http://localhost/api/sessions/${id}/events?unknown=1`), { params: Promise.resolve({ id }) })).status).toBe(400);
  });
});
