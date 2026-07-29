import { describe, expect, it } from "vitest";
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
      source: "fixture",
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
      source: "fixture",
    });

    expect(output).toContain("TEST current: payments-test");
  });

  it("returns the full large-platform fixture diff", async () => {
    const output = await diffStack({
      templateName: "large-platform.yaml",
      fromEnv: "dev",
      toEnv: "test",
      source: "fixture",
    });

    expect(output.length).toBeGreaterThan(32_000);
    expect(output).toContain("Resource899");
  });

  it("rejects current pairs", async () => {
    await expect(diffStack({
      templateName: "analytics.yaml",
      fromEnv: "dev",
      toEnv: "test",
      source: "fixture",
    })).rejects.toThrow(StackDiffNotFoundError);
  });

  it("rejects unknown templates", async () => {
    await expect(diffStack({
      templateName: "missing.yaml",
      fromEnv: "dev",
      toEnv: "test",
      source: "fixture",
    })).rejects.toThrow(StackDiffLookupError);
  });
});
