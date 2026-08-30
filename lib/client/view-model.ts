import type { AgentEvent, DurableAgentEvent, JsonObject, ToolResult } from "@/lib/domain";

export type ToolCardStatus =
  | "requested"
  | "approval_required"
  | "rejected"
  | "running"
  | "succeeded"
  | "failed";

export interface ToolApprovalView {
  approvalId: string;
  reason: string;
  toolSummary: string;
  approved?: boolean;
  resolvedReason?: string;
}

export interface ToolCardView {
  toolCallId: string;
  toolName: string;
  publicArguments?: JsonObject;
  argumentsTruncated: boolean;
  status: ToolCardStatus;
  approval?: ToolApprovalView;
  result?: ToolResult;
  durationMs?: number;
  incomplete: boolean;
  events: DurableAgentEvent[];
}

function toolCallId(event: DurableAgentEvent): string | undefined {
  switch (event.type) {
    case "tool.requested":
    case "approval.required":
    case "tool.started":
    case "tool.result":
      return event.data.toolCallId;
    default:
      return undefined;
  }
}

export function buildToolCards(events: readonly AgentEvent[]): ToolCardView[] {
  const durable = events.filter((event): event is DurableAgentEvent => event.durable);
  const groups = new Map<string, DurableAgentEvent[]>();
  const approvalToCall = new Map<string, string>();
  for (const event of durable) {
    if (event.type === "approval.required") {
      approvalToCall.set(event.data.approvalId, event.data.toolCallId);
    }
    const callId = toolCallId(event) ?? (
      event.type === "approval.resolved"
        ? approvalToCall.get(event.data.approvalId)
        : undefined
    );
    if (callId === undefined) continue;
    const group = groups.get(callId) ?? [];
    group.push(event);
    groups.set(callId, group);
  }

  return [...groups.entries()].map(([callId, group]) => {
    const requested = group.find((event) => event.type === "tool.requested");
    const required = group.find((event) => event.type === "approval.required");
    const resolved = group.find((event) => event.type === "approval.resolved");
    const started = group.find((event) => event.type === "tool.started");
    const result = group.find((event) => event.type === "tool.result");
    const requestedData = requested?.type === "tool.requested" ? requested.data : undefined;
    const requiredData = required?.type === "approval.required" ? required.data : undefined;
    const resolvedData = resolved?.type === "approval.resolved" ? resolved.data : undefined;
    const startedData = started?.type === "tool.started" ? started.data : undefined;
    const resultData = result?.type === "tool.result" ? result.data : undefined;
    const toolName = requestedData?.toolName ?? startedData?.toolName ?? resultData?.toolName ?? "unknown_tool";
    let status: ToolCardStatus = "requested";
    if (requiredData !== undefined) status = "approval_required";
    if (resolvedData?.approved === false) status = "rejected";
    if (startedData !== undefined) status = "running";
    if (resultData !== undefined) status = resultData.result.ok ? "succeeded" : "failed";
    if (resolvedData?.approved === false) status = "rejected";
    const durationMs = started !== undefined && result !== undefined
      ? Math.max(0, Date.parse(result.createdAt) - Date.parse(started.createdAt))
      : undefined;
    const approval = requiredData === undefined ? undefined : {
      approvalId: requiredData.approvalId,
      reason: requiredData.reason,
      toolSummary: requiredData.toolSummary,
      ...(resolvedData === undefined ? {} : { approved: resolvedData.approved }),
      ...(resolvedData?.reason === undefined ? {} : { resolvedReason: resolvedData.reason }),
    };
    return {
      toolCallId: callId,
      toolName,
      ...(requestedData === undefined ? {} : { publicArguments: requestedData.publicArguments }),
      argumentsTruncated: requestedData?.argumentsTruncated ?? false,
      status,
      ...(approval === undefined ? {} : { approval }),
      ...(resultData === undefined ? {} : { result: resultData.result }),
      ...(durationMs === undefined ? {} : { durationMs }),
      incomplete: status === "requested" || status === "approval_required" || status === "running",
      events: group,
    };
  });
}

export function pendingApprovalCards(events: readonly AgentEvent[]): Array<ToolCardView & { approval: ToolApprovalView }> {
  return buildToolCards(events).filter(
    (card): card is ToolCardView & { approval: ToolApprovalView } =>
      card.status === "approval_required" && card.approval !== undefined,
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export interface ReplaceComparison {
  path?: string;
  before?: string;
  after?: string;
  beforeBytes?: number;
  afterBytes?: number;
}

export function formatReplaceComparison(arguments_: JsonObject): ReplaceComparison {
  const path = stringValue(arguments_.path);
  const before = stringValue(arguments_.oldTextPreview);
  const after = stringValue(arguments_.newTextPreview);
  const beforeBytes = numberValue(arguments_.oldTextBytes);
  const afterBytes = numberValue(arguments_.newTextBytes);
  return {
    ...(path === undefined ? {} : { path }),
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
    ...(beforeBytes === undefined ? {} : { beforeBytes }),
    ...(afterBytes === undefined ? {} : { afterBytes }),
  };
}

export interface ProcessDetails {
  argv: string[];
  cwd?: string;
  timeoutMs?: number;
  output?: string;
  exitCode?: number;
  truncated?: boolean;
  error?: ToolResult["error"];
}

export function formatProcessDetails(
  arguments_: JsonObject,
  result: ToolResult,
): ProcessDetails {
  const program = stringValue(arguments_.program);
  const args = Array.isArray(arguments_.args)
    ? arguments_.args.filter((value): value is string => typeof value === "string")
    : [];
  const cwd = stringValue(arguments_.cwd);
  const timeoutMs = numberValue(arguments_.timeoutMs);
  const exitCode = numberValue(result.metadata?.exitCode);
  const truncated = booleanValue(result.metadata?.truncated);
  return {
    argv: program === undefined ? args : [program, ...args],
    ...(cwd === undefined ? {} : { cwd }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(result.output === undefined ? {} : { output: result.output }),
    ...(exitCode === undefined ? {} : { exitCode }),
    ...(truncated === undefined ? {} : { truncated }),
    ...(result.error === undefined ? {} : { error: result.error }),
  };
}
