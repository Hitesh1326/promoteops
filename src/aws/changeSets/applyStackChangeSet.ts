/**
 * Create and execute a CloudFormation change set for one stack promotion.
 */
import {
  Capability,
  CreateChangeSetCommand,
  DescribeChangeSetCommand,
  DescribeStacksCommand,
  ExecuteChangeSetCommand,
  type CloudFormationClient,
  type Parameter,
} from "@aws-sdk/client-cloudformation";

export class ChangeSetError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ChangeSetError";
  }
}

export type ChangeSetKind = "CREATE" | "UPDATE";

export interface ApplyStackChangeSetInput {
  client: CloudFormationClient;
  stackName: string;
  templateBody: string;
  parameters: Record<string, string>;
  changeSetKind: ChangeSetKind;
  changeSetName?: string;
  /** Test hook: override sleep between polls. */
  sleep?: (ms: number) => Promise<void>;
  /** Max wait for change set creation (ms). */
  createTimeoutMs?: number;
  /** Poll the stack until the change set finishes applying. Defaults to true. */
  waitForCompletion?: boolean;
  /** Max wait for the change set to finish applying (ms). */
  executeTimeoutMs?: number;
}

export interface ApplyStackChangeSetResult {
  changeSetName: string;
  changeSetKind: ChangeSetKind;
  stackName: string;
  /** Only set when waitForCompletion was true. */
  finalStatus?: string;
  /** Only set when waitForCompletion was true. */
  succeeded?: boolean;
  /** Only set when waitForCompletion was true and the stack ended in a non-success status. */
  statusReason?: string;
}

const DEFAULT_CAPABILITIES = [
  Capability.CAPABILITY_IAM,
  Capability.CAPABILITY_NAMED_IAM,
  Capability.CAPABILITY_AUTO_EXPAND,
];

const SUCCESS_STACK_STATUSES = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE"]);

export async function applyStackChangeSet(
  input: ApplyStackChangeSetInput,
): Promise<ApplyStackChangeSetResult> {
  const changeSetName =
    input.changeSetName ??
    `promoteops-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const sleep = input.sleep ?? defaultSleep;
  const createTimeoutMs = input.createTimeoutMs ?? 120_000;

  try {
    await input.client.send(
      new CreateChangeSetCommand({
        StackName: input.stackName,
        ChangeSetName: changeSetName,
        ChangeSetType: input.changeSetKind,
        TemplateBody: input.templateBody,
        Parameters: toCfnParameters(input.parameters),
        Capabilities: DEFAULT_CAPABILITIES,
      }),
    );
  } catch (error) {
    throw new ChangeSetError(
      `Failed to create change set "${changeSetName}" for stack "${input.stackName}": ${formatError(error)}`,
      { cause: error },
    );
  }

  await waitForChangeSetCreate(input.client, input.stackName, changeSetName, sleep, createTimeoutMs);

  try {
    await input.client.send(
      new ExecuteChangeSetCommand({
        StackName: input.stackName,
        ChangeSetName: changeSetName,
      }),
    );
  } catch (error) {
    throw new ChangeSetError(
      `Failed to execute change set "${changeSetName}" for stack "${input.stackName}": ${formatError(error)}`,
      { cause: error },
    );
  }

  if (input.waitForCompletion === false) {
    return {
      changeSetName,
      changeSetKind: input.changeSetKind,
      stackName: input.stackName,
    };
  }

  const outcome = await waitForStackExecute(
    input.client,
    input.stackName,
    sleep,
    input.executeTimeoutMs ?? 600_000,
  );

  return {
    changeSetName,
    changeSetKind: input.changeSetKind,
    stackName: input.stackName,
    finalStatus: outcome.status,
    succeeded: outcome.succeeded,
    statusReason: outcome.statusReason,
  };
}

interface StackExecuteOutcome {
  status: string;
  succeeded: boolean;
  statusReason?: string;
}

export async function waitForStackExecute(
  client: CloudFormationClient,
  stackName: string,
  sleep: (ms: number) => Promise<void>,
  timeoutMs: number,
): Promise<StackExecuteOutcome> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    let status: string | undefined;
    let statusReason: string | undefined;
    try {
      const described = await client.send(new DescribeStacksCommand({ StackName: stackName }));
      status = described.Stacks?.[0]?.StackStatus;
      statusReason = described.Stacks?.[0]?.StackStatusReason;
    } catch (error) {
      throw new ChangeSetError(
        `Unable to describe stack "${stackName}" while waiting for the change set to apply: ${formatError(error)}`,
        { cause: error },
      );
    }

    if (status && !status.endsWith("_IN_PROGRESS")) {
      return {
        status,
        succeeded: SUCCESS_STACK_STATUSES.has(status),
        statusReason,
      };
    }

    await sleep(2_000);
  }

  throw new ChangeSetError(
    `Timed out waiting for stack "${stackName}" to finish applying the change set.`,
  );
}

export async function waitForChangeSetCreate(
  client: CloudFormationClient,
  stackName: string,
  changeSetName: string,
  sleep: (ms: number) => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    let status: string | undefined;
    let statusReason: string | undefined;
    try {
      const described = await client.send(
        new DescribeChangeSetCommand({ StackName: stackName, ChangeSetName: changeSetName }),
      );
      status = described.Status;
      statusReason = described.StatusReason;
    } catch (error) {
      throw new ChangeSetError(
        `Unable to describe change set "${changeSetName}" for stack "${stackName}": ${formatError(error)}`,
        { cause: error },
      );
    }

    if (status === "CREATE_COMPLETE") {
      return;
    }
    if (status === "FAILED" || status === "DELETE_COMPLETE" || status === "DELETE_FAILED") {
      throw new ChangeSetError(
        `Change set "${changeSetName}" for stack "${stackName}" ended with ${status}` +
          (statusReason ? `: ${statusReason}` : ""),
      );
    }

    await sleep(2_000);
  }

  throw new ChangeSetError(
    `Timed out waiting for change set "${changeSetName}" on stack "${stackName}" to become CREATE_COMPLETE.`,
  );
}

/** Optional post-execute peek used by tests / callers that want current stack status. */
export async function describeStackStatus(
  client: CloudFormationClient,
  stackName: string,
): Promise<string | undefined> {
  const described = await client.send(new DescribeStacksCommand({ StackName: stackName }));
  return described.Stacks?.[0]?.StackStatus;
}

function toCfnParameters(parameters: Record<string, string>): Parameter[] {
  return Object.entries(parameters).map(([ParameterKey, ParameterValue]) => ({
    ParameterKey,
    ParameterValue,
  }));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
