// widgets provides shared helpers for loading widget HTML with the ext-apps bundle
// injected, enabling widgets to communicate with the MCP client without CDN fetches
// (which CSP blocks inside the iframe).

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { getWidgetHtmlPath, type PluginPathOptions } from './pluginPaths.js';

const require = createRequire(import.meta.url);

// The ext-apps bundle is static — compute once and cache.
let _bundle: string | null = null;

function extAppsBundle(): string {
  if (_bundle !== null) return _bundle;
  const raw = readFileSync(require.resolve('@modelcontextprotocol/ext-apps/app-with-deps'), 'utf8');
  // Convert the ESM `export { a as b, ... }` footer to `globalThis.ExtApps = { b: a, ... }`
  // so the bundle runs as a plain module script without any import map or bundler.
  // Use a replacer function to prevent `$&`, `$'`, etc. in the bundle being interpreted
  // as special String.replace() patterns.
  _bundle = raw.replace(/export\{([^}]+)\};?\s*$/, (_, body: string) => {
    const entries = body.split(',').map((p: string) => {
      const parts = p.split(' as ').map((s: string) => s.trim());
      const local = parts[0];
      const exported = parts[1] ?? parts[0];
      return `${exported}:${local}`;
    });
    return `globalThis.ExtApps={${entries.join(',')}};`;
  });
  return _bundle;
}

// injectExtApps injects the ext-apps bundle as the first <script> in <head> so
// globalThis.ExtApps is set before the Svelte module script executes.
// The HTML is read by the caller (per-request) so hot-reload dev rebuilds are
// reflected without a server restart.
function injectExtApps(html: string): string {
  const bundle = extAppsBundle();
  return html.replace('<head>', () => `<head><script type="module">${bundle}</script>`);
}

export function loadWidgetHtml(widgetName: string, options: PluginPathOptions = {}): string {
  return injectExtApps(readFileSync(getWidgetHtmlPath(widgetName, options), 'utf8'));
}
