import { describe, expect, it } from "vitest";

import { CliParseError, parseCliArgs } from "./parseCliArgs.js";

describe("parseCliArgs", () => {
  it("returns no root when argv is empty", () => {
    expect(parseCliArgs([])).toEqual({});
  });

  it("reads --root followed by a path", () => {
    expect(parseCliArgs(["--root", "/absolute/path/to/promoteops-config"])).toEqual({
      root: "/absolute/path/to/promoteops-config",
    });
  });

  it("reads --root=path", () => {
    expect(parseCliArgs(["--root=/absolute/path/to/promoteops-config"])).toEqual({
      root: "/absolute/path/to/promoteops-config",
    });
  });

  it("rejects a missing --root value", () => {
    expect(() => parseCliArgs(["--root"])).toThrow(CliParseError);
    expect(() => parseCliArgs(["--root"])).toThrow("Missing value for --root");
  });

  it("rejects a repeated --root", () => {
    expect(() => parseCliArgs(["--root", "/a", "--root", "/b"])).toThrow("--root may only be specified once");
  });

  it("rejects unknown arguments", () => {
    expect(() => parseCliArgs(["--cwd", "/tmp"])).toThrow('Unknown argument "--cwd"');
  });
});
