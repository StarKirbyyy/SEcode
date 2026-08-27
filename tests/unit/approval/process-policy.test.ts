import { describe, expect, it } from "vitest";

import {
  classifyProcessRisk,
  isExplicitExternalPathToken,
  normalizeProgramIdentity,
} from "@/lib/approval/process-policy";
import type { RunProcessArguments } from "@/lib/tools";

function classify(program: string, args: string[] = []) {
  return classifyProcessRisk({ program, args, cwd: ".", timeoutMs: 120_000 });
}

function expectReason(
  program: string,
  args: string[],
  decision: "allow" | "require_approval" | "deny",
  reasonCode: string,
) {
  expect(classify(program, args)).toMatchObject({ decision, reasonCode });
}

describe("process program and path normalization", () => {
  it("normalizes POSIX and Windows program identities without changing input", () => {
    expect(normalizeProgramIdentity("/usr/bin/SUDO")).toEqual({
      basename: "SUDO",
      comparisonName: "sudo",
      pathQualified: true,
    });
    expect(normalizeProgramIdentity("C:\\Windows\\shutdown.EXE")).toEqual({
      basename: "shutdown.EXE",
      comparisonName: "shutdown",
      pathQualified: true,
    });
    expect(normalizeProgramIdentity("GiT")).toMatchObject({
      comparisonName: "git",
      pathQualified: false,
    });
  });

  it.each([
    "/etc/passwd",
    "~/secret",
    "~user/secret",
    "C:\\Windows\\file",
    "\\\\server\\share",
    "../outside",
    "src/../../outside",
    "--output=../outside",
    "file:///etc/passwd",
  ])("detects explicit external path token %s", (token) => {
    expect(isExplicitExternalPathToken(token)).toBe(true);
  });

  it.each([
    "src/a.ts",
    "https://example.com/a",
    "http://example.com/a",
    "1.2.3",
    "HEAD~1",
    "foo..bar",
    "@scope/name",
  ])("does not misclassify non-external token %s", (token) => {
    expect(isExplicitExternalPathToken(token)).toBe(false);
  });
});

describe("automatic process policy", () => {
  it("allows every approved package-manager verification grammar", () => {
    const scripts = ["test", "lint", "typecheck", "build"];
    for (const manager of ["pnpm", "yarn"]) {
      for (const script of scripts) {
        expectReason(manager, [script], "allow", "PROCESS_VERIFICATION");
        expectReason(
          manager,
          ["run", script],
          "allow",
          "PROCESS_VERIFICATION",
        );
      }
    }
    expectReason("npm", ["test"], "allow", "PROCESS_VERIFICATION");
    expectReason("bun", ["test"], "allow", "PROCESS_VERIFICATION");
    for (const script of scripts) {
      expectReason(
        "npm",
        ["run", script],
        "allow",
        "PROCESS_VERIFICATION",
      );
      expectReason(
        "bun",
        ["run", script],
        "allow",
        "PROCESS_VERIFICATION",
      );
    }
  });

  it("allows every approved Git status and diff option individually", () => {
    for (const option of [
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
    ]) {
      expectReason(
        "git",
        ["status", option],
        "allow",
        "PROCESS_GIT_READ_ONLY",
      );
    }
    for (const option of [
      "--check",
      "--stat",
      "--name-only",
      "--name-status",
      "--cached",
      "--staged",
      "--color=never",
    ]) {
      expectReason(
        "git",
        ["diff", option],
        "allow",
        "PROCESS_GIT_READ_ONLY",
      );
    }
  });

  it.each([
    ["git", ["status"]],
    ["git", ["status", "--short", "--branch"]],
    ["git", ["status", "--porcelain=v2", "--untracked-files=no"]],
    ["git", ["diff"]],
    ["git", ["diff", "--check", "--stat"]],
    ["git", ["diff", "--name-only", "--", "src/a.ts"]],
  ] as const)("allows narrow Git read-only %s %j", (program, args) => {
    expectReason(
      program,
      [...args],
      "allow",
      "PROCESS_GIT_READ_ONLY",
    );
  });

  it.each([
    ["pnpm", ["test"]],
    ["pnpm", ["run", "lint"]],
    ["npm", ["test"]],
    ["npm", ["run", "typecheck"]],
    ["yarn", ["build"]],
    ["yarn", ["run", "test"]],
    ["bun", ["test"]],
    ["bun", ["run", "build"]],
  ] as const)("allows exact verification %s %j", (program, args) => {
    expectReason(
      program,
      [...args],
      "allow",
      "PROCESS_VERIFICATION",
    );
  });

  it.each([
    ["git", ["diff", "HEAD~1"]],
    ["git", ["diff", "--no-index"]],
    ["git", ["status", "--unknown"]],
    ["git", ["-C", ".", "status"]],
    ["pnpm", ["test", "--runInBand"]],
    ["pnpm", ["run", "test:unit"]],
    ["npm", ["lint"]],
    ["/usr/bin/git", ["status"]],
    ["./pnpm", ["test"]],
  ] as const)("does not expand the allowlist for %s %j", (program, args) => {
    expect(classify(program, [...args]).decision).toBe("require_approval");
  });
});

describe("approval-required process policy", () => {
  it("requires approval for every shell and dependency-changing subcommand", () => {
    for (const shell of [
      "sh",
      "bash",
      "zsh",
      "fish",
      "dash",
      "ksh",
      "cmd",
      "powershell",
      "pwsh",
    ]) {
      expectReason(shell, [], "require_approval", "PROCESS_SHELL");
    }
    for (const command of [
      "add",
      "install",
      "remove",
      "uninstall",
      "update",
      "upgrade",
      "up",
    ]) {
      expectReason(
        "pnpm",
        [command],
        "require_approval",
        "PROCESS_DEPENDENCY_CHANGE",
      );
    }
  });

  it.each([
    ["pnpm", ["install"], "PROCESS_DEPENDENCY_CHANGE"],
    ["npm", ["uninstall", "zod"], "PROCESS_DEPENDENCY_CHANGE"],
    ["yarn", ["dlx", "tool"], "PROCESS_DEPENDENCY_CHANGE"],
    ["npx", ["tool"], "PROCESS_DEPENDENCY_CHANGE"],
    ["git", ["commit", "-m", "message"], "PROCESS_REPOSITORY_WRITE"],
    ["git", ["reset", "--soft"], "PROCESS_REPOSITORY_WRITE"],
    ["bash", ["-c", "echo ok"], "PROCESS_SHELL"],
    ["sh", ["-c", "echo sudo"], "PROCESS_SHELL"],
    ["cmd", ["/c", "echo ok"], "PROCESS_SHELL"],
    ["cmd", ["/d", "/c", "echo ok"], "PROCESS_SHELL"],
    ["pnpm", ["run", "db:push"], "PROCESS_MIGRATION"],
    ["pnpm", ["run", "lint:fix"], "PROCESS_REPO_FORMAT"],
    ["prisma", ["migrate", "dev"], "PROCESS_MIGRATION"],
    ["eslint", [".", "--fix"], "PROCESS_REPO_FORMAT"],
    ["rm", ["file.txt"], "PROCESS_FILE_DELETE"],
    ["find", ["src/generated", "-delete"], "PROCESS_FILE_DELETE"],
    ["./custom", [], "PROCESS_PATH_QUALIFIED"],
    ["python", ["script.py"], "PROCESS_UNKNOWN"],
  ] as const)("requires approval for %s %j", (program, args, reasonCode) => {
    expectReason(program, [...args], "require_approval", reasonCode);
  });
});

describe("directly denied process policy and precedence", () => {
  it("denies every approved privilege, system and process-control basename", () => {
    for (const program of ["sudo", "doas", "su"]) {
      expectReason(
        program,
        [],
        "deny",
        "DENY_PRIVILEGE_ESCALATION",
      );
    }
    for (const program of [
      "shutdown",
      "reboot",
      "halt",
      "poweroff",
      "systemctl",
      "service",
      "launchctl",
      "mkfs",
      "mkfs.ext4",
      "fdisk",
      "diskpart",
      "dd",
    ]) {
      expectReason(program, [], "deny", "DENY_SYSTEM_CONTROL");
    }
    for (const program of ["kill", "killall", "pkill", "taskkill"]) {
      expectReason(program, [], "deny", "DENY_PROCESS_CONTROL");
    }
  });

  it.each([
    ["sudo", ["true"], "DENY_PRIVILEGE_ESCALATION"],
    ["/usr/bin/sudo", ["true"], "DENY_PRIVILEGE_ESCALATION"],
    ["doas", ["true"], "DENY_PRIVILEGE_ESCALATION"],
    ["env", ["MODE=test", "sudo", "true"], "DENY_PRIVILEGE_ESCALATION"],
    ["env", ["-u", "MODE", "sudo", "true"], "DENY_PRIVILEGE_ESCALATION"],
    ["sh", ["-c", "echo ok; sudo true"], "DENY_PRIVILEGE_ESCALATION"],
    ["shutdown", ["now"], "DENY_SYSTEM_CONTROL"],
    ["C:\\Windows\\shutdown.exe", [], "DENY_SYSTEM_CONTROL"],
    ["diskutil", ["eraseDisk", "APFS", "Disk", "disk9"], "DENY_SYSTEM_CONTROL"],
    ["kill", ["123"], "DENY_PROCESS_CONTROL"],
    ["sh", ["-c", "pkill node"], "DENY_PROCESS_CONTROL"],
    ["git", ["reset", "--hard"], "DENY_GIT_HARD_RESET"],
    ["git", ["-c", "x=y", "reset", "--hard=HEAD"], "DENY_GIT_HARD_RESET"],
    ["git", ["clean", "-fdx"], "DENY_BROAD_DELETE"],
    ["rm", ["-rf", "."], "DENY_BROAD_DELETE"],
    ["find", [".", "-delete"], "DENY_BROAD_DELETE"],
    ["dd", ["if=input", "of=output"], "DENY_SYSTEM_CONTROL"],
    ["python", ["../outside.py"], "DENY_EXPLICIT_WORKSPACE_ESCAPE"],
    ["git", ["diff", "--output=../outside"], "DENY_EXPLICIT_WORKSPACE_ESCAPE"],
  ] as const)("denies %s %j", (program, args, reasonCode) => {
    expectReason(program, [...args], "deny", reasonCode);
  });

  it("allows only bounded git clean to remain approval-required", () => {
    expectReason(
      "git",
      ["clean", "-f", "--", "src/generated"],
      "require_approval",
      "PROCESS_REPOSITORY_WRITE",
    );
  });
});

describe("process policy result shape", () => {
  it("returns immutable pure data", () => {
    const input: RunProcessArguments = {
      program: "pnpm",
      args: ["test"],
      cwd: ".",
      timeoutMs: 120_000,
    };
    const result = classifyProcessRisk(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(input).toEqual({
      program: "pnpm",
      args: ["test"],
      cwd: ".",
      timeoutMs: 120_000,
    });
  });
});
