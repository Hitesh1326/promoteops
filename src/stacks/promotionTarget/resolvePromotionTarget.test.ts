import { describe, expect, it } from "vitest";
import { buildMapperInstances } from "../../mapper/normalizeMapper/normalizeMapper.js";
import {
  PromotionTargetError,
  resolvePromotionTarget,
} from "./resolvePromotionTarget.js";

const instances = buildMapperInstances({
  mappings: {
    "payments.yaml": [
      { dev: "payments-dev", test: "payments-test", prod: "payments-prod" },
    ],
    "new-app.yaml": [
      { dev: "new-app-dev", test: "NOT_DEPLOYED", prod: "EXCLUDED" },
    ],
  },
});

describe("resolvePromotionTarget", () => {
  it("resolves a mapped update target", () => {
    const resolved = resolvePromotionTarget({
      instances,
      templateName: "payments.yaml",
      sourceEnv: "dev",
      targetEnv: "test",
    });
    expect(resolved.stackName).toBe("payments-test");
    expect(resolved.instance.instanceId).toBe("payments-dev");
  });

  it("hard-stops when the target env is NOT_DEPLOYED and tells the user to update the mapper", () => {
    expect(() =>
      resolvePromotionTarget({
        instances,
        templateName: "new-app.yaml",
        sourceEnv: "dev",
        targetEnv: "test",
      }),
    ).toThrow(/Update mapper\.json/);

    expect(() =>
      resolvePromotionTarget({
        instances,
        templateName: "new-app.yaml",
        stackName: "new-app-test",
        sourceEnv: "dev",
        targetEnv: "test",
      }),
    ).toThrow(PromotionTargetError);
  });

  it("hard-stops when the target env is EXCLUDED", () => {
    const excludedProd = buildMapperInstances({
      mappings: {
        "payments.yaml": [
          { dev: "payments-dev", test: "payments-test", prod: "EXCLUDED" },
        ],
      },
    });
    expect(() =>
      resolvePromotionTarget({
        instances: excludedProd,
        templateName: "payments.yaml",
        sourceEnv: "test",
        targetEnv: "prod",
      }),
    ).toThrow(/will not create or update/);
  });

  it("rejects invalid env pairs", () => {
    expect(() =>
      resolvePromotionTarget({
        instances,
        templateName: "payments.yaml",
        sourceEnv: "dev",
        targetEnv: "prod",
      }),
    ).toThrow(/dev → test/);
  });
});
