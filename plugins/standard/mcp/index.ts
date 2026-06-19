import { createAndStartMcpServer, readPluginMcpServerConfig, definePluginTools } from '@variant/mcp-server';

// List of tools
import { registerHelloWorld } from '../skills/hello-world/mcp/helloWorld/helloWorld.js';
import { registerWhoami } from '../tools/whoami/whoami.js';

const config = readPluginMcpServerConfig();
await createAndStartMcpServer(config, definePluginTools([
  registerWhoami, registerHelloWorld
]));
