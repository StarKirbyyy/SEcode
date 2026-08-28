import { describe, expect, it } from "vitest";

import * as publicStorage from "@/lib/storage";

describe("storage public API", () => {
  it("exports the approved store contracts", () => {
    expect(publicStorage).toHaveProperty("createJsonlEventStore");
    expect(publicStorage).toHaveProperty("StoredSessionMetadataSchema");
    expect(publicStorage).toHaveProperty("DurableEventDraftSchema");
    expect(publicStorage).toHaveProperty("EventStoreError");
    expect(publicStorage.MAX_EVENT_LINE_BYTES).toBe(8 * 1024 * 1024);
    expect(publicStorage.DEFAULT_EVENT_PAGE_LIMIT).toBe(500);
  });

  it("keeps dependencies, mutex and JSONL primitives private", () => {
    expect(publicStorage).not.toHaveProperty(
      "createJsonlEventStoreWithDependencies",
    );
    expect(publicStorage).not.toHaveProperty("nativeEventStoreDependencies");
    expect(publicStorage).not.toHaveProperty("KeyedFifoExecutor");
    expect(publicStorage).not.toHaveProperty("scanEventLog");
    expect(publicStorage).not.toHaveProperty("repairIncompleteTail");
    expect(publicStorage).not.toHaveProperty("openVerifiedSessionFile");
  });
});
