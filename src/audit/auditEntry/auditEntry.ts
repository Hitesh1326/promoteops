import { z } from "zod";
import { nonEmptyString } from "../../shared/primitives.js";

export const AUDIT_ACTIONS = [
  "plan_created",
  "plan_executed",
  "plan_execution_failed",
  "plan_rejected_stale",
  "plan_rejected_already_executed",
  "elicit_denied",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditEntrySchema = z
  .object({
    timestamp: nonEmptyString,
    action: z.enum(AUDIT_ACTIONS),
    planId: nonEmptyString,
    templateName: nonEmptyString.optional(),
    instanceId: nonEmptyString.optional(),
    sourceEnv: z.enum(["dev", "test"]).optional(),
    targetEnv: z.enum(["test", "prod"]).optional(),
    detail: z.string().optional(),
  })
  .strict();

export type AuditEntry = z.infer<typeof auditEntrySchema>;

export function parseAuditEntry(value: unknown): AuditEntry {
  const result = auditEntrySchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid audit entry: ${result.error.issues[0]?.message ?? "validation failed"}`,
    );
  }
  return result.data;
}
