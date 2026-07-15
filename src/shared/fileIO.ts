import { readFile } from "node:fs/promises";

export async function readRequiredFile(
  filePath: string,
  label: string,
  createError: (message: string, options?: ErrorOptions) => Error,
): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    throw createError(`Unable to read ${label} file ${filePath}`, { cause: error });
  }
}
