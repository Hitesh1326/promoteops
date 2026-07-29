import { createHash } from "node:crypto";

/**
 * Canonicalize a CloudFormation template for display and stable comparison.
 * GetTemplate may return JSON or YAML; JSON is re-serialized with sorted keys.
 * YAML/other text gets line-ending and trailing-space cleanup only (CFN tags stay intact).
 */
export function normalizeTemplate(body: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      return `${JSON.stringify(JSON.parse(trimmed), sortKeys, 2)}\n`;
    } catch {
    }
  }

  return `${body
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd()}\n`;
}

/**
 * Equality fingerprint: JSON canonicalize when possible, then strip whitespace
 * so formatting noise does not false-flag drift.
 */
export function contentFingerprint(body: string): string {
  return normalizeTemplate(body).replace(/\s+/g, "");
}

export function hashTemplate(body: string): string {
  return createHash("sha256").update(contentFingerprint(body), "utf8").digest("hex");
}

export function shortHash(body: string): string {
  return hashTemplate(body).slice(0, 8);
}

export function templatesContentEqual(left: string, right: string): boolean {
  return contentFingerprint(left) === contentFingerprint(right);
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
