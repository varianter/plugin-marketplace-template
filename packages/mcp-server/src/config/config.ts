// Config holds runtime configuration loaded from environment variables.
// Prefer the AUTH_* names for OAuth. AZURE_* names are kept as backwards-compatible
// aliases for existing Entra deployments.

import type { AuthProviderKind } from '../auth/adapters.js';

export interface Config {
  host: string;
  port: number;
  mcpPath: string;
  publicUrl: string;
  corsOrigin: string;
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

export function loadConfig(overrides: ConfigOverrides = {}): Config {
  const host = process.env.HOST ?? '0.0.0.0';
  const port = parsePort(process.env.PORT);
  const mcpPath = process.env.MCP_PATH ?? '/mcp';

  const provider = parseProvider(
    process.env.AUTH_PROVIDER ?? process.env.OAUTH_PROVIDER ?? 'entra',
  );
  const clientId =
    process.env.AUTH_CLIENT_ID ?? process.env.OAUTH_CLIENT_ID ?? process.env.AZURE_CLIENT_ID ?? '';
  const issuerUrl =
    process.env.AUTH_ISSUER_URL ??
    process.env.OAUTH_ISSUER_URL ??
    (process.env.AZURE_TENANT_ID
      ? `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`
      : '');
  const clientSecret =
    process.env.AUTH_CLIENT_SECRET ??
    process.env.OAUTH_CLIENT_SECRET ??
    process.env.AZURE_CLIENT_SECRET ??
    '';
  const scopes = (
    process.env.AUTH_SCOPES ??
    process.env.OAUTH_SCOPES ??
    defaultScopes(clientId, provider)
  )
    .split(/[ ,]+/)
    .filter(Boolean);

  const scopeAliases = parseCsv(process.env.AUTH_SCOPE_ALIASES);
  const compatibilityProxy =
    process.env.AUTH_COMPATIBILITY_PROXY === 'true' ||
    process.env.AUTH_COMPATIBILITY_PROXY === '1' ||
    (provider === 'entra' && process.env.AUTH_COMPATIBILITY_PROXY !== 'false');

  const defaultPublicHost = host === '0.0.0.0' ? 'localhost' : host;

  const allowedRedirectOrigins = parseCsv(
    process.env.AUTH_ALLOWED_REDIRECT_ORIGINS ??
      'http://localhost,http://127.0.0.1,https://claude.ai',
  );

  const config: Config = {
    host,
    port,
    mcpPath,
    publicUrl:
      process.env.PUBLIC_URL ??
      process.env.AUTH_PUBLIC_URL ??
      process.env.AZURE_PUBLIC_URL ??
      `http://${defaultPublicHost}:${port}`,
    corsOrigin: process.env.CORS_ORIGIN ?? '',
    allowedRedirectOrigins,
    mcpMaxSessions: parsePositiveInt(process.env.MCP_MAX_SESSIONS, 200),
    rateLimitPerMinute: parsePositiveInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE, 60),
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    auth: {
      enabled: process.env.AUTH_ENABLED === 'false' ? false : !!(issuerUrl && clientId),
      provider,
      issuerUrl,
      clientId,
      clientSecret,
      audience: process.env.AUTH_AUDIENCE ?? process.env.OAUTH_AUDIENCE ?? '',
      acceptedAudiences: parseCsv(process.env.AUTH_ACCEPTED_AUDIENCES),
      acceptedIssuers: parseCsv(process.env.AUTH_ACCEPTED_ISSUERS),
      scopes,
      scopeAliases,
      compatibilityProxy,
      clientRegistration: parseClientRegistration(
        process.env.AUTH_CLIENT_REGISTRATION,
        compatibilityProxy,
      ),
    },
  };

  return { ...config, ...overrides, auth: { ...config.auth, ...overrides.auth } };
}

function parsePort(rawPort: string | undefined): number {
  if (!rawPort) return 8080;
  const port = parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid PORT "${rawPort}": must be an integer between 1 and 65535`);
  }
  return port;
}

function parsePositiveInt(raw: string | undefined, defaultValue: number): number {
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : defaultValue;
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
): 'none' | 'provider' | 'static' {
  if (!raw) return compatibilityProxy ? 'static' : 'provider';
  if (raw === 'none' || raw === 'provider' || raw === 'static') return raw;
  throw new Error(`invalid AUTH_CLIENT_REGISTRATION "${raw}": expected none, provider, or static`);
}

function parseCsv(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function defaultScopes(clientId: string, provider: AuthProviderKind): string {
  if (provider === 'entra' && clientId) return `openid ${clientId}/.default offline_access`;
  return 'openid profile email offline_access';
}
