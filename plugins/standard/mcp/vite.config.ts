import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const __dirname = dirname(fileURLToPath(import.meta.url));

// WIDGET_PATH: absolute path to the widget directory (set by build-widgets.mjs)
// WIDGET_NAME: output subdirectory name under dist/widgets/
const widgetPath = process.env.WIDGET_PATH;
const widgetName = process.env.WIDGET_NAME;
if (!widgetPath || !widgetName)
  throw new Error('WIDGET_PATH and WIDGET_NAME env vars are required');

export default defineConfig(({ mode }) => ({
  root: widgetPath,
  plugins: [svelte({ configFile: resolve(__dirname, 'svelte.config.js') }), viteSingleFile()],
  build: {
    rollupOptions: { input: 'index.html' },
    outDir: resolve(__dirname, 'dist', 'widgets', widgetName),
    emptyOutDir: false,
    sourcemap: mode === 'development',
    minify: mode !== 'development',
  },
}));
