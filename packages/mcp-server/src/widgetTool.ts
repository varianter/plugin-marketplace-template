import type {
  McpUiAppResourceConfig,
  McpUiAppToolConfig,
  ToolCallback,
} from '@modelcontextprotocol/ext-apps/server';
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import type { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { McpServer } from './mcpEndpoint.js';
import { loadWidgetHtml } from './widgets.js';

export interface WidgetResourceDefinition {
  /** Human-readable resource name shown to MCP clients. */
  title: string;
  /** Explicit MCP UI resource URI. Example: `ui://widgets/hello-world`. */
  uri: string;
  /** Built widget directory name under `mcp-server/dist/widgets/<widgetName>/index.html`. */
  widgetName: string;
  /** Optional resource metadata, for example CSP configuration. */
  config?: McpUiAppResourceConfig;
}

export type WidgetToolConfig = Omit<McpUiAppToolConfig, '_meta'> & {
  /** Explicit widget resource. Kept separate from tool metadata so the information flow is clear. */
  resource: WidgetResourceDefinition;
  /** Optional additional tool metadata. `_meta.ui.resourceUri` is set from `resource.uri`. */
  _meta?: Omit<NonNullable<McpUiAppToolConfig['_meta']>, 'ui'>;
};

function createWidgetToolConfig(config: WidgetToolConfig): McpUiAppToolConfig {
  const { resource, _meta, ...toolConfig } = config;

  return {
    ...toolConfig,
    _meta: {
      ..._meta,
      ui: { resourceUri: resource.uri },
    },
  };
}

function createWidgetResourceResult(resource: WidgetResourceDefinition, html: string) {
  return {
    contents: [
      {
        uri: resource.uri,
        mimeType: RESOURCE_MIME_TYPE,
        text: html,
      },
    ],
  };
}

function registerWidgetResource(server: McpServer, resource: WidgetResourceDefinition): void {
  registerAppResource(server, resource.title, resource.uri, resource.config ?? {}, async () =>
    createWidgetResourceResult(resource, loadWidgetHtml(resource.widgetName)),
  );
}

export function registerWidgetTool<
  OutputArgs extends ZodRawShapeCompat,
  InputArgs extends undefined | ZodRawShapeCompat = undefined,
>(
  server: McpServer,
  name: string,
  config: WidgetToolConfig & {
    inputSchema?: InputArgs;
    outputSchema?: OutputArgs;
  },
  callback: ToolCallback<
    InputArgs extends undefined | ZodRawShapeCompat | AnySchema ? InputArgs : AnySchema
  >,
): void {
  const toolConfig = createWidgetToolConfig(config) as McpUiAppToolConfig & {
    inputSchema?: InputArgs;
    outputSchema?: OutputArgs;
  };

  registerAppTool<OutputArgs, InputArgs>(server, name, toolConfig, callback);
  registerWidgetResource(server, config.resource);
}
