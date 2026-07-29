import { resolve } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createMcpExpressApp, type McpServerConfig } from './index.js';

function testConfig(): McpServerConfig {
  return {
    runtime: {
      host: '127.0.0.1',
      port: 0,
      mcpPath: '/mcp',
      publicUrl: 'http://127.0.0.1:0',
      allowedRedirectOrigins: [],
      mcpMaxSessions: 10,
      rateLimitPerMinute: 60,
      trustProxy: false,
      auth: {
        enabled: false,
        provider: 'entra',
        issuerUrl: '',
        clientId: '',
        clientSecret: '',
        audience: '',
        acceptedAudiences: [],
        acceptedIssuers: [],
        scopes: [],
        scopeAliases: [],
        compatibilityProxy: false,
        clientRegistration: 'none',
      },
    },
    metadata: {
      name: 'test-mcp',
      title: 'Test MCP',
      description: 'Test MCP server',
      version: '0.0.0',
      websiteUrl: undefined,
    },
    assetsDir: resolve('plugins/standard/mcp-server/assets'),
  };
}

describe('createMcpExpressApp', () => {
  it('serves the health endpoint', async () => {
    const app = await createMcpExpressApp(testConfig(), () => undefined);

    await request(app).get('/healthz').expect(200);
  });

  it('serves the plugin icon', async () => {
    const app = await createMcpExpressApp(testConfig(), () => undefined);

    const response = await request(app).get('/icon.png').expect(200);

    expect(response.headers['content-type']).toBe('image/png');
  });

  it('mounts the configured MCP endpoint', async () => {
    const app = await createMcpExpressApp(testConfig(), () => undefined);

    const response = await request(app).get('/mcp').expect(400);

    expect(response.body).toMatchObject({
      jsonrpc: '2.0',
      error: { message: 'Bad Request: no valid MCP session' },
      id: null,
    });
  });
});
