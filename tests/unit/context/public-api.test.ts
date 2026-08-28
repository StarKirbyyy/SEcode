import { describe, expect, it } from "vitest";

import * as context from "@/lib/context";

describe("context public API", () => {
  it("exports only the approved runtime values", () => {
    expect(Object.keys(context).sort()).toEqual([
      "CONTEXT_COMPACTION_THRESHOLD_RATIO",
      "CONTEXT_ERROR_CODES",
      "CONTEXT_EVENT_PAGE_LIMIT",
      "CONTEXT_PROTOCOL_VERSION",
      "CONTEXT_RETAIN_RECENT_ROUNDS",
      "CONTEXT_SUMMARY_MARKER",
      "CONTEXT_SUMMARY_TARGET_RATIO",
      "ContextLayerError",
      "ESTIMATED_MESSAGE_OVERHEAD_TOKENS",
      "ESTIMATED_REQUEST_OVERHEAD_TOKENS",
      "ESTIMATED_UTF8_BYTES_PER_TOKEN",
      "MAX_CONTEXT_SUMMARY_CHARACTERS",
      "MAX_PINNED_UNRESOLVED_ERRORS",
      "createAgentContextProvider",
    ].sort());
  });

  it("does not expose history, selection, or summary internals", () => {
    const names = Object.keys(context).join(" ");
    expect(names).not.toMatch(/project|render|select|generate|append|continuation/i);
  });
});
