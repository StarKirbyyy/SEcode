import { redactSecrets, type ToolResult } from "@/lib/domain";
import type { PreparedLocalToolInvocation } from "@/lib/tools";

const MAX_SUCCESSFUL_SERVICE_FACTS = 8;

export interface ServiceHandoffFact {
  cwd: string;
  program: string;
  args: readonly string[];
  readinessUrl: string;
  seq: number;
}

export interface ServiceHandoffState {
  readonly successful: ServiceHandoffFact[];
  attempted: boolean;
  lastAttemptSucceeded: boolean;
  correctionAttempts: number;
  lastFailure?: Readonly<{ code: string; cwd: string }>;
}

export type ServiceFinalDecision =
  | { kind: "accept"; appendix?: string }
  | { kind: "retry"; message: string };

export function createServiceHandoffState(): ServiceHandoffState {
  return {
    successful: [],
    attempted: false,
    lastAttemptSucceeded: false,
    correctionAttempts: 0,
  };
}

export function recordServiceHandoffToolResult(
  state: ServiceHandoffState,
  seq: number,
  invocation: PreparedLocalToolInvocation,
  result: ToolResult,
): void {
  if (
    invocation.name !== "run_process" ||
    invocation.arguments.lifecycle !== "service"
  ) return;

  state.attempted = true;
  const readiness = invocation.arguments.readiness;
  const succeeded =
    result.ok === true &&
    result.metadata?.ready === true &&
    readiness !== undefined;
  state.lastAttemptSucceeded = succeeded;
  if (!succeeded || readiness === undefined) {
    state.lastFailure = Object.freeze({
      code: result.error?.code ?? "UNKNOWN_SERVICE_FAILURE",
      cwd: invocation.arguments.cwd,
    });
    return;
  }
  state.lastFailure = undefined;

  const fact = Object.freeze({
    cwd: invocation.arguments.cwd,
    program: invocation.arguments.program,
    args: Object.freeze([...invocation.arguments.args]),
    readinessUrl: readiness.url,
    seq,
  });
  const existing = state.successful.findIndex((item) => item.cwd === fact.cwd);
  if (existing >= 0) state.successful.splice(existing, 1);
  state.successful.push(fact);
  if (state.successful.length > MAX_SUCCESSFUL_SERVICE_FACTS) {
    state.successful.splice(
      0,
      state.successful.length - MAX_SUCCESSFUL_SERVICE_FACTS,
    );
  }
}

function retryOrAppend(
  state: ServiceHandoffState,
  message: string,
  appendix: string,
): ServiceFinalDecision {
  if (state.correctionAttempts === 0) {
    state.correctionAttempts = 1;
    return { kind: "retry", message };
  }
  return { kind: "accept", appendix: redactSecrets(appendix) };
}

export function decideServiceFinal(
  state: ServiceHandoffState,
  content: string,
): ServiceFinalDecision {
  if (!state.attempted) return { kind: "accept" };
  if (!state.lastAttemptSucceeded) {
    const failure = state.lastFailure;
    return retryOrAppend(
      state,
      "最后一次 service 启动未成功。请继续修复并取得真实 readiness 成功事实；不要把未运行的服务写成已完成。",
      `服务未成功启动：${failure?.code ?? "UNKNOWN_SERVICE_FAILURE"}@${failure?.cwd ?? "."}。未提供可访问 URL。`,
    );
  }

  const missingUrls = state.successful
    .map((fact) => fact.readinessUrl)
    .filter((url) => !content.includes(url));
  if (missingUrls.length === 0) return { kind: "accept" };
  return retryOrAppend(
    state,
    `最终回答缺少已验证的访问链接：${missingUrls.join("、")}。请给出实际启动命令、这些可点击 URL、验证结果和限制，不要重新执行已经成功的工具。`,
    `已验证的服务地址：${missingUrls.join("、")}。`,
  );
}
