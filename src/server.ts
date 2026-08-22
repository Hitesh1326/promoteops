import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { diffStack } from "./tools/diffStack/diffStack.js";
import { executeStackPromotion } from "./tools/executeStackPromotion/executeStackPromotion.js";
import { planStackPromotion } from "./tools/planStackPromotion/planStackPromotion.js";
import { reportStacks } from "./tools/reportStacks/reportStacks.js";

/**
 * PromoteOps MCP server: report/diff (read-only) plus plan-then-execute stack promotions.
 */
export async function startServer(): Promise<void> {
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
      const result = await reportStacks({ outputPath });
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
          text: await diffStack({ templateName, stackName, fromEnv, toEnv }),
        }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
