import {
  AgentEventSchema,
  type AgentEvent,
  type DurableAgentEvent,
  type LiveAgentEvent,
} from "@/lib/domain";

import { UiClientError } from "./api-client";

export interface EventLedger {
  readonly sessionId: string;
  readonly durable: readonly DurableAgentEvent[];
  readonly live: readonly LiveAgentEvent[];
}

export type ProjectedRunStatus =
  | "idle"
  | "running"
  | "requesting_model"
  | "restating_output"
  | "awaiting_plan_approval"
  | "awaiting_approval"
  | "executing_tool"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface RunProjection {
  runId?: string;
  status: ProjectedRunStatus;
  iteration: number;
  modelRequests: number;
  toolCalls: number;
  planningEnabled: boolean;
  phase: "normal" | "planning" | "awaiting_plan_approval" | "executing";
  maxModelRequests?: number;
  maxToolCalls?: number;
  usage?: UsageValues;
  usageBuckets?: UsageBuckets;
  providerCache?: ProviderCacheProjection;
  localContextCache?: LocalContextCacheProjection;
  contextCompaction?: ContextCompactionProjection;
  usageComplete?: boolean;
  unreportedUsageRequests?: number;
  contextCompactedThroughSeq?: number;
  contextCompactionStrategy?: "model" | "deterministic_fallback";
  contextFallbackReason?:
    | "model_timeout"
    | "model_failed"
    | "model_output_invalid"
    | "summary_input_over_budget";
  terminalType?: "run.completed" | "run.failed" | "run.cancelled" | "run.interrupted";
  pendingApprovalIds: string[];
  pendingPlan?: {
    planId: string;
    approvalId: string;
    content: string;
  };
  assistantDraft: string;
  canContinue: boolean;
  reconciliationAfter: number;
}

export const USAGE_FIELDS = [
  "promptTokens",
  "completionTokens",
  "totalTokens",
  "reasoningTokens",
  "cachedPromptTokens",
  "cacheMissPromptTokens",
] as const;
export type UsageField = (typeof USAGE_FIELDS)[number];
export type UsageValues = Partial<Record<UsageField, number>>;
export type UsageUnknownRequests = Record<UsageField, number>;
export interface UsageAggregate {
  values: UsageValues;
  unknownRequests: UsageUnknownRequests;
}
export interface UsageBuckets {
  business: UsageAggregate;
  contextSummary: UsageAggregate;
  combined: UsageAggregate;
}
export interface ProviderCacheProjection {
  status: "reported" | "partial" | "unreported" | "unsupported";
  cachedPromptTokens?: number;
  cacheMissPromptTokens?: number;
  hitRate?: number;
}
export interface LocalContextCacheProjection {
  cold: number;
  warm: number;
  invalidated: number;
  hitRate?: number;
  reusedEvents: number;
  tailEvents: number;
  avoidedBytes: number;
  buildMilliseconds: number;
}
export interface ContextCompactionProjection {
  count: number;
  model: number;
  fallback: number;
  latestThroughSeq?: number;
  latestRetainedRange?: { fromSeq: number; toSeq: number };
  latestFallbackReason?: RunProjection["contextFallbackReason"];
  incompleteUsageCount: number;
}
export interface SessionProjection {
  usage: UsageBuckets;
  providerCache: ProviderCacheProjection;
  localContextCache: LocalContextCacheProjection;
  contextCompaction: ContextCompactionProjection;
}

function emptyUnknownRequests(): UsageUnknownRequests {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cachedPromptTokens: 0,
    cacheMissPromptTokens: 0,
  };
}

function emptyUsageAggregate(): UsageAggregate {
  return { values: {}, unknownRequests: emptyUnknownRequests() };
}

function addUsageRequest(
  target: UsageAggregate,
  usage: UsageValues | undefined,
  complete: boolean | undefined,
): void {
  for (const field of USAGE_FIELDS) {
    const value = usage?.[field];
    if (value !== undefined) target.values[field] = (target.values[field] ?? 0) + value;
    if (value === undefined || complete === false) target.unknownRequests[field] += 1;
  }
}

function combineUsage(left: UsageAggregate, right: UsageAggregate): UsageAggregate {
  const combined = emptyUsageAggregate();
  for (const field of USAGE_FIELDS) {
    const leftValue = left.values[field];
    const rightValue = right.values[field];
    if (leftValue !== undefined || rightValue !== undefined) {
      combined.values[field] = (leftValue ?? 0) + (rightValue ?? 0);
    }
    combined.unknownRequests[field] =
      left.unknownRequests[field] + right.unknownRequests[field];
  }
  return combined;
}

function projectObservability(events: readonly DurableAgentEvent[]): SessionProjection {
  const business = emptyUsageAggregate();
  const contextSummary = emptyUsageAggregate();
  const pendingRequests = new Set<string>();
  const cacheStatuses: ProviderCacheProjection["status"][] = [];
  let cachedPromptTokens: number | undefined;
  let cacheMissPromptTokens: number | undefined;
  const local: LocalContextCacheProjection = {
    cold: 0, warm: 0, invalidated: 0,
    reusedEvents: 0, tailEvents: 0, avoidedBytes: 0, buildMilliseconds: 0,
  };
  const compaction: ContextCompactionProjection = {
    count: 0, model: 0, fallback: 0, incompleteUsageCount: 0,
  };
  for (const event of events) {
    if (event.runId === undefined) continue;
    const requestKey = `${event.runId}:${event.type === "model.requested" || event.type === "model.completed" ? event.data.iteration : ""}`;
    if (event.type === "model.requested") pendingRequests.add(requestKey);
    if (event.type === "model.completed") {
      pendingRequests.delete(requestKey);
      addUsageRequest(business, event.data.usage, event.data.usageComplete);
      const cached = event.data.usage?.cachedPromptTokens;
      const miss = event.data.usage?.cacheMissPromptTokens;
      if (cached !== undefined) cachedPromptTokens = (cachedPromptTokens ?? 0) + cached;
      if (miss !== undefined) cacheMissPromptTokens = (cacheMissPromptTokens ?? 0) + miss;
      cacheStatuses.push(
        cached !== undefined && miss !== undefined
          ? "reported"
          : cached !== undefined || miss !== undefined
            ? "partial"
            : "unreported",
      );
      const diagnostic = event.data.contextCache;
      if (diagnostic !== undefined) {
        local[diagnostic.status] += 1;
        local.reusedEvents += diagnostic.reusedEvents;
        local.tailEvents += diagnostic.tailEvents;
        local.avoidedBytes += diagnostic.avoidedBytes;
        local.buildMilliseconds += diagnostic.buildMilliseconds;
      }
    }
    if (event.type === "context.compacted") {
      compaction.count += 1;
      if ((event.data.strategy ?? "model") === "model") compaction.model += 1;
      else compaction.fallback += 1;
      compaction.latestThroughSeq = event.data.throughSeq;
      compaction.latestRetainedRange = { ...event.data.retainedRange };
      if (event.data.fallbackReason !== undefined) {
        compaction.latestFallbackReason = event.data.fallbackReason;
      }
      const incomplete = event.data.usageComplete === false ||
        ((event.data.strategy ?? "model") === "model" && event.data.usage === undefined);
      if (incomplete) compaction.incompleteUsageCount += 1;
      addUsageRequest(contextSummary, event.data.usage, incomplete ? false : event.data.usageComplete);
      const cached = event.data.usage?.cachedPromptTokens;
      const miss = event.data.usage?.cacheMissPromptTokens;
      if (cached !== undefined) cachedPromptTokens = (cachedPromptTokens ?? 0) + cached;
      if (miss !== undefined) cacheMissPromptTokens = (cacheMissPromptTokens ?? 0) + miss;
      cacheStatuses.push(
        cached !== undefined && miss !== undefined
          ? "reported"
          : cached !== undefined || miss !== undefined
            ? "partial"
            : "unreported",
      );
    }
  }
  for (let index = 0; index < pendingRequests.size; index += 1) {
    addUsageRequest(business, undefined, false);
  }
  const combined = combineUsage(business, contextSummary);
  const providerStatus: ProviderCacheProjection["status"] = cacheStatuses.length === 0 ||
      cacheStatuses.every((status) => status === "unreported")
    ? "unreported"
    : cacheStatuses.every((status) => status === "reported")
      ? "reported"
      : "partial";
  const denominator = (cachedPromptTokens ?? 0) + (cacheMissPromptTokens ?? 0);
  const localTotal = local.cold + local.warm + local.invalidated;
  return {
    usage: { business, contextSummary, combined },
    providerCache: {
      status: providerStatus,
      ...(cachedPromptTokens === undefined ? {} : { cachedPromptTokens }),
      ...(cacheMissPromptTokens === undefined ? {} : { cacheMissPromptTokens }),
      ...(providerStatus === "reported" && denominator > 0
        ? { hitRate: (cachedPromptTokens ?? 0) / denominator }
        : {}),
    },
    localContextCache: {
      ...local,
      ...(localTotal === 0 ? {} : { hitRate: local.warm / localTotal }),
    },
    contextCompaction: compaction,
  };
}

export function projectSession(state: EventLedger): SessionProjection {
  return projectObservability(state.durable);
}

function protocolError(message: string): UiClientError {
  return new UiClientError("UI_STREAM_INVALID", message, true);
}

export function createEventLedger(sessionId: string): EventLedger {
  return { sessionId, durable: [], live: [] };
}

export function mergeAgentEvent(state: EventLedger, input: AgentEvent): EventLedger {
  const parsed = AgentEventSchema.safeParse(input);
  if (!parsed.success) throw protocolError("事件格式无效");
  const event = parsed.data;
  if (event.sessionId !== state.sessionId) throw protocolError("事件会话不匹配");

  if (event.durable) {
    const sameSequence = state.durable.find((candidate) => candidate.seq === event.seq);
    if (sameSequence !== undefined) {
      if (
        sameSequence.id === event.id &&
        JSON.stringify(sameSequence) === JSON.stringify(event)
      ) return state;
      throw protocolError("事件序号发生冲突");
    }
    if (state.durable.some((candidate) => candidate.id === event.id)) {
      throw protocolError("事件标识发生冲突");
    }
    const lastSequence = state.durable.at(-1)?.seq ?? 0;
    if (event.seq <= lastSequence) throw protocolError("事件序号发生倒退");
    const terminal = event.type === "run.completed" || event.type === "run.failed" ||
      event.type === "run.cancelled" || event.type === "run.interrupted";
    const clearsAll = event.type === "assistant.message" || event.type === "plan.proposed" || terminal;
    const rejectedIteration = event.type === "model.output.rejected" ||
      event.type === "completion.evidence.rejected" ||
      event.type === "write.dependency.rejected"
      ? event.data.iteration
      : undefined;
    const live = clearsAll
      ? state.live.filter((candidate) => candidate.runId !== event.runId)
      : rejectedIteration === undefined
        ? state.live
        : state.live.filter((candidate) =>
            candidate.runId !== event.runId ||
            (candidate.data.iteration !== undefined && candidate.data.iteration !== rejectedIteration)
          );
    return { ...state, durable: [...state.durable, event], live };
  }

  const sameSequence = state.live.find(
    (candidate) =>
      candidate.runId === event.runId && candidate.streamSeq === event.streamSeq,
  );
  if (sameSequence !== undefined) {
    if (
      sameSequence.id === event.id &&
      JSON.stringify(sameSequence) === JSON.stringify(event)
    ) return state;
    throw protocolError("实时事件序号发生冲突");
  }
  if (state.live.some((candidate) => candidate.id === event.id)) {
    throw protocolError("实时事件标识发生冲突");
  }
  const lastSequence = state.live
    .filter((candidate) => candidate.runId === event.runId)
    .at(-1)?.streamSeq ?? 0;
  if (event.streamSeq <= lastSequence) throw protocolError("实时事件序号发生倒退");
  return { ...state, live: [...state.live, event] };
}

export function mergeAgentEvents(
  initial: EventLedger,
  events: readonly AgentEvent[],
): EventLedger {
  return events.reduce(mergeAgentEvent, initial);
}

export function projectRun(state: EventLedger, requestedRunId?: string): RunProjection {
  const runId = requestedRunId ?? [...state.durable].reverse().find((event) => event.runId !== undefined)?.runId;
  const events = runId === undefined
    ? []
    : state.durable.filter((event) => event.runId === runId);
  let status: ProjectedRunStatus = "idle";
  let iteration = 0;
  const modelRequestNumbers = new Set<number>();
  const modelCompletedNumbers = new Set<number>();
  const toolCallIds = new Set<string>();
  let planningEnabled = false;
  let phase: RunProjection["phase"] = "normal";
  let maxModelRequests: number | undefined;
  let maxToolCalls: number | undefined;
  let usage: RunProjection["usage"];
  let usageIncomplete = false;
  let unreportedUsageRequests = 0;
  let contextCompactedThroughSeq: number | undefined;
  let contextCompactionStrategy: RunProjection["contextCompactionStrategy"];
  let contextFallbackReason: RunProjection["contextFallbackReason"];
  let terminalType: RunProjection["terminalType"];
  const required = new Map<string, string>();
  const resolved = new Set<string>();
  let pendingPlan: RunProjection["pendingPlan"];
  const observability = projectObservability(events);

  for (const event of events) {
    switch (event.type) {
      case "run.started":
        status = "running";
        planningEnabled = event.data.planningEnabled ?? false;
        phase = planningEnabled ? "planning" : "normal";
        maxModelRequests = event.data.limits.maxIterations;
        maxToolCalls = event.data.limits.maxToolCalls;
        break;
      case "model.requested":
        status = "requesting_model";
        iteration = event.data.iteration;
        modelRequestNumbers.add(event.data.iteration);
        break;
      case "model.completed": {
        status = "running";
        iteration = event.data.iteration;
        modelCompletedNumbers.add(event.data.iteration);
        if (event.data.usage !== undefined) {
          usage = {
            ...(usage?.promptTokens === undefined && event.data.usage.promptTokens === undefined ? {} : {
              promptTokens: (usage?.promptTokens ?? 0) + (event.data.usage.promptTokens ?? 0),
            }),
            ...(usage?.completionTokens === undefined && event.data.usage.completionTokens === undefined ? {} : {
              completionTokens: (usage?.completionTokens ?? 0) + (event.data.usage.completionTokens ?? 0),
            }),
            ...(usage?.totalTokens === undefined && event.data.usage.totalTokens === undefined ? {} : {
              totalTokens: (usage?.totalTokens ?? 0) + (event.data.usage.totalTokens ?? 0),
            }),
          };
          if (
            event.data.usage.promptTokens === undefined
            || event.data.usage.completionTokens === undefined
            || event.data.usage.totalTokens === undefined
          ) usageIncomplete = true;
        }
        if (event.data.usage === undefined || event.data.usageComplete === false) {
          usageIncomplete = true;
          unreportedUsageRequests += 1;
        }
        break;
      }
      case "model.output.rejected":
        status = event.data.action === "retry" ? "restating_output" : "running";
        break;
      case "completion.evidence.rejected":
        status = "restating_output";
        break;
      case "validation.repair.warning":
        status = "running";
        break;
      case "write.dependency.rejected":
        status = "restating_output";
        break;
      case "plan.proposed":
        phase = "awaiting_plan_approval";
        status = "awaiting_plan_approval";
        pendingPlan = {
          planId: event.data.planId,
          approvalId: event.data.approvalId,
          content: event.data.content,
        };
        break;
      case "plan.approval.resolved":
        if (pendingPlan?.approvalId === event.data.approvalId) pendingPlan = undefined;
        if (event.data.approved) {
          phase = "executing";
          status = "running";
        }
        break;
      case "tool.requested": toolCallIds.add(event.data.toolCallId); break;
      case "approval.required": required.set(event.data.approvalId, event.data.toolCallId); break;
      case "approval.resolved": resolved.add(event.data.approvalId); status = "running"; break;
      case "tool.started": status = "executing_tool"; break;
      case "tool.result": status = "running"; break;
      case "context.compacted":
        contextCompactedThroughSeq = event.data.throughSeq;
        contextCompactionStrategy = event.data.strategy;
        contextFallbackReason = event.data.fallbackReason;
        if (event.data.usage !== undefined) {
          usage = {
            ...(usage?.promptTokens === undefined && event.data.usage.promptTokens === undefined ? {} : {
              promptTokens: (usage?.promptTokens ?? 0) + (event.data.usage.promptTokens ?? 0),
            }),
            ...(usage?.completionTokens === undefined && event.data.usage.completionTokens === undefined ? {} : {
              completionTokens: (usage?.completionTokens ?? 0) + (event.data.usage.completionTokens ?? 0),
            }),
            ...(usage?.totalTokens === undefined && event.data.usage.totalTokens === undefined ? {} : {
              totalTokens: (usage?.totalTokens ?? 0) + (event.data.usage.totalTokens ?? 0),
            }),
          };
          if (
            event.data.usage.promptTokens === undefined
            || event.data.usage.completionTokens === undefined
            || event.data.usage.totalTokens === undefined
          ) usageIncomplete = true;
        }
        const compactionUsageIncomplete = event.data.usageComplete === false
          || (event.data.strategy === "model" && event.data.usage === undefined);
        if (compactionUsageIncomplete) usageIncomplete = true;
        if (compactionUsageIncomplete) unreportedUsageRequests += 1;
        break;
      case "run.completed": status = "completed"; terminalType = event.type; break;
      case "run.failed": status = "failed"; terminalType = event.type; break;
      case "run.cancelled": status = "cancelled"; terminalType = event.type; break;
      case "run.interrupted": status = "interrupted"; terminalType = event.type; break;
      default: break;
    }
  }
  const pendingApprovalIds = [...required.keys()].filter((approvalId) => !resolved.has(approvalId));
  for (const requested of modelRequestNumbers) {
    if (!modelCompletedNumbers.has(requested)) {
      usageIncomplete = true;
      unreportedUsageRequests += 1;
    }
  }
  if (terminalType === undefined && pendingPlan !== undefined) status = "awaiting_plan_approval";
  else if (terminalType === undefined && pendingApprovalIds.length > 0) status = "awaiting_approval";
  const assistantDraft = runId === undefined || terminalType !== undefined
    ? ""
    : state.live
      .filter((event) => event.runId === runId && event.type === "assistant.delta")
      .sort((left, right) => left.streamSeq - right.streamSeq)
      .map((event) => event.data.content)
      .join("");
  const aggregateUsage = Object.keys(observability.usage.combined.values).length === 0
    ? undefined
    : observability.usage.combined.values;
  const aggregateUnknown = observability.usage.combined.unknownRequests.totalTokens;

  return {
    runId,
    status,
    iteration,
    modelRequests: modelRequestNumbers.size,
    toolCalls: toolCallIds.size,
    planningEnabled,
    phase,
    ...(maxModelRequests === undefined ? {} : { maxModelRequests }),
    ...(maxToolCalls === undefined ? {} : { maxToolCalls }),
    ...(aggregateUsage === undefined ? {} : { usage: aggregateUsage }),
    usageBuckets: observability.usage,
    providerCache: observability.providerCache,
    localContextCache: observability.localContextCache,
    contextCompaction: observability.contextCompaction,
    ...(usageIncomplete || unreportedUsageRequests > 0 || aggregateUnknown > 0
      ? {
          usageComplete: false,
          unreportedUsageRequests: Math.max(unreportedUsageRequests, aggregateUnknown),
        }
      : aggregateUsage === undefined ? {} : { usageComplete: true }),
    ...(contextCompactedThroughSeq === undefined ? {} : { contextCompactedThroughSeq }),
    ...(contextCompactionStrategy === undefined ? {} : { contextCompactionStrategy }),
    ...(contextFallbackReason === undefined ? {} : { contextFallbackReason }),
    ...(terminalType === undefined ? {} : { terminalType }),
    pendingApprovalIds,
    ...(pendingPlan === undefined ? {} : { pendingPlan }),
    assistantDraft,
    canContinue: status === "failed" || status === "cancelled" || status === "interrupted",
    reconciliationAfter: state.durable.at(-1)?.seq ?? 0,
  };
}
