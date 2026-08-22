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
  it("creates CloudFormation clients for each environment profile", async () => {
    const createCredentials = vi.fn((profile: string) => {
      const provider = vi.fn(async () => ({ accessKeyId: "ak", secretAccessKey: "sk", profile }));
      return provider;
    });
    const createCloudFormationClient = vi.fn(({ region }) => ({ kind: "cfn", region }) as never);
    const hooks = { createCredentials, createCloudFormationClient };

    const dev = await getAwsClients("dev", aws, hooks);
    const test = await getAwsClients("test", aws, hooks);
    const prod = await getAwsClients("prod", aws, hooks);

    expect(dev.profile).toBe("dev-profile");
    expect(test.profile).toBe("test-profile");
    expect(prod.profile).toBe("prod-profile");
    expect(dev.cloudFormation).toEqual({ kind: "cfn", region: "us-east-1" });
    expect(createCredentials).toHaveBeenCalledWith("dev-profile");
    expect(createCredentials).toHaveBeenCalledWith("test-profile");
    expect(createCredentials).toHaveBeenCalledWith("prod-profile");
  });

  it("re-resolves credentials on every call so a re-login is visible", async () => {
    const createCredentials = vi.fn(() => vi.fn(async () => ({ accessKeyId: "ak", secretAccessKey: "sk" })));
    const createCloudFormationClient = vi.fn(() => ({ kind: "cfn" }) as never);
    const hooks = { createCredentials, createCloudFormationClient };

    await getAwsClients("dev", aws, hooks);
    await getAwsClients("dev", aws, hooks);

    expect(createCredentials).toHaveBeenCalledTimes(2);
    expect(createCloudFormationClient).toHaveBeenCalledTimes(2);
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

  it("drops cached clients after SSO expiry so a re-login works without restarting MCP", async () => {
    let expired = false;
    const createCredentials = vi.fn(() =>
      vi.fn(async () => {
        if (expired) {
          throw new Error("Token is expired. To refresh this SSO session run aws sso login");
        }
        return { accessKeyId: "ak", secretAccessKey: "sk" };
      }),
    );
    const createCloudFormationClient = vi.fn(() => ({ kind: "cfn" }) as never);
    const hooks = { createCredentials, createCloudFormationClient };

    const first = await getAwsClients("dev", aws, hooks);
    expect(createCloudFormationClient).toHaveBeenCalledTimes(1);

    expired = true;
    await expect(getAwsClients("dev", aws, hooks)).rejects.toThrow("aws sso login --profile dev-profile");

    expired = false;
    const afterLogin = await getAwsClients("dev", aws, hooks);
    expect(afterLogin).not.toBe(first);
    expect(createCloudFormationClient).toHaveBeenCalledTimes(2);
  });
});
