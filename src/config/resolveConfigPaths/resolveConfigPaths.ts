import { resolveFromProjectRoot } from "../../shared/pathResolver.js";

interface ConfigPaths {
  templates: {
    localPath: string;
  };
  paths: {
    mapper: string;
    reportOutput: string;
  };
}

export interface ResolvedConfigPaths {
  templatesLocalPath: string;
  mapper: string;
  reportOutput: string;
}

export function resolveConfigPaths(config: ConfigPaths, projectRoot: string): ResolvedConfigPaths {
  return {
    templatesLocalPath: resolveFromProjectRoot(config.templates.localPath, projectRoot),
    mapper: resolveFromProjectRoot(config.paths.mapper, projectRoot),
    reportOutput: resolveFromProjectRoot(config.paths.reportOutput, projectRoot),
  };
}
