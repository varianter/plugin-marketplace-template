# Claude Code Plugin Template

Multi-plugin workspace for building Claude Code plugins with skills, MCP tools, and deployment workflows.

## Structure

```
plugins/
  standard/          ← The standard plugin (template for new plugins)
    .claude-plugin/
      plugin.json    ← Claude Code plugin manifest (skills paths, MCP server URL)
    mcp-server.config.json ← Committed runtime defaults (auth, limits) for this plugin's MCP server
    skills/          ← Skills; each skill may optionally contain colocated MCP tools
      <name>/
        SKILL.md
        tools/                ← Optional MCP tools for this skill
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
    package.json     ← @variant/plugin-standard (pnpm workspace package)
    tsconfig.json
    mcp-server/      ← Plugin-specific MCP server
      index.ts       ← Entry point — calls @variant/mcp-server
      registerTools.ts ← Explicit manifest for this plugin's tools
      assets/        ← Static assets (icon.png)
      Dockerfile

.claude-plugin/
  marketplace.json   ← Repo-level manifest (Claude marketplace schema, lists all plugins)

scripts/             ← Skill validation and packaging CLI tools
tsconfig.base.json   ← Shared TypeScript base config
```

## Adding a new plugin

1. Create `plugins/<name>/` with the same structure as `plugins/standard/`
2. Add `plugins/<name>/.claude-plugin/plugin.json` pointing to its skills and MCP server
3. Add `plugins/<name>/package.json` with `"@variant/mcp-server": "^0.1.0"`
4. Reference the new plugin in `.claude-plugin/marketplace.json`
5. Add the plugin name to the `options` list and `resolve-matrix` step in `.github/workflows/deploy.yml`

## Creating a new skill

1. Add a new directory under `plugins/<plugin>/skills/<name>/`
2. Create `SKILL.md` with `name` and `description` frontmatter
3. Add `references/`, `assets/`, `scripts/`, or an optional `tools/` directory as needed
4. Run validation: `pnpm validate-skill plugins/<plugin>/skills/<name>`

## Creating a new MCP tool

Tools import shared infrastructure from `@variant/mcp-server` (not relative paths).

Skill-colocated tool, **without** widget:

1. Add `plugins/<plugin>/skills/<skill-name>/tools/<toolName>.ts`
2. Import: `import type { McpServer } from '@variant/mcp-server'`
3. Export a `register<ToolName>(server: McpServer): void` function
4. Import it in `plugins/<plugin>/mcp-server/registerTools.ts` and add it to `localTools`

Skill-colocated tool **with** an interactive widget:

1. Create `plugins/<plugin>/skills/<skill-name>/tools/<toolName>/` directory
2. Add `<toolName>.ts`, `index.html`, `app.ts`, `<toolName>.svelte` inside it
3. Load the compiled widget with `loadWidgetHtml('<tool-name-kebab>')` from `@variant/mcp-server`
4. Export a `register<ToolName>(server: McpServer): void` function
5. Import it in `plugins/<plugin>/mcp-server/registerTools.ts` and add it to `localTools`
6. The Vite build discovers `skills/*/tools/*/index.html` automatically

Standalone tool (not tied to a skill):

1. Add `plugins/<plugin>/tools/<toolName>/<toolName>.ts`
2. Export a `register<ToolName>(server: McpServer): void` function
3. Import it in `plugins/<plugin>/mcp-server/registerTools.ts` and add it to `localTools`

## MCP local development

```bash
pnpm install                     # install plugin workspace packages and npm dependencies
cp .env.example .env             # fill in secrets

# From repo root:
pnpm dev [plugin]        # selected plugin — hot-reload server + widgets
pnpm dev:server [plugin] # selected plugin — hot-reload server only (faster)
pnpm dev:standard        # standard plugin alias
pnpm build               # build all plugin servers
pnpm typecheck           # type-check workspace packages
pnpm check               # biome lint + format

# Add each new plugin to the CI/deploy matrices.
```

## @variant/mcp-server API

The shared npm package exports:

```typescript
import { getRequestContext, loadWidgetHtml, log } from '@variant/mcp-server';
import type { McpServer, RequestContext, ServerMetadata, Config } from '@variant/mcp-server';
```

- `readPluginMcpServerConfig()` / `createAndStartMcpServer()` — starts the full Express + MCP server with auth and lifecycle management
- `definePluginTools([...])` — explicit, typed plugin tool manifests
- `getRequestContext()` — returns the authenticated user context inside a tool handler
- `log(level, msg, extra?)` — structured JSON logger
- `loadWidgetHtml(name)` — loads a built widget and injects the ext-apps bundle
- `variant-build-widgets` — CLI that discovers and builds `skills/*/tools/*/index.html` widgets

## Deployment

Trigger the **Deploy** GitHub Actions workflow from the repository UI. Select a plugin (or "all") and environment. The workflow builds the Docker image from `plugins/<plugin>/mcp-server/Dockerfile` with the repo root as build context.

Each plugin's image name is `<plugin>-mcp` (e.g. `standard-mcp`).

Docker builds install `@variant/mcp-server` from npm, so publish the package before deploying this template.

Update the production MCP URL in `plugins/<plugin>/.claude-plugin/plugin.json` after the first deployment.
