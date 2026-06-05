import type { Server } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { attachRequestContext } from './auth/middleware.js';
import { OAuthProvider } from './auth/provider.js';
import { bearerResourceMetadataUrl, createAuthRouter } from './auth/routes.js';
import { type Config, type ConfigOverrides, loadConfig } from './config/config.js';
import { loadServerMetadata, type ServerMetadata } from './config/metadata.js';
import { log } from './log.js';
import { createMcpRouter, type McpServer } from './mcpEndpoint.js';

export type { RequestContext } from './auth/context.js';
export { getRequestContext } from './auth/context.js';
export type { Config, ConfigOverrides } from './config/config.js';
export { loadConfig } from './config/config.js';
export type { ServerMetadata } from './config/metadata.js';
export { loadServerMetadata } from './config/metadata.js';
export { log } from './log.js';
export { injectExtApps } from './widgets.js';
export type { McpServer };

export interface McpServerConfig {
  runtime: Config;
  metadata: ServerMetadata;
  /** Absolute path to the directory containing `icon.png`. */
  assetsDir: string;
}

export interface PluginMcpServerConfigOptions {
  /** The plugin entry module URL (`import.meta.url`). Used to derive conventional paths. */
  importMetaUrl: string;
  /** Runtime config overrides. Environment variables remain the defaults. */
  runtime?: ConfigOverrides;
  /** Override loaded server metadata. */
  metadata?: Partial<ServerMetadata>;
  /** Override the default `assets/` directory next to the plugin entry point. */
  assetsDir?: string;
  /** Override the default plugin root two directories above the plugin entry point. */
  manifestDir?: string;
}

export interface McpServerOptions extends PluginMcpServerConfigOptions {
  /** Called once per MCP session to register tools on the new McpServer instance. */
  registerTools: (server: McpServer) => void;
}

/**
 * Read conventional plugin configuration without starting a server:
 * - dev:  plugins/<plugin>/mcp/src/index.ts
 * - prod: /app/mcp/src/index.js
 * - assets: mcp/src/assets/icon.png
 * - manifest: <plugin-root>/.claude-plugin/plugin.json
 */
export function readPluginMcpServerConfig(options: PluginMcpServerConfigOptions): McpServerConfig {
  const entryDir = fileURLToPath(new URL('.', options.importMetaUrl));
  const manifestDir = options.manifestDir ?? join(entryDir, '../..');
  const metadata = loadServerMetadata(manifestDir);

  return {
    runtime: loadConfig(options.runtime),
    metadata: { ...metadata, ...options.metadata },
    assetsDir: options.assetsDir ?? join(entryDir, 'assets'),
  };
}

/** Create and start an MCP HTTP server from explicit config. */
export function startPluginMcpServer(
  config: McpServerConfig,
  registerTools: (server: McpServer) => void,
): Promise<void> {
  return createAndStartMcpServer(config, registerTools);
}

export async function createAndStartMcpServer(
  config: McpServerConfig,
  registerTools: (server: McpServer) => void,
): Promise<void> {
  try {
    await startConfiguredMcpServer(config, registerTools);
  } catch (err) {
    logStartupError(err);
  }
}

export function logStartupError(err: unknown): never {
  process.stderr.write(
    `${JSON.stringify({ level: 'error', msg: 'startup failed', error: String(err) })}\n`,
  );
  process.exit(1);
}

async function startConfiguredMcpServer(
  config: McpServerConfig,
  registerTools: (server: McpServer) => void,
): Promise<void> {
  const { runtime: cfg, metadata, assetsDir: resolvedAssetsDir } = config;
  const provider = cfg.auth.enabled
    ? await OAuthProvider.create({
        issuerUrl: cfg.auth.issuerUrl,
        clientId: cfg.auth.clientId,
        clientSecret: cfg.auth.clientSecret || undefined,
        audience: cfg.auth.audience || undefined,
        scopes: cfg.auth.scopes,
        scopeAliases: cfg.auth.scopeAliases,
        publicUrl: cfg.publicUrl,
        mcpPath: cfg.mcpPath,
        providerKind: cfg.auth.provider,
        compatibilityProxy: cfg.auth.compatibilityProxy,
      })
    : undefined;

  if (!provider) log('warn', 'auth disabled: AUTH_ISSUER_URL or AUTH_CLIENT_ID not set');
  if (cfg.corsOrigin === '*') log('warn', 'CORS_ORIGIN=* is set — restrict in production');

  const app = express();
  app.set('trust proxy', cfg.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // widgets use inlined scripts/styles (vite-plugin-singlefile)
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          // allow framing by Claude and other MCP clients (null removes the default 'none')
          frameAncestors: null,
        },
      },
    }),
  );
  app.use(configureCors(cfg.corsOrigin));

  app.get('/healthz', (_req, res) => res.sendStatus(200));
  app.get('/icon.png', (_req, res) =>
    res.type('png').sendFile(join(resolvedAssetsDir, 'icon.png')),
  );

  if (provider) {
    app.use(createAuthRouter(cfg, provider, metadata));
    app.use(
      cfg.mcpPath,
      requireBearerAuth({
        verifier: provider,
        requiredScopes: [],
        resourceMetadataUrl: bearerResourceMetadataUrl(provider),
      }),
      attachRequestContext,
    );
  }

  const shutdown = new AbortController();

  app.use(
    cfg.mcpPath,
    createMcpRouter({
      iconUrl: `${cfg.publicUrl}/icon.png`,
      metadata,
      maxSessions: cfg.mcpMaxSessions,
      signal: shutdown.signal,
      registerTools,
    }),
  );
  app.use(errorHandler);

  const httpServer = await new Promise<Server>((resolve, reject) => {
    const server = app.listen(cfg.port, cfg.host, () => {
      server.off('error', reject);
      log('info', 'server started', {
        addr: `${cfg.host}:${cfg.port}`,
        publicUrl: cfg.publicUrl,
        mcp: cfg.mcpPath,
        auth: provider ? cfg.auth.provider : 'disabled',
      });
      resolve(server);
    });
    server.once('error', reject);
  });

  const stop = (): void => {
    log('info', 'shutting down server');
    shutdown.abort();
    httpServer.closeAllConnections();
    httpServer.close(() => {
      log('info', 'http server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

function configureCors(origin: string): RequestHandlerOrNoop {
  if (!origin) return (_req, _res, next) => next();
  return cors({
    origin: origin === '*' ? true : origin,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Mcp-Session-Id', 'Authorization'],
    exposedHeaders: ['Mcp-Session-Id'],
  });
}

type RequestHandlerOrNoop = (req: Request, res: Response, next: NextFunction) => void;

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  log('error', 'request error', { error: err instanceof Error ? err.message : String(err) });
  if (!res.headersSent) res.status(500).send('Internal server error');
}
