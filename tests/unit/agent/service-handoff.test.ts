import { describe, expect, it } from "vitest";

import {
  createServiceHandoffState,
  decideServiceFinal,
  recordServiceHandoffToolResult,
} from "@/lib/agent/service-handoff";
import type { JsonObject, ToolResult } from "@/lib/domain";
import { prepareLocalToolCall, type PreparedLocalToolInvocation } from "@/lib/tools";

function serviceInvocation(
  url: string,
  overrides: JsonObject = {},
): PreparedLocalToolInvocation {
  const prepared = prepareLocalToolCall({
    id: "25000000-0000-4000-8000-000000000001",
    name: "run_process",
    arguments: {
      program: "node",
      args: ["server.mjs"],
      cwd: ".",
      lifecycle: "service",
      readiness: { url },
      ...overrides,
    },
  });
  if (!prepared.ok) throw new Error(prepared.result.summary);
  return prepared.invocation;
}

const ready: ToolResult = {
  ok: true,
  summary: "服务已就绪",
  metadata: { ready: true },
};

const failed: ToolResult = {
  ok: false,
  summary: "服务启动失败",
  error: {
    code: "PROCESS_EXIT_NONZERO",
    message: "进程退出非零",
    recoverable: true,
  },
};

describe("service handoff", () => {
  it("accepts ordinary tasks that did not attempt a service", () => {
    expect(decideServiceFinal(createServiceHandoffState(), "普通任务已完成。"))
      .toEqual({ kind: "accept" });
  });

  it("requests one bounded correction until every ready URL is present", () => {
    const state = createServiceHandoffState();
    recordServiceHandoffToolResult(
      state,
      10,
      serviceInvocation("http://127.0.0.1:43121/", {
        args: ["server.mjs", "--token", "private-token"],
      }),
      ready,
    );
    recordServiceHandoffToolResult(
      state,
      20,
      serviceInvocation("http://127.0.0.1:43122/"),
      ready,
    );

    const retry = decideServiceFinal(
      state,
      "后端可访问：http://127.0.0.1:43121/",
    );
    expect(retry.kind).toBe("retry");
    expect(retry).toMatchObject({
      kind: "retry",
      message: expect.stringContaining("http://127.0.0.1:43122/"),
    });
    expect(JSON.stringify(retry)).not.toContain("private-token");
    expect(JSON.stringify(retry)).not.toContain("server.mjs");
    expect(decideServiceFinal(
      state,
      "后端：http://127.0.0.1:43121/；前端：http://127.0.0.1:43122/。",
    )).toEqual({ kind: "accept" });
  });

  it("accepts with a bounded warning after one correction when the last service attempt failed", () => {
    const state = createServiceHandoffState();
    recordServiceHandoffToolResult(
      state,
      10,
      serviceInvocation("http://127.0.0.1:43121/"),
      ready,
    );
    recordServiceHandoffToolResult(
      state,
      20,
      serviceInvocation("http://127.0.0.1:43122/"),
      failed,
    );

    expect(decideServiceFinal(state, "任务完成。")).toMatchObject({
      kind: "retry",
      message: expect.stringContaining("最后一次 service 启动未成功"),
    });
    const decision = decideServiceFinal(state, "再次确认任务完成。");
    expect(decision).toMatchObject({
      kind: "accept",
      appendix: expect.stringMatching(/服务未成功启动.*PROCESS_EXIT_NONZERO/u),
    });
    expect(JSON.stringify(decision)).not.toMatch(/pid|private|stdout|\/Users\//i);
  });

  it("does not reopen the correction budget after another failed service attempt", () => {
    const state = createServiceHandoffState();
    const invocation = serviceInvocation("http://127.0.0.1:43125/");
    recordServiceHandoffToolResult(state, 1, invocation, failed);
    expect(decideServiceFinal(state, "首次交付。").kind).toBe("retry");
    recordServiceHandoffToolResult(state, 2, invocation, failed);
    expect(decideServiceFinal(state, "再次交付。")).toMatchObject({
      kind: "accept",
      appendix: expect.stringContaining("服务未成功启动"),
    });
  });

  it("keeps only the latest eight successful service facts", () => {
    const state = createServiceHandoffState();
    for (let index = 0; index < 10; index += 1) {
      recordServiceHandoffToolResult(
        state,
        index + 1,
        serviceInvocation(`http://127.0.0.1:${44000 + index}/`, {
          cwd: `service-${index}`,
        }),
        ready,
      );
    }
    expect(state.successful).toHaveLength(8);
    expect(state.successful.map((item) => item.seq)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("replaces an older ready URL from the same cwd", () => {
    const state = createServiceHandoffState();
    recordServiceHandoffToolResult(
      state,
      1,
      serviceInvocation("http://127.0.0.1:43131/"),
      ready,
    );
    recordServiceHandoffToolResult(
      state,
      2,
      serviceInvocation("http://127.0.0.1:43132/"),
      ready,
    );

    expect(state.successful).toEqual([
      expect.objectContaining({
        readinessUrl: "http://127.0.0.1:43132/",
        seq: 2,
      }),
    ]);
    expect(decideServiceFinal(
      state,
      "访问：http://127.0.0.1:43132/",
    )).toEqual({ kind: "accept" });
  });

  it("keeps only a bounded structured failure and clears it after success", () => {
    const state = createServiceHandoffState();
    recordServiceHandoffToolResult(
      state,
      1,
      serviceInvocation("http://127.0.0.1:43133/", {
        args: ["server.mjs", "--token", "private-token"],
      }),
      {
        ...failed,
        output: "PID 1234 private-token /Users/example/project",
      },
    );
    expect(state.lastFailure).toEqual({
      code: "PROCESS_EXIT_NONZERO",
      cwd: ".",
    });
    expect(JSON.stringify(state.lastFailure)).not.toMatch(/private-token|PID|\/Users\//u);

    recordServiceHandoffToolResult(
      state,
      2,
      serviceInvocation("http://127.0.0.1:43134/"),
      ready,
    );
    expect(state.lastFailure).toBeUndefined();
  });
});
