import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const PluginManifestSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  version: z.string().optional(),
});

export interface ServerMetadata {
  name: string;
  title: string;
  description: string;
  version: string;
}

export function loadServerMetadata(): ServerMetadata {
  const manifest = readPluginManifest();
  const name = process.env.MCP_SERVER_NAME ?? manifest?.name ?? 'plugin-mcp';
  const title = process.env.MCP_SERVER_TITLE ?? toTitle(name);

  return {
    name,
    title,
    description:
      process.env.MCP_SERVER_DESCRIPTION ?? manifest?.description ?? title,
    version:
      process.env.MCP_SERVER_VERSION ??
      manifest?.version ??
      readPackageVersion(),
  };
}

function readPluginManifest(): z.infer<typeof PluginManifestSchema> | undefined {
  try {
    const raw = readFileSync(join(process.cwd(), '.claude-plugin', 'plugin.json'), 'utf8');
    return PluginManifestSchema.parse(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function readPackageVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function toTitle(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
