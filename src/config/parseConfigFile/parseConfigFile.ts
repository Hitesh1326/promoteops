import { load as loadYaml } from "js-yaml";

import { formatZodError } from "../../shared/zodError.js";
import { configFileSchema } from "../configFileSchema/configFileSchema.js";

export class ConfigParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfigParseError";
  }
}

export function parseConfigFile(fileText: string, configPath: string) {
  const parsed = parseYaml(fileText, configPath);
  const result = configFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigParseError(`Invalid config file ${configPath}: ${formatZodError(result.error)}`);
  }
  return result.data;
}

function parseYaml(fileText: string, configPath: string): unknown {
  try {
    return loadYaml(fileText);
  } catch (error) {
    throw new ConfigParseError(`Invalid YAML in config file ${configPath}`, { cause: error });
  }
}
