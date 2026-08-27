import { describe, expect, it } from "vitest";

import { accumulateChatCompletion } from "@/lib/model/chat-accumulator";
import { buildChatRequest } from "@/lib/model/chat-mapper";
import type { SseStreamEvent } from "@/lib/model/sse";
import type {
  ModelRequest,
  ServerModelProfileDefinition,
} from "@/lib/model/types";

const toolCallId = "11111111-1111-4111-8111-111111111111";

function definition(
  adapter: ServerModelProfileDefinition["adapter"] = "deepseek",
): ServerModelProfileDefinition {
  return {
    adapter,
    endpoint: `https://${adapter}.example/v1/chat/completions`,
    apiKeyEnv: `${adapter.toUpperCase()}_API_KEY`,
    requiresApiKey: adapter === "deepseek",
    profile: {
      id: adapter,
      label: adapter,
      provider: adapter,
      baseUrl: `https://${adapter}.example/v1`,
      model: `${adapter}-model`,
      contextWindow: 64_000,
      supportsThinking: adapter === "deepseek",
      configured: true,
    },
  };
}

function request(
  overrides: Partial<ModelRequest> = {},
): ModelRequest {
  return {
    profileId: "deepseek",
    signal: new AbortController().signal,
    messages: [{ role: "user", content: "inspect" }],
    tools: [],
    ...overrides,
  };
}

async function* events(
  chunks: unknown[],
): AsyncGenerator<SseStreamEvent> {
  for (const chunk of chunks) {
    yield { type: "data", data: JSON.stringify(chunk) };
  }
  yield { type: "done" };
}

describe("chat request mapper", () => {
  it("maps all message roles and tool definitions without credentials", () => {
    const plan = buildChatRequest(
      request({
        messages: [
          { role: "system", content: "system" },
          { role: "user", content: "user" },
          { role: "assistant", content: "answer" },
          {
            role: "assistant",
            content: null,
            toolCalls: [
              { id: toolCallId, name: "read_file", arguments: { path: "a.ts" } },
            ],
          },
          {
            role: "tool",
            toolCallId,
            name: "read_file",
            content: "file contents",
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "read_file",
              description: "Read one file",
              parameters: {
                type: "object",
                properties: { path: { type: "string" } },
              },
            },
          },
        ],
      }),
      definition(),
    );

    expect(plan.body).toEqual({
      model: "deepseek-model",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
        { role: "assistant", content: "answer" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: "read_file",
                arguments: '{"path":"a.ts"}',
              },
            },
          ],
        },
        { role: "tool", content: "file contents", tool_call_id: toolCallId },
      ],
      stream: true,
      stream_options: { include_usage: true },
      tools: [
        {
          type: "function",
          function: {
            name: "read_file",
            description: "Read one file",
            parameters: {
              type: "object",
              properties: { path: { type: "string" } },
            },
          },
        },
      ],
      thinking: { type: "disabled" },
    });
    expect(JSON.stringify(plan.body)).not.toMatch(/api[_-]?key|authorization/i);
  });

  it("maps explicitly enabled DeepSeek thinking and rejects it elsewhere", () => {
    const enabled = buildChatRequest(
      request({ thinking: { enabled: true, effort: "high" } }),
      definition(),
    );
    expect(enabled.body).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    });

    expect(() =>
      buildChatRequest(
        request({
          profileId: "longcat",
          thinking: { enabled: true },
        }),
        definition("longcat"),
      ),
    ).toThrow(/仅支持.*DeepSeek thinking/);
  });

  it("keeps provider IDs, object arguments and reasoning only in continuation", async () => {
    const longcat = definition("longcat");
    const initial = buildChatRequest(
      request({ profileId: "longcat" }),
      longcat,
    );
    const completion = await accumulateChatCompletion(
      events([
        {
          id: "completion-private",
          choices: [
            {
              index: 0,
              delta: {
                reasoning_content: "PRIVATE_REASONING_SENTINEL",
                tool_calls: [
                  {
                    index: 0,
                    id: "provider-call-private",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: { path: "source.ts" },
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        },
      ]),
      { definition: longcat, continuationState: initial.continuationState },
    );
    const call = completion.toolCalls[0];
    expect(call?.ok).toBe(true);
    if (!call?.ok) throw new Error("expected valid tool call");

    expect(JSON.stringify(completion)).not.toContain("PRIVATE_REASONING_SENTINEL");
    expect(JSON.stringify(completion.continuation)).toBe("{}");
    expect(JSON.stringify(completion.continuation)).not.toContain(
      "provider-call-private",
    );

    const next = buildChatRequest(
      request({
        profileId: "longcat",
        continuation: completion.continuation,
        messages: [
          { role: "user", content: "inspect" },
          {
            role: "assistant",
            content: null,
            toolCalls: [call.call],
          },
          {
            role: "tool",
            toolCallId: call.call.id,
            name: call.call.name,
            content: "ok",
          },
        ],
      }),
      longcat,
    );
    expect(next.body.messages).toEqual([
      { role: "user", content: "inspect" },
      {
        role: "assistant",
        content: null,
        reasoning_content: "PRIVATE_REASONING_SENTINEL",
        tool_calls: [
          {
            id: "provider-call-private",
            type: "function",
            function: {
              name: "read_file",
              arguments: { path: "source.ts" },
            },
          },
        ],
      },
      {
        role: "tool",
        content: "ok",
        tool_call_id: "provider-call-private",
        name: "read_file",
      },
    ]);
    expect(() =>
      buildChatRequest(
        request({ continuation: completion.continuation }),
        definition(),
      ),
    ).toThrow(/不能跨配置/);

    expect(() =>
      buildChatRequest(
        request({
          profileId: "longcat",
          continuation: completion.continuation,
          messages: [
            {
              role: "assistant",
              content: null,
              toolCalls: [
                call.call,
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  name: "read_file",
                  arguments: { path: "untracked.ts" },
                },
              ],
            },
          ],
        }),
        longcat,
      ),
    ).toThrow(/continuation 不一致/);
  });
});
