// Config holds runtime configuration loaded from environment variables plus optional
// committed plugin.config.json defaults. Environment variables always win.
// Prefer the AUTH_* names for OAuth. AZURE_* names are kept as backwards-compatible
// aliases for existing Entra deployments.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import type { AuthProviderKind } from '../auth/adapters.js';

export interface Config {
  host: string;
  port: number;
  mcpPath: string;
  publicUrl: string;
  allowedRedirectOrigins: string[];
  mcpMaxSessions: number;
  rateLimitPerMinute: number;
  trustProxy: string | number | boolean;
  auth: {
    enabled: boolean;
    provider: AuthProviderKind;
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    audience: string;
    /** Additional JWT audiences to accept, beyond provider defaults. */
    acceptedAudiences: string[];
    /** Additional JWT issuers to accept, beyond provider defaults. */
    acceptedIssuers: string[];
    scopes: string[];
    /** Extra scope names to rewrite to `{clientId}/.default` (Entra compatibility proxy only). */
    scopeAliases: string[];
    compatibilityProxy: boolean;
    /** `static` exposes local /register returning AUTH_CLIENT_ID for Claude/MCP clients. */
    clientRegistration: 'none' | 'provider' | 'static';
  };
}

export type ConfigOverrides = Partial<Omit<Config, 'auth'>> & {
  auth?: Partial<Config['auth']>;
};

interface PluginConfigFile {
  mcpPath?: string;
  auth?: {
    enabled?: boolean;
    provider?: string;
    tenantId?: string;
    issuerUrl?: string;
    clientId?: string;
    audience?: string;
    acceptedAudiences?: string[];
    acceptedIssuers?: string[];
    scopes?: string[];
    scopeAliases?: string[];
    compatibilityProxy?: boolean;
    clientRegistration?: 'none' | 'provider' | 'static';
    allowedRedirectOrigins?: string[];
  };
  limits?: {
    maxSessions?: number;
    rateLimitPerMinute?: number;
  };
}

export function loadConfig(overrides: ConfigOverrides = {}): Config {
  const fileConfig = loadPluginConfigFile();

  const host = process.env.HOST ?? '0.0.0.0';
  const port = parsePort(process.env.PORT);
  const mcpPath = parseMcpPath(process.env.MCP_PATH ?? fileConfig.mcpPath ?? '/mcp');

  const provider = parseProvider(
    process.env.AUTH_PROVIDER ?? process.env.OAUTH_PROVIDER ?? fileConfig.auth?.provider ?? 'entra',
  );
  const clientId =
    process.env.AUTH_CLIENT_ID ??
    process.env.OAUTH_CLIENT_ID ??
    process.env.AZURE_CLIENT_ID ??
    fileConfig.auth?.clientId ??
    '';
  const tenantId =
    process.env.AUTH_TENANT_ID ?? process.env.AZURE_TENANT_ID ?? fileConfig.auth?.tenantId;
  const issuerUrl =
    process.env.AUTH_ISSUER_URL ??
    process.env.OAUTH_ISSUER_URL ??
    fileConfig.auth?.issuerUrl ??
    (tenantId ? `https://login.microsoftonline.com/${tenantId}/v2.0` : '');
  const clientSecret =
    process.env.AUTH_CLIENT_SECRET ??
    process.env.OAUTH_CLIENT_SECRET ??
    process.env.AZURE_CLIENT_SECRET ??
    '';
  const scopes = parseScopes(
    process.env.AUTH_SCOPES ??
      process.env.OAUTH_SCOPES ??
      fileConfig.auth?.scopes?.join(' ') ??
      defaultScopes(clientId, provider),
  );

  const scopeAliases = parseCsvOrArray(
    process.env.AUTH_SCOPE_ALIASES,
    fileConfig.auth?.scopeAliases,
  );
  const compatibilityProxy = parseAuthCompatibilityProxy(
    process.env.AUTH_COMPATIBILITY_PROXY,
    provider,
    fileConfig.auth?.compatibilityProxy,
  );
  const authEnabled = parseAuthEnabled(
    process.env.AUTH_ENABLED,
    issuerUrl,
    clientId,
    fileConfig.auth?.enabled,
  );

  const defaultPublicHost = host === '0.0.0.0' ? 'localhost' : host;

  const allowedRedirectOrigins = parseCsvOrArray(
    process.env.AUTH_ALLOWED_REDIRECT_ORIGINS,
    fileConfig.auth?.allowedRedirectOrigins ?? [
      'http://localhost',
      'http://127.0.0.1',
      'https://claude.ai',
    ],
  );

  const config: Config = {
    host,
    port,
    mcpPath,
    publicUrl: parseUrl(
      process.env.PUBLIC_URL ??
        process.env.AUTH_PUBLIC_URL ??
        process.env.AZURE_PUBLIC_URL ??
        `http://${defaultPublicHost}:${port}`,
      'PUBLIC_URL',
    ),
    allowedRedirectOrigins,
    mcpMaxSessions: parsePositiveInt(
      process.env.MCP_MAX_SESSIONS,
      fileConfig.limits?.maxSessions ?? 200,
      'MCP_MAX_SESSIONS',
    ),
    rateLimitPerMinute: parsePositiveInt(
      process.env.RATE_LIMIT_REQUESTS_PER_MINUTE,
      fileConfig.limits?.rateLimitPerMinute ?? 60,
      'RATE_LIMIT_REQUESTS_PER_MINUTE',
    ),
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    auth: {
      enabled: authEnabled,
      provider,
      issuerUrl,
      clientId,
      clientSecret,
      audience:
        process.env.AUTH_AUDIENCE ?? process.env.OAUTH_AUDIENCE ?? fileConfig.auth?.audience ?? '',
      acceptedAudiences: parseCsvOrArray(
        process.env.AUTH_ACCEPTED_AUDIENCES,
        fileConfig.auth?.acceptedAudiences,
      ),
      acceptedIssuers: parseCsvOrArray(
        process.env.AUTH_ACCEPTED_ISSUERS,
        fileConfig.auth?.acceptedIssuers,
      ),
      scopes,
      scopeAliases,
      compatibilityProxy,
      clientRegistration: parseClientRegistration(
        process.env.AUTH_CLIENT_REGISTRATION,
        compatibilityProxy,
        fileConfig.auth?.clientRegistration,
      ),
    },
  };

  const merged = { ...config, ...overrides, auth: { ...config.auth, ...overrides.auth } };
  if (overrides.auth?.enabled === undefined && !merged.auth.enabled && hasAuthCredentials(merged)) {
    merged.auth.enabled = true;
  }
  validateConfig(merged);
  return merged;
}

function loadPluginConfigFile(): PluginConfigFile {
  const configDir = findConfigDir();
  if (!configDir) return {};

  const base = readPluginConfigFile(join(configDir, 'plugin.config.json'));
  const local = readPluginConfigFile(join(configDir, 'plugin.config.local.json'));
  return mergePluginConfig(base, local);
}

function findConfigDir(): string | undefined {
  const starts = [...new Set([process.env.INIT_CWD, process.cwd()].filter(Boolean) as string[])];
  for (const start of starts) {
    let dir = start;
    const root = parse(dir).root;
    while (true) {
      if (
        existsSync(join(dir, 'plugin.config.json')) ||
        existsSync(join(dir, 'plugin.config.local.json'))
      ) {
        return dir;
      }
      if (dir === root) break;
      dir = dirname(dir);
    }
  }
  return undefined;
}

function readPluginConfigFile(path: string): PluginConfigFile {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PluginConfigFile;
  } catch (err) {
    throw new Error(`invalid ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function mergePluginConfig(base: PluginConfigFile, local: PluginConfigFile): PluginConfigFile {
  return {
    ...base,
    ...local,
    auth: { ...base.auth, ...local.auth },
    limits: { ...base.limits, ...local.limits },
  };
}

function parsePort(rawPort: string | undefined): number {
  if (!rawPort) return 8080;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid PORT "${rawPort}": must be an integer between 1 and 65535`);
  }
  return port;
}

function parseMcpPath(raw: string): string {
  if (!raw.startsWith('/')) throw new Error(`invalid MCP_PATH "${raw}": must start with /`);
  return raw;
}

function parseUrl(raw: string, name: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`invalid ${name} "${raw}": must be an absolute http(s) URL`);
  }
}

function parsePositiveInt(raw: string | undefined, defaultValue: number, name: string): number {
  if (!raw) return defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`invalid ${name} "${raw}": must be a positive integer`);
  }
  return n;
}

function parseTrustProxy(raw: string | undefined): string | number | boolean {
  if (!raw) return 1;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n) && String(n) === raw) return n;
  return raw;
}

function parseProvider(raw: string): AuthProviderKind {
  const normalized = raw === 'generic' ? 'generic-oidc' : raw;
  if (
    normalized === 'generic-oidc' ||
    normalized === 'oidc' ||
    normalized === 'entra' ||
    normalized === 'auth0' ||
    normalized === 'okta' ||
    normalized === 'keycloak' ||
    normalized === 'cognito' ||
    normalized === 'zitadel'
  )
    return normalized;
  throw new Error(
    `invalid AUTH_PROVIDER "${raw}": expected generic-oidc, oidc, entra, auth0, okta, keycloak, cognito, or zitadel`,
  );
}

function parseClientRegistration(
  raw: string | undefined,
  compatibilityProxy: boolean,
  defaultValue: 'none' | 'provider' | 'static' | undefined,
): 'none' | 'provider' | 'static' {
  if (!raw) return defaultValue ?? (compatibilityProxy ? 'static' : 'provider');
  if (raw === 'none' || raw === 'provider' || raw === 'static') return raw;
  throw new Error(`invalid AUTH_CLIENT_REGISTRATION "${raw}": expected none, provider, or static`);
}

function parseAuthEnabled(
  raw: string | undefined,
  issuerUrl: string,
  clientId: string,
  defaultValue: boolean | undefined,
): boolean {
  if (!raw) return defaultValue ?? !!(issuerUrl && clientId);
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`invalid AUTH_ENABLED "${raw}": expected true or false`);
}

function parseAuthCompatibilityProxy(
  raw: string | undefined,
  provider: AuthProviderKind,
  defaultValue: boolean | undefined,
): boolean {
  if (!raw) return defaultValue ?? provider === 'entra';
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`invalid AUTH_COMPATIBILITY_PROXY "${raw}": expected true or false`);
}

function parseScopes(raw: string): string[] {
  return raw.split(/[ ,]+/).filter(Boolean);
}

function parseCsvOrArray(raw: string | undefined, defaultValue: string[] = []): string[] {
  if (!raw) return defaultValue;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function defaultScopes(clientId: string, provider: AuthProviderKind): string {
  if (provider === 'entra' && clientId) return `openid ${clientId}/.default offline_access`;
  return 'openid profile email offline_access';
}

function hasAuthCredentials(config: Config): boolean {
  return !!(config.auth.issuerUrl || config.auth.clientId);
}

function validateConfig(config: Config): void {
  if (!config.auth.enabled) {
    if (hasAuthCredentials(config)) {
      throw new Error(
        'auth is disabled but auth credentials are configured; set AUTH_ENABLED=true or remove AUTH_ISSUER_URL/AUTH_CLIENT_ID',
      );
    }
    return;
  }

  const missing: string[] = [];
  if (!config.auth.issuerUrl) missing.push('AUTH_ISSUER_URL (or AUTH_TENANT_ID/AZURE_TENANT_ID)');
  if (!config.auth.clientId) missing.push('AUTH_CLIENT_ID (or AZURE_CLIENT_ID)');
  if (missing.length > 0) {
    throw new Error(`auth is enabled but required config is missing: ${missing.join(', ')}`);
  }
  parseUrl(config.auth.issuerUrl, 'AUTH_ISSUER_URL');
  if (config.auth.scopes.length === 0) {
    throw new Error('auth is enabled but AUTH_SCOPES resolved to an empty scope list');
  }
}
