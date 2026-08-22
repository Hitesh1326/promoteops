import { z } from "zod";
import { nonEmptyString } from "../../shared/primitives.js";

export const PLAN_STATUSES = ["pending", "executed"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const planRecordSchema = z
  .object({
    planId: nonEmptyString,
    kind: z.literal("stack"),
    createdAt: nonEmptyString,
    status: z.enum(PLAN_STATUSES),
    executedAt: nonEmptyString.optional(),
    templateName: nonEmptyString,
    instanceId: nonEmptyString,
    sourceEnv: z.enum(["dev", "test"]),
    targetEnv: z.enum(["test", "prod"]),
    stackName: nonEmptyString,
    targetCurrentTemplateHash: nonEmptyString,
    templateBody: z.string(),
    parameters: z.record(nonEmptyString, z.string()),
  })
  .strict()
  .superRefine((plan, context) => {
    const validPair =
      (plan.sourceEnv === "dev" && plan.targetEnv === "test") ||
      (plan.sourceEnv === "test" && plan.targetEnv === "prod");
    if (!validPair) {
      context.addIssue({
        code: "custom",
        message: "Supported promotion pairs are dev → test and test → prod.",
        path: ["targetEnv"],
      });
    }
    if (plan.status === "executed" && !plan.executedAt) {
      context.addIssue({
        code: "custom",
        message: "executed plans require executedAt.",
        path: ["executedAt"],
      });
    }
  });

export type PlanRecord = z.infer<typeof planRecordSchema>;

export function parsePlanRecord(value: unknown, planIdForError?: string): PlanRecord {
  const result = planRecordSchema.safeParse(value);
  if (!result.success) {
    const label = planIdForError ? `plan ${planIdForError}` : "plan record";
    throw new Error(`Invalid ${label}: ${result.error.issues[0]?.message ?? "validation failed"}`);
  }
  return result.data;
}
