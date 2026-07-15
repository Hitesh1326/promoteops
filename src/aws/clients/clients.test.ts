import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AwsClientError,
  clearAwsClientCache,
  formatAwsAuthError,
  getAwsClients,
  isSsoExpiredError,
} from "./clients.js";

const aws = {
  region: "us-east-1",
  profiles: {
    dev: "dev-profile",
    test: "test-profile",
    prod: "prod-profile",
  },
} as const;

afterEach(() => {
  clearAwsClientCache();
});

describe("formatAwsAuthError / isSsoExpiredError", () => {
  it("detects common SSO expiry messages", () => {
    expect(isSsoExpiredError(new Error("Token is expired. To refresh this SSO session run aws sso login"))).toBe(
      true,
    );
    expect(isSsoExpiredError(new Error("The SSO session associated with this profile has expired"))).toBe(true);
    expect(isSsoExpiredError(new Error("Some unrelated network failure"))).toBe(false);
  });

  it("returns a re-login command when SSO is expired", () => {
    const message = formatAwsAuthError(new Error("Token is expired"), "dev-profile");

    expect(message).toContain('profile "dev-profile"');
    expect(message).toContain("aws sso login --profile dev-profile");
  });

  it("keeps a useful detail for non-SSO auth failures", () => {
    const message = formatAwsAuthError(new Error("Profile not found"), "missing-profile");

    expect(message).toContain('profile "missing-profile"');
    expect(message).toContain("Profile not found");
  });
});

describe("getAwsClients", () => {
  it("creates CloudFormation and S3 clients for each environment profile", async () => {
    const createCredentials = vi.fn((profile: string) => {
      const provider = vi.fn(async () => ({ accessKeyId: "ak", secretAccessKey: "sk", profile }));
      return provider;
    });
    const createCloudFormationClient = vi.fn(({ region }) => ({ kind: "cfn", region }) as never);
    const createS3Client = vi.fn(({ region }) => ({ kind: "s3", region }) as never);

    const hooks = { createCredentials, createCloudFormationClient, createS3Client };

    const dev = await getAwsClients("dev", aws, hooks);
    const test = await getAwsClients("test", aws, hooks);
    const prod = await getAwsClients("prod", aws, hooks);

    expect(dev.profile).toBe("dev-profile");
    expect(test.profile).toBe("test-profile");
    expect(prod.profile).toBe("prod-profile");
    expect(dev.cloudFormation).toEqual({ kind: "cfn", region: "us-east-1" });
    expect(dev.s3).toEqual({ kind: "s3", region: "us-east-1" });
    expect(createCredentials).toHaveBeenCalledWith("dev-profile");
    expect(createCredentials).toHaveBeenCalledWith("test-profile");
    expect(createCredentials).toHaveBeenCalledWith("prod-profile");
  });

  it("caches clients for the same environment/profile/region", async () => {
    const createCredentials = vi.fn(() => vi.fn(async () => ({ accessKeyId: "ak", secretAccessKey: "sk" })));
    const createCloudFormationClient = vi.fn(() => ({ kind: "cfn" }) as never);
    const createS3Client = vi.fn(() => ({ kind: "s3" }) as never);
    const hooks = { createCredentials, createCloudFormationClient, createS3Client };

    const first = await getAwsClients("dev", aws, hooks);
    const second = await getAwsClients("dev", aws, hooks);

    expect(second).toBe(first);
    expect(createCloudFormationClient).toHaveBeenCalledTimes(1);
    expect(createS3Client).toHaveBeenCalledTimes(1);
  });

  it("throws AwsClientError with a re-login message when SSO credentials are expired", async () => {
    const createCredentials = () =>
      vi.fn(async () => {
        throw new Error("Token is expired. To refresh this SSO session run aws sso login");
      });

    await expect(getAwsClients("dev", aws, { createCredentials })).rejects.toThrow(AwsClientError);
    await expect(getAwsClients("dev", aws, { createCredentials })).rejects.toThrow(
      "aws sso login --profile dev-profile",
    );
  });
});
