import type { StackComparisonReport } from "../stackComparison/stackComparison.js";

/**
 * Last live StackComparisonReport kept in memory for this MCP process.
 * report_stacks fills it; diff_stack reads it so a follow-up diff does not
 * re-fetch every stack from AWS.
 */
let cachedLiveReport: StackComparisonReport | undefined;

export function setCachedLiveReport(report: StackComparisonReport): void {
  cachedLiveReport = report;
}

export function getCachedLiveReport(): StackComparisonReport | undefined {
  return cachedLiveReport;
}

export function clearCachedLiveReport(): void {
  cachedLiveReport = undefined;
}
