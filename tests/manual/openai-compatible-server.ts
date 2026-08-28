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
  const last = body.messages.at(-1);
  if (last === null || Array.isArray(last) || typeof last !== "object") {
    return undefined;
  }
  const role = (last as Record<string, unknown>).role;
  return typeof role === "string" ? role : undefined;
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

export async function startManualOpenAiCompatibleServer(): Promise<ManualServerHandle> {
  let completion = 0;
  let toolCall = 0;
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
      response.writeHead(200, {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
      });

      const completionId = `completion-${++completion}`;
      if (
        body.tools === undefined ||
        (Array.isArray(body.tools) && body.tools.length === 0)
      ) {
        streamText(response, completionId, "已压缩：保留各轮文件标记与已确认工具事实。");
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
