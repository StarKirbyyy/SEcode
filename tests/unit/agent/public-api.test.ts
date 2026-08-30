import { describe, expect, expectTypeOf, it } from "vitest";

import * as agent from "@/lib/agent";
import type {
  AgentContextProvider,
  AgentRunRequest,
  AgentRuntime,
  AgentRuntimeOptions,
} from "@/lib/agent";

describe("Agent public API", () => {
  it("exports only the approved runtime surface", () => {
    expect(Object.keys(agent).sort()).toEqual([
      "AGENT_ERROR_CODES",
      "AgentCompactionDraftSchema",
      "AgentContextResultSchema",
      "AgentLayerError",
      "AgentPlanDecisionSchema",
      "AgentRunLimitsSchema",
      "AgentRunRequestSchema",
      "AgentThinkingOptionsSchema",
      "DEFAULT_AGENT_DURATION_MS",
      "DEFAULT_MAX_AGENT_ITERATIONS",
      "DEFAULT_MAX_TOOL_CALLS",
      "INVALID_TOOL_CALL_NAME",
      "MAX_AGENT_DURATION_MS",
      "MAX_AGENT_ITERATIONS",
      "MAX_CONSECUTIVE_IDENTICAL_TOOL_ERRORS",
      "MAX_CONSECUTIVE_NO_PROGRESS_READS",
      "MAX_MODEL_REQUESTS",
      "MAX_PROMPT_CHARACTERS",
      "MAX_PROMPT_PREVIEW_CHARACTERS",
      "MAX_STREAM_REDACTION_PREFIX",
      "MAX_TOOL_CALLS",
      "MIN_AGENT_DURATION_MS",
      "createAgentRuntime",
    ].sort());
  });

  it("keeps internal capabilities and dependency overrides private", () => {
    const exports = Object.keys(agent);
    expect(exports).not.toContain("createAgentRuntimeWithDependencies");
    expect(exports).not.toContain("AgentRuntimeDependencies");
    expect(exports).not.toContain("AgentProjectionState");
    expect(exports).not.toContain("StreamingSecretRedactor");
    expect(exports).not.toContain("AgentApprovalWait");
  });

  it("provides the approved compile-time contracts", () => {
    expectTypeOf(agent.createAgentRuntime).parameter(0).toEqualTypeOf<AgentRuntimeOptions>();
    expectTypeOf(agent.createAgentRuntime).returns.toEqualTypeOf<AgentRuntime>();
    expectTypeOf<AgentRunRequest>().toHaveProperty("prompt");
    expectTypeOf<AgentContextProvider>().toHaveProperty("buildContext");
  });
});
