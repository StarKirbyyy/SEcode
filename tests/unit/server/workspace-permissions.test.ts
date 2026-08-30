import { describe, expect, it } from "vitest";

import { createWorkspacePermissionStore } from "@/lib/server/workspace-permissions";

describe("workspace permission store", () => {
  it("defaults to ask and isolates modes by canonical workspace", () => {
    const store = createWorkspacePermissionStore();
    expect(store.get("/a")).toBe("ask");
    store.set("/a", "full");
    expect(store.get("/a")).toBe("full");
    expect(store.get("/b")).toBe("ask");
  });

  it("can revoke full access", () => {
    const store = createWorkspacePermissionStore();
    store.set("/a", "full");
    store.set("/a", "ask");
    expect(store.get("/a")).toBe("ask");
  });
});
