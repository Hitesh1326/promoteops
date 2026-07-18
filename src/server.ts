import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { diffStack } from "./tools/diffStack/diffStack.js";
import { reportStacks } from "./tools/reportStacks/reportStacks.js";

/**
 * PromoteOps MCP server with health and fixture-first M4 report tools.
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
          text: "pong — PromoteOps MCP server is running (M1 scaffold).",
        },
      ],
    }),
  );

  server.registerTool(
    "report_stacks",
    {
      description:
        "Generate the read-only PromoteOps stack operations report. M4 uses deterministic fixture data and makes no AWS calls.",
      inputSchema: {
        outputPath: z.string().optional().describe(
          "Optional report output path. Defaults to tmp/report.html relative to the server working directory.",
        ),
      },
      annotations: {
        title: "Report CloudFormation stacks",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
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
        "Return a full fixture template diff oriented from target current (left) to source proposed (right).",
      inputSchema: {
        instanceId: z.string().min(1).describe("Mapper instance id, normally the Dev stack name."),
        fromEnv: z.enum(["dev", "test"]).describe("Lower source environment."),
        toEnv: z.enum(["test", "prod"]).describe("Higher target environment."),
      },
      annotations: {
        title: "Diff CloudFormation stack templates",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ instanceId, fromEnv, toEnv }) => {
      if (!(
        (fromEnv === "dev" && toEnv === "test") ||
        (fromEnv === "test" && toEnv === "prod")
      )) {
        throw new Error("Supported comparison pairs are dev → test and test → prod.");
      }
      return {
        content: [{
          type: "text" as const,
          text: diffStack({ instanceId, fromEnv, toEnv }),
        }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
