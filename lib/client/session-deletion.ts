import type { PublicSessionMetadata } from "./types";

export interface SessionDeletionError {
  code: string;
  message: string;
  recoverable: boolean;
}

export type SessionDeletionState =
  | Readonly<{ status: "closed" }>
  | Readonly<{ status: "confirming"; session: PublicSessionMetadata }>
  | Readonly<{ status: "deleting"; session: PublicSessionMetadata }>
  | Readonly<{
      status: "error";
      session: PublicSessionMetadata;
      error: SessionDeletionError;
    }>;

export const CLOSED_SESSION_DELETION: SessionDeletionState = Object.freeze({
  status: "closed",
});

export function beginSessionDeletion(
  session: PublicSessionMetadata,
): SessionDeletionState {
  return Object.freeze({ status: "confirming", session });
}

export function markSessionDeletionPending(
  state: SessionDeletionState,
): SessionDeletionState {
  if (state.status !== "confirming" && state.status !== "error") return state;
  return Object.freeze({ status: "deleting", session: state.session });
}

export function failSessionDeletion(
  state: SessionDeletionState,
  error: SessionDeletionError,
): SessionDeletionState {
  if (state.status !== "deleting") return state;
  return Object.freeze({ status: "error", session: state.session, error });
}

export interface ReconciledSessionDeletion {
  sessions: PublicSessionMetadata[];
  deletedCurrentSession: boolean;
}

export function reconcileSessionDeletion(
  sessions: readonly PublicSessionMetadata[],
  deletedSessionId: string,
  currentSessionId?: string,
): ReconciledSessionDeletion {
  return {
    sessions: sessions.filter((session) => session.id !== deletedSessionId),
    deletedCurrentSession: currentSessionId === deletedSessionId,
  };
}
