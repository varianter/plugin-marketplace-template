import type { Server } from 'node:http';
import { join } from 'node:path';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { attachRequestContext } from './auth/middleware.js';
import { OAuthProvider } from './auth/provider.js';
import { bearerResourceMetadataUrl, createAuthRouter } from './auth/routes.js';
import { type Config, type ConfigOverrides, loadConfig } from './config/config.js';
import { loadServerMetadata, type ServerMetadata } from './config/metadata.js';
import { log } from './log.js';
import { createMcpRouter, type McpServer } from './mcpEndpoint.js';

export {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
export type { RequestContext } from './auth/context.js';
export { getRequestContext } from './auth/context.js';
export type { Config, ConfigOverrides } from './config/config.js';
export { loadConfig } from './config/config.js';
export type { ServerMetadata } from './config/metadata.js';
export { loadServerMetadata } from './config/metadata.js';
export { log } from './log.js';
export type { ToolRegistrar } from './registerLocalPluginTools.js';
export { definePluginTools } from './registerLocalPluginTools.js';
export { loadWidgetHtml } from './widgets.js';
export type { WidgetResourceDefinition, WidgetToolConfig } from './widgetTool.js';
export { registerWidgetTool } from './widgetTool.js';
export type { McpServer };

export interface McpServerConfig {
  runtime: Config;
  metadata: ServerMetadata;
  /** Absolute path to the directory containing `icon.png`. */
  assetsDir: string;
}

export interface PluginMcpServerConfigOptions {
  /** Plugin root directory. Defaults to `process.cwd()`. */
  pluginDir?: string;
  /** Runtime config overrides. Environment variables remain the defaults. */
  runtime?: ConfigOverrides;
  /** Override loaded server metadata. */
  metadata?: Partial<ServerMetadata>;
  /** Override the default `mcp-server/assets/` directory under the plugin root. */
  assetsDir?: string;
  /** Override the default plugin root used to find `.claude-plugin/plugin.json`. */
  manifestDir?: string;
}

export type RegisterTools = (server: McpServer) => void | Promise<void>;

export interface McpServerOptions extends PluginMcpServerConfigOptions {
  /** Called once per MCP session to register tools on the new McpServer instance. */
  registerTools: RegisterTools;
}

export interface McpExpressAppOptions {
  /** Abort signal used to close active MCP transports. */
  signal?: AbortSignal;
}

/**
 * Read conventional plugin configuration without starting a server:
 * - dev:  plugins/<plugin>/mcp-server/index.ts with cwd `plugins/<plugin>`
 * - prod: /app/mcp-server/index.js with cwd `/app`
 * - assets: <plugin-root>/mcp-server/assets/icon.png
 * - manifest: <plugin-root>/.claude-plugin/plugin.json
 */
export function readPluginMcpServerConfig(
  options: PluginMcpServerConfigOptions = {},
): McpServerConfig {
  const pluginDir = options.pluginDir ?? process.cwd();
  const manifestDir = options.manifestDir ?? pluginDir;
  const metadata = loadServerMetadata(manifestDir);

  return {
    runtime: loadConfig(options.runtime),
    metadata: { ...metadata, ...options.metadata },
    assetsDir: options.assetsDir ?? join(pluginDir, 'mcp-server/assets'),
  };
}

/** Create and start an MCP HTTP server from explicit config. */
export async function createAndStartMcpServer(
  config: McpServerConfig,
  registerTools: RegisterTools,
): Promise<void> {
  try {
    await startConfiguredMcpServer(config, registerTools);
  } catch (err) {
    logStartupError(err);
  }
}

function logStartupError(err: unknown): never {
  process.stderr.write(
    `${JSON.stringify({ level: 'error', msg: 'startup failed', error: String(err) })}\n`,
  );
  process.exit(1);
}

export async function createMcpExpressApp(
  config: McpServerConfig,
  registerTools: RegisterTools,
  options: McpExpressAppOptions = {},
): Promise<express.Express> {
  const { runtime: cfg, metadata, assetsDir: resolvedAssetsDir } = config;
  const provider = cfg.auth.enabled
    ? await OAuthProvider.create({
        issuerUrl: cfg.auth.issuerUrl,
        clientId: cfg.auth.clientId,
        clientSecret: cfg.auth.clientSecret || undefined,
        audience: cfg.auth.audience || undefined,
        acceptedAudiences: cfg.auth.acceptedAudiences,
        acceptedIssuers: cfg.auth.acceptedIssuers,
        scopes: cfg.auth.scopes,
        scopeAliases: cfg.auth.scopeAliases,
        publicUrl: cfg.publicUrl,
        mcpPath: cfg.mcpPath,
        providerKind: cfg.auth.provider,
        compatibilityProxy: cfg.auth.compatibilityProxy,
        clientRegistration: cfg.auth.clientRegistration,
      })
    : undefined;

  if (!provider) log('warn', 'auth disabled');

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

  app.use(
    cfg.mcpPath,
    createMcpRouter({
      iconUrl: `${cfg.publicUrl}/icon.png`,
      metadata,
      maxSessions: cfg.mcpMaxSessions,
      signal: options.signal ?? new AbortController().signal,
      registerTools,
    }),
  );
  app.use(errorHandler);

  return app;
}

async function startConfiguredMcpServer(
  config: McpServerConfig,
  registerTools: RegisterTools,
): Promise<void> {
  const { runtime: cfg } = config;
  const shutdown = new AbortController();
  const app = await createMcpExpressApp(config, registerTools, { signal: shutdown.signal });

  const httpServer = await new Promise<Server>((resolve, reject) => {
    const server = app.listen(cfg.port, cfg.host, () => {
      server.off('error', reject);
      log('info', 'server started', {
        addr: `${cfg.host}:${cfg.port}`,
        publicUrl: cfg.publicUrl,
        mcp: cfg.mcpPath,
        auth: cfg.auth.enabled ? cfg.auth.provider : 'disabled',
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

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  log('error', 'request error', { error: err instanceof Error ? err.message : String(err) });
  if (!res.headersSent) res.status(500).send('Internal server error');
}
