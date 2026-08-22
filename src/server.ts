import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { diffStack } from "./tools/diffStack/diffStack.js";
import { executeStackPromotion } from "./tools/executeStackPromotion/executeStackPromotion.js";
import { planStackPromotion } from "./tools/planStackPromotion/planStackPromotion.js";
import { reportStacks } from "./tools/reportStacks/reportStacks.js";

export interface StartServerOptions {
  /** Folder that holds config.yaml and mapper.json, from --root. */
  projectRoot?: string;
}

/**
 * PromoteOps MCP server: report/diff (read-only) plus plan-then-execute stack promotions.
 */
export async function startServer(options: StartServerOptions = {}): Promise<void> {
  const projectRoot = options.projectRoot;
  const server = new McpServer({
    name: "promoteops",
    version: "0.1.0",
  });

  server.registerTool(
    "ping",
    {
      description: "Health check for the PromoteOps MCP server scaffold.",
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: "pong — PromoteOps MCP server is running.",
        },
      ],
    }),
  );

  server.registerTool(
    "report_stacks",
    {
      description:
        "Generate the read-only PromoteOps stack operations report from live AWS. Never writes to CloudFormation.",
      inputSchema: {
        outputPath: z.string().optional().describe(
          "Optional report output path. Defaults to paths.reportOutput from config.yaml.",
        ),
      },
      annotations: {
        title: "Report CloudFormation stacks",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ outputPath }) => {
      const result = await reportStacks({ outputPath, projectRoot });
      return {
        content: [{ type: "text" as const, text: result.chatSummary }],
      };
    },
  );

  server.registerTool(
    "diff_stack",
    {
      description:
        "Return a full template diff for a mapped template (target current on the left, source proposed on the right). Prefer templateName; pass stackName only if the template has multiple instances.",
      inputSchema: {
        templateName: z.string().min(1).describe(
          "Mapper template name, e.g. ecs-infrastructure or payments.yaml.",
        ),
        stackName: z.string().min(1).optional().describe(
          "Optional stack name from any env on the row (or instance id) when the template maps to more than one instance.",
        ),
        fromEnv: z.enum(["dev", "test"]).describe("Lower source environment."),
        toEnv: z.enum(["test", "prod"]).describe("Higher target environment."),
      },
      annotations: {
        title: "Diff CloudFormation stack templates",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ templateName, stackName, fromEnv, toEnv }) => {
      if (!(
        (fromEnv === "dev" && toEnv === "test") ||
        (fromEnv === "test" && toEnv === "prod")
      )) {
        throw new Error("Supported comparison pairs are dev → test and test → prod.");
      }
      return {
        content: [{
          type: "text" as const,
          text: await diffStack({ templateName, stackName, fromEnv, toEnv, projectRoot }),
        }],
      };
    },
  );

  server.registerTool(
    "plan_stack_promotion",
    {
      description:
        "Create a read-only promotion plan for one mapped stack (local template + explicit parameters). Does not write to CloudFormation. Returns a planId for execute_stack_promotion, which must be explicitly confirmed by the user before use.",
      inputSchema: {
        templateName: z.string().min(1).describe(
          "Mapper template name, e.g. payments.yaml.",
        ),
        stackName: z.string().min(1).optional().describe(
          "Optional stack/instance name when the template maps to more than one instance.",
        ),
        sourceEnv: z.enum(["dev", "test"]).describe("Lower source environment."),
        targetEnv: z.enum(["test", "prod"]).describe("Higher target environment."),
        parameters: z
          .record(z.string(), z.string())
          .describe("Explicit CloudFormation parameter key/value pairs (no UsePreviousValue)."),
      },
      annotations: {
        title: "Plan CloudFormation stack promotion",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ templateName, stackName, sourceEnv, targetEnv, parameters }) => {
      if (!(
        (sourceEnv === "dev" && targetEnv === "test") ||
        (sourceEnv === "test" && targetEnv === "prod")
      )) {
        throw new Error("Supported promotion pairs are dev → test and test → prod.");
      }
      const result = await planStackPromotion({
        templateName,
        stackName,
        sourceEnv,
        targetEnv,
        parameters,
        projectRoot,
      });
      return {
        content: [{ type: "text" as const, text: result.chatSummary }],
      };
    },
  );

  server.registerTool(
    "execute_stack_promotion",
    {
      description:
        "Execute a previously created stack promotion plan by planId. Mutates AWS (creates and executes a CloudFormation change set), polls until CloudFormation finishes applying it, and reports whether it succeeded or rolled back. Only call with a planId explicitly confirmed by the user in this conversation — never infer or reuse one. Rejects stale or already-executed plans.",
      inputSchema: {
        planId: z.string().min(1).describe(
          "planId returned by plan_stack_promotion, explicitly confirmed by the user.",
        ),
      },
      annotations: {
        title: "Execute CloudFormation stack promotion",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ planId }) => {
      const result = await executeStackPromotion(
        { planId, projectRoot },
        {
          confirm: async () => ({ action: "accept" }),
        },
      );
      return {
        content: [{ type: "text" as const, text: result.chatSummary }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
