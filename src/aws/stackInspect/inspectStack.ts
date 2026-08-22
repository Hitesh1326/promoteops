/**
 * Read-only CloudFormation helpers used when planning and validating promotions.
 */
import {
  DescribeStacksCommand,
  GetTemplateCommand,
  type CloudFormationClient,
} from "@aws-sdk/client-cloudformation";
import { hashTemplate } from "../../stacks/compareStacks/normalizeTemplate.js";

/** Sentinel stored on create plans when the target stack does not exist yet. */
export const ABSENT_TARGET_HASH = "__absent__";

export class StackInspectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StackInspectionError";
  }
}

export interface StackSnapshot {
  exists: boolean;
  templateBody?: string;
  templateHash: string;
  lastActivity?: string;
}

export async function inspectStack(
  client: CloudFormationClient,
  stackName: string,
): Promise<StackSnapshot> {
  try {
    const described = await client.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = described.Stacks?.[0];
    if (!stack) {
      return { exists: false, templateHash: ABSENT_TARGET_HASH };
    }

    const template = await client.send(new GetTemplateCommand({ StackName: stackName }));
    if (!template.TemplateBody) {
      throw new StackInspectionError(`Stack "${stackName}" returned an empty template body.`);
    }

    const lastActivity = (stack.LastUpdatedTime ?? stack.CreationTime)?.toISOString();
    return {
      exists: true,
      templateBody: template.TemplateBody,
      templateHash: hashTemplate(template.TemplateBody),
      lastActivity,
    };
  } catch (error) {
    if (isStackDoesNotExist(error)) {
      return { exists: false, templateHash: ABSENT_TARGET_HASH };
    }
    if (error instanceof StackInspectionError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new StackInspectionError(`Unable to inspect stack "${stackName}": ${detail}`, {
      cause: error,
    });
  }
}

function isStackDoesNotExist(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const withName = error as { name?: string; message?: string };
  if (withName.name === "ValidationError" && withName.message?.includes("does not exist")) {
    return true;
  }
  return typeof withName.message === "string" && /does not exist/i.test(withName.message);
}
