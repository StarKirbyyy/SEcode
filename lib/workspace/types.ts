import {
  ErrorInfoSchema,
  type ErrorInfo,
  type JsonObject,
} from "@/lib/domain";
import { z } from "zod";

export const WORKSPACE_ERROR_CODES = [
  "WORKSPACE_INPUT_INVALID",
  "WORKSPACE_ROOT_NOT_ABSOLUTE",
  "WORKSPACE_ROOT_NOT_FOUND",
  "WORKSPACE_ROOT_NOT_DIRECTORY",
  "WORKSPACE_ROOT_TOO_BROAD",
  "WORKSPACE_ACCESS_DENIED",
  "WORKSPACE_CHANGED",
  "WORKSPACE_PATH_INVALID",
  "WORKSPACE_PATH_NOT_FOUND",
  "WORKSPACE_PATH_TYPE_MISMATCH",
  "WORKSPACE_PATH_ESCAPE",
  "WORKSPACE_SYMLINK_ESCAPE",
  "WORKSPACE_PARENT_NOT_FOUND",
  "WORKSPACE_EXISTING_TARGET_DENIED",
  "WORKSPACE_FINAL_SYMLINK_WRITE_DENIED",
  "WORKSPACE_PATH_CHANGED",
  "WORKSPACE_IO_ERROR",
] as const;

export type WorkspaceErrorCode = (typeof WORKSPACE_ERROR_CODES)[number];
export type WorkspaceEntryKind = "file" | "directory" | "other";
export type ExpectedWorkspaceEntryKind =
  | "file"
  | "directory"
  | "any";

declare const workspaceHandleBrand: unique symbol;
declare const writableWorkspacePathBrand: unique symbol;

export interface WorkspaceHandle {
  readonly rootPath: string;
  readonly [workspaceHandleBrand]: true;
}

export interface ExistingWorkspacePath {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly kind: WorkspaceEntryKind;
  readonly followedSymbolicLink: boolean;
}

export interface WritableWorkspacePath {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly parentPath: string;
  readonly existed: boolean;
  readonly kind?: WorkspaceEntryKind;
  readonly [writableWorkspacePathBrand]: true;
}

export interface ResolveExistingOptions {
  expectedKind?: ExpectedWorkspaceEntryKind;
}

export interface ResolveWritableOptions {
  allowExisting?: boolean;
}

export type WorkspaceErrorDetails = JsonObject & {
  field?: string;
  reason?: string;
  relativePath?: string;
  expectedKind?: string;
  actualKind?: string;
};

const WorkspaceErrorDetailsSchema = z.strictObject({
  field: z.string().optional(),
  reason: z.string().optional(),
  relativePath: z.string().optional(),
  expectedKind: z.string().optional(),
  actualKind: z.string().optional(),
});

export class WorkspaceLayerError extends Error {
  readonly error: ErrorInfo;
  declare readonly cause: unknown;

  constructor(error: ErrorInfo, cause?: unknown) {
    const parsed = ErrorInfoSchema.parse(error);
    super(parsed.message);
    this.name = "WorkspaceLayerError";
    this.error = parsed;
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

export function createWorkspaceError(
  code: WorkspaceErrorCode,
  message: string,
  recoverable: boolean,
  details?: WorkspaceErrorDetails,
  cause?: unknown,
): WorkspaceLayerError {
  const parsedDetails =
    details === undefined ? undefined : WorkspaceErrorDetailsSchema.parse(details);
  return new WorkspaceLayerError(
    {
      code,
      message,
      recoverable,
      ...(parsedDetails === undefined ? {} : { details: parsedDetails }),
    },
    cause,
  );
}
