import { z } from "zod";

import { MAX_APPROVAL_REASON_CHARACTERS } from "./types";

export const ApprovalDecisionSchema = z.strictObject({
  approved: z.boolean(),
  reason: z.string().max(MAX_APPROVAL_REASON_CHARACTERS).optional(),
});

export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
