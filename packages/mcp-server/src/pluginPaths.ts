import { join } from 'node:path';

export interface PluginPathOptions {
  /** Plugin root directory. Defaults to `process.cwd()`. */
  pluginDir?: string;
}

export function getWidgetHtmlPath(widgetName: string, options: PluginPathOptions = {}): string {
  return join(options.pluginDir ?? process.cwd(), 'mcp/dist/widgets', widgetName, 'index.html');
}
