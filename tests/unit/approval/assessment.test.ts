import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { JsonObject } from "@/lib/domain";
import { assessLocalToolRisk } from "@/lib/approval/assessment";
import {
  prepareLocalToolCall,
  type PreparedLocalToolInvocation,
} from "@/lib/tools";

function prepared(
  name: string,
  arguments_: JsonObject,
): PreparedLocalToolInvocation {
  const result = prepareLocalToolCall({
    id: randomUUID(),
    name,
    arguments: arguments_,
  });
  if (!result.ok) throw new Error(result.result.summary);
  return result.invocation;
}

describe("local tool risk assessment", () => {
  it.each([
    ["list_directory", { path: "src" }],
    ["read_file", { path: "src/a.ts" }],
    ["search_text", { path: "src", query: "needle" }],
  ] as const)("automatically allows read-only %s", (name, arguments_) => {
    expect(assessLocalToolRisk(prepared(name, arguments_))).toMatchObject({
      decision: "allow",
      level: "low",
      reasonCode: "TOOL_READ_ONLY",
    });
  });

  it("automatically allows and records structured workspace writes", () => {
    const secret = "write-body-must-not-be-disclosed";
    const write = assessLocalToolRisk(
      prepared("write_file", { path: "a.ts", content: secret }),
    );
    const replace = assessLocalToolRisk(
      prepared("replace_in_file", {
        path: "a.ts",
        oldText: secret,
        newText: `${secret}-new`,
        expectedSha256: "0".repeat(64),
      }),
    );
    for (const assessment of [write, replace]) {
      expect(assessment).toMatchObject({
        decision: "allow",
        level: "medium",
        reasonCode: "TOOL_WORKSPACE_WRITE",
      });
      expect(assessment.toolSummary).not.toContain(secret);
    }
  });

  it("classifies the full process arguments even when the summary is truncated", () => {
    const args = [
      ...Array.from({ length: 120 }, (_, index) => `safe-${index}-${"中".repeat(20)}`),
      "../outside",
    ];
    const assessment = assessLocalToolRisk(
      prepared("run_process", { program: "custom", args }),
    );
    expect(assessment).toMatchObject({
      decision: "deny",
      level: "blocked",
      reasonCode: "DENY_EXPLICIT_WORKSPACE_ESCAPE",
    });
    expect(assessment.toolSummary).not.toContain("../outside");
  });

  it("returns frozen assessment data", () => {
    const assessment = assessLocalToolRisk(
      prepared("run_process", { program: "pnpm", args: ["test"] }),
    );
    expect(Object.isFrozen(assessment)).toBe(true);
  });

  it("does not lower process risk merely because readiness is requested", () => {
    const withoutReadiness = assessLocalToolRisk(
      prepared("run_process", { program: "pnpm", args: ["dev"] }),
    );
    const withReadiness = assessLocalToolRisk(
      prepared("run_process", {
        program: "pnpm",
        args: ["dev"],
        readiness: { url: "http://127.0.0.1:43123/" },
      }),
    );
    expect(withReadiness).toMatchObject({
      decision: withoutReadiness.decision,
      level: withoutReadiness.level,
      reasonCode: withoutReadiness.reasonCode,
    });
  });
});
