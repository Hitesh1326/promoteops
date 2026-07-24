/**
 * Live stack compare: fetch CFN inventories per env, then build the shared
 * StackComparisonReport model used by report/diff tools.
 */
import type { CloudFormationClient } from "@aws-sdk/client-cloudformation";

import type { EnvAwsClients } from "../../aws/clients/clients.js";
import type { NormalizedMapperInstance } from "../../mapper/normalizeMapper/normalizeMapper.js";
import { ENVIRONMENTS, type EnvironmentName } from "../../shared/environment.js";
import type { StackComparisonReport } from "../stackComparison/stackComparison.js";
import { buildComparisonReport } from "./buildComparisonReport.js";
import { fetchEnvStacks, type FetchEnvStacksResult, type RawStack } from "./fetchEnvStacks.js";

export interface CompareStacksClients {
  dev: Pick<EnvAwsClients, "cloudFormation">;
  test: Pick<EnvAwsClients, "cloudFormation">;
  prod: Pick<EnvAwsClients, "cloudFormation">;
}

export interface CompareStacksDeps {
  fetchEnvStacks?: (
    client: CloudFormationClient,
    environment: EnvironmentName,
  ) => Promise<FetchEnvStacksResult>;
}

export async function compareStacks(
  instances: readonly NormalizedMapperInstance[],
  clients: CompareStacksClients,
  region: string,
  deps: CompareStacksDeps = {},
): Promise<StackComparisonReport> {
  const fetch = deps.fetchEnvStacks ?? fetchEnvStacks;

  const results = await Promise.all(
    ENVIRONMENTS.map((environment) =>
      fetch(clients[environment].cloudFormation, environment),
    ),
  );

  const stacksByEnv = Object.fromEntries(
    ENVIRONMENTS.map((environment, index) => [environment, results[index].stacks]),
  ) as Record<EnvironmentName, RawStack[]>;

  return buildComparisonReport({
    instances,
    stacksByEnv,
    region,
    warnings: results.flatMap((result) => result.warnings),
  });
}
