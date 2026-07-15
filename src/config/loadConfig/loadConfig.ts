import { readRequiredFile } from "../../shared/fileIO.js";
import { resolveFromProjectRoot, resolveProjectRoot } from "../../shared/pathResolver.js";
import { ConfigParseError, parseConfigFile } from "../parseConfigFile/parseConfigFile.js";
import { resolveConfigPaths, type ResolvedConfigPaths } from "../resolveConfigPaths/resolveConfigPaths.js";

export interface LoadConfigOptions {
  configPath?: string;
  projectRoot?: string;
}

export interface PromoteOpsConfig {
  aws: {
    region: string;
    profiles: {
      dev: string;
      test: string;
      prod: string;
    };
  };
  templates: {
    localPath: string;
  };
  paths: {
    mapper: string;
    configTempDir: string;
    reportOutput: string;
  };
  configPath: string;
  projectRoot: string;
  resolvedPaths: ResolvedConfigPaths;
}

export class ConfigLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfigLoadError";
  }
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<PromoteOpsConfig> {
  const projectRoot = resolveProjectRoot(options.projectRoot);
  const configPath = resolveFromProjectRoot(options.configPath ?? "config.yaml", projectRoot);
  const fileText = await readRequiredFile(
    configPath,
    "config",
    (message, options) => new ConfigLoadError(message, options),
  );
  const config = toConfigLoadError(() => parseConfigFile(fileText, configPath));

  return {
    ...config,
    configPath,
    projectRoot,
    resolvedPaths: resolveConfigPaths(config, projectRoot),
  };
}

function toConfigLoadError<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ConfigParseError) {
      throw new ConfigLoadError(error.message, { cause: error });
    }
    throw error;
  }
}
