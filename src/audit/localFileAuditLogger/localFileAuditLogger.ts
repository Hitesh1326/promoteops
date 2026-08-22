import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { resolveAuditLogPath } from "../../shared/promoteOpsHome.js";
import { parseAuditEntry, type AuditEntry } from "../auditEntry/auditEntry.js";

export class AuditLogError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuditLogError";
  }
}

export interface AuditLogger {
  append(entry: AuditEntry): Promise<void>;
}

export interface LocalFileAuditLoggerOptions {
  /** Override audit log file path (tests). Defaults to `~/.promoteops/audit.log`. */
  auditLogPath?: string;
  homeDirectory?: string;
}

export class LocalFileAuditLogger implements AuditLogger {
  private readonly auditLogPath: string;

  constructor(options: LocalFileAuditLoggerOptions = {}) {
    this.auditLogPath = options.auditLogPath ?? resolveAuditLogPath(options.homeDirectory);
  }

  async append(entry: AuditEntry): Promise<void> {
    const validated = parseAuditEntry(entry);
    const line = `${JSON.stringify(validated)}\n`;
    try {
      await mkdir(path.dirname(this.auditLogPath), { recursive: true, mode: 0o700 });
      await appendFile(this.auditLogPath, line, { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      throw new AuditLogError(`Unable to append audit entry for plan ${validated.planId}`, {
        cause: error,
      });
    }
  }
}
