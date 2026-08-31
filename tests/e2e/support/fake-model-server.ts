import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export type FakeModelScenario =
  | "idle"
  | "slug-fix"
  | "multi-scope-validation"
  | "late-validation-script"
  | "tdd-web-handoff"
  | "convergence-efficient-web"
  | "service-failure-soft-final"
  | "approval-allow"
  | "approval-reject"
  | "slow-cancel"
  | "provider-failure"
  | "markdown-security"
  | "plan-basic"
  | "plan-long-markdown"
  | "plan-slug-fix"
  | "plan-danger"
  | "english-final-retry"
  | "english-plan-retry"
  | "english-tool-narrative"
  | "always-english"
  | "english-retry-cancel";

export interface FakeModelServer {
  port: number;
  baseUrl: string;
  close(): Promise<void>;
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function event(response: ServerResponse, value: unknown) {
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

function chunk(id: string, delta: Record<string, unknown>, finishReason: null | "stop" | "tool_calls") {
  return { id, object: "chat.completion.chunk", created: 0, model: "secode-e2e-model", choices: [{ index: 0, delta, finish_reason: finishReason }] };
}

function streamText(response: ServerResponse, id: string, content: string) {
  event(response, chunk(id, { role: "assistant" }, null));
  const midpoint = Math.max(1, Math.floor(content.length / 2));
  event(response, chunk(id, { content: content.slice(0, midpoint) }, null));
  event(response, chunk(id, { content: content.slice(midpoint) }, null));
  event(response, chunk(id, {}, "stop"));
  event(response, {
    id,
    choices: [],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      prompt_cache_hit_tokens: 75,
      prompt_cache_miss_tokens: 25,
      completion_tokens_details: { reasoning_tokens: 5 },
    },
  });
  response.end("data: [DONE]\n\n");
}

const longMarkdownPlan = [
  "## 长计划呈现验收",
  "",
  "| 检查项 | 策略 |",
  "| --- | --- |",
  "| durable | 批准前完整呈现，批准后保持原文 |",
  "| port | 避开 SEcode 使用的 3000 端口 |",
  "",
  "```sh",
  "SERVER_PORT=3001 node server.mjs",
  "```",
  "",
  ...Array.from({ length: 28 }, (_, index) =>
    `${index + 1}. 检查步骤 ${index + 1}：先确认工作区中的目录、文件与现有配置，再执行最小范围修改；验证时记录真实命令、退出状态和关键输出，任何失败都保留症状、根因与重跑结果。`,
  ),
  "",
  "计划尾部在批准前完整可见",
].join("\n");

function streamTool(response: ServerResponse, id: string, toolName: string, arguments_: Record<string, unknown>, callNumber: number, content?: string) {
  event(response, chunk(id, { role: "assistant", tool_calls: [{ index: 0, id: `e2e-call-${callNumber}`, type: "function", function: { name: toolName, arguments: "" } }] }, null));
  if (content !== undefined) event(response, chunk(id, { content }, null));
  event(response, chunk(id, { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(arguments_) } }] }, null));
  event(response, chunk(id, {}, "tool_calls"));
  event(response, {
    id,
    choices: [],
    usage: {
      prompt_tokens: 80,
      completion_tokens: 10,
      total_tokens: 90,
      prompt_cache_hit_tokens: 40,
      prompt_cache_miss_tokens: 40,
      completion_tokens_details: { reasoning_tokens: 3 },
    },
  });
  response.end("data: [DONE]\n\n");
}

function streamTools(
  response: ServerResponse,
  id: string,
  tools: Array<{ name: string; arguments: Record<string, unknown> }>,
  callNumber: number,
) {
  event(response, chunk(id, {
    role: "assistant",
    tool_calls: tools.map((tool, index) => ({
      index,
      id: `e2e-call-${callNumber}-${index + 1}`,
      type: "function",
      function: { name: tool.name, arguments: "" },
    })),
  }, null));
  event(response, chunk(id, {
    tool_calls: tools.map((tool, index) => ({
      index,
      function: { arguments: JSON.stringify(tool.arguments) },
    })),
  }, null));
  event(response, chunk(id, {}, "tool_calls"));
  response.end("data: [DONE]\n\n");
}

async function holdStreamUntilCancelled(response: ServerResponse): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (!response.destroyed) streamText(response, "e2e-delayed", "取消等待超时后返回。 ");
      resolve();
    }, 60_000);
    response.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

const TDD_PACKAGE = JSON.stringify({
  name: "stage25-tdd-handoff",
  private: true,
  type: "module",
  scripts: {
    test: "node --test app.test.mjs",
    build: "node --check logic.mjs && node --check backend.mjs && node --check frontend.mjs",
  },
}, null, 2) + "\n";

const TDD_TEST = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  'import { dashboardTitle } from "./logic.mjs";',
  "",
  'test("提供看板标题", () => assert.equal(dashboardTitle(), "Stage 25 看板"));',
  "",
].join("\n");

const TDD_LOGIC = [
  'export function dashboardTitle() {',
  '  return "Stage 25 看板";',
  '}',
  "",
].join("\n");

const TDD_BACKEND = [
  'import { createServer } from "node:http";',
  'const port = Number(process.argv[2]);',
  'const server = createServer((request, response) => {',
  '  response.setHeader("access-control-allow-origin", "*");',
  '  if (request.url === "/api/health") {',
  '    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });',
  '    response.end(JSON.stringify({ ok: true, message: "API 已连接" }));',
  '    return;',
  '  }',
  '  response.writeHead(404);',
  '  response.end("not found");',
  '});',
  'server.listen(port, "127.0.0.1", () => console.log(`backend:${port}`));',
  "",
].join("\n");

const TDD_HTML = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Stage 25 看板</title></head><body><main><h1>Stage 25 看板</h1><p id="status">API 连接中</p><p id="count">计数：0</p><button id="increment">增加计数</button></main><script>let count=0;document.getElementById("increment").addEventListener("click",()=>{count+=1;document.getElementById("count").textContent="计数："+count});fetch("http://127.0.0.1:__BACKEND_PORT__/api/health").then(response=>response.json()).then(data=>{document.getElementById("status").textContent=data.message}).catch(()=>{document.getElementById("status").textContent="API 连接失败"});</script></body></html>';
const TDD_FRONTEND = [
  'import { createServer } from "node:http";',
  'const frontendPort = Number(process.argv[2]);',
  'const backendPort = String(Number(process.argv[3]));',
  "const html = " + JSON.stringify(TDD_HTML) + '.replace("__BACKEND_PORT__", backendPort);',
  'createServer((_request, response) => {',
  '  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });',
  '  response.end(html);',
  '}).listen(frontendPort, "127.0.0.1", () => console.log(`frontend:${frontendPort}`));',
  "",
].join("\n");

const CONVERGENCE_SERVER_PACKAGE = JSON.stringify({
  private: true,
  type: "module",
  scripts: { test: "node --test health.test.mjs" },
}, null, 2) + "\n";
const CONVERGENCE_CLIENT_PACKAGE = JSON.stringify({
  private: true,
  type: "module",
  scripts: { test: "node --test title.test.mjs" },
}, null, 2) + "\n";
const CONVERGENCE_SERVER_TEST = 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { healthPayload } from "./health.mjs";\ntest("health payload", () => assert.deepEqual(healthPayload(), { ok: true, message: "API 已连接" }));\n';
const CONVERGENCE_CLIENT_TEST = 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { dashboardTitle } from "./title.mjs";\ntest("dashboard title", () => assert.equal(dashboardTitle(), "Stage 26 看板"));\n';
const CONVERGENCE_HEALTH = 'export const healthPayload = () => ({ ok: true, message: "API 已连接" });\n';
const CONVERGENCE_BACKEND = 'import { createServer } from "node:http";\nimport { healthPayload } from "./health.mjs";\nconst port = Number(process.argv[2]);\ncreateServer((request, response) => { response.setHeader("access-control-allow-origin", "*"); if (request.url === "/api/health") { response.writeHead(200, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(healthPayload())); return; } response.writeHead(404); response.end("not found"); }).listen(port, "127.0.0.1");\n';
const CONVERGENCE_TITLE = 'export const dashboardTitle = () => "Stage 26 看板";\n';
const CONVERGENCE_FRONTEND = 'import { createServer } from "node:http";\nconst port = Number(process.argv[2]);\nconst backendPort = Number(process.argv[3]);\nconst html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Stage 26 看板</title></head><body><main><h1>Stage 26 看板</h1><p id="status">API 连接中</p><p id="count">计数：0</p><button id="increment">增加计数</button></main><script>let count=0;document.getElementById("increment").onclick=()=>{count+=1;document.getElementById("count").textContent="计数："+count};fetch("http://127.0.0.1:${backendPort}/api/health").then(r=>r.json()).then(v=>document.getElementById("status").textContent=v.message);</script></body></html>`;\ncreateServer((_request, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html); }).listen(port, "127.0.0.1");\n';
const CONVERGENCE_SMOKE = 'const response = await fetch(`http://127.0.0.1:${process.argv[2]}/api/health`);\nconst value = await response.json();\nif (!response.ok || value.message !== "API 已连接") process.exit(1);\n';

function requestText(requestBody: Record<string, unknown>) {
  const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [];
  return messages.flatMap((message) => {
    if (typeof message !== "object" || message === null || !("content" in message)) return [];
    return typeof message.content === "string" ? [message.content] : [];
  }).join("\n");
}

function requestedPort(requestBody: Record<string, unknown>, name: "BACKEND_PORT" | "FRONTEND_PORT") {
  const value = requestText(requestBody).match(new RegExp(`${name}=(\\d{4,5})`, "u"))?.[1];
  if (value === undefined || value === "3000") return undefined;
  return Number(value);
}

function selectedTool(scenario: FakeModelScenario, completion: number, requestBody: Record<string, unknown>): { name: string; arguments: Record<string, unknown> } | undefined {
  if (scenario === "slug-fix") {
    if (completion === 1) return { name: "read_file", arguments: { path: "src/slug.mjs", startLine: 1, endLine: 5 } };
    if (completion === 2) {
      return { name: "replace_in_file", arguments: { path: "src/slug.mjs", oldText: 'return value.toLowerCase().replace(" ", "-");', newText: 'return value.trim().toLowerCase().replace(/\\s+/g, "-");' } };
    }
    if (completion === 3) return { name: "run_process", arguments: { program: "pnpm", args: ["test"], cwd: ".", timeoutMs: 120000 } };
  }
  if (scenario === "multi-scope-validation") {
    if (completion === 1) return { name: "write_file", arguments: { path: "server/server.mjs", content: "export const server = true;\n" } };
    if (completion === 2) return { name: "write_file", arguments: { path: "client/client.mjs", content: "export const client = true;\n" } };
    if (completion === 3) return { name: "run_process", arguments: { program: "npm", args: ["test"], cwd: "server", timeoutMs: 120000 } };
    if (completion === 5) return { name: "run_process", arguments: { program: "npm", args: ["test"], cwd: "client", timeoutMs: 120000 } };
  }
  if (scenario === "late-validation-script") {
    if (completion === 1) return { name: "write_file", arguments: { path: "client/app-late.mjs", content: "export const client = true;\n" } };
    if (completion === 2) return { name: "run_process", arguments: { program: "npm", args: ["test"], cwd: "client", timeoutMs: 120000 } };
    if (completion === 3) return { name: "write_file", arguments: { path: "client/verify-integration.mjs", content: "export const verified = true;\n" } };
    if (completion === 4) return { name: "run_process", arguments: { program: "node", args: ["verify-integration.mjs"], cwd: "client", timeoutMs: 120000 } };
  }
  if (scenario === "tdd-web-handoff") {
    const backendPort = requestedPort(requestBody, "BACKEND_PORT");
    const frontendPort = requestedPort(requestBody, "FRONTEND_PORT");
    if (backendPort === undefined || frontendPort === undefined) return undefined;
    if (completion === 1) return { name: "list_directory", arguments: { path: "stage25-app", depth: 1, limit: 50 } };
    if (completion === 2) return { name: "write_file", arguments: { path: "stage25-app/package.json", content: TDD_PACKAGE } };
    if (completion === 3) return { name: "write_file", arguments: { path: "stage25-app/app.test.mjs", content: TDD_TEST } };
    if (completion === 4) return { name: "run_process", arguments: { program: "npm", args: ["test"], cwd: "stage25-app", timeoutMs: 120_000 } };
    if (completion === 5) return { name: "write_file", arguments: { path: "stage25-app/logic.mjs", content: TDD_LOGIC } };
    if (completion === 6) return { name: "write_file", arguments: { path: "stage25-app/backend.mjs", content: TDD_BACKEND } };
    if (completion === 7) return { name: "write_file", arguments: { path: "stage25-app/frontend.mjs", content: TDD_FRONTEND } };
    if (completion === 8) return { name: "run_process", arguments: { program: "npm", args: ["test"], cwd: "stage25-app", timeoutMs: 120_000 } };
    if (completion === 9) return { name: "run_process", arguments: { program: "npm", args: ["run", "build"], cwd: "stage25-app", timeoutMs: 120_000 } };
    if (completion === 10) return { name: "run_process", arguments: { program: "node", args: ["backend.mjs", String(backendPort)], cwd: "stage25-app", timeoutMs: 120_000, lifecycle: "service", readiness: { url: `http://127.0.0.1:${backendPort}/api/health`, expectedStatus: 200, timeoutMs: 30_000 } } };
    if (completion === 11) return { name: "run_process", arguments: { program: "node", args: ["frontend.mjs", String(frontendPort), String(backendPort)], cwd: "stage25-app", timeoutMs: 120_000, lifecycle: "service", readiness: { url: `http://127.0.0.1:${frontendPort}/`, expectedStatus: 200, timeoutMs: 30_000 } } };
  }
  if (scenario === "service-failure-soft-final" && completion === 1) {
    const port = requestedPort(requestBody, "BACKEND_PORT");
    if (port === undefined) return undefined;
    return {
      name: "run_process",
      arguments: {
        program: "node",
        args: ["missing-service.mjs"],
        cwd: ".",
        lifecycle: "service",
        readiness: {
          url: `http://127.0.0.1:${port}/health`,
          expectedStatus: 200,
          timeoutMs: 10_000,
        },
      },
    };
  }
  if (scenario === "approval-allow" && completion === 1) return { name: "run_process", arguments: { program: "pnpm", args: ["run", "approved"], cwd: ".", timeoutMs: 120000 } };
  if (scenario === "approval-reject" && completion === 1) return { name: "run_process", arguments: { program: "pnpm", args: ["run", "approved"], cwd: ".", timeoutMs: 120000 } };
  if (scenario === "slow-cancel" && completion === 1) return { name: "run_process", arguments: { program: "pnpm", args: ["run", "slow"], cwd: ".", timeoutMs: 120000 } };
  if (scenario === "plan-slug-fix") {
    if (completion === 1) return { name: "read_file", arguments: { path: "src/slug.mjs", startLine: 1, endLine: 5 } };
    if (completion === 3) {
      return {
        name: "replace_in_file",
        arguments: {
          path: "src/slug.mjs",
          oldText: 'return value.toLowerCase().replace(" ", "-");',
          newText: 'return value.trim().toLowerCase().replace(/\\s+/g, "-");',
        },
      };
    }
    if (completion === 4) return { name: "run_process", arguments: { program: "pnpm", args: ["test"], cwd: ".", timeoutMs: 120000 } };
  }
  if (scenario === "plan-danger" && completion === 2) return { name: "run_process", arguments: { program: "pnpm", args: ["run", "approved"], cwd: ".", timeoutMs: 120000 } };
  if (scenario === "english-tool-narrative" && completion === 1) {
    return { name: "read_file", arguments: { path: "README.md", startLine: 1 } };
  }
  return undefined;
}

function convergenceTools(
  completion: number,
  requestBody: Record<string, unknown>,
): Array<{ name: string; arguments: Record<string, unknown> }> | undefined {
  const backendPort = requestedPort(requestBody, "BACKEND_PORT");
  const frontendPort = requestedPort(requestBody, "FRONTEND_PORT");
  if (backendPort === undefined || frontendPort === undefined) return undefined;
  if (completion === 1) return [{ name: "list_directory", arguments: { path: "stage26-app", depth: 2, limit: 50 } }];
  if (completion === 2) return [
    { name: "write_file", arguments: { path: "stage26-app/server/package.json", content: CONVERGENCE_SERVER_PACKAGE } },
    { name: "write_file", arguments: { path: "stage26-app/server/health.test.mjs", content: CONVERGENCE_SERVER_TEST } },
    { name: "write_file", arguments: { path: "stage26-app/client/package.json", content: CONVERGENCE_CLIENT_PACKAGE } },
    { name: "write_file", arguments: { path: "stage26-app/client/title.test.mjs", content: CONVERGENCE_CLIENT_TEST } },
  ];
  if (completion === 3 || completion === 5) return [
    { name: "run_process", arguments: { program: "npm", args: ["test"], cwd: "stage26-app/server", timeoutMs: 120_000 } },
    { name: "run_process", arguments: { program: "npm", args: ["test"], cwd: "stage26-app/client", timeoutMs: 120_000 } },
  ];
  if (completion === 4) return [
    { name: "write_file", arguments: { path: "stage26-app/server/health.mjs", content: CONVERGENCE_HEALTH } },
    { name: "write_file", arguments: { path: "stage26-app/server/backend.mjs", content: CONVERGENCE_BACKEND } },
    { name: "write_file", arguments: { path: "stage26-app/client/title.mjs", content: CONVERGENCE_TITLE } },
    { name: "write_file", arguments: { path: "stage26-app/client/frontend.mjs", content: CONVERGENCE_FRONTEND } },
    { name: "write_file", arguments: { path: "stage26-app/scripts/smoke-api.mjs", content: CONVERGENCE_SMOKE } },
  ];
  if (completion === 6) return [{ name: "run_process", arguments: { program: "node", args: ["backend.mjs", String(backendPort)], cwd: "stage26-app/server", lifecycle: "service", readiness: { url: `http://127.0.0.1:${backendPort}/api/health`, expectedStatus: 200, timeoutMs: 30_000 } } }];
  if (completion === 7) return [{ name: "run_process", arguments: { program: "node", args: ["smoke-api.mjs", String(backendPort)], cwd: "stage26-app/scripts", timeoutMs: 30_000 } }];
  if (completion === 8) return [{ name: "run_process", arguments: { program: "node", args: ["frontend.mjs", String(frontendPort), String(backendPort)], cwd: "stage26-app/client", lifecycle: "service", readiness: { url: `http://127.0.0.1:${frontendPort}/`, expectedStatus: 200, timeoutMs: 30_000 } } }];
  return undefined;
}

export async function startFakeModelServer(): Promise<FakeModelServer> {
  let scenario: FakeModelScenario = "idle";
  let completion = 0;
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") return json(response, 200, { ok: true });
      if (request.method === "POST" && request.url === "/scenario") {
        const value = await body(request);
        const requested = value.scenario;
        const allowed: FakeModelScenario[] = ["idle", "slug-fix", "multi-scope-validation", "late-validation-script", "tdd-web-handoff", "convergence-efficient-web", "service-failure-soft-final", "approval-allow", "approval-reject", "slow-cancel", "provider-failure", "markdown-security", "plan-basic", "plan-long-markdown", "plan-slug-fix", "plan-danger", "english-final-retry", "english-plan-retry", "english-tool-narrative", "always-english", "english-retry-cancel"];
        if (typeof requested !== "string" || !allowed.includes(requested as FakeModelScenario)) return json(response, 400, { error: "invalid scenario" });
        scenario = requested as FakeModelScenario;
        completion = 0;
        return json(response, 200, { scenario });
      }
      if (request.method !== "POST" || request.url !== "/v1/chat/completions") return json(response, 404, { error: { message: "not found" } });
      const requestBody = await body(request);
      completion += 1;
      if (scenario === "provider-failure") return json(response, 500, { error: { message: "finite fake provider failure" } });
      response.writeHead(200, { "cache-control": "no-cache", connection: "keep-alive", "content-type": "text/event-stream; charset=utf-8" });
      const id = `e2e-completion-${completion}`;
      if (scenario === "convergence-efficient-web") {
        const tools = convergenceTools(completion, requestBody);
        if (tools !== undefined) return streamTools(response, id, tools, completion);
      }
      const tool = selectedTool(scenario, completion, requestBody);
      if (tool !== undefined) {
        return streamTool(
          response,
          id,
          tool.name,
          tool.arguments,
          completion,
          scenario === "english-tool-narrative"
            ? "I will read the requested file before reporting the result."
            : undefined,
        );
      }
      if (scenario === "service-failure-soft-final") {
        return streamText(response, id, "服务仍未成功启动；当前按真实失败事实交付。 ");
      }
      if (scenario === "english-final-retry" && completion === 1) return streamText(response, id, "I inspected the project and the requested task is complete.");
      if (scenario === "english-final-retry") return streamText(response, id, "已检查项目，请求的任务已经完成。");
      if (scenario === "english-plan-retry" && completion === 1) return streamText(response, id, "I will inspect the project, make the smallest change, and run the tests.");
      if (scenario === "english-plan-retry" && completion === 2) return streamText(response, id, "## 实施计划\n\n1. 只读检查项目事实。\n2. 完成最小修改。\n3. 运行测试并汇总结果。");
      if (scenario === "english-plan-retry") return streamText(response, id, "计划已经按批准内容执行完成。");
      if (scenario === "english-tool-narrative") return streamText(response, id, "已读取 README.md，并基于工具事实完成总结。");
      if (scenario === "always-english") return streamText(response, id, `The model keeps returning English prose for attempt ${completion}.`);
      if (scenario === "english-retry-cancel" && completion === 1) return streamText(response, id, "I will keep the next response open until the user cancels it.");
      if (scenario === "english-retry-cancel") return await holdStreamUntilCancelled(response);
      if (scenario === "markdown-security") return streamText(response, id, "安全内容 <script>window.evil=true</script> [危险](javascript:alert(1)) ![跟踪图](https://tracker.invalid/pixel.png)");
      if (scenario === "plan-basic" && completion === 1) return streamText(response, id, "## 实施计划\n\n1. 只读检查目标文件。\n2. 完成最小修改。\n3. 运行测试并报告结果。");
      if (scenario === "plan-long-markdown" && completion === 1) return streamText(response, id, longMarkdownPlan);
      if (scenario === "plan-long-markdown") return streamText(response, id, "长计划已经按批准内容执行完成。");
      if (scenario === "plan-slug-fix" && completion === 2) return streamText(response, id, "## Slug 修复计划\n\n1. 根据已读取源码定位缺陷。\n2. 最小替换 slugify 实现。\n3. 运行 pnpm test 验证。\n4. 汇总变更与测试事实。");
      if (scenario === "plan-slug-fix") return streamText(response, id, "计划执行完成：slugify 已修复，4/4 测试通过。");
      if (scenario === "plan-danger" && completion === 1) return streamText(response, id, "## 命令执行计划\n\n1. 请求运行有限验收脚本。\n2. 等待独立工具审批。\n3. 汇报输出。");
      if (scenario === "plan-danger") return streamText(response, id, "计划内命令已获独立审批并执行完成。");
      if (scenario === "slug-fix") return streamText(response, id, "修复完成：已读取实现、最小替换并运行测试，4/4 全部通过。");
      if (scenario === "multi-scope-validation" && completion === 4) return streamText(response, id, "后端验证完成。");
      if (scenario === "multi-scope-validation") return streamText(response, id, "前后端验证均已完成。");
      if (scenario === "late-validation-script" && completion === 5) return streamText(response, id, "直接 verify 脚本已覆盖其自身变更，任务完成。");
      if (scenario === "late-validation-script") return streamText(response, id, "已补充客户端认可测试，任务完成。");
      if (scenario === "tdd-web-handoff" && completion === 12) return streamText(response, id, "简单 TDD、构建检查和两个服务的就绪探测均已完成。");
      if (scenario === "tdd-web-handoff") {
        const backendPort = requestedPort(requestBody, "BACKEND_PORT");
        const frontendPort = requestedPort(requestBody, "FRONTEND_PORT");
        if (backendPort === undefined || frontendPort === undefined) return streamText(response, id, "端口信息缺失，无法完成交付。");
        return streamText(response, id, [
          "项目已启动并保持运行；测试经历了先失败、补最小实现、再通过，构建检查也已通过。",
          "",
          `- 启动后端：\`node backend.mjs ${backendPort}\``,
          `- 启动前端：\`node frontend.mjs ${frontendPort} ${backendPort}\``,
          `- API：[后端健康检查](http://127.0.0.1:${backendPort}/api/health)`,
          `- 页面：[打开 Stage 25 看板](http://127.0.0.1:${frontendPort}/)`,
        ].join("\n"));
      }
      if (scenario === "convergence-efficient-web") {
        const backendPort = requestedPort(requestBody, "BACKEND_PORT");
        const frontendPort = requestedPort(requestBody, "FRONTEND_PORT");
        if (backendPort === undefined || frontendPort === undefined) return streamText(response, id, "端口信息缺失，无法完成交付。");
        return streamText(response, id, [
          "Stage 26 看板已完成：server/client 均经历有效 RED 与 GREEN，并完成一次 API smoke；两个服务保持运行。",
          "",
          `- 启动后端：\`node backend.mjs ${backendPort}\``,
          `- 启动前端：\`node frontend.mjs ${frontendPort} ${backendPort}\``,
          `- API：[后端健康检查](http://127.0.0.1:${backendPort}/api/health)`,
          `- 页面：[打开 Stage 26 看板](http://127.0.0.1:${frontendPort}/)`,
          "- 限制：仅完成本地 loopback 验收。",
        ].join("\n"));
      }
      if (scenario === "approval-reject") return streamText(response, id, "审批已拒绝；未执行命令，任务安全结束。");
      if (scenario === "approval-allow") return streamText(response, id, "审批命令执行完成。");
      return streamText(response, id, "E2E 假模型已完成本轮响应。");
    } catch {
      if (!response.headersSent) json(response, 500, { error: { message: "finite fake server error" } });
      else response.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake model port unavailable");
  return {
    port: address.port,
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
