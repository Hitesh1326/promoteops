/**
 * Temporary M4 fake data. Delete the entire `src/fake/` folder once live compare (M5) replaces fixture mode.
 */
import type {
  EnvironmentState,
  MappedStackInstance,
  StackComparisonReport,
  StackDiff,
} from "../stacks/stackComparison/stackComparison.js";

const devTemplate = `{
  "AWSTemplateFormatVersion": "2010-09-09",
  "Resources": {
    "Queue": {
      "Type": "AWS::SQS::Queue",
      "Properties": { "VisibilityTimeout": 45 }
    },
    "Alarm": {
      "Type": "AWS::CloudWatch::Alarm",
      "Properties": { "Threshold": 5 }
    }
  }
}`;

const testTemplate = `{
  "AWSTemplateFormatVersion": "2010-09-09",
  "Resources": {
    "Queue": {
      "Type": "AWS::SQS::Queue",
      "Properties": { "VisibilityTimeout": 30 }
    }
  }
}`;

const prodTemplate = `{
  "AWSTemplateFormatVersion": "2010-09-09",
  "Resources": {
    "Queue": {
      "Type": "AWS::SQS::Queue",
      "Properties": { "VisibilityTimeout": 60 }
    }
  }
}`;

function state(
  environment: EnvironmentState["environment"],
  status: EnvironmentState["status"],
  stackName: string,
  comparisonContext: string,
  lastActivity?: string,
  shortHash?: string,
  unavailableReason?: string,
): EnvironmentState {
  return {
    environment,
    status,
    stackName,
    comparisonContext,
    lastActivity,
    shortHash,
    unavailableReason,
  };
}

function paymentDiffs(): StackDiff[] {
  return [
    {
      fromEnv: "dev",
      toEnv: "test",
      sourceStackName: "payments-dev",
      targetStackName: "payments-test",
      sourceTemplate: devTemplate,
      targetTemplate: testTemplate,
      newerSide: "target",
    },
    {
      fromEnv: "test",
      toEnv: "prod",
      sourceStackName: "payments-test",
      targetStackName: "payments-prod",
      sourceTemplate: testTemplate,
      targetTemplate: prodTemplate,
      newerSide: "source",
    },
  ];
}

function mappedInstances(): MappedStackInstance[] {
  const oversizedSource = `Resources:\n${Array.from(
    { length: 900 },
    (_, index) => `  Resource${index}:\n    Type: AWS::SNS::Topic`,
  ).join("\n")}`;

  return [
    {
      templateName: "payments.yaml",
      instanceId: "payments-dev",
      environments: {
        dev: state("dev", "current", "payments-dev", "Baseline source", "2026-07-18T12:04:00.000Z", "a91c04ef"),
        test: state("test", "outdated", "payments-test", "Differs from Dev", "2026-07-18T12:20:00.000Z", "b7369cd1"),
        prod: state("prod", "outdated", "payments-prod", "Differs from Test", "2026-07-15T09:10:00.000Z", "c81d721a"),
      },
      diffs: paymentDiffs(),
    },
    {
      templateName: "analytics.yaml",
      instanceId: "analytics-dev",
      environments: {
        dev: state("dev", "current", "analytics-dev", "Baseline source", "2026-07-17T08:00:00.000Z", "342ef4ac"),
        test: state("test", "current", "analytics-test", "Matches Dev", "2026-07-17T10:00:00.000Z", "342ef4ac"),
        prod: state("prod", "not_deployed", "NOT_DEPLOYED", "Not configured for deployment"),
      },
      diffs: [],
    },
    {
      templateName: "audit.yaml",
      instanceId: "audit-dev",
      environments: {
        dev: state("dev", "not_deployed", "audit-dev", "Mapped stack not found"),
        test: state("test", "excluded", "EXCLUDED", "Excluded by mapper"),
        prod: state("prod", "excluded", "EXCLUDED", "Excluded by mapper"),
      },
      diffs: [],
    },
    {
      templateName: "edge-worker.yaml",
      instanceId: "edge-worker-dev",
      environments: {
        dev: state("dev", "current", "edge-worker-dev", "Baseline source", "2026-07-16T11:01:02.000Z", "9fe12a44"),
        test: state("test", "current", "edge-worker-test", "Matches Dev", "2026-07-16T11:04:02.000Z", "9fe12a44"),
        prod: state("prod", "current", "edge-worker-prod", "Matches Test", "2026-07-16T11:08:02.000Z", "9fe12a44"),
      },
      diffs: [],
    },
    {
      templateName: "large-platform.yaml",
      instanceId: "large-platform-dev",
      environments: {
        dev: state("dev", "current", "large-platform-dev", "Baseline source", "2026-07-13T07:00:00.000Z", "bc61f590"),
        test: state("test", "outdated", "large-platform-test", "Differs from Dev", "2026-07-12T07:00:00.000Z", "ed36a32e"),
        prod: state("prod", "excluded", "EXCLUDED", "Excluded by mapper"),
      },
      diffs: [{
        fromEnv: "dev",
        toEnv: "test",
        sourceStackName: "large-platform-dev",
        targetStackName: "large-platform-test",
        sourceTemplate: oversizedSource,
        targetTemplate: "Resources: {}",
        newerSide: "source",
      }],
    },
    {
      templateName: "reporting.yaml",
      instanceId: "reporting-dev",
      environments: {
        dev: state("dev", "current", "reporting-dev", "Baseline source", "2026-07-14T06:30:00.000Z", "8bc109dd"),
        test: state("test", "current", "reporting-test", "Matches Dev", "2026-07-14T07:00:00.000Z", "8bc109dd"),
        prod: state("prod", "current", "reporting-prod", "Matches Test", "2026-07-14T08:00:00.000Z", "8bc109dd"),
      },
      diffs: [],
    },
  ];
}

/** Creates deterministic fake report data for M4 UX review without AWS calls. */
export function createFixtureReport(): StackComparisonReport {
  return {
    generatedAt: new Date().toISOString(),
    source: "fixture",
    region: "us-east-1",
    mappedInstances: mappedInstances(),
    unmappedStacks: [
      { environment: "dev", stackName: "legacy-billing-dev", cloudFormationStatus: "UPDATE_COMPLETE", lastActivity: "2026-07-12T13:20:00.000Z" },
      { environment: "test", stackName: "sandbox-search-test", cloudFormationStatus: "CREATE_COMPLETE", lastActivity: "2026-07-10T16:45:00.000Z" },
      { environment: "prod", stackName: "manual-hotfix-prod", cloudFormationStatus: "UPDATE_COMPLETE", lastActivity: "2026-07-18T03:15:00.000Z" },
    ],
    collectionWarnings: [],
  };
}
