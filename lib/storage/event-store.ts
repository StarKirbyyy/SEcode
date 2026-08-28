import path from "node:path";
import type { FileHandle } from "node:fs/promises";

import {
  DurableAgentEventSchema,
  SessionRecordSchema,
  UuidSchema,
  type DurableAgentEvent,
} from "@/lib/domain";

import {
  initializeEventStoreConfig,
  resolvePendingEventStoreConfig,
  type InitializedEventStoreConfig,
} from "./config";
import {
  nativeEventStoreDependencies,
  type EventStoreDependencies,
} from "./dependencies";
import {
  createEventStoreError,
  isErrno,
  mapStorageIoError,
} from "./errors";
import {
  openVerifiedSessionFile,
  validateSessionDirectory,
} from "./file-safety";
import {
  repairIncompleteTail,
  scanEventLog,
  serializeDurableEvent,
  writeBufferFully,
  type EventLogScanResult,
} from "./jsonl";
import { KeyedFifoExecutor } from "./mutex";
import {
  CreateStoredSessionInputSchema,
  DurableEventDraftSchema,
  EventPageQuerySchema,
  JsonlEventStoreOptionsSchema,
  RecentWorkspaceQuerySchema,
  StoredSessionMetadataSchema,
  type StoredSessionMetadata,
} from "./schemas";
import {
  MAX_SESSION_METADATA_BYTES,
  SESSION_EVENTS_FILE_NAME,
  SESSION_METADATA_FILE_NAME,
  STORAGE_VERSION,
  type CreatedStoredSession,
  type EventPage,
  type JsonlEventStore,
  type JsonlEventStoreOptions,
  type SessionInspection,
  type SessionRecoveryReport,
} from "./types";

const ROOT_LOCK_KEY = "root";
const SESSION_TEMP_PREFIX = ".creating-";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function parseSessionId(input: unknown): string {
  const parsed = UuidSchema.safeParse(input);
  if (!parsed.success) {
    throw createEventStoreError(
      "SESSION_NOT_FOUND",
      "The requested session does not exist.",
    );
  }
  return parsed.data;
}

function parseGeneratedUuid(input: string, field: string): string {
  const parsed = UuidSchema.safeParse(input);
  if (!parsed.success) {
    throw createEventStoreError(
      "EVENT_STORE_CONFIG_INVALID",
      "An injected event store identifier is invalid.",
      { field, reason: "invalid_uuid" },
      parsed.error,
    );
  }
  return parsed.data;
}

async function closeOrThrow(
  handle: FileHandle,
  message: string,
): Promise<void> {
  try {
    await handle.close();
  } catch (error) {
    throw mapStorageIoError(error, message);
  }
}

async function readBoundedFile(
  handle: FileHandle,
  maximumBytes: number,
): Promise<Buffer> {
  const stat = await handle.stat();
  if (!stat.isFile() || stat.size <= 0 || stat.size > maximumBytes) {
    throw createEventStoreError(
      "SESSION_METADATA_CORRUPT",
      "The session metadata size is invalid.",
    );
  }
  const buffer = Buffer.alloc(stat.size);
  let offset = 0;
  while (offset < buffer.byteLength) {
    const result = await handle.read(
      buffer,
      offset,
      buffer.byteLength - offset,
      offset,
    );
    if (result.bytesRead <= 0) {
      throw createEventStoreError(
        "SESSION_METADATA_CORRUPT",
        "The session metadata ended unexpectedly.",
      );
    }
    offset += result.bytesRead;
  }
  return buffer;
}

function parseMetadataBuffer(
  buffer: Buffer,
  sessionId: string,
): StoredSessionMetadata {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (error) {
    throw createEventStoreError(
      "SESSION_METADATA_CORRUPT",
      "The session metadata is not valid UTF-8.",
      { sessionId },
      error,
    );
  }
  if (
    !text.endsWith("\n") ||
    text.slice(0, -1).includes("\n") ||
    text.slice(0, -1).includes("\r") ||
    text.charCodeAt(0) === 0xfeff
  ) {
    throw createEventStoreError(
      "SESSION_METADATA_CORRUPT",
      "The session metadata is not one LF-terminated JSON record.",
      { sessionId },
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(text.slice(0, -1));
  } catch (error) {
    throw createEventStoreError(
      "SESSION_METADATA_CORRUPT",
      "The session metadata is not valid JSON.",
      { sessionId },
      error,
    );
  }
  const parsed = StoredSessionMetadataSchema.safeParse(value);
  if (!parsed.success) {
    throw createEventStoreError(
      "SESSION_METADATA_CORRUPT",
      "The session metadata failed schema validation.",
      { sessionId },
      parsed.error,
    );
  }
  if (parsed.data.id !== sessionId) {
    throw createEventStoreError(
      "SESSION_ID_MISMATCH",
      "The session metadata identifier does not match its directory.",
      { sessionId },
    );
  }
  return parsed.data;
}

function validateSessionIdentity(
  metadata: StoredSessionMetadata,
  firstEvent: DurableAgentEvent,
): void {
  if (firstEvent.type !== "session.created") {
    throw createEventStoreError(
      "EVENT_LOG_CORRUPT",
      "The session event log has no valid creation event.",
      { sessionId: metadata.id },
    );
  }
  const session = firstEvent.data.session;
  const identityMatches =
    session.id === metadata.id &&
    session.title === metadata.title &&
    session.workspacePath === metadata.workspacePath &&
    session.modelProfileId === metadata.modelProfileId &&
    session.createdAt === metadata.createdAt;
  if (!identityMatches) {
    throw createEventStoreError(
      "SESSION_METADATA_CORRUPT",
      "The session metadata does not match its creation event.",
      { sessionId: metadata.id },
    );
  }
  if (
    session.status !== "idle" ||
    session.updatedAt !== session.createdAt
  ) {
    throw createEventStoreError(
      "SESSION_METADATA_CORRUPT",
      "The initial session state is invalid.",
      { sessionId: metadata.id },
    );
  }
}

async function writeNewFile(
  filePath: string,
  buffer: Buffer,
  dependencies: EventStoreDependencies,
): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await dependencies.fs.open(filePath, "wx", 0o600);
    await writeBufferFully(handle, buffer);
    await handle.sync();
    await handle.close();
    handle = undefined;
  } catch (error) {
    if (handle !== undefined) {
      await handle.close().catch(() => undefined);
    }
    throw mapStorageIoError(
      error,
      "A new event store file could not be committed.",
    );
  }
}

async function syncDirectory(
  directoryPath: string,
  dependencies: EventStoreDependencies,
): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await dependencies.fs.open(directoryPath, "r");
    await handle.sync();
    await handle.close();
    handle = undefined;
  } catch (error) {
    if (handle !== undefined) {
      await handle.close().catch(() => undefined);
    }
    if (
      dependencies.platform === "win32" &&
      ["EISDIR", "EINVAL", "EPERM"].some((code) => isErrno(error, code))
    ) {
      return;
    }
    throw error;
  }
}

interface LoadedSession {
  readonly metadata: StoredSessionMetadata;
  readonly scan: EventLogScanResult;
  readonly recovery: SessionRecoveryReport;
}

class JsonlEventStoreImplementation implements JsonlEventStore {
  private initializedConfig: InitializedEventStoreConfig | undefined;
  private readonly pendingConfig;
  private readonly executor = new KeyedFifoExecutor();

  constructor(
    options: JsonlEventStoreOptions | undefined,
    private readonly dependencies: EventStoreDependencies,
  ) {
    const parsedOptions = JsonlEventStoreOptionsSchema.safeParse(options ?? {});
    if (!parsedOptions.success) {
      throw createEventStoreError(
        "EVENT_STORE_CONFIG_INVALID",
        "The event store options are invalid.",
        { field: "options", reason: "failed_validation" },
        parsedOptions.error,
      );
    }
    this.pendingConfig = resolvePendingEventStoreConfig(
      parsedOptions.data,
      dependencies,
    );
  }

  async initialize(): Promise<void> {
    await this.executor.run(ROOT_LOCK_KEY, async () => {
      if (this.initializedConfig !== undefined) {
        return;
      }
      this.initializedConfig = await initializeEventStoreConfig(
        this.pendingConfig,
        this.dependencies,
      );
    });
  }

  async createSession(input: unknown): Promise<CreatedStoredSession> {
    return this.executor.run(ROOT_LOCK_KEY, async () => {
      const config = this.requireInitialized();
      const parsedInput = CreateStoredSessionInputSchema.safeParse(input);
      if (!parsedInput.success) {
        throw createEventStoreError(
          "EVENT_STORE_CONFIG_INVALID",
          "The session creation input is invalid.",
          { field: "session", reason: "failed_validation" },
          parsedInput.error,
        );
      }

      const sessionId = parseGeneratedUuid(
        this.dependencies.randomUUID(),
        "sessionId",
      );
      const nonce = parseGeneratedUuid(
        this.dependencies.randomUUID(),
        "temporaryDirectoryNonce",
      );
      const eventId = parseGeneratedUuid(
        this.dependencies.randomUUID(),
        "eventId",
      );
      const createdAt = this.dependencies.now();
      const parsedMetadata = StoredSessionMetadataSchema.safeParse({
        storageVersion: STORAGE_VERSION,
        id: sessionId,
        title: parsedInput.data.title,
        workspacePath: parsedInput.data.workspacePath,
        modelProfileId: parsedInput.data.modelProfileId,
        createdAt,
      });
      if (!parsedMetadata.success) {
        throw createEventStoreError(
          "EVENT_STORE_CONFIG_INVALID",
          "The injected event store clock produced invalid metadata.",
          { field: "createdAt", reason: "invalid_timestamp" },
          parsedMetadata.error,
        );
      }
      const metadata = parsedMetadata.data;
      const parsedSession = SessionRecordSchema.safeParse({
        id: sessionId,
        title: metadata.title,
        workspacePath: metadata.workspacePath,
        modelProfileId: metadata.modelProfileId,
        status: "idle",
        createdAt,
        updatedAt: createdAt,
      });
      if (!parsedSession.success) {
        throw createEventStoreError(
          "SESSION_METADATA_CORRUPT",
          "The generated initial session record is invalid.",
          { sessionId },
          parsedSession.error,
        );
      }
      const session = parsedSession.data;
      const parsedEventResult = DurableAgentEventSchema.safeParse({
        protocolVersion: 1,
        durable: true,
        id: eventId,
        seq: 1,
        sessionId,
        type: "session.created",
        createdAt,
        data: { session },
      });
      if (!parsedEventResult.success) {
        throw createEventStoreError(
          "EVENT_LOG_CORRUPT",
          "The generated session creation event is invalid.",
          { sessionId },
          parsedEventResult.error,
        );
      }
      const parsedEvent = parsedEventResult.data;
      if (parsedEvent.type !== "session.created") {
        throw createEventStoreError(
          "EVENT_LOG_CORRUPT",
          "The generated session event has an invalid type.",
        );
      }
      const event = parsedEvent;

      const temporaryPath = path.join(
        config.sessionsRoot,
        `${SESSION_TEMP_PREFIX}${sessionId}-${nonce}`,
      );
      const finalPath = path.join(config.sessionsRoot, sessionId);
      let temporaryCreated = false;
      let renamed = false;
      try {
        await this.dependencies.fs.mkdir(temporaryPath, {
          recursive: false,
          mode: 0o700,
        });
        temporaryCreated = true;
        const metadataBuffer = Buffer.from(
          `${JSON.stringify(metadata)}\n`,
          "utf8",
        );
        if (metadataBuffer.byteLength > MAX_SESSION_METADATA_BYTES) {
          throw createEventStoreError(
            "SESSION_METADATA_CORRUPT",
            "The generated session metadata is too large.",
            { sessionId },
          );
        }
        await writeNewFile(
          path.join(temporaryPath, SESSION_METADATA_FILE_NAME),
          metadataBuffer,
          this.dependencies,
        );
        await writeNewFile(
          path.join(temporaryPath, SESSION_EVENTS_FILE_NAME),
          serializeDurableEvent(event),
          this.dependencies,
        );
        await this.dependencies.fs.rename(temporaryPath, finalPath);
        renamed = true;
        await syncDirectory(config.sessionsRoot, this.dependencies);
      } catch (error) {
        if (temporaryCreated && !renamed) {
          await this.dependencies.fs
            .rm(temporaryPath, { recursive: true, force: true })
            .catch(() => undefined);
        }
        if (
          !renamed &&
          (isErrno(error, "EEXIST") || isErrno(error, "ENOTEMPTY"))
        ) {
          throw createEventStoreError(
            "SESSION_ALREADY_EXISTS",
            "The generated session already exists.",
            { sessionId },
            error,
          );
        }
        if (renamed) {
          throw createEventStoreError(
            "EVENT_COMMIT_UNCERTAIN",
            "The session directory became visible but its directory commit is uncertain.",
            { sessionId },
            error,
          );
        }
        throw mapStorageIoError(
          error,
          "The session could not be created.",
          { sessionId },
        );
      }

      return deepFreeze({ metadata, session, event });
    });
  }

  async getSessionMetadata(sessionIdInput: unknown): Promise<StoredSessionMetadata> {
    this.requireInitialized();
    const sessionId = parseSessionId(sessionIdInput);
    return this.executor.run(`session:${sessionId}`, async () =>
      deepFreeze(await this.loadMetadataUnlocked(sessionId)),
    );
  }

  async listSessions(): Promise<readonly StoredSessionMetadata[]> {
    return this.executor.run(ROOT_LOCK_KEY, async () => {
      const config = this.requireInitialized();
      let entries;
      try {
        entries = await this.dependencies.fs.readdir(config.sessionsRoot, {
          withFileTypes: true,
        });
      } catch (error) {
        throw mapStorageIoError(
          error,
          "The session directory could not be listed.",
        );
      }

      const sessions: StoredSessionMetadata[] = [];
      for (const entry of entries) {
        if (!UuidSchema.safeParse(entry.name).success) {
          continue;
        }
        if (entry.isSymbolicLink()) {
          throw createEventStoreError(
            "EVENT_STORE_SYMLINK_DENIED",
            "A session directory cannot be a symbolic link.",
            { sessionId: entry.name },
          );
        }
        if (!entry.isDirectory()) {
          throw createEventStoreError(
            "EVENT_STORE_PATH_CONFLICT",
            "A session identifier points to a non-directory entry.",
            {
              sessionId: entry.name,
              expectedKind: "directory",
              actualKind: "other",
            },
          );
        }
        sessions.push(await this.loadMetadataUnlocked(entry.name));
      }
      sessions.sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          left.id.localeCompare(right.id),
      );
      return deepFreeze(sessions);
    });
  }

  async listRecentWorkspaces(queryInput?: unknown): Promise<readonly string[]> {
    this.requireInitialized();
    const query = RecentWorkspaceQuerySchema.safeParse(queryInput);
    if (!query.success) {
      throw createEventStoreError(
        "EVENT_STORE_CONFIG_INVALID",
        "The recent workspace query is invalid.",
        { field: "query", reason: "failed_validation" },
        query.error,
      );
    }
    const sessions = await this.listSessions();
    const workspaces: string[] = [];
    const seen = new Set<string>();
    for (const session of sessions) {
      if (seen.has(session.workspacePath)) {
        continue;
      }
      seen.add(session.workspacePath);
      workspaces.push(session.workspacePath);
      if (workspaces.length === query.data.limit) {
        break;
      }
    }
    return deepFreeze(workspaces);
  }

  async appendEvent(
    sessionIdInput: unknown,
    draftInput: unknown,
  ): Promise<DurableAgentEvent> {
    this.requireInitialized();
    const sessionId = parseSessionId(sessionIdInput);
    const draft = DurableEventDraftSchema.safeParse(draftInput);
    if (!draft.success) {
      throw createEventStoreError(
        "EVENT_TYPE_FORBIDDEN",
        "The durable event draft is invalid or forbidden.",
        { sessionId },
        draft.error,
      );
    }

    return this.executor.run(`session:${sessionId}`, async () => {
      const config = this.requireInitialized();
      const loaded = await this.loadSessionUnlocked(sessionId, 0, 1);
      const eventId = parseGeneratedUuid(
        this.dependencies.randomUUID(),
        "eventId",
      );
      if (loaded.scan.eventIds.has(eventId)) {
        throw createEventStoreError(
          "EVENT_ID_DUPLICATE",
          "The generated event identifier already exists.",
          { sessionId, eventId },
        );
      }
      const parsedEvent = DurableAgentEventSchema.safeParse({
        ...draft.data,
        protocolVersion: 1,
        durable: true,
        id: eventId,
        seq: loaded.scan.lastSeq + 1,
        sessionId,
        createdAt: this.dependencies.now(),
      });
      if (!parsedEvent.success) {
        throw createEventStoreError(
          "EVENT_STORE_CONFIG_INVALID",
          "The generated durable event envelope is invalid.",
          { sessionId, field: "event", reason: "invalid_envelope" },
          parsedEvent.error,
        );
      }
      const event = parsedEvent.data;
      const buffer = serializeDurableEvent(event);
      let handle: FileHandle | undefined;
      let writeAttempted = false;
      try {
        handle = await openVerifiedSessionFile(
          config.sessionsRoot,
          sessionId,
          SESSION_EVENTS_FILE_NAME,
          "a",
          this.dependencies,
        );
        writeAttempted = true;
        await writeBufferFully(handle, buffer);
        await handle.sync();
        await handle.close();
        handle = undefined;
      } catch (error) {
        if (handle !== undefined) {
          await handle.close().catch(() => undefined);
        }
        if (writeAttempted) {
          throw createEventStoreError(
            "EVENT_COMMIT_UNCERTAIN",
            "The event append commit is uncertain.",
            { sessionId },
            error,
          );
        }
        throw mapStorageIoError(
          error,
          "The event log could not be opened for append.",
          { sessionId },
        );
      }
      return deepFreeze(event);
    });
  }

  async readEvents(
    sessionIdInput: unknown,
    queryInput?: unknown,
  ): Promise<EventPage> {
    this.requireInitialized();
    const sessionId = parseSessionId(sessionIdInput);
    const query = EventPageQuerySchema.safeParse(queryInput);
    if (!query.success) {
      throw createEventStoreError(
        "EVENT_STORE_CONFIG_INVALID",
        "The event page query is invalid.",
        { field: "query", reason: "failed_validation" },
        query.error,
      );
    }
    return this.executor.run(`session:${sessionId}`, async () => {
      const loaded = await this.loadSessionUnlocked(
        sessionId,
        query.data.afterSeq,
        query.data.limit,
      );
      return deepFreeze({
        events: loaded.scan.events,
        lastSeq: loaded.scan.lastSeq,
        hasMore: loaded.scan.hasMore,
        recovery: loaded.recovery,
      });
    });
  }

  async inspectSession(sessionIdInput: unknown): Promise<SessionInspection> {
    this.requireInitialized();
    const sessionId = parseSessionId(sessionIdInput);
    return this.executor.run(`session:${sessionId}`, async () => {
      const loaded = await this.loadSessionUnlocked(sessionId, 0, 1);
      return deepFreeze({
        metadata: loaded.metadata,
        lastSeq: loaded.scan.lastSeq,
        recovery: loaded.recovery,
      });
    });
  }

  private requireInitialized(): InitializedEventStoreConfig {
    if (this.initializedConfig === undefined) {
      throw createEventStoreError(
        "EVENT_STORE_NOT_INITIALIZED",
        "The event store must be initialized before use.",
      );
    }
    return this.initializedConfig;
  }

  private async loadMetadataUnlocked(
    sessionId: string,
  ): Promise<StoredSessionMetadata> {
    const config = this.requireInitialized();
    await validateSessionDirectory(
      config.sessionsRoot,
      sessionId,
      this.dependencies,
    );
    let handle: FileHandle | undefined;
    try {
      handle = await openVerifiedSessionFile(
        config.sessionsRoot,
        sessionId,
        SESSION_METADATA_FILE_NAME,
        "r",
        this.dependencies,
      );
      const buffer = await readBoundedFile(handle, MAX_SESSION_METADATA_BYTES);
      await closeOrThrow(handle, "The session metadata file could not be closed.");
      handle = undefined;
      return parseMetadataBuffer(buffer, sessionId);
    } catch (error) {
      if (handle !== undefined) {
        await handle.close().catch(() => undefined);
      }
      throw mapStorageIoError(
        error,
        "The session metadata could not be loaded.",
        { sessionId },
      );
    }
  }

  private async loadSessionUnlocked(
    sessionId: string,
    afterSeq: number,
    limit: number,
  ): Promise<LoadedSession> {
    const config = this.requireInitialized();
    const metadata = await this.loadMetadataUnlocked(sessionId);
    let handle: FileHandle | undefined;
    let scan: EventLogScanResult;
    try {
      handle = await openVerifiedSessionFile(
        config.sessionsRoot,
        sessionId,
        SESSION_EVENTS_FILE_NAME,
        "r",
        this.dependencies,
      );
      scan = await scanEventLog(
        handle,
        { sessionId, afterSeq, limit },
        this.dependencies,
      );
      await closeOrThrow(handle, "The event log could not be closed.");
      handle = undefined;
    } catch (error) {
      if (handle !== undefined) {
        await handle.close().catch(() => undefined);
      }
      throw mapStorageIoError(
        error,
        "The event log could not be loaded.",
        { sessionId },
      );
    }

    if (scan.discardedTailBytes > 0) {
      let repairHandle: FileHandle | undefined;
      try {
        repairHandle = await openVerifiedSessionFile(
          config.sessionsRoot,
          sessionId,
          SESSION_EVENTS_FILE_NAME,
          "r+",
          this.dependencies,
        );
        await repairIncompleteTail(repairHandle, scan.lastStableOffset);
        await repairHandle.close();
        repairHandle = undefined;
      } catch (error) {
        if (repairHandle !== undefined) {
          await repairHandle.close().catch(() => undefined);
        }
        throw mapStorageIoError(
          error,
          "The event log tail could not be repaired.",
          { sessionId },
        );
      }
    }

    validateSessionIdentity(metadata, scan.firstEvent);
    const recovery: SessionRecoveryReport = {
      tailRepaired: scan.discardedTailBytes > 0,
      discardedTailBytes: scan.discardedTailBytes,
      lastStableSeq: scan.lastSeq,
      openRunIds: scan.openRunIds,
    };
    return { metadata, scan, recovery };
  }
}

export function createJsonlEventStoreWithDependencies(
  options: JsonlEventStoreOptions | undefined,
  dependencies: EventStoreDependencies,
): JsonlEventStore {
  return new JsonlEventStoreImplementation(options, dependencies);
}

export function createJsonlEventStore(
  options?: JsonlEventStoreOptions,
): JsonlEventStore {
  return createJsonlEventStoreWithDependencies(
    options,
    nativeEventStoreDependencies,
  );
}
