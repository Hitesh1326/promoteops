import { describe, expect, it } from "vitest";
import { sampleComparisonReport } from "./sampleReport.js";
import {
  buildAttentionShortlist,
  findMappedInstances,
  findStackDiff,
  sortedMappedInstances,
} from "./stackComparison.js";

describe("stackComparison", () => {
  it("sorts one instance per template and instance identity", () => {
    const sorted = sortedMappedInstances(sampleComparisonReport().mappedInstances);
    expect(sorted.map((instance) => instance.templateName)).toEqual([
      "analytics.yaml",
      "payments.yaml",
    ]);
  });

  it("builds the attention shortlist", () => {
    const findings = buildAttentionShortlist(sampleComparisonReport());
    expect(findings.map(({ environment, status, instanceId }) => ({
      environment,
      status,
      instanceId,
    }))).toEqual([
      { environment: "prod", status: "not_deployed", instanceId: "analytics-dev" },
      { environment: "prod", status: "outdated", instanceId: "payments-dev" },
      { environment: "test", status: "outdated", instanceId: "payments-dev" },
    ]);
  });

  it("finds both supported promotion diffs", () => {
    const report = sampleComparisonReport();
    expect(findStackDiff(report, "payments-dev", "dev", "test")?.newerSide).toBe("source");
    expect(findStackDiff(report, "payments-dev", "test", "prod")?.newerSide).toBe("source");
  });

  it("finds mapped instances by template name and optional stack name", () => {
    const report = sampleComparisonReport();
    expect(findMappedInstances(report, "payments.yaml")).toHaveLength(1);
    expect(findMappedInstances(report, "PAYMENTS.YAML", "payments-test")).toHaveLength(1);
    expect(findMappedInstances(report, "payments.yaml", "missing-stack")).toHaveLength(0);
  });
});
