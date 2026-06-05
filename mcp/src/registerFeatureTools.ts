import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SecretsLoader } from './secrets/secrets.js';

export function registerFeatureTools(_server: McpServer, _loader: SecretsLoader): void {
  // Register feature-coupled MCP tools here.
  // Example:
  //   import { registerMyTool } from '../../features/my-feature/mcp/myTool.js';
  //   registerMyTool(server, loader);
}
