import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mcpDir = resolve(__dirname, '..');
const pluginDir = resolve(mcpDir, '..');
const featuresDir = resolve(pluginDir, 'features');

const args = process.argv.slice(2).join(' ');

function toKebabCase(str) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

// Discover all features/*/mcp/*/ directories that contain an index.html
const widgets = [];
try {
  for (const feature of readdirSync(featuresDir)) {
    const featureMcpDir = resolve(featuresDir, feature, 'mcp');
    try {
      if (!statSync(featureMcpDir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const entry of readdirSync(featureMcpDir)) {
      const widgetDir = resolve(featureMcpDir, entry);
      try {
        if (statSync(widgetDir).isDirectory() && existsSync(resolve(widgetDir, 'index.html'))) {
          widgets.push({ name: toKebabCase(entry), path: widgetDir });
        }
      } catch {
        // not a directory or no index.html
      }
    }
  }
} catch {
  // features directory doesn't exist or is empty — no widgets to build
}

for (const { name, path: widgetPath } of widgets) {
  console.log(`Building widget: ${name}`);
  execSync(
    `${resolve(mcpDir, 'node_modules', '.bin', 'vite')} build ${args}`,
    {
      cwd: mcpDir,
      env: { ...process.env, WIDGET_PATH: widgetPath, WIDGET_NAME: name },
      stdio: 'inherit',
    },
  );
}
