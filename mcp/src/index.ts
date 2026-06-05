import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerWhoami } from '../../tools/whoami/whoami.js';
import { type RequestContext, runWithContext } from './auth/context.js';
import { getWellKnownMetadata, type WellKnownParams } from './auth/discovery.js';
import { extractIdentity } from './auth/identity.js';
import { verifyEntraToken } from './auth/jwt.js';
import { handleRegistration, RegistrationError } from './auth/registration.js';
import { type Config, loadConfig } from './config/config.js';
import { log } from './log.js';
import { registerFeatureTools } from './registerFeatureTools.js';
import { loadSecret, SecretsLoader } from './secrets/secrets.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const iconPath = join(__dirname, 'assets', 'icon.png');

const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB — covers large deploy payloads
const MAX_RAW_BODY_BYTES = 64 * 1024; // 64 KB — token endpoint only ever sends form data
const MAX_SESSIONS = 200;

// ---- Entry point ----

async function main(): Promise<void> {
  const cfg = loadConfig();
  const loader = new SecretsLoader(cfg.keyVaultUrl);

  // In k8s, AZURE_CLIENT_ID and AZURE_TENANT_ID are injected as env vars from values.yaml.
  // Locally, they are absent and are instead read from Key Vault so no extra env vars are needed
  // beyond KEYVAULT_URL (which is already required for tool secrets).
  if (!cfg.azureClientId) {
    cfg.azureClientId = await loadSecret(loader, 'AZURE_CLIENT_ID', 'mcp-gateway-client-id');
  }
  if (!cfg.azureTenantId) {
    cfg.azureTenantId = await loadSecret(loader, 'AZURE_TENANT_ID', 'mcp-gateway-tenant-id');
  }
  if (!cfg.azureClientSecret) {
    cfg.azureClientSecret = await loadSecret(
      loader,
      'AZURE_CLIENT_SECRET',
      'mcp-gateway-client-secret',
    );
  }

  const iconUrl = `http://${cfg.host}:${cfg.port}/icon.png`;
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const corsOrigin = process.env.CORS_ORIGIN ?? '';
  const authEnabled = !!(cfg.azureTenantId && cfg.azureClientId);
  const wellKnownParams: WellKnownParams = {
    tenantId: cfg.azureTenantId,
    clientId: cfg.azureClientId,
    baseUrl: cfg.azurePublicUrl,
  };

  if (!authEnabled) {
    log('warn', 'auth disabled: AZURE_TENANT_ID or AZURE_CLIENT_ID not set');
  }
  if (corsOrigin === '*') {
    log('warn', 'CORS_ORIGIN=* is set — restrict to specific origins in production');
  }

  const httpSrv = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Accept, mcp-session-id, Authorization',
      );
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    try {
      // Public routes — no authentication required
      if (req.url === '/healthz') return handleHealth(res);
      if (req.url === '/icon.png') return handleIcon(res);

      // OAuth routes — only active when auth is configured
      if (authEnabled) {
        if (req.url?.startsWith('/.well-known/')) return handleWellKnown(req, res, wellKnownParams);
        if (req.url?.startsWith('/authorize') && req.method === 'GET')
          return handleAuthorize(req, res, cfg);
        if (req.url === '/token' && req.method === 'POST') return await handleToken(req, res, cfg);
        if (req.url === '/register' && req.method === 'POST')
          return await handleRegister(req, res, cfg);
      }

      // All remaining routes require a valid Bearer token
      const requestCtx = await authenticateRequest(req, res, cfg, authEnabled);
      if (requestCtx === null) return; // rejected — response already sent

      if (req.url === cfg.mcpPath || req.url?.startsWith(`${cfg.mcpPath}?`))
        return await handleMcpEndpoint(req, res, requestCtx, transports, loader, iconUrl);

      handleNotFound(res);
    } catch (err) {
      log('error', 'request error', {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Internal server error');
      }
    }
  });

  const addr = `${cfg.host}:${cfg.port}`;
  httpSrv.listen(cfg.port, cfg.host, () => {
    log('info', 'server started', {
      addr,
      mcp: cfg.mcpPath,
      health: '/healthz',
    });
  });

  const shutdown = (): void => {
    log('info', 'shutting down server');
    const deadline = setTimeout(() => process.exit(1), 5_000);
    deadline.unref();
    for (const transport of transports.values()) {
      transport.close().catch(() => undefined);
    }
    httpSrv.closeAllConnections();
    httpSrv.close(() => {
      log('info', 'http server closed');
      clearTimeout(deadline);
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'error', msg: 'startup failed', error: String(err) })}\n`,
  );
  process.exit(1);
});

// ---- Route handlers ----

function handleHealth(res: ServerResponse): void {
  res.writeHead(200);
  res.end();
}

function handleIcon(res: ServerResponse): void {
  const icon = readFileSync(iconPath);
  res.writeHead(200, { 'Content-Type': 'image/png' });
  res.end(icon);
}

function handleNotFound(res: ServerResponse): void {
  res.writeHead(404);
  res.end();
}

function handleWellKnown(req: IncomingMessage, res: ServerResponse, params: WellKnownParams): void {
  const path = req.url?.split('?')[0];
  if (!path) {
    handleNotFound(res);
    return;
  }
  // Reflect the host the client connected to so the `resource` field in the metadata
  // matches — MCPJam (and other strict clients) reject metadata where resource != request origin.
  const host = req.headers.host;
  const scheme = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
  const baseUrl = host ? `${scheme}://${host}` : params.baseUrl;
  const metadata = getWellKnownMetadata(path, { ...params, baseUrl });
  if (!metadata) {
    handleNotFound(res);
    return;
  }
  log('info', 'well-known', {
    path,
    baseUrl,
    authorization_endpoint: metadata.authorization_endpoint,
    scopes_supported: metadata.scopes_supported,
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(metadata));
}

// Proxy to Entra's authorization endpoint, stripping the `resource` parameter added by the MCP
// SDK (RFC 8707) which Entra rejects (AADSTS9010010), and normalizing bare scope names to
// the api://<clientId>/.default form that Entra's v2 endpoint accepts.
function handleAuthorize(req: IncomingMessage, res: ServerResponse, cfg: Config): void {
  const incoming = new URL(req.url ?? '', cfg.azurePublicUrl || `http://${req.headers.host}`);
  incoming.searchParams.delete('resource');
  const rawScope = incoming.searchParams.get('scope') ?? '';
  if (rawScope) {
    // Entra rejects self-referencing apps with api://<clientId>/.default (AADSTS90009)
    // and with named scopes that aren't provisioned (AADSTS65005). The GUID-based form
    // <clientId>/.default is explicitly supported per the AADSTS90009 error message.
    const defaultScope = `${cfg.azureClientId}/.default`;
    incoming.searchParams.set(
      'scope',
      rawScope
        .split(' ')
        .map((s) =>
          s === 'claudeai' ||
          s === `${cfg.azureClientId}/.default` ||
          s === `api://${cfg.azureClientId}/.default` ||
          s === `api://${cfg.azureClientId}/claudeai`
            ? defaultScope
            : s,
        )
        .join(' '),
    );
  }
  const entra = new URL(
    `https://login.microsoftonline.com/${cfg.azureTenantId}/oauth2/v2.0/authorize`,
  );
  for (const [k, v] of incoming.searchParams) entra.searchParams.set(k, v);
  log('info', 'authorize proxy', {
    scope_in: rawScope,
    scope_out: entra.searchParams.get('scope'),
    redirect_uri: entra.searchParams.get('redirect_uri'),
    redirect_to: entra.origin + entra.pathname,
  });
  res.writeHead(302, { Location: entra.toString() });
  res.end();
}

// Proxy to Entra's token endpoint with the same resource/scope normalization as handleAuthorize.
async function handleToken(req: IncomingMessage, res: ServerResponse, cfg: Config): Promise<void> {
  const raw = await readRawBody(req);
  const params = new URLSearchParams(raw);
  log('info', 'token request', {
    grant_type: params.get('grant_type'),
    scope: params.get('scope'),
    redirect_uri: params.get('redirect_uri'),
    has_code: !!params.get('code'),
    has_refresh_token: !!params.get('refresh_token'),
    has_code_verifier: !!params.get('code_verifier'),
  });
  params.delete('resource');
  if (!params.has('client_id')) params.set('client_id', cfg.azureClientId);
  const injectedSecret = !params.has('client_secret') && !!cfg.azureClientSecret;
  if (injectedSecret) params.set('client_secret', cfg.azureClientSecret);
  const rawScope = params.get('scope') ?? '';
  if (rawScope) {
    const defaultScope = `${cfg.azureClientId}/.default`;
    params.set(
      'scope',
      rawScope
        .split(' ')
        .map((s) =>
          s === 'claudeai' ||
          s === `${cfg.azureClientId}/.default` ||
          s === `api://${cfg.azureClientId}/.default` ||
          s === `api://${cfg.azureClientId}/claudeai`
            ? defaultScope
            : s,
        )
        .join(' '),
    );
  }
  const tokenUrl = `https://login.microsoftonline.com/${cfg.azureTenantId}/oauth2/v2.0/token`;
  let upstream = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  let upstreamBody = await upstream.text();
  // AADSTS700025: app is registered as a public client — client_secret must not be sent.
  // Retry without the secret we injected so public-client apps work without config changes.
  if (upstream.status === 401 && injectedSecret) {
    try {
      const errJson = JSON.parse(upstreamBody) as { error_description?: string };
      if (errJson.error_description?.includes('AADSTS700025')) {
        log('warn', 'token: public client detected — retrying without client_secret');
        params.delete('client_secret');
        upstream = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        upstreamBody = await upstream.text();
      }
    } catch {
      // not JSON — fall through with original response
    }
  }
  let responseBody = upstreamBody;
  try {
    const json = JSON.parse(upstreamBody);
    log('info', 'token response', {
      status: upstream.status,
      token_type: json.token_type,
      scope: json.scope,
      expires_in: json.expires_in,
      has_access_token: !!json.access_token,
      has_refresh_token: !!json.refresh_token,
      has_id_token: !!json.id_token,
      error: json.error,
      error_description: json.error_description,
    });
    responseBody = JSON.stringify(json);
  } catch {
    log('debug', 'token response (non-JSON)', {
      status: upstream.status,
      body: upstreamBody.slice(0, 200),
    });
  }
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
  });
  res.end(responseBody);
}

// RFC 7591 dynamic client registration stub — returns the pre-configured AZURE_CLIENT_ID so
// Claude.ai can start the Entra OAuth flow.
async function handleRegister(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: Config,
): Promise<void> {
  try {
    const body = await readBody(req);
    const result = handleRegistration(body, cfg.azureClientId);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    if (err instanceof RegistrationError) {
      res.end(JSON.stringify({ error: err.code, error_description: err.message }));
    } else {
      res.end(JSON.stringify({ error: 'invalid_client_metadata' }));
    }
  }
}

// Validates the Bearer token on every request so RequestContext always carries a fresh token for
// on-behalf-of calls. Returns the context on success, undefined when auth is disabled, or null
// when the token is missing/invalid (response already sent).
async function authenticateRequest(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: Config,
  authEnabled: boolean,
): Promise<RequestContext | undefined | null> {
  if (!authEnabled) return undefined;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer realm="${cfg.azureClientId}", scope="openid ${cfg.azureClientId}/.default offline_access"`,
    });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return null;
  }

  const rawToken = authHeader.slice(7);
  try {
    const claims = await verifyEntraToken(rawToken, cfg.azureTenantId, cfg.azureClientId);
    const identity = extractIdentity(claims);
    return { ...identity, token: rawToken };
  } catch (err) {
    log('warn', 'token validation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer error="invalid_token"',
    });
    res.end(JSON.stringify({ error: 'invalid_token' }));
    return null;
  }
}

async function handleMcpEndpoint(
  req: IncomingMessage,
  res: ServerResponse,
  requestCtx: RequestContext | undefined,
  transports: Map<string, StreamableHTTPServerTransport>,
  loader: SecretsLoader,
  iconUrl: string,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  const dispatchWithContext = async (transport: StreamableHTTPServerTransport, body?: unknown) => {
    const dispatch = () => transport.handleRequest(req, res, body);
    return requestCtx ? runWithContext(requestCtx, dispatch) : dispatch();
  };

  const existingTransport = sessionId ? transports.get(sessionId) : undefined;
  if (existingTransport) {
    const body = req.method === 'POST' ? await readBody(req) : undefined;
    await dispatchWithContext(existingTransport, body);
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad request: session not found');
    return;
  }

  if (transports.size >= MAX_SESSIONS) {
    log('warn', 'mcp session limit reached', { sessions: transports.size });
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'too_many_sessions' }));
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      log('info', 'mcp session opened', { sessionId: id });
      transports.set(id, transport);
    },
  });

  transport.onclose = () => {
    const id = transport.sessionId;
    if (id) {
      log('info', 'mcp session closed', { sessionId: id });
      transports.delete(id);
    }
  };

  const server = buildServer(loader, iconUrl);
  await server.connect(transport);

  const body = await readBody(req);
  await dispatchWithContext(transport, body);
}

// ---- Helpers ----

function buildServer(loader: SecretsLoader, iconUrl: string): McpServer {
  const server = new McpServer({
    name: 'plugin-mcp',
    title: 'Plugin MCP',
    description: 'MCP server for the Claude Code plugin template.',
    version: '0.1.0',
    icons: [{ src: iconUrl, mimeType: 'image/png' }],
  });
  registerWhoami(server);
  registerFeatureTools(server, loader);
  return server;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(
          Object.assign(new Error('Request body too large'), {
            statusCode: 413,
          }),
        );
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString();
      if (!text) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_RAW_BODY_BYTES) {
        reject(
          Object.assign(new Error('Request body too large'), {
            statusCode: 413,
          }),
        );
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}
