import { log } from './log.js';
import type { McpServer } from './mcpEndpoint.js';

export type ToolRegistrar = (server: McpServer) => void | Promise<void>;

/** Compose multiple tool registrars into the shape expected by the MCP server. */
export function composeToolRegistrars(registrars: readonly ToolRegistrar[]): ToolRegistrar {
  return (server) => registerLocalPluginTools(server, registrars);
}

/** Define a plugin's explicit tool manifest as the MCP server registration function. */
export function definePluginTools(registrars: readonly ToolRegistrar[]): ToolRegistrar {
  return composeToolRegistrars(registrars);
}

/**
 * Register the explicitly listed plugin-local tools.
 *
 * This intentionally does not scan files or infer exports by name. Plugin code owns
 * a small manifest (`mcp/registerTools.ts`) that imports and lists the registrars,
 * making tool loading straightforward, typed, and reviewable.
 */
export async function registerLocalPluginTools(
  server: McpServer,
  registrars: readonly ToolRegistrar[],
): Promise<void> {
  for (const register of registrars) {
    await register(server);
    log('debug', 'registered local plugin tool', {
      registrar: register.name || 'anonymous',
    });
  }
}
