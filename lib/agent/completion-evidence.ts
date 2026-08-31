import path from "node:path";

import { redactSecrets, type ToolResult } from "@/lib/domain";
import type { PreparedLocalToolInvocation } from "@/lib/tools";

export type VerificationKind = "lint" | "typecheck" | "test" | "build";

export interface UncoveredCompletionEvidence {
  scopes: string[];
  paths: string[];
  totalPaths: number;
  pathsTruncated: boolean;
}

const MAX_UNCOVERED_PATHS = 12;
const MAX_UNCOVERED_PATH_CODE_POINTS = 256;
const MAX_UNCOVERED_PATHS_CODE_POINTS = 2_048;

export interface CompletionEvidenceState {
  lastRelevantMutationSeq?: number;
  pendingValidation: boolean;
  verifiedAfterMutation: VerificationKind[];
  correctionAttempts: number;
  /** Run-local implementation detail; never persisted or exposed as authority. */
  relevantMutationPaths: string[];
  /** Latest unverified mutation sequence by normalized relative path. */
  readonly pendingMutations: Map<string, number>;
  validations: Array<Readonly<{ kind: VerificationKind; cwd: string; seq: number }>>;
}

const DOCUMENT_ONLY_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst"]);
const NON_EXECUTABLE_FILENAMES = new Set([".gitignore"]);
const DIRECT_TEST_SCRIPT_EXTENSIONS = new Set([".js", ".cjs", ".mjs"]);
const DIRECT_TEST_SCRIPT_NAME = /(?:^|[-_.])(test|spec|check|verify|smoke)(?=$|[-_.])/u;

export function createCompletionEvidenceState(): CompletionEvidenceState {
  return {
    pendingValidation: false,
    verifiedAfterMutation: [],
    correctionAttempts: 0,
    relevantMutationPaths: [],
    pendingMutations: new Map(),
    validations: [],
  };
}

function normalizeRelative(value: string): string {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  return normalized === "" ? "." : normalized.replace(/^\.\//u, "");
}

function isRelevantMutationPath(value: string): boolean {
  return (
    !NON_EXECUTABLE_FILENAMES.has(path.posix.basename(value).toLowerCase()) &&
    !DOCUMENT_ONLY_EXTENSIONS.has(path.posix.extname(value).toLowerCase())
  );
}

function commandName(value: string): string {
  return path.posix.basename(value).toLowerCase();
}

function scriptKind(script: string | undefined): VerificationKind | undefined {
  if (script === undefined) return undefined;
  const name = script.toLowerCase();
  if (name === "lint" || name.startsWith("lint:")) return "lint";
  if (
    name === "typecheck" || name.startsWith("typecheck:") ||
    name === "check" || name.startsWith("check:")
  ) return "typecheck";
  if (name === "test" || name.startsWith("test:")) return "test";
  if (name === "build" || name.startsWith("build:")) return "build";
  return undefined;
}

export function classifyVerificationCommand(programValue: string, args: readonly string[]): VerificationKind | undefined {
  const program = commandName(programValue);
  if (program === "npm" || program === "pnpm" || program === "yarn" || program === "bun") {
    if (args[0] === "exec" || args[0] === "x") {
      return args[1] === undefined ? undefined : classifyVerificationCommand(args[1], args.slice(2));
    }
    const script = args[0] === "run" ? args[1] : args[0];
    return scriptKind(script);
  }
  if (program === "npx" || program === "bunx") {
    return args[0] === undefined ? undefined : classifyVerificationCommand(args[0], args.slice(1));
  }
  if (program === "tsc") return args.includes("--noEmit") ? "typecheck" : undefined;
  if (program === "vitest" || program === "jest" || program === "pytest") return "test";
  if (program === "playwright") return args.includes("test") ? "test" : undefined;
  if (program === "node") return args[0] === "--test" ? "test" : undefined;
  if (program === "cargo" || program === "go") return args[0] === "test" ? "test" : undefined;
  return undefined;
}

function cwdCoversPath(cwdValue: string, mutationPathValue: string): boolean {
  const cwd = normalizeRelative(cwdValue);
  const mutationPath = normalizeRelative(mutationPathValue);
  if (cwd === ".") return true;
  return mutationPath === cwd || mutationPath.startsWith(`${cwd}/`);
}

function cwdIsWithinDirectory(cwdValue: string, directoryValue: string): boolean {
  const cwd = normalizeRelative(cwdValue);
  const directory = normalizeRelative(directoryValue);
  if (directory === ".") return true;
  return cwd === directory || cwd.startsWith(`${directory}/`);
}

function isCoordinatorPath(value: string): boolean {
  return path.posix.basename(value).toLowerCase() === "package.json";
}

function pendingPathIsWithinDirectory(value: string, directoryValue: string): boolean {
  const normalized = normalizeRelative(value);
  const directory = normalizeRelative(directoryValue);
  if (directory === ".") return true;
  return normalized === directory || normalized.startsWith(`${directory}/`);
}

function directTestScriptPath(
  invocation: Extract<PreparedLocalToolInvocation, { name: "run_process" }>,
): string | undefined {
  if (commandName(invocation.arguments.program) !== "node") return undefined;
  const candidate = invocation.arguments.args[0];
  if (
    candidate === undefined ||
    candidate.startsWith("-") ||
    candidate.startsWith("/") ||
    candidate.includes("\\") ||
    candidate.split("/").includes("..")
  ) return undefined;
  const extension = path.posix.extname(candidate).toLowerCase();
  if (!DIRECT_TEST_SCRIPT_EXTENSIONS.has(extension)) return undefined;
  const stem = path.posix.basename(candidate, extension).toLowerCase();
  if (!DIRECT_TEST_SCRIPT_NAME.test(stem)) return undefined;
  return normalizeRelative(path.posix.join(invocation.arguments.cwd, candidate));
}

function reconcileCoordinatorPaths(
  state: CompletionEvidenceState,
  cwd: string,
  seq: number,
): number {
  let covered = 0;
  for (const [candidate, mutationSeq] of [...state.pendingMutations]) {
    if (!isCoordinatorPath(candidate) || mutationSeq >= seq) continue;
    const directory = path.posix.dirname(candidate);
    if (!cwdIsWithinDirectory(cwd, directory)) continue;
    const hasPendingProduction = [...state.pendingMutations.keys()].some(
      (pending) =>
        pending !== candidate &&
        !isCoordinatorPath(pending) &&
        pendingPathIsWithinDirectory(pending, directory),
    );
    if (hasPendingProduction) continue;
    state.pendingMutations.delete(candidate);
    covered += 1;
  }
  return covered;
}

function recordValidationFact(
  state: CompletionEvidenceState,
  kind: VerificationKind,
  cwdValue: string,
  seq: number,
): void {
  const cwd = normalizeRelative(cwdValue);
  state.validations = state.validations.filter(
    (validation) => !(validation.kind === kind && validation.cwd === cwd),
  );
  state.validations.push(Object.freeze({ kind, cwd, seq }));
  state.validations = state.validations.slice(-8);
  state.verifiedAfterMutation = [...new Set(state.validations.map((item) => item.kind))];
  state.relevantMutationPaths = [...state.pendingMutations.keys()];
  state.pendingValidation = state.pendingMutations.size > 0;
  state.correctionAttempts = 0;
}

export function recordCompletionEvidenceToolResult(
  state: CompletionEvidenceState,
  seq: number,
  invocation: PreparedLocalToolInvocation,
  result: ToolResult,
): number {
  if (!result.ok) return 0;
  if (invocation.name === "write_file" || invocation.name === "replace_in_file") {
    const mutationPath = normalizeRelative(invocation.arguments.path);
    if (!isRelevantMutationPath(mutationPath)) return 0;
    const alreadyPending = state.pendingValidation;
    state.lastRelevantMutationSeq = seq;
    state.pendingValidation = true;
    state.validations = state.validations.filter(
      (validation) => !cwdCoversPath(validation.cwd, mutationPath),
    );
    state.verifiedAfterMutation = [...new Set(state.validations.map((item) => item.kind))];
    if (!alreadyPending) {
      state.relevantMutationPaths = [];
      state.pendingMutations.clear();
    }
    state.pendingMutations.set(mutationPath, seq);
    if (!state.relevantMutationPaths.includes(mutationPath)) {
      state.relevantMutationPaths.push(mutationPath);
    }
    return 0;
  }
  if (
    invocation.name !== "run_process" ||
    state.lastRelevantMutationSeq === undefined
  ) return 0;
  if ((invocation.arguments.lifecycle ?? "oneshot") !== "oneshot") return 0;
  const kind = classifyVerificationCommand(invocation.arguments.program, invocation.arguments.args);
  const directScript = directTestScriptPath(invocation);
  if (kind === undefined && directScript === undefined) return 0;
  let covered = 0;
  if (kind !== undefined) {
    for (const [mutationPath, mutationSeq] of state.pendingMutations) {
      if (mutationSeq < seq && cwdCoversPath(invocation.arguments.cwd, mutationPath)) {
        state.pendingMutations.delete(mutationPath);
        covered += 1;
      }
    }
    covered += reconcileCoordinatorPaths(
      state,
      invocation.arguments.cwd,
      seq,
    );
  } else if (directScript !== undefined) {
    const mutationSeq = state.pendingMutations.get(directScript);
    if (mutationSeq !== undefined && mutationSeq < seq) {
      state.pendingMutations.delete(directScript);
      covered = 1;
    }
  }
  if (covered === 0) return 0;
  recordValidationFact(
    state,
    kind ?? "test",
    invocation.arguments.cwd,
    seq,
  );
  return covered;
}

export function getCurrentValidationEvidence(
  state: CompletionEvidenceState,
): ReadonlyArray<Readonly<{ kind: VerificationKind; cwd: string; seq: number }>> {
  return state.validations.map((item) => Object.freeze({ ...item }));
}

export function getUncoveredCompletionScopes(
  state: CompletionEvidenceState,
): string[] {
  const scopes = new Set<string>();
  for (const mutationPath of state.pendingMutations.keys()) {
    const directory = path.posix.dirname(mutationPath);
    const firstSegment = directory === "." ? "." : directory.split("/")[0];
    scopes.add(firstSegment === undefined || firstSegment === "" ? "." : firstSegment);
  }
  return [...scopes].sort((left, right) => left.localeCompare(right));
}

function safePublicRelativePath(value: string): string | undefined {
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").includes("..")
  ) return undefined;
  return [...value].slice(0, MAX_UNCOVERED_PATH_CODE_POINTS).join("");
}

export function getUncoveredCompletionEvidence(
  state: CompletionEvidenceState,
): UncoveredCompletionEvidence {
  const totalPaths = state.pendingMutations.size;
  const candidates = [...state.pendingMutations.keys()]
    .sort((left, right) => left.localeCompare(right))
    .map(safePublicRelativePath)
    .filter((value): value is string => value !== undefined);
  const paths: string[] = [];
  let codePoints = 0;
  for (const candidate of candidates) {
    if (paths.length >= MAX_UNCOVERED_PATHS) break;
    const separatorLength = paths.length === 0 ? 0 : 1;
    const candidateLength = [...candidate].length;
    if (codePoints + separatorLength + candidateLength > MAX_UNCOVERED_PATHS_CODE_POINTS) {
      break;
    }
    paths.push(candidate);
    codePoints += separatorLength + candidateLength;
  }
  return {
    scopes: getUncoveredCompletionScopes(state),
    paths,
    totalPaths,
    pathsTruncated: paths.length < totalPaths,
  };
}

export function requestCompletionEvidenceCorrection(
  state: CompletionEvidenceState,
): number | undefined {
  if (!state.pendingValidation || state.correctionAttempts >= 1) return undefined;
  state.correctionAttempts += 1;
  return state.correctionAttempts;
}

const EXPLICIT_INCOMPLETE_VERIFICATION =
  /(?:验证|测试|检查).{0,16}(?:未完整|未完成|未执行|未通过|缺少|失败)/u;

export function appendVerificationWarning(
  content: string,
  evidence: UncoveredCompletionEvidence,
): string {
  if (EXPLICIT_INCOMPLETE_VERIFICATION.test(content)) return content;
  const scopes = evidence.scopes.length === 0 ? "未分类" : evidence.scopes.join("、");
  const paths = evidence.paths.length === 0 ? "未提供" : evidence.paths.join("、");
  const truncation = evidence.pathsTruncated
    ? `（共 ${evidence.totalPaths} 项，仅显示前 ${evidence.paths.length} 项）`
    : "";
  return redactSecrets(
    `${content}\n\n验证未完整：仍待验证范围为 ${scopes}；相关路径为 ${paths}${truncation}。当前交付保留这些限制，未将未执行或失败的验证写成通过。`,
  );
}
