import { createAndStartMcpServer, readPluginMcpServerConfig } from '@variant/mcp-server';
import { registerTools } from './registerTools.js';

const config = readPluginMcpServerConfig({ importMetaUrl: import.meta.url });

await createAndStartMcpServer(config, (server) => {
  registerTools(server);
});
