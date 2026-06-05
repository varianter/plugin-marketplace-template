import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWhoami } from '../../tools/whoami/whoami.js';

export function registerFeatureTools(server: McpServer): void {
  registerWhoami(server);
  // Register feature-coupled MCP tools here.
  // Example:
  //   import { registerMyTool } from '../../features/my-feature/mcp/myTool.js';
  //   registerMyTool(server);
}
