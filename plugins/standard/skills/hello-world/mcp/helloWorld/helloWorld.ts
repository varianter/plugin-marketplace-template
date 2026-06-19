import {
  getRequestContext,
  loadWidgetHtml,
  type McpServer,
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@variant/mcp-server';
import { z } from 'zod';

const RESOURCE_URI = 'ui://widgets/hello-world';

export function registerHelloWorld(server: McpServer): void {
  registerAppTool(
    server,
    'hello-world-widget',
    {
      title: 'Hello World Widget',
      description:
        'Opens a simple interactive Hello World widget. This demonstrates a skill-colocated MCP tool with a Svelte widget in the template repository.',
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
      _meta: { ui: { resourceUri: RESOURCE_URI } },
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

  registerAppResource(server, 'Hello World Widget', RESOURCE_URI, {}, async () => ({
    contents: [
      {
        uri: RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: loadWidgetHtml('hello-world'),
      },
    ],
  }));
}
