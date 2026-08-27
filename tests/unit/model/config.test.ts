import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL_TIMEOUT_MS,
  createModelClient,
  getModelRegistrySnapshot as getSnapshotFromPublicEntry,
} from "@/lib/model";

import {
  DEFAULT_DEEPSEEK_CONTEXT_WINDOW,
  DEFAULT_DEEPSEEK_MODEL,
  getModelRegistrySnapshot,
  normalizeChatCompletionsUrl,
  readModelApiKey,
  resolveServerModelProfile,
} from "@/lib/model/config";

describe("model configuration registry", () => {
  it("exposes the safe public model entry", () => {
    expect(DEFAULT_MODEL_TIMEOUT_MS).toBe(120_000);
    expect(getSnapshotFromPublicEntry({}).profiles[0]?.id).toBe("deepseek");
    expect(
      createModelClient({ env: {}, dependencies: { maxAttempts: 1 } }),
    ).toHaveProperty("complete");
  });

  it("returns a redacted unconfigured DeepSeek profile by default", () => {
    const snapshot = getModelRegistrySnapshot({});

    expect(snapshot.profiles).toEqual([
      expect.objectContaining({
        id: "deepseek",
        model: DEFAULT_DEEPSEEK_MODEL,
        contextWindow: DEFAULT_DEEPSEEK_CONTEXT_WINDOW,
        configured: false,
      }),
    ]);
    expect(snapshot.issues).toContainEqual(
      expect.objectContaining({ code: "MISSING_API_KEY" }),
    );
    expect(JSON.stringify(snapshot)).not.toMatch(/apiKeyEnv|Authorization|secret/);
  });

  it("resolves configured DeepSeek without placing the key in its definition", () => {
    const env = { DEEPSEEK_API_KEY: "test-secret-key" };
    const definition = resolveServerModelProfile("deepseek", env);

    expect(definition.endpoint).toBe(
      "https://api.deepseek.com/chat/completions",
    );
    expect(definition.profile.configured).toBe(true);
    expect(JSON.stringify(definition)).not.toContain("test-secret-key");
    expect(readModelApiKey(definition, env)).toBe("test-secret-key");
  });

  it("supports a keyless loopback LongCat endpoint", () => {
    const env = {
      LONGCAT_BASE_URL: "http://localhost:8000/v1",
      LONGCAT_MODEL: "meituan-longcat/LongCat-2.0",
      LONGCAT_CONTEXT_WINDOW: "1000000",
      LONGCAT_SUPPORTS_THINKING: "true",
    };
    const definition = resolveServerModelProfile("longcat", env);

    expect(definition.endpoint).toBe(
      "http://localhost:8000/v1/chat/completions",
    );
    expect(definition.profile).toMatchObject({
      contextWindow: 1_000_000,
      supportsThinking: true,
      configured: true,
    });
    expect(readModelApiKey(definition, env)).toBeUndefined();
  });

  it("supports a configured remote generic OpenAI-compatible endpoint", () => {
    const genericEnv = {
      OPENAI_COMPAT_BASE_URL: "https://gateway.example/v1",
      OPENAI_COMPAT_MODEL: "compatible-model",
      OPENAI_COMPAT_API_KEY: "generic-private-test-key",
    };
    const definition = resolveServerModelProfile("generic", genericEnv);

    expect(definition).toMatchObject({
      adapter: "generic",
      endpoint: "https://gateway.example/v1/chat/completions",
      profile: { id: "generic", configured: true },
    });
    expect(JSON.stringify(getModelRegistrySnapshot(genericEnv))).not.toContain(
      "generic-private-test-key",
    );
  });

  it("reports partial and strict-value errors without echoing values", () => {
    const env = {
      LONGCAT_BASE_URL: "https://gateway.example/v1",
      LONGCAT_CONTEXT_WINDOW: "64000junk",
      OPENAI_COMPAT_BASE_URL: "https://generic.example/v1",
      OPENAI_COMPAT_MODEL: "model",
      OPENAI_COMPAT_SUPPORTS_THINKING: "yes-secret-value",
    };
    const snapshot = getModelRegistrySnapshot(env);
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profileId: "longcat",
          code: "MISSING_MODEL",
        }),
        expect.objectContaining({
          profileId: "generic",
          code: "INVALID_VALUE",
        }),
      ]),
    );
    expect(serialized).not.toContain("yes-secret-value");
    expect(serialized).not.toContain("64000junk");
  });

  it("rejects resolving an absent or unconfigured profile", () => {
    expect(() => resolveServerModelProfile("deepseek", {})).toThrow(
      /尚未完成/,
    );
    expect(() => resolveServerModelProfile("longcat", {})).toThrow(
      /不存在或无效/,
    );
  });
});

describe("model environment example", () => {
  it("contains no API keys and uses the approved defaults", async () => {
    const source = await readFile(
      new URL("../../../.env.example", import.meta.url),
      "utf8",
    );

    expect(source).toContain("DEEPSEEK_MODEL=deepseek-v4-flash");
    expect(source).toContain("DEEPSEEK_CONTEXT_WINDOW=1000000");
    expect(source).toContain("LONGCAT_SUPPORTS_THINKING=false");
    expect(source).toContain("OPENAI_COMPAT_SUPPORTS_THINKING=false");
    for (const line of source.split(/\r?\n/)) {
      if (line.includes("_API_KEY=")) {
        expect(line).toMatch(/^[A-Z_]+_API_KEY=$/);
      }
    }
  });
});

describe("chat completions URL normalization", () => {
  it.each([
    [
      "https://api.example.com",
      "https://api.example.com/chat/completions",
    ],
    [
      "https://api.example.com/v1/",
      "https://api.example.com/v1/chat/completions",
    ],
    [
      "https://api.example.com//v1//chat/completions/",
      "https://api.example.com/v1/chat/completions",
    ],
    [
      "http://127.0.0.1:8000/v1",
      "http://127.0.0.1:8000/v1/chat/completions",
    ],
    [
      "http://[::1]:30000/v1",
      "http://[::1]:30000/v1/chat/completions",
    ],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeChatCompletionsUrl(input)).toBe(expected);
  });

  it.each([
    "http://api.example.com/v1",
    "ftp://localhost/model",
    "https://user:pass@api.example.com/v1",
    "https://api.example.com/v1?token=secret",
    "https://api.example.com/v1#fragment",
    "not a url",
  ])("rejects unsafe URL %s", (input) => {
    expect(() => normalizeChatCompletionsUrl(input)).toThrow();
  });
});
