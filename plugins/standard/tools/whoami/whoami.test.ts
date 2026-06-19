import { describe, expect, it, vi } from 'vitest';

vi.mock('@variant/mcp-server', () => ({
  getRequestContext: () => undefined,
}));

describe('registerWhoami', () => {
  it('registers the example whoami MCP tool', async () => {
    const { registerWhoami } = await import('./whoami.js');
    const calls: unknown[][] = [];
    const server = { registerTool: (...args: unknown[]) => calls.push(args) };

    registerWhoami(server as never);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('whoami');
    expect(calls[0]?.[1]).toMatchObject({
      title: 'Who Am I',
      annotations: { readOnlyHint: true, idempotentHint: true },
    });
  });

  it('returns a useful local-development message when auth is disabled', async () => {
    const { registerWhoami } = await import('./whoami.js');
    const calls: unknown[][] = [];
    const server = { registerTool: (...args: unknown[]) => calls.push(args) };
    registerWhoami(server as never);

    const handler = calls[0]?.[2] as () => Promise<{ content: Array<{ text: string }> }>;
    const result = await handler();

    expect(result.content[0]?.text).toContain('Auth is disabled');
  });
});
