import { createTwoFilesPatch } from "diff";
import type { EnvironmentName } from "../../shared/environment.js";
import { createFixtureReport } from "../../fake/fixtureReport.js";
import {
  getCachedLiveReport,
  setCachedLiveReport,
} from "../../stacks/compareStacks/liveReportCache.js";
import {
  findStackDiff,
  type DriftEnvironment,
  type StackComparisonReport,
} from "../../stacks/stackComparison/stackComparison.js";
import { loadLiveReport, type ReportSource } from "../reportStacks/reportStacks.js";

export interface DiffStackInput {
  instanceId: string;
  fromEnv: EnvironmentName;
  toEnv: DriftEnvironment;
  source?: ReportSource;
  configPath?: string;
  projectRoot?: string;
}

export class StackDiffNotFoundError extends Error {
  constructor(input: DiffStackInput) {
    super(
      `No outdated diff for instance "${input.instanceId}" from ${input.fromEnv} to ${input.toEnv}.`,
    );
    this.name = "StackDiffNotFoundError";
  }
}

/** Returns a full promotion-oriented unified diff for one instance/pair. */
export async function diffStack(input: DiffStackInput): Promise<string> {
  const report = await resolveReport(input);
  const diff = findStackDiff(report, input.instanceId, input.fromEnv, input.toEnv);
  if (!diff) throw new StackDiffNotFoundError(input);

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
