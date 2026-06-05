# claude-plugin-template

A starter template for building a [Claude Code](https://claude.ai/claude-code) plugin with skills, MCP tools, and an OAuth-protected HTTP server — ready to deploy to any cloud.

## What's included

- **MCP HTTP server** — Azure Entra OAuth proxy, session management, widget support
- **`whoami` tool** — example standalone MCP tool showing the pattern
- **`example` skill** — placeholder skill to replace with your own
- **Build and validation scripts** — typecheck, lint, skill validator, widget bundler

## Getting started

```bash
git clone https://github.com/varianter/plugin-template
cd plugin-template
cp .env.example .env   # fill in your Azure app credentials
pnpm install
pnpm dev               # hot-reload server + widget watcher
```

Then update `.claude-plugin/plugin.json` with your MCP server URL once deployed.

## Adding a skill

Create `skills/<name>/SKILL.md` (standalone) or `features/<name>/SKILL.md` (with MCP tools):

```
---
name: my-skill
description: One-line description shown in the skill picker
---

Skill instructions here.
```

Validate it:

```bash
cd scripts && bun run validate.ts ../skills/my-skill
```

## Adding an MCP tool

Create `tools/<name>/<toolName>.ts` and register it in `mcp/src/index.ts`:

```typescript
export function registerMyTool(server: McpServer): void {
  server.tool('my-tool', 'Does something useful', { param: z.string() }, async ({ param }) => {
    return { content: [{ type: 'text', text: param }] };
  });
}
```

For feature-coupled tools (paired with a skill) see [`AGENTS.md`](AGENTS.md).

## Project structure

```
features/   ← Skills + their MCP tools (colocated)
skills/     ← Standalone skills (no MCP dependency)
tools/      ← Standalone MCP tools (no corresponding skill)
mcp/        ← HTTP server, auth, config, build
scripts/    ← Skill validator and packaging tools
.claude-plugin/plugin.json  ← Plugin manifest
```

## Development commands

```bash
pnpm dev           # server + widget watcher (hot-reload)
pnpm dev:server    # server only — faster when not touching widgets
pnpm typecheck     # type-check without building
pnpm check         # biome lint + format check
pnpm fix           # biome auto-fix
pnpm jam           # MCPJam inspector UI
pnpm inspect       # official MCP Inspector
```

## Deployment

Trigger the **Deploy** GitHub Actions workflow. It builds and pushes the Docker image from `mcp/Dockerfile`. Update the registry and deployment target in `.github/workflows/deploy.yml` to match your infrastructure.

See [`CLAUDE.md`](CLAUDE.md) for the full structure reference and [`AGENTS.md`](AGENTS.md) for the tool authoring guide.
