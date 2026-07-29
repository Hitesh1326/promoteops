import { describe, expect, it } from "vitest";
import {
  contentFingerprint,
  hashTemplate,
  normalizeTemplate,
  shortHash,
  templatesContentEqual,
} from "./normalizeTemplate.js";

describe("normalizeTemplate", () => {
  it("re-serializes JSON with sorted keys so key order does not change the hash", () => {
    const left = '{"Resources":{"B":{"Type":"AWS::SNS::Topic"},"A":{"Type":"AWS::SNS::Topic"}}}';
    const right = '{"Resources":{"A":{"Type":"AWS::SNS::Topic"},"B":{"Type":"AWS::SNS::Topic"}}}';

    expect(hashTemplate(left)).toBe(hashTemplate(right));
    expect(templatesContentEqual(left, right)).toBe(true);
  });

  it("treats JSON pretty vs minified as the same content", () => {
    const pretty = `{
  "AWSTemplateFormatVersion": "2010-09-09",
  "Resources": {
    "Queue": { "Type": "AWS::SQS::Queue" }
  }
}`;
    const minified = '{"AWSTemplateFormatVersion":"2010-09-09","Resources":{"Queue":{"Type":"AWS::SQS::Queue"}}}';

    expect(templatesContentEqual(pretty, minified)).toBe(true);
  });

  it("ignores YAML whitespace-only differences", () => {
    const left = "AWSTemplateFormatVersion: '2010-09-09'\nResources:\n  Queue:\n    Type: AWS::SQS::Queue\n";
    const right = "AWSTemplateFormatVersion: '2010-09-09'\n\nResources:\n  Queue:\n    Type: AWS::SQS::Queue\n  \n";

    expect(templatesContentEqual(left, right)).toBe(true);
    expect(contentFingerprint(left)).toBe(contentFingerprint(right));
  });

  it("still detects real YAML content changes", () => {
    const left = "Resources:\n  Queue:\n    Type: AWS::SQS::Queue\n    Properties:\n      VisibilityTimeout: 30\n";
    const right = "Resources:\n  Queue:\n    Type: AWS::SQS::Queue\n    Properties:\n      VisibilityTimeout: 45\n";

    expect(templatesContentEqual(left, right)).toBe(false);
  });

  it("normalizes JSON for readable diffs", () => {
    const normalized = normalizeTemplate('{"Resources":{"B":1,"A":2}}');
    expect(normalized).toContain('"A": 2');
    expect(normalized.indexOf('"A"')).toBeLessThan(normalized.indexOf('"B"'));
  });

  it("exposes an 8-character short hash", () => {
    expect(shortHash('{"Resources":{}}')).toHaveLength(8);
  });
});
