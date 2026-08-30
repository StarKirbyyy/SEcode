import type { ZodType } from "zod";

import {
  ApiErrorEnvelopeSchema,
  ApprovalResponseSchema,
  BrowseWorkspaceResponseSchema,
  CancelResponseSchema,
  ConfigResponseSchema,
  CreatedSessionResponseSchema,
  DeletedSessionResponseSchema,
  EventPageResponseSchema,
  PlanApprovalResponseSchema,
  RecentWorkspacesResponseSchema,
  SessionsResponseSchema,
  ValidateWorkspaceResponseSchema,
  WorkspacePermissionResponseSchema,
} from "./schemas";
import type {
  ApprovalInput,
  ApprovalResponse,
  BrowseWorkspaceResponse,
  CancelResponse,
  ClientConfig,
  CreateSessionInput,
  CreatedSession,
  DeletedSessionResponse,
  EventPageResponse,
  PlanApprovalInput,
  PlanApprovalResponse,
  RecentWorkspaces,
  SessionsResponse,
  StartRunInput,
  UiErrorCode,
  ValidatedWorkspace,
  WorkspacePermission,
} from "./types";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class UiClientError extends Error {
  readonly code: UiErrorCode;
  readonly recoverable: boolean;
  readonly status?: number;

  constructor(code: UiErrorCode, message: string, recoverable: boolean, status?: number) {
    super(message);
    Object.defineProperty(this, "name", { value: "UiClientError" });
    this.code = code;
    this.recoverable = recoverable;
    if (status !== undefined) this.status = status;
    Object.defineProperty(this, "message", { enumerable: true, value: message });
  }
}

function responseInvalid(): UiClientError {
  return new UiClientError(
    "UI_RESPONSE_INVALID",
    "服务端响应不符合预期协议",
    true,
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) throw responseInvalid();
  try {
    return JSON.parse(await response.text()) as unknown;
  } catch {
    throw responseInvalid();
  }
}

export interface ApiClient {
  getConfig(signal?: AbortSignal): Promise<ClientConfig>;
  getRecentWorkspaces(signal?: AbortSignal): Promise<RecentWorkspaces>;
  getSessions(signal?: AbortSignal): Promise<SessionsResponse>;
  browseWorkspaces(segments: string[], signal?: AbortSignal): Promise<BrowseWorkspaceResponse>;
  validateWorkspace(workspacePath: string, signal?: AbortSignal): Promise<ValidatedWorkspace>;
  getWorkspacePermission(workspacePath: string, signal?: AbortSignal): Promise<WorkspacePermission>;
  setWorkspacePermission(workspacePath: string, mode: "ask" | "full", signal?: AbortSignal): Promise<WorkspacePermission>;
  createSession(input: CreateSessionInput, signal?: AbortSignal): Promise<CreatedSession>;
  deleteSession(sessionId: string, signal?: AbortSignal): Promise<DeletedSessionResponse>;
  getEvents(sessionId: string, after?: number, signal?: AbortSignal): Promise<EventPageResponse>;
  startRun(sessionId: string, prompt: string, input?: StartRunInput, signal?: AbortSignal): Promise<Response>;
  resolveApproval(runId: string, approvalId: string, input: ApprovalInput, signal?: AbortSignal): Promise<ApprovalResponse>;
  resolvePlanApproval(runId: string, approvalId: string, input: PlanApprovalInput, signal?: AbortSignal): Promise<PlanApprovalResponse>;
  cancelRun(runId: string, reason?: string, signal?: AbortSignal): Promise<CancelResponse>;
}

export function createApiClient(options: { fetcher?: Fetcher } = {}): ApiClient {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);

  const request = async <T>(
    pathname: string,
    schema: ZodType<T>,
    init: RequestInit = {},
  ): Promise<T> => {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    let response: Response;
    try {
      response = await fetcher(pathname, { ...init, headers });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new UiClientError("UI_OPERATION_ABORTED", "操作已取消", true);
      }
      throw new UiClientError("UI_NETWORK_ERROR", "无法连接本地 SEcode 服务", true);
    }
    const value = await parseJson(response);
    if (!response.ok) {
      const parsedError = ApiErrorEnvelopeSchema.safeParse(value);
      if (!parsedError.success) throw responseInvalid();
      throw new UiClientError(
        parsedError.data.error.code,
        parsedError.data.error.message,
        parsedError.data.error.recoverable,
        response.status,
      );
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw responseInvalid();
    return parsed.data;
  };

  const jsonBody = (value: unknown): Pick<RequestInit, "body" | "method"> => ({
    method: "POST",
    body: JSON.stringify(value),
  });

  return {
    getConfig: (signal) => request("/api/config", ConfigResponseSchema, { signal }),
    getRecentWorkspaces: (signal) => request("/api/workspaces/recent", RecentWorkspacesResponseSchema, { signal }),
    getSessions: (signal) => request("/api/sessions", SessionsResponseSchema, { signal }),
    browseWorkspaces: (segments, signal) => request("/api/workspaces/browse", BrowseWorkspaceResponseSchema, { ...jsonBody({ segments }), signal }),
    validateWorkspace: (workspacePath, signal) => request("/api/workspaces/validate", ValidateWorkspaceResponseSchema, { ...jsonBody({ path: workspacePath }), signal }),
    getWorkspacePermission: (workspacePath, signal) => request(`/api/workspaces/permission?path=${encodeURIComponent(workspacePath)}`, WorkspacePermissionResponseSchema, { signal }),
    setWorkspacePermission: (workspacePath, mode, signal) => request("/api/workspaces/permission", WorkspacePermissionResponseSchema, { ...jsonBody({ path: workspacePath, mode }), signal }),
    createSession: (input, signal) => request("/api/sessions", CreatedSessionResponseSchema, { ...jsonBody(input), signal }),
    deleteSession: (sessionId, signal) => request(
      `/api/sessions/${encodeURIComponent(sessionId)}`,
      DeletedSessionResponseSchema,
      { method: "DELETE", signal },
    ),
    getEvents: (sessionId, after = 0, signal) => request(`/api/sessions/${encodeURIComponent(sessionId)}/events?after=${after}`, EventPageResponseSchema, { signal }),
    async startRun(sessionId, prompt, input = {}, signal) {
      const headers = new Headers({
        Accept: "application/x-ndjson",
        "Content-Type": "application/json",
      });
      let response: Response;
      try {
        response = await fetcher(`/api/sessions/${encodeURIComponent(sessionId)}/runs`, {
          method: "POST",
          headers,
          body: JSON.stringify({ prompt, planningEnabled: input.planningEnabled ?? false }),
          signal,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new UiClientError("UI_OPERATION_ABORTED", "操作已取消", true);
        }
        throw new UiClientError("UI_NETWORK_ERROR", "无法连接本地 SEcode 服务", true);
      }
      if (!response.ok) {
        const value = await parseJson(response);
        const parsed = ApiErrorEnvelopeSchema.safeParse(value);
        if (!parsed.success) throw responseInvalid();
        throw new UiClientError(parsed.data.error.code, parsed.data.error.message, parsed.data.error.recoverable, response.status);
      }
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.startsWith("application/x-ndjson") || response.body === null) throw responseInvalid();
      return response;
    },
    resolveApproval: (runId, approvalId, input, signal) => request(`/api/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}`, ApprovalResponseSchema, { ...jsonBody(input), signal }),
    resolvePlanApproval: (runId, approvalId, input, signal) => request(`/api/runs/${encodeURIComponent(runId)}/plans/${encodeURIComponent(approvalId)}`, PlanApprovalResponseSchema, { ...jsonBody(input), signal }),
    cancelRun: (runId, reason, signal) => request(`/api/runs/${encodeURIComponent(runId)}`, CancelResponseSchema, { method: "DELETE", body: JSON.stringify(reason === undefined ? {} : { reason }), signal }),
  };
}
