import type {
  EnvironmentState,
  StackComparisonReport,
} from "./stackComparison.js";

function env(
  environment: EnvironmentState["environment"],
  status: EnvironmentState["status"],
  stackName: string,
  extras: Partial<EnvironmentState> = {},
): EnvironmentState {
  return {
    environment,
    status,
    stackName,
    comparisonContext: status,
    ...extras,
  };
}

/** Compact comparison report for unit tests (not the old offline fixture product). */
export function sampleComparisonReport(): StackComparisonReport {
  return {
    generatedAt: "2026-07-18T12:00:00.000Z",
    source: "live",
    region: "us-east-1",
    mappedInstances: [
      {
        templateName: "payments.yaml",
        instanceId: "payments-dev",
        environments: {
          dev: env("dev", "current", "payments-dev"),
          test: env("test", "outdated", "payments-test"),
          prod: env("prod", "outdated", "payments-prod"),
        },
        diffs: [
          {
            fromEnv: "dev",
            toEnv: "test",
            sourceStackName: "payments-dev",
            targetStackName: "payments-test",
            sourceTemplate: '{"Resources":{"Queue":{"Properties":{"VisibilityTimeout":45}}}}',
            targetTemplate: '{"Resources":{"Queue":{"Properties":{"VisibilityTimeout":30}}}}',
            newerSide: "source",
          },
          {
            fromEnv: "test",
            toEnv: "prod",
            sourceStackName: "payments-test",
            targetStackName: "payments-prod",
            sourceTemplate: '{"Resources":{"Queue":{"Properties":{"VisibilityTimeout":30}}}}',
            targetTemplate: '{"Resources":{"Queue":{"Properties":{"VisibilityTimeout":60}}}}',
            newerSide: "source",
          },
        ],
      },
      {
        templateName: "analytics.yaml",
        instanceId: "analytics-dev",
        environments: {
          dev: env("dev", "current", "analytics-dev"),
          test: env("test", "current", "analytics-test"),
          prod: env("prod", "not_deployed", "NOT_DEPLOYED"),
        },
        diffs: [],
      },
    ],
    unmappedStacks: [],
    collectionWarnings: [],
  };
}
