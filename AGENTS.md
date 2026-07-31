# AGENTS.md

Operational reference for agents (Claude Code, Copilot, etc.) working in this repository.

---

## Skills

### Validation

When modifying any skill, always validate before committing:

```bash
cd scripts && pnpm exec tsx validate.ts ../plugins/<plugin>/skills/<name>
```

Fix any validation errors before considering the change complete.

---

## MCP Server

### Adding a tool

All tools import shared infrastructure from `@variant/mcp-server`, not from relative paths.

**Skill-colocated tool** (tool lives under a skill in `plugins/<plugin>/skills/<name>/tools/`):

Without widget — flat file:

1. Create `plugins/<plugin>/skills/<name>/tools/<toolName>.ts` exporting a registrar function:

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

1. Create `plugins/<plugin>/skills/<name>/tools/<toolName>/` containing `<toolName>.ts`, `index.html`, `app.ts`, `<toolName>.svelte`
2. Register the widget with `registerWidgetTool` or load compiled widget HTML with `loadWidgetHtml('<tool-name-kebab>')` from `@variant/mcp-server`
3. `pnpm exec variant-build-widgets` discovers any `skills/*/tools/*/index.html` for browser bundles
4. Import the server-side registrar in `plugins/<plugin>/mcp-server/index.ts` and add it to the `definePluginTools([...])` list

**Standalone tool** (not tied to a skill):

1. Create `plugins/<plugin>/tools/<toolName>/<toolName>.ts` with the same pattern
2. Export a `register<ToolName>(server: McpServer): void` function
3. Import it in `plugins/<plugin>/mcp-server/index.ts` and add it to the `definePluginTools([...])` list

**Error handling:** Return tool-level errors as `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }`. Throw only for unexpected infrastructure failures.

### Configuration

All config comes from environment variables and plugin defaults. See the `@variant/mcp-server` package documentation for the full configuration surface.

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
pnpm install                     # install workspace packages and npm dependencies at repo root
cp .env.example .env             # fill in secrets (stays at repo root)

# From repo root:
pnpm dev [plugin]        # selected plugin — hot-reload server + widgets
pnpm dev:server [plugin] # selected plugin — server only (faster, skips widgets)
pnpm dev:standard        # standard plugin alias
pnpm build               # build all plugin servers
pnpm typecheck           # type-check workspace packages
pnpm check               # biome lint + format check

# From plugins/standard/:
pnpm inspect          # MCP Inspector at http://localhost:6274
```

Known limitation: `@modelcontextprotocol/inspector@2.x`'s published tarball is missing `clients/web/static/sandbox_proxy.html`, so the widget/MCP-Apps sandbox tab fails with `Sandbox not loaded: ENOENT ...` (upstream inspector#1082). Tool/resource testing is unaffected. Revisit once fixed upstream — `@modelcontextprotocol/inspector@1.0.1` (v1, run via `npx` not `pnpm dlx` — v1's bin has a phantom `commander` dependency that pnpm's isolated linking doesn't resolve) renders widgets correctly if you need that in the meantime, at the cost of a "v1 is deprecated" warning.

### Deployment

Trigger the **Deploy** GitHub Actions workflow manually. Select a plugin name (or "all") and environment. It:
1. Builds the Docker image using `plugins/<plugin>/mcp-server/Dockerfile` with the repo root as context and installs `@variant/mcp-server` from npm
2. Pushes to ACR (`<plugin>-mcp` image name)
3. Updates the GitOps deployment target

### TypeScript compilation

`plugins/<plugin>/tsconfig.json` uses `rootDir: "."` (= `plugins/<plugin>/`) so that standalone tool files at `tools/` and skill-colocated tool files at `skills/*/tools/` are compiled into `mcp-server/dist/` alongside the server.

Skill-colocated tools and standalone tools import shared infrastructure from `@variant/mcp-server`:

```typescript
import type { McpServer } from '@variant/mcp-server';
import { getRequestContext, log } from '@variant/mcp-server';
```
