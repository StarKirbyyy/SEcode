import { createHash } from "node:crypto";
import path from "node:path";

import { redactSecrets, truncateUtf8, type ToolResult } from "@/lib/domain";
import type { PreparedLocalToolInvocation } from "@/lib/tools";

import {
  classifyVerificationCommand,
  type VerificationKind,
} from "./completion-evidence";

const MAX_EPISODES = 8;
const MAX_PATHS = 12;
const MAX_PATH_CODE_POINTS = 256;
const MAX_PATHS_CODE_POINTS = 2_048;

interface RepairEpisode {
  fingerprint: string;
  failedAttempts: number;
  repeatedCount: number;
  mutationObservedBetweenRepeats: boolean;
  mutationsSinceFailure: Set<string>;
}

export interface ValidationRepairState {
  readonly episodes: Map<string, RepairEpisode>;
}

export type ValidationRepairObservation =
  | Readonly<{ kind: "ignored" }>
  | Readonly<{ kind: "mutation" }>
  | Readonly<{ kind: "validator_success"; verificationKind: VerificationKind; cwd: string }>
  | Readonly<{
      kind: "validator_failure";
      verificationKind: VerificationKind;
      cwd: string;
      failedAttempts: number;
      repeatedDiagnostic: boolean;
      mutatedPaths: string[];
      mutatedPathCount: number;
      mutatedPathsTruncated: boolean;
      warning: boolean;
      shouldFail: boolean;
    }>;

export function createValidationRepairState(): ValidationRepairState {
  return { episodes: new Map() };
}

function normalizedRelative(value: string): string {
  return path.posix.normalize(value.replaceAll("\\", "/")).replace(/^\.\//u, "") || ".";
}

function safePublicPath(value: string): string | undefined {
  const normalized = normalizedRelative(value);
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) return undefined;
  return [...normalized].slice(0, MAX_PATH_CODE_POINTS).join("");
}

function boundedPaths(values: Iterable<string>): {
  paths: string[];
  count: number;
  truncated: boolean;
} {
  const all = [...new Set(values)].sort((left, right) => left.localeCompare(right));
  const paths: string[] = [];
  let length = 0;
  for (const value of all) {
    const candidate = safePublicPath(value);
    if (candidate === undefined || paths.length >= MAX_PATHS) break;
    const nextLength = length + (paths.length === 0 ? 0 : 1) + [...candidate].length;
    if (nextLength > MAX_PATHS_CODE_POINTS) break;
    paths.push(candidate);
    length = nextLength;
  }
  return { paths, count: all.length, truncated: paths.length < all.length };
}

function validatorKey(invocation: Extract<PreparedLocalToolInvocation, { name: "run_process" }>): string {
  return JSON.stringify([
    path.posix.basename(invocation.arguments.program).toLowerCase(),
    invocation.arguments.args,
    normalizedRelative(invocation.arguments.cwd),
  ]);
}

function diagnosticFingerprint(result: ToolResult): string {
  const diagnostic = truncateUtf8(
    redactSecrets(`${result.error?.code ?? "UNKNOWN"}\n${result.summary}\n${result.output ?? ""}`),
    8_192,
  ).value;
  return createHash("sha256").update(diagnostic).digest("hex");
}

function pruneEpisodes(state: ValidationRepairState): void {
  while (state.episodes.size > MAX_EPISODES) {
    const oldest = state.episodes.keys().next().value as string | undefined;
    if (oldest === undefined) return;
    state.episodes.delete(oldest);
  }
}

export function recordValidationRepairToolResult(
  state: ValidationRepairState,
  invocation: PreparedLocalToolInvocation,
  result: ToolResult,
): ValidationRepairObservation {
  if (
    result.ok &&
    (invocation.name === "write_file" || invocation.name === "replace_in_file")
  ) {
    for (const episode of state.episodes.values()) {
      episode.mutationsSinceFailure.add(invocation.arguments.path);
    }
    return { kind: "mutation" };
  }
  if (invocation.name !== "run_process") return { kind: "ignored" };
  if ((invocation.arguments.lifecycle ?? "oneshot") !== "oneshot") return { kind: "ignored" };
  const verificationKind = classifyVerificationCommand(
    invocation.arguments.program,
    invocation.arguments.args,
  );
  if (verificationKind === undefined) return { kind: "ignored" };
  const cwd = normalizedRelative(invocation.arguments.cwd);
  const key = validatorKey(invocation);
  if (result.ok) {
    state.episodes.delete(key);
    return { kind: "validator_success", verificationKind, cwd };
  }

  const fingerprint = diagnosticFingerprint(result);
  const previous = state.episodes.get(key);
  const repeatedDiagnostic = previous?.fingerprint === fingerprint;
  const mutations = previous?.mutationsSinceFailure ?? new Set<string>();
  const mutationObservedBetweenRepeats = repeatedDiagnostic
    ? (previous?.mutationObservedBetweenRepeats === true || mutations.size > 0)
    : false;
  const episode: RepairEpisode = {
    fingerprint,
    failedAttempts: (previous?.failedAttempts ?? 0) + 1,
    repeatedCount: repeatedDiagnostic ? (previous?.repeatedCount ?? 1) + 1 : 1,
    mutationObservedBetweenRepeats,
    mutationsSinceFailure: new Set(),
  };
  state.episodes.delete(key);
  state.episodes.set(key, episode);
  pruneEpisodes(state);
  const bounded = boundedPaths(mutations);
  return {
    kind: "validator_failure",
    verificationKind,
    cwd,
    failedAttempts: episode.failedAttempts,
    repeatedDiagnostic,
    mutatedPaths: bounded.paths,
    mutatedPathCount: bounded.count,
    mutatedPathsTruncated: bounded.truncated,
    warning: episode.failedAttempts >= 2,
    shouldFail: episode.repeatedCount >= 3 && episode.mutationObservedBetweenRepeats,
  };
}
