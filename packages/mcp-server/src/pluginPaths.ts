import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface PluginPathOptions {
  /** Plugin root directory. Defaults to `process.cwd()`. */
  pluginDir?: string;
}

export function getPluginDir(options: PluginPathOptions = {}): string {
  return options.pluginDir ?? process.cwd();
}

export function getPluginMcpDir(options: PluginPathOptions = {}): string {
  return join(getPluginDir(options), 'mcp');
}

export function getWidgetHtmlPath(widgetName: string, options: PluginPathOptions = {}): string {
  return join(getPluginMcpDir(options), 'dist/widgets', widgetName, 'index.html');
}

export function hasWidgetHtml(widgetName: string, options: PluginPathOptions = {}): boolean {
  return existsSync(getWidgetHtmlPath(widgetName, options));
}
