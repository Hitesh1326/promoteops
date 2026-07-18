import { buildReport, type BuiltReport } from "../../report/buildReport/buildReport.js";
import { createFixtureReport } from "../../fake/fixtureReport.js";

export interface ReportStacksInput {
  outputPath?: string;
}

/** Runs the read-only fixture report pipeline used by M4. */
export async function reportStacks(input: ReportStacksInput = {}): Promise<BuiltReport> {
  return buildReport(createFixtureReport(), { outputPath: input.outputPath });
}
