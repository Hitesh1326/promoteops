import { describe, expect, it } from "vitest";

import { MapperParseError, parseMapperFile } from "./parseMapperFile.js";

describe("parseMapperFile", () => {
  it("parses valid JSON into the validated shape", () => {
    const mapper = parseMapperFile(
      JSON.stringify({ mappings: { one: [{ dev: "dev", test: "test", prod: "prod" }] } }),
      "mapper.json",
    );

    expect(mapper.mappings.one).toEqual([{ dev: "dev", test: "test", prod: "prod" }]);
  });

  it("rejects malformed JSON syntax", () => {
    const brokenJson = '{ "mappings": { "one": [ }';

    expect(() => parseMapperFile(brokenJson, "mapper.json")).toThrow(MapperParseError);
    expect(() => parseMapperFile(brokenJson, "mapper.json")).toThrow("Invalid JSON");
  });

  it("rejects JSON that doesn't match the mapper schema", () => {
    const missingProd = JSON.stringify({ mappings: { one: [{ dev: "dev", test: "test" }] } });

    expect(() => parseMapperFile(missingProd, "mapper.json")).toThrow(MapperParseError);
    expect(() => parseMapperFile(missingProd, "mapper.json")).toThrow("Invalid mapper file");
  });
});
