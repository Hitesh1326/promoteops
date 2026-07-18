import { describe, expect, it } from "vitest";
import { diffStack, StackDiffNotFoundError } from "./diffStack.js";

describe("diffStack", () => {
  it("orients the full diff from target current to source proposed", () => {
    const output = diffStack({
      instanceId: "payments-dev",
      fromEnv: "dev",
      toEnv: "test",
    });

    expect(output).toContain("TEST current: payments-test");
    expect(output).toContain("DEV proposed: payments-dev");
    expect(output).toContain("Target is newer; review before promotion.");
  });

  it("returns the full large-platform fixture diff", () => {
    const output = diffStack({
      instanceId: "large-platform-dev",
      fromEnv: "dev",
      toEnv: "test",
    });

    expect(output.length).toBeGreaterThan(32_000);
    expect(output).toContain("Resource899");
  });

  it("rejects unsupported or current pairs", () => {
    expect(() => diffStack({
      instanceId: "analytics-dev",
      fromEnv: "dev",
      toEnv: "test",
    })).toThrow(StackDiffNotFoundError);
  });
});
