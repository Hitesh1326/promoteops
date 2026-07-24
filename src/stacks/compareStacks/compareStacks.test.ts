import { describe, expect, it } from "vitest";
import { compareStacks } from "./compareStacks.js";
import type { RawStack } from "./fetchEnvStacks.js";
import { buildMapperInstances } from "../../mapper/normalizeMapper/normalizeMapper.js";

const template = JSON.stringify({
  AWSTemplateFormatVersion: "2010-09-09",
  Resources: {},
});

describe("compareStacks", () => {
  it("fetches all environments then builds a live report (mocked CFN)", async () => {
    const instances = buildMapperInstances({
      mappings: {
        "api.yaml": [{
          dev: "api-dev",
          test: "api-test",
          prod: "api-prod",
        }],
      },
    });

    const stacks: Record<string, RawStack[]> = {
      dev: [{
        environment: "dev",
        stackName: "api-dev",
        stackStatus: "CREATE_COMPLETE",
        creationTime: new Date("2026-07-01T00:00:00.000Z"),
        templateBody: template,
      }],
      test: [{
        environment: "test",
        stackName: "api-test",
        stackStatus: "UPDATE_COMPLETE",
        lastUpdatedTime: new Date("2026-07-02T00:00:00.000Z"),
        templateBody: template,
      }],
      prod: [{
        environment: "prod",
        stackName: "api-prod",
        stackStatus: "UPDATE_COMPLETE",
        lastUpdatedTime: new Date("2026-07-03T00:00:00.000Z"),
        templateBody: template,
      }],
    };

    const report = await compareStacks(
      instances,
      {
        dev: { cloudFormation: {} as never },
        test: { cloudFormation: {} as never },
        prod: { cloudFormation: {} as never },
      },
      "us-east-1",
      {
        fetchEnvStacks: async (_client, environment) => ({
          stacks: stacks[environment],
          warnings: [],
        }),
      },
    );

    expect(report.source).toBe("live");
    expect(report.mappedInstances).toHaveLength(1);
    expect(report.mappedInstances[0].environments.test.status).toBe("current");
    expect(report.mappedInstances[0].environments.prod.status).toBe("current");
  });
});
