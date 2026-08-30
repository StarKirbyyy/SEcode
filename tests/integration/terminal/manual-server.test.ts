import { spawn } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createModelClient } from "@/lib/model";
import { LOCAL_TOOL_DEFINITIONS } from "@/lib/tools";
import { startManualOpenAiCompatibleServer } from "@/tests/manual/openai-compatible-server";

async function start() {
  const server = await startManualOpenAiCompatibleServer();
  return {
    server,
    endpoint: `${server.baseUrl}/chat/completions`,
  };
}

function requestBody(overrides: Record<string, unknown> = {}) {
  return {
    model: "secode-stage12-fixture",
    stream: true,
    messages: [{ role: "user", content: "read the context fixture" }],
    tools: [{ type: "function", function: { name: "read_file" } }],
    ...overrides,
  };
}

describe("stage 12 manual OpenAI-compatible server", () => {
  it("starts through tsx and releases its listener on SIGTERM", async () => {
    const child = spawn(
      path.join(process.cwd(), "node_modules", ".bin", "tsx"),
      ["tests/manual/openai-compatible-server.ts"],
      { cwd: process.cwd(), shell: false, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (value: string) => { stdout += value; });
    child.stderr.on("data", (value: string) => { stderr += value; });

    const baseUrl = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("test server startup timed out")), 5_000);
      const inspect = () => {
        const match = stdout.match(/OPENAI_COMPAT_BASE_URL=(http:\/\/127\.0\.0\.1:\d+\/v1)/);
        if (!match?.[1] || !stdout.includes("OPENAI_COMPAT_SUPPORTS_THINKING=false\n")) return;
        clearTimeout(timer);
        child.stdout.off("data", inspect);
        resolve(match[1]);
      };
      child.stdout.on("data", inspect);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code) => {
        clearTimeout(timer);
        reject(new Error(`test server exited before startup with ${code}`));
      });
    });

    const healthUrl = `${baseUrl.replace(/\/v1$/, "")}/health`;
    await expect(fetch(healthUrl)).resolves.toMatchObject({ status: 200 });
    child.kill("SIGTERM");
    const close = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    expect(close).toEqual({ code: 0, signal: null });
    expect(stderr).toBe("");
    await expect(fetch(healthUrl)).rejects.toBeDefined();
  });

  it("serves health only on loopback and closes cleanly", async () => {
    const { server } = await start();
    expect(server.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    expect(server).toMatchObject({
      model: "secode-stage12-fixture",
      contextWindow: 14_000,
    });
    await expect(fetch(`${server.baseUrl.replace(/\/v1$/, "")}/health`))
      .resolves.toMatchObject({ status: 200 });
    await server.close();
    await server.close();
    await expect(fetch(`${server.baseUrl.replace(/\/v1$/, "")}/health`))
      .rejects.toBeDefined();
  });

  it("streams a fragmented read_file tool call", async () => {
    const { server, endpoint } = await start();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody()),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const body = await response.text();
      expect(body).toContain('"name":"read_file"');
      expect(body).toContain('\\"path\\":\\"context/chunk.txt\\"');
      expect(body).toContain('"finish_reason":"tool_calls"');
      expect(body.endsWith("data: [DONE]\n\n")).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("streams final text after a tool result", async () => {
    const { server, endpoint } = await start();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody({
          messages: [{ role: "tool", tool_call_id: "call-1", content: "ok" }],
        })),
      });
      const body = await response.text();
      expect(body).toContain("已读取并确认本轮文件事实。");
      expect(body).toContain('"finish_reason":"stop"');
      expect(body).not.toContain("reasoning_content");
    } finally {
      await server.close();
    }
  });

  it("streams a fixed summary when tools are disabled", async () => {
    const { server, endpoint } = await start();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody({ tools: [] })),
      });
      const body = await response.text();
      expect(body).toContain("已压缩：保留各轮文件标记与已确认工具事实。");
      expect(body).toContain('"finish_reason":"stop"');
    } finally {
      await server.close();
    }
  });

  it("is consumed by the production generic model client", async () => {
    const { server } = await start();
    try {
      const client = createModelClient({
        env: {
          OPENAI_COMPAT_BASE_URL: server.baseUrl,
          OPENAI_COMPAT_MODEL: server.model,
          OPENAI_COMPAT_CONTEXT_WINDOW: String(server.contextWindow),
          OPENAI_COMPAT_SUPPORTS_THINKING: "false",
        },
      });
      const completion = await client.complete({
        profileId: "generic",
        messages: [{ role: "user", content: "read the fixture" }],
        tools: [...LOCAL_TOOL_DEFINITIONS],
        signal: new AbortController().signal,
      });
      expect(completion).toMatchObject({
        content: null,
        finishReason: "tool_calls",
        toolCalls: [
          {
            ok: true,
            call: {
              name: "read_file",
              arguments: { path: "context/chunk.txt" },
            },
          },
        ],
      });
    } finally {
      await server.close();
    }
  });

  it("recovers a transient SSE error envelope through the production client", async () => {
    const { server } = await start();
    try {
      const client = createModelClient({
        env: {
          OPENAI_COMPAT_BASE_URL: server.baseUrl,
          OPENAI_COMPAT_MODEL: server.model,
          OPENAI_COMPAT_CONTEXT_WINDOW: String(server.contextWindow),
          OPENAI_COMPAT_SUPPORTS_THINKING: "false",
        },
        dependencies: { sleep: async () => undefined },
      });
      const completion = await client.complete({
        profileId: "generic",
        messages: [{ role: "user", content: "SECODE_TRANSIENT_ENVELOPE" }],
        tools: [],
        signal: new AbortController().signal,
      });

      expect(completion).toMatchObject({
        content: "已压缩：保留各轮文件标记与已确认工具事实。",
        finishReason: "stop",
        usageComplete: false,
      });
      expect(server.requestCount).toBe(2);
      expect(JSON.stringify(completion)).not.toContain("PRIVATE_FIXTURE_PROVIDER_MESSAGE");
    } finally {
      await server.close();
    }
  });

  it("routes a Chinese phase request with Chinese wire tool descriptions", async () => {
    const { server } = await start();
    try {
      const client = createModelClient({
        env: {
          OPENAI_COMPAT_BASE_URL: server.baseUrl,
          OPENAI_COMPAT_MODEL: server.model,
          OPENAI_COMPAT_CONTEXT_WINDOW: String(server.contextWindow),
          OPENAI_COMPAT_SUPPORTS_THINKING: "false",
        },
      });
      const completion = await client.complete({
        profileId: "generic",
        messages: [
          { role: "system", content: "当前阶段：规划。" },
          { role: "user", content: "请先读取 README.md" },
        ],
        tools: [...LOCAL_TOOL_DEFINITIONS].slice(0, 3),
        signal: new AbortController().signal,
      });
      expect(completion).toMatchObject({
        finishReason: "tool_calls",
        toolCalls: [{
          ok: true,
          call: {
            name: "read_file",
            arguments: { path: "README.md", startLine: 1 },
          },
        }],
      });
    } finally {
      await server.close();
    }
  });

  it("provides deterministic English-first language acceptance scenarios", async () => {
    const { server } = await start();
    try {
      const client = createModelClient({
        env: {
          OPENAI_COMPAT_BASE_URL: server.baseUrl,
          OPENAI_COMPAT_MODEL: server.model,
          OPENAI_COMPAT_CONTEXT_WINDOW: String(server.contextWindow),
          OPENAI_COMPAT_SUPPORTS_THINKING: "false",
        },
      });
      const first = await client.complete({
        profileId: "generic",
        messages: [
          { role: "system", content: "当前阶段：正常执行。" },
          { role: "user", content: "SECODE_ENGLISH_FINAL" },
          { role: "system", content: "输出语言强制策略" },
        ],
        tools: [...LOCAL_TOOL_DEFINITIONS],
        signal: new AbortController().signal,
      });
      expect(first.content).toContain("completed the requested task");

      const restated = await client.complete({
        profileId: "generic",
        messages: [
          { role: "system", content: "当前阶段：正常执行。" },
          { role: "user", content: "SECODE_ENGLISH_FINAL" },
          {
            role: "system",
            content: "上一条可见正文不符合输出语言强制策略，只使用简体中文重述。",
          },
        ],
        tools: [...LOCAL_TOOL_DEFINITIONS],
        signal: new AbortController().signal,
      });
      expect(restated.content).toContain("已完成中文重述");

      const narratedTool = await client.complete({
        profileId: "generic",
        messages: [
          { role: "system", content: "当前阶段：正常执行。" },
          { role: "user", content: "SECODE_ENGLISH_TOOL_NARRATIVE" },
          { role: "system", content: "输出语言强制策略" },
        ],
        tools: [...LOCAL_TOOL_DEFINITIONS],
        signal: new AbortController().signal,
      });
      expect(narratedTool).toMatchObject({
        content: "I will inspect the README before continuing.",
        finishReason: "tool_calls",
        toolCalls: [{ ok: true, call: { name: "read_file" } }],
      });
    } finally {
      await server.close();
    }
  });

  it("serves a summary through the production client when tools are disabled", async () => {
    const { server } = await start();
    try {
      const client = createModelClient({
        env: {
          OPENAI_COMPAT_BASE_URL: server.baseUrl,
          OPENAI_COMPAT_MODEL: server.model,
          OPENAI_COMPAT_CONTEXT_WINDOW: String(server.contextWindow),
          OPENAI_COMPAT_SUPPORTS_THINKING: "false",
        },
      });
      const completion = await client.complete({
        profileId: "generic",
        messages: [
          { role: "system", content: "Create a compact factual summary." },
          { role: "user", content: "Summarize the completed fixture rounds." },
        ],
        tools: [],
        signal: new AbortController().signal,
      });
      expect(completion).toMatchObject({
        content: "已压缩：保留各轮文件标记与已确认工具事实。",
        finishReason: "stop",
        toolCalls: [],
      });
    } finally {
      await server.close();
    }
  });

  it("returns finite errors for invalid requests without reflecting inputs", async () => {
    const { server, endpoint } = await start();
    try {
      const missing = await fetch(`${server.baseUrl}/missing`);
      expect(missing.status).toBe(404);
      expect(await missing.text()).toBe('{"error":{"message":"not found"}}');

      const invalid = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "PRIVATE_INVALID_BODY",
      });
      expect(invalid.status).toBe(400);
      expect(await invalid.text()).toBe(
        '{"error":{"message":"request body is not valid JSON"}}',
      );

      const oversized = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ padding: "x".repeat(2 * 1024 * 1024) }),
      });
      expect(oversized.status).toBe(413);
      const error = await oversized.text();
      expect(error).toBe('{"error":{"message":"request body too large"}}');
      expect(error).not.toContain("padding");
    } finally {
      await server.close();
    }
  });
});
