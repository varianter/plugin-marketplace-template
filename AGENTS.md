# AGENTS.md

Operational reference for agents (Claude Code, Copilot, etc.) working in this repository.

---

## Skills

### Validation

When modifying any skill, always validate before committing:

```bash
# Feature skills
cd scripts && bun run validate.ts ../features/<name>

# Standalone skills
cd scripts && bun run validate.ts ../skills/<name>
```

Fix any validation errors before considering the change complete.

### Linting

When modifying files under `scripts/`:

```bash
cd scripts && bun run check
cd scripts && bun run format   # auto-fix
```

---

## MCP Server

### Adding a tool

**Feature-coupled tool** (has a corresponding skill in `features/<name>/`):

Without widget — flat file:

1. Create `features/<name>/mcp/<toolName>.ts` exporting a `register*` function:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { log } from '../../../mcp/src/log.js';

export function registerMyTool(server: McpServer): void {
  server.tool(
    'my-tool',
    'Does something useful',
    { param: z.string().describe('The input parameter') },
    async ({ param }) => {
      log('info', 'my-tool: called', { param });
      return { content: [{ type: 'text', text: param }] };
    },
  );
}
```

With widget — colocated directory:

1. Create `features/<name>/mcp/<toolName>/` containing `<toolName>.ts`, `index.html`, `app.ts`, `<toolName>.svelte`
2. Import shared infrastructure via `../../../../mcp/src/<module>.js` (one level deeper than the flat case)
3. Load the compiled widget from `../../../../mcp/dist/widgets/<tool-name-kebab>/index.html`
4. The build script auto-discovers any `features/*/mcp/*/index.html` — no extra wiring needed

2. Register it in `mcp/src/registerFeatureTools.ts`.

**Standalone tool** (no corresponding skill):

1. Create `tools/<tool-name>/<toolName>.ts` with the same pattern but import shared infrastructure via `'../../mcp/src/log.js'` etc.
2. Register it in `mcp/src/index.ts`.

**Error handling:** Return tool-level errors as `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }`. Throw only for unexpected infrastructure failures.

**Secrets:** Use `loadSecret(loader, 'ENV_VAR_NAME', 'keyvault-secret-name')` — checks env var first, falls back to Key Vault.

### Configuration

All config comes from environment variables. See `mcp/src/config/config.ts`.

| Var | Default | Notes |
|---|---|---|
| `HOST` | `0.0.0.0` | Use `127.0.0.1` locally — **must** be `0.0.0.0` in AKS |
| `PORT` | `8080` | |
| `MCP_PATH` | `/mcp` | HTTP endpoint path for MCP |
| `AZURE_TENANT_ID` | — | Set in k8s ConfigMap |
| `AZURE_CLIENT_ID` | — | Injected automatically by AKS Workload Identity webhook |
| `KEYVAULT_URL` | — | Set locally only; empty in k8s (secrets injected as env vars) |

### Transport

Uses `StreamableHTTPServerTransport` (HTTP, not stdio):

- `POST /mcp` — MCP endpoint
- `GET /mcp` — SSE stream for server-to-client messages
- `DELETE /mcp` — session teardown
- `GET /healthz` — liveness/readiness probe

oauth2-proxy sits in front in AKS. Ensure it does **not** strip `Mcp-Session-Id` headers.

### Local development

```bash
cd mcp
pnpm install
cp ../.env.example ../.env   # fill in secrets

pnpm dev              # hot-reload server + widget watcher (full)
pnpm dev:server       # hot-reload server only (skip widget build — faster iteration)
pnpm inspect          # MCP Inspector at http://localhost:6274
pnpm jam              # MCPJam inspector UI

pnpm build            # tsc + widget build
pnpm typecheck        # type-check only (no emit — fast)
pnpm check            # biome lint + format check
pnpm format           # biome format --write
```

### Deployment

Trigger the **Deploy** GitHub Actions workflow manually. It:
1. Builds the Docker image using `mcp/Dockerfile` with the repo root as context
2. Pushes to your container registry
3. Updates your deployment target (e.g. a GitOps repo or cloud service)

Configure the registry and deployment target in the workflow file at `.github/workflows/deploy.yml`.

### TypeScript compilation

`mcp/tsconfig.json` uses `rootDir: ".."` (repo root) so that feature tool files at `features/*/mcp/` are compiled into `mcp/dist/`. The compiled server entry point is `dist/mcp/src/index.js`.

Feature tools import shared infrastructure via:
```typescript
// Flat tool (features/<name>/mcp/<toolName>.ts)
import { log } from '../../../mcp/src/log.js';
import { loadSecret } from '../../../mcp/src/secrets/secrets.js';

// Colocated tool+widget (features/<name>/mcp/<toolName>/<toolName>.ts)
import { log } from '../../../../mcp/src/log.js';
import { loadSecret } from '../../../../mcp/src/secrets/secrets.js';
```
