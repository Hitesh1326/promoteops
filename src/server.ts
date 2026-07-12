import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * M1 scaffold: MCP server boots on stdio with a ping tool.
 * Domain tools arrive in later milestones.
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
