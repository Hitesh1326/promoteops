import { describe, expect, it } from "vitest";

import { mapperFileSchema } from "./mapperFileSchema.js";

const validMapper = {
  mappings: {
    "example-template": [{ dev: "example-dev", test: "example-test", prod: "example-prod" }],
  },
};

describe("mapperFileSchema", () => {
  it("accepts a complete valid mapper object", () => {
    const result = mapperFileSchema.safeParse(validMapper);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mappings["example-template"]).toHaveLength(1);
    }
  });

  it("rejects an instance missing an environment", () => {
    const result = mapperFileSchema.safeParse({
      mappings: { one: [{ dev: "dev", test: "test" }] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty string for an environment stack name", () => {
    const result = mapperFileSchema.safeParse({
      mappings: { one: [{ dev: "dev", test: "", prod: "prod" }] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a template with an empty instances array", () => {
    const result = mapperFileSchema.safeParse({
      mappings: { one: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const result = mapperFileSchema.safeParse({
      ...validMapper,
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });
});
