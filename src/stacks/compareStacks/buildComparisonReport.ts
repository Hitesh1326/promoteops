import type { EnvironmentName } from "../../shared/environment.js";
import type {
  MapperEnvironmentValue,
  NormalizedMapperInstance,
} from "../../mapper/normalizeMapper/normalizeMapper.js";
import type {
  EnvironmentState,
  MappedStackInstance,
  NewerSide,
  StackDiff,
  StackComparisonReport,
  UnmappedStack,
  CollectionWarning,
} from "../stackComparison/stackComparison.js";
import type { RawStack } from "./fetchEnvStacks.js";
import { hashTemplate, normalizeTemplate, shortHash, templatesContentEqual } from "./normalizeTemplate.js";

type StackIndex = Map<string, RawStack>;

export interface BuildComparisonInput {
  instances: readonly NormalizedMapperInstance[];
  stacksByEnv: Record<EnvironmentName, readonly RawStack[]>;
  region: string;
  warnings?: readonly CollectionWarning[];
  generatedAt?: string;
}

/**
 * Turns mapper instances + fetched AWS stacks into the in-memory comparison
 * model (statuses, diffs, unmapped). Does not write HTML.
 */
export function buildComparisonReport(input: BuildComparisonInput): StackComparisonReport {
  const indexes: Record<EnvironmentName, StackIndex> = {
    dev: indexStacks(input.stacksByEnv.dev),
    test: indexStacks(input.stacksByEnv.test),
    prod: indexStacks(input.stacksByEnv.prod),
  };

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    source: "live",
    region: input.region,
    mappedInstances: input.instances.map((instance) => buildMappedInstance(instance, indexes)),
    unmappedStacks: buildUnmappedStacks(input.instances, input.stacksByEnv),
    collectionWarnings: [...(input.warnings ?? [])],
  };
}

export function lastActivityIso(stack: RawStack): string | undefined {
  const timestamp =
    stack.stackStatus === "CREATE_COMPLETE"
      ? stack.creationTime
      : (stack.lastUpdatedTime ?? stack.creationTime);
  return timestamp?.toISOString();
}

function indexStacks(stacks: readonly RawStack[]): StackIndex {
  return new Map(stacks.map((stack) => [stack.stackName.toLowerCase(), stack]));
}

function buildUnmappedStacks(
  instances: readonly NormalizedMapperInstance[],
  stacksByEnv: Record<EnvironmentName, readonly RawStack[]>,
): UnmappedStack[] {
  const mappedNames: Record<EnvironmentName, Set<string>> = {
    dev: mappedStackNames(instances, "dev"),
    test: mappedStackNames(instances, "test"),
    prod: mappedStackNames(instances, "prod"),
  };

  return (["dev", "test", "prod"] as const).flatMap((environment) =>
    stacksByEnv[environment]
      .filter((stack) => !mappedNames[environment].has(stack.stackName.toLowerCase()))
      .map((stack) => ({
        environment,
        stackName: stack.stackName,
        cloudFormationStatus: stack.stackStatus,
        lastActivity: lastActivityIso(stack),
      })),
  );
}

function mappedStackNames(
  instances: readonly NormalizedMapperInstance[],
  environment: EnvironmentName,
): Set<string> {
  const names = new Set<string>();
  for (const instance of instances) {
    const value = instance.environments[environment];
    if (value.kind === "stack") {
      names.add(value.value.toLowerCase());
    }
  }
  return names;
}

function buildMappedInstance(
  instance: NormalizedMapperInstance,
  indexes: Record<EnvironmentName, StackIndex>,
): MappedStackInstance {
  const diffs: StackDiff[] = [];

  const dev = resolveEnvironment("dev", instance.environments.dev, indexes.dev);
  const test = resolveEnvironment("test", instance.environments.test, indexes.test, {
    source: dev,
    fromEnv: "dev",
    diffs,
  });
  const prod = resolveEnvironment("prod", instance.environments.prod, indexes.prod, {
    source: test,
    fromEnv: "test",
    diffs,
  });

  return {
    templateName: instance.templateName,
    instanceId: instance.instanceId,
    environments: {
      dev: dev.state,
      test: test.state,
      prod: prod.state,
    },
    diffs,
  };
}

interface ResolvedEnv {
  state: EnvironmentState;
  stack?: RawStack;
  hash?: string;
}

interface HigherEnvContext {
  source: ResolvedEnv;
  fromEnv: "dev" | "test";
  diffs: StackDiff[];
}

function resolveEnvironment(
  environment: EnvironmentName,
  value: MapperEnvironmentValue,
  index: StackIndex,
  higher?: HigherEnvContext,
): ResolvedEnv {
  if (value.kind === "special") {
    if (value.value === "EXCLUDED") {
      return {
        state: {
          environment,
          status: "excluded",
          stackName: "EXCLUDED",
          comparisonContext: "Excluded by mapper",
        },
      };
    }

    return {
      state: {
        environment,
        status: "not_deployed",
        stackName: "NOT_DEPLOYED",
        comparisonContext: "Not configured for deployment",
      },
    };
  }

  const stackName = value.value;
  const stack = index.get(stackName.toLowerCase());
  if (!stack) {
    return {
      state: {
        environment,
        status: "not_deployed",
        stackName,
        comparisonContext: "Mapped stack not found in AWS",
      },
    };
  }

  const hash = hashTemplate(stack.templateBody);
  const displayHash = shortHash(stack.templateBody);
  const lastActivity = lastActivityIso(stack);

  if (environment === "dev" || !higher) {
    return {
      stack,
      hash,
      state: {
        environment,
        status: "current",
        stackName,
        lastActivity,
        shortHash: displayHash,
        comparisonContext: "Baseline source",
      },
    };
  }

  if (higher.source.hash === undefined || !higher.source.stack) {
    return {
      stack,
      hash,
      state: {
        environment,
        status: "unavailable",
        stackName,
        lastActivity,
        shortHash: displayHash,
        comparisonContext: "Source unavailable for comparison",
        unavailableReason: "Source environment stack is not deployed",
      },
    };
  }

  const side = newerSide(higher.source.stack, stack);
  const contentDiffers = !templatesContentEqual(
    higher.source.stack.templateBody,
    stack.templateBody,
  );
  // Timestamp-first: only Outdated when the lower env is strictly newer and content differs.
  // If the target is newer or times match, it is not behind for promotion purposes.
  const outdated = side === "source" && contentDiffers;
  const lowerLabel = higher.fromEnv === "dev" ? "Dev" : "Test";

  if (outdated) {
    higher.diffs.push({
      fromEnv: higher.fromEnv,
      toEnv: environment as "test" | "prod",
      sourceStackName: higher.source.stack.stackName,
      targetStackName: stack.stackName,
      sourceTemplate: normalizeTemplate(higher.source.stack.templateBody),
      targetTemplate: normalizeTemplate(stack.templateBody),
      newerSide: side,
    });
  }

  let comparisonContext: string;
  if (outdated) {
    comparisonContext = `Differs from ${lowerLabel}`;
  } else if (!contentDiffers) {
    comparisonContext = `Matches ${lowerLabel}`;
  } else if (side === "target") {
    comparisonContext = `${environment === "test" ? "Test" : "Prod"} is newer than ${lowerLabel}`;
  } else {
    comparisonContext = `Matches ${lowerLabel} for promotion (same activity time)`;
  }

  return {
    stack,
    hash,
    state: {
      environment,
      status: outdated ? "outdated" : "current",
      stackName,
      lastActivity,
      shortHash: displayHash,
      comparisonContext,
    },
  };
}

function newerSide(source: RawStack, target: RawStack): NewerSide {
  const sourceTime = lastActivityIso(source);
  const targetTime = lastActivityIso(target);
  if (!sourceTime || !targetTime) return "source";

  const sourceMs = Date.parse(sourceTime);
  const targetMs = Date.parse(targetTime);
  if (Number.isNaN(sourceMs) || Number.isNaN(targetMs)) return "source";
  if (targetMs > sourceMs) return "target";
  if (sourceMs > targetMs) return "source";
  return "same_time";
}
