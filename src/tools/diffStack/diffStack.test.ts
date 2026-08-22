import { describe, expect, it } from "vitest";
import { sampleComparisonReport } from "../../stacks/stackComparison/sampleReport.js";
import {
  diffStack,
  StackDiffLookupError,
  StackDiffNotFoundError,
} from "./diffStack.js";

describe("diffStack", () => {
  it("resolves by template name and orients target→source", async () => {
    const output = await diffStack({
      templateName: "payments.yaml",
      fromEnv: "dev",
      toEnv: "test",
      report: sampleComparisonReport(),
    });

    expect(output).toContain("Template: payments.yaml");
    expect(output).toContain("TEST current: payments-test");
    expect(output).toContain("DEV proposed: payments-dev");
    expect(output).toContain("VisibilityTimeout");
  });

  it("accepts an optional stack name for the same row", async () => {
    const output = await diffStack({
      templateName: "payments.yaml",
      stackName: "payments-test",
      fromEnv: "dev",
      toEnv: "test",
      report: sampleComparisonReport(),
    });

    expect(output).toContain("TEST current: payments-test");
  });

  it("rejects current pairs", async () => {
    await expect(diffStack({
      templateName: "analytics.yaml",
      fromEnv: "dev",
      toEnv: "test",
      report: sampleComparisonReport(),
    })).rejects.toThrow(StackDiffNotFoundError);
  });

  it("rejects unknown templates", async () => {
    await expect(diffStack({
      templateName: "missing.yaml",
      fromEnv: "dev",
      toEnv: "test",
      report: sampleComparisonReport(),
    })).rejects.toThrow(StackDiffLookupError);
  });
});
