# Claude Code Plugin Template

Multi-plugin workspace for building Claude Code plugins with skills, MCP tools, and deployment workflows.

## Structure

```
packages/
  mcp-server/        ← @variant/mcp-server — shared MCP server infrastructure
    src/             ← Express setup, auth (Entra/OIDC), config, widgets
    dist/            ← Compiled output (generated)

plugins/
  standard/          ← The standard plugin (template for new plugins)
    .claude-plugin/
      plugin.json    ← Claude Code plugin manifest (skills paths, MCP server URL)
    skills/          ← Skills; each skill may optionally contain colocated MCP tools
      <name>/
        SKILL.md
        mcp/                  ← Optional MCP tools for this skill
          <toolName>/          ← Tool + widget (when it has an interactive widget)
            <toolName>.ts
            index.html
            app.ts
            <toolName>.svelte
          <toolName>.ts        ← Tool without widget (flat file)
        references/
    tools/           ← Standalone MCP tools (not tied to a skill)
      <name>/
        <toolName>.ts
    mcp/             ← Plugin-specific MCP server (pnpm workspace package)
      src/
        index.ts     ← Entry point — calls startMcpServer() from @variant/mcp-server
        registerTools.ts ← Auto-discovers this plugin's tools
        assets/      ← Static assets (icon.png)
      scripts/
        build-widgets.mjs
      Dockerfile
      package.json   ← @variant/plugin-standard-mcp
      tsconfig.json

.claude-plugin/
  marketplace.json   ← Repo-level manifest (Claude marketplace schema, lists all plugins)

scripts/             ← Skill validation and packaging CLI tools
tsconfig.base.json   ← Shared TypeScript base config
```

## Adding a new plugin

1. Create `plugins/<name>/` with the same structure as `plugins/standard/`
2. Add `plugins/<name>/.claude-plugin/plugin.json` pointing to its skills and MCP server
3. Add `plugins/<name>/mcp/package.json` with `"@variant/mcp-server": "workspace:*"`
4. Reference the new plugin in `.claude-plugin/marketplace.json`
5. Add the plugin name to the `options` list and `resolve-matrix` step in `.github/workflows/deploy.yml`

## Creating a new skill

1. Add a new directory under `plugins/<plugin>/skills/<name>/`
2. Create `SKILL.md` with `name` and `description` frontmatter
3. Add `references/`, `assets/`, `scripts/`, or an optional `mcp/` directory as needed
4. Run validation: `cd scripts && bun run validate.ts ../plugins/<plugin>/skills/<name>`

## Creating a new MCP tool

Tools import shared infrastructure from `@variant/mcp-server` (not relative paths).

Skill-colocated tool, **without** widget:

1. Add `plugins/<plugin>/skills/<skill-name>/mcp/<toolName>.ts`
2. Import: `import type { McpServer } from '@variant/mcp-server'`
3. Export a `register<ToolName>(server: McpServer): void` function; it is auto-discovered

Skill-colocated tool **with** an interactive widget:

1. Create `plugins/<plugin>/skills/<skill-name>/mcp/<toolName>/` directory
2. Add `<toolName>.ts`, `index.html`, `app.ts`, `<toolName>.svelte` inside it
3. Load the compiled widget from `../../../../mcp/dist/widgets/<tool-name-kebab>/index.html`
4. Export a `register<ToolName>(server: McpServer): void` function; it is auto-discovered
5. The Vite build discovers `skills/*/mcp/*/index.html` automatically

Standalone tool (not tied to a skill):

1. Add `plugins/<plugin>/tools/<toolName>/<toolName>.ts`
2. Export a `register<ToolName>(server: McpServer): void` function; it is auto-discovered

## MCP local development

```bash
pnpm install                     # install all workspace packages
cp .env.example .env             # fill in secrets

# From repo root:
pnpm dev:standard        # standard plugin — hot-reload server + widgets
pnpm dev:server:standard # standard plugin — hot-reload server only (faster)
pnpm build               # build @variant/mcp-server then all plugin servers
pnpm typecheck           # type-check all packages
pnpm check               # biome lint + format

# Add dev:<name> / dev:server:<name> to root package.json for each new plugin.
```

## @variant/mcp-server API

The shared package exports:

```typescript
import { startMcpServer, getRequestContext, log, injectExtApps } from '@variant/mcp-server';
import type { McpServer, RequestContext, ServerMetadata, Config } from '@variant/mcp-server';
```

- `startMcpServer(options)` — starts the full Express + MCP server with auth and lifecycle management
- `getRequestContext()` — returns the authenticated user context inside a tool handler
- `log(level, msg, extra?)` — structured JSON logger
- `injectExtApps(html)` — injects the ext-apps bundle into a widget HTML file

## Deployment

Trigger the **Deploy** GitHub Actions workflow from the repository UI. Select a plugin (or "all") and environment. The workflow builds the Docker image from `plugins/<plugin>/mcp/Dockerfile` with the repo root as build context.

Each plugin's image name is `<plugin>-mcp` (e.g. `standard-mcp`).

Update the production MCP URL in `plugins/<plugin>/.claude-plugin/plugin.json` after the first deployment.
