# claude-plugin-template

A multi-plugin workspace for building [Claude Code](https://claude.ai/claude-code) plugins with skills, MCP tools, and an OAuth-protected HTTP server — ready to deploy to any cloud.

## What's included

- **`packages/mcp-server`** — shared MCP infrastructure: Express server, Azure Entra/OIDC auth, session management, widget support
- **`plugins/standard`** — starter plugin with a `whoami` tool and `example` skill
- **Build and validation scripts** — typecheck, lint, skill validator, widget bundler

## Getting started

```bash
git clone https://github.com/varianter/claude-plugin-template
cd claude-plugin-template
cp .env.example .env          # fill in your auth credentials and config
pnpm install
```

Run a plugin's MCP server locally:

```bash
pnpm dev:standard             # hot-reload server + widget watcher
pnpm dev:server:standard      # server only — faster when not touching widgets
```

Then update `plugins/standard/.claude-plugin/plugin.json` with your MCP server URL once deployed.

## Configuration

Runtime defaults live in [`plugin.config.json`](plugin.config.json). Environment variables override these values at runtime, so keep secrets such as client IDs and client secrets in `.env` or your deployment environment instead of committing them.

The template config includes:

- `mcpPath` — HTTP endpoint path for the MCP server, default `/mcp`
- `auth` — OAuth/OIDC provider defaults, redirect origins, and client registration behavior
- `limits` — MCP session and rate-limit defaults

See [`plugin.config.schema.json`](plugin.config.schema.json) for all supported fields.

## Project structure

```
packages/
  mcp-server/        ← @variant/mcp-server — shared server infrastructure
plugins/
  standard/          ← starter plugin (copy this to add a new plugin)
    .claude-plugin/
      plugin.json    ← plugin manifest (skills paths, MCP server URL)
    skills/          ← skills; each skill may optionally contain an mcp/ directory for colocated tools
    skills/*/mcp     ← MCP tools colocated with a skill (optional)
    tools/           ← standalone MCP tools (not tied to a skill)
    mcp/             ← deployable MCP HTTP server for this plugin
.claude-plugin/
  marketplace.json   ← repo-level manifest listing all plugins
scripts/             ← skill validator and packaging tools
plugin.config.json   ← committed runtime defaults for MCP servers
```

## Adding a skill

Create `plugins/standard/skills/<name>/SKILL.md`. If the skill needs MCP tools, add them under `plugins/standard/skills/<name>/mcp/`:

```
---
name: my-skill
description: One-line description shown in the skill picker
---

Skill instructions here.
```

Validate it:

```bash
cd scripts && bun run validate.ts ../plugins/standard/skills/my-skill
```

## Adding an MCP tool

Create `plugins/standard/tools/<name>/<toolName>.ts` and register it in `plugins/standard/mcp/src/registerTools.ts`:

```typescript
import type { McpServer } from '@variant/mcp-server';
import { z } from 'zod';

export function registerMyTool(server: McpServer): void {
  server.registerTool(
    'my-tool',
    { title: 'My Tool', description: 'Does something useful', inputSchema: { param: z.string() } },
    async ({ param }) => ({ content: [{ type: 'text', text: param }] }),
  );
}
```

For skill-colocated tools (tools under a skill's `mcp/` directory) see [`AGENTS.md`](AGENTS.md).

## Adding a new plugin

1. Copy `plugins/standard/` to `plugins/<name>/`
2. Update `plugins/<name>/.claude-plugin/plugin.json` and `plugins/<name>/mcp/package.json`
3. Add the new plugin to `.claude-plugin/marketplace.json`
4. Add it to the `options` list and matrix in `.github/workflows/deploy.yml`

## Development commands

From the **repo root**:

```bash
pnpm dev:standard        # standard plugin — server + widget watcher (hot-reload)
pnpm dev:server:standard # standard plugin — server only (faster, skips widgets)
pnpm build               # build all packages in dependency order
pnpm typecheck           # type-check all packages
pnpm check               # biome lint + format check
pnpm fix                 # biome auto-fix
```

Additional commands available from **`plugins/standard/mcp/`**:

```bash
pnpm jam           # MCPJam inspector UI
pnpm inspect       # official MCP Inspector
```

## Deployment

Trigger the **Deploy** GitHub Actions workflow from the repository UI. Select a plugin (or "all") and environment. Each plugin has its own Docker image (`<plugin>-mcp`) built from `plugins/<plugin>/mcp/Dockerfile`.

Update the registry and deployment target in `.github/workflows/deploy.yml` to match your infrastructure.

See [`CLAUDE.md`](CLAUDE.md) for the full structure reference and [`AGENTS.md`](AGENTS.md) for the tool authoring guide.
