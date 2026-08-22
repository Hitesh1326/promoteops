import { describe, expect, it, vi } from "vitest";
import { applyStackChangeSet, ChangeSetError } from "./applyStackChangeSet.js";
import type { CloudFormationClient } from "@aws-sdk/client-cloudformation";

function fakeClient(handler: (command: { constructor: { name: string } }) => unknown): CloudFormationClient {
  return {
    send: vi.fn(async (command: { constructor: { name: string } }) => handler(command)),
  } as unknown as CloudFormationClient;
}

describe("applyStackChangeSet", () => {
  it("creates and executes a change set without waiting when waitForCompletion is false", async () => {
    let describeCalls = 0;
    const client = fakeClient((command) => {
      switch (command.constructor.name) {
        case "CreateChangeSetCommand":
          return {};
        case "DescribeChangeSetCommand":
          describeCalls += 1;
          return { Status: describeCalls === 1 ? "CREATE_IN_PROGRESS" : "CREATE_COMPLETE" };
        case "ExecuteChangeSetCommand":
          return {};
        default:
          throw new Error(`unexpected ${command.constructor.name}`);
      }
    });

    const result = await applyStackChangeSet({
      client,
      stackName: "payments-test",
      templateBody: '{"Resources":{}}',
      parameters: { Env: "test" },
      changeSetKind: "UPDATE",
      changeSetName: "cs-1",
      sleep: async () => undefined,
      waitForCompletion: false,
    });

    expect(result).toEqual({
      changeSetName: "cs-1",
      changeSetKind: "UPDATE",
      stackName: "payments-test",
    });
    expect(describeCalls).toBe(2);
  });

  it("polls the stack until the change set finishes applying and reports success", async () => {
    let describeStacksCalls = 0;
    const client = fakeClient((command) => {
      switch (command.constructor.name) {
        case "CreateChangeSetCommand":
          return {};
        case "DescribeChangeSetCommand":
          return { Status: "CREATE_COMPLETE" };
        case "ExecuteChangeSetCommand":
          return {};
        case "DescribeStacksCommand":
          describeStacksCalls += 1;
          return {
            Stacks: [
              {
                StackStatus:
                  describeStacksCalls === 1 ? "UPDATE_IN_PROGRESS" : "UPDATE_COMPLETE",
              },
            ],
          };
        default:
          throw new Error(`unexpected ${command.constructor.name}`);
      }
    });

    const result = await applyStackChangeSet({
      client,
      stackName: "payments-test",
      templateBody: '{"Resources":{}}',
      parameters: { Env: "test" },
      changeSetKind: "UPDATE",
      changeSetName: "cs-1",
      sleep: async () => undefined,
    });

    expect(result).toEqual({
      changeSetName: "cs-1",
      changeSetKind: "UPDATE",
      stackName: "payments-test",
      finalStatus: "UPDATE_COMPLETE",
      succeeded: true,
      statusReason: undefined,
    });
    expect(describeStacksCalls).toBe(2);
  });

  it("reports failure when the stack rolls back", async () => {
    const client = fakeClient((command) => {
      switch (command.constructor.name) {
        case "CreateChangeSetCommand":
          return {};
        case "DescribeChangeSetCommand":
          return { Status: "CREATE_COMPLETE" };
        case "ExecuteChangeSetCommand":
          return {};
        case "DescribeStacksCommand":
          return {
            Stacks: [
              {
                StackStatus: "UPDATE_ROLLBACK_COMPLETE",
                StackStatusReason: "The following resource(s) failed to update",
              },
            ],
          };
        default:
          throw new Error(`unexpected ${command.constructor.name}`);
      }
    });

    const result = await applyStackChangeSet({
      client,
      stackName: "payments-test",
      templateBody: '{"Resources":{}}',
      parameters: { Env: "test" },
      changeSetKind: "UPDATE",
      changeSetName: "cs-1",
      sleep: async () => undefined,
    });

    expect(result.succeeded).toBe(false);
    expect(result.finalStatus).toBe("UPDATE_ROLLBACK_COMPLETE");
    expect(result.statusReason).toBe("The following resource(s) failed to update");
  });

  it("fails when the change set creation fails", async () => {
    const client = fakeClient((command) => {
      if (command.constructor.name === "CreateChangeSetCommand") {
        return {};
      }
      if (command.constructor.name === "DescribeChangeSetCommand") {
        return { Status: "FAILED", StatusReason: "No updates" };
      }
      throw new Error(`unexpected ${command.constructor.name}`);
    });

    await expect(
      applyStackChangeSet({
        client,
        stackName: "payments-test",
        templateBody: "{}",
        parameters: {},
        changeSetKind: "UPDATE",
        changeSetName: "cs-fail",
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(ChangeSetError);
  });
});
