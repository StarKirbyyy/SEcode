import { describe, expect, it } from "vitest";

import {
  createAgentProjection,
  getSessionAgentSnapshot,
  projectAgentEvent,
  projectAgentEvents,
} from "@/lib/agent/projection";
import { AgentLayerError } from "@/lib/agent/errors";

import {
  APPROVAL_ID,
  RUN_ID,
  TOOL_CALL_ID,
  createDurableEvent,
  createRunStartedEvent,
  createSessionCreatedEvent,
} from "./helpers";

const successResult = { ok: true, summary: "完成" };
const rejectedResult = {
  ok: false,
  summary: "用户拒绝执行该工具调用",
  error: {
    code: "TOOL_APPROVAL_REJECTED",
    message: "用户拒绝执行该工具调用",
    recoverable: true,
  },
};

function textSuccessEvents() {
  return [
    createSessionCreatedEvent(1),
    createRunStartedEvent(2),
    createDurableEvent(3, "user.message", { content: "修复测试" }),
    createDurableEvent(4, "model.requested", {
      iteration: 1,
      modelProfileId: "deepseek",
    }),
    createDurableEvent(5, "model.completed", {
      iteration: 1,
      finishReason: "stop",
    }),
    createDurableEvent(6, "assistant.message", {
      content: "已完成",
      kind: "final",
    }),
    createDurableEvent(7, "run.completed", {
      iterations: 1,
      durationMs: 100,
    }),
  ];
}

function toolPrefix() {
  return [
    createSessionCreatedEvent(1),
    createRunStartedEvent(2),
    createDurableEvent(3, "user.message", { content: "读取文件" }),
    createDurableEvent(4, "model.requested", {
      iteration: 1,
      modelProfileId: "deepseek",
    }),
    createDurableEvent(5, "model.completed", {
      iteration: 1,
      finishReason: "tool_calls",
    }),
    createDurableEvent(6, "assistant.message", {
      content: "我先读取文件",
      kind: "intermediate",
    }),
    createDurableEvent(7, "tool.requested", {
      toolCallId: TOOL_CALL_ID,
      toolName: "read_file",
      publicArguments: { path: "src/index.ts" },
      argumentsTruncated: false,
    }),
  ];
}

describe("Agent lifecycle projection", () => {
  it("projects a complete text run deterministically", () => {
    const first = getSessionAgentSnapshot(projectAgentEvents(textSuccessEvents()));
    const second = getSessionAgentSnapshot(projectAgentEvents(textSuccessEvents()));

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: "completed",
      lastSeq: 7,
      lastRun: { runId: RUN_ID, status: "completed", iterations: 1 },
    });
    expect(first.activeRun).toBeUndefined();
  });

  it("projects an open model request and an interruption", () => {
    const open = [
      createSessionCreatedEvent(1),
      createRunStartedEvent(2),
      createDurableEvent(3, "user.message", { content: "task" }),
      createDurableEvent(4, "model.requested", {
        iteration: 1,
        modelProfileId: "deepseek",
      }),
    ];
    expect(getSessionAgentSnapshot(projectAgentEvents(open))).toMatchObject({
      status: "requesting_model",
      activeRun: { status: "requesting_model", iterations: 1 },
    });
    const interrupted = [
      ...open,
      createDurableEvent(5, "run.interrupted", {
        reason: "进程重启",
        lastStableSeq: 4,
      }),
    ];
    expect(getSessionAgentSnapshot(projectAgentEvents(interrupted)).status).toBe(
      "interrupted",
    );
  });

  it("accepts automatic, approved and rejected tool paths", () => {
    const automatic = [
      ...toolPrefix(),
      createDurableEvent(8, "tool.started", {
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
      }),
      createDurableEvent(9, "tool.result", {
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
        result: successResult,
      }),
      createDurableEvent(10, "model.requested", {
        iteration: 2,
        modelProfileId: "deepseek",
      }),
    ];
    expect(getSessionAgentSnapshot(projectAgentEvents(automatic))).toMatchObject({
      status: "requesting_model",
      activeRun: { iterations: 2 },
    });

    const approved = [
      ...toolPrefix(),
      createDurableEvent(8, "approval.required", {
        approvalId: APPROVAL_ID,
        toolCallId: TOOL_CALL_ID,
        reason: "需要审批",
        toolSummary: "运行命令",
      }),
      createDurableEvent(9, "approval.resolved", {
        approvalId: APPROVAL_ID,
        approved: true,
      }),
      createDurableEvent(10, "tool.started", {
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
      }),
      createDurableEvent(11, "tool.result", {
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
        result: successResult,
      }),
    ];
    expect(getSessionAgentSnapshot(projectAgentEvents(approved)).status).toBe(
      "queued",
    );

    const rejected = [
      ...toolPrefix(),
      createDurableEvent(8, "approval.required", {
        approvalId: APPROVAL_ID,
        toolCallId: TOOL_CALL_ID,
        reason: "需要审批",
        toolSummary: "运行命令",
      }),
      createDurableEvent(9, "approval.resolved", {
        approvalId: APPROVAL_ID,
        approved: false,
      }),
      createDurableEvent(10, "tool.result", {
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
        result: rejectedResult,
      }),
    ];
    expect(getSessionAgentSnapshot(projectAgentEvents(rejected)).status).toBe(
      "queued",
    );
  });

  it("shows the exact pending approval view", () => {
    const events = [
      ...toolPrefix(),
      createDurableEvent(8, "approval.required", {
        approvalId: APPROVAL_ID,
        toolCallId: TOOL_CALL_ID,
        reason: "需要审批",
        toolSummary: "运行命令",
      }),
    ];
    expect(getSessionAgentSnapshot(projectAgentEvents(events))).toMatchObject({
      status: "awaiting_approval",
      activeRun: {
        pendingApproval: {
          approvalId: APPROVAL_ID,
          toolCallId: TOOL_CALL_ID,
        },
      },
    });
  });

  it("allows compaction only at a stable boundary", () => {
    const valid = [
      createSessionCreatedEvent(1),
      createRunStartedEvent(2),
      createDurableEvent(3, "user.message", { content: "task" }),
      createDurableEvent(4, "context.compacted", {
        throughSeq: 1,
        summary: "summary",
        retainedRange: { fromSeq: 2, toSeq: 3 },
      }),
    ];
    expect(getSessionAgentSnapshot(projectAgentEvents(valid)).lastSeq).toBe(4);

    const invalid = [
      ...valid,
      createDurableEvent(5, "model.requested", {
        iteration: 1,
        modelProfileId: "deepseek",
      }),
      createDurableEvent(6, "context.compacted", {
        throughSeq: 4,
        summary: "summary",
        retainedRange: { fromSeq: 3, toSeq: 5 },
      }),
    ];
    expect(() => projectAgentEvents(invalid)).toThrow(AgentLayerError);
  });

  it("rejects an unknown model finish reason", () => {
    const events = [
      createSessionCreatedEvent(1),
      createRunStartedEvent(2),
      createDurableEvent(3, "user.message", { content: "task" }),
      createDurableEvent(4, "model.requested", {
        iteration: 1,
        modelProfileId: "deepseek",
      }),
      createDurableEvent(5, "model.completed", {
        iteration: 1,
        finishReason: "unexpected",
      }),
    ];
    expect(() => projectAgentEvents(events)).toThrow(AgentLayerError);
  });
});

describe("Agent lifecycle rejection", () => {
  it.each([
    ["event before session", [createRunStartedEvent(1)]],
    ["duplicate session", [createSessionCreatedEvent(1), createSessionCreatedEvent(2)]],
    ["sequence gap", [createSessionCreatedEvent(1), createRunStartedEvent(3)]],
    [
      "model before user",
      [
        createSessionCreatedEvent(1),
        createRunStartedEvent(2),
        createDurableEvent(3, "model.requested", {
          iteration: 1,
          modelProfileId: "deepseek",
        }),
      ],
    ],
    [
      "iteration gap",
      [
        createSessionCreatedEvent(1),
        createRunStartedEvent(2),
        createDurableEvent(3, "user.message", { content: "task" }),
        createDurableEvent(4, "model.requested", {
          iteration: 2,
          modelProfileId: "deepseek",
        }),
      ],
    ],
    [
      "completion without request",
      [
        createSessionCreatedEvent(1),
        createRunStartedEvent(2),
        createDurableEvent(3, "user.message", { content: "task" }),
        createDurableEvent(4, "model.completed", {
          iteration: 1,
          finishReason: "stop",
        }),
      ],
    ],
    [
      "completed without final",
      [
        createSessionCreatedEvent(1),
        createRunStartedEvent(2),
        createDurableEvent(3, "user.message", { content: "task" }),
        createDurableEvent(4, "run.completed", {
          iterations: 0,
          durationMs: 1,
        }),
      ],
    ],
  ])("rejects %s", (_name, events) => {
    expect(() => projectAgentEvents(events)).toThrow(AgentLayerError);
  });

  it("rejects late tool requests and out-of-order execution", () => {
    const secondToolId = "00000000-0000-4000-8000-000000000109";
    const late = [
      ...toolPrefix(),
      createDurableEvent(8, "tool.started", {
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
      }),
      createDurableEvent(9, "tool.requested", {
        toolCallId: secondToolId,
        toolName: "read_file",
        publicArguments: { path: "second.ts" },
        argumentsTruncated: false,
      }),
    ];
    expect(() => projectAgentEvents(late)).toThrow(AgentLayerError);

    const outOfOrder = [
      ...toolPrefix(),
      createDurableEvent(8, "tool.requested", {
        toolCallId: secondToolId,
        toolName: "read_file",
        publicArguments: { path: "second.ts" },
        argumentsTruncated: false,
      }),
      createDurableEvent(9, "tool.started", {
        toolCallId: secondToolId,
        toolName: "read_file",
      }),
    ];
    expect(() => projectAgentEvents(outOfOrder)).toThrow(AgentLayerError);
  });

  it("rejects approval and terminal lifecycle violations", () => {
    const startedWithoutApproval = [
      ...toolPrefix(),
      createDurableEvent(8, "approval.required", {
        approvalId: APPROVAL_ID,
        toolCallId: TOOL_CALL_ID,
        reason: "需要审批",
        toolSummary: "命令",
      }),
      createDurableEvent(9, "tool.started", {
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
      }),
    ];
    expect(() => projectAgentEvents(startedWithoutApproval)).toThrow(
      AgentLayerError,
    );

    const eventAfterTerminal = [
      ...textSuccessEvents(),
      createDurableEvent(8, "run.failed", {
        error: { code: "LATE", message: "late", recoverable: false },
        iterations: 1,
      }),
    ];
    expect(() => projectAgentEvents(eventAfterTerminal)).toThrow(
      AgentLayerError,
    );
  });

  it("does not mutate state after rejecting an invalid event", () => {
    const state = createAgentProjection();
    projectAgentEvent(state, createSessionCreatedEvent(1));
    expect(() => projectAgentEvent(state, createRunStartedEvent(3))).toThrow();
    expect(state.lastSeq).toBe(1);
  });
});
