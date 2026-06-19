import { getRequestContext, type McpServer } from '@variant/mcp-server';

export function registerWhoami(server: McpServer): void {
  server.registerTool(
    'whoami',
    {
      title: 'Who Am I',
      description: 'Returns information about the currently logged-in user',
      annotations: {
        title: 'Who am I?',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      const ctx = getRequestContext();
      if (!ctx) {
        return {
          content: [{ type: 'text', text: 'Auth is disabled — no user identity available.' }],
        };
      }

      const lines = [`User ID: ${ctx.userId}`];
      if (ctx.email) lines.push(`Email: ${ctx.email}`);
      if (ctx.name) lines.push(`Name: ${ctx.name}`);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );
}
