#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface WidgetEntry {
  name: string;
  path: string;
}

const cwd = process.cwd();
const mcpDir = findMcpDir(cwd);
const pluginDir = resolve(mcpDir, '..');
const featuresDir = resolve(pluginDir, 'features');
const args = process.argv.slice(2).join(' ');

const viteBin = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
);
const viteCommand = existsSync(viteBin) ? viteBin : 'vite';

for (const { name, path: widgetPath } of discoverWidgets(featuresDir)) {
  console.log(`Building widget: ${name}`);
  execSync(`${viteCommand} build ${args}`, {
    cwd: mcpDir,
    env: { ...process.env, WIDGET_PATH: widgetPath, WIDGET_NAME: name },
    stdio: 'inherit',
  });
}

function findMcpDir(start: string): string {
  if (existsSync(resolve(start, 'package.json'))) return start;
  const maybeParent = resolve(start, '..');
  if (existsSync(resolve(maybeParent, 'package.json'))) return maybeParent;
  return start;
}

function discoverWidgets(root: string): WidgetEntry[] {
  const widgets: WidgetEntry[] = [];
  try {
    for (const feature of readdirSync(root)) {
      const featureMcpDir = resolve(root, feature, 'mcp');
      if (!isDirectory(featureMcpDir)) continue;
      for (const entry of readdirSync(featureMcpDir)) {
        const widgetDir = resolve(featureMcpDir, entry);
        if (isDirectory(widgetDir) && existsSync(resolve(widgetDir, 'index.html'))) {
          widgets.push({ name: toKebabCase(entry), path: widgetDir });
        }
      }
    }
  } catch {
    // No features directory or no widgets.
  }
  return widgets;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function toKebabCase(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}
