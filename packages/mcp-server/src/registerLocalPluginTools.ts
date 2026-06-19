import { log } from './log.js';
import type { McpServer } from './mcpEndpoint.js';

export type ToolRegistrar = (server: McpServer) => void | Promise<void>;

/** Define a plugin's explicit tool manifest as the MCP server registration function. */
export function definePluginTools(registrars: readonly ToolRegistrar[]): ToolRegistrar {
  return async (server) => {
    for (const register of registrars) {
      await register(server);
      log('debug', 'registered local plugin tool', {
        registrar: register.name || 'anonymous',
      });
    }
  };
}
