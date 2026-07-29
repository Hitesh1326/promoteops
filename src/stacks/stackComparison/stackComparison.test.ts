import { describe, expect, it } from "vitest";
import { createFixtureReport } from "../../fake/fixtureReport.js";
import {
  buildAttentionShortlist,
  findMappedInstances,
  findStackDiff,
  sortedMappedInstances,
} from "./stackComparison.js";

describe("stackComparison", () => {
  it("sorts one instance per template and instance identity", () => {
    const report = createFixtureReport();
    const sorted = sortedMappedInstances(report.mappedInstances);

    expect(sorted.map((instance) => instance.templateName)).toEqual([
      "analytics.yaml",
      "audit.yaml",
      "edge-worker.yaml",
      "large-platform.yaml",
      "payments.yaml",
      "reporting.yaml",
    ]);
  });

  it("builds the exact actionable shortlist in locked order", () => {
    const findings = buildAttentionShortlist(createFixtureReport());

    expect(findings.map(({ environment, status, instanceId, newerSide }) => ({
      environment,
      status,
      instanceId,
      newerSide,
    }))).toEqual([
      { environment: "prod", status: "not_deployed", instanceId: "analytics-dev", newerSide: undefined },
      { environment: "dev", status: "not_deployed", instanceId: "audit-dev", newerSide: undefined },
      { environment: "prod", status: "outdated", instanceId: "payments-dev", newerSide: "source" },
      { environment: "test", status: "outdated", instanceId: "large-platform-dev", newerSide: "source" },
      { environment: "test", status: "outdated", instanceId: "payments-dev", newerSide: "source" },
    ]);
  });

  it("finds both supported promotion diffs", () => {
    const report = createFixtureReport();

    expect(findStackDiff(report, "payments-dev", "dev", "test")?.newerSide).toBe("source");
    expect(findStackDiff(report, "payments-dev", "test", "prod")?.newerSide).toBe("source");
  });

  it("finds mapped instances by template name and optional stack name", () => {
    const report = createFixtureReport();

    expect(findMappedInstances(report, "payments.yaml")).toHaveLength(1);
    expect(findMappedInstances(report, "PAYMENTS.YAML", "payments-test")).toHaveLength(1);
    expect(findMappedInstances(report, "payments.yaml", "missing-stack")).toHaveLength(0);
  });
});
