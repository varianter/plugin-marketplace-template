import { join } from 'node:path';

export interface PluginPathOptions {
  /** Plugin root directory. Defaults to `process.cwd()`. */
  pluginDir?: string;
  /** Plugin MCP server directory. Defaults to `<pluginDir>/mcp-server`. */
  mcpServerDir?: string;
}

export function getWidgetHtmlPath(widgetName: string, options: PluginPathOptions = {}): string {
  const pluginDir = options.pluginDir ?? process.cwd();
  const mcpServerDir = options.mcpServerDir ?? join(pluginDir, 'mcp-server');
  return join(mcpServerDir, 'dist/widgets', widgetName, 'index.html');
}
