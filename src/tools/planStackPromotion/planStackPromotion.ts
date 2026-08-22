/**
 * Read-only planning: local template + explicit params → persisted PlanRecord.
 * Never creates change sets or mutates CloudFormation.
 */
import { randomUUID } from "node:crypto";
import { getAwsClients, type EnvAwsClients } from "../../aws/clients/clients.js";
import {
  ABSENT_TARGET_HASH,
  inspectStack,
  type StackSnapshot,
} from "../../aws/stackInspect/inspectStack.js";
import { LocalFileAuditLogger, type AuditLogger } from "../../audit/localFileAuditLogger/localFileAuditLogger.js";
import { loadConfig, type PromoteOpsConfig } from "../../config/loadConfig/loadConfig.js";
import { loadMapper } from "../../mapper/loadMapper/loadMapper.js";
import {
  FilePlanRepository,
  type PlanRepository,
} from "../../planStore/filePlanRepository/filePlanRepository.js";
import type { PlanRecord } from "../../planStore/planRecord/planRecord.js";
import type { EnvironmentName } from "../../shared/environment.js";
import { readLocalTemplate } from "../../stacks/localTemplate/readLocalTemplate.js";
import {
  resolvePromotionTarget,
  type PromotionSourceEnv,
  type PromotionTargetEnv,
} from "../../stacks/promotionTarget/resolvePromotionTarget.js";

export interface PlanStackPromotionInput {
  templateName: string;
  stackName?: string;
  sourceEnv: PromotionSourceEnv;
  targetEnv: PromotionTargetEnv;
  /** Explicit parameter values for the target stack (no UsePreviousValue). */
  parameters: Record<string, string>;
  configPath?: string;
  projectRoot?: string;
}

export interface PlanStackPromotionResult {
  plan: PlanRecord;
  chatSummary: string;
  targetNewerWarning: boolean;
}

export interface PlanStackPromotionDeps {
  loadConfig?: typeof loadConfig;
  loadMapper?: typeof loadMapper;
  getAwsClients?: typeof getAwsClients;
  readLocalTemplate?: typeof readLocalTemplate;
  inspectStack?: typeof inspectStack;
  plans?: PlanRepository;
  audit?: AuditLogger;
  now?: () => Date;
  createPlanId?: () => string;
}

export async function planStackPromotion(
  input: PlanStackPromotionInput,
  deps: PlanStackPromotionDeps = {},
): Promise<PlanStackPromotionResult> {
  const loadConfigFn = deps.loadConfig ?? loadConfig;
  const loadMapperFn = deps.loadMapper ?? loadMapper;
  const getAwsClientsFn = deps.getAwsClients ?? getAwsClients;
  const readLocalTemplateFn = deps.readLocalTemplate ?? readLocalTemplate;
  const inspectStackFn = deps.inspectStack ?? inspectStack;
  const plans = deps.plans ?? new FilePlanRepository();
  const audit = deps.audit ?? new LocalFileAuditLogger();
  const now = deps.now ?? (() => new Date());
  const createPlanId = deps.createPlanId ?? (() => randomUUID());

  const config = await loadConfigFn({
    configPath: input.configPath,
    projectRoot: input.projectRoot,
  });
  const mapper = await loadMapperFn({ config });
  const target = resolvePromotionTarget({
    instances: mapper.instances,
    templateName: input.templateName,
    stackName: input.stackName,
    sourceEnv: input.sourceEnv,
    targetEnv: input.targetEnv,
  });

  const templateBody = await readLocalTemplateFn(
    config.resolvedPaths.templatesLocalPath,
    target.instance.templateName,
  );

  const targetClients = await getAwsClientsFn(input.targetEnv, config.aws);
  const targetSnapshot = await inspectStackFn(targetClients.cloudFormation, target.stackName);

  let targetNewerWarning = false;
  if (targetSnapshot.exists) {
    const sourceClients = await getAwsClientsFn(input.sourceEnv, config.aws);
    const sourceStackName = target.instance.environments[input.sourceEnv];
    if (sourceStackName.kind === "stack") {
      const sourceSnapshot = await inspectStackFn(
        sourceClients.cloudFormation,
        sourceStackName.value,
      );
      targetNewerWarning = isTargetNewer(sourceSnapshot, targetSnapshot);
    }
  }

  const plan: PlanRecord = {
    planId: createPlanId(),
    kind: "stack",
    createdAt: now().toISOString(),
    status: "pending",
    templateName: target.instance.templateName,
    instanceId: target.instance.instanceId,
    sourceEnv: input.sourceEnv,
    targetEnv: input.targetEnv,
    stackName: target.stackName,
    targetCurrentTemplateHash: targetSnapshot.exists
      ? targetSnapshot.templateHash
      : ABSENT_TARGET_HASH,
    templateBody,
    parameters: input.parameters,
  };

  await plans.save(plan);
  await audit.append({
    timestamp: plan.createdAt,
    action: "plan_created",
    planId: plan.planId,
    templateName: plan.templateName,
    instanceId: plan.instanceId,
    sourceEnv: plan.sourceEnv,
    targetEnv: plan.targetEnv,
    detail: targetSnapshot.exists ? "update" : "create",
  });

  return {
    plan,
    targetNewerWarning,
    chatSummary: formatPlanSummary(plan, targetSnapshot.exists, targetNewerWarning, config),
  };
}

function isTargetNewer(source: StackSnapshot, target: StackSnapshot): boolean {
  if (!source.lastActivity || !target.lastActivity) {
    return false;
  }
  return Date.parse(target.lastActivity) > Date.parse(source.lastActivity);
}

function formatPlanSummary(
  plan: PlanRecord,
  targetExists: boolean,
  targetNewerWarning: boolean,
  config: PromoteOpsConfig,
): string {
  const lines = [
    `Plan created: ${plan.planId}`,
    `${plan.sourceEnv.toUpperCase()} → ${plan.targetEnv.toUpperCase()}`,
    `Template: ${plan.templateName}`,
    `Instance: ${plan.instanceId}`,
    `Target stack: ${plan.stackName} (${targetExists ? "update" : "create"})`,
    `Parameters: ${Object.keys(plan.parameters).length}`,
    `Region: ${config.aws.region}`,
    "No CloudFormation writes were performed. Review the plan, then call execute_stack_promotion with this planId.",
  ];
  if (targetNewerWarning) {
    lines.splice(
      5,
      0,
      "WARNING: Target stack appears newer than the source stack by timestamp. Extra caution before execute.",
    );
  }
  return lines.join("\n");
}
