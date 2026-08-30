import type { z } from "zod";

import type {
  ApprovalResponseSchema,
  BrowseWorkspaceResponseSchema,
  CancelResponseSchema,
  ConfigResponseSchema,
  CreatedSessionResponseSchema,
  DeletedSessionResponseSchema,
  EventPageResponseSchema,
  PlanApprovalResponseSchema,
  PublicSessionMetadataSchema,
  RecentWorkspacesResponseSchema,
  SessionsResponseSchema,
  ValidateWorkspaceResponseSchema,
  WorkspacePermissionResponseSchema,
} from "./schemas";

export type ClientConfig = z.infer<typeof ConfigResponseSchema>;
export type RecentWorkspaces = z.infer<typeof RecentWorkspacesResponseSchema>;
export type PublicSessionMetadata = z.infer<typeof PublicSessionMetadataSchema>;
export type SessionsResponse = z.infer<typeof SessionsResponseSchema>;
export type ValidatedWorkspace = z.infer<typeof ValidateWorkspaceResponseSchema>;
export type WorkspacePermission = z.infer<typeof WorkspacePermissionResponseSchema>;
export type CreatedSession = z.infer<typeof CreatedSessionResponseSchema>;
export type DeletedSessionResponse = z.infer<typeof DeletedSessionResponseSchema>;
export type EventPageResponse = z.infer<typeof EventPageResponseSchema>;
export type BrowseWorkspaceResponse = z.infer<typeof BrowseWorkspaceResponseSchema>;
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;
export type PlanApprovalResponse = z.infer<typeof PlanApprovalResponseSchema>;
export type CancelResponse = z.infer<typeof CancelResponseSchema>;

export type UiErrorCode =
  | "UI_NETWORK_ERROR"
  | "UI_RESPONSE_INVALID"
  | "UI_STREAM_INVALID"
  | "UI_STREAM_ENDED_EARLY"
  | "UI_OPERATION_ABORTED"
  | string;

export interface CreateSessionInput {
  workspacePath: string;
  modelProfileId: string;
  title?: string;
}

export interface ApprovalInput {
  approved: boolean;
  reason?: string;
}

export interface StartRunInput {
  planningEnabled?: boolean;
}

export interface PlanApprovalInput {
  planId: string;
  approved: boolean;
  reason?: string;
}
