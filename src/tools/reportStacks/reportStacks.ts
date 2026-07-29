import { getAwsClients, type EnvAwsClients } from "../../aws/clients/clients.js";
import { loadConfig, type PromoteOpsConfig } from "../../config/loadConfig/loadConfig.js";
import { loadMapper } from "../../mapper/loadMapper/loadMapper.js";
import { ENVIRONMENTS, type EnvironmentName } from "../../shared/environment.js";
import { createFixtureReport } from "../../fake/fixtureReport.js";
import { buildReport, type BuiltReport } from "../../report/buildReport/buildReport.js";
import { compareStacks } from "../../stacks/compareStacks/compareStacks.js";
import { setCachedLiveReport } from "../../stacks/compareStacks/liveReportCache.js";
import type { StackComparisonReport } from "../../stacks/stackComparison/stackComparison.js";

export type ReportSource = "fixture" | "live";

export interface ReportStacksInput {
  outputPath?: string;
  source?: ReportSource;
  configPath?: string;
  projectRoot?: string;
}

export async function reportStacks(input: ReportStacksInput = {}): Promise<BuiltReport> {
  const source = input.source ?? "live";

  if (source === "fixture") {
    return buildReport(createFixtureReport(), { outputPath: input.outputPath });
  }

  const config = await loadConfig({
    configPath: input.configPath,
    projectRoot: input.projectRoot,
  });
  const report = await loadLiveReport({ config });
  setCachedLiveReport(report);

  return buildReport(report, {
    outputPath: input.outputPath ?? config.resolvedPaths.reportOutput,
  });
}

export async function loadLiveReport(input: {
  configPath?: string;
  projectRoot?: string;
  config?: PromoteOpsConfig;
} = {}): Promise<StackComparisonReport> {
  const config = input.config ?? await loadConfig({
    configPath: input.configPath,
    projectRoot: input.projectRoot,
  });
  const mapper = await loadMapper({ config });
  const clients = await loadEnvClients(config);
  return compareStacks(mapper.instances, clients, config.aws.region);
}

async function loadEnvClients(
  config: PromoteOpsConfig,
): Promise<Record<EnvironmentName, EnvAwsClients>> {
  const entries = await Promise.all(
    ENVIRONMENTS.map(async (environment) => {
      const clients = await getAwsClients(environment, config.aws);
      return [environment, clients] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<EnvironmentName, EnvAwsClients>;
}
