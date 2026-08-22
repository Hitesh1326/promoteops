import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuditEntry } from "../auditEntry/auditEntry.js";
import { LocalFileAuditLogger } from "./localFileAuditLogger.js";

describe("LocalFileAuditLogger", () => {
  let root: string;
  let auditLogPath: string;
  let logger: LocalFileAuditLogger;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "promoteops-audit-"));
    auditLogPath = path.join(root, "audit.log");
    logger = new LocalFileAuditLogger({ auditLogPath });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("appends JSONL entries that round-trip", async () => {
    const first: AuditEntry = {
      timestamp: "2026-07-29T12:00:00.000Z",
      action: "plan_created",
      planId: "plan-1",
      templateName: "payments.yaml",
      sourceEnv: "dev",
      targetEnv: "test",
    };
    const second: AuditEntry = {
      timestamp: "2026-07-29T12:05:00.000Z",
      action: "plan_executed",
      planId: "plan-1",
    };

    await logger.append(first);
    await logger.append(second);

    const lines = (await readFile(auditLogPath, "utf8")).trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual(first);
    expect(JSON.parse(lines[1]!)).toEqual(second);
  });
});
