import { describe, expect, it, vi } from "vitest";

import { DurableAgentEventSchema, type DurableAgentEvent } from "@/lib/domain";
import { UiClientError } from "@/lib/client/api-client";
import {
  HistoryLoadOwnership,
  canCommitCompleteHistory,
  loadCompleteHistory,
} from "@/lib/client/history-reconciliation";
import type { EventPageResponse } from "@/lib/client/types";

const SESSION = "00000000-0000-4000-8000-000000000001";
const OTHER_SESSION = "00000000-0000-4000-8000-000000000002";
const RUN = "00000000-0000-4000-8000-000000000010";
const NOW = "2026-08-30T12:00:00.000Z";

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function event(seq: number, total: number): DurableAgentEvent {
  if (seq === 1) {
    return DurableAgentEventSchema.parse({
      protocolVersion: 1,
      durable: true,
      id: uuid(10_000 + seq),
      seq,
      sessionId: SESSION,
      runId: RUN,
      type: "run.started",
      createdAt: NOW,
      data: {
        promptPreview: "合成长历史",
        limits: { maxDurationMs: 600_000 },
      },
    });
  }
  if (seq === total) {
    return DurableAgentEventSchema.parse({
      protocolVersion: 1,
      durable: true,
      id: uuid(10_000 + seq),
      seq,
      sessionId: SESSION,
      runId: RUN,
      type: "run.failed",
      createdAt: NOW,
      data: {
        error: { code: "SYNTHETIC_FAILURE", message: "合成失败终态", recoverable: true },
        iterations: 1,
      },
    });
  }
  return DurableAgentEventSchema.parse({
    protocolVersion: 1,
    durable: true,
    id: uuid(10_000 + seq),
    seq,
    sessionId: SESSION,
    runId: RUN,
    type: "user.message",
    createdAt: NOW,
    data: { content: `合成事件 ${seq}` },
  });
}

function events(total: number): DurableAgentEvent[] {
  return Array.from({ length: total }, (_, index) => event(index + 1, total));
}

function page(
  pageEvents: DurableAgentEvent[],
  lastSeq: number,
  hasMore: boolean,
  recoveryLastSeq = lastSeq,
): EventPageResponse {
  return {
    events: pageEvents,
    lastSeq,
    hasMore,
    recovery: {
      tailRepaired: false,
      discardedTailBytes: 0,
      lastStableSeq: recoveryLastSeq,
      openRunIds: [],
    },
  };
}

function pagedSource(all: DurableAgentEvent[], pageSize = 500) {
  const cursors: number[] = [];
  const source = vi.fn(async (_sessionId: string, after = 0): Promise<EventPageResponse> => {
    cursors.push(after);
    const selected = all.slice(after, after + pageSize);
    return page(selected, all.length, after + selected.length < all.length);
  });
  return { source, cursors };
}

describe("complete client history reconciliation", () => {
  it.each([500, 501, 538, 1000, 1001])(
    "loads %i durable events without confusing the stable tail with the page cursor",
    async (total) => {
      const all = events(total);
      const { source, cursors } = pagedSource(all);

      const result = await loadCompleteHistory(SESSION, source);

      expect(result.ledger.durable).toEqual(all);
      expect(result.stableLastSeq).toBe(total);
      expect(result.ledger.durable.at(-1)?.seq).toBe(total);
      expect(cursors).toEqual(
        total <= 500 ? [0] : total <= 1000 ? [0, 500] : [0, 500, 1000],
      );
      expect(cursors).not.toContain(total);
    },
  );

  it("uses page event seqs rather than event counts when advancing", async () => {
    const all = events(538);
    const cursors: number[] = [];
    const source = vi.fn(async (_sessionId: string, after = 0) => {
      cursors.push(after);
      if (after === 0) return page(all.slice(0, 500), 538, true);
      if (after === 500) return page(all.slice(500), 538, false);
      throw new Error("unexpected cursor");
    });

    const result = await loadCompleteHistory(SESSION, source);

    expect(cursors).toEqual([0, 500]);
    expect(result.ledger.durable).toHaveLength(538);
    expect(result.ledger.durable.at(-1)?.type).toBe("run.failed");
  });

  it.each([
    {
      name: "empty advancing page",
      pages: [page([], 2, true)],
    },
    {
      name: "recovery mismatch",
      pages: [page(events(1), 2, true, 1)],
    },
    {
      name: "stable tail changes",
      pages: [page(events(1), 2, true), page([event(2, 3)], 3, true)],
    },
    {
      name: "terminal page does not reach stable tail",
      pages: [page(events(1), 2, false)],
    },
    {
      name: "sequence gap",
      pages: [page([event(1, 3), event(3, 3)], 3, false)],
    },
    {
      name: "wrong session",
      pages: [page([{ ...event(1, 1), sessionId: OTHER_SESSION } as DurableAgentEvent], 1, false)],
    },
  ])("rejects $name without committing an incomplete candidate", async ({ pages }) => {
    let index = 0;
    const source = vi.fn(async () => pages[index++] ?? pages.at(-1)!);
    await expect(loadCompleteHistory(SESSION, source)).rejects.toMatchObject({
      code: "UI_RESPONSE_INVALID",
      recoverable: true,
    });
  });

  it("turns source failures into finite client errors without leaking the cause", async () => {
    const secret = "stage23-secret-sentinel";
    const source = vi.fn(async (): Promise<EventPageResponse> => {
      throw new Error(`${secret} /private/hidden provider reasoning`);
    });

    const error = await loadCompleteHistory(SESSION, source).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UiClientError);
    expect(error).toMatchObject({ code: "UI_NETWORK_ERROR", recoverable: true });
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(JSON.stringify(error)).not.toContain("/private/hidden");
    expect(JSON.stringify(error)).not.toContain("reasoning");
  });

  it("honours aborts before and after a page request", async () => {
    const before = new AbortController();
    before.abort();
    const never = vi.fn(async () => page(events(1), 1, false));
    await expect(loadCompleteHistory(SESSION, never, before.signal)).rejects.toMatchObject({
      code: "UI_OPERATION_ABORTED",
    });
    expect(never).not.toHaveBeenCalled();

    const after = new AbortController();
    const source = vi.fn(async () => {
      after.abort();
      return page(events(1), 1, false);
    });
    await expect(loadCompleteHistory(SESSION, source, after.signal)).rejects.toMatchObject({
      code: "UI_OPERATION_ABORTED",
    });
  });

  it("does not commit a partial or conflicting candidate over a complete visible ledger", () => {
    const visible = {
      ledger: loadLedger(events(538)),
      recovery: page([], 538, false).recovery,
      stableLastSeq: 538,
    };
    const partial = {
      ledger: loadLedger(events(500)),
      recovery: page([], 538, true).recovery,
      stableLastSeq: 538,
    };
    expect(canCommitCompleteHistory(visible.ledger, partial)).toBe(false);

    const extendedEvents = [...events(538), event(539, 539)];
    const conflicting = [...extendedEvents];
    conflicting[250] = { ...conflicting[250]!, id: uuid(999_999) } as DurableAgentEvent;
    expect(canCommitCompleteHistory(visible.ledger, {
      ledger: loadLedger(conflicting),
      recovery: page([], 539, false).recovery,
      stableLastSeq: 539,
    })).toBe(false);

    expect(canCommitCompleteHistory(visible.ledger, {
      ledger: loadLedger(extendedEvents),
      recovery: page([], 539, false).recovery,
      stableLastSeq: 539,
    })).toBe(true);
  });

  it("lets only the latest history generation commit when requests finish out of order", async () => {
    const ownership = new HistoryLoadOwnership();
    const first = ownership.begin(SESSION);
    const second = ownership.begin(SESSION);

    expect(ownership.owns(first)).toBe(false);
    expect(ownership.owns(second)).toBe(true);
    ownership.invalidate();
    expect(ownership.owns(second)).toBe(false);

    const other = ownership.begin(OTHER_SESSION);
    expect(ownership.owns(other)).toBe(true);
    expect(ownership.owns({ ...other, sessionId: SESSION })).toBe(false);
  });
});

function loadLedger(all: DurableAgentEvent[]) {
  return all.reduce(
    (ledger, current) => ({ ...ledger, durable: [...ledger.durable, current] }),
    { sessionId: SESSION, durable: [] as DurableAgentEvent[], live: [] },
  );
}
