import type { PublicSessionMetadata } from "./types";
import { segmentGraphemes } from "./typing";

export interface SessionWorkspaceGroup {
  workspacePath: string;
  label: string;
  sessions: PublicSessionMetadata[];
}

export interface ConfiguredModelOption {
  id: string;
  configured: boolean;
}

function pathParts(workspacePath: string): string[] {
  return workspacePath.split(/[\\/]+/u).filter((part) => part.length > 0);
}

export function workspaceBasename(workspacePath: string): string {
  const parts = pathParts(workspacePath);
  if (parts.length === 0) return workspacePath.startsWith("/") ? "/" : workspacePath;
  return parts.at(-1) ?? workspacePath;
}

export function foldWorkspacePath(workspacePath: string, visibleSegments = 2): string {
  const parts = pathParts(workspacePath);
  const count = Math.max(1, Math.floor(visibleSegments));
  if (parts.length <= count) {
    return `${workspacePath.startsWith("/") ? "/" : ""}${parts.join("/")}`;
  }
  return `…/${parts.slice(-count).join("/")}`;
}

export function groupSessionsByWorkspace(
  sessions: readonly PublicSessionMetadata[],
): SessionWorkspaceGroup[] {
  const groups = new Map<string, SessionWorkspaceGroup>();
  for (const session of sessions) {
    const existing = groups.get(session.workspacePath);
    if (existing !== undefined) {
      existing.sessions.push(session);
      continue;
    }
    groups.set(session.workspacePath, {
      workspacePath: session.workspacePath,
      label: workspaceBasename(session.workspacePath),
      sessions: [session],
    });
  }
  return [...groups.values()];
}

export function deriveSessionTitle(prompt: string, maximumGraphemes = 40): string | undefined {
  const firstLine = prompt
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstLine === undefined) return undefined;
  const graphemes = segmentGraphemes(firstLine);
  const maximum = Math.max(1, Math.floor(maximumGraphemes));
  if (graphemes.length <= maximum) return firstLine;
  return `${graphemes.slice(0, maximum).join("")}…`;
}

export function selectConfiguredModelId(
  models: readonly ConfiguredModelOption[],
  current?: string,
): string | undefined {
  if (current !== undefined && models.some((model) => model.id === current && model.configured)) {
    return current;
  }
  return models.find((model) => model.configured)?.id;
}
