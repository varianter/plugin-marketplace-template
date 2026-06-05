import { join } from 'node:path';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { attachRequestContext } from './auth/middleware.js';
import { OAuthProvider } from './auth/provider.js';
import { bearerResourceMetadataUrl, createAuthRouter } from './auth/routes.js';
import { loadConfig } from './config/config.js';
import { loadServerMetadata } from './config/metadata.js';
import { log } from './log.js';
import { createMcpRouter } from './mcpEndpoint.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const metadata = loadServerMetadata();
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
    res.type('png').sendFile(join(import.meta.dirname, 'assets', 'icon.png')),
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
    }),
  );
  app.use(errorHandler);

  const httpServer = app.listen(cfg.port, cfg.host, () => {
    log('info', 'server started', {
      addr: `${cfg.host}:${cfg.port}`,
      publicUrl: cfg.publicUrl,
      mcp: cfg.mcpPath,
      auth: provider ? cfg.auth.provider : 'disabled',
    });
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

main().catch((err) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'error', msg: 'startup failed', error: String(err) })}\n`,
  );
  process.exit(1);
});

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
