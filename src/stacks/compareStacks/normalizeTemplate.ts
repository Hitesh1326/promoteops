import { createHash } from "node:crypto";

/**
 * Canonicalize a CloudFormation template body before hashing.
 * YAML is left as-is; JSON is re-serialized with sorted keys.
 */
export function normalizeTemplate(body: string): string {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("AWSTemplateFormatVersion:") || trimmed.startsWith("---")) {
    return body;
  }

  try {
    return JSON.stringify(JSON.parse(body), sortKeys, 2);
  } catch {
    return body;
  }
}

/** SHA-256 hex digest of the normalized template. */
export function hashTemplate(body: string): string {
  return createHash("sha256").update(normalizeTemplate(body), "utf8").digest("hex");
}

/** First 8 hex chars of the template hash for compact UI display. */
export function shortHash(body: string): string {
  return hashTemplate(body).slice(0, 8);
}

function sortKeys(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  }
  return value;
}
