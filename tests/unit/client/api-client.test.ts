import { describe, expect, it, vi } from "vitest";

import { createApiClient, UiClientError } from "@/lib/client/api-client";

function json(value: unknown, status = 200, type = "application/json; charset=utf-8") {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": type } });
}

describe("client JSON API", () => {
  it("sends same-origin requests and validates successful JSON", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return json({ workspaces: ["/code"] });
    });
    const client = createApiClient({ fetcher });
    await expect(client.getRecentWorkspaces()).resolves.toEqual({ workspaces: ["/code"] });
    expect(fetcher).toHaveBeenCalledWith("/api/workspaces/recent", expect.objectContaining({ headers: expect.any(Headers), signal: undefined }));
    const headers = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBeNull();
  });

  it("validates finite server errors on non-2xx responses", async () => {
    const client = createApiClient({ fetcher: async () => json({ error: { code: "API_REQUEST_INVALID", message: "请求错误", recoverable: true } }, 400) });
    await expect(client.getSessions()).rejects.toMatchObject({ code: "API_REQUEST_INVALID", message: "请求错误", recoverable: true, status: 400 });
  });

  it.each([
    [new Response("text", { headers: { "content-type": "text/plain" } }), "UI_RESPONSE_INVALID"],
    [new Response("{", { headers: { "content-type": "application/json" } }), "UI_RESPONSE_INVALID"],
    [json({ sessions: "wrong" }), "UI_RESPONSE_INVALID"],
  ] as const)("maps invalid responses to %s", async (response, code) => {
    const client = createApiClient({ fetcher: async () => response });
    await expect(client.getSessions()).rejects.toMatchObject({ code });
  });

  it("distinguishes network failures and aborts without leaking causes", async () => {
    const network = createApiClient({ fetcher: async () => { throw new Error("Bearer secret-key"); } });
    await expect(network.getConfig()).rejects.toMatchObject({ code: "UI_NETWORK_ERROR" });
    try {
      await network.getConfig();
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain("secret-key");
    }

    const abort = createApiClient({ fetcher: async () => { throw new DOMException("aborted", "AbortError"); } });
    await expect(abort.getConfig()).rejects.toMatchObject({ code: "UI_OPERATION_ABORTED" });
  });

  it("forwards AbortSignal and JSON mutation bodies", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return json({ root: { label: "code", workspacePath: "/code" }, current: { label: "code", segments: [], workspacePath: "/code" }, parentSegments: null, directories: [], blockedEntries: 0, ignoredEntries: 0, truncated: false });
    });
    const controller = new AbortController();
    const client = createApiClient({ fetcher });
    await client.browseWorkspaces([], controller.signal);
    expect(fetcher).toHaveBeenCalledWith("/api/workspaces/browse", expect.objectContaining({ method: "POST", body: JSON.stringify({ segments: [] }), signal: controller.signal }));
  });

  it("deletes an encoded session URL without a request body", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return json({ sessionId: id, status: "deleted" });
    });
    const controller = new AbortController();
    await expect(createApiClient({ fetcher }).deleteSession(id, controller.signal)).resolves.toEqual({
      sessionId: id,
      status: "deleted",
    });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/sessions/${encodeURIComponent(id)}`,
      expect.objectContaining({ method: "DELETE", signal: controller.signal }),
    );
    expect(fetcher.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it("opens only validated NDJSON run responses", async () => {
    const response = new Response("", { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
    const fetcher = vi.fn(async () => response);
    const client = createApiClient({ fetcher });
    await expect(client.startRun("session", "fix tests")).resolves.toBe(response);
    expect(fetcher).toHaveBeenCalledWith("/api/sessions/session/runs", expect.objectContaining({ method: "POST", body: JSON.stringify({ prompt: "fix tests", planningEnabled: false }) }));
    await expect(createApiClient({ fetcher: async () => json({ ok: true }) }).startRun("session", "go")).rejects.toMatchObject({ code: "UI_RESPONSE_INVALID" });
  });

  it("starts Plan Mode explicitly and resolves plans through the independent encoded endpoint", async () => {
    const runId = "00000000-0000-4000-8000-000000000001";
    const planId = "00000000-0000-4000-8000-000000000002";
    const approvalId = "00000000-0000-4000-8000-000000000003";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("", { headers: { "content-type": "application/x-ndjson" } }))
      .mockResolvedValueOnce(json({ runId, planId, approvalId, status: "resolved", approved: true }));
    const client = createApiClient({ fetcher });
    await client.startRun("session/id", "go", { planningEnabled: true });
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/sessions/session%2Fid/runs", expect.objectContaining({
      body: JSON.stringify({ prompt: "go", planningEnabled: true }),
    }));
    await expect(client.resolvePlanApproval(runId, "approval/id", { planId, approved: true })).resolves.toMatchObject({ approved: true });
    expect(fetcher).toHaveBeenNthCalledWith(2, `/api/runs/${runId}/plans/approval%2Fid`, expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ planId, approved: true }),
    }));
  });

  it("exposes only finite enumerable error fields", () => {
    const error = new UiClientError("UI_NETWORK_ERROR", "网络失败", true);
    expect(JSON.parse(JSON.stringify(error))).toEqual({ code: "UI_NETWORK_ERROR", message: "网络失败", recoverable: true });
  });
});
