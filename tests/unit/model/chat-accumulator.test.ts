import { describe, expect, it } from "vitest";

import { accumulateChatCompletion } from "@/lib/model/chat-accumulator";
import { buildChatRequest } from "@/lib/model/chat-mapper";
import type { SseStreamEvent } from "@/lib/model/sse";
import {
  MAX_TOOL_ARGUMENT_BYTES,
  MAX_MODEL_CONTENT_BYTES,
  MAX_MODEL_REASONING_BYTES,
  ModelLayerError,
  type ServerModelProfileDefinition,
} from "@/lib/model/types";

function definition(
  adapter: ServerModelProfileDefinition["adapter"] = "deepseek",
): ServerModelProfileDefinition {
  return {
    adapter,
    endpoint: `https://${adapter}.example/chat/completions`,
    apiKeyEnv: "TEST_API_KEY",
    requiresApiKey: false,
    profile: {
      id: adapter,
      label: adapter,
      provider: adapter,
      baseUrl: `https://${adapter}.example`,
      model: "test-model",
      contextWindow: 64_000,
      supportsThinking: adapter === "deepseek",
      configured: true,
    },
  };
}

function stateFor(definitionValue = definition()) {
  return buildChatRequest(
    {
      profileId: definitionValue.profile.id,
      signal: new AbortController().signal,
      messages: [{ role: "user", content: "task" }],
      tools: [],
    },
    definitionValue,
  ).continuationState;
}

async function* events(
  chunks: unknown[],
  done = true,
): AsyncGenerator<SseStreamEvent> {
  for (const chunk of chunks) {
    yield { type: "data", data: JSON.stringify(chunk) };
  }
  if (done) yield { type: "done" };
}

function chunk(
  delta: Record<string, unknown>,
  finishReason: string | null = null,
  extras: Record<string, unknown> = {},
) {
  return {
    id: "completion-1",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...extras,
  };
}

async function errorCode(work: Promise<unknown>) {
  try {
    await work;
    throw new Error("expected model error");
  } catch (error) {
    expect(error).toBeInstanceOf(ModelLayerError);
    return (error as ModelLayerError).error.code;
  }
}

describe("chat completion accumulator", () => {
  it("streams visible text serially while keeping reasoning private", async () => {
    const deltas: string[] = [];
    const completion = await accumulateChatCompletion(
      events([
        chunk({ content: "你", reasoning_content: "PRIVATE_A" }),
        chunk({ content: "好", reasoning_content: "PRIVATE_B" }, "stop", {
          usage: {
            prompt_tokens: 10,
            completion_tokens: 2,
            total_tokens: 12,
            completion_tokens_details: { reasoning_tokens: 7 },
          },
        }),
      ]),
      {
        definition: definition(),
        continuationState: stateFor(),
        onTextDelta: async (value) => {
          await Promise.resolve();
          deltas.push(value);
        },
      },
    );

    expect(deltas).toEqual(["你", "好"]);
    expect(completion).toMatchObject({
      content: "你好",
      finishReason: "stop",
      toolCalls: [],
      usage: {
        promptTokens: 10,
        completionTokens: 2,
        totalTokens: 12,
        reasoningTokens: 7,
      },
    });
    expect(JSON.stringify(completion)).not.toMatch(/PRIVATE_[AB]/);
  });

  it("assembles fragmented calls by index and generates deterministic UUIDs", async () => {
    const input = [
      chunk({
        tool_calls: [
          {
            index: 1,
            id: "call-b",
            function: { name: "search_text", arguments: '{"q":"' },
          },
          {
            index: 0,
            id: "call-a",
            function: { name: "read_", arguments: '{"path":"' },
          },
        ],
      }),
      chunk(
        {
          tool_calls: [
            { index: 1, function: { arguments: 'needle"}' } },
            {
              index: 0,
              function: { name: "file", arguments: 'a.ts"}' },
            },
          ],
        },
        "tool_calls",
      ),
    ];
    const first = await accumulateChatCompletion(events(input), {
      definition: definition(),
      continuationState: stateFor(),
    });
    const second = await accumulateChatCompletion(events(input), {
      definition: definition(),
      continuationState: stateFor(),
    });

    expect(first.toolCalls).toEqual(second.toolCalls);
    expect(first.toolCalls).toEqual([
      {
        ok: true,
        call: {
          id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          name: "read_file",
          arguments: { path: "a.ts" },
        },
      },
      {
        ok: true,
        call: {
          id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          name: "search_text",
          arguments: { q: "needle" },
        },
      },
    ]);
  });

  it("accepts object arguments and creates a stable provider ID when absent", async () => {
    const longcat = definition("longcat");
    const input = [
      chunk(
        {
          tool_calls: [
            {
              index: 0,
              function: {
                name: "read_file",
                arguments: { path: "object.ts" },
              },
            },
          ],
        },
        "tool_calls",
      ),
    ];
    const first = await accumulateChatCompletion(events(input), {
      definition: longcat,
      continuationState: stateFor(longcat),
    });
    const second = await accumulateChatCompletion(events(input), {
      definition: longcat,
      continuationState: stateFor(longcat),
    });
    expect(first.toolCalls).toEqual(second.toolCalls);
    expect(first.toolCalls[0]).toMatchObject({
      ok: true,
      call: { name: "read_file", arguments: { path: "object.ts" } },
    });
  });

  it("preserves valid calls when sibling arguments or names are invalid", async () => {
    const completion = await accumulateChatCompletion(
      events([
        chunk(
          {
            tool_calls: [
              {
                index: 0,
                id: "bad-json",
                function: { name: "read_file", arguments: "[1,2]" },
              },
              {
                index: 1,
                id: "bad-name",
                function: { name: "not valid!", arguments: "{}" },
              },
              {
                index: 2,
                id: "unknown-legal",
                function: { name: "future_tool", arguments: '{"x":1}' },
              },
            ],
          },
          "tool_calls",
        ),
      ]),
      { definition: definition(), continuationState: stateFor() },
    );

    expect(completion.toolCalls.map((call) => call.ok)).toEqual([
      false,
      false,
      true,
    ]);
    expect(completion.toolCalls[0]).toMatchObject({
      ok: false,
      error: { code: "MODEL_INVALID_TOOL_CALL", recoverable: true },
    });
    expect(completion.toolCalls[2]).toMatchObject({
      ok: true,
      call: { name: "future_tool", arguments: { x: 1 } },
    });
  });

  it("keeps only valid siblings in provider continuation", async () => {
    const longcat = definition("longcat");
    const completion = await accumulateChatCompletion(
      events([
        chunk(
          {
            tool_calls: [
              {
                index: 0,
                id: "bad-provider-id",
                function: { name: "run_process", arguments: "{bad-json" },
              },
              {
                index: 1,
                id: "valid-provider-id",
                function: { name: "read_file", arguments: { path: "safe.ts" } },
              },
            ],
          },
          "tool_calls",
        ),
      ]),
      { definition: longcat, continuationState: stateFor(longcat) },
    );
    const valid = completion.toolCalls[1];
    expect(valid?.ok).toBe(true);
    if (!valid?.ok) throw new Error("expected valid sibling");

    const next = buildChatRequest({
      profileId: "longcat",
      signal: new AbortController().signal,
      continuation: completion.continuation,
      messages: [
        { role: "user", content: "继续" },
        {
          role: "assistant",
          content: null,
          toolCalls: [valid.call],
        },
        {
          role: "tool",
          toolCallId: valid.call.id,
          name: valid.call.name,
          content: "读取成功",
        },
      ],
      tools: [],
    }, longcat);
    const serialized = JSON.stringify(next.body);
    expect(serialized).toContain("valid-provider-id");
    expect(serialized).toContain('"arguments":{"path":"safe.ts"}');
    expect(serialized).not.toContain("bad-provider-id");
    expect(serialized).not.toContain("{bad-json");
  });

  it("accepts a usage-only tail chunk", async () => {
    const completion = await accumulateChatCompletion(
      events([
        chunk({ content: "done" }, "stop"),
        {
          id: "completion-1",
          choices: [],
          usage: { prompt_tokens: 3, total_tokens: 4 },
        },
      ]),
      { definition: definition(), continuationState: stateFor() },
    );
    expect(completion.usage).toEqual({ promptTokens: 3, totalTokens: 4 });
  });

  it("normalizes DeepSeek hit/miss and compatible cached prompt usage", async () => {
    const deepseek = await accumulateChatCompletion(
      events([
        chunk({ content: "完成" }, "stop", {
          usage: {
            prompt_tokens: 100,
            completion_tokens: 2,
            total_tokens: 102,
            prompt_cache_hit_tokens: 80,
            prompt_cache_miss_tokens: 20,
          },
        }),
      ]),
      { definition: definition(), continuationState: stateFor() },
    );
    expect(deepseek.usage).toEqual({
      promptTokens: 100,
      completionTokens: 2,
      totalTokens: 102,
      cachedPromptTokens: 80,
      cacheMissPromptTokens: 20,
    });

    const generic = definition("generic");
    const compatible = await accumulateChatCompletion(
      events([
        chunk({ content: "完成" }, "stop", {
          usage: {
            prompt_tokens: 50,
            completion_tokens: 2,
            total_tokens: 52,
            prompt_tokens_details: { cached_tokens: 30 },
          },
        }),
      ]),
      { definition: generic, continuationState: stateFor(generic) },
    );
    expect(compatible.usage).toEqual({
      promptTokens: 50,
      completionTokens: 2,
      totalTokens: 52,
      cachedPromptTokens: 30,
    });
  });

  it("rejects conflicting provider cache usage instead of guessing", async () => {
    await expect(
      errorCode(
        accumulateChatCompletion(
          events([
            chunk({ content: "完成" }, "stop", {
              usage: {
                prompt_tokens: 100,
                prompt_cache_hit_tokens: 80,
                prompt_tokens_details: { cached_tokens: 79 },
              },
            }),
          ]),
          { definition: definition(), continuationState: stateFor() },
        ),
      ),
    ).resolves.toBe("MODEL_PROTOCOL_ERROR");
  });

  it.each([
    ["length", "MODEL_OUTPUT_TRUNCATED"],
    ["content_filter", "MODEL_CONTENT_FILTERED"],
    ["insufficient_system_resource", "MODEL_PROVIDER_UNAVAILABLE"],
    ["future_reason", "MODEL_PROTOCOL_ERROR"],
  ])("maps finish reason %s to %s", async (finishReason, expected) => {
    await expect(
      errorCode(
        accumulateChatCompletion(
          events([chunk({ content: "partial" }, finishReason)]),
          { definition: definition(), continuationState: stateFor() },
        ),
      ),
    ).resolves.toBe(expected);
  });

  it("rejects missing DONE, contradictory stop and oversized arguments", async () => {
    await expect(
      errorCode(
        accumulateChatCompletion(events([chunk({ content: "x" }, "stop")], false), {
          definition: definition(),
          continuationState: stateFor(),
        }),
      ),
    ).resolves.toBe("MODEL_PROTOCOL_ERROR");

    await expect(
      errorCode(
        accumulateChatCompletion(
          events([
            chunk(
              {
                content: "text",
                tool_calls: [
                  {
                    index: 0,
                    function: { name: "read_file", arguments: "{}" },
                  },
                ],
              },
              "stop",
            ),
          ]),
          { definition: definition(), continuationState: stateFor() },
        ),
      ),
    ).resolves.toBe("MODEL_PROTOCOL_ERROR");

    await expect(
      errorCode(
        accumulateChatCompletion(
          events([
            chunk(
              {
                tool_calls: [
                  {
                    index: 0,
                    function: {
                      name: "read_file",
                      arguments: "x".repeat(MAX_TOOL_ARGUMENT_BYTES + 1),
                    },
                  },
                ],
              },
              "tool_calls",
            ),
          ]),
          { definition: definition(), continuationState: stateFor() },
        ),
      ),
    ).resolves.toBe("MODEL_RESPONSE_TOO_LARGE");
  });

  it.each([
    ["content", MAX_MODEL_CONTENT_BYTES],
    ["reasoning_content", MAX_MODEL_REASONING_BYTES],
  ])("enforces the %s byte limit", async (field, limit) => {
    await expect(
      errorCode(
        accumulateChatCompletion(
          events([
            chunk(
              { [field]: "x".repeat(limit + 1) },
              field === "content" ? "stop" : "tool_calls",
            ),
          ]),
          { definition: definition(), continuationState: stateFor() },
        ),
      ),
    ).resolves.toBe("MODEL_RESPONSE_TOO_LARGE");
  });
});
