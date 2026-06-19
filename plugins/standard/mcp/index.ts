import { createAndStartMcpServer, readPluginMcpServerConfig } from '@variant/mcp-server';
import { registerTools } from './registerTools.js';

const config = readPluginMcpServerConfig();

await createAndStartMcpServer(config, (server) => {
  registerTools(server);
});
