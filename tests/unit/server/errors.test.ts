import { describe, expect, it } from "vitest";

import { AgentLayerError } from "@/lib/agent";
import { EventStoreError } from "@/lib/storage";
import { apiErrorResponse } from "@/lib/server";
import { createServerError } from "@/lib/server/errors";

async function status(error: unknown) {
  const response = apiErrorResponse(error);
  return { status: response.status, body: await response.json() };
}

describe("server error mapping", () => {
  it.each([
    ["API_REQUEST_INVALID", 400],
    ["API_HOST_FORBIDDEN", 403],
    ["API_ORIGIN_FORBIDDEN", 403],
    ["API_REQUEST_TOO_LARGE", 413],
    ["API_CONTENT_TYPE_UNSUPPORTED", 415],
    ["API_MODEL_PROFILE_UNAVAILABLE", 422],
    ["API_STREAM_FAILED", 500],
    ["API_INTERNAL_ERROR", 500],
  ] as const)("maps %s", async (code, expected) => {
    expect((await status(createServerError(code, "safe", true))).status).toBe(expected);
  });

  it("maps known core errors", async () => {
    expect((await status(new EventStoreError({ code: "SESSION_NOT_FOUND", message: "missing", recoverable: true }))).status).toBe(404);
    expect((await status(new AgentLayerError({ code: "AGENT_SESSION_BUSY", message: "busy", recoverable: true }))).status).toBe(409);
    expect((await status(new AgentLayerError({ code: "AGENT_APPROVAL_INVALID", message: "approval", recoverable: true }))).status).toBe(409);
    expect((await status(new EventStoreError({ code: "EVENT_LOG_CORRUPT", message: "corrupt", recoverable: false }))).status).toBe(500);
    expect((await status(new EventStoreError({ code: "EVENT_STORE_IO_ERROR", message: "io", recoverable: true }))).status).toBe(503);
  });

  it("does not expose unknown error internals", async () => {
    const result = await status(Object.assign(new Error("secret"), { stack: "private", cause: "key" }));
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: { code: "API_INTERNAL_ERROR", message: "服务端发生未分类错误", recoverable: false } });
    expect(JSON.stringify(result.body)).not.toContain("secret");
  });
});
