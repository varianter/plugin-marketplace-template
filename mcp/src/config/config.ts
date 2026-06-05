// Config holds runtime configuration loaded from environment variables.
// Prefer the AUTH_* names for OAuth. AZURE_* names are kept as backwards-compatible
// aliases for existing Entra deployments.

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
    provider: 'oidc' | 'entra';
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    audience: string;
    scopes: string[];
    /** Extra scope names to rewrite to `{clientId}/.default` (Entra compatibility proxy only). */
    scopeAliases: string[];
    compatibilityProxy: boolean;
  };
}

export function loadConfig(): Config {
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

  const scopeAliases = (process.env.AUTH_SCOPE_ALIASES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const defaultPublicHost = host === '0.0.0.0' ? 'localhost' : host;

  const allowedRedirectOrigins = (
    process.env.AUTH_ALLOWED_REDIRECT_ORIGINS ??
    'http://localhost,http://127.0.0.1,https://claude.ai'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
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
      scopes,
      scopeAliases,
      compatibilityProxy:
        process.env.AUTH_COMPATIBILITY_PROXY === 'true' ||
        process.env.AUTH_COMPATIBILITY_PROXY === '1' ||
        (provider === 'entra' && process.env.AUTH_COMPATIBILITY_PROXY !== 'false'),
    },
  };
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

function parseProvider(raw: string): 'oidc' | 'entra' {
  if (raw === 'oidc' || raw === 'entra') return raw;
  throw new Error(`invalid AUTH_PROVIDER "${raw}": expected "oidc" or "entra"`);
}

function defaultScopes(clientId: string, provider: 'oidc' | 'entra'): string {
  if (provider === 'entra' && clientId) return `openid ${clientId}/.default offline_access`;
  return 'openid profile email offline_access';
}
