import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  assertLocalRequest,
  assertMutationOrigin,
  handleApiRequest,
  jsonResponse,
  readJsonBody,
  searchParamsObject,
} from "@/lib/server";

const schema = z.strictObject({ value: z.string() });

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("HTTP boundary", () => {
  it.each(["http://localhost/api", "http://127.0.0.1/api", "http://[::1]/api"])("accepts %s", (url) => {
    expect(() => assertLocalRequest(request(url))).not.toThrow();
  });

  it("rejects non-loopback and ignores forwarded headers", () => {
    expect(() => assertLocalRequest(request("http://192.168.1.2/api", { headers: { forwarded: "host=localhost", "x-forwarded-host": "localhost" } }))).toThrow();
  });

  it("allows absent or exact Origin and rejects cross-origin", () => {
    expect(() => assertMutationOrigin(request("http://localhost/api", { method: "POST" }))).not.toThrow();
    expect(() => assertMutationOrigin(request("http://localhost/api", { method: "POST", headers: { origin: "http://localhost" } }))).not.toThrow();
    expect(() => assertMutationOrigin(request("http://localhost/api", { method: "POST", headers: { origin: "http://evil.test" } }))).toThrow();
  });

  it("reads chunked UTF-8 JSON with charset", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"中'));
        controller.enqueue(new TextEncoder().encode('文"}'));
        controller.close();
      },
    });
    const parsed = await readJsonBody(request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body, duplex: "half" } as RequestInit), schema);
    expect(parsed).toEqual({ value: "中文" });
  });

  it("rejects unsupported, malformed and declared-oversize bodies", async () => {
    await expect(readJsonBody(request("http://localhost/api", { method: "POST", body: "{}" }), schema)).rejects.toMatchObject({ error: { code: "API_CONTENT_TYPE_UNSUPPORTED" } });
    await expect(readJsonBody(request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }), schema)).rejects.toMatchObject({ error: { code: "API_REQUEST_INVALID" } });
    await expect(readJsonBody(request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json", "content-length": String(9 * 1024 * 1024) }, body: "{}" }), schema)).rejects.toMatchObject({ error: { code: "API_REQUEST_TOO_LARGE" } });
  });

  it("enforces actual streamed bytes and rejects invalid UTF-8", async () => {
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8 * 1024 * 1024));
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
    await expect(readJsonBody(request("http://localhost/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversized,
      duplex: "half",
    } as RequestInit), schema)).rejects.toMatchObject({ error: { code: "API_REQUEST_TOO_LARGE" } });

    const invalidUtf8 = new Uint8Array([0xc3, 0x28]);
    await expect(readJsonBody(request("http://localhost/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: invalidUtf8,
    }), schema)).rejects.toMatchObject({ error: { code: "API_REQUEST_INVALID" } });
  });

  it("supports empty cancellation body only when allowed", async () => {
    const emptySchema = z.strictObject({ reason: z.string().optional() });
    const empty = request("http://localhost/api", { method: "DELETE", headers: { "content-type": "application/json" } });
    await expect(readJsonBody(empty, emptySchema)).rejects.toMatchObject({ error: { code: "API_REQUEST_INVALID" } });
    expect(await readJsonBody(request("http://localhost/api", { method: "DELETE", headers: { "content-type": "application/json" } }), emptySchema, { allowEmpty: true })).toEqual({});
  });

  it("rejects duplicate query keys and fixes safe response headers", async () => {
    expect(() => searchParamsObject(new URL("http://localhost/api?a=1&a=2"))).toThrow();
    const response = jsonResponse({ ok: true }, { headers: { authorization: "secret" } });
    expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("authorization")).toBeNull();
  });

  it("converts guard failures to envelopes", async () => {
    const response = await handleApiRequest(request("http://remote.test/api"), false, () => jsonResponse({ ok: true }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "API_HOST_FORBIDDEN" } });
  });
});
