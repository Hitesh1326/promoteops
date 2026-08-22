import { describe, expect, it } from "vitest";
import { parsePlanRecord, type PlanRecord } from "./planRecord.js";

function samplePlan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return {
    planId: "11111111-1111-1111-1111-111111111111",
    kind: "stack",
    createdAt: "2026-07-29T12:00:00.000Z",
    status: "pending",
    templateName: "payments.yaml",
    instanceId: "payments-dev",
    sourceEnv: "dev",
    targetEnv: "test",
    stackName: "payments-test",
    targetCurrentTemplateHash: "abc123",
    templateBody: '{"Resources":{}}',
    parameters: { Env: "test" },
    ...overrides,
  };
}

describe("parsePlanRecord", () => {
  it("accepts a valid pending stack plan", () => {
    expect(parsePlanRecord(samplePlan()).planId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("rejects unsupported env pairs", () => {
    expect(() => parsePlanRecord(samplePlan({ sourceEnv: "dev", targetEnv: "prod" }))).toThrow(
      /dev → test/,
    );
  });

  it("rejects executed plans without executedAt", () => {
    expect(() => parsePlanRecord(samplePlan({ status: "executed" }))).toThrow(/executedAt/);
  });
});
