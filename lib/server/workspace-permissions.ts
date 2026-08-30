import type { WorkspacePermissionMode } from "@/lib/approval";
export { WORKSPACE_PERMISSION_MODES } from "@/lib/approval";

export type { WorkspacePermissionMode } from "@/lib/approval";

export interface WorkspacePermissionStore {
  get(workspacePath: string): WorkspacePermissionMode;
  set(workspacePath: string, mode: WorkspacePermissionMode): WorkspacePermissionMode;
}

export function createWorkspacePermissionStore(): WorkspacePermissionStore {
  const modes = new Map<string, WorkspacePermissionMode>();
  return {
    get(workspacePath) {
      return modes.get(workspacePath) ?? "ask";
    },
    set(workspacePath, mode) {
      modes.set(workspacePath, mode);
      return mode;
    },
  };
}
