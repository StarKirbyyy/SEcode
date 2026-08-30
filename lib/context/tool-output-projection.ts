import { truncateUtf8, utf8ByteLength } from "@/lib/domain";
import { limitToolOutput } from "@/lib/tools/output";

import {
  CONTEXT_TOOL_OUTPUT_BUDGET_RATIO,
  ESTIMATED_UTF8_BYTES_PER_TOKEN,
  MAX_CONTEXT_TOOL_OUTPUT_BYTES,
  MAX_CONTEXT_TOOL_OUTPUT_TOTAL_BYTES,
  type ContextRound,
} from "./types";

const CONTEXT_TRUNCATION_MARKER = "\n...[已截断工具输出]...\n";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fairAllocations(
  capacities: readonly number[],
  budget: number,
): number[] {
  const allocations = capacities.map(() => 0);
  let remaining = Math.min(
    budget,
    capacities.reduce((sum, value) => sum + value, 0),
  );
  let active = capacities
    .map((_value, index) => index)
    .filter((index) => capacities[index] > 0);

  while (remaining > 0 && active.length > 0) {
    const share = Math.floor(remaining / active.length);
    const remainder = remaining % active.length;
    let grantedThisPass = 0;
    const nextActive: number[] = [];
    for (let position = 0; position < active.length; position += 1) {
      const index = active[position];
      const available = capacities[index] - allocations[index];
      const requested = share + (position < remainder ? 1 : 0);
      const granted = Math.min(available, requested);
      allocations[index] += granted;
      remaining -= granted;
      grantedThisPass += granted;
      if (allocations[index] < capacities[index]) nextActive.push(index);
    }
    if (grantedThisPass === 0) break;
    active = nextActive;
  }
  return allocations;
}

export function calculateContextToolOutputBudgetBytes(
  inputBudgetTokens: number,
): number {
  if (!Number.isSafeInteger(inputBudgetTokens) || inputBudgetTokens <= 0) {
    throw new RangeError("inputBudgetTokens must be a positive safe integer");
  }
  return Math.min(
    MAX_CONTEXT_TOOL_OUTPUT_TOTAL_BYTES,
    Math.floor(
      inputBudgetTokens *
      ESTIMATED_UTF8_BYTES_PER_TOKEN *
      CONTEXT_TOOL_OUTPUT_BUDGET_RATIO,
    ),
  );
}

export function projectContextToolOutputs(
  rounds: readonly ContextRound[],
  inputBudgetTokens: number,
): readonly ContextRound[] {
  let remainingBudget = calculateContextToolOutputBudgetBytes(inputBudgetTokens);
  const allocations = new Map<string, number>();

  for (const round of rounds) {
    if (round.kind !== "tools") continue;
    for (const tool of round.tools) allocations.set(tool.toolCallId, 0);
  }

  // 先为可见的省略标记保留空间，再按“最新回合优先”分配正文额度。
  for (let roundIndex = rounds.length - 1; roundIndex >= 0; roundIndex -= 1) {
    const round = rounds[roundIndex];
    if (round.kind !== "tools") continue;
    const capacities = round.tools.map((tool) => {
      const output = tool.result.output;
      return output === undefined
        ? 0
        : Math.min(
            utf8ByteLength(output),
            utf8ByteLength(CONTEXT_TRUNCATION_MARKER),
          );
    });
    const roundAllocations = fairAllocations(capacities, remainingBudget);
    for (let index = 0; index < round.tools.length; index += 1) {
      const tool = round.tools[index];
      const allocation = roundAllocations[index];
      allocations.set(tool.toolCallId, allocation);
      remainingBudget -= allocation;
    }
  }

  for (let roundIndex = rounds.length - 1; roundIndex >= 0; roundIndex -= 1) {
    const round = rounds[roundIndex];
    if (round.kind !== "tools") continue;
    const capacities = round.tools.map((tool) => {
      const output = tool.result.output;
      const allocated = allocations.get(tool.toolCallId) ?? 0;
      return output === undefined
        ? 0
        : Math.max(
            0,
            Math.min(utf8ByteLength(output), MAX_CONTEXT_TOOL_OUTPUT_BYTES) -
              allocated,
          );
    });
    const extras = fairAllocations(capacities, remainingBudget);
    for (let index = 0; index < round.tools.length; index += 1) {
      const tool = round.tools[index];
      const extra = extras[index];
      allocations.set(
        tool.toolCallId,
        (allocations.get(tool.toolCallId) ?? 0) + extra,
      );
      remainingBudget -= extra;
    }
  }

  const projected = rounds.map((round): ContextRound => {
    const cloned = structuredClone(round);
    if (cloned.kind !== "tools") return deepFreeze(cloned);
    const tools = cloned.tools.map((tool) => {
      const output = tool.result.output;
      if (output === undefined) return deepFreeze(tool);
      const allocation = allocations.get(tool.toolCallId) ?? 0;
      const value = utf8ByteLength(output) <= allocation
        ? output
        : allocation <= utf8ByteLength(CONTEXT_TRUNCATION_MARKER)
          ? truncateUtf8(CONTEXT_TRUNCATION_MARKER, allocation).value
          : limitToolOutput(output, allocation).value;
      return deepFreeze({
        ...tool,
        result: {
          ...tool.result,
          output: value,
        },
      });
    });
    return deepFreeze({ ...cloned, tools });
  });
  return deepFreeze(projected);
}
