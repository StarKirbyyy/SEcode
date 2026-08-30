export type PlanApprovalWaitResolution = Readonly<{
  approved: boolean;
  reason?: string;
}>;

export class AgentPlanApprovalWaitAbortedError extends Error {
  constructor() {
    super("计划审批等待已取消");
    this.name = "AgentPlanApprovalWaitAbortedError";
  }
}

export class AgentPlanApprovalWait {
  readonly promise: Promise<PlanApprovalWaitResolution>;
  private settleResolve!: (value: PlanApprovalWaitResolution) => void;
  private settleReject!: (reason?: unknown) => void;
  private settled = false;

  constructor() {
    this.promise = new Promise<PlanApprovalWaitResolution>((resolve, reject) => {
      this.settleResolve = resolve;
      this.settleReject = reject;
    });
  }

  resolve(value: PlanApprovalWaitResolution): boolean {
    if (this.settled) return false;
    this.settled = true;
    this.settleResolve(Object.freeze({ ...value }));
    return true;
  }

  reject(reason: unknown): boolean {
    if (this.settled) return false;
    this.settled = true;
    this.settleReject(reason);
    return true;
  }

  abort(): boolean {
    return this.reject(new AgentPlanApprovalWaitAbortedError());
  }
}
