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

Then update `plugin.config.json` with runtime configurations. See below for details.

Run a plugin's MCP server locally:

```bash
pnpm dev standard             # hot-reload server + widget watcher
pnpm dev                      # choose from available plugins
pnpm dev:server standard      # server only — faster when not touching widgets
```

When having multiple plugins, you can run
```bash
pnpm dev <plugin>             # hot-reload server + widget watcher
pnpm dev:server <plugin>      # server only — faster when not touching widgets
```


Then update `plugins/standard/.claude-plugin/plugin.json` with your MCP server URL once deployed.

## Configuration

Runtime defaults live in [`plugin.config.json`](plugin.config.json). Environment variables override these values at runtime. Commit only safe, shared defaults; put secrets and environment-specific values in `.env`, `plugin.config.local.json` (gitignored), or your deployment environment.

Safe to commit as shared defaults:

- `mcpPath` — HTTP endpoint path for MCP requests; clients must use this route.
- `auth.enabled` — turns OAuth/OIDC protection on or off; needed to require authenticated access.
- `auth.provider` — identity provider type (`entra`, `auth0`, `okta`, etc.); needed for provider-specific OAuth metadata.
- `auth.scopes` — scopes requested during login; needed to control what access tokens can contain.
- `auth.scopeAliases` — extra scope names mapped for Entra compatibility; needed for Claude/MCP client interoperability.
- `auth.compatibilityProxy` — enables compatibility OAuth endpoints; needed for clients that cannot use the provider directly.
- `auth.clientRegistration` — dynamic registration mode (`none`, `provider`, `static`); needed to tell clients how to obtain a client ID.
- `limits.maxSessions` — maximum concurrent MCP sessions; needed to cap memory and connection usage.
- `limits.rateLimitPerMinute` — per-minute request limit; needed to protect the server from bursts or abuse.

Can be committed if shared across deployments; otherwise set via environment:

- `auth.tenantId` / `AUTH_TENANT_ID` — Entra tenant ID; used to derive the issuer URL for Microsoft Entra.
- `auth.issuerUrl` / `AUTH_ISSUER_URL` — OAuth/OIDC issuer URL; needed to discover metadata and validate tokens.
- `auth.clientId` / `AUTH_CLIENT_ID` — OAuth client/application ID; needed for login and token audience checks.
- `auth.audience` / `AUTH_AUDIENCE` — requested token audience; needed when the provider expects an explicit API audience.
- `auth.acceptedAudiences` / `AUTH_ACCEPTED_AUDIENCES` — extra JWT audiences to trust; needed when clients send provider-specific audience values.
- `auth.acceptedIssuers` / `AUTH_ACCEPTED_ISSUERS` — extra JWT issuers to trust; needed for provider aliases or multi-issuer setups.
- `auth.allowedRedirectOrigins` / `AUTH_ALLOWED_REDIRECT_ORIGINS` — allowed OAuth redirect origins; needed to prevent unsafe redirect targets.

Environment-only secrets:

- `AUTH_CLIENT_SECRET` — OAuth client secret; required only for confidential-client flows and intentionally not supported in `plugin.config.json`.

`$schema` may be included only to give editors validation and autocomplete. See [`plugin.config.schema.json`](plugin.config.schema.json) for valid types and enum values.

## Project structure

```
packages/
  mcp-server/        ← @variant/mcp-server — shared server infrastructure
plugins/
  standard/          ← starter plugin (copy this to add a new plugin)
    .claude-plugin/
      plugin.json    ← plugin manifest (skills paths, MCP server URL)
    skills/          ← skills; each skill may optionally contain a tools/ directory for colocated tools
    skills/*/tools   ← MCP tools colocated with a skill (optional)
    tools/           ← standalone MCP tools (not tied to a skill)
    mcp-server/      ← deployable MCP HTTP server for this plugin
.claude-plugin/
  marketplace.json   ← repo-level manifest listing all plugins
scripts/             ← skill validator and packaging tools
plugin.config.json   ← committed runtime defaults for MCP servers
```

## Adding a skill

Create `plugins/standard/skills/<name>/SKILL.md`. If the skill needs MCP tools, add them under `plugins/standard/skills/<name>/tools/`:

```
---
name: my-skill
description: One-line description shown in the skill picker
---

Skill instructions here.
```

Validate it:

```bash
cd scripts && pnpm exec tsx validate.ts ../plugins/standard/skills/my-skill
```

## Adding an MCP tool

Create `plugins/standard/tools/<name>/<toolName>.ts` with an explicit registrar:

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

Then add it to `plugins/standard/mcp-server/registerTools.ts`:

```typescript
import { definePluginTools } from '@variant/mcp-server';
import { registerMyTool } from '../tools/my-tool/myTool.js';

export const registerTools = definePluginTools([registerMyTool]);
```

For skill-colocated tools (tools under a skill's `tools/` directory) see [`AGENTS.md`](AGENTS.md).

Note: You can also use the `create-plugin-skill` skill in `.agents/skills/create-plugin-skill/SKILL.md` to generate a new skill directory with the correct structure.

## Adding a new plugin

1. Copy `plugins/standard/` to `plugins/<name>/`
2. Update `plugins/<name>/.claude-plugin/plugin.json` and `plugins/<name>/package.json`
3. Add the new plugin to `.claude-plugin/marketplace.json`
4. Add it to the plugin matrices in `.github/workflows/ci.yml` and `.github/workflows/deploy.yml`


Note: You can also use the `create-plugin` skill in `.agents/skills/create-plugin/SKILL.md` to generate a new plugin directory with the correct structure.

## Development commands

From the **repo root**:

```bash
pnpm dev [plugin]        # selected plugin — server + widget watcher (hot-reload)
pnpm dev:server [plugin] # selected plugin — server only (faster, skips widgets)
pnpm dev:standard        # standard plugin alias
pnpm build               # build all packages in dependency order
pnpm typecheck           # type-check all packages
pnpm check               # biome lint + format check
pnpm fix                 # biome auto-fix
```

Additional commands available from **`plugins/standard/`**:

```bash
pnpm jam           # MCPJam inspector UI
pnpm inspect       # official MCP Inspector
```

## Deployment

Trigger the **Deploy** GitHub Actions workflow from the repository UI. Select a plugin (or "all") and environment. Each plugin has its own Docker image (`<plugin>-mcp`) built from `plugins/<plugin>/mcp-server/Dockerfile`.

Update the registry and deployment target in `.github/workflows/deploy.yml` to match your infrastructure.

See [`CLAUDE.md`](CLAUDE.md) for the full structure reference and [`AGENTS.md`](AGENTS.md) for the tool authoring guide.
