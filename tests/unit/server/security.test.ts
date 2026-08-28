import { describe, expect, it } from "vitest";

import { jsonResponse } from "@/lib/server";

describe("server security regression", () => {
  it("does not add CORS or credential headers", () => {
    const response = jsonResponse({ ok: true });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("authorization")).toBeNull();
    expect(response.headers.get("cookie")).toBeNull();
  });
});
