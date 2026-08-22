import { describe, expect, it } from "vitest";

import { ConfigParseError, parseConfigFile } from "./parseConfigFile.js";

const validYaml = [
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
  "  reportOutput: ./tmp/report.html",
].join("\n");

describe("parseConfigFile", () => {
  it("parses valid YAML into the validated shape", () => {
    const config = parseConfigFile(validYaml, "config.yaml");

    expect(config.aws.region).toBe("us-east-1");
    expect(config.templates.localPath).toBe("./templates");
  });

  it("rejects malformed YAML syntax", () => {
    const brokenYaml = "aws:\n  region: us-east-1\n  profiles: [dev: dev-profile";

    expect(() => parseConfigFile(brokenYaml, "config.yaml")).toThrow(ConfigParseError);
    expect(() => parseConfigFile(brokenYaml, "config.yaml")).toThrow("Invalid YAML");
  });

  it("rejects YAML that doesn't match the config schema", () => {
    expect(() => parseConfigFile("aws: {}", "config.yaml")).toThrow(ConfigParseError);
    expect(() => parseConfigFile("aws: {}", "config.yaml")).toThrow("Invalid config file");
  });
});
