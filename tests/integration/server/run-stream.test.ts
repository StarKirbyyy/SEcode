import { mkdir, readFile, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { POST as createSession } from "@/app/api/sessions/route";
import { POST as startRun } from "@/app/api/sessions/[id]/runs/route";
import { DELETE as cancelRun } from "@/app/api/runs/[id]/route";
import { AgentEventSchema, type AgentEvent } from "@/lib/domain";

import {
  cleanupServerFixtures,
  createSlugFixture,
  jsonRequest,
  parseJson,
  textCompletion,
  toolCompletion,
  waitForTerminalEvent,
} from "./helpers";

afterEach(cleanupServerFixtures);

describe("run NDJSON route", () => {
  it("streams one rejection for the uncovered client scope, then combines both validations", async () => {
    const fixture = await createSlugFixture();
    for (const scope of ["server", "client"]) {
      await mkdir(`${fixture.workspace}/${scope}`);
      await writeFile(
        `${fixture.workspace}/${scope}/package.json`,
        JSON.stringify({ scripts: { test: `node --check ${scope}.mjs` } }),
        "utf8",
      );
    }
    const serverWrite = toolCompletion("write_file", {
      path: "server/server.mjs",
      content: "export const server = true;\n",
    });
    const clientWrite = toolCompletion("write_file", {
      path: "client/client.mjs",
      content: "export const client = true;\n",
    });
    fixture.model.queue.push(
      { ...serverWrite, toolCalls: [serverWrite.toolCalls[0]!, clientWrite.toolCalls[0]!] },
      toolCompletion("run_process", { program: "npm", args: ["test"], cwd: "server" }),
      textCompletion("后端验证完成。"),
      toolCompletion("run_process", { program: "npm", args: ["test"], cwd: "client" }),
      textCompletion("前后端验证完成。"),
    );
    const created = await createSession(jsonRequest("/api/sessions", "POST", {
      workspacePath: fixture.workspace,
      modelProfileId: "test-model",
    }));
    const sessionId = ((await parseJson(created)).session as { id: string }).id;
    const response = await startRun(
      jsonRequest(`/api/sessions/${sessionId}/runs`, "POST", { prompt: "修改并分别验证前后端" }),
      { params: Promise.resolve({ id: sessionId }) },
    );
    const events = (await response.text()).trim().split("\n")
      .map((line) => AgentEventSchema.parse(JSON.parse(line))) as AgentEvent[];
    expect(events.filter((event) => event.type === "completion.evidence.rejected"))
      .toEqual([expect.objectContaining({
        data: expect.objectContaining({ uncoveredScopes: ["client"] }),
      })]);
    expect(events.at(-1)?.type).toBe("run.completed");
  });

  it("runs the real read-replace-test tool loop and streams canonical events", async () => {
    const fixture = await createSlugFixture();
    fixture.model.queue.push(
      toolCompletion("read_file", { path: "src/slug.mjs", startLine: 1 }),
      toolCompletion("replace_in_file", {
        path: "src/slug.mjs",
        oldText: 'return value.toLowerCase().replace(" ", "-");',
        newText: 'return value.trim().toLowerCase().replace(/\\s+/g, "-");',
      }),
      toolCompletion("run_process", { program: "pnpm", args: ["test"], cwd: ".", timeoutMs: 120_000 }),
      textCompletion("修复完成，4 项测试全部通过。"),
    );

    const created = await createSession(jsonRequest("/api/sessions", "POST", {
      workspacePath: fixture.workspace,
      modelProfileId: "test-model",
      title: "Slug fix",
    }));
    const sessionId = ((await parseJson(created)).session as { id: string }).id;
    const response = await startRun(
      jsonRequest(`/api/sessions/${sessionId}/runs`, "POST", { prompt: "修复 slug 并测试" }),
      { params: Promise.resolve({ id: sessionId }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(response.headers.get("content-length")).toBeNull();

    const lines = (await response.text()).trim().split("\n");
    const events = lines.map((line) => AgentEventSchema.parse(JSON.parse(line))) as AgentEvent[];
    expect(events.filter((event) => event.type === "tool.requested")).toHaveLength(3);
    expect(events.some((event) => event.type === "tool.started")).toBe(true);
    expect(events.filter((event) => event.type === "run.completed")).toHaveLength(1);
    expect(events.filter((event) => event.type === "assistant.message" && event.data.kind === "final")).toHaveLength(1);
    expect(events.some((event) => event.type === "assistant.delta" && event.durable === false)).toBe(true);
    expect(events.findLastIndex((event) => event.type === "assistant.delta"))
      .toBeLessThan(events.findLastIndex((event) => event.type === "model.completed"));

    const durableStream = events.filter((event) => event.durable);
    const page = await fixture.store.readEvents(sessionId, { afterSeq: 0, limit: 1_000 });
    expect(page.events.slice(1)).toEqual(durableStream);
    expect(await readFile(`${fixture.workspace}/src/slug.mjs`, "utf8")).toContain('replace(/\\s+/g, "-")');
    const testResult = page.events.findLast((event) => event.type === "tool.result");
    expect(testResult).toMatchObject({ data: { result: { ok: true, metadata: { exitCode: 0 } } } });
  });

  it("returns JSON before starting a stream for invalid input", async () => {
    await createSlugFixture();
    const response = await startRun(
      jsonRequest("/api/sessions/bad/runs", "POST", { prompt: "x" }),
      { params: Promise.resolve({ id: "bad" }) },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  });

  it("streams and persists only redacted language rejection metadata before the Chinese final", async () => {
    const rejectedContent = "I inspected the repository and the requested work is complete.";
    const fixture = await createSlugFixture([
      textCompletion(rejectedContent),
      textCompletion("已检查仓库，请求的工作已经完成。"),
    ]);
    const created = await createSession(jsonRequest("/api/sessions", "POST", {
      workspacePath: fixture.workspace,
      modelProfileId: "test-model",
    }));
    const sessionId = ((await parseJson(created)).session as { id: string }).id;
    const response = await startRun(
      jsonRequest(`/api/sessions/${sessionId}/runs`, "POST", { prompt: "检查项目并用中文总结" }),
      { params: Promise.resolve({ id: sessionId }) },
    );

    const body = await response.text();
    expect(body).not.toContain(rejectedContent);
    const events = body.trim().split("\n").map((line) => AgentEventSchema.parse(JSON.parse(line))) as AgentEvent[];
    expect(events.filter((event) => event.type === "model.output.rejected")).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          iteration: 1,
          action: "retry",
          retryAttempt: 1,
          contentCharacters: rejectedContent.length,
        }),
      }),
    ]);
    expect(events.some((event) => event.type === "assistant.message" && event.data.content === "已检查仓库，请求的工作已经完成。")).toBe(true);

    const page = await fixture.store.readEvents(sessionId, { afterSeq: 0, limit: 1_000 });
    expect(JSON.stringify(page.events)).not.toContain(rejectedContent);
    expect(page.events.filter((event) => event.type === "model.output.rejected")).toHaveLength(1);
  });

  it("returns 409 for a second run without disturbing the active run", async () => {
    const fixture = await createSlugFixture([
      async (request) => await new Promise((_, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
      }),
    ]);
    const created = await createSession(jsonRequest("/api/sessions", "POST", {
      workspacePath: fixture.workspace,
      modelProfileId: "test-model",
    }));
    const sessionId = ((await parseJson(created)).session as { id: string }).id;
    const first = await startRun(jsonRequest(`/api/sessions/${sessionId}/runs`, "POST", { prompt: "first" }), { params: Promise.resolve({ id: sessionId }) });
    const firstReader = first.body!.getReader();
    const firstEvent = JSON.parse(new TextDecoder().decode((await firstReader.read()).value!)) as { runId: string };
    const second = await startRun(jsonRequest(`/api/sessions/${sessionId}/runs`, "POST", { prompt: "second" }), { params: Promise.resolve({ id: sessionId }) });
    expect(second.status).toBe(409);
    expect(await parseJson(second)).toMatchObject({ error: { code: "AGENT_SESSION_BUSY" } });
    const cancelled = await cancelRun(jsonRequest(`/api/runs/${firstEvent.runId}`, "DELETE", { reason: "cleanup" }), { params: Promise.resolve({ id: firstEvent.runId }) });
    expect(cancelled.status).toBe(202);
    await firstReader.cancel();
    await waitForTerminalEvent(fixture.store, sessionId);
  });
});
