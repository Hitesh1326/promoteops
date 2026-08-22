import type { PlanRecord } from "../planRecord/planRecord.js";

export function isPlanStale(
  plan: Pick<PlanRecord, "targetCurrentTemplateHash">,
  liveTargetTemplateHash: string,
): boolean {
  return plan.targetCurrentTemplateHash !== liveTargetTemplateHash;
}

export function isPlanAlreadyExecuted(plan: Pick<PlanRecord, "status">): boolean {
  return plan.status === "executed";
}
