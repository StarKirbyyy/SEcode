import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HOST = "127.0.0.1";
const MODEL = "secode-stage12-fixture";
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

interface ManualServerHandle {
  readonly baseUrl: string;
  readonly model: string;
  readonly contextWindow: number;
  readonly requestCount: number;
  close(): Promise<void>;
}

class RequestFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RequestFailure";
  }
}

function json(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      throw new RequestFailure(413, "request body too large");
    }
    chunks.push(buffer);
  }

  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestFailure(400, "request body is not valid JSON");
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new RequestFailure(400, "request body must be an object");
  }
  return value as Record<string, unknown>;
}

function lastMessageRole(body: Record<string, unknown>): string | undefined {
  if (!Array.isArray(body.messages)) return undefined;
  for (const item of [...body.messages].reverse()) {
    if (item === null || Array.isArray(item) || typeof item !== "object") continue;
    const role = (item as Record<string, unknown>).role;
    if (typeof role === "string" && role !== "system") return role;
  }
  return undefined;
}

function messages(body: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(body.messages)
    ? body.messages.filter((item): item is Record<string, unknown> =>
        item !== null && !Array.isArray(item) && typeof item === "object"
      )
    : [];
}

function hasSystemText(body: Record<string, unknown>, value: string): boolean {
  return messages(body).some((message) =>
    message.role === "system" &&
    typeof message.content === "string" &&
    message.content.includes(value)
  );
}

function hasMessageText(body: Record<string, unknown>, value: string): boolean {
  return messages(body).some((message) =>
    typeof message.content === "string" && message.content.includes(value)
  );
}

function hasChineseToolDescriptions(body: Record<string, unknown>): boolean {
  if (!Array.isArray(body.tools) || body.tools.length === 0) return false;
  return body.tools.every((tool) => {
    if (tool === null || Array.isArray(tool) || typeof tool !== "object") return false;
    const fn = (tool as Record<string, unknown>).function;
    if (fn === null || Array.isArray(fn) || typeof fn !== "object") return false;
    const definition = fn as Record<string, unknown>;
    if (
      typeof definition.description !== "string" ||
      !/[\u3400-\u9fff]/u.test(definition.description)
    ) return false;
    const parameters = definition.parameters;
    if (parameters === null || Array.isArray(parameters) || typeof parameters !== "object") {
      return false;
    }
    const properties = (parameters as Record<string, unknown>).properties;
    if (properties === null || Array.isArray(properties) || typeof properties !== "object") {
      return false;
    }
    return Object.values(properties).every((property) =>
      property !== null &&
      !Array.isArray(property) &&
      typeof property === "object" &&
      typeof (property as Record<string, unknown>).description === "string" &&
      /[\u3400-\u9fff]/u.test(
        (property as Record<string, unknown>).description as string,
      )
    );
  });
}

function hasAssistantTool(body: Record<string, unknown>, name: string): boolean {
  return messages(body).some((message) => {
    if (message.role !== "assistant" || !Array.isArray(message.tool_calls)) return false;
    return message.tool_calls.some((call) => {
      if (call === null || Array.isArray(call) || typeof call !== "object") return false;
      const fn = (call as Record<string, unknown>).function;
      return fn !== null && !Array.isArray(fn) && typeof fn === "object" &&
        (fn as Record<string, unknown>).name === name;
    });
  });
}

function event(response: ServerResponse, value: Record<string, unknown>): void {
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

function chunk(
  id: string,
  delta: Record<string, unknown>,
  finishReason: null | "stop" | "tool_calls",
): Record<string, unknown> {
  return {
    id,
    object: "chat.completion.chunk",
    created: 0,
    model: MODEL,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function streamText(response: ServerResponse, id: string, content: string): void {
  event(response, chunk(id, { role: "assistant" }, null));
  event(response, chunk(id, { content }, null));
  event(response, chunk(id, {}, "stop"));
}

function streamToolCall(response: ServerResponse, id: string, callId: string): void {
  event(
    response,
    chunk(
      id,
      {
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: callId,
            type: "function",
            function: { name: "read_file", arguments: "" },
          },
        ],
      },
      null,
    ),
  );
  event(
    response,
    chunk(
      id,
      {
        tool_calls: [
          {
            index: 0,
            function: { arguments: '{"path":"context/chunk.txt"}' },
          },
        ],
      },
      null,
    ),
  );
  event(response, chunk(id, {}, "tool_calls"));
}

function streamNamedToolCall(
  response: ServerResponse,
  id: string,
  callId: string,
  name: string,
  argumentsValue: Record<string, unknown>,
  content?: string,
): void {
  event(response, chunk(id, {
    role: "assistant",
    ...(content === undefined ? {} : { content }),
    tool_calls: [{
      index: 0,
      id: callId,
      type: "function",
      function: { name, arguments: JSON.stringify(argumentsValue) },
    }],
  }, null));
  event(response, chunk(id, {}, "tool_calls"));
}

export async function startManualOpenAiCompatibleServer(): Promise<ManualServerHandle> {
  let completion = 0;
  let toolCall = 0;
  let transientEnvelopeServed = false;
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        json(response, 200, { ok: true });
        return;
      }
      if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
        json(response, 404, { error: { message: "not found" } });
        return;
      }

      const body = await readJsonBody(request);
      if (!Array.isArray(body.messages)) {
        throw new RequestFailure(400, "messages must be an array");
      }
      const phaseRequest = [
        "当前阶段：规划",
        "当前阶段：已批准执行",
        "当前阶段：正常执行",
      ].some((phase) => hasSystemText(body, phase));
      if (phaseRequest && !hasChineseToolDescriptions(body)) {
        throw new RequestFailure(400, "phase request tools require Chinese descriptions");
      }
      response.writeHead(200, {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
      });

      const completionId = `completion-${++completion}`;
      if (hasMessageText(body, "SECODE_TRANSIENT_ENVELOPE") && !transientEnvelopeServed) {
        transientEnvelopeServed = true;
        event(response, {
          error: {
            type: "server_error",
            code: "service_unavailable",
            message: "PRIVATE_FIXTURE_PROVIDER_MESSAGE",
          },
        });
      } else if (
        body.tools === undefined ||
        (Array.isArray(body.tools) && body.tools.length === 0)
      ) {
        streamText(response, completionId, "已压缩：保留各轮文件标记与已确认工具事实。");
      } else if (hasSystemText(body, "当前阶段：规划")) {
        if (hasMessageText(body, "SECODE_ENGLISH_PLAN")) {
          streamText(
            response,
            completionId,
            hasSystemText(body, "上一条可见正文不符合输出语言强制策略")
              ? "计划：先检查项目事实，再完成最小修改，最后运行相关测试。"
              : "I will inspect the project, make the smallest change, and run the tests.",
          );
        } else if (lastMessageRole(body) === "tool") {
          streamText(response, completionId, "目标理解：在临时项目中创建验收标记并验证现有测试。\n观察事实：已读取 README.md，项目禁止安装依赖和 Git 提交。\n涉及文件：新增 notes/plan-result.txt；不修改其他源码。\n任务顺序：1. 创建标记文件；2. 运行 pnpm test；3. 汇总真实结果。\n逐步验证：写入后由工具结果确认，随后以 pnpm test 退出码确认。\n风险：仅修改临时工作区；测试命令仍受既有进程策略约束。\n明确不执行：不安装依赖、不提交 Git、不删除文件。");
        } else {
          streamNamedToolCall(response, completionId, `plan-read-${++toolCall}`, "read_file", { path: "README.md", startLine: 1 });
        }
      } else if (hasSystemText(body, "当前阶段：已批准执行")) {
        if (!hasAssistantTool(body, "write_file")) {
          streamNamedToolCall(response, completionId, `execute-write-${++toolCall}`, "write_file", { path: "notes/plan-result.txt", content: "stage17 approved execution\n" });
        } else if (!hasAssistantTool(body, "run_process")) {
          streamNamedToolCall(response, completionId, `execute-test-${++toolCall}`, "run_process", { program: "pnpm", args: ["test"], cwd: ".", timeoutMs: 120000 });
        } else {
          streamText(response, completionId, "已按批准计划创建 notes/plan-result.txt，并运行 pnpm test 完成验证。未安装依赖、未提交 Git。");
        }
      } else if (hasSystemText(body, "当前阶段：正常执行")) {
        if (hasMessageText(body, "SECODE_ALWAYS_ENGLISH")) {
          streamText(response, completionId, "The response remains entirely in English.");
        } else if (hasMessageText(body, "SECODE_ENGLISH_FINAL")) {
          streamText(
            response,
            completionId,
            hasSystemText(body, "上一条可见正文不符合输出语言强制策略")
              ? "已完成中文重述，未执行任何额外工具。"
              : "I inspected the repository and completed the requested task.",
          );
        } else if (
          hasMessageText(body, "SECODE_ENGLISH_TOOL_NARRATIVE") &&
          lastMessageRole(body) !== "tool"
        ) {
          streamNamedToolCall(
            response,
            completionId,
            `english-tool-${++toolCall}`,
            "read_file",
            { path: "README.md", startLine: 1 },
            "I will inspect the README before continuing.",
          );
        } else if (lastMessageRole(body) === "tool") {
          streamText(response, completionId, "正常模式已直接读取 README.md 并完成任务；没有生成计划审批事件。");
        } else {
          streamNamedToolCall(response, completionId, `normal-read-${++toolCall}`, "read_file", { path: "README.md", startLine: 1 });
        }
      } else if (lastMessageRole(body) === "tool") {
        streamText(response, completionId, "已读取并确认本轮文件事实。");
      } else {
        streamToolCall(response, completionId, `call-${++toolCall}`);
      }
      response.end("data: [DONE]\n\n");
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      const failure = error instanceof RequestFailure
        ? error
        : new RequestFailure(500, "internal test server error");
      json(response, failure.status, { error: { message: failure.message } });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("test server did not receive an IP port");
  }

  let closed = false;
  return Object.freeze({
    baseUrl: `http://${HOST}:${address.port}/v1`,
    model: MODEL,
    contextWindow: 14_000,
    get requestCount() {
      return completion;
    },
    async close() {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

async function runMain(): Promise<void> {
  const handle = await startManualOpenAiCompatibleServer();
  process.stdout.write(`OPENAI_COMPAT_BASE_URL=${handle.baseUrl}\n`);
  process.stdout.write(`OPENAI_COMPAT_MODEL=${handle.model}\n`);
  process.stdout.write(`OPENAI_COMPAT_CONTEXT_WINDOW=${handle.contextWindow}\n`);
  process.stdout.write("OPENAI_COMPAT_SUPPORTS_THINKING=false\n");

  await new Promise<void>((resolve, reject) => {
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      void handle.close().then(resolve, reject);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

if (isMainModule()) {
  void runMain().catch(() => {
    process.stderr.write("stage 12 test server failed\n");
    process.exitCode = 1;
  });
}
