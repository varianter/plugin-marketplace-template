# AGENTS.md

Operational reference for agents (Claude Code, Copilot, etc.) working in this repository.

---

## Skills

### Validation

When modifying any skill, always validate before committing:

```bash
cd scripts && bun run validate.ts ../plugins/<plugin>/skills/<name>
```

Fix any validation errors before considering the change complete.

---

## MCP Server

### Adding a tool

All tools import shared infrastructure from `@variant/mcp-server`, not from relative paths.

**Skill-colocated tool** (tool lives under a skill in `plugins/<plugin>/skills/<name>/mcp/`):

Without widget — flat file:

1. Create `plugins/<plugin>/skills/<name>/mcp/<toolName>.ts` exporting a `register*` function:

```typescript
import type { McpServer } from '@variant/mcp-server';
import { getRequestContext, log } from '@variant/mcp-server';
import { z } from 'zod';

export function registerMyTool(server: McpServer): void {
  server.registerTool(
    'my-tool',
    {
      title: 'My Tool',
      description: 'Does something useful',
      inputSchema: { param: z.string().describe('The input parameter') },
    },
    async ({ param }) => {
      log('info', 'my-tool: called', { param });
      return { content: [{ type: 'text', text: param }] };
    },
  );
}
```

With widget — colocated directory:

1. Create `plugins/<plugin>/skills/<name>/mcp/<toolName>/` containing `<toolName>.ts`, `index.html`, `app.ts`, `<toolName>.svelte`
2. Load the compiled widget from `../../../../mcp/dist/widgets/<tool-name-kebab>/index.html`
3. The build script auto-discovers any `skills/*/mcp/*/index.html` — no extra wiring needed

Register skill-colocated tools in `plugins/<plugin>/mcp/src/registerTools.ts`.

**Standalone tool** (not tied to a skill):

1. Create `plugins/<plugin>/tools/<toolName>/<toolName>.ts` with the same pattern
2. Register it in `plugins/<plugin>/mcp/src/registerTools.ts`

**Error handling:** Return tool-level errors as `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }`. Throw only for unexpected infrastructure failures.

### Configuration

All config comes from environment variables. See `packages/mcp-server/src/config/config.ts`.

| Var | Default | Notes |
|---|---|---|
| `HOST` | `0.0.0.0` | Use `127.0.0.1` locally — **must** be `0.0.0.0` in AKS |
| `PORT` | `8080` | |
| `MCP_PATH` | `/mcp` | HTTP endpoint path for MCP |
| `AZURE_TENANT_ID` | — | Set in k8s ConfigMap |
| `AZURE_CLIENT_ID` | — | Injected automatically by AKS Workload Identity webhook |

### Transport

Uses `StreamableHTTPServerTransport` (HTTP, not stdio):

- `POST /mcp` — MCP endpoint
- `GET /mcp` — SSE stream for server-to-client messages
- `DELETE /mcp` — session teardown
- `GET /healthz` — liveness/readiness probe

### Local development

```bash
pnpm install                     # install all workspace packages at repo root
cp .env.example .env             # fill in secrets (stays at repo root)

# From repo root:
pnpm dev:standard        # standard plugin — hot-reload server + widgets
pnpm dev:server:standard # standard plugin — server only (faster, skips widgets)
pnpm build               # build @variant/mcp-server then all plugin servers
pnpm typecheck           # type-check all packages
pnpm check               # biome lint + format check

# From plugins/standard/mcp/:
pnpm inspect          # MCP Inspector at http://localhost:6274
pnpm jam              # MCPJam inspector UI
```

### Deployment

Trigger the **Deploy** GitHub Actions workflow manually. Select a plugin name (or "all") and environment. It:
1. Builds the Docker image using `plugins/<plugin>/mcp/Dockerfile` with the repo root as context
2. Pushes to ACR (`<plugin>-mcp` image name)
3. Updates the GitOps deployment target

### TypeScript compilation

`plugins/<plugin>/mcp/tsconfig.json` uses `rootDir: ".."` (= `plugins/<plugin>/`) so that standalone tool files at `tools/` and skill-colocated tool files at `skills/*/mcp/` are compiled into `mcp/dist/` alongside the server.

Skill-colocated tools and standalone tools import shared infrastructure from `@variant/mcp-server`:

```typescript
import type { McpServer } from '@variant/mcp-server';
import { getRequestContext, log } from '@variant/mcp-server';
```
