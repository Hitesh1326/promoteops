import { homedir } from "node:os";
import path from "node:path";

export function resolvePromoteOpsHome(homeDirectory = homedir()): string {
  return path.join(homeDirectory, ".promoteops");
}

export function resolvePlansDirectory(homeDirectory = homedir()): string {
  return path.join(resolvePromoteOpsHome(homeDirectory), "plans");
}

export function resolveAuditLogPath(homeDirectory = homedir()): string {
  return path.join(resolvePromoteOpsHome(homeDirectory), "audit.log");
}
