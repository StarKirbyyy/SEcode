import type { ErrorInfo, JsonValue } from "@/lib/domain";
import type { ZodType } from "zod";

import { createServerError, statusForErrorInfo, toPublicErrorInfo } from "./errors";
import { MAX_API_JSON_BODY_BYTES } from "./schemas";
import type { ApiErrorEnvelope } from "./types";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const JSON_RESPONSE_HEADERS = {
  "Cache-Control": "no-store, no-transform",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

export const NDJSON_RESPONSE_HEADERS = {
  "Cache-Control": "no-store, no-transform",
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

function requestUrl(request: Request): URL {
  try {
    return new URL(request.url);
  } catch (cause) {
    throw createServerError(
      "API_HOST_FORBIDDEN",
      "请求地址无效",
      false,
      undefined,
      cause,
    );
  }
}

export function assertLocalRequest(request: Request): void {
  const url = requestUrl(request);
  if (!LOCAL_HOSTNAMES.has(url.hostname)) {
    throw createServerError("API_HOST_FORBIDDEN", "仅允许本机访问", false);
  }
}

export function assertMutationOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin === null) return;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch (cause) {
    throw createServerError(
      "API_ORIGIN_FORBIDDEN",
      "请求来源无效",
      false,
      undefined,
      cause,
    );
  }
  if (parsed.origin !== requestUrl(request).origin) {
    throw createServerError("API_ORIGIN_FORBIDDEN", "不允许跨源修改", false);
  }
}

function assertJsonContentType(request: Request): void {
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (type !== "application/json") {
    throw createServerError(
      "API_CONTENT_TYPE_UNSUPPORTED",
      "请求体必须使用 application/json",
      true,
    );
  }
}

async function readBoundedBytes(request: Request, maximumBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maximumBytes) {
    throw createServerError("API_REQUEST_TOO_LARGE", "请求体超过大小限制", true);
  }
  if (request.body === null) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel();
        throw createServerError("API_REQUEST_TOO_LARGE", "请求体超过大小限制", true);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  options: { allowEmpty?: boolean } = {},
): Promise<T> {
  if (options.allowEmpty && request.body === null) return schema.parse({});
  assertJsonContentType(request);
  const bytes = await readBoundedBytes(request, MAX_API_JSON_BODY_BYTES);
  if (bytes.byteLength === 0) {
    if (options.allowEmpty) return schema.parse({});
    throw createServerError("API_REQUEST_INVALID", "请求体不能为空", true);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw createServerError("API_REQUEST_INVALID", "请求体不是有效 UTF-8", true, undefined, cause);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw createServerError("API_REQUEST_INVALID", "请求体不是有效 JSON", true, undefined, cause);
  }
  return schema.parse(value);
}

export function searchParamsObject(url: URL): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (Object.hasOwn(output, key)) {
      throw createServerError("API_REQUEST_INVALID", "查询参数不能重复", true, { field: key });
    }
    output[key] = value;
  }
  return output;
}

export function jsonResponse(value: JsonValue | object, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const forbidden of [
    "access-control-allow-origin",
    "authorization",
    "cookie",
    "set-cookie",
  ]) headers.delete(forbidden);
  for (const [key, headerValue] of Object.entries(JSON_RESPONSE_HEADERS)) headers.set(key, headerValue);
  return new Response(JSON.stringify(value), { ...init, headers });
}

export function apiErrorResponse(error: unknown): Response {
  const info = toPublicErrorInfo(error);
  return apiErrorInfoResponse(info);
}

export function apiErrorInfoResponse(info: ErrorInfo): Response {
  const body: ApiErrorEnvelope = { error: info };
  return jsonResponse(body, { status: statusForErrorInfo(info) });
}

export async function handleApiRequest(
  request: Request,
  mutation: boolean,
  handler: () => Promise<Response> | Response,
): Promise<Response> {
  try {
    assertLocalRequest(request);
    if (mutation) assertMutationOrigin(request);
    return await handler();
  } catch (error) {
    return apiErrorResponse(error);
  }
}
