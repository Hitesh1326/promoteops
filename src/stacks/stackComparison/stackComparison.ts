import { createHash } from "node:crypto";
import { ENVIRONMENTS, type EnvironmentName } from "../../shared/environment.js";

/** Fixture-first report model shared by stack tools and report rendering. */
export const REPORT_STATUSES = [
  "current",
  "outdated",
  "not_deployed",
  "excluded",
  "unavailable",
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type DriftEnvironment = Exclude<EnvironmentName, "dev">;
export type NewerSide = "source" | "target" | "same_time";

export interface EnvironmentState {
  environment: EnvironmentName;
  status: ReportStatus;
  stackName: string;
  lastActivity?: string;
  comparisonContext: string;
  shortHash?: string;
  unavailableReason?: string;
}

export interface StackDiff {
  fromEnv: EnvironmentName;
  toEnv: DriftEnvironment;
  sourceStackName: string;
  targetStackName: string;
  sourceTemplate: string;
  targetTemplate: string;
  newerSide: NewerSide;
}

export interface MappedStackInstance {
  templateName: string;
  instanceId: string;
  environments: Record<EnvironmentName, EnvironmentState>;
  diffs: StackDiff[];
}

export interface UnmappedStack {
  environment: EnvironmentName;
  stackName: string;
  cloudFormationStatus: string;
  lastActivity?: string;
}

export interface CollectionWarning {
  environment: EnvironmentName;
  message: string;
}

export interface StackComparisonReport {
  generatedAt: string;
  source: "fixture" | "live";
  region: string;
  mappedInstances: MappedStackInstance[];
  unmappedStacks: UnmappedStack[];
  collectionWarnings: CollectionWarning[];
}

export interface AttentionFinding {
  templateName: string;
  instanceId: string;
  environment: EnvironmentName;
  status: "outdated" | "not_deployed";
  stackName: string;
  newerSide?: NewerSide;
  rowId: string;
  diffId?: string;
}

export function stableRowId(instance: Pick<MappedStackInstance, "templateName" | "instanceId">): string {
  const digest = createHash("sha256")
    .update(`${instance.templateName}\0${instance.instanceId}`)
    .digest("hex")
    .slice(0, 12);
  return `stack-${digest}`;
}

export function diffId(rowId: string, fromEnv: EnvironmentName, toEnv: DriftEnvironment): string {
  return `${rowId}-diff-${fromEnv}-${toEnv}`;
}

export function sortedMappedInstances(
  instances: readonly MappedStackInstance[],
): MappedStackInstance[] {
  return [...instances].sort(
    (left, right) =>
      left.templateName.localeCompare(right.templateName) ||
      left.instanceId.localeCompare(right.instanceId),
  );
}

export function buildAttentionShortlist(
  report: StackComparisonReport,
): AttentionFinding[] {
  const findings = report.mappedInstances.flatMap((instance) => {
    const rowId = stableRowId(instance);
    return (["dev", "test", "prod"] as const).flatMap((environment) => {
      const state = instance.environments[environment];
      if (state.status !== "outdated" && state.status !== "not_deployed") {
        return [];
      }

      const diff = instance.diffs.find((candidate) => candidate.toEnv === environment);
      return [{
        templateName: instance.templateName,
        instanceId: instance.instanceId,
        environment,
        status: state.status,
        stackName: state.stackName,
        newerSide: diff?.newerSide,
        rowId,
        diffId: diff ? diffId(rowId, diff.fromEnv, diff.toEnv) : undefined,
      }];
    });
  });

  const severity = (finding: AttentionFinding): number => {
    if (finding.status === "not_deployed") return 0;
    if (finding.newerSide === "target") return 1;
    return 2;
  };
  const environmentRank: Record<EnvironmentName, number> = { prod: 0, test: 1, dev: 2 };

  return findings.sort(
    (left, right) =>
      severity(left) - severity(right) ||
      environmentRank[left.environment] - environmentRank[right.environment] ||
      left.templateName.localeCompare(right.templateName) ||
      left.instanceId.localeCompare(right.instanceId),
  );
}

export function findStackDiff(
  report: StackComparisonReport,
  instanceId: string,
  fromEnv: EnvironmentName,
  toEnv: DriftEnvironment,
): StackDiff | undefined {
  return report.mappedInstances
    .find((instance) => instance.instanceId === instanceId)
    ?.diffs.find((diff) => diff.fromEnv === fromEnv && diff.toEnv === toEnv);
}

export function findMappedInstances(
  report: StackComparisonReport,
  templateName: string,
  stackName?: string,
): MappedStackInstance[] {
  const templateKey = templateName.trim().toLocaleLowerCase();
  const stackKey = stackName?.trim().toLocaleLowerCase();

  return report.mappedInstances.filter((instance) => {
    if (instance.templateName.toLocaleLowerCase() !== templateKey) {
      return false;
    }
    if (!stackKey) {
      return true;
    }
    if (instance.instanceId.toLocaleLowerCase() === stackKey) {
      return true;
    }
    return ENVIRONMENTS.some(
      (environment) =>
        instance.environments[environment].stackName.toLocaleLowerCase() === stackKey,
    );
  });
}
