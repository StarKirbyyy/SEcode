import { describe, expect, it } from "vitest";

import {
  TERMINAL_MODEL_ENVIRONMENT_NAMES,
  selectModelEnvironment,
  selectTerminalDataDirectory,
} from "@/lib/terminal/environment";
import { TerminalLayerError } from "@/lib/terminal/errors";

describe("terminal environment boundary", () => {
  it("copies exactly the fourteen approved model variables", () => {
    const source = Object.fromEntries(TERMINAL_MODEL_ENVIRONMENT_NAMES.map((name, index) => [name, `value-${index}`]));
    const selected = selectModelEnvironment({ ...source, SECRET_EXTRA: "must-drop", SECODE_DATA_DIR: "/tmp/data" });
    expect(Object.keys(selected)).toEqual([...TERMINAL_MODEL_ENVIRONMENT_NAMES]);
    expect(selected.SECRET_EXTRA).toBeUndefined();
    expect(selected.SECODE_DATA_DIR).toBeUndefined();
    expect(selected.DEEPSEEK_API_KEY).toBe("value-0");
  });

  it("uses flag over env over default", () => {
    expect(selectTerminalDataDirectory("/tmp/flag", { SECODE_DATA_DIR: "/tmp/env" })).toBe("/tmp/flag");
    expect(selectTerminalDataDirectory(undefined, { SECODE_DATA_DIR: " /tmp/env " })).toBe("/tmp/env");
    expect(selectTerminalDataDirectory(undefined, {})).toBeUndefined();
  });

  it("fails closed on relative data directories without exposing values", () => {
    const value = "private-relative-data";
    try {
      selectTerminalDataDirectory(undefined, { SECODE_DATA_DIR: value });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(TerminalLayerError);
      expect(JSON.stringify(error)).not.toContain(value);
    }
  });
});
