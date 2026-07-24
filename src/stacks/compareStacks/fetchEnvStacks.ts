/**
 * Read-only CloudFormation inventory for one environment: list live stacks,
 * then fetch each template body. Never creates change sets or updates stacks.
 */
import {
  GetTemplateCommand,
  ListStacksCommand,
  StackStatus,
  type CloudFormationClient,
  type StackSummary,
} from "@aws-sdk/client-cloudformation";

import type { EnvironmentName } from "../../shared/environment.js";
import type { CollectionWarning } from "../stackComparison/stackComparison.js";

const LIVE_STACK_STATUSES: StackStatus[] = [
  StackStatus.CREATE_COMPLETE,
  StackStatus.UPDATE_COMPLETE,
  StackStatus.UPDATE_ROLLBACK_COMPLETE,
  StackStatus.IMPORT_COMPLETE,
  StackStatus.IMPORT_ROLLBACK_COMPLETE,
];

export interface RawStack {
  environment: EnvironmentName;
  stackName: string;
  stackStatus: string;
  creationTime?: Date;
  lastUpdatedTime?: Date;
  templateBody: string;
}

export interface FetchEnvStacksResult {
  stacks: RawStack[];
  warnings: CollectionWarning[];
}

export async function fetchEnvStacks(
  client: CloudFormationClient,
  environment: EnvironmentName,
): Promise<FetchEnvStacksResult> {
  const summaries = await listLiveStackSummaries(client);
  const stacks: RawStack[] = [];
  const warnings: CollectionWarning[] = [];

  await Promise.all(
    summaries.map(async (summary) => {
      const stackName = summary.StackName;
      if (!stackName) return;

      try {
        const template = await client.send(new GetTemplateCommand({ StackName: stackName }));
        if (!template.TemplateBody) {
          warnings.push({
            environment,
            message: `Stack "${stackName}" returned an empty template body.`,
          });
          return;
        }

        stacks.push({
          environment,
          stackName,
          stackStatus: summary.StackStatus ?? "UNKNOWN",
          creationTime: summary.CreationTime,
          lastUpdatedTime: summary.LastUpdatedTime,
          templateBody: template.TemplateBody,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        warnings.push({
          environment,
          message: `Could not load stack "${stackName}": ${detail}`,
        });
      }
    }),
  );

  stacks.sort((left, right) => left.stackName.localeCompare(right.stackName));
  return { stacks, warnings };
}

async function listLiveStackSummaries(client: CloudFormationClient): Promise<StackSummary[]> {
  const collected: StackSummary[] = [];
  let nextToken: string | undefined;

  do {
    const page = await client.send(
      new ListStacksCommand({
        StackStatusFilter: LIVE_STACK_STATUSES,
        NextToken: nextToken,
      }),
    );
    collected.push(...(page.StackSummaries ?? []));
    nextToken = page.NextToken;
  } while (nextToken);

  return collected;
}
