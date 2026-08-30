import * as fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createServerError } from "@/lib/server/errors";
import type { ServerApplication } from "@/lib/server";
import { POST as browseWorkspace } from "@/app/api/workspaces/browse/route";
import { POST as validateWorkspace } from "@/app/api/workspaces/validate/route";
import { POST as createSession } from "@/app/api/sessions/route";

import {
  cleanupServerFixtures,
  createServerFixture,
  jsonRequest,
  parseJson,
  type ServerFixture,
} from "./helpers";

const APPLICATION_KEY = Symbol.for("secode.server.application.v1");
let fixture: ServerFixture;

beforeEach(async () => {
  fixture = await createServerFixture();
});

afterEach(cleanupServerFixtures);

describe("POST /api/workspaces/browse", () => {
  it("browses, validates and creates a session from one canonical workspace", async () => {
    await fs.mkdir(path.join(fixture.workspace, "project"));
    const browsed = await browseWorkspace(jsonRequest("/api/workspaces/browse", "POST", { segments: ["project"] }));
    expect(browsed.status).toBe(200);
    expect(browsed.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(browsed.headers.get("x-content-type-options")).toBe("nosniff");
    const browseBody = await parseJson(browsed);
    const candidate = (browseBody.current as { workspacePath: string }).workspacePath;

    const validated = await validateWorkspace(jsonRequest("/api/workspaces/validate", "POST", { path: candidate }));
    expect(validated.status).toBe(200);
    expect(await parseJson(validated)).toEqual({ workspacePath: candidate });

    const created = await createSession(jsonRequest("/api/sessions", "POST", {
      workspacePath: candidate,
      modelProfileId: "test-model",
      title: "Picker session",
    }));
    expect(created.status).toBe(201);
  });

  it("enforces body, size, host and origin guards", async () => {
    expect((await browseWorkspace(jsonRequest("/api/workspaces/browse", "POST", { segments: [], extra: true }))).status).toBe(400);
    expect((await browseWorkspace(new Request("http://localhost/api/workspaces/browse", { method: "POST", body: "{}" }))).status).toBe(415);
    expect((await browseWorkspace(new Request("http://localhost/api/workspaces/browse", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(9 * 1024 * 1024) },
      body: "{}",
    }))).status).toBe(413);
    expect((await browseWorkspace(jsonRequest("http://example.com/api/workspaces/browse", "POST", { segments: [] }))).status).toBe(403);
    expect((await browseWorkspace(jsonRequest("/api/workspaces/browse", "POST", { segments: [] }, { origin: "http://evil.example" }))).status).toBe(403);
  });

  it.each([
    ["API_WORKSPACE_PICKER_UNAVAILABLE", 503],
    ["API_WORKSPACE_PICKER_CONFIG_INVALID", 503],
    ["API_WORKSPACE_PICKER_PATH_INVALID", 400],
    ["API_WORKSPACE_PICKER_PATH_FORBIDDEN", 403],
    ["API_WORKSPACE_PICKER_IO_ERROR", 500],
  ] as const)("maps %s without leaking internals", async (code, status) => {
    const failing = {
      ...fixture.application,
      browseWorkspaces: async () => {
        throw createServerError(code, "有限错误", true, undefined, new Error("private secret"));
      },
    } as ServerApplication;
    (globalThis as Record<symbol, unknown>)[APPLICATION_KEY] = Promise.resolve(failing);
    const response = await browseWorkspace(jsonRequest("/api/workspaces/browse", "POST", { segments: [] }));
    expect(response.status).toBe(status);
    expect(JSON.stringify(await parseJson(response))).not.toContain("private secret");
  });

  it("supports concurrent read-only browse requests", async () => {
    await fs.mkdir(path.join(fixture.workspace, "shared"));
    const responses = await Promise.all(Array.from({ length: 12 }, () =>
      browseWorkspace(jsonRequest("/api/workspaces/browse", "POST", { segments: [] })),
    ));
    expect(responses.every((response) => response.status === 200)).toBe(true);
  });

  it("rejects a selected directory replaced by an external symlink", async () => {
    const selected = path.join(fixture.workspace, "selected");
    const outside = path.join(fixture.root, "outside");
    await fs.mkdir(selected);
    await fs.mkdir(outside);
    const browse = await browseWorkspace(jsonRequest("/api/workspaces/browse", "POST", { segments: ["selected"] }));
    const candidate = ((await parseJson(browse)).current as { workspacePath: string }).workspacePath;
    await fs.rename(selected, `${selected}-old`);
    await fs.symlink(outside, selected, "dir");

    const response = await createSession(jsonRequest("/api/sessions", "POST", {
      workspacePath: candidate,
      modelProfileId: "test-model",
    }));
    expect(response.status).toBe(403);
  });
});
