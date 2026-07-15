/**
 * Per-environment CloudFormation + S3 clients using SSO profiles from config.
 * Clients are cached in-memory for the process lifetime so report/plan tools
 * reuse the same SDK client objects instead of recreating them every call.
 */
import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { S3Client } from "@aws-sdk/client-s3";
import { fromIni } from "@aws-sdk/credential-providers";

import type { EnvironmentName } from "../../shared/environment.js";

export interface EnvAwsClients {
  cloudFormation: CloudFormationClient;
  s3: S3Client;
  profile: string;
  region: string;
  environment: EnvironmentName;
}

export class AwsClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AwsClientError";
  }
}

interface AwsProfilesConfig {
  region: string;
  profiles: Record<EnvironmentName, string>;
}

export interface AwsClientHooks {
  createCredentials?: (profile: string) => () => Promise<unknown>;
  createCloudFormationClient?: (input: {
    region: string;
    credentials: () => Promise<unknown>;
  }) => CloudFormationClient;
  createS3Client?: (input: {
    region: string;
    credentials: () => Promise<unknown>;
  }) => S3Client;
}

const cache = new Map<string, EnvAwsClients>();

export async function getAwsClients(
  environment: EnvironmentName,
  aws: AwsProfilesConfig,
  hooks: AwsClientHooks = {},
): Promise<EnvAwsClients> {
  const profile = aws.profiles[environment];
  const cacheKey = `${environment}:${aws.region}:${profile}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const credentials =
    hooks.createCredentials?.(profile) ??
    (fromIni({ profile }) as () => Promise<unknown>);

  try {
    await credentials();
  } catch (error) {
    throw new AwsClientError(formatAwsAuthError(error, profile), { cause: error });
  }

  const createCloudFormationClient =
    hooks.createCloudFormationClient ??
    ((input) =>
      new CloudFormationClient({
        region: input.region,
        credentials: input.credentials as never,
      }));
  const createS3Client =
    hooks.createS3Client ??
    ((input) =>
      new S3Client({
        region: input.region,
        credentials: input.credentials as never,
      }));

  const clients: EnvAwsClients = {
    cloudFormation: createCloudFormationClient({ region: aws.region, credentials }),
    s3: createS3Client({ region: aws.region, credentials }),
    profile,
    region: aws.region,
    environment,
  };
  cache.set(cacheKey, clients);
  return clients;
}

export function clearAwsClientCache(): void {
  cache.clear();
}

export function formatAwsAuthError(error: unknown, profile: string): string {
  if (isSsoExpiredError(error)) {
    return (
      `AWS SSO session for profile "${profile}" has expired or is missing. ` +
      `Run: aws sso login --profile ${profile}`
    );
  }

  const detail = error instanceof Error ? error.message : String(error);
  return `Unable to resolve AWS credentials for profile "${profile}": ${detail}`;
}

export function isSsoExpiredError(error: unknown): boolean {
  const message = collectErrorText(error).toLowerCase();
  return (
    message.includes("token is expired") ||
    message.includes("token has expired") ||
    message.includes("session has expired") ||
    message.includes("refresh this sso session") ||
    message.includes("to refresh this sso") ||
    message.includes("login required") ||
    (message.includes("sso session") && message.includes("expired")) ||
    (message.includes("sso token") && message.includes("expired"))
  );
}

function collectErrorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const parts = [error.message, error.name];
  if (error.cause) {
    parts.push(collectErrorText(error.cause));
  }
  return parts.join(" ");
}
