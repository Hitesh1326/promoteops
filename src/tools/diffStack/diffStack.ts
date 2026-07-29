import { createTwoFilesPatch } from "diff";
import type { EnvironmentName } from "../../shared/environment.js";
import { createFixtureReport } from "../../fake/fixtureReport.js";
import {
  getCachedLiveReport,
  setCachedLiveReport,
} from "../../stacks/compareStacks/liveReportCache.js";
import {
  findMappedInstances,
  type DriftEnvironment,
  type MappedStackInstance,
  type StackComparisonReport,
  type StackDiff,
} from "../../stacks/stackComparison/stackComparison.js";
import { loadLiveReport, type ReportSource } from "../reportStacks/reportStacks.js";

export interface DiffStackInput {
  templateName: string;
  stackName?: string;
  fromEnv: EnvironmentName;
  toEnv: DriftEnvironment;
  source?: ReportSource;
  configPath?: string;
  projectRoot?: string;
}

export class StackDiffLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StackDiffLookupError";
  }
}

export class StackDiffNotFoundError extends Error {
  constructor(input: DiffStackInput, instance?: MappedStackInstance) {
    const stackPart = input.stackName ? ` / stack "${input.stackName}"` : "";
    const idPart = instance ? ` (instance ${instance.instanceId})` : "";
    super(
      `No outdated diff for template "${input.templateName}"${stackPart}${idPart} from ${input.fromEnv} to ${input.toEnv}.`,
    );
    this.name = "StackDiffNotFoundError";
  }
}

export async function diffStack(input: DiffStackInput): Promise<string> {
  const report = await resolveReport(input);
  const instance = resolveMappedInstance(report, input);
  const diff = instance.diffs.find(
    (candidate) => candidate.fromEnv === input.fromEnv && candidate.toEnv === input.toEnv,
  );
  if (!diff) throw new StackDiffNotFoundError(input, instance);

  return formatDiff(input, diff);
}

function resolveMappedInstance(
  report: StackComparisonReport,
  input: DiffStackInput,
): MappedStackInstance {
  const matches = findMappedInstances(report, input.templateName, input.stackName);

  if (matches.length === 0) {
    const stackPart = input.stackName ? ` with stack "${input.stackName}"` : "";
    throw new StackDiffLookupError(
      `No mapped instance found for template "${input.templateName}"${stackPart}.`,
    );
  }

  if (matches.length > 1) {
    const options = matches
      .map((instance) => {
        const stacks = (["dev", "test", "prod"] as const)
          .map((environment) => `${environment}=${instance.environments[environment].stackName}`)
          .join(", ");
        return `- ${instance.instanceId} (${stacks})`;
      })
      .join("\n");
    throw new StackDiffLookupError(
      `Template "${input.templateName}" matches ${matches.length} instances. Pass stackName to disambiguate:\n${options}`,
    );
  }

  return matches[0];
}

function formatDiff(input: DiffStackInput, diff: StackDiff): string {
  const targetLabel = `${input.toEnv.toUpperCase()} current: ${diff.targetStackName}`;
  const sourceLabel = `${input.fromEnv.toUpperCase()} proposed: ${diff.sourceStackName}`;
  const warning = diff.newerSide === "target"
    ? "WARNING: Target is newer; review before promotion.\n\n"
    : "";
  const patch = createTwoFilesPatch(
    targetLabel,
    sourceLabel,
    diff.targetTemplate,
    diff.sourceTemplate,
    "",
    "",
    { context: 5 },
  );

  return [
    `${input.fromEnv.toUpperCase()} → ${input.toEnv.toUpperCase()} promotion review`,
    `Template: ${input.templateName}`,
    "Left/removed is the target's current template; right/added is the source proposed for promotion.",
    warning + patch,
  ].join("\n");
}

async function resolveReport(input: DiffStackInput): Promise<StackComparisonReport> {
  const source = input.source ?? "live";
  if (source === "fixture") {
    return createFixtureReport();
  }

  const cached = getCachedLiveReport();
  if (cached) return cached;

  const report = await loadLiveReport({
    configPath: input.configPath,
    projectRoot: input.projectRoot,
  });
  setCachedLiveReport(report);
  return report;
}
