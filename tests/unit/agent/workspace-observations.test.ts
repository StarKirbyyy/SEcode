import { describe, expect, it } from "vitest";

import type { JsonObject, ToolCall, ToolResult } from "@/lib/domain";
import {
  createWorkspaceObservationState,
  evaluateWriteDependency,
  isObservedDirectory,
  updateWorkspaceObservations,
} from "@/lib/agent/workspace-observations";
import { prepareLocalToolCall, type PreparedLocalToolInvocation } from "@/lib/tools";

function invocation(name: string, arguments_: JsonObject): PreparedLocalToolInvocation {
  const prepared = prepareLocalToolCall({
    id: "19000000-0000-4000-8000-000000000001",
    name,
    arguments: arguments_,
  } as ToolCall);
  if (!prepared.ok) throw new Error(prepared.result.summary);
  return prepared.invocation;
}

function listing(
  output: string,
  metadata: JsonObject = {},
): ToolResult {
  return {
    ok: true,
    summary: "目录读取完成",
    output,
    metadata: {
      path: ".",
      depth: 1,
      returnedEntries: output === "" ? 0 : output.split("\n").length,
      truncated: false,
      ignoredEntries: 0,
      blockedEntries: 0,
      unsupportedEntries: 0,
      ...metadata,
    },
  };
}

describe("run 内工作区观察账本", () => {
  it("用完整空根列表证明直接子目录缺失", () => {
    const state = createWorkspaceObservationState();
    updateWorkspaceObservations(
      state,
      invocation("list_directory", { path: ".", depth: 1 }),
      listing(""),
    );

    expect(evaluateWriteDependency(
      state,
      invocation("write_file", { path: "server/index.ts", content: "" }),
    )).toEqual({ kind: "known_missing_parent", parent: "server" });
  });

  it("用完整非空列表区分存在和缺失的父目录", () => {
    const state = createWorkspaceObservationState();
    updateWorkspaceObservations(
      state,
      invocation("list_directory", { path: ".", depth: 1 }),
      listing("目录      server\n文件      package.json"),
    );

    expect(evaluateWriteDependency(
      state,
      invocation("write_file", { path: "server/index.ts", content: "" }),
    )).toEqual({ kind: "allow" });
    expect(evaluateWriteDependency(
      state,
      invocation("write_file", { path: "client/index.ts", content: "" }),
    )).toEqual({ kind: "known_missing_parent", parent: "client" });
  });

  const incompleteMetadata: JsonObject[] = [
    { truncated: true },
    { blockedEntries: 1 },
    { ignoredEntries: 1 },
    { unsupportedEntries: 1 },
  ];

  it.each(incompleteMetadata)("对不完整列表保持未知并允许写入：%o", (metadata) => {
    const state = createWorkspaceObservationState();
    updateWorkspaceObservations(
      state,
      invocation("list_directory", { path: ".", depth: 1 }),
      listing("", metadata),
    );
    expect(evaluateWriteDependency(
      state,
      invocation("write_file", { path: "server/index.ts", content: "" }),
    )).toEqual({ kind: "allow" });
  });

  it("后续不完整列表撤销同一路径的旧缺失事实", () => {
    const state = createWorkspaceObservationState();
    const rootList = invocation("list_directory", { path: ".", depth: 1 });
    const write = invocation("write_file", { path: "server/index.ts", content: "" });
    updateWorkspaceObservations(state, rootList, listing(""));
    expect(evaluateWriteDependency(state, write).kind).toBe("known_missing_parent");
    updateWorkspaceObservations(state, rootList, listing("", { truncated: true }));
    expect(evaluateWriteDependency(state, write)).toEqual({ kind: "allow" });
  });

  it("不把未覆盖父级的列表或未知事实当作缺失证明", () => {
    const state = createWorkspaceObservationState();
    expect(evaluateWriteDependency(
      state,
      invocation("write_file", { path: "server/index.ts", content: "" }),
    )).toEqual({ kind: "allow" });
    updateWorkspaceObservations(
      state,
      invocation("list_directory", { path: "client", depth: 1 }),
      listing("", { path: "client" }),
    );
    expect(evaluateWriteDependency(
      state,
      invocation("write_file", { path: "server/index.ts", content: "" }),
    )).toEqual({ kind: "allow" });
  });

  it("只使用准备阶段规范化后的相对路径", () => {
    const state = createWorkspaceObservationState();
    updateWorkspaceObservations(
      state,
      invocation("list_directory", { path: "./", depth: 1 }),
      listing(""),
    );
    expect(evaluateWriteDependency(
      state,
      invocation("write_file", { path: "./server//index.ts", content: "" }),
    )).toEqual({ kind: "known_missing_parent", parent: "server" });
  });

  it("run_process 后不会把目录创建当作已观察事实", () => {
    const state = createWorkspaceObservationState();
    updateWorkspaceObservations(
      state,
      invocation("list_directory", { path: ".", depth: 1 }),
      listing(""),
    );
    const write = invocation("write_file", { path: "server/index.ts", content: "" });
    expect(evaluateWriteDependency(state, write).kind).toBe("known_missing_parent");

    updateWorkspaceObservations(
      state,
      invocation("run_process", { program: "mkdir", args: ["server"] }),
      { ok: true, summary: "目录创建完成" },
    );
    expect(evaluateWriteDependency(state, write)).toEqual({ kind: "allow" });
    expect(isObservedDirectory(state, "server")).toBe(false);
  });

  it("目录创建后的完整重新列表允许写入", () => {
    const state = createWorkspaceObservationState();
    const rootList = invocation("list_directory", { path: ".", depth: 1 });
    updateWorkspaceObservations(state, rootList, listing(""));
    updateWorkspaceObservations(
      state,
      invocation("run_process", { program: "mkdir", args: ["server"] }),
      { ok: true, summary: "目录创建完成" },
    );
    updateWorkspaceObservations(state, rootList, listing("目录      server"));
    expect(isObservedDirectory(state, "server")).toBe(true);
    expect(evaluateWriteDependency(
      state,
      invocation("write_file", { path: "server/index.ts", content: "" }),
    )).toEqual({ kind: "allow" });
  });

  it("符号链接和不完整列表不能证明待恢复目录存在", () => {
    const state = createWorkspaceObservationState();
    const rootList = invocation("list_directory", { path: ".", depth: 1 });
    updateWorkspaceObservations(state, rootList, listing("符号链接  server"));
    expect(isObservedDirectory(state, "server")).toBe(false);
    updateWorkspaceObservations(
      state,
      rootList,
      listing("目录      server", { truncated: true }),
    );
    expect(isObservedDirectory(state, "server")).toBe(false);
  });
});
