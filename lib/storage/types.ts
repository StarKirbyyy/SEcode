import type {
  DurableAgentEvent,
  RunId,
  SessionId,
  SessionRecord,
} from "@/lib/domain";

import type {
  CreateStoredSessionInput,
  EventPageQuery,
  JsonlEventStoreOptions,
  RecentWorkspaceQuery,
  StoredSessionMetadata,
} from "./schemas";

export const STORAGE_VERSION = 1 as const;
export const DEFAULT_DATA_DIRECTORY_NAME = ".secode-data";
export const SESSION_METADATA_FILE_NAME = "session.json";
export const SESSION_EVENTS_FILE_NAME = "events.jsonl";
export const MAX_SESSION_METADATA_BYTES = 64 * 1024;
export const MAX_EVENT_LINE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_EVENT_PAGE_LIMIT = 500;
export const MAX_EVENT_PAGE_LIMIT = 1_000;
export const DEFAULT_RECENT_WORKSPACE_LIMIT = 20;
export const MAX_RECENT_WORKSPACE_LIMIT = 100;

export const EVENT_STORE_ERROR_CODES = [
  "EVENT_STORE_CONFIG_INVALID",
  "EVENT_STORE_NOT_INITIALIZED",
  "EVENT_STORE_IO_ERROR",
  "EVENT_COMMIT_UNCERTAIN",
  "EVENT_STORE_SYMLINK_DENIED",
  "EVENT_STORE_PATH_CONFLICT",
  "SESSION_ALREADY_EXISTS",
  "SESSION_NOT_FOUND",
  "SESSION_METADATA_CORRUPT",
  "SESSION_ID_MISMATCH",
  "EVENT_LOG_CORRUPT",
  "EVENT_TOO_LARGE",
  "EVENT_SEQUENCE_CONFLICT",
  "EVENT_ID_DUPLICATE",
  "EVENT_TYPE_FORBIDDEN",
  "EVENT_SESSION_MISMATCH",
] as const;

export type EventStoreErrorCode =
  (typeof EVENT_STORE_ERROR_CODES)[number];

type StoreOwnedEventField =
  | "protocolVersion"
  | "durable"
  | "id"
  | "seq"
  | "sessionId"
  | "createdAt";

export type DurableEventDraft =
  DurableAgentEvent extends infer TEvent
    ? TEvent extends DurableAgentEvent
      ? TEvent["type"] extends "session.created"
        ? never
        : Omit<TEvent, StoreOwnedEventField>
      : never
    : never;

export interface SessionRecoveryReport {
  readonly tailRepaired: boolean;
  readonly discardedTailBytes: number;
  readonly lastStableSeq: number;
  readonly openRunIds: readonly RunId[];
}

export interface EventPage {
  readonly events: readonly DurableAgentEvent[];
  readonly lastSeq: number;
  readonly hasMore: boolean;
  readonly recovery: SessionRecoveryReport;
}

export interface SessionInspection {
  readonly metadata: StoredSessionMetadata;
  readonly lastSeq: number;
  readonly recovery: SessionRecoveryReport;
}

export interface CreatedStoredSession {
  readonly metadata: StoredSessionMetadata;
  readonly session: SessionRecord;
  readonly event: Extract<DurableAgentEvent, { type: "session.created" }>;
}

export interface DeletedStoredSession {
  readonly sessionId: SessionId;
  readonly status: "deleted";
}

export interface JsonlEventStore {
  initialize(): Promise<void>;
  createSession(
    input: CreateStoredSessionInput,
  ): Promise<CreatedStoredSession>;
  deleteSession(sessionId: SessionId): Promise<DeletedStoredSession>;
  getSessionMetadata(sessionId: SessionId): Promise<StoredSessionMetadata>;
  listSessions(): Promise<readonly StoredSessionMetadata[]>;
  listRecentWorkspaces(
    query?: RecentWorkspaceQuery,
  ): Promise<readonly string[]>;
  appendEvent(
    sessionId: SessionId,
    draft: DurableEventDraft,
  ): Promise<DurableAgentEvent>;
  readEvents(
    sessionId: SessionId,
    query?: EventPageQuery,
  ): Promise<EventPage>;
  inspectSession(sessionId: SessionId): Promise<SessionInspection>;
}

export type {
  CreateStoredSessionInput,
  EventPageQuery,
  JsonlEventStoreOptions,
  RecentWorkspaceQuery,
  StoredSessionMetadata,
};
