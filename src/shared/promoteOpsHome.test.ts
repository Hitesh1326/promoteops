import { describe, expect, it } from "vitest";
import {
  resolveAuditLogPath,
  resolvePlansDirectory,
  resolvePromoteOpsHome,
} from "./promoteOpsHome.js";

describe("promoteOpsHome", () => {
  it("resolves default paths under the given home directory", () => {
    expect(resolvePromoteOpsHome("/tmp/home")).toBe("/tmp/home/.promoteops");
    expect(resolvePlansDirectory("/tmp/home")).toBe("/tmp/home/.promoteops/plans");
    expect(resolveAuditLogPath("/tmp/home")).toBe("/tmp/home/.promoteops/audit.log");
  });
});
