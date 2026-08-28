import { describe, expect, it } from "vitest";

import * as terminal from "@/lib/terminal";

describe("terminal public API", () => {
  it("exports only the approved runtime values", () => {
    expect(Object.keys(terminal).sort()).toEqual([
      "TERMINAL_ERROR_CODES",
      "TERMINAL_EXIT_CODES",
      "TERMINAL_MODEL_ENVIRONMENT_NAMES",
      "runTerminalMain",
    ]);
    expect(terminal.TERMINAL_ERROR_CODES).toHaveLength(10);
    expect(terminal.TERMINAL_EXIT_CODES).toEqual([0, 1, 2, 130]);
    expect(terminal.TERMINAL_MODEL_ENVIRONMENT_NAMES).toHaveLength(14);
    expect(typeof terminal.runTerminalMain).toBe("function");
  });
});
