import type { AgentEvent, DurableAgentEvent, LiveAgentEvent } from "@/lib/domain";

import { buildToolCards, type ToolCardView } from "./view-model";
import type { UsageValues } from "./event-state";

interface TranscriptBase {
  key: string;
  createdAt: string;
  runId?: string;
}

export interface TranscriptMessageItem extends TranscriptBase {
  type: "message";
  role: "user" | "assistant";
  content: string;
  kind?: "intermediate" | "final";
}

export interface TranscriptAssistantDraftItem extends TranscriptBase {
  type: "assistant_draft";
  runId: string;
  content: string;
}

export interface TranscriptRoundItem extends TranscriptBase {
  type: "round";
  runId: string;
  iteration: number;
  modelProfileId?: string;
  completedAt: string | undefined;
  finishReason?: string;
  durationMs?: number;
  usage?: UsageValues;
  usageComplete?: boolean;
}

export interface TranscriptToolItem extends TranscriptBase {
  type: "tool";
  runId: string;
  card: ToolCardView;
}

export interface TranscriptPlanItem extends TranscriptBase {
  type: "plan";
  runId: string;
  planId: string;
  approvalId: string;
  content: string;
  approved?: boolean;
  resolvedReason?: string;
}

export interface TranscriptStatusItem extends TranscriptBase {
  type: "status";
  eventType: DurableAgentEvent["type"];
  tone: "neutral" | "success" | "error" | "warning";
  event: DurableAgentEvent;
}

export type TranscriptItem =
  | TranscriptMessageItem
  | TranscriptAssistantDraftItem
  | TranscriptRoundItem
  | TranscriptToolItem
  | TranscriptPlanItem
  | TranscriptStatusItem;

function isDurable(event: AgentEvent): event is DurableAgentEvent {
  return event.durable;
}

function isLive(event: AgentEvent): event is LiveAgentEvent {
  return !event.durable;
}

function roundKey(runId: string, iteration: number): string {
  return `${runId}:${iteration}`;
}

function toneFor(event: DurableAgentEvent): TranscriptStatusItem["tone"] {
  switch (event.type) {
    case "run.completed": return "success";
    case "run.failed": return "error";
    case "model.output.rejected": return "warning";
    case "completion.evidence.rejected": return "warning";
    case "validation.repair.warning": return "warning";
    case "write.dependency.rejected": return "warning";
    case "context.compacted":
      return event.data.strategy === "deterministic_fallback"
        ? "warning"
        : "neutral";
    case "run.cancelled":
    case "run.interrupted": return "warning";
    default: return "neutral";
  }
}

function statusItem(event: DurableAgentEvent): TranscriptStatusItem {
  return {
    type: "status",
    key: event.id,
    createdAt: event.createdAt,
    ...(event.runId === undefined ? {} : { runId: event.runId }),
    eventType: event.type,
    tone: toneFor(event),
    event,
  };
}

export function buildTranscriptItems(events: readonly AgentEvent[]): TranscriptItem[] {
  const durable = events.filter(isDurable);
  const live = events.filter(isLive);
  const toolCards = buildToolCards(durable);
  const toolByCallId = new Map(toolCards.map((card) => [card.toolCallId, card]));
  const approvalToCall = new Map<string, string>();
  const toolFirstEvent = new Map<string, DurableAgentEvent>();
  const toolEventIds = new Set<string>();
  const requestedRounds = new Map<string, Extract<DurableAgentEvent, { type: "model.requested" }>>();
  const completedRounds = new Map<string, Extract<DurableAgentEvent, { type: "model.completed" }>>();
  const planResolutions = new Map<string, Extract<DurableAgentEvent, { type: "plan.approval.resolved" }>>();

  for (const event of durable) {
    if (event.type === "model.requested" && event.runId !== undefined) {
      requestedRounds.set(roundKey(event.runId, event.data.iteration), event);
    }
    if (event.type === "model.completed" && event.runId !== undefined) {
      completedRounds.set(roundKey(event.runId, event.data.iteration), event);
    }
    if (event.type === "plan.approval.resolved") {
      planResolutions.set(event.data.approvalId, event);
    }
    if (event.type === "approval.required") approvalToCall.set(event.data.approvalId, event.data.toolCallId);
    const callId = event.type === "tool.requested"
      || event.type === "approval.required"
      || event.type === "tool.started"
      || event.type === "tool.result"
      ? event.data.toolCallId
      : event.type === "approval.resolved"
        ? approvalToCall.get(event.data.approvalId)
        : undefined;
    if (callId !== undefined) {
      toolEventIds.add(event.id);
      if (!toolFirstEvent.has(callId)) toolFirstEvent.set(callId, event);
    }
  }

  const items: TranscriptItem[] = [];
  for (const event of durable) {
    if (toolEventIds.has(event.id)) {
      const first = [...toolFirstEvent.entries()].find(([, candidate]) => candidate.id === event.id);
      if (first !== undefined) {
        const [callId, firstEvent] = first;
        const card = toolByCallId.get(callId);
        if (card !== undefined && firstEvent.runId !== undefined) {
          items.push({
            type: "tool",
            key: `tool:${callId}`,
            createdAt: firstEvent.createdAt,
            runId: firstEvent.runId,
            card,
          });
        }
      }
      continue;
    }

    if (event.type === "model.requested") {
      if (event.runId === undefined) {
        items.push(statusItem(event));
        continue;
      }
      const completed = completedRounds.get(roundKey(event.runId, event.data.iteration));
      items.push({
        type: "round",
        key: `round:${event.runId}:${event.data.iteration}`,
        createdAt: event.createdAt,
        runId: event.runId,
        iteration: event.data.iteration,
        modelProfileId: event.data.modelProfileId,
        completedAt: completed?.createdAt,
        ...(completed === undefined ? {} : {
          finishReason: completed.data.finishReason,
          durationMs: Math.max(0, Date.parse(completed.createdAt) - Date.parse(event.createdAt)),
          ...(completed.data.usage === undefined ? {} : { usage: completed.data.usage }),
          ...(completed.data.usageComplete === undefined
            ? {}
            : { usageComplete: completed.data.usageComplete }),
        }),
      });
      continue;
    }
    if (event.type === "model.completed") {
      if (event.runId === undefined) {
        items.push(statusItem(event));
        continue;
      }
      if (requestedRounds.has(roundKey(event.runId, event.data.iteration))) continue;
      items.push({
        type: "round",
        key: `round:${event.runId}:${event.data.iteration}`,
        createdAt: event.createdAt,
        runId: event.runId,
        iteration: event.data.iteration,
        completedAt: event.createdAt,
        finishReason: event.data.finishReason,
        ...(event.data.usage === undefined ? {} : { usage: event.data.usage }),
        ...(event.data.usageComplete === undefined
          ? {}
          : { usageComplete: event.data.usageComplete }),
      });
      continue;
    }
    if (event.type === "plan.proposed" && event.runId !== undefined) {
      const resolution = planResolutions.get(event.data.approvalId);
      items.push({
        type: "plan",
        key: `plan:${event.data.planId}`,
        createdAt: event.createdAt,
        runId: event.runId,
        planId: event.data.planId,
        approvalId: event.data.approvalId,
        content: event.data.content,
        ...(resolution === undefined ? {} : { approved: resolution.data.approved }),
        ...(resolution?.data.reason === undefined ? {} : { resolvedReason: resolution.data.reason }),
      });
      continue;
    }
    if (event.type === "plan.approval.resolved") continue;
    if (event.type === "user.message") {
      items.push({
        type: "message",
        key: event.id,
        createdAt: event.createdAt,
        runId: event.runId,
        role: "user",
        content: event.data.content,
      });
      continue;
    }
    if (event.type === "assistant.message") {
      items.push({
        type: "message",
        key: event.id,
        createdAt: event.createdAt,
        runId: event.runId,
        role: "assistant",
        content: event.data.content,
        kind: event.data.kind,
      });
      continue;
    }
    items.push(statusItem(event));
  }

  const finalRuns = new Set(
    durable
      .filter((event) => event.type === "assistant.message" && event.data.kind === "final")
      .map((event) => event.runId),
  );
  const terminalRuns = new Set(
    durable
      .filter((event) =>
        event.type === "run.completed" || event.type === "run.failed" ||
        event.type === "run.cancelled" || event.type === "run.interrupted"
      )
      .map((event) => event.runId)
      .filter((runId): runId is string => runId !== undefined),
  );
  const rejectedIterations = new Set(
    durable
      .filter((event) =>
        event.type === "model.output.rejected" ||
        event.type === "completion.evidence.rejected" ||
        event.type === "validation.repair.warning" ||
        event.type === "write.dependency.rejected"
      )
      .map((event) => `${event.runId}:${event.data.iteration}`),
  );
  const liveByRun = new Map<string, LiveAgentEvent[]>();
  for (const event of live) {
    if (
      finalRuns.has(event.runId) || terminalRuns.has(event.runId) ||
      (event.data.iteration !== undefined &&
        rejectedIterations.has(`${event.runId}:${event.data.iteration}`))
    ) continue;
    const group = liveByRun.get(event.runId) ?? [];
    group.push(event);
    liveByRun.set(event.runId, group);
  }
  for (const [runId, group] of liveByRun) {
    const ordered = [...group].sort((left, right) => left.streamSeq - right.streamSeq);
    const first = ordered[0];
    if (first === undefined) continue;
    items.push({
      type: "assistant_draft",
      key: `draft:${runId}`,
      createdAt: first.createdAt,
      runId,
      content: ordered.map((event) => event.data.content).join(""),
    });
  }

  return items;
}
