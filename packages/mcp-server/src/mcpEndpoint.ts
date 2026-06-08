import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express, { type Request, type Response } from 'express';
import type { ServerMetadata } from './config/metadata.js';
import { log } from './log.js';

export { McpServer };
export type RegisterTools = (server: McpServer) => void | Promise<void>;

const MAX_BODY_BYTES = '50mb';

export interface McpRouterOptions {
  iconUrl: string;
  metadata: ServerMetadata;
  maxSessions: number;
  signal: AbortSignal;
  /** Called once per MCP session to register tools on the new McpServer instance. */
  registerTools: RegisterTools;
}

export function createMcpRouter(opts: McpRouterOptions): express.Router {
  const router = express.Router();
  const transports = new Map<string, StreamableHTTPServerTransport>();

  router.use(express.json({ limit: MAX_BODY_BYTES }));
  router.all('/', (req, res) => handleMcp(req, res, transports, opts));

  opts.signal.addEventListener('abort', () => {
    for (const transport of transports.values()) transport.close().catch(() => undefined);
  });

  return router;
}

async function handleMcp(
  req: Request,
  res: Response,
  transports: Map<string, StreamableHTTPServerTransport>,
  opts: McpRouterOptions,
): Promise<void> {
  const sessionId = req.header('Mcp-Session-Id');
  const existingTransport = sessionId ? transports.get(sessionId) : undefined;

  if (existingTransport) {
    await existingTransport.handleRequest(req, res, req.body);
    return;
  }

  if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: no valid MCP session' },
      id: null,
    });
    return;
  }

  if (transports.size >= opts.maxSessions) {
    log('warn', 'mcp session limit reached', { sessions: transports.size });
    res.status(503).json({ error: 'too_many_sessions' });
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

  const server = await buildServer(opts);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

async function buildServer(opts: McpRouterOptions): Promise<McpServer> {
  const server = new McpServer({
    name: opts.metadata.name,
    title: opts.metadata.title,
    description: opts.metadata.description,
    version: opts.metadata.version,
    icons: [{ src: opts.iconUrl, mimeType: 'image/png' }],
    ...(opts.metadata.websiteUrl && { websiteUrl: opts.metadata.websiteUrl }),
  });
  await opts.registerTools(server);
  return server;
}
