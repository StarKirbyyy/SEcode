import { describe, expect, it } from "vitest";

import { utf8ByteLength, type ToolCallId } from "@/lib/domain";
import {
  calculateContextToolOutputBudgetBytes,
  projectContextToolOutputs,
} from "@/lib/context/tool-output-projection";
import type { ContextRound } from "@/lib/context/types";

function toolRound(
  roundIndex: number,
  outputs: readonly string[],
): Extract<ContextRound, { kind: "tools" }> {
  return Object.freeze({
    kind: "tools",
    runId: `20000000-0000-4000-8000-${String(roundIndex).padStart(12, "0")}`,
    iteration: roundIndex,
    startSeq: roundIndex * 10,
    endSeq: roundIndex * 10 + 5,
    content: null,
    tools: Object.freeze(outputs.map((output, index) => Object.freeze({
      toolCallId: `30000000-0000-4000-8000-${String(roundIndex * 10 + index).padStart(12, "0")}` as ToolCallId,
      toolName: "read_file",
      publicArguments: Object.freeze({ path: `fixture-${roundIndex}-${index}.txt` }),
      argumentsTruncated: false,
      requestedSeq: roundIndex * 10 + index,
      resultSeq: roundIndex * 10 + index + 1,
      result: Object.freeze({
        ok: true,
        summary: "读取完成",
        output,
        metadata: Object.freeze({ sha256: "0".repeat(64) }),
      }),
    }))),
  });
}

function projectedOutputs(rounds: readonly ContextRound[]): string[] {
  return rounds.flatMap((round) => round.kind === "tools"
    ? round.tools.map((tool) => tool.result.output ?? "")
    : []);
}

describe("context tool output projection", () => {
  it("uses the dynamic total budget capped at 32768 bytes", () => {
    expect(calculateContextToolOutputBudgetBytes(48_000)).toBe(24_000);
    expect(calculateContextToolOutputBudgetBytes(100_000)).toBe(32_768);
  });

  it("keeps small outputs byte-for-byte and does not mutate the source", () => {
    const source = Object.freeze([toolRound(1, ["短输出", "第二项"])]);
    const snapshot = JSON.stringify(source);
    const projected = projectContextToolOutputs(source, 48_000);
    expect(projectedOutputs(projected)).toEqual(["短输出", "第二项"]);
    expect(JSON.stringify(source)).toBe(snapshot);
    expect(projected).not.toBe(source);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen((projected[0] as Extract<ContextRound, { kind: "tools" }>).tools[0].result)).toBe(true);
  });

  it("bounds each output and the aggregate while preferring newer rounds", () => {
    const source = Object.freeze([
      toolRound(1, ["旧".repeat(20_000)]),
      toolRound(2, ["新".repeat(20_000)]),
    ]);
    const projected = projectContextToolOutputs(source, 48_000);
    const [older, newer] = projectedOutputs(projected);
    expect(utf8ByteLength(older)).toBeLessThanOrEqual(8_192);
    expect(utf8ByteLength(newer)).toBeLessThanOrEqual(8_192);
    expect(utf8ByteLength(older) + utf8ByteLength(newer)).toBeLessThanOrEqual(24_000);
    expect(utf8ByteLength(newer)).toBeGreaterThanOrEqual(8_190);
    expect(newer).toContain("已截断");
  });

  it("shares one round fairly and produces deterministic UTF-8-safe output", () => {
    const source = Object.freeze([toolRound(7, [
      "甲".repeat(20_000),
      "乙".repeat(20_000),
      "丙".repeat(20_000),
      "丁".repeat(20_000),
    ])]);
    const first = projectContextToolOutputs(source, 48_000);
    const second = projectContextToolOutputs(source, 48_000);
    const byteLengths = projectedOutputs(first).map(utf8ByteLength);
    expect(Math.max(...byteLengths) - Math.min(...byteLengths)).toBeLessThanOrEqual(1);
    expect(byteLengths.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(24_000);
    expect(first).toEqual(second);
    for (const output of projectedOutputs(first)) {
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(output)))
        .not.toThrow();
    }
  });

  it("spends remaining body bytes on newer rounds before older rounds", () => {
    const source = Object.freeze([
      toolRound(1, ["a".repeat(20_000)]),
      toolRound(2, ["b".repeat(20_000)]),
      toolRound(3, ["c".repeat(20_000)]),
      toolRound(4, ["d".repeat(20_000)]),
    ]);
    const outputs = projectedOutputs(projectContextToolOutputs(source, 48_000));
    expect(utf8ByteLength(outputs[3])).toBe(8_192);
    expect(utf8ByteLength(outputs[2])).toBe(8_192);
    expect(utf8ByteLength(outputs[1])).toBeGreaterThan(utf8ByteLength(outputs[0]));
    expect(outputs[0]).toContain("已截断工具输出");
    expect(outputs.reduce((sum, output) => sum + utf8ByteLength(output), 0))
      .toBeLessThanOrEqual(24_000);
  });
});
