import { describe, expect, it } from "vitest";
import { buildMapperInstances } from "../../mapper/normalizeMapper/normalizeMapper.js";
import { buildComparisonReport, lastActivityIso } from "./buildComparisonReport.js";
import type { RawStack } from "./fetchEnvStacks.js";

const matchingTemplate = JSON.stringify({
  AWSTemplateFormatVersion: "2010-09-09",
  Resources: { Queue: { Type: "AWS::SQS::Queue", Properties: { VisibilityTimeout: 30 } } },
});

const driftedTemplate = JSON.stringify({
  AWSTemplateFormatVersion: "2010-09-09",
  Resources: { Queue: { Type: "AWS::SQS::Queue", Properties: { VisibilityTimeout: 45 } } },
});

function stack(
  environment: RawStack["environment"],
  stackName: string,
  templateBody: string,
  overrides: Partial<RawStack> = {},
): RawStack {
  return {
    environment,
    stackName,
    stackStatus: "UPDATE_COMPLETE",
    creationTime: new Date("2026-07-01T00:00:00.000Z"),
    lastUpdatedTime: new Date("2026-07-10T00:00:00.000Z"),
    templateBody,
    ...overrides,
  };
}

describe("buildComparisonReport", () => {
  it("marks hash mismatches outdated and timestamps decide newerSide", () => {
    const instances = buildMapperInstances({
      mappings: {
        "payments.yaml": [{
          dev: "payments-dev",
          test: "payments-test",
          prod: "payments-prod",
        }],
      },
    });

    const report = buildComparisonReport({
      instances,
      region: "us-east-1",
      generatedAt: "2026-07-17T12:00:00.000Z",
      stacksByEnv: {
        dev: [stack("dev", "payments-dev", matchingTemplate, {
          lastUpdatedTime: new Date("2026-07-10T00:00:00.000Z"),
        })],
        test: [stack("test", "payments-test", driftedTemplate, {
          lastUpdatedTime: new Date("2026-07-12T00:00:00.000Z"),
        })],
        prod: [stack("prod", "payments-prod", driftedTemplate, {
          lastUpdatedTime: new Date("2026-07-08T00:00:00.000Z"),
        })],
      },
    });

    const instance = report.mappedInstances[0];
    expect(report.source).toBe("live");
    expect(instance.environments.dev.status).toBe("current");
    expect(instance.environments.test.status).toBe("outdated");
    expect(instance.environments.prod.status).toBe("current");
    expect(instance.diffs).toHaveLength(1);
    expect(instance.diffs[0]).toMatchObject({
      fromEnv: "dev",
      toEnv: "test",
      newerSide: "target",
    });
  });

  it("treats mapper NOT_DEPLOYED / EXCLUDED and missing AWS stacks as planned", () => {
    const instances = buildMapperInstances({
      mappings: {
        "audit.yaml": [{
          dev: "audit-dev",
          test: "NOT_DEPLOYED",
          prod: "EXCLUDED",
        }],
        "ghost.yaml": [{
          dev: "ghost-dev",
          test: "ghost-test",
          prod: "ghost-prod",
        }],
      },
    });

    const report = buildComparisonReport({
      instances,
      region: "us-east-1",
      stacksByEnv: {
        dev: [stack("dev", "audit-dev", matchingTemplate)],
        test: [],
        prod: [],
      },
    });

    const audit = report.mappedInstances.find((row) => row.instanceId === "audit-dev")!;
    expect(audit.environments.test.status).toBe("not_deployed");
    expect(audit.environments.prod.status).toBe("excluded");

    const ghost = report.mappedInstances.find((row) => row.instanceId === "ghost-dev")!;
    expect(ghost.environments.dev.status).toBe("not_deployed");
    expect(ghost.environments.test.status).toBe("not_deployed");
  });

  it("lists unmapped AWS stacks and uses CREATE_COMPLETE creation time", () => {
    const instances = buildMapperInstances({
      mappings: {
        "api.yaml": [{
          dev: "api-dev",
          test: "api-test",
          prod: "api-prod",
        }],
      },
    });

    const legacy = stack("dev", "legacy-billing-dev", matchingTemplate, {
      stackStatus: "CREATE_COMPLETE",
      creationTime: new Date("2026-07-01T00:00:00.000Z"),
      lastUpdatedTime: new Date("2026-07-20T00:00:00.000Z"),
    });

    const report = buildComparisonReport({
      instances,
      region: "us-east-1",
      stacksByEnv: {
        dev: [
          stack("dev", "api-dev", matchingTemplate),
          legacy,
        ],
        test: [stack("test", "api-test", matchingTemplate)],
        prod: [stack("prod", "api-prod", matchingTemplate)],
      },
    });

    expect(report.unmappedStacks).toEqual([{
      environment: "dev",
      stackName: "legacy-billing-dev",
      cloudFormationStatus: "CREATE_COMPLETE",
      lastActivity: "2026-07-01T00:00:00.000Z",
    }]);
    expect(lastActivityIso(legacy)).toBe("2026-07-01T00:00:00.000Z");
  });

  it("marks test unavailable when dev is missing, but still compares prod to test", () => {
    const instances = buildMapperInstances({
      mappings: {
        "orphan.yaml": [{
          dev: "NOT_DEPLOYED",
          test: "orphan-test",
          prod: "orphan-prod",
        }],
      },
    });

    const report = buildComparisonReport({
      instances,
      region: "us-east-1",
      stacksByEnv: {
        dev: [],
        test: [stack("test", "orphan-test", matchingTemplate)],
        prod: [stack("prod", "orphan-prod", matchingTemplate)],
      },
    });

    const instance = report.mappedInstances[0];
    expect(instance.environments.dev.status).toBe("not_deployed");
    expect(instance.environments.test.status).toBe("unavailable");
    expect(instance.environments.prod.status).toBe("current");
    expect(instance.diffs).toEqual([]);
  });
});
