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
const pluginDir = findPluginDir(cwd);
const mcpDir = resolve(pluginDir, 'mcp');
const skillsDir = resolve(pluginDir, 'skills');
const args = process.argv.slice(2).join(' ');

const viteBin = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
);
const viteCommand = existsSync(viteBin) ? viteBin : 'vite';

for (const { name, path: widgetPath } of discoverWidgets(skillsDir)) {
  console.log(`Building widget: ${name}`);
  execSync(`${viteCommand} build --config ${resolve(mcpDir, 'vite.config.ts')} ${args}`, {
    cwd: pluginDir,
    env: { ...process.env, WIDGET_PATH: widgetPath, WIDGET_NAME: name },
    stdio: 'inherit',
  });
}

function findPluginDir(start: string): string {
  if (existsSync(resolve(start, 'package.json')) && existsSync(resolve(start, 'mcp'))) return start;
  const maybeParent = resolve(start, '..');
  if (existsSync(resolve(maybeParent, 'package.json')) && existsSync(resolve(maybeParent, 'mcp'))) {
    return maybeParent;
  }
  return start;
}

function discoverWidgets(root: string): WidgetEntry[] {
  const widgets: WidgetEntry[] = [];
  try {
    for (const skill of readdirSync(root)) {
      const skillMcpDir = resolve(root, skill, 'mcp');
      if (!isDirectory(skillMcpDir)) continue;
      for (const entry of readdirSync(skillMcpDir)) {
        const widgetDir = resolve(skillMcpDir, entry);
        if (isDirectory(widgetDir) && existsSync(resolve(widgetDir, 'index.html'))) {
          widgets.push({ name: toKebabCase(entry), path: widgetDir });
        }
      }
    }
  } catch {
    // No skills directory or no widgets.
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
