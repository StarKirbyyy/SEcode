import type { RunProcessArguments } from "@/lib/tools";

import type { RiskLevel, RiskReasonCode } from "./types";

export interface ProcessRiskClassification {
  decision: "allow" | "require_approval" | "deny";
  level: RiskLevel;
  reasonCode: RiskReasonCode;
}

interface ProgramIdentity {
  basename: string;
  comparisonName: string;
  pathQualified: boolean;
}

const PRIVILEGE_PROGRAMS = new Set(["sudo", "doas", "su"]);
const SYSTEM_PROGRAMS = new Set([
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "systemctl",
  "service",
  "launchctl",
  "mkfs",
  "fdisk",
  "diskpart",
]);
const PROCESS_CONTROL_PROGRAMS = new Set([
  "kill",
  "killall",
  "pkill",
  "taskkill",
]);
const SHELL_PROGRAMS = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "dash",
  "ksh",
  "cmd",
  "powershell",
  "pwsh",
]);
const PACKAGE_MANAGERS = new Set(["pnpm", "npm", "yarn", "bun"]);
const DOWNLOAD_RUNNERS = new Set(["npx", "bunx"]);
const DEPENDENCY_COMMANDS = new Set([
  "add",
  "install",
  "remove",
  "uninstall",
  "update",
  "upgrade",
  "up",
]);
const VERIFICATION_SCRIPTS = new Set([
  "test",
  "lint",
  "typecheck",
  "build",
]);
const GIT_STATUS_OPTIONS = new Set([
  "--short",
  "-s",
  "--branch",
  "-b",
  "--porcelain",
  "--porcelain=v1",
  "--porcelain=v2",
  "--untracked-files=no",
  "--untracked-files=normal",
  "--untracked-files=all",
]);
const GIT_DIFF_OPTIONS = new Set([
  "--check",
  "--stat",
  "--name-only",
  "--name-status",
  "--cached",
  "--staged",
  "--color=never",
]);
const WINDOWS_EXECUTABLE_SUFFIX = /\.(?:exe|cmd|bat|com)$/i;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function classification(
  decision: ProcessRiskClassification["decision"],
  level: RiskLevel,
  reasonCode: RiskReasonCode,
): ProcessRiskClassification {
  return Object.freeze({ decision, level, reasonCode });
}

const allow = (reasonCode: RiskReasonCode, level: "low" | "medium") =>
  classification("allow", level, reasonCode);
const approval = (reasonCode: RiskReasonCode) =>
  classification("require_approval", "high", reasonCode);
const deny = (reasonCode: RiskReasonCode) =>
  classification("deny", "blocked", reasonCode);

export function normalizeProgramIdentity(program: string): ProgramIdentity {
  const pieces = program.split(/[\\/]/);
  const basename = pieces.at(-1) ?? program;
  return Object.freeze({
    basename,
    comparisonName: basename
      .toLowerCase()
      .replace(WINDOWS_EXECUTABLE_SUFFIX, ""),
    pathQualified: /[\\/]/.test(program),
  });
}

function pathCandidate(token: string): string {
  const separator = token.indexOf("=");
  if (separator > 0) return token.slice(separator + 1);
  return token;
}

export function isExplicitExternalPathToken(token: string): boolean {
  const candidate = pathCandidate(token);
  if (/^https?:\/\//i.test(candidate)) return false;
  if (/^file:/i.test(candidate)) return true;
  if (/^@[^/\\]+[/\\][^/\\]+$/.test(candidate)) return false;
  if (candidate.startsWith("/")) return true;
  if (/^~(?:$|[/\\]|[^/\\]+[/\\])/.test(candidate)) return true;
  if (/^[A-Za-z]:[/\\]/.test(candidate)) return true;
  if (/^(?:\\\\|\/\/)[^/\\]/.test(candidate)) return true;
  return candidate.split(/[\\/]/).includes("..");
}

function gitStatusAllowed(args: readonly string[]): boolean {
  return args.every((argument) => GIT_STATUS_OPTIONS.has(argument));
}

function gitDiffAllowed(args: readonly string[]): boolean {
  const separator = args.indexOf("--");
  const options = separator === -1 ? args : args.slice(0, separator);
  if (!options.every((argument) => GIT_DIFF_OPTIONS.has(argument))) {
    return false;
  }
  if (separator === -1) return true;
  return args.length > separator + 1;
}

function verificationAllowed(
  program: string,
  args: readonly string[],
): boolean {
  if (program === "npm") {
    return (
      (args.length === 1 && args[0] === "test") ||
      (args.length === 2 &&
        args[0] === "run" &&
        VERIFICATION_SCRIPTS.has(args[1] ?? ""))
    );
  }
  if (program === "bun") {
    return (
      (args.length === 1 && args[0] === "test") ||
      (args.length === 2 &&
        args[0] === "run" &&
        VERIFICATION_SCRIPTS.has(args[1] ?? ""))
    );
  }
  return (
    (args.length === 1 && VERIFICATION_SCRIPTS.has(args[0] ?? "")) ||
    (args.length === 2 &&
      args[0] === "run" &&
      VERIFICATION_SCRIPTS.has(args[1] ?? ""))
  );
}

function hasShortFlag(arguments_: readonly string[], flag: string): boolean {
  return arguments_.some((argument) => {
    if (argument === `-${flag}`) return true;
    return /^-[^-]+$/.test(argument) && argument.slice(1).includes(flag);
  });
}

function isBroadTarget(value: string): boolean {
  const normalized = value.replace(/[\\/]+$/g, "") || "/";
  return new Set(["/", ".", "..", "~", "*", "./*", ".\\*"]).has(
    normalized,
  );
}

function broadRm(arguments_: readonly string[]): boolean {
  const recursive =
    arguments_.includes("--recursive") ||
    hasShortFlag(arguments_, "r") ||
    hasShortFlag(arguments_, "R");
  if (!recursive) return false;
  return arguments_
    .filter((argument) => argument === "-" || !argument.startsWith("-"))
    .some(isBroadTarget);
}

function findDeleteIsBroad(arguments_: readonly string[]): boolean {
  if (!arguments_.includes("-delete")) return false;
  const roots: string[] = [];
  for (const argument of arguments_) {
    if (
      argument.startsWith("-") ||
      argument === "!" ||
      argument === "(" ||
      argument === ")"
    ) {
      break;
    }
    roots.push(argument);
  }
  return roots.length === 0 || roots.some(isBroadTarget);
}

function gitCleanIsBroad(arguments_: readonly string[]): boolean {
  const cleanIndex = arguments_.indexOf("clean");
  if (cleanIndex === -1) return false;
  const cleanArgs = arguments_.slice(cleanIndex + 1);
  const forced =
    cleanArgs.includes("--force") || hasShortFlag(cleanArgs, "f");
  if (!forced) return false;
  const separator = cleanArgs.indexOf("--");
  if (separator === -1 || separator === cleanArgs.length - 1) return true;
  return cleanArgs.slice(separator + 1).some(isBroadTarget);
}

function gitHardReset(arguments_: readonly string[]): boolean {
  return (
    arguments_.includes("reset") &&
    arguments_.some(
      (argument) => argument === "--hard" || argument.startsWith("--hard="),
    )
  );
}

function diskUtilityDestructive(arguments_: readonly string[]): boolean {
  const command = arguments_[0]?.toLowerCase();
  return (
    command === "erasedisk" ||
    command === "erasevolume" ||
    command === "partitiondisk"
  );
}

function shellPayload(arguments_: readonly string[]): string | undefined {
  const marker = arguments_.findIndex((argument) =>
    ["-c", "/c", "-command"].includes(argument.toLowerCase()),
  );
  return marker === -1 ? undefined : arguments_[marker + 1];
}

function payloadForbidden(payload: string): ProcessRiskClassification | undefined {
  const commandBoundary =
    "(?:^|[;&|()\\n]|\\bthen\\b|\\bdo\\b)\\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\\s;&|()]+\\s+)*";
  const commandEnd = "(?=$|[\\s;&|()])";
  if (
    new RegExp(
      `${commandBoundary}(?:sudo|doas|su)${commandEnd}`,
      "i",
    ).test(payload)
  ) {
    return deny("DENY_PRIVILEGE_ESCALATION");
  }
  if (
    new RegExp(
      `${commandBoundary}(?:shutdown|reboot|halt|poweroff|systemctl|service|launchctl|mkfs(?:\\.[A-Za-z0-9_-]+)?|fdisk|diskpart|dd)${commandEnd}`,
      "i",
    ).test(payload)
  ) {
    return deny("DENY_SYSTEM_CONTROL");
  }
  if (
    new RegExp(
      `${commandBoundary}(?:kill|killall|pkill|taskkill)${commandEnd}`,
      "i",
    ).test(payload)
  ) {
    return deny("DENY_PROCESS_CONTROL");
  }
  if (
    new RegExp(
      `${commandBoundary}git\\b[^;&|\\n]*\\breset\\b[^;&|\\n]*--hard(?:\\b|=)`,
      "i",
    ).test(payload)
  ) {
    return deny("DENY_GIT_HARD_RESET");
  }
  if (
    new RegExp(
      `${commandBoundary}rm\\b[^;&|\\n]*(?:--recursive|-[A-Za-z]*[rR][A-Za-z]*)[^;&|\\n]*\\s(?:\\.{1,2}|/|~|\\*|\\./\\*)(?:\\s|$)`,
      "i",
    ).test(payload)
  ) {
    return deny("DENY_BROAD_DELETE");
  }
  return undefined;
}

function nestedEnvProgram(
  arguments_: readonly string[],
): { program: string; args: readonly string[] } | undefined {
  let index = 0;
  while (index < arguments_.length) {
    const argument = arguments_[index] ?? "";
    if (argument.startsWith("-") || ENV_ASSIGNMENT.test(argument)) {
      index += 1;
      continue;
    }
    return { program: argument, args: arguments_.slice(index + 1) };
  }
  return undefined;
}

function directForbidden(
  program: string,
  arguments_: readonly string[],
  depth = 0,
): ProcessRiskClassification | undefined {
  const identity = normalizeProgramIdentity(program);
  const name = identity.comparisonName;
  if (PRIVILEGE_PROGRAMS.has(name)) {
    return deny("DENY_PRIVILEGE_ESCALATION");
  }
  if (SYSTEM_PROGRAMS.has(name) || name.startsWith("mkfs.")) {
    return deny("DENY_SYSTEM_CONTROL");
  }
  if (name === "diskutil" && diskUtilityDestructive(arguments_)) {
    return deny("DENY_SYSTEM_CONTROL");
  }
  if (name === "dd") return deny("DENY_SYSTEM_CONTROL");
  if (PROCESS_CONTROL_PROGRAMS.has(name)) {
    return deny("DENY_PROCESS_CONTROL");
  }
  if (name === "git" && gitHardReset(arguments_)) {
    return deny("DENY_GIT_HARD_RESET");
  }
  if (name === "git" && gitCleanIsBroad(arguments_)) {
    return deny("DENY_BROAD_DELETE");
  }
  if (name === "rm" && broadRm(arguments_)) {
    return deny("DENY_BROAD_DELETE");
  }
  if (name === "find" && findDeleteIsBroad(arguments_)) {
    return deny("DENY_BROAD_DELETE");
  }
  if (SHELL_PROGRAMS.has(name)) {
    const payload = shellPayload(arguments_);
    if (payload !== undefined) return payloadForbidden(payload);
  }
  if (name === "env" && depth === 0) {
    for (const argument of arguments_) {
      const nestedName = normalizeProgramIdentity(argument).comparisonName;
      if (PRIVILEGE_PROGRAMS.has(nestedName)) {
        return deny("DENY_PRIVILEGE_ESCALATION");
      }
      if (SYSTEM_PROGRAMS.has(nestedName) || nestedName.startsWith("mkfs.")) {
        return deny("DENY_SYSTEM_CONTROL");
      }
      if (PROCESS_CONTROL_PROGRAMS.has(nestedName)) {
        return deny("DENY_PROCESS_CONTROL");
      }
    }
    if (gitHardReset(arguments_)) return deny("DENY_GIT_HARD_RESET");
    const nested = nestedEnvProgram(arguments_);
    if (nested !== undefined) {
      return directForbidden(nested.program, nested.args, depth + 1);
    }
  }
  return undefined;
}

function packageScript(arguments_: readonly string[]): string | undefined {
  if (arguments_[0] === "run") return arguments_[1];
  return arguments_[0];
}

function isMigrationScript(script: string | undefined): boolean {
  if (script === undefined) return false;
  return (
    script === "migrate" ||
    script === "migration" ||
    script === "db:push" ||
    script.split(":").some((segment) =>
      ["migrate", "migration"].includes(segment),
    )
  );
}

function isFormatInvocation(arguments_: readonly string[]): boolean {
  const script = packageScript(arguments_);
  return (
    script === "format" ||
    script === "fmt" ||
    script === "lint:fix" ||
    arguments_.includes("--fix") ||
    arguments_.includes("--write")
  );
}

export function classifyProcessRisk(
  arguments_: RunProcessArguments,
): ProcessRiskClassification {
  const identity = normalizeProgramIdentity(arguments_.program);
  if (
    arguments_.args.some(
      (argument) =>
        !(
          identity.comparisonName === "cmd" &&
          ["/c", "/k", "/d", "/q", "/s"].includes(argument.toLowerCase())
        ) && isExplicitExternalPathToken(argument),
    )
  ) {
    return deny("DENY_EXPLICIT_WORKSPACE_ESCAPE");
  }

  const forbidden = directForbidden(arguments_.program, arguments_.args);
  if (forbidden !== undefined) return forbidden;

  const name = identity.comparisonName;
  if (!identity.pathQualified && name === "git") {
    const [subcommand, ...rest] = arguments_.args;
    if (subcommand === "status" && gitStatusAllowed(rest)) {
      return allow("PROCESS_GIT_READ_ONLY", "low");
    }
    if (subcommand === "diff" && gitDiffAllowed(rest)) {
      return allow("PROCESS_GIT_READ_ONLY", "low");
    }
  }
  if (
    !identity.pathQualified &&
    PACKAGE_MANAGERS.has(name) &&
    verificationAllowed(name, arguments_.args)
  ) {
    return allow("PROCESS_VERIFICATION", "medium");
  }

  if (SHELL_PROGRAMS.has(name)) return approval("PROCESS_SHELL");
  if (PACKAGE_MANAGERS.has(name)) {
    const script = packageScript(arguments_.args);
    if (isMigrationScript(script)) return approval("PROCESS_MIGRATION");
    if (isFormatInvocation(arguments_.args)) {
      return approval("PROCESS_REPO_FORMAT");
    }
    if (
      DEPENDENCY_COMMANDS.has(arguments_.args[0] ?? "") ||
      arguments_.args[0] === "dlx"
    ) {
      return approval("PROCESS_DEPENDENCY_CHANGE");
    }
  }
  if (DOWNLOAD_RUNNERS.has(name)) {
    return approval("PROCESS_DEPENDENCY_CHANGE");
  }
  if (name === "git") return approval("PROCESS_REPOSITORY_WRITE");
  if (name === "rm" || name === "unlink" || name === "find") {
    return approval("PROCESS_FILE_DELETE");
  }
  if (isMigrationScript(packageScript(arguments_.args))) {
    return approval("PROCESS_MIGRATION");
  }
  if (isFormatInvocation(arguments_.args)) {
    return approval("PROCESS_REPO_FORMAT");
  }
  if (identity.pathQualified) return approval("PROCESS_PATH_QUALIFIED");
  return approval("PROCESS_UNKNOWN");
}
