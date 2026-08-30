import { describe, expect, it, vi } from "vitest";

import { createModelClient } from "@/lib/model/client";
import {
  ModelAbortError,
  ModelLayerError,
  type ModelFetch,
  type ModelRequest,
} from "@/lib/model/types";

import { sseResponse, streamFromText } from "./helpers";

const env = {
  DEEPSEEK_API_KEY: "plain-private-test-key",
  DEEPSEEK_BASE_URL: "https://model.example/v1",
  DEEPSEEK_MODEL: "test-model",
};

function request(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    profileId: "deepseek",
    signal: new AbortController().signal,
    messages: [{ role: "user", content: "answer" }],
    tools: [],
    ...overrides,
  };
}

function successResponse(content = "ok"): Response {
  return sseResponse([
    {
      id: "completion-success",
      choices: [
        {
          index: 0,
          delta: { content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
    },
    "[DONE]",
  ]);
}

function errorEnvelopeResponse(error: Record<string, unknown>): Response {
  return sseResponse([{ error }, "[DONE]"]);
}

async function captureError(work: Promise<unknown>): Promise<ModelLayerError> {
  try {
    await work;
    throw new Error("expected model error");
  } catch (error) {
    expect(error).toBeInstanceOf(ModelLayerError);
    return error as ModelLayerError;
  }
}

function failingStream(
  prefix: string,
  message = "socket closed",
): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(prefix);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (bytes.byteLength > 0) controller.enqueue(bytes);
      setTimeout(() => controller.error(new Error(message)), 0);
    },
  });
}

describe("model HTTP client", () => {
  it("sends the exact endpoint, safe headers and mapped streaming body", async () => {
    const fetch = vi.fn<ModelFetch>(async () => successResponse());
    const deltas: string[] = [];
    const client = createModelClient({ env, dependencies: { fetch } });
    const completion = await client.complete(
      request({
        onTextDelta: (delta) => {
          deltas.push(delta);
        },
      }),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://model.example/v1/chat/completions");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        Authorization: "Bearer plain-private-test-key",
      },
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "test-model",
      stream: true,
      thinking: { type: "disabled" },
    });
    expect(Object.keys(init?.headers as Record<string, string>).sort()).toEqual([
      "Accept",
      "Authorization",
      "Content-Type",
    ]);
    expect(completion).toMatchObject({
      content: "ok",
      finishReason: "stop",
      usage: { totalTokens: 3 },
    });
    expect(deltas).toEqual(["ok"]);
  });

  it("omits Authorization for a keyless loopback LongCat profile", async () => {
    const fetch = vi.fn<ModelFetch>(async () => successResponse());
    const client = createModelClient({
      env: {
        LONGCAT_BASE_URL: "http://localhost:8000/v1",
        LONGCAT_MODEL: "longcat-test",
      },
      dependencies: { fetch },
    });
    await client.complete(request({ profileId: "longcat" }));
    const headers = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Authorization");
  });

  it.each([
    [401, "MODEL_AUTH_ERROR"],
    [402, "MODEL_PAYMENT_REQUIRED"],
    [403, "MODEL_AUTH_ERROR"],
    [422, "MODEL_REQUEST_INVALID"],
  ])("maps HTTP %i without retry", async (status, code) => {
    const fetch = vi.fn<ModelFetch>(async () =>
      new Response("request failed", { status }),
    );
    const client = createModelClient({ env, dependencies: { fetch } });
    const error = await captureError(client.complete(request()));
    expect(error.error.code).toBe(code);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries 429 and 5xx with Retry-After and bounded jitter", async () => {
    const responses = [
      new Response("rate", { status: 429, headers: { "Retry-After": "2" } }),
      new Response("unavailable", { status: 503 }),
      successResponse("recovered"),
    ];
    const fetch = vi.fn<ModelFetch>(async () => responses.shift()!);
    const delays: number[] = [];
    const client = createModelClient({
      env,
      dependencies: {
        fetch,
        random: () => 0.5,
        sleep: async (delay) => {
          delays.push(delay);
        },
      },
    });

    await expect(client.complete(request())).resolves.toMatchObject({
      content: "recovered",
      usageComplete: false,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([2_000, 1_000]);
  });

  it("retries HTTP 408 and parses an HTTP-date Retry-After", async () => {
    const responses = [
      new Response("timeout", {
        status: 408,
        headers: { "Retry-After": "Thu, 01 Jan 2026 00:00:45 GMT" },
      }),
      successResponse("after-408"),
    ];
    const fetch = vi.fn<ModelFetch>(async () => responses.shift()!);
    const delays: number[] = [];
    const client = createModelClient({
      env,
      dependencies: {
        fetch,
        now: () => Date.parse("Thu, 01 Jan 2026 00:00:00 GMT"),
        sleep: async (delay) => {
          delays.push(delay);
        },
      },
    });

    await expect(client.complete(request())).resolves.toMatchObject({
      content: "after-408",
    });
    expect(delays).toEqual([30_000]);
  });

  it("retries network failures before payload and ignores keep-alives", async () => {
    const responses = [
      new Response(failingStream(": keep-alive\n\n"), { status: 200 }),
      successResponse("after-retry"),
    ];
    const fetch = vi.fn<ModelFetch>(async () => responses.shift()!);
    const delays: number[] = [];
    const client = createModelClient({
      env,
      dependencies: {
        fetch,
        random: () => 0.5,
        sleep: async (delay) => {
          delays.push(delay);
        },
      },
    });

    await expect(client.complete(request())).resolves.toMatchObject({
      content: "after-retry",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([500]);
  });

  it("retries a transient SSE error envelope before semantic output", async () => {
    const responses = [
      errorEnvelopeResponse({
        type: "server_error",
        code: "service_unavailable",
        message: "PRIVATE_PROVIDER_MESSAGE",
      }),
      successResponse("after-envelope"),
    ];
    const fetch = vi.fn<ModelFetch>(async () => responses.shift()!);
    const client = createModelClient({
      env,
      dependencies: { fetch, sleep: async () => undefined },
    });

    await expect(client.complete(request())).resolves.toMatchObject({
      content: "after-envelope",
      usageComplete: false,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ type: "authentication_error", code: "invalid_api_key" }, "MODEL_AUTH_ERROR"],
    [{ type: "invalid_request_error", code: "bad_request" }, "MODEL_REQUEST_INVALID"],
    [{ type: "future_error", code: "future_code" }, "MODEL_PROTOCOL_ERROR"],
  ])("does not retry a non-transient SSE error envelope", async (providerError, code) => {
    const fetch = vi.fn<ModelFetch>(async () => errorEnvelopeResponse({
      ...providerError,
      message: "PRIVATE_PROVIDER_MESSAGE",
    }));
    const client = createModelClient({ env, dependencies: { fetch } });
    const error = await captureError(client.complete(request()));

    expect(error.error.code).toBe(code);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.error)).not.toContain("PRIVATE_PROVIDER_MESSAGE");
  });

  it("never retries after the first data event and marks discarded partial output", async () => {
    const prefix =
      'data: {"id":"partial","choices":[{"index":0,"delta":{"content":"visible"},"finish_reason":null}]}\n\n';
    const fetch = vi.fn<ModelFetch>(async () =>
      new Response(failingStream(prefix), { status: 200 }),
    );
    const deltas: string[] = [];
    const client = createModelClient({ env, dependencies: { fetch } });
    const error = await captureError(
      client.complete(
        request({
          onTextDelta: (delta) => {
            deltas.push(delta);
          },
        }),
      ),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(deltas).toEqual(["visible"]);
    expect(error.error).toMatchObject({
      code: "MODEL_NETWORK_ERROR",
      details: { partialOutputDiscarded: true },
    });
  });

  it.each([
    ["reasoning", { id: "semantic", choices: [{ index: 0, delta: { reasoning_content: "PRIVATE" }, finish_reason: null }] }],
    ["tool fragment", { id: "semantic", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call-x", function: { name: "read_file", arguments: "{" } }] }, finish_reason: null }] }],
    ["usage", { id: "semantic", choices: [], usage: { prompt_tokens: 2 } }],
    ["finish", { id: "semantic", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }],
  ])("does not retry after accepted %s semantic output", async (_label, semanticChunk) => {
    const fetch = vi.fn<ModelFetch>(async () => sseResponse([
      semanticChunk,
      { error: { type: "server_error", code: "service_unavailable" } },
      "[DONE]",
    ]));
    const client = createModelClient({
      env,
      dependencies: { fetch, sleep: async () => undefined },
    });
    const error = await captureError(client.complete(request()));

    expect(error.error).toMatchObject({
      code: "MODEL_PROVIDER_UNAVAILABLE",
      details: { partialOutputDiscarded: true },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a connection error and enforces the total-attempt limit", async () => {
    const fetch = vi.fn<ModelFetch>(async () => {
      throw new Error("connect failed");
    });
    const client = createModelClient({
      env,
      dependencies: {
        fetch,
        sleep: async () => undefined,
        maxAttempts: 3,
      },
    });
    const error = await captureError(client.complete(request()));
    expect(error.error.code).toBe("MODEL_NETWORK_ERROR");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("turns attempt timeout into a structured error", async () => {
    const fetch: ModelFetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    const client = createModelClient({
      env,
      dependencies: { fetch, timeoutMs: 5, maxAttempts: 1 },
    });
    const error = await captureError(client.complete(request()));
    expect(error.error.code).toBe("MODEL_TIMEOUT");
    expect(error.error.recoverable).toBe(true);
  });

  it("retries an attempt timeout before payload", async () => {
    let attempts = 0;
    const fetch: ModelFetch = async (_input, init) => {
      attempts += 1;
      if (attempts > 1) return successResponse("after-timeout");
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    };
    const client = createModelClient({
      env,
      dependencies: {
        fetch,
        timeoutMs: 5,
        sleep: async () => undefined,
      },
    });
    await expect(client.complete(request())).resolves.toMatchObject({
      content: "after-timeout",
    });
    expect(attempts).toBe(2);
  });

  it("distinguishes caller abort before fetch and during retry sleep", async () => {
    const preAborted = new AbortController();
    preAborted.abort("stop-now");
    const neverFetch = vi.fn<ModelFetch>(async () => successResponse());
    const firstClient = createModelClient({
      env,
      dependencies: { fetch: neverFetch },
    });
    await expect(
      firstClient.complete(request({ signal: preAborted.signal })),
    ).rejects.toBeInstanceOf(ModelAbortError);
    expect(neverFetch).not.toHaveBeenCalled();

    const duringSleep = new AbortController();
    const fetch = vi.fn<ModelFetch>(async () =>
      new Response("retry", { status: 503 }),
    );
    const secondClient = createModelClient({
      env,
      dependencies: {
        fetch,
        sleep: async () => {
          duringSleep.abort("user-stop");
          throw new ModelAbortError();
        },
      },
    });
    await expect(
      secondClient.complete(request({ signal: duringSleep.signal })),
    ).rejects.toBeInstanceOf(ModelAbortError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("cancels while reading a response body", async () => {
    const controller = new AbortController();
    const fetch = vi.fn<ModelFetch>(async () =>
      new Response(new ReadableStream<Uint8Array>({ start() {} }), {
        status: 200,
      }),
    );
    const client = createModelClient({ env, dependencies: { fetch } });
    const work = client.complete(request({ signal: controller.signal }));
    setTimeout(() => controller.abort("body-stop"), 0);
    await expect(work).rejects.toBeInstanceOf(ModelAbortError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects dependency overrides above the approved attempt limit", () => {
    expect(() =>
      createModelClient({ env, dependencies: { maxAttempts: 4 } }),
    ).toThrow(/1 和 3/);
  });

  it("bounds and redacts HTTP error previews", async () => {
    const fetch = vi.fn<ModelFetch>(async () =>
      new Response(
        JSON.stringify({
          message: `Bearer secret-token ${env.DEEPSEEK_API_KEY}`,
          reasoning_content: "PRIVATE_REASONING_SENTINEL",
          padding: "x".repeat(20_000),
        }),
        { status: 401 },
      ),
    );
    const client = createModelClient({ env, dependencies: { fetch } });
    const error = await captureError(client.complete(request()));
    const serialized = JSON.stringify(error.error);

    expect(serialized).not.toContain(env.DEEPSEEK_API_KEY);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("PRIVATE_REASONING_SENTINEL");
    expect(serialized.length).toBeLessThan(9_000);
  });

  it("keeps a known auth status when its preview body disconnects", async () => {
    const fetch = vi.fn<ModelFetch>(async () =>
      new Response(failingStream("", "error body closed"), { status: 401 }),
    );
    const client = createModelClient({ env, dependencies: { fetch } });
    const error = await captureError(client.complete(request()));

    expect(error.error.code).toBe("MODEL_AUTH_ERROR");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not require an SSE content-type header", async () => {
    const fetch = vi.fn<ModelFetch>(async () =>
      new Response(
        streamFromText(
          'data: {"id":"x","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        ),
        { status: 200 },
      ),
    );
    const client = createModelClient({ env, dependencies: { fetch } });
    await expect(client.complete(request())).resolves.toMatchObject({
      content: "ok",
    });
  });
});
