import { createTwoFilesPatch } from "diff";
import type { EnvironmentName } from "../../shared/environment.js";
import { createFixtureReport } from "../../fake/fixtureReport.js";
import {
  findStackDiff,
  type DriftEnvironment,
} from "../../stacks/stackComparison/stackComparison.js";

export interface DiffStackInput {
  instanceId: string;
  fromEnv: EnvironmentName;
  toEnv: DriftEnvironment;
}

export class StackDiffNotFoundError extends Error {
  constructor(input: DiffStackInput) {
    super(
      `No outdated fixture diff for instance "${input.instanceId}" from ${input.fromEnv} to ${input.toEnv}.`,
    );
    this.name = "StackDiffNotFoundError";
  }
}

/** Returns a full promotion-oriented unified diff for one instance/pair. */
export function diffStack(input: DiffStackInput): string {
  const diff = findStackDiff(
    createFixtureReport(),
    input.instanceId,
    input.fromEnv,
    input.toEnv,
  );
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
