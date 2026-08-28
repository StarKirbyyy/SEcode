import type {
  AuthorizedLocalToolInvocation,
  PendingToolApproval,
} from "@/lib/approval";
import type { ToolResult } from "@/lib/domain";

export type ApprovalWaitResolution =
  | Readonly<{
      status: "authorized";
      authorization: AuthorizedLocalToolInvocation;
    }>
  | Readonly<{ status: "rejected"; result: ToolResult }>;

export class AgentApprovalWaitAbortedError extends Error {
  constructor() {
    super("审批等待已取消");
    this.name = "AgentApprovalWaitAbortedError";
  }
}

export class AgentApprovalWait {
  readonly pending: PendingToolApproval;
  readonly promise: Promise<ApprovalWaitResolution>;
  private settled = false;
  private readonly resolvePromise: (value: ApprovalWaitResolution) => void;
  private readonly rejectPromise: (reason: unknown) => void;

  constructor(pending: PendingToolApproval) {
    this.pending = pending;
    let resolvePromise!: (value: ApprovalWaitResolution) => void;
    let rejectPromise!: (reason: unknown) => void;
    this.promise = new Promise<ApprovalWaitResolution>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    this.resolvePromise = resolvePromise;
    this.rejectPromise = rejectPromise;
  }

  resolve(value: ApprovalWaitResolution): boolean {
    if (this.settled) return false;
    this.settled = true;
    this.resolvePromise(value);
    return true;
  }

  reject(reason: unknown): boolean {
    if (this.settled) return false;
    this.settled = true;
    this.rejectPromise(reason);
    return true;
  }

  abort(): boolean {
    return this.reject(new AgentApprovalWaitAbortedError());
  }
}
