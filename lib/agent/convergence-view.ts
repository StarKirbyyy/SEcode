import { createHash } from "node:crypto";

import { redactSecrets } from "@/lib/domain";

import {
  getCurrentValidationEvidence,
  getUncoveredCompletionEvidence,
  type CompletionEvidenceState,
  type VerificationKind,
} from "./completion-evidence";
import type { ServiceHandoffState } from "./service-handoff";

export interface ConvergenceView {
  closing: boolean;
  pendingScopes: string[];
  pendingPaths: string[];
  validEvidence: Array<Readonly<{
    kind: VerificationKind;
    cwd: string;
    seq: number;
  }>>;
  readyUrls: string[];
  lastServiceFailure?: Readonly<{
    code: string;
    cwd: string;
  }>;
}

export function createConvergenceView(
  completion: CompletionEvidenceState,
  services: ServiceHandoffState,
  options: { closing?: boolean } = {},
): Readonly<ConvergenceView> {
  const uncovered = getUncoveredCompletionEvidence(completion);
  const view: ConvergenceView = {
    closing: options.closing === true,
    pendingScopes: Object.freeze([...uncovered.scopes].slice(0, 12)) as unknown as string[],
    pendingPaths: Object.freeze([...uncovered.paths].slice(0, 12)) as unknown as string[],
    validEvidence: Object.freeze(
      getCurrentValidationEvidence(completion).slice(-8),
    ) as unknown as ConvergenceView["validEvidence"],
    readyUrls: Object.freeze(
      services.successful.slice(-8).map((fact) => fact.readinessUrl),
    ) as unknown as string[],
    ...(services.lastFailure === undefined
      ? {}
      : { lastServiceFailure: Object.freeze({ ...services.lastFailure }) }),
  };
  return Object.freeze(view);
}

export function fingerprintConvergenceView(view: ConvergenceView): string {
  const stable = JSON.stringify({
    closing: view.closing,
    pendingScopes: [...view.pendingScopes].sort(),
    pendingPaths: [...view.pendingPaths].sort(),
    validEvidence: [...view.validEvidence]
      .map((item) => ({ kind: item.kind, cwd: item.cwd, seq: item.seq }))
      .sort((left, right) => left.seq - right.seq || left.cwd.localeCompare(right.cwd)),
    readyUrls: [...view.readyUrls].sort(),
    lastServiceFailure: view.lastServiceFailure,
  });
  return createHash("sha256").update(stable).digest("hex");
}

export function renderConvergenceMessage(
  view: ConvergenceView,
): string | undefined {
  const hasFacts =
    view.closing ||
    view.pendingPaths.length > 0 ||
    view.validEvidence.length > 0 ||
    view.readyUrls.length > 0 ||
    view.lastServiceFailure !== undefined;
  if (!hasFacts) return undefined;

  if (view.closing) {
    return redactSecrets(
      `已进入收尾阶段：只执行尚缺的最小相关验证、一次必要启动和至多一次需求 smoke；不要扩展范围、重复等价检查或整理文档。随后立即给出诚实的最终回答，未完成项直接说明。`,
    );
  }

  const evidence = view.validEvidence.length === 0
    ? "无"
    : view.validEvidence.map((item) => `${item.kind}@${item.cwd}#${item.seq}`).join("、");
  const ready = view.readyUrls.length === 0 ? "无" : view.readyUrls.join("、");
  const failure = view.lastServiceFailure === undefined
    ? ""
    : `；最后 service 失败：${view.lastServiceFailure.code}@${view.lastServiceFailure.cwd}`;
  if (view.pendingPaths.length > 0) {
    return redactSecrets(
      `收敛状态更新：仍待验证路径：${view.pendingPaths.join("、")}；当前有效验证：${evidence}；已就绪 URL：${ready}${failure}。只处理仍待验证范围；复用未失效事实，不重复等价验证、health、HTML 或目录盘点。`,
    );
  }
  if (view.readyUrls.length > 0) {
    return redactSecrets(
      `收敛状态更新：代码与配置变更已覆盖；当前有效验证：${evidence}；已就绪 URL：${ready}${failure}。请复用这些事实并直接给出最终回答，不再执行 health、HTML、list_directory 或“最终确认”。`,
    );
  }
  return redactSecrets(
    `收敛状态更新：当前有效验证：${evidence}${failure}。若用户目标已经满足，请直接给出最终回答，不重复未失效的验证。`,
  );
}
