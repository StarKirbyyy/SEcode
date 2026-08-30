import { describe, expect, it } from "vitest";

import { BrowseWorkspaceRequestSchema, jsonResponse } from "@/lib/server";

describe("server security regression", () => {
  it("does not add CORS or credential headers", () => {
    const response = jsonResponse({ ok: true });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("authorization")).toBeNull();
    expect(response.headers.get("cookie")).toBeNull();
  });

  it("never accepts absolute or traversal picker input", () => {
    for (const segments of [[".."], ["/tmp"], ["C:\\code"], ["https://host"]]) {
      expect(BrowseWorkspaceRequestSchema.safeParse({ segments }).success).toBe(false);
    }
  });
});
