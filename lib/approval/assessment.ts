import type { PreparedLocalToolInvocation } from "@/lib/tools";

import { classifyProcessRisk } from "./process-policy";
import { createToolSummary } from "./summary";
import {
  MAX_APPROVAL_REASON_CHARACTERS,
  MAX_TOOL_SUMMARY_CHARACTERS,
  type RiskAssessment,
  type RiskReasonCode,
} from "./types";

const REASONS: Readonly<Record<RiskReasonCode, string>> = Object.freeze({
  TOOL_READ_ONLY: "该工具只在工作区边界内执行有限读取",
  TOOL_WORKSPACE_WRITE: "该工具在工作区内执行受路径边界与原子更新保护的修改",
  PROCESS_VERIFICATION: "该进程是精确匹配的项目构建、检查或测试脚本",
  PROCESS_GIT_READ_ONLY: "该进程是精确匹配的 Git 只读查询",
  PROCESS_DEPENDENCY_CHANGE: "该进程可能安装、删除或更新依赖并执行生命周期脚本",
  PROCESS_REPOSITORY_WRITE: "该 Git 操作可能修改工作树、引用或远程状态",
  PROCESS_SHELL: "该进程显式启动命令解释器",
  PROCESS_MIGRATION: "该进程可能执行迁移或改变外部数据状态",
  PROCESS_REPO_FORMAT: "该进程可能批量格式化或修复工作区文件",
  PROCESS_FILE_DELETE: "该进程可能删除一个或多个工作区文件",
  PROCESS_UNKNOWN: "该程序或参数形状不在自动允许规则中",
  PROCESS_PATH_QUALIFIED: "该程序使用未由窄允许表确认的路径限定可执行文件",
  DENY_PRIVILEGE_ESCALATION: "策略禁止权限提升或用户切换命令",
  DENY_SYSTEM_CONTROL: "策略禁止系统、服务、电源或磁盘控制命令",
  DENY_PROCESS_CONTROL: "策略禁止控制任意本机进程",
  DENY_BROAD_DELETE: "策略禁止宽泛或无法可靠限定范围的删除",
  DENY_GIT_HARD_RESET: "策略禁止 git reset --hard 及等价形状",
  DENY_EXPLICIT_WORKSPACE_ESCAPE: "策略禁止结构化参数中明确的工作区外路径",
  DENY_INVALID_INVOCATION: "工具调用身份或调用标识无效",
});

function createAssessment(
  decision: RiskAssessment["decision"],
  level: RiskAssessment["level"],
  reasonCode: RiskReasonCode,
  toolSummary: string,
): RiskAssessment {
  const reason = REASONS[reasonCode];
  if (
    reason.length > MAX_APPROVAL_REASON_CHARACTERS ||
    toolSummary.length > MAX_TOOL_SUMMARY_CHARACTERS
  ) {
    throw new RangeError("risk assessment exceeds approved display limits");
  }
  if (decision === "allow" && (level === "low" || level === "medium")) {
    return Object.freeze({ decision, level, reasonCode, reason, toolSummary });
  }
  if (decision === "require_approval" && level === "high") {
    return Object.freeze({ decision, level, reasonCode, reason, toolSummary });
  }
  if (decision === "deny" && level === "blocked") {
    return Object.freeze({ decision, level, reasonCode, reason, toolSummary });
  }
  throw new TypeError("invalid risk decision and level combination");
}

export function createInvalidInvocationAssessment(): Extract<
  RiskAssessment,
  { decision: "deny" }
> {
  return createAssessment(
    "deny",
    "blocked",
    "DENY_INVALID_INVOCATION",
    "无效工具调用",
  ) as Extract<RiskAssessment, { decision: "deny" }>;
}

export function assessLocalToolRisk(
  invocation: PreparedLocalToolInvocation,
): RiskAssessment {
  const toolSummary = createToolSummary(invocation);
  switch (invocation.name) {
    case "list_directory":
    case "read_file":
    case "search_text":
      return createAssessment(
        "allow",
        "low",
        "TOOL_READ_ONLY",
        toolSummary,
      );
    case "write_file":
    case "replace_in_file":
      return createAssessment(
        "allow",
        "medium",
        "TOOL_WORKSPACE_WRITE",
        toolSummary,
      );
    case "run_process": {
      const result = classifyProcessRisk(invocation.arguments);
      return createAssessment(
        result.decision,
        result.level,
        result.reasonCode,
        toolSummary,
      );
    }
  }
}
