import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export interface WidgetViteConfigOptions {
  /** Plugin root directory. Defaults to `process.cwd()`. */
  pluginDir?: string;
  /** Plugin MCP server directory. Defaults to `<pluginDir>/mcp-server`. */
  mcpServerDir?: string;
  /** Svelte config path. Defaults to `<mcpServerDir>/svelte.config.js`. */
  svelteConfigFile?: string;
}

/** Shared Vite config for single-file MCP widgets discovered by `variant-build-widgets`. */
export function defineWidgetViteConfig(options: WidgetViteConfigOptions = {}) {
  const pluginDir = options.pluginDir ?? process.cwd();
  const mcpServerDir = options.mcpServerDir ?? resolve(pluginDir, 'mcp-server');
  const widgetPath = process.env.WIDGET_PATH;
  const widgetName = process.env.WIDGET_NAME;
  if (!widgetPath || !widgetName) {
    throw new Error('WIDGET_PATH and WIDGET_NAME env vars are required');
  }

  const require = createRequire(resolve(pluginDir, 'package.json'));
  const svelteDir = dirname(require.resolve('svelte/package.json'));

  return defineConfig(({ mode }) => ({
    root: widgetPath,
    resolve: {
      alias: [
        { find: /^svelte$/, replacement: resolve(svelteDir, 'src/index-client.js') },
        {
          find: /^svelte\/internal\/client$/,
          replacement: resolve(svelteDir, 'src/internal/client/index.js'),
        },
        {
          find: /^svelte\/internal\/disclose-version$/,
          replacement: resolve(svelteDir, 'src/internal/disclose-version.js'),
        },
      ],
    },
    plugins: [
      svelte({ configFile: options.svelteConfigFile ?? resolve(mcpServerDir, 'svelte.config.js') }),
      viteSingleFile(),
    ],
    build: {
      rollupOptions: { input: 'index.html' },
      outDir: resolve(mcpServerDir, 'dist', 'widgets', widgetName),
      emptyOutDir: false,
      sourcemap: mode === 'development',
      minify: mode !== 'development',
    },
  }));
}
