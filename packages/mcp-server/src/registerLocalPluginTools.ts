import { existsSync, readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { log } from './log.js';
import type { McpServer } from './mcpEndpoint.js';

export interface RegisterLocalPluginToolsOptions {
  /**
   * Root containing this plugin's conventional `tools/` and `skills/` directories.
   * Defaults to two directories above the caller's module URL, which works for:
   * - source: plugins/<plugin>/mcp/src/registerTools.ts -> plugins/<plugin>
   * - dist:   plugins/<plugin>/mcp/dist/mcp/src/registerTools.js -> plugins/<plugin>/mcp/dist
   * - docker: /app/mcp/src/registerTools.js -> /app
   */
  rootDir?: string;
}

type ToolModule = Record<string, unknown>;

const REGISTER_EXPORT_NAME = /^register[A-Z]/;

/**
 * Discover and register MCP tools from a plugin's conventional local folders.
 *
 * This keeps plugin code from importing files via fragile `../../skills/...` paths.
 * A module is considered a tool module when it exports one or more functions named
 * `registerSomething(server)`.
 */
export async function registerLocalPluginTools(
  server: McpServer,
  importMetaUrl: string,
  options: RegisterLocalPluginToolsOptions = {},
): Promise<void> {
  const entryFile = fileURLToPath(importMetaUrl);
  const entryDir = fileURLToPath(new URL('.', importMetaUrl));
  const rootDir = options.rootDir ?? join(entryDir, '../..');
  const extension = entryFile.endsWith('.ts') ? '.ts' : '.js';

  const files = [
    ...findToolFiles(join(rootDir, 'tools'), extension),
    ...findToolFiles(join(rootDir, 'skills'), extension, (file) =>
      relative(join(rootDir, 'skills'), file).split(sep).includes('mcp'),
    ),
  ].sort();

  for (const file of files) {
    const mod = (await import(pathToFileURL(file).href)) as ToolModule;
    const registerFunctions = Object.entries(mod).filter(
      ([name, value]) => REGISTER_EXPORT_NAME.test(name) && typeof value === 'function',
    );

    for (const [name, register] of registerFunctions) {
      await (register as (server: McpServer) => void | Promise<void>)(server);
      log('debug', 'registered local plugin tool module', {
        module: relative(rootDir, file),
        export: name,
      });
    }
  }
}

function findToolFiles(
  dir: string,
  extension: '.ts' | '.js',
  include: (file: string) => boolean = () => true,
): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findToolFiles(path, extension, include));
      continue;
    }

    if (entry.isFile() && isImportableToolFile(path, extension) && include(path)) {
      files.push(path);
    }
  }
  return files;
}

function isImportableToolFile(file: string, extension: '.ts' | '.js'): boolean {
  const name = basename(file);
  return (
    file.endsWith(extension) &&
    !name.endsWith('.d.ts') &&
    // Widget browser entrypoints live next to server tool files but must not be imported in Node.
    name !== `app${extension}`
  );
}
