import { resolveFromProjectRoot } from "../../shared/pathResolver.js";

interface ConfigPaths {
  templates: {
    localPath: string;
  };
  paths: {
    mapper: string;
    configTempDir: string;
    reportOutput: string;
  };
}

export interface ResolvedConfigPaths {
  templatesLocalPath: string;
  mapper: string;
  configTempDir: string;
  reportOutput: string;
}

export function resolveConfigPaths(config: ConfigPaths, projectRoot: string): ResolvedConfigPaths {
  return {
    templatesLocalPath: resolveFromProjectRoot(config.templates.localPath, projectRoot),
    mapper: resolveFromProjectRoot(config.paths.mapper, projectRoot),
    configTempDir: resolveFromProjectRoot(config.paths.configTempDir, projectRoot),
    reportOutput: resolveFromProjectRoot(config.paths.reportOutput, projectRoot),
  };
}
