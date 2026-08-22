import { describe, expect, it } from "vitest";
import { parseAuditEntry } from "./auditEntry.js";

describe("parseAuditEntry", () => {
  it("accepts a minimal valid entry", () => {
    expect(
      parseAuditEntry({
        timestamp: "2026-07-29T12:00:00.000Z",
        action: "plan_created",
        planId: "abc",
      }),
    ).toMatchObject({ action: "plan_created", planId: "abc" });
  });

  it("rejects unknown actions", () => {
    expect(() =>
      parseAuditEntry({
        timestamp: "2026-07-29T12:00:00.000Z",
        action: "not_a_real_action",
        planId: "abc",
      }),
    ).toThrow(/Invalid audit entry/);
  });
});
