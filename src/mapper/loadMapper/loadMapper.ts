import type { PromoteOpsConfig } from "../../config/loadConfig/loadConfig.js";
import { readRequiredFile } from "../../shared/fileIO.js";
import { resolveFromProjectRoot, resolveProjectRoot } from "../../shared/pathResolver.js";
import { buildMapperInstances, MapperNormalizationError, type NormalizedMapperInstance } from "../normalizeMapper/normalizeMapper.js";
import { MapperParseError, parseMapperFile } from "../parseMapperFile/parseMapperFile.js";

export interface LoadMapperOptions {
  mapperPath?: string;
  projectRoot?: string;
  config?: PromoteOpsConfig;
}

export interface LoadedMapper {
  mappings: Record<string, { dev: string; test: string; prod: string }[]>;
  mapperPath: string;
  projectRoot: string;
  instances: NormalizedMapperInstance[];
}

export class MapperLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MapperLoadError";
  }
}

export async function loadMapper(options: LoadMapperOptions = {}): Promise<LoadedMapper> {
  const projectRoot = resolveProjectRoot(options.projectRoot ?? options.config?.projectRoot);
  const mapperPath =
    options.mapperPath ??
    options.config?.resolvedPaths.mapper ??
    resolveFromProjectRoot("mapper.json", projectRoot);
  const resolvedMapperPath = resolveFromProjectRoot(mapperPath, projectRoot);
  const fileText = await readRequiredFile(
    resolvedMapperPath,
    "mapper",
    (message, options) => new MapperLoadError(message, options),
  );
  const mapper = toMapperLoadError(() => parseMapperFile(fileText, resolvedMapperPath));
  const instances = toMapperLoadError(() => buildMapperInstances(mapper));

  return {
    ...mapper,
    mapperPath: resolvedMapperPath,
    projectRoot,
    instances,
  };
}

function toMapperLoadError<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof MapperParseError || error instanceof MapperNormalizationError) {
      throw new MapperLoadError(error.message, { cause: error });
    }
    throw error;
  }
}
