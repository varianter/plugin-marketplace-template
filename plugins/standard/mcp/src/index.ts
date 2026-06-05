import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMcpServer } from '@variant/mcp-server';
import { registerTools } from './registerTools.js';

// __dirname resolves to the directory of this file regardless of whether tsx runs the
// TypeScript source or Node runs the compiled JS output.
//
// Dev  (tsx): plugins/standard/mcp/src/         → ../.. → plugins/standard/  (plugin root)
// Prod (node, dist flattened to /app/): /app/mcp/src/  → ../.. → /app/        (plugin root)
//
// The Dockerfile flattens plugins/standard/mcp/dist/ into /app/ so the relative depth is
// identical in both environments.
const __dirname = fileURLToPath(new URL('.', import.meta.url));

startMcpServer({
  registerTools,
  assetsDir: join(__dirname, 'assets'),
  manifestDir: join(__dirname, '../..'),
}).catch((err) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'error', msg: 'startup failed', error: String(err) })}\n`,
  );
  process.exit(1);
});
