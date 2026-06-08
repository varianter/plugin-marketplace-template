import type { McpServer } from '@variant/mcp-server';
import { registerLocalPluginTools } from '@variant/mcp-server';

export function registerTools(server: McpServer): Promise<void> {
  return registerLocalPluginTools(server, import.meta.url);
}
