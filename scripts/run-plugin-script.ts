import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

type Plugin = {
  name: string;
  packageName: string;
  scripts: Record<string, string>;
};

async function readPlugins(): Promise<Plugin[]> {
  const entries = await readdir('plugins', { withFileTypes: true });
  const plugins: Plugin[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageJsonPath = `plugins/${entry.name}/package.json`;

    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
        name?: unknown;
        scripts?: unknown;
      };

      if (typeof packageJson.name !== 'string') {
        continue;
      }

      plugins.push({
        name: entry.name,
        packageName: packageJson.name,
        scripts:
          packageJson.scripts && typeof packageJson.scripts === 'object'
            ? (packageJson.scripts as Record<string, string>)
            : {},
      });
    } catch {}
  }

  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

async function choosePlugin(plugins: Plugin[], command: string): Promise<Plugin> {
  if (plugins.length === 0) {
    throw new Error('No plugins found under plugins/.');
  }

  const runnablePlugins = plugins.filter((plugin) => command in plugin.scripts);

  if (runnablePlugins.length === 0) {
    throw new Error(`No plugins define a "${command}" script.`);
  }

  if (!input.isTTY) {
    if (runnablePlugins.length === 1) {
      return runnablePlugins[0];
    }

    throw new Error(
      `Choose a plugin by passing its name: ${runnablePlugins.map((plugin) => plugin.name).join(', ')}`,
    );
  }

  if (runnablePlugins.length === 1) {
    output.write(`Using plugin "${runnablePlugins[0].name}".\n`);
    return runnablePlugins[0];
  }

  output.write(`Choose a plugin for "${command}":\n`);
  runnablePlugins.forEach((plugin, index) => {
    output.write(`  ${index + 1}. ${plugin.name}\n`);
  });

  const rl = createInterface({ input, output });

  try {
    while (true) {
      const answer = (await rl.question(`Plugin [1-${runnablePlugins.length}]: `)).trim();
      const selectedIndex = Number(answer) - 1;

      if (Number.isInteger(selectedIndex) && runnablePlugins[selectedIndex]) {
        return runnablePlugins[selectedIndex];
      }

      const selectedByName = runnablePlugins.find((plugin) => plugin.name === answer);

      if (selectedByName) {
        return selectedByName;
      }

      output.write('Enter a plugin number or name.\n');
    }
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const [command, ...rawArgs] = process.argv.slice(2);

  if (!command) {
    throw new Error('Usage: tsx scripts/run-plugin-script.ts <script> [plugin] [...args]');
  }

  const requestedPlugin = rawArgs[0]?.startsWith('-') ? undefined : rawArgs.shift();
  const args = rawArgs;

  const plugins = await readPlugins();
  const plugin = requestedPlugin
    ? plugins.find((candidate) => candidate.name === requestedPlugin)
    : await choosePlugin(plugins, command);

  if (!plugin) {
    throw new Error(
      `Unknown plugin "${requestedPlugin}". Available plugins: ${plugins.map((candidate) => candidate.name).join(', ')}`,
    );
  }

  if (!(command in plugin.scripts)) {
    throw new Error(`Plugin "${plugin.name}" does not define a "${command}" script.`);
  }

  const child = spawn('pnpm', ['--filter', plugin.packageName, 'run', command, ...args], {
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    console.error(`Error: Failed to run pnpm: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
