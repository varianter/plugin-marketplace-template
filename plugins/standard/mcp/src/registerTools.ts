import type { McpServer } from '@variant/mcp-server';
import { registerWhoami } from '../../tools/whoami/whoami.js';

export function registerTools(server: McpServer): void {
  registerWhoami(server);
  // Register skill-colocated MCP tools here.
  // Example:
  //   import { registerMyTool } from '../../skills/my-skill/mcp/myTool.js';
  //   registerMyTool(server);
}
