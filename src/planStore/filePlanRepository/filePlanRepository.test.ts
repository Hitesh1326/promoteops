import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlanRecord } from "../planRecord/planRecord.js";
import { FilePlanRepository, PlanStoreError } from "./filePlanRepository.js";

function samplePlan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return {
    planId: "22222222-2222-2222-2222-222222222222",
    kind: "stack",
    createdAt: "2026-07-29T12:00:00.000Z",
    status: "pending",
    templateName: "payments.yaml",
    instanceId: "payments-dev",
    sourceEnv: "dev",
    targetEnv: "test",
    stackName: "payments-test",
    targetCurrentTemplateHash: "hash-target-1",
    templateBody: '{"Resources":{}}',
    parameters: { Env: "test" },
    ...overrides,
  };
}

describe("FilePlanRepository", () => {
  let plansDirectory: string;
  let repository: FilePlanRepository;

  beforeEach(async () => {
    plansDirectory = await mkdtemp(path.join(tmpdir(), "promoteops-plans-"));
    repository = new FilePlanRepository({ plansDirectory });
  });

  afterEach(async () => {
    await rm(plansDirectory, { recursive: true, force: true });
  });

  it("saves and loads a plan round-trip", async () => {
    const plan = samplePlan();
    await repository.save(plan);
    await expect(repository.load(plan.planId)).resolves.toEqual(plan);

    const onDisk = await readFile(path.join(plansDirectory, `${plan.planId}.json`), "utf8");
    expect(JSON.parse(onDisk)).toEqual(plan);
  });

  it("marks a pending plan as executed", async () => {
    const plan = samplePlan();
    await repository.save(plan);

    const executed = await repository.markExecuted(plan.planId, "2026-07-29T13:00:00.000Z");
    expect(executed.status).toBe("executed");
    expect(executed.executedAt).toBe("2026-07-29T13:00:00.000Z");
    await expect(repository.load(plan.planId)).resolves.toEqual(executed);
  });

  it("rejects marking an already-executed plan", async () => {
    const plan = samplePlan({
      status: "executed",
      executedAt: "2026-07-29T13:00:00.000Z",
    });
    await repository.save(plan);
    await expect(repository.markExecuted(plan.planId, "2026-07-29T14:00:00.000Z")).rejects.toThrow(
      PlanStoreError,
    );
  });

  it("rejects unsafe plan ids", async () => {
    await expect(repository.load("../escape")).rejects.toThrow(PlanStoreError);
  });

  it("fails clearly when the plan file is missing", async () => {
    await expect(repository.load("missing-plan-id")).rejects.toThrow(PlanStoreError);
  });
});
