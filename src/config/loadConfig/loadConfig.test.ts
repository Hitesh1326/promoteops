import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ConfigLoadError, loadConfig } from "./loadConfig.js";

describe("loadConfig", () => {
  it("loads a valid config and resolves project-relative paths", async () => {
    const projectRoot = await makeProjectRoot();
    const configPath = path.join(projectRoot, "config.yaml");
    await writeFile(
      configPath,
      [
        "aws:",
        "  region: us-east-1",
        "  profiles:",
        "    dev: dev-profile",
        "    test: test-profile",
        "    prod: prod-profile",
        "templates:",
        "  localPath: ../templates",
        "paths:",
        "  mapper: ./mapper.json",
        "  configTempDir: ./tmp/configs",
        "  reportOutput: ./tmp/report.html",
      ].join("\n"),
    );

    const config = await loadConfig({ projectRoot, configPath });

    expect(config.aws.profiles).toEqual({
      dev: "dev-profile",
      test: "test-profile",
      prod: "prod-profile",
    });
    expect(config.resolvedPaths.templatesLocalPath).toBe(path.resolve(projectRoot, "../templates"));
    expect(config.resolvedPaths.mapper).toBe(path.join(projectRoot, "mapper.json"));
    expect(config.resolvedPaths.configTempDir).toBe(path.join(projectRoot, "tmp/configs"));
    expect(config.resolvedPaths.reportOutput).toBe(path.join(projectRoot, "tmp/report.html"));
  });

  it("rejects invalid config with a useful path in the error", async () => {
    const projectRoot = await makeProjectRoot();
    const configPath = path.join(projectRoot, "config.yaml");
    await writeFile(
      configPath,
      [
        "aws:",
        "  region: us-east-1",
        "  profiles:",
        "    dev: dev-profile",
        "    test: test-profile",
        "templates:",
        "  localPath: ../templates",
        "paths:",
        "  mapper: ./mapper.json",
        "  configTempDir: ./tmp/configs",
        "  reportOutput: ./tmp/report.html",
      ].join("\n"),
    );

    await expect(loadConfig({ projectRoot, configPath })).rejects.toThrow(ConfigLoadError);
    await expect(loadConfig({ projectRoot, configPath })).rejects.toThrow("aws.profiles.prod");
  });
});

async function makeProjectRoot(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "promoteops-config-"));
  await mkdir(path.join(projectRoot, "tmp"), { recursive: true });
  return projectRoot;
}
