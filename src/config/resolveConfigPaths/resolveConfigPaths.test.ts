import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveConfigPaths } from "./resolveConfigPaths.js";

describe("resolveConfigPaths", () => {
  it("resolves relative paths against the project root", () => {
    const projectRoot = "/project";
    const resolved = resolveConfigPaths(
      {
        templates: { localPath: "../templates" },
        paths: { mapper: "./mapper.json", reportOutput: "./tmp/report.html" },
      },
      projectRoot,
    );

    expect(resolved).toEqual({
      templatesLocalPath: path.resolve(projectRoot, "../templates"),
      mapper: path.join(projectRoot, "mapper.json"),
      reportOutput: path.join(projectRoot, "tmp/report.html"),
    });
  });

  it("leaves already-absolute paths untouched", () => {
    const resolved = resolveConfigPaths(
      {
        templates: { localPath: "/abs/templates" },
        paths: { mapper: "/abs/mapper.json", reportOutput: "./tmp/report.html" },
      },
      "/project",
    );

    expect(resolved.templatesLocalPath).toBe(path.normalize("/abs/templates"));
    expect(resolved.mapper).toBe(path.normalize("/abs/mapper.json"));
  });
});
