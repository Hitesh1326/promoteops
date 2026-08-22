import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { ABSENT_TARGET_HASH } from "../../aws/stackInspect/inspectStack.js";
import { LocalFileAuditLogger } from "../../audit/localFileAuditLogger/localFileAuditLogger.js";
import { buildMapperInstances } from "../../mapper/normalizeMapper/normalizeMapper.js";
import { FilePlanRepository } from "../../planStore/filePlanRepository/filePlanRepository.js";
import { hashTemplate } from "../../stacks/compareStacks/normalizeTemplate.js";
import { planStackPromotion } from "./planStackPromotion.js";

describe("planStackPromotion", () => {
  let root: string;
  let templatesDir: string;
  let plansDirectory: string;
  let auditLogPath: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "promoteops-plan-tool-"));
    templatesDir = path.join(root, "templates");
    plansDirectory = path.join(root, "plans");
    auditLogPath = path.join(root, "audit.log");
    await mkdir(templatesDir, { recursive: true });
    await writeFile(
      path.join(templatesDir, "payments.yaml"),
      '{"Resources":{"Q":{"Type":"AWS::SQS::Queue"}}}\n',
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("saves a pending update plan from the local template without CFN writes", async () => {
    const targetBody =
      '{"Resources":{"Q":{"Type":"AWS::SQS::Queue","Properties":{"VisibilityTimeout":30}}}}\n';
    const result = await planStackPromotion(
      {
        templateName: "payments.yaml",
        sourceEnv: "dev",
        targetEnv: "test",
        parameters: { Env: "test" },
      },
      {
        loadConfig: async () =>
          ({
            aws: { region: "us-east-1", profiles: { dev: "d", test: "t", prod: "p" } },
            resolvedPaths: { templatesLocalPath: templatesDir },
          }) as never,
        loadMapper: async () => ({
          instances: buildMapperInstances({
            mappings: {
              "payments.yaml": [
                { dev: "payments-dev", test: "payments-test", prod: "payments-prod" },
              ],
            },
          }),
        }),
        getAwsClients: async () =>
          ({
            cloudFormation: {} as CloudFormationClient,
            profile: "t",
            region: "us-east-1",
            environment: "test",
          }),
        inspectStack: async (_client, stackName) => {
          if (stackName === "payments-test") {
            return {
              exists: true,
              templateBody: targetBody,
              templateHash: hashTemplate(targetBody),
              lastActivity: "2026-01-01T00:00:00.000Z",
            };
          }
          return {
            exists: true,
            templateHash: hashTemplate(targetBody),
            lastActivity: "2026-06-01T00:00:00.000Z",
          };
        },
        plans: new FilePlanRepository({ plansDirectory }),
        audit: new LocalFileAuditLogger({ auditLogPath }),
        createPlanId: () => "plan-update-1",
        now: () => new Date("2026-07-30T12:00:00.000Z"),
      },
    );

    expect(result.plan.planId).toBe("plan-update-1");
    expect(result.plan.status).toBe("pending");
    expect(result.plan.stackName).toBe("payments-test");
    expect(result.plan.targetCurrentTemplateHash).toBe(hashTemplate(targetBody));
    expect(result.plan.templateBody).toContain("SQS");
    expect(result.targetNewerWarning).toBe(false);
    expect(result.chatSummary).toContain("Plan created: plan-update-1");
    expect(result.chatSummary).toContain("update");

    const loaded = await new FilePlanRepository({ plansDirectory }).load("plan-update-1");
    expect(loaded.parameters).toEqual({ Env: "test" });
  });

  it("plans a create when the mapper has a stack name but AWS has no stack yet", async () => {
    const result = await planStackPromotion(
      {
        templateName: "payments.yaml",
        sourceEnv: "dev",
        targetEnv: "test",
        parameters: {},
      },
      {
        loadConfig: async () =>
          ({
            aws: { region: "us-east-1", profiles: { dev: "d", test: "t", prod: "p" } },
            resolvedPaths: { templatesLocalPath: templatesDir },
          }) as never,
        loadMapper: async () => ({
          instances: buildMapperInstances({
            mappings: {
              "payments.yaml": [
                { dev: "payments-dev", test: "payments-test", prod: "payments-prod" },
              ],
            },
          }),
        }),
        getAwsClients: async () =>
          ({
            cloudFormation: {} as CloudFormationClient,
            profile: "t",
            region: "us-east-1",
            environment: "test",
          }),
        inspectStack: async () => ({ exists: false, templateHash: ABSENT_TARGET_HASH }),
        plans: new FilePlanRepository({ plansDirectory }),
        audit: new LocalFileAuditLogger({ auditLogPath }),
        createPlanId: () => "plan-create-1",
        now: () => new Date("2026-07-30T12:00:00.000Z"),
      },
    );

    expect(result.plan.stackName).toBe("payments-test");
    expect(result.plan.targetCurrentTemplateHash).toBe(ABSENT_TARGET_HASH);
    expect(result.chatSummary).toContain("create");
  });

  it("refuses to plan when the mapper still says NOT_DEPLOYED", async () => {
    await expect(
      planStackPromotion(
        {
          templateName: "payments.yaml",
          sourceEnv: "dev",
          targetEnv: "test",
          parameters: {},
        },
        {
          loadConfig: async () =>
            ({
              aws: { region: "us-east-1", profiles: { dev: "d", test: "t", prod: "p" } },
              resolvedPaths: { templatesLocalPath: templatesDir },
            }) as never,
          loadMapper: async () => ({
            instances: buildMapperInstances({
              mappings: {
                "payments.yaml": [
                  { dev: "payments-dev", test: "NOT_DEPLOYED", prod: "EXCLUDED" },
                ],
              },
            }),
          }),
          plans: new FilePlanRepository({ plansDirectory }),
          audit: new LocalFileAuditLogger({ auditLogPath }),
        },
      ),
    ).rejects.toThrow(/Update mapper\.json/);
  });

  it("warns when the target stack timestamp is newer than the source", async () => {
    const body = '{"Resources":{}}\n';
    const result = await planStackPromotion(
      {
        templateName: "payments.yaml",
        sourceEnv: "dev",
        targetEnv: "test",
        parameters: {},
      },
      {
        loadConfig: async () =>
          ({
            aws: { region: "us-east-1", profiles: { dev: "d", test: "t", prod: "p" } },
            resolvedPaths: { templatesLocalPath: templatesDir },
          }) as never,
        loadMapper: async () => ({
          instances: buildMapperInstances({
            mappings: {
              "payments.yaml": [
                { dev: "payments-dev", test: "payments-test", prod: "payments-prod" },
              ],
            },
          }),
        }),
        getAwsClients: async () =>
          ({
            cloudFormation: {} as CloudFormationClient,
            profile: "t",
            region: "us-east-1",
            environment: "test",
          }),
        inspectStack: async (_client, stackName) => ({
          exists: true,
          templateBody: body,
          templateHash: hashTemplate(body),
          lastActivity:
            stackName === "payments-test"
              ? "2026-07-01T00:00:00.000Z"
              : "2026-01-01T00:00:00.000Z",
        }),
        plans: new FilePlanRepository({ plansDirectory }),
        audit: new LocalFileAuditLogger({ auditLogPath }),
        createPlanId: () => "plan-newer-1",
        now: () => new Date("2026-07-30T12:00:00.000Z"),
      },
    );

    expect(result.targetNewerWarning).toBe(true);
    expect(result.chatSummary).toContain("WARNING: Target stack appears newer");
  });
});
