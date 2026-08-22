import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolvePlansDirectory } from "../../shared/promoteOpsHome.js";
import { parsePlanRecord, type PlanRecord } from "../planRecord/planRecord.js";

export class PlanStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PlanStoreError";
  }
}

export interface PlanRepository {
  save(plan: PlanRecord): Promise<void>;
  load(planId: string): Promise<PlanRecord>;
  markExecuted(planId: string, executedAt: string): Promise<PlanRecord>;
}

export interface FilePlanRepositoryOptions {
  /** Override plans directory (tests). Defaults to `~/.promoteops/plans`. */
  plansDirectory?: string;
  homeDirectory?: string;
}

export class FilePlanRepository implements PlanRepository {
  private readonly plansDirectory: string;

  constructor(options: FilePlanRepositoryOptions = {}) {
    this.plansDirectory =
      options.plansDirectory ?? resolvePlansDirectory(options.homeDirectory);
  }

  async save(plan: PlanRecord): Promise<void> {
    const validated = parsePlanRecord(plan, plan.planId);
    const filePath = this.planPath(validated.planId);
    try {
      await mkdir(this.plansDirectory, { recursive: true, mode: 0o700 });
      await writePrivateJsonAtomically(filePath, validated);
    } catch (error) {
      if (error instanceof PlanStoreError) {
        throw error;
      }
      throw new PlanStoreError(`Unable to save plan ${validated.planId}`, { cause: error });
    }
  }

  async load(planId: string): Promise<PlanRecord> {
    const filePath = this.planPath(planId);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      throw new PlanStoreError(`Unable to load plan ${planId}`, { cause: error });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new PlanStoreError(`Plan ${planId} is not valid JSON`, { cause: error });
    }
    try {
      return parsePlanRecord(parsed, planId);
    } catch (error) {
      throw new PlanStoreError(
        error instanceof Error ? error.message : `Invalid plan ${planId}`,
        { cause: error },
      );
    }
  }

  async markExecuted(planId: string, executedAt: string): Promise<PlanRecord> {
    const existing = await this.load(planId);
    if (existing.status === "executed") {
      throw new PlanStoreError(`Plan ${planId} is already executed`);
    }
    const updated = parsePlanRecord(
      {
        ...existing,
        status: "executed",
        executedAt,
      },
      planId,
    );
    await this.save(updated);
    return updated;
  }

  private planPath(planId: string): string {
    assertSafePlanId(planId);
    return path.join(this.plansDirectory, `${planId}.json`);
  }
}

function assertSafePlanId(planId: string): void {
  if (!planId || planId !== planId.trim()) {
    throw new PlanStoreError("planId must be a non-empty trimmed string");
  }
  if (planId.includes("/") || planId.includes("\\") || planId.includes("..")) {
    throw new PlanStoreError(`Unsafe planId: ${planId}`);
  }
}

async function writePrivateJsonAtomically(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
