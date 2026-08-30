import {
  ChatMessageSchema,
  JsonObjectSchema,
  ToolDefinitionSchema,
  type JsonObject,
  type ToolCallId,
} from "@/lib/domain";

import {
  createModelError,
  type ModelContinuation,
  type ModelRequest,
  type ServerModelProfileDefinition,
} from "./types";

export interface ProviderToolCallState {
  internalId: ToolCallId;
  providerId: string;
  name: string;
  wireArguments: string | JsonObject;
}

export interface ProviderAssistantTurn {
  content: string | null;
  reasoningContent?: string;
  toolCalls: ProviderToolCallState[];
}

export interface InternalContinuationState {
  profileId: string;
  turns: ProviderAssistantTurn[];
  toolCalls: Map<ToolCallId, ProviderToolCallState>;
  turnByToolCallId: Map<ToolCallId, ProviderAssistantTurn>;
}

export interface ChatRequestPlan {
  body: JsonObject;
  continuationState: InternalContinuationState;
}

const continuationStates = new WeakMap<
  ModelContinuation,
  InternalContinuationState
>();

function emptyState(profileId: string): InternalContinuationState {
  return {
    profileId,
    turns: [],
    toolCalls: new Map(),
    turnByToolCallId: new Map(),
  };
}

export function cloneContinuationState(
  state: InternalContinuationState,
): InternalContinuationState {
  const turns = state.turns.map((turn) => ({
    ...turn,
    toolCalls: turn.toolCalls.map((call) => ({ ...call })),
  }));
  const toolCalls = new Map<ToolCallId, ProviderToolCallState>();
  const turnByToolCallId = new Map<ToolCallId, ProviderAssistantTurn>();
  for (const turn of turns) {
    for (const call of turn.toolCalls) {
      toolCalls.set(call.internalId, call);
      turnByToolCallId.set(call.internalId, turn);
    }
  }
  return { profileId: state.profileId, turns, toolCalls, turnByToolCallId };
}

export function getContinuationState(
  continuation: ModelContinuation | undefined,
  profileId: string,
): InternalContinuationState {
  if (!continuation) {
    return emptyState(profileId);
  }
  const state = continuationStates.get(continuation);
  if (!state) {
    throw createModelError(
      "MODEL_CONFIG_INVALID",
      "模型 continuation 无效或已失效",
      false,
      { profileId },
    );
  }
  if (state.profileId !== profileId) {
    throw createModelError(
      "MODEL_CONFIG_INVALID",
      "模型 continuation 不能跨配置使用",
      false,
      { profileId },
    );
  }
  return cloneContinuationState(state);
}

export function createContinuationToken(
  state: InternalContinuationState,
): ModelContinuation {
  const token = Object.freeze({}) as ModelContinuation;
  continuationStates.set(token, cloneContinuationState(state));
  return token;
}

export function suppressContinuationContent(
  continuation: ModelContinuation,
): ModelContinuation {
  const state = continuationStates.get(continuation);
  if (state === undefined || state.turns.length === 0) return continuation;
  const sanitized = cloneContinuationState(state);
  const lastTurn = sanitized.turns.at(-1);
  if (lastTurn !== undefined) lastTurn.content = null;
  return createContinuationToken(sanitized);
}

function wireToolCall(call: ProviderToolCallState): JsonObject {
  return {
    id: call.providerId,
    type: "function",
    function: {
      name: call.name,
      arguments: call.wireArguments,
    },
  };
}

function wireStoredTurn(turn: ProviderAssistantTurn): JsonObject {
  return {
    role: "assistant",
    content: turn.content,
    ...(turn.reasoningContent === undefined
      ? {}
      : { reasoning_content: turn.reasoningContent }),
    tool_calls: turn.toolCalls.map(wireToolCall),
  };
}

export function buildChatRequest(
  request: ModelRequest,
  definition: ServerModelProfileDefinition,
): ChatRequestPlan {
  const messages = ChatMessageSchema.array().parse(request.messages);
  const tools = ToolDefinitionSchema.array().parse(request.tools);
  const state = getContinuationState(
    request.continuation,
    definition.profile.id,
  );
  const wireMessages: JsonObject[] = [];
  const renderedTurns = new Set<ProviderAssistantTurn>();

  for (const message of messages) {
    if (message.role === "system" || message.role === "user") {
      wireMessages.push({ role: message.role, content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      if (!message.toolCalls) {
        wireMessages.push({ role: "assistant", content: message.content });
        continue;
      }

      const storedTurns = message.toolCalls.map((call) =>
        state.turnByToolCallId.get(call.id),
      );
      const storedTurn = storedTurns.find((turn) => turn !== undefined);
      if (storedTurn) {
        if (
          storedTurns.some(
            (candidate) => candidate === undefined || candidate !== storedTurn,
          )
        ) {
          throw createModelError(
            "MODEL_CONFIG_INVALID",
            "assistant 工具调用与 continuation 不一致",
            false,
            { profileId: definition.profile.id },
          );
        }
        if (!renderedTurns.has(storedTurn)) {
          wireMessages.push(wireStoredTurn(storedTurn));
          renderedTurns.add(storedTurn);
        }
        continue;
      }

      wireMessages.push({
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((call) =>
          wireToolCall({
            internalId: call.id,
            providerId: call.id,
            name: call.name,
            wireArguments: JSON.stringify(call.arguments),
          }),
        ),
      });
      continue;
    }

    if (message.role === "tool") {
      const storedCall = state.toolCalls.get(message.toolCallId);
      const storedTurn = state.turnByToolCallId.get(message.toolCallId);
      if (storedTurn && !renderedTurns.has(storedTurn)) {
        wireMessages.push(wireStoredTurn(storedTurn));
        renderedTurns.add(storedTurn);
      }
      const providerId = storedCall?.providerId ?? message.toolCallId;
      wireMessages.push({
        role: "tool",
        content: message.content,
        tool_call_id: providerId,
        ...(definition.adapter === "longcat" ? { name: message.name } : {}),
      });
    }
  }

  const thinking = request.thinking ?? { enabled: false };
  if (thinking.enabled && definition.adapter !== "deepseek") {
    throw createModelError(
      "MODEL_CONFIG_INVALID",
      "首版仅支持显式启用 DeepSeek thinking",
      false,
      { profileId: definition.profile.id },
    );
  }
  if (thinking.enabled && !definition.profile.supportsThinking) {
    throw createModelError(
      "MODEL_CONFIG_INVALID",
      "当前模型配置不支持 thinking",
      false,
      { profileId: definition.profile.id },
    );
  }

  const body: JsonObject = {
    model: definition.profile.model,
    messages: wireMessages,
    stream: true,
    stream_options: { include_usage: true },
    ...(tools.length === 0 ? {} : { tools }),
  };
  if (definition.adapter === "deepseek") {
    body.thinking = { type: thinking.enabled ? "enabled" : "disabled" };
    if (thinking.enabled && thinking.effort !== undefined) {
      body.reasoning_effort = thinking.effort;
    }
  }

  return {
    body: JsonObjectSchema.parse(body),
    continuationState: state,
  };
}
