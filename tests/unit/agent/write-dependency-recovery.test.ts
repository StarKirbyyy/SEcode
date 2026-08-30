import { describe, expect, it } from "vitest";

import {
  createWriteDependencyRecoveryState,
  getPendingParentDirectories,
  recordMissingParentDirectory,
  resolveObservedParentDirectories,
  writeDependencyRecoveryBudgetExceeded,
} from "@/lib/agent/write-dependency-recovery";
import { createWorkspaceObservationState } from "@/lib/agent/workspace-observations";

describe("write dependency recovery", () => {
  it("normalizes, deduplicates and bounds pending relative parents", () => {
    const state = createWriteDependencyRecoveryState();
    expect(recordMissingParentDirectory(state, "server", 2, 3)).toBe(true);
    expect(recordMissingParentDirectory(state, "server", 2, 4)).toBe(false);
    expect(getPendingParentDirectories(state)).toEqual(["server"]);
    expect(() => recordMissingParentDirectory(state, "../outside", 2, 4)).toThrow();
  });

  it("does not resolve a pending parent without a fresh complete observation", () => {
    const state = createWriteDependencyRecoveryState();
    recordMissingParentDirectory(state, "server", 2, 3);
    expect(resolveObservedParentDirectories(
      state,
      createWorkspaceObservationState(),
    )).toBe(0);
    expect(getPendingParentDirectories(state)).toEqual(["server"]);
  });

  it("ends no-progress recovery after four model requests or eight tools", () => {
    const state = createWriteDependencyRecoveryState();
    recordMissingParentDirectory(state, "server", 2, 3);
    expect(writeDependencyRecoveryBudgetExceeded(state, 5, 10)).toBe(false);
    expect(writeDependencyRecoveryBudgetExceeded(state, 6, 10)).toBe(true);
    expect(writeDependencyRecoveryBudgetExceeded(state, 5, 11)).toBe(true);
  });
});
