import { describe, expect, it } from "vitest";
import { isPlanAlreadyExecuted, isPlanStale } from "./isPlanStale.js";

describe("isPlanStale", () => {
  it("is stale when the live target hash differs from the plan snapshot", () => {
    expect(isPlanStale({ targetCurrentTemplateHash: "aaa" }, "bbb")).toBe(true);
    expect(isPlanStale({ targetCurrentTemplateHash: "aaa" }, "aaa")).toBe(false);
  });
});

describe("isPlanAlreadyExecuted", () => {
  it("detects executed status", () => {
    expect(isPlanAlreadyExecuted({ status: "executed" })).toBe(true);
    expect(isPlanAlreadyExecuted({ status: "pending" })).toBe(false);
  });
});
