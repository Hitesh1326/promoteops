import { ENVIRONMENTS, type EnvironmentName } from "../../shared/environment.js";
import { isDeployableValue, isSpecialValue, type SpecialMapperValue } from "../specialValues/specialValues.js";

interface MapperInstanceInput {
  dev: string;
  test: string;
  prod: string;
}

export type MapperEnvironmentValue =
  | {
      kind: "stack";
      value: string;
    }
  | {
      kind: "special";
      value: SpecialMapperValue;
    };

export interface NormalizedMapperInstance {
  templateName: string;
  instanceId: string;
  environments: Record<EnvironmentName, MapperEnvironmentValue>;
  raw: MapperInstanceInput;
}

export class MapperNormalizationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MapperNormalizationError";
  }
}

/** Also enforces uniqueness across the whole mapper, not just within one template's array. */
export function buildMapperInstances(mapper: {
  mappings: Record<string, MapperInstanceInput[]>;
}): NormalizedMapperInstance[] {
  const instances = Object.entries(mapper.mappings).flatMap(([templateName, rawInstances]) =>
    rawInstances.map((instance) => ({
      templateName,
      instanceId: getMapperInstanceId(templateName, instance),
      environments: normalizeMapperInstance(instance),
      raw: instance,
    })),
  );
  assertUniqueInstanceIds(instances);
  return instances;
}

export function normalizeMapperInstance(
  instance: MapperInstanceInput,
): Record<EnvironmentName, MapperEnvironmentValue> {
  return Object.fromEntries(
    ENVIRONMENTS.map((environment) => {
      const value = instance[environment];
      return [
        environment,
        isSpecialValue(value)
          ? {
              kind: "special" as const,
              value,
            }
          : {
              kind: "stack" as const,
              value,
            },
      ];
    }),
  ) as Record<EnvironmentName, MapperEnvironmentValue>;
}

export function getMapperInstanceId(templateName: string, instance: MapperInstanceInput): string {
  const id = ENVIRONMENTS.map((environment) => instance[environment]).find(isDeployableValue);
  if (!id) {
    throw new MapperNormalizationError(
      `Mapper entry for template "${templateName}" has no deployable stack name; at least one env must not be a special value`,
    );
  }
  return id;
}

/**
 * Instances are addressed by instanceId alone (no numeric indices), so a
 * collision here would make two unrelated instances indistinguishable to
 * every downstream tool (report/plan/execute).
 */
function assertUniqueInstanceIds(instances: NormalizedMapperInstance[]): void {
  const templateByInstanceId = new Map<string, string>();
  for (const instance of instances) {
    const existingTemplate = templateByInstanceId.get(instance.instanceId);
    if (existingTemplate) {
      throw new MapperNormalizationError(
        `Duplicate mapper instance id "${instance.instanceId}": used by both "${existingTemplate}" and "${instance.templateName}". Instance ids must be unique across the whole mapper.`,
      );
    }
    templateByInstanceId.set(instance.instanceId, instance.templateName);
  }
}
