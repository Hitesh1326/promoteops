import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { diffStack } from "./tools/diffStack/diffStack.js";
import { reportStacks } from "./tools/reportStacks/reportStacks.js";

/**
 * PromoteOps MCP server: live stack report/diff (M5) with optional fixture mode for UX.
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
        "Generate the read-only PromoteOps stack operations report from live AWS (default) or offline fixtures (source=fixture). Never writes to CloudFormation.",
      inputSchema: {
        outputPath: z.string().optional().describe(
          "Optional report output path. Defaults to paths.reportOutput from config.yaml for live, or tmp/report.html for fixture.",
        ),
        source: z.enum(["live", "fixture"]).optional().describe(
          "live (default) uses SSO profiles + mapper; fixture uses deterministic offline data for UX work.",
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
    async ({ outputPath, source }) => {
      const result = await reportStacks({ outputPath, source });
      return {
        content: [{ type: "text" as const, text: result.chatSummary }],
      };
    },
  );

  server.registerTool(
    "diff_stack",
    {
      description:
        "Return a full template diff oriented from target current (left) to source proposed (right). Uses the last live report when available, or fixtures when source=fixture.",
      inputSchema: {
        instanceId: z.string().min(1).describe("Mapper instance id, normally the Dev stack name."),
        fromEnv: z.enum(["dev", "test"]).describe("Lower source environment."),
        toEnv: z.enum(["test", "prod"]).describe("Higher target environment."),
        source: z.enum(["live", "fixture"]).optional().describe(
          "live (default) or fixture. Fixture needs no AWS.",
        ),
      },
      annotations: {
        title: "Diff CloudFormation stack templates",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ instanceId, fromEnv, toEnv, source }) => {
      if (!(
        (fromEnv === "dev" && toEnv === "test") ||
        (fromEnv === "test" && toEnv === "prod")
      )) {
        throw new Error("Supported comparison pairs are dev → test and test → prod.");
      }
      return {
        content: [{
          type: "text" as const,
          text: await diffStack({ instanceId, fromEnv, toEnv, source }),
        }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
