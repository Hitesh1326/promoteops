import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../../config/loadConfig/loadConfig.js";
import { loadMapper, MapperLoadError } from "./loadMapper.js";
import { getMapperInstanceId, MapperNormalizationError } from "../normalizeMapper/normalizeMapper.js";
import { EXCLUDED, NOT_DEPLOYED } from "../specialValues/specialValues.js";

describe("loadMapper", () => {
  it("loads mapper entries and normalizes special values", async () => {
    const projectRoot = await makeProjectRoot();
    const mapperPath = path.join(projectRoot, "mapper.json");
    await writeFile(
      mapperPath,
      JSON.stringify(
        {
          mappings: {
            "example-template": [
              {
                dev: "example-dev",
                test: "example-test",
                prod: "example-prod",
              },
            ],
            "example-with-special-values": [
              {
                dev: NOT_DEPLOYED,
                test: "example-test-only",
                prod: EXCLUDED,
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    const mapper = await loadMapper({ projectRoot, mapperPath });

    expect(mapper.instances).toHaveLength(2);
    expect(mapper.instances[0]).toMatchObject({
      templateName: "example-template",
      instanceId: "example-dev",
    });
    expect(mapper.instances[1]).toMatchObject({
      templateName: "example-with-special-values",
      instanceId: "example-test-only",
      environments: {
        dev: { kind: "special", value: NOT_DEPLOYED },
        test: { kind: "stack", value: "example-test-only" },
        prod: { kind: "special", value: EXCLUDED },
      },
    });
  });

  it("loads the mapper path from config", async () => {
    const projectRoot = await makeProjectRoot();
    await writeConfig(projectRoot);
    await writeFile(
      path.join(projectRoot, "mapper.json"),
      JSON.stringify({ mappings: { one: [{ dev: "dev", test: "test", prod: "prod" }] } }),
    );

    const config = await loadConfig({ projectRoot });
    const mapper = await loadMapper({ config });

    expect(mapper.mapperPath).toBe(path.join(projectRoot, "mapper.json"));
    expect(mapper.instances[0]?.instanceId).toBe("dev");
  });

  it("rejects invalid mapper values", async () => {
    const projectRoot = await makeProjectRoot();
    const mapperPath = path.join(projectRoot, "mapper.json");
    await writeFile(
      mapperPath,
      JSON.stringify({
        mappings: {
          broken: [{ dev: "dev", test: "", prod: "prod" }],
        },
      }),
    );

    await expect(loadMapper({ projectRoot, mapperPath })).rejects.toThrow(MapperLoadError);
    await expect(loadMapper({ projectRoot, mapperPath })).rejects.toThrow("mappings.broken.0.test");
  });

  it("rejects a mapper where two instances resolve to the same instance id", async () => {
    const projectRoot = await makeProjectRoot();
    const mapperPath = path.join(projectRoot, "mapper.json");
    await writeFile(
      mapperPath,
      JSON.stringify({
        mappings: {
          "template-a": [{ dev: "shared-name", test: "template-a-test", prod: "template-a-prod" }],
          "template-b": [{ dev: "shared-name", test: "template-b-test", prod: "template-b-prod" }],
        },
      }),
    );

    await expect(loadMapper({ projectRoot, mapperPath })).rejects.toThrow(MapperLoadError);
    await expect(loadMapper({ projectRoot, mapperPath })).rejects.toThrow(/Duplicate mapper instance id "shared-name"/);
  });

  it("requires at least one deployable stack name for instance ids", () => {
    expect(() =>
      getMapperInstanceId("all-special", {
        dev: NOT_DEPLOYED,
        test: EXCLUDED,
        prod: EXCLUDED,
      }),
    ).toThrow(MapperNormalizationError);
  });
});

async function makeProjectRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "promoteops-mapper-"));
}

async function writeConfig(projectRoot: string): Promise<void> {
  await writeFile(
    path.join(projectRoot, "config.yaml"),
    [
      "aws:",
      "  region: us-east-1",
      "  profiles:",
      "    dev: dev-profile",
      "    test: test-profile",
      "    prod: prod-profile",
      "templates:",
      "  localPath: ./templates",
      "paths:",
      "  mapper: ./mapper.json",
      "  configTempDir: ./tmp/configs",
      "  reportOutput: ./tmp/report.html",
    ].join("\n"),
  );
}
