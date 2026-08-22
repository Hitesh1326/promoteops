/**
 * Mutating execute: confirm → reject stale/already-executed → change set → audit.
 */
import {
  applyStackChangeSet,
  type ApplyStackChangeSetResult,
  type ChangeSetKind,
} from "../../aws/changeSets/applyStackChangeSet.js";
import { getAwsClients } from "../../aws/clients/clients.js";
import {
  ABSENT_TARGET_HASH,
  inspectStack,
} from "../../aws/stackInspect/inspectStack.js";
import { LocalFileAuditLogger, type AuditLogger } from "../../audit/localFileAuditLogger/localFileAuditLogger.js";
import { loadConfig } from "../../config/loadConfig/loadConfig.js";
import {
  FilePlanRepository,
  type PlanRepository,
} from "../../planStore/filePlanRepository/filePlanRepository.js";
import {
  isPlanAlreadyExecuted,
  isPlanStale,
} from "../../planStore/isPlanStale/isPlanStale.js";
import type { PlanRecord } from "../../planStore/planRecord/planRecord.js";

export type ElicitAction = "accept" | "decline" | "cancel";

export interface PromotionConfirmation {
  action: ElicitAction;
}

export interface ExecuteStackPromotionInput {
  planId: string;
  configPath?: string;
  projectRoot?: string;
}

export interface ExecuteStackPromotionResult {
  plan: PlanRecord;
  changeSet?: ApplyStackChangeSetResult;
  chatSummary: string;
  outcome: "executed" | "failed" | "denied" | "rejected_stale" | "rejected_already_executed";
}

export interface ExecuteStackPromotionDeps {
  loadConfig?: typeof loadConfig;
  getAwsClients?: typeof getAwsClients;
  inspectStack?: typeof inspectStack;
  applyStackChangeSet?: typeof applyStackChangeSet;
  plans?: PlanRepository;
  audit?: AuditLogger;
  now?: () => Date;
  /** Required in production; pluggable for tests. */
  confirm?: (plan: PlanRecord) => Promise<PromotionConfirmation>;
}

export class ExecuteStackPromotionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ExecuteStackPromotionError";
  }
}

export async function executeStackPromotion(
  input: ExecuteStackPromotionInput,
  deps: ExecuteStackPromotionDeps = {},
): Promise<ExecuteStackPromotionResult> {
  const loadConfigFn = deps.loadConfig ?? loadConfig;
  const getAwsClientsFn = deps.getAwsClients ?? getAwsClients;
  const inspectStackFn = deps.inspectStack ?? inspectStack;
  const applyFn = deps.applyStackChangeSet ?? applyStackChangeSet;
  const plans = deps.plans ?? new FilePlanRepository();
  const audit = deps.audit ?? new LocalFileAuditLogger();
  const now = deps.now ?? (() => new Date());
  const confirm = deps.confirm;

  if (!confirm) {
    throw new ExecuteStackPromotionError(
      "execute_stack_promotion requires a confirmation callback.",
    );
  }

  const plan = await plans.load(input.planId);
  const timestamp = now().toISOString();

  if (isPlanAlreadyExecuted(plan)) {
    await audit.append({
      timestamp,
      action: "plan_rejected_already_executed",
      planId: plan.planId,
      templateName: plan.templateName,
      instanceId: plan.instanceId,
      sourceEnv: plan.sourceEnv,
      targetEnv: plan.targetEnv,
    });
    return {
      plan,
      outcome: "rejected_already_executed",
      chatSummary: `Plan ${plan.planId} is already executed; refusing to run again.`,
    };
  }

  const confirmation = await confirm(plan);
  if (confirmation.action !== "accept") {
    await audit.append({
      timestamp,
      action: "elicit_denied",
      planId: plan.planId,
      templateName: plan.templateName,
      instanceId: plan.instanceId,
      sourceEnv: plan.sourceEnv,
      targetEnv: plan.targetEnv,
      detail: confirmation.action,
    });
    return {
      plan,
      outcome: "denied",
      chatSummary: `Promotion of plan ${plan.planId} was ${confirmation.action}; no CloudFormation changes were made.`,
    };
  }

  const config = await loadConfigFn({
    configPath: input.configPath,
    projectRoot: input.projectRoot,
  });
  const targetClients = await getAwsClientsFn(plan.targetEnv, config.aws);
  const live = await inspectStackFn(targetClients.cloudFormation, plan.stackName);

  if (isPlanStale(plan, live.templateHash)) {
    await audit.append({
      timestamp,
      action: "plan_rejected_stale",
      planId: plan.planId,
      templateName: plan.templateName,
      instanceId: plan.instanceId,
      sourceEnv: plan.sourceEnv,
      targetEnv: plan.targetEnv,
      detail: `expected=${plan.targetCurrentTemplateHash} live=${live.templateHash}`,
    });
    return {
      plan,
      outcome: "rejected_stale",
      chatSummary:
        `Plan ${plan.planId} is stale: target stack "${plan.stackName}" changed since planning. ` +
        `Create a new plan with plan_stack_promotion.`,
    };
  }

  const changeSetKind: ChangeSetKind =
    plan.targetCurrentTemplateHash === ABSENT_TARGET_HASH ? "CREATE" : "UPDATE";

  const changeSet = await applyFn({
    client: targetClients.cloudFormation,
    stackName: plan.stackName,
    templateBody: plan.templateBody,
    parameters: plan.parameters,
    changeSetKind,
  });

  const executed = await plans.markExecuted(plan.planId, timestamp);
  // succeeded is undefined only when waitForCompletion was explicitly disabled;
  // treat that as fire-and-forget success since no final status was polled for.
  const succeeded = changeSet.succeeded ?? true;

  await audit.append({
    timestamp,
    action: succeeded ? "plan_executed" : "plan_execution_failed",
    planId: plan.planId,
    templateName: plan.templateName,
    instanceId: plan.instanceId,
    sourceEnv: plan.sourceEnv,
    targetEnv: plan.targetEnv,
    detail: [
      `${changeSet.changeSetKind}:${changeSet.changeSetName}`,
      changeSet.finalStatus,
      changeSet.statusReason,
    ]
      .filter(Boolean)
      .join(" | "),
  });

  if (!succeeded) {
    return {
      plan: executed,
      changeSet,
      outcome: "failed",
      chatSummary: [
        `Plan ${plan.planId} did NOT succeed.`,
        `${plan.sourceEnv.toUpperCase()} → ${plan.targetEnv.toUpperCase()}`,
        `Stack: ${changeSet.stackName}`,
        `Change set: ${changeSet.changeSetName} (${changeSet.changeSetKind})`,
        `Final status: ${changeSet.finalStatus}`,
        changeSet.statusReason ? `Reason: ${changeSet.statusReason}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  return {
    plan: executed,
    changeSet,
    outcome: "executed",
    chatSummary: [
      `Executed plan ${plan.planId}`,
      `${plan.sourceEnv.toUpperCase()} → ${plan.targetEnv.toUpperCase()}`,
      `Stack: ${changeSet.stackName}`,
      `Change set: ${changeSet.changeSetName} (${changeSet.changeSetKind})`,
      `Final status: ${changeSet.finalStatus ?? "not polled — waitForCompletion was disabled"}`,
    ].join("\n"),
  };
}
