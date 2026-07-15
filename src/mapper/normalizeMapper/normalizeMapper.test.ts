import { describe, expect, it } from "vitest";

import { EXCLUDED, NOT_DEPLOYED } from "../specialValues/specialValues.js";
import { buildMapperInstances, getMapperInstanceId, MapperNormalizationError, normalizeMapperInstance } from "./normalizeMapper.js";

describe("normalizeMapperInstance", () => {
  it("tags ordinary stack names and special values separately", () => {
    const environments = normalizeMapperInstance({ dev: NOT_DEPLOYED, test: "my-test-stack", prod: EXCLUDED });

    expect(environments).toEqual({
      dev: { kind: "special", value: NOT_DEPLOYED },
      test: { kind: "stack", value: "my-test-stack" },
      prod: { kind: "special", value: EXCLUDED },
    });
  });
});

describe("getMapperInstanceId", () => {
  it("prefers dev, then falls back to test, then prod", () => {
    expect(getMapperInstanceId("t", { dev: "dev-stack", test: "test-stack", prod: "prod-stack" })).toBe("dev-stack");
    expect(getMapperInstanceId("t", { dev: NOT_DEPLOYED, test: "test-stack", prod: "prod-stack" })).toBe("test-stack");
    expect(getMapperInstanceId("t", { dev: NOT_DEPLOYED, test: EXCLUDED, prod: "prod-stack" })).toBe("prod-stack");
  });

  it("throws when every environment is a special value", () => {
    expect(() => getMapperInstanceId("t", { dev: NOT_DEPLOYED, test: EXCLUDED, prod: EXCLUDED })).toThrow(
      MapperNormalizationError,
    );
  });
});

describe("buildMapperInstances", () => {
  it("rejects two instances that resolve to the same instance id, even across different templates", () => {
    const mapper = {
      mappings: {
        "template-a": [{ dev: "shared-name", test: "template-a-test", prod: "template-a-prod" }],
        "template-b": [{ dev: "shared-name", test: "template-b-test", prod: "template-b-prod" }],
      },
    };

    expect(() => buildMapperInstances(mapper)).toThrow(MapperNormalizationError);
    expect(() => buildMapperInstances(mapper)).toThrow(/Duplicate mapper instance id "shared-name"/);
  });
});
