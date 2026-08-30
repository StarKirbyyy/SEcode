import { describe, expect, it } from "vitest";

import {
  deriveSessionTitle,
  foldWorkspacePath,
  groupSessionsByWorkspace,
  selectConfiguredModelId,
  workspaceBasename,
} from "@/lib/client/catalog";
import type { PublicSessionMetadata } from "@/lib/client/types";

const sessions: PublicSessionMetadata[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "最近任务",
    workspacePath: "/Users/example/Codes/secode",
    modelProfileId: "deepseek",
    createdAt: "2026-08-28T10:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    title: "另一个项目",
    workspacePath: "/Users/example/Codes/other",
    modelProfileId: "generic",
    createdAt: "2026-08-28T09:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    title: "较早任务",
    workspacePath: "/Users/example/Codes/secode",
    modelProfileId: "deepseek",
    createdAt: "2026-08-28T08:00:00.000Z",
  },
];

describe("client catalog view helpers", () => {
  it("groups sessions by workspace without changing their stable order", () => {
    expect(groupSessionsByWorkspace(sessions)).toEqual([
      {
        workspacePath: "/Users/example/Codes/secode",
        label: "secode",
        sessions: [sessions[0], sessions[2]],
      },
      {
        workspacePath: "/Users/example/Codes/other",
        label: "other",
        sessions: [sessions[1]],
      },
    ]);
    expect(sessions.map((session) => session.title)).toEqual(["最近任务", "另一个项目", "较早任务"]);
  });

  it("keeps canonical values separate from short path labels", () => {
    expect(workspaceBasename("/Users/example/Codes/secode/")).toBe("secode");
    expect(workspaceBasename("/")).toBe("/");
    expect(foldWorkspacePath("/Users/example/Codes/secode")).toBe("…/Codes/secode");
    expect(foldWorkspacePath("/Codes/secode")).toBe("/Codes/secode");
  });

  it("derives a concise title from the first non-empty line by grapheme", () => {
    expect(deriveSessionTitle("\n  修复 slugify 的重复空白问题  \n不要改测试")).toBe("修复 slugify 的重复空白问题");
    expect(deriveSessionTitle(`${"好".repeat(41)}\nignored`)).toBe(`${"好".repeat(40)}…`);
    expect(deriveSessionTitle(`${"👩🏽‍💻".repeat(41)}`)).toBe(`${"👩🏽‍💻".repeat(40)}…`);
    expect(deriveSessionTitle("  \n\t ")).toBeUndefined();
  });

  it("retains a valid choice or selects the first configured model", () => {
    const models = [
      { id: "deepseek", configured: false },
      { id: "generic", configured: true },
      { id: "longcat", configured: true },
    ];
    expect(selectConfiguredModelId(models, "longcat")).toBe("longcat");
    expect(selectConfiguredModelId(models, "deepseek")).toBe("generic");
    expect(selectConfiguredModelId([{ id: "deepseek", configured: false }])).toBeUndefined();
  });
});
