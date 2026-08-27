export {
  createWorkspaceHandle,
  resolveExistingWorkspacePath,
  resolveWritableWorkspacePath,
  revalidateWritableWorkspacePath,
} from "./boundary";
export {
  MAX_WORKSPACE_PATH_BYTES,
  normalizeWorkspaceRelativePath,
} from "./path-input";
export {
  WORKSPACE_ERROR_CODES,
  WorkspaceLayerError,
  type ExistingWorkspacePath,
  type ExpectedWorkspaceEntryKind,
  type ResolveExistingOptions,
  type ResolveWritableOptions,
  type WorkspaceEntryKind,
  type WorkspaceErrorCode,
  type WorkspaceHandle,
  type WritableWorkspacePath,
} from "./types";
