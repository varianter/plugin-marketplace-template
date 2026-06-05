/**
 * Local development helper — loads secrets from Azure Key Vault and writes
 * missing entries into .env so subsequent `pnpm dev` runs have them available.
 *
 * Setup:
 *   1. Make sure KEYVAULT_URL is set in .env (or as a shell env var)
 *   2. Run `az login` (uses your personal account via DefaultAzureCredential)
 *   3. Edit the SECRETS mapping below to match your Key Vault
 *   4. Run: pnpm kv
 *
 * Existing .env values are never overwritten — only missing ones are added.
 * Run with --force to overwrite all entries from Key Vault.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

/**
 * Map of environment variable name → Key Vault secret name.
 * Edit this to match your vault's secrets.
 */
const SECRETS: Record<string, string> = {
  AUTH_CLIENT_ID: 'mcp-gateway-client-id',
  AZURE_TENANT_ID: 'mcp-gateway-tenant-id', // config derives AUTH_ISSUER_URL from this
  AUTH_CLIENT_SECRET: 'mcp-gateway-client-secret',
};

// ─── internals ───────────────────────────────────────────────────────────────

const ENV_FILE = resolve(import.meta.dirname, '.env');
const FORCE = process.argv.includes('--force');

async function main(): Promise<void> {
  if (Object.keys(SECRETS).length === 0) {
    console.log('No secrets configured. Edit the SECRETS map in keyvault.ts and re-run.');
    return;
  }

  const vaultUrl = readEnvVar('KEYVAULT_URL');
  if (!vaultUrl) {
    console.error('KEYVAULT_URL is not set in .env or shell environment.');
    process.exit(1);
  }

  const kv = new SecretClient(vaultUrl, new DefaultAzureCredential());
  const existing = parseEnvFile(ENV_FILE);
  const additions: string[] = [];
  let skipped = 0;

  for (const [envName, kvName] of Object.entries(SECRETS)) {
    if (!FORCE && existing.has(envName)) {
      skipped++;
      continue;
    }
    try {
      const secret = await kv.getSecret(kvName);
      if (!secret.value) throw new Error('empty value returned');
      existing.set(envName, secret.value);
      additions.push(envName);
      console.log(`  ✓ ${envName} ← ${kvName}`);
    } catch (err) {
      console.error(
        `  ✗ ${envName} ← ${kvName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (additions.length > 0) {
    writeEnvFile(ENV_FILE, existing);
    console.log(`\n${additions.length} secret(s) written to .env`);
  } else {
    console.log(
      skipped > 0
        ? `\nAll secrets already set (run with --force to overwrite).`
        : '\nNo secrets written.',
    );
  }
}

/** Read a key from the already-parsed .env or fall back to the shell environment. */
function readEnvVar(name: string): string | undefined {
  const envFile = existsSync(ENV_FILE) ? parseEnvFile(ENV_FILE) : new Map<string, string>();
  return envFile.get(name) ?? process.env[name];
}

/** Parse a .env file into an ordered map, preserving insertion order. */
function parseEnvFile(path: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(path)) return map;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) map.set(match[1], match[2]);
  }
  return map;
}

/** Write the map back to a .env file, preserving comments and blank lines from the original. */
function writeEnvFile(path: string, values: Map<string, string>): void {
  const originalLines = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : [];
  const written = new Set<string>();

  const updatedLines = originalLines.map((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) return line;
    const [, key] = match;
    written.add(key);
    return values.has(key) ? `${key}=${values.get(key)}` : line;
  });

  for (const [key, value] of values) {
    if (!written.has(key)) updatedLines.push(`${key}=${value}`);
  }

  writeFileSync(path, updatedLines.join('\n'), 'utf8');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
