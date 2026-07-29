import { describe, expect, it, vi } from 'vitest';

vi.mock('@variant/mcp-server', () => ({
  getRequestContext: () => ({ name: 'Template User' }),
  registerWidgetTool: (
    server: { registerTool: (...args: unknown[]) => void },
    ...args: unknown[]
  ) => server.registerTool(...args),
}));

describe('registerHelloWorld', () => {
  it('registers the example widget-backed MCP tool', async () => {
    const { registerHelloWorld } = await import('./helloWorld.js');
    const calls: unknown[][] = [];
    const server = { registerTool: (...args: unknown[]) => calls.push(args) };

    registerHelloWorld(server as never);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('hello-world-widget');
    expect(calls[0]?.[1]).toMatchObject({
      title: 'Hello World Widget',
      resource: { uri: 'ui://widgets/hello-world', widgetName: 'hello-world' },
    });
  });

  it('returns structured content for the widget', async () => {
    const { registerHelloWorld } = await import('./helloWorld.js');
    const calls: unknown[][] = [];
    const server = { registerTool: (...args: unknown[]) => calls.push(args) };
    registerHelloWorld(server as never);

    const handler = calls[0]?.[2] as (args: { name?: string; message?: string }) => Promise<{
      structuredContent: { name: string; message: string };
    }>;
    const result = await handler({ message: 'Custom message' });

    expect(result.structuredContent).toEqual({
      name: 'Template User',
      message: 'Custom message',
    });
  });
});
