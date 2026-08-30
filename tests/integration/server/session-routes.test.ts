import { afterEach, describe, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { GET as getConfig } from "@/app/api/config/route";
import { GET as getRecent } from "@/app/api/workspaces/recent/route";
import { POST as validateWorkspace } from "@/app/api/workspaces/validate/route";
import { GET as listSessions, POST as createSession } from "@/app/api/sessions/route";
import { GET as getEvents } from "@/app/api/sessions/[id]/events/route";
import { DELETE as deleteSession } from "@/app/api/sessions/[id]/route";

import { assertNoSecrets, cleanupServerFixtures, createServerFixture, jsonRequest, parseJson, textCompletion } from "./helpers";

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

  it("keeps lastSeq log-wide while the first HTTP event page ends earlier", async () => {
    const fixture = await createServerFixture();
    const created = await fixture.application.createSession({
      workspacePath: fixture.workspace,
      modelProfileId: "test-model",
      title: "Long history contract",
    });
    const runId = "00000000-0000-4000-8000-000000000501";
    await fixture.store.appendEvent(created.session.id, {
      type: "run.started",
      runId,
      data: {
        promptPreview: "freeze pagination contract",
        limits: { maxDurationMs: 60_000 },
      },
    });
    await fixture.store.appendEvent(created.session.id, {
      type: "user.message",
      runId,
      data: { content: "freeze pagination contract" },
    });
    for (let index = 0; index < 498; index += 1) {
      await fixture.store.appendEvent(created.session.id, {
        type: "context.compacted",
        runId,
        data: {
          throughSeq: 1,
          summary: `synthetic summary ${index + 1}`,
          retainedRange: { fromSeq: 1, toSeq: 1 },
        },
      });
    }

    const response = await getEvents(
      new Request(`http://localhost/api/sessions/${created.session.id}/events?after=0`),
      { params: Promise.resolve({ id: created.session.id }) },
    );
    const body = await parseJson(response) as {
      events: Array<{ seq: number }>;
      lastSeq: number;
      hasMore: boolean;
      recovery: { lastStableSeq: number };
    };
    expect(response.status).toBe(200);
    expect(body.events).toHaveLength(500);
    expect(body.events.at(-1)?.seq).toBe(500);
    expect(body.lastSeq).toBe(502);
    expect(body.recovery.lastStableSeq).toBe(502);
    expect(body.hasMore).toBe(true);
  }, 30_000);

  it("deletes a session without touching its bound workspace", async () => {
    const fixture = await createServerFixture();
    const marker = path.join(fixture.workspace, "keep.txt");
    await writeFile(marker, "workspace remains\n", "utf8");
    const created = await fixture.application.createSession({
      workspacePath: fixture.workspace,
      modelProfileId: "test-model",
      title: "Delete me",
    });

    const response = await deleteSession(
      new Request(`http://localhost/api/sessions/${created.session.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: created.session.id }) },
    );
    expect(response.status).toBe(200);
    expect(await parseJson(response)).toEqual({ sessionId: created.session.id, status: "deleted" });
    expect(await fixture.store.listSessions()).toEqual([]);
    expect(await readFile(marker, "utf8")).toBe("workspace remains\n");

    const history = await getEvents(
      new Request(`http://localhost/api/sessions/${created.session.id}/events`),
      { params: Promise.resolve({ id: created.session.id }) },
    );
    expect(history.status).toBe(404);
  });

  it("returns finite validation, missing and origin errors before deletion", async () => {
    const fixture = await createServerFixture();
    const created = await fixture.application.createSession({
      workspacePath: fixture.workspace,
      modelProfileId: "test-model",
    });
    const invalid = await deleteSession(
      new Request("http://localhost/api/sessions/not-a-uuid", { method: "DELETE" }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(invalid.status).toBe(400);
    const missingId = "00000000-0000-4000-8000-000000000099";
    const missing = await deleteSession(
      new Request(`http://localhost/api/sessions/${missingId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: missingId }) },
    );
    expect(missing.status).toBe(404);
    const forbidden = await deleteSession(
      new Request(`http://localhost/api/sessions/${created.session.id}`, {
        method: "DELETE",
        headers: { origin: "http://evil.test" },
      }),
      { params: Promise.resolve({ id: created.session.id }) },
    );
    expect(forbidden.status).toBe(403);
    expect(await fixture.store.listSessions()).toHaveLength(1);
    assertNoSecrets(await forbidden.clone().json());
  });

  it("returns 409 while the session run is active", async () => {
    let release!: () => void;
    const modelGate = new Promise<ReturnType<typeof textCompletion>>((resolve) => {
      release = () => resolve(textCompletion("done"));
    });
    const fixture = await createServerFixture([async () => modelGate]);
    const created = await fixture.application.createSession({
      workspacePath: fixture.workspace,
      modelProfileId: "test-model",
    });
    const handle = await fixture.application.startRun({ sessionId: created.session.id, prompt: "wait" }, {});

    const response = await deleteSession(
      new Request(`http://localhost/api/sessions/${created.session.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: created.session.id }) },
    );
    expect(response.status).toBe(409);
    expect(await parseJson(response)).toMatchObject({ error: { code: "API_SESSION_BUSY", recoverable: true } });
    expect(await fixture.store.listSessions()).toHaveLength(1);

    release();
    await handle.completion;
  });
});
