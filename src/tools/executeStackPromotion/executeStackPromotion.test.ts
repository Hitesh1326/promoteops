import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { ABSENT_TARGET_HASH } from "../../aws/stackInspect/inspectStack.js";
import { LocalFileAuditLogger } from "../../audit/localFileAuditLogger/localFileAuditLogger.js";
import { FilePlanRepository } from "../../planStore/filePlanRepository/filePlanRepository.js";
import type { PlanRecord } from "../../planStore/planRecord/planRecord.js";
import { executeStackPromotion } from "./executeStackPromotion.js";

function pendingPlan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return {
    planId: "exec-plan-1",
    kind: "stack",
    createdAt: "2026-07-30T12:00:00.000Z",
    status: "pending",
    templateName: "payments.yaml",
    instanceId: "payments-dev",
    sourceEnv: "dev",
    targetEnv: "test",
    stackName: "payments-test",
    targetCurrentTemplateHash: "abc123",
    templateBody: '{"Resources":{}}',
    parameters: { Env: "test" },
    ...overrides,
  };
}

describe("executeStackPromotion", () => {
  let root: string;
  let plansDirectory: string;
  let auditLogPath: string;
  let plans: FilePlanRepository;
  let audit: LocalFileAuditLogger;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "promoteops-exec-tool-"));
    plansDirectory = path.join(root, "plans");
    auditLogPath = path.join(root, "audit.log");
    plans = new FilePlanRepository({ plansDirectory });
    audit = new LocalFileAuditLogger({ auditLogPath });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("elicits, applies a change set, and marks the plan executed", async () => {
    await plans.save(pendingPlan());

    const result = await executeStackPromotion(
      { planId: "exec-plan-1" },
      {
        loadConfig: async () =>
          ({
            aws: { region: "us-east-1", profiles: { dev: "d", test: "t", prod: "p" } },
          }) as never,
        getAwsClients: async () =>
          ({
            cloudFormation: {} as CloudFormationClient,
            profile: "t",
            region: "us-east-1",
            environment: "test",
          }),
        inspectStack: async () => ({
          exists: true,
          templateHash: "abc123",
          lastActivity: "2026-01-01T00:00:00.000Z",
        }),
        confirm: async () => ({ action: "accept" }),
        applyStackChangeSet: async () => ({
          changeSetName: "cs-ok",
          changeSetKind: "UPDATE",
          stackName: "payments-test",
        }),
        plans,
        audit,
        now: () => new Date("2026-07-30T13:00:00.000Z"),
      },
    );

    expect(result.outcome).toBe("executed");
    expect(result.plan.status).toBe("executed");
    expect(result.changeSet?.changeSetName).toBe("cs-ok");
    expect(result.chatSummary).toContain("Executed plan");
  });

  it("reports a failed outcome when the change set rolls back", async () => {
    await plans.save(pendingPlan());

    const result = await executeStackPromotion(
      { planId: "exec-plan-1" },
      {
        loadConfig: async () =>
          ({
            aws: { region: "us-east-1", profiles: { dev: "d", test: "t", prod: "p" } },
          }) as never,
        getAwsClients: async () =>
          ({
            cloudFormation: {} as CloudFormationClient,
            profile: "t",
            region: "us-east-1",
            environment: "test",
          }),
        inspectStack: async () => ({ exists: true, templateHash: "abc123" }),
        confirm: async () => ({ action: "accept" }),
        applyStackChangeSet: async () => ({
          changeSetName: "cs-fail",
          changeSetKind: "UPDATE",
          stackName: "payments-test",
          finalStatus: "UPDATE_ROLLBACK_COMPLETE",
          succeeded: false,
          statusReason: "Resource X failed to update",
        }),
        plans,
        audit,
        now: () => new Date("2026-07-30T13:00:00.000Z"),
      },
    );

    expect(result.outcome).toBe("failed");
    expect(result.plan.status).toBe("executed");
    expect(result.chatSummary).toContain("did NOT succeed");
    expect(result.chatSummary).toContain("UPDATE_ROLLBACK_COMPLETE");
    expect(result.chatSummary).toContain("Resource X failed to update");
  });

  it("rejects a stale plan without applying", async () => {
    await plans.save(pendingPlan());
    let applied = false;

    const result = await executeStackPromotion(
      { planId: "exec-plan-1" },
      {
        loadConfig: async () =>
          ({
            aws: { region: "us-east-1", profiles: { dev: "d", test: "t", prod: "p" } },
          }) as never,
        getAwsClients: async () =>
          ({
            cloudFormation: {} as CloudFormationClient,
            profile: "t",
            region: "us-east-1",
            environment: "test",
          }),
        inspectStack: async () => ({ exists: true, templateHash: "different" }),
        confirm: async () => ({ action: "accept" }),
        applyStackChangeSet: async () => {
          applied = true;
          return { changeSetName: "x", changeSetKind: "UPDATE", stackName: "payments-test" };
        },
        plans,
        audit,
      },
    );

    expect(result.outcome).toBe("rejected_stale");
    expect(applied).toBe(false);
  });

  it("records elicit denial without inspecting AWS", async () => {
    await plans.save(pendingPlan());
    let inspected = false;
    let applied = false;

    const result = await executeStackPromotion(
      { planId: "exec-plan-1" },
      {
        loadConfig: async () =>
          ({
            aws: { region: "us-east-1", profiles: { dev: "d", test: "t", prod: "p" } },
          }) as never,
        getAwsClients: async () =>
          ({
            cloudFormation: {} as CloudFormationClient,
            profile: "t",
            region: "us-east-1",
            environment: "test",
          }),
        inspectStack: async () => {
          inspected = true;
          return { exists: true, templateHash: "abc123" };
        },
        confirm: async () => ({ action: "decline" }),
        applyStackChangeSet: async () => {
          applied = true;
          return { changeSetName: "x", changeSetKind: "UPDATE", stackName: "payments-test" };
        },
        plans,
        audit,
      },
    );

    expect(result.outcome).toBe("denied");
    expect(inspected).toBe(false);
    expect(applied).toBe(false);
  });

  it("uses CREATE when the plan captured an absent target", async () => {
    await plans.save(
      pendingPlan({
        targetCurrentTemplateHash: ABSENT_TARGET_HASH,
      }),
    );

    let kind: string | undefined;
    await executeStackPromotion(
      { planId: "exec-plan-1" },
      {
        loadConfig: async () =>
          ({
            aws: { region: "us-east-1", profiles: { dev: "d", test: "t", prod: "p" } },
          }) as never,
        getAwsClients: async () =>
          ({
            cloudFormation: {} as CloudFormationClient,
            profile: "t",
            region: "us-east-1",
            environment: "test",
          }),
        inspectStack: async () => ({ exists: false, templateHash: ABSENT_TARGET_HASH }),
        confirm: async () => ({ action: "accept" }),
        applyStackChangeSet: async (input) => {
          kind = input.changeSetKind;
          return {
            changeSetName: "cs-create",
            changeSetKind: input.changeSetKind,
            stackName: input.stackName,
          };
        },
        plans,
        audit,
      },
    );

    expect(kind).toBe("CREATE");
  });
});
