import type { McpServer } from '@variant/mcp-server';
import { registerWhoami } from '../../tools/whoami/whoami.js';

export function registerTools(server: McpServer): void {
  registerWhoami(server);
  // Register feature-coupled MCP tools here.
  // Example:
  //   import { registerMyTool } from '../../features/my-feature/mcp/myTool.js';
  //   registerMyTool(server);
}
