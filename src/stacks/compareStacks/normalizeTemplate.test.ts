import { describe, expect, it } from "vitest";
import { hashTemplate, normalizeTemplate, shortHash } from "./normalizeTemplate.js";

describe("normalizeTemplate", () => {
  it("re-serializes JSON with sorted keys so key order does not change the hash", () => {
    const left = normalizeTemplate('{"Resources":{"B":{"Type":"AWS::SNS::Topic"},"A":{"Type":"AWS::SNS::Topic"}}}');
    const right = normalizeTemplate('{"Resources":{"A":{"Type":"AWS::SNS::Topic"},"B":{"Type":"AWS::SNS::Topic"}}}');

    expect(left).toBe(right);
    expect(hashTemplate(left)).toBe(hashTemplate(right));
  });

  it("leaves YAML templates unchanged", () => {
    const yaml = "AWSTemplateFormatVersion: '2010-09-09'\nResources: {}\n";
    expect(normalizeTemplate(yaml)).toBe(yaml);
  });

  it("exposes an 8-character short hash", () => {
    expect(shortHash('{"Resources":{}}')).toHaveLength(8);
  });
});
