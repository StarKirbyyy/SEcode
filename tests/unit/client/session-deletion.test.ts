import { describe, expect, it } from "vitest";

import {
  CLOSED_SESSION_DELETION,
  beginSessionDeletion,
  failSessionDeletion,
  markSessionDeletionPending,
  reconcileSessionDeletion,
} from "@/lib/client/session-deletion";

const SESSION = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "A",
  workspacePath: "/code/a",
  modelProfileId: "test",
  createdAt: "2026-08-28T00:00:00.000Z",
};

describe("session deletion projection", () => {
  it("moves through confirming, deleting and finite error states", () => {
    const confirming = beginSessionDeletion(SESSION);
    expect(confirming).toMatchObject({ status: "confirming", session: SESSION });
    const deleting = markSessionDeletionPending(confirming);
    expect(deleting).toMatchObject({ status: "deleting", session: SESSION });
    expect(failSessionDeletion(deleting, {
      code: "API_SESSION_BUSY",
      message: "busy",
      recoverable: true,
    })).toMatchObject({ status: "error", error: { code: "API_SESSION_BUSY" } });
  });

  it("ignores invalid transitions and exposes an immutable closed state", () => {
    expect(markSessionDeletionPending(CLOSED_SESSION_DELETION)).toBe(CLOSED_SESSION_DELETION);
    expect(Object.isFrozen(CLOSED_SESSION_DELETION)).toBe(true);
  });

  it("removes only the selected session and reports current navigation", () => {
    const other = { ...SESSION, id: "00000000-0000-4000-8000-000000000002", title: "B" };
    expect(reconcileSessionDeletion([SESSION, other], SESSION.id, SESSION.id)).toEqual({
      sessions: [other],
      deletedCurrentSession: true,
    });
    expect(reconcileSessionDeletion([SESSION, other], other.id, SESSION.id)).toEqual({
      sessions: [SESSION],
      deletedCurrentSession: false,
    });
  });
});
