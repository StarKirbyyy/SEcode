import { describe, expect, it, vi } from "vitest";

import { AgentEventPublisher } from "@/lib/agent/events";
import { nativeAgentRuntimeDependencies } from "@/lib/agent/dependencies";
import {
  projectAgentEvents,
} from "@/lib/agent/projection";
import type { DurableAgentEvent } from "@/lib/domain";
import type { JsonlEventStore } from "@/lib/storage";

import {
  EVENT_ID,
  RUN_ID,
  SESSION_ID,
  createDurableEvent,
  createRunStartedEvent,
  createSessionCreatedEvent,
} from "./helpers";

function createPublisher(options: {
  appendEvent?: JsonlEventStore["appendEvent"];
  sink?: (event: unknown) => void | Promise<void>;
  onSinkFailure?: () => void;
}) {
  let nextSeq = 3;
  const appendEvent = options.appendEvent ?? vi.fn(async (_sessionId, draft) => {
    const event = createDurableEvent(nextSeq, draft.type, draft.data, {
      runId: draft.runId,
    });
    nextSeq += 1;
    return event;
  });
  const eventStore = { appendEvent } as JsonlEventStore;
  const projection = projectAgentEvents([
    createSessionCreatedEvent(1),
    createRunStartedEvent(2),
  ]);
  return {
    appendEvent,
    publisher: new AgentEventPublisher({
      eventStore,
      sessionId: SESSION_ID,
      runId: RUN_ID,
      projection,
      sink: options.sink,
      dependencies: {
        ...nativeAgentRuntimeDependencies,
        randomUUID: () => EVENT_ID,
        wallClockNow: () => new Date("2026-08-27T00:00:00.000Z"),
      },
      onSinkFailure: options.onSinkFailure ?? vi.fn(),
    }),
  };
}

describe("AgentEventPublisher", () => {
  it("publishes a durable event only after the store returns it", async () => {
    const delivered: DurableAgentEvent[] = [];
    const { publisher, appendEvent } = createPublisher({
      sink: (event) => {
        delivered.push(event as DurableAgentEvent);
      },
    });

    await publisher.append({
      type: "user.message",
      runId: RUN_ID,
      data: { content: "task" },
    });

    expect(appendEvent).toHaveBeenCalledTimes(1);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ seq: 3, type: "user.message" });
  });

  it("does not publish when durable append fails", async () => {
    const sink = vi.fn();
    const { publisher } = createPublisher({
      appendEvent: vi.fn(async () => {
        throw new Error("disk failed");
      }),
      sink,
    });

    await expect(
      publisher.append({
        type: "user.message",
        runId: RUN_ID,
        data: { content: "task" },
      }),
    ).rejects.toThrow("disk failed");
    expect(sink).not.toHaveBeenCalled();
  });

  it("creates ordered live events without writing the store", async () => {
    const delivered: unknown[] = [];
    const { publisher, appendEvent } = createPublisher({
      sink: (event) => {
        delivered.push(event);
      },
    });

    expect(await publisher.publishLive("")).toBeUndefined();
    await publisher.publishLive("第一段");
    await publisher.publishLive("第二段");

    expect(appendEvent).not.toHaveBeenCalled();
    expect(delivered).toMatchObject([
      { durable: false, streamSeq: 1, data: { content: "第一段" } },
      { durable: false, streamSeq: 2, data: { content: "第二段" } },
    ]);
  });

  it("disables a failing sink and reports failure once", async () => {
    const sink = vi.fn(async () => {
      throw new Error("disconnected");
    });
    const onSinkFailure = vi.fn();
    const { publisher } = createPublisher({ sink, onSinkFailure });

    await publisher.publishLive("one");
    await publisher.publishLive("two");

    expect(sink).toHaveBeenCalledTimes(1);
    expect(onSinkFailure).toHaveBeenCalledTimes(1);
  });
});
