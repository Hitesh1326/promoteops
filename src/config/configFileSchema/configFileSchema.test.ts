import { describe, expect, it } from "vitest";

import { configFileSchema } from "./configFileSchema.js";

const validConfig = {
  aws: {
    region: "us-east-1",
    profiles: { dev: "dev-profile", test: "test-profile", prod: "prod-profile" },
  },
  templates: { localPath: "./templates" },
  paths: {
    mapper: "./mapper.json",
    configTempDir: "./tmp/configs",
    reportOutput: "./tmp/report.html",
  },
};

describe("configFileSchema", () => {
  it("accepts a complete valid config object", () => {
    const result = configFileSchema.safeParse(validConfig);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aws.profiles.prod).toBe("prod-profile");
    }
  });

  it("rejects a missing required profile", () => {
    const { prod: _prod, ...profilesWithoutProd } = validConfig.aws.profiles;
    const result = configFileSchema.safeParse({
      ...validConfig,
      aws: { ...validConfig.aws, profiles: profilesWithoutProd },
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty string where a non-empty value is required", () => {
    const result = configFileSchema.safeParse({
      ...validConfig,
      templates: { localPath: "   " },
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const result = configFileSchema.safeParse({
      ...validConfig,
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });
});
