import { getRequestContext, type McpServer, registerWidgetTool } from '@variant/mcp-server';
import { z } from 'zod';

const HELLO_WORLD_WIDGET = {
  title: 'Hello World Widget',
  uri: 'ui://widgets/hello-world',
  widgetName: 'hello-world',
};

export function registerHelloWorld(server: McpServer): void {
  registerWidgetTool(
    server,
    'hello-world-widget',
    {
      title: 'Hello World Widget',
      description:
        'Opens a simple interactive Hello World widget. This demonstrates a skill-colocated MCP tool with a Svelte widget in the template repository.',
      resource: HELLO_WORLD_WIDGET,
      inputSchema: {
        name: z
          .string()
          .optional()
          .describe('Name to greet. Defaults to the logged-in user if available.'),
        message: z
          .string()
          .optional()
          .describe('Optional custom message to display in the widget.'),
      },
      annotations: {
        title: 'Hello World Widget',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const ctx = getRequestContext();
      const name = args.name ?? ctx?.name ?? 'World';
      const message = args.message ?? 'Hello from a skill-colocated MCP widget!';

      return {
        content: [
          {
            type: 'text',
            text: `Opening Hello World widget for ${name}.`,
          },
        ],
        structuredContent: { name, message },
      };
    },
  );
}
