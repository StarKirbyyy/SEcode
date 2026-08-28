import {
  LiveAgentEventSchema,
  UuidSchema,
  redactSecrets,
  type AgentEvent,
  type LiveAgentEvent,
  type RunId,
  type SessionId,
} from "@/lib/domain";
import type {
  DurableEventDraft,
  JsonlEventStore,
} from "@/lib/storage";

import type { AgentRuntimeDependencies } from "./dependencies";
import {
  projectAgentEvent,
  type AgentProjectionState,
} from "./projection";
import type { AgentEventSink } from "./types";

interface AgentEventPublisherOptions {
  eventStore: JsonlEventStore;
  sessionId: SessionId;
  runId: RunId;
  projection: AgentProjectionState;
  sink?: AgentEventSink;
  dependencies: AgentRuntimeDependencies;
  onSinkFailure: () => void;
}

export class AgentEventPublisher {
  private readonly eventStore: JsonlEventStore;
  private readonly sessionId: SessionId;
  private readonly runId: RunId;
  private readonly projection: AgentProjectionState;
  private readonly dependencies: AgentRuntimeDependencies;
  private readonly onSinkFailure: () => void;
  private sink?: AgentEventSink;
  private streamSeq = 0;
  private sinkFailed = false;

  constructor(options: AgentEventPublisherOptions) {
    this.eventStore = options.eventStore;
    this.sessionId = options.sessionId;
    this.runId = options.runId;
    this.projection = options.projection;
    this.sink = options.sink;
    this.dependencies = options.dependencies;
    this.onSinkFailure = options.onSinkFailure;
  }

  async append(draft: DurableEventDraft) {
    const event = await this.eventStore.appendEvent(this.sessionId, draft);
    projectAgentEvent(this.projection, event);
    await this.deliver(event);
    return event;
  }

  async publishLive(content: string): Promise<LiveAgentEvent | undefined> {
    if (content.length === 0) return undefined;
    const sanitized = redactSecrets(content);
    if (sanitized.length === 0) return undefined;
    const event = LiveAgentEventSchema.parse({
      protocolVersion: 1,
      durable: false,
      id: UuidSchema.parse(this.dependencies.randomUUID()),
      streamSeq: this.streamSeq + 1,
      sessionId: this.sessionId,
      runId: this.runId,
      type: "assistant.delta",
      createdAt: this.dependencies.wallClockNow().toISOString(),
      data: { content: sanitized },
    });
    this.streamSeq = event.streamSeq;
    await this.deliver(event);
    return event;
  }

  disableSink(): void {
    this.sink = undefined;
  }

  private async deliver(event: AgentEvent): Promise<void> {
    const sink = this.sink;
    if (sink === undefined || this.sinkFailed) return;
    try {
      await sink(event);
    } catch {
      this.sinkFailed = true;
      this.sink = undefined;
      this.onSinkFailure();
    }
  }
}
