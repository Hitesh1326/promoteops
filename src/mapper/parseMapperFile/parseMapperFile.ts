import { formatZodError } from "../../shared/zodError.js";
import { mapperFileSchema } from "../mapperFileSchema/mapperFileSchema.js";

export class MapperParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MapperParseError";
  }
}

export function parseMapperFile(fileText: string, mapperPath: string) {
  const parsed = parseJson(fileText, mapperPath);
  const result = mapperFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new MapperParseError(`Invalid mapper file ${mapperPath}: ${formatZodError(result.error)}`);
  }
  return result.data;
}

function parseJson(fileText: string, mapperPath: string): unknown {
  try {
    return JSON.parse(fileText);
  } catch (error) {
    throw new MapperParseError(`Invalid JSON in mapper file ${mapperPath}`, { cause: error });
  }
}
