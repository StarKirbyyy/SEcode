import { UiClientError } from "./api-client";
import {
  createEventLedger,
  mergeAgentEvents,
  type EventLedger,
} from "./event-state";
import type { EventPageResponse } from "./types";

export type HistoryPageSource = (
  sessionId: string,
  after: number,
  signal?: AbortSignal,
) => Promise<EventPageResponse>;

export interface CompleteHistory {
  ledger: EventLedger;
  recovery: EventPageResponse["recovery"];
  stableLastSeq: number;
}

export interface HistoryLoadTicket {
  readonly sessionId: string;
  readonly generation: number;
}

export class HistoryLoadOwnership {
  private generation = 0;
  private current: HistoryLoadTicket | undefined;

  begin(sessionId: string): HistoryLoadTicket {
    const ticket = { sessionId, generation: this.generation + 1 };
    this.generation = ticket.generation;
    this.current = ticket;
    return ticket;
  }

  owns(ticket: HistoryLoadTicket): boolean {
    return this.current?.generation === ticket.generation
      && this.current.sessionId === ticket.sessionId;
  }

  invalidate(): void {
    this.generation += 1;
    this.current = undefined;
  }
}

export function canCommitCompleteHistory(
  current: EventLedger | undefined,
  candidate: CompleteHistory,
): boolean {
  const candidateTail = candidate.ledger.durable.at(-1)?.seq ?? 0;
  if (
    candidateTail !== candidate.stableLastSeq
    || candidate.recovery.lastStableSeq !== candidate.stableLastSeq
  ) return false;
  if (current === undefined) return true;
  if (
    current.sessionId !== candidate.ledger.sessionId
    || current.durable.length > candidate.ledger.durable.length
  ) return false;
  return current.durable.every((event, index) => {
    const next = candidate.ledger.durable[index];
    return next !== undefined
      && next.seq === event.seq
      && next.id === event.id
      && JSON.stringify(next) === JSON.stringify(event);
  });
}

function aborted(): UiClientError {
  return new UiClientError("UI_OPERATION_ABORTED", "历史恢复已取消", true);
}

function invalid(): UiClientError {
  return new UiClientError("UI_RESPONSE_INVALID", "历史分页响应不完整", true);
}

function unavailable(): UiClientError {
  return new UiClientError("UI_NETWORK_ERROR", "无法读取本地 Session 历史", true);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw aborted();
}

export async function loadCompleteHistory(
  sessionId: string,
  source: HistoryPageSource,
  signal?: AbortSignal,
): Promise<CompleteHistory> {
  let ledger = createEventLedger(sessionId);
  let after = 0;
  let stableLastSeq: number | undefined;
  let recovery: EventPageResponse["recovery"] | undefined;

  while (true) {
    throwIfAborted(signal);
    let page: EventPageResponse;
    try {
      page = await source(sessionId, after, signal);
    } catch (error) {
      throwIfAborted(signal);
      if (error instanceof UiClientError) throw error;
      throw unavailable();
    }
    throwIfAborted(signal);

    if (stableLastSeq === undefined) stableLastSeq = page.lastSeq;
    if (
      page.lastSeq !== stableLastSeq
      || page.recovery.lastStableSeq !== stableLastSeq
      || page.events.length === 0
      || page.events.some((event, index) =>
        !event.durable
        || event.sessionId !== sessionId
        || event.seq !== after + index + 1
      )
    ) {
      throw invalid();
    }

    try {
      ledger = mergeAgentEvents(ledger, page.events);
    } catch {
      throw invalid();
    }
    recovery = page.recovery;
    const pageTail = page.events.at(-1)?.seq;
    if (pageTail === undefined || pageTail <= after || pageTail > stableLastSeq) {
      throw invalid();
    }

    if (!page.hasMore) {
      if (pageTail !== stableLastSeq) throw invalid();
      throwIfAborted(signal);
      return { ledger, recovery, stableLastSeq };
    }
    if (pageTail >= stableLastSeq) throw invalid();
    after = pageTail;
  }
}
