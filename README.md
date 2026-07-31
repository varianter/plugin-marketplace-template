# claude-plugin-template

A multi-plugin workspace for building [Claude Code](https://claude.ai/claude-code) plugins with skills, MCP tools, and an OAuth-protected HTTP server — ready to deploy to any cloud.

## What's included

- **`@variant/mcp-server`** — npm package for shared MCP infrastructure: Express server, OAuth/OIDC auth, session management, widget support
- **`plugins/standard`** — starter plugin with a `whoami` tool and `example` skill
- **Build and validation scripts** — typecheck, lint, skill validator, widget bundler

## Getting started

```bash
git clone https://github.com/varianter/claude-plugin-template
cd claude-plugin-template
cp .env.example .env          # fill in your auth credentials and config
pnpm install
```

Then update `plugins/standard/mcp-server.config.json` with runtime configurations. See below for details.

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

## Configuration MCP

Runtime defaults live in [`plugins/standard/mcp-server.config.json`](plugins/standard/mcp-server.config.json) — the file is found by walking up from the server process's working directory, so keep it at the plugin root. Environment variables override these values at runtime. 
See docs and readme at [`@variant/mcp-server`](https://github.com/varianter/mcp-server) for complete configuration.

## Project structure

```
plugins/
  standard/          ← starter plugin (copy this to add a new plugin)
    .claude-plugin/
      plugin.json    ← plugin manifest (skills paths, MCP server URL)
    mcp-server.config.json ← committed runtime defaults for this plugin's MCP server
    skills/          ← skills; each skill may optionally contain a tools/ directory for colocated tools
    skills/*/tools   ← MCP tools colocated with a skill (optional)
    tools/           ← standalone MCP tools (not tied to a skill)
    mcp-server/      ← deployable MCP HTTP server for this plugin
.claude-plugin/
  marketplace.json   ← repo-level manifest listing all plugins
scripts/             ← skill validator and packaging tools
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
pnpm validate-skill plugins/standard/skills/my-skill
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
pnpm build               # build all plugin servers
pnpm typecheck           # type-check workspace packages
pnpm check               # biome lint + format check
pnpm fix                 # biome auto-fix
pnpm validate-skills      # validate all skills
pnpm validate-skill <path> # validate a single skill, e.g. plugins/standard/skills/my-skill
```

Additional commands available from **`plugins/standard/`**:

```bash
pnpm inspect       # official MCP Inspector
```

## Deployment

Trigger the **Deploy** GitHub Actions workflow from the repository UI. Select a plugin (or "all") and environment. Each plugin has its own Docker image (`<plugin>-mcp`) built from `plugins/<plugin>/mcp-server/Dockerfile`.

Docker builds install `@variant/mcp-server` from npm, so publish the package before building images from this template.

Update the registry and deployment target in `.github/workflows/deploy.yml` to match your infrastructure.

See [`CLAUDE.md`](CLAUDE.md) for the full structure reference and [`AGENTS.md`](AGENTS.md) for the tool authoring guide.
