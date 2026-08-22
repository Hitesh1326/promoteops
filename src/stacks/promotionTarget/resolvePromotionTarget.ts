/**
 * Resolve a single mapper instance + target stack name for one promotion pair.
 * Target EXCLUDED / NOT_DEPLOYED hard-stop planning until the mapper is updated.
 */
import { ENVIRONMENTS, type EnvironmentName } from "../../shared/environment.js";
import type { NormalizedMapperInstance } from "../../mapper/normalizeMapper/normalizeMapper.js";

export type PromotionSourceEnv = "dev" | "test";
export type PromotionTargetEnv = "test" | "prod";

export class PromotionTargetError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PromotionTargetError";
  }
}

export interface ResolvedPromotionTarget {
  instance: NormalizedMapperInstance;
  sourceEnv: PromotionSourceEnv;
  targetEnv: PromotionTargetEnv;
  /** Target stack name from the mapper (create or update is decided by live AWS). */
  stackName: string;
}

export function assertValidPromotionPair(
  sourceEnv: EnvironmentName,
  targetEnv: EnvironmentName,
): asserts sourceEnv is PromotionSourceEnv {
  const valid =
    (sourceEnv === "dev" && targetEnv === "test") ||
    (sourceEnv === "test" && targetEnv === "prod");
  if (!valid) {
    throw new PromotionTargetError("Supported promotion pairs are dev → test and test → prod.");
  }
}

export function resolvePromotionTarget(input: {
  instances: readonly NormalizedMapperInstance[];
  templateName: string;
  stackName?: string;
  sourceEnv: EnvironmentName;
  targetEnv: EnvironmentName;
}): ResolvedPromotionTarget {
  assertValidPromotionPair(input.sourceEnv, input.targetEnv);

  const matches = findMapperInstances(input.instances, input.templateName, input.stackName);
  if (matches.length === 0) {
    const stackPart = input.stackName ? ` with stack "${input.stackName}"` : "";
    throw new PromotionTargetError(
      `No mapped instance found for template "${input.templateName}"${stackPart}.`,
    );
  }
  if (matches.length > 1) {
    const options = matches
      .map((instance) => {
        const stacks = ENVIRONMENTS.map(
          (environment) => `${environment}=${formatEnvValue(instance, environment)}`,
        ).join(", ");
        return `- ${instance.instanceId} (${stacks})`;
      })
      .join("\n");
    throw new PromotionTargetError(
      `Template "${input.templateName}" matches ${matches.length} instances. Pass stackName to disambiguate:\n${options}`,
    );
  }

  const instance = matches[0]!;
  const sourceValue = instance.environments[input.sourceEnv];
  if (sourceValue.kind === "special") {
    throw new PromotionTargetError(
      `Source env ${input.sourceEnv} is ${sourceValue.value} for instance ${instance.instanceId}; cannot plan a promotion from that env.`,
    );
  }

  const targetValue = instance.environments[input.targetEnv];
  if (targetValue.kind === "special" && targetValue.value === "EXCLUDED") {
    throw new PromotionTargetError(
      `Target env ${input.targetEnv} is EXCLUDED for instance ${instance.instanceId}. ` +
        `PromoteOps will not create or update that stack. ` +
        `If this env should be promoted, update mapper.json to replace EXCLUDED with the real stack name, then run plan_stack_promotion again.`,
    );
  }

  if (targetValue.kind === "special" && targetValue.value === "NOT_DEPLOYED") {
    throw new PromotionTargetError(
      `Target env ${input.targetEnv} is NOT_DEPLOYED for instance ${instance.instanceId}. ` +
        `Update mapper.json: replace NOT_DEPLOYED with the intended stack name for ${input.targetEnv}, ` +
        `then run plan_stack_promotion again. PromoteOps will not invent a stack name or create a stack while the mapper still says NOT_DEPLOYED.`,
    );
  }

  return {
    instance,
    sourceEnv: input.sourceEnv,
    targetEnv: input.targetEnv as PromotionTargetEnv,
    stackName: targetValue.value,
  };
}

export function findMapperInstances(
  instances: readonly NormalizedMapperInstance[],
  templateName: string,
  stackName?: string,
): NormalizedMapperInstance[] {
  const templateKey = templateName.trim().toLocaleLowerCase();
  const stackKey = stackName?.trim().toLocaleLowerCase();

  return instances.filter((instance) => {
    if (instance.templateName.toLocaleLowerCase() !== templateKey) {
      return false;
    }
    if (!stackKey) {
      return true;
    }
    if (instance.instanceId.toLocaleLowerCase() === stackKey) {
      return true;
    }
    return ENVIRONMENTS.some((environment) => {
      const value = instance.environments[environment];
      return value.kind === "stack" && value.value.toLocaleLowerCase() === stackKey;
    });
  });
}

function formatEnvValue(instance: NormalizedMapperInstance, environment: EnvironmentName): string {
  const value = instance.environments[environment];
  return value.kind === "stack" ? value.value : value.value;
}
