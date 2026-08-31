import { describe, expect, it } from "vitest";

import type { JsonObject } from "@/lib/domain";
import {
  createCompletionEvidenceState,
  recordCompletionEvidenceToolResult,
} from "@/lib/agent/completion-evidence";
import {
  createConvergenceView,
  fingerprintConvergenceView,
  renderConvergenceMessage,
} from "@/lib/agent/convergence-view";
import {
  createServiceHandoffState,
  recordServiceHandoffToolResult,
} from "@/lib/agent/service-handoff";
import { prepareLocalToolCall, type PreparedLocalToolInvocation } from "@/lib/tools";

function prepared(value: {
  name: string;
  arguments: JsonObject;
}): PreparedLocalToolInvocation {
  const result = prepareLocalToolCall({
    id: "26000000-0000-4000-8000-000000000001",
    ...value,
  });
  if (!result.ok) throw new Error(result.result.summary);
  return result.invocation;
}

const success = { ok: true, summary: "完成" } as const;

describe("convergence view", () => {
  it("returns no message for an empty run", () => {
    const view = createConvergenceView(
      createCompletionEvidenceState(),
      createServiceHandoffState(),
    );
    expect(view).toEqual({
      closing: false,
      pendingScopes: [],
      pendingPaths: [],
      validEvidence: [],
      readyUrls: [],
    });
    expect(renderConvergenceMessage(view)).toBeUndefined();
  });

  it("changes fingerprint once when the run enters closing mode", () => {
    const completion = createCompletionEvidenceState();
    const services = createServiceHandoffState();
    const ordinary = createConvergenceView(completion, services);
    const closing = createConvergenceView(completion, services, { closing: true });

    expect(closing.closing).toBe(true);
    expect(fingerprintConvergenceView(closing)).not.toBe(
      fingerprintConvergenceView(ordinary),
    );
    expect(renderConvergenceMessage(closing)).toMatch(/收尾阶段.*最终回答/u);
  });

  it("renders bounded pending, validation, ready and failure facts without private data", () => {
    const completion = createCompletionEvidenceState();
    recordCompletionEvidenceToolResult(completion, 1, prepared({
      name: "write_file",
      arguments: { path: "client/src/a.ts", content: "private-token" },
    }), success);
    const services = createServiceHandoffState();
    recordServiceHandoffToolResult(services, 2, prepared({
      name: "run_process",
      arguments: {
        program: "node",
        args: ["server.mjs", "--token", "private-token"],
        cwd: "server",
        lifecycle: "service",
        readiness: { url: "http://127.0.0.1:43140/" },
      },
    }), {
      ok: false,
      summary: "失败",
      output: "PID 1234 private-token /Users/example/project",
      error: {
        code: "PROCESS_EXIT_NONZERO",
        message: "退出非零",
        recoverable: true,
      },
    });

    const view = createConvergenceView(completion, services);
    expect(view).toMatchObject({
      pendingScopes: ["client"],
      pendingPaths: ["client/src/a.ts"],
      readyUrls: [],
      lastServiceFailure: { code: "PROCESS_EXIT_NONZERO", cwd: "server" },
    });
    const rendered = renderConvergenceMessage(view);
    expect(rendered).toContain("client/src/a.ts");
    expect(rendered).toContain("PROCESS_EXIT_NONZERO");
    expect(rendered).not.toMatch(/private-token|PID|\/Users\//u);
  });

  it("tells the model to finish immediately once evidence and service are ready", () => {
    const completion = createCompletionEvidenceState();
    recordCompletionEvidenceToolResult(completion, 1, prepared({
      name: "write_file",
      arguments: { path: "server/a.ts", content: "x" },
    }), success);
    recordCompletionEvidenceToolResult(completion, 2, prepared({
      name: "run_process",
      arguments: { program: "npm", args: ["test"], cwd: "server", lifecycle: "oneshot" },
    }), success);
    const services = createServiceHandoffState();
    recordServiceHandoffToolResult(services, 3, prepared({
      name: "run_process",
      arguments: {
        program: "node",
        args: ["server.mjs"],
        cwd: "server",
        lifecycle: "service",
        readiness: { url: "http://127.0.0.1:43141/" },
      },
    }), { ok: true, summary: "服务已就绪", metadata: { ready: true } });

    const view = createConvergenceView(completion, services);
    expect(view.validEvidence).toEqual([
      expect.objectContaining({ kind: "test", cwd: "server", seq: 2 }),
    ]);
    expect(view.readyUrls).toEqual(["http://127.0.0.1:43141/"]);
    expect(renderConvergenceMessage(view)).toMatch(/直接给出最终回答/u);
    expect(renderConvergenceMessage(view)).toContain("http://127.0.0.1:43141/");
  });

  it("produces a stable fingerprint for equivalent ordered public facts", () => {
    const left = {
      closing: false,
      pendingScopes: ["client"],
      pendingPaths: ["client/a.ts"],
      validEvidence: [{ kind: "test" as const, cwd: "server", seq: 2 }],
      readyUrls: ["http://127.0.0.1:43142/"],
    };
    const right = {
      ...left,
      pendingScopes: [...left.pendingScopes],
      pendingPaths: [...left.pendingPaths],
      validEvidence: [...left.validEvidence],
      readyUrls: [...left.readyUrls],
    };
    expect(fingerprintConvergenceView(left)).toBe(fingerprintConvergenceView(right));
  });
});
