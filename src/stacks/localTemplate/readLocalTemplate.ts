/**
 * Load a CloudFormation template body from the configured local templates root.
 */
import path from "node:path";
import { readRequiredFile } from "../../shared/fileIO.js";

export class LocalTemplateError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LocalTemplateError";
  }
}

/** Tried, in order, when a mapper template name has no extension of its own. */
const FALLBACK_EXTENSIONS = [".yaml", ".yml", ".json", ".template"];

export async function readLocalTemplate(
  templatesLocalPath: string,
  templateName: string,
): Promise<string> {
  const trimmed = templateName.trim();
  if (!trimmed || trimmed.includes("..") || path.isAbsolute(trimmed)) {
    throw new LocalTemplateError(`Unsafe template name: ${templateName}`);
  }

  const resolvedRoot = path.resolve(templatesLocalPath);
  const hasExtension = path.extname(trimmed) !== "";
  const candidates = hasExtension
    ? [trimmed]
    : [trimmed, ...FALLBACK_EXTENSIONS.map((extension) => `${trimmed}${extension}`)];

  let lastError: unknown;
  for (const candidate of candidates) {
    const filePath = path.join(templatesLocalPath, candidate);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(`${resolvedRoot}${path.sep}`) && resolvedFile !== resolvedRoot) {
      throw new LocalTemplateError(`Template path escapes templates root: ${templateName}`);
    }
    try {
      return await readRequiredFile(filePath, "local template", (message, options) =>
        new LocalTemplateError(message, options),
      );
    } catch (error) {
      lastError = error;
    }
  }

  const tried = candidates.map((candidate) => path.join(templatesLocalPath, candidate)).join(", ");
  throw new LocalTemplateError(
    `Unable to read local template "${templateName}". Tried: ${tried}`,
    { cause: lastError },
  );
}
