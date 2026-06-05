# Claude Code Plugin Template

Starter template for building a Claude Code plugin with skills, MCP tools, and deployment workflows.

## Structure

```
features/          ← Skills WITH dependent MCP tools (and widgets where applicable)
  <name>/
    SKILL.md       ← Claude Code skill definition
    mcp/           ← MCP tool source files for this feature
      <toolName>/  ← Colocated tool + widget (when the tool has an interactive widget)
        <toolName>.ts   ← MCP tool registration
        index.html      ← Widget entry point
        app.ts          ← Widget bootstrap
        <toolName>.svelte ← Widget UI component
      <toolName>.ts ← MCP tool (no widget — flat file, not a directory)
    references/    ← Supporting documentation

skills/            ← Standalone skills (no MCP dependency)
  <name>/
    SKILL.md

tools/             ← Standalone MCP tools (no corresponding skill)
  <name>/
    <toolName>.ts

mcp/               ← MCP HTTP server
  src/             ← Server infrastructure (index, config, secrets, clients)
  Dockerfile
  package.json

scripts/           ← Skill validation and packaging CLI tools

.claude-plugin/
  plugin.json      ← Makes this a Claude Code plugin; declares skills paths + MCP server URL
```

## Creating a new skill

1. Add a new directory under `features/<name>/` (if it will have MCP tools) or `skills/<name>/` (standalone)
2. Create `SKILL.md` with `name` and `description` frontmatter
3. Add `references/`, `assets/`, or `scripts/` as needed
4. Run validation: `cd scripts && bun run validate.ts ../<path>/<skill-name>`

## Creating a new MCP tool

Feature-coupled tool (has a corresponding skill), **without** widget:

1. Add `features/<feature-name>/mcp/<toolName>.ts`
2. Use the standard `register*` pattern (see AGENTS.md)
3. Import shared infrastructure via `../../../mcp/src/<module>.js`
4. Register the tool in `mcp/src/registerFeatureTools.ts`

Feature-coupled tool **with** an interactive widget:

1. Create `features/<feature-name>/mcp/<toolName>/` directory
2. Add `<toolName>.ts` (tool registration), `index.html`, `app.ts`, `<toolName>.svelte` inside it
3. Import shared infrastructure via `../../../../mcp/src/<module>.js` (one level deeper)
4. Load the compiled widget from `../../../../mcp/dist/widgets/<tool-name-kebab>/index.html`
5. Register the tool in `mcp/src/registerFeatureTools.ts`
6. The Vite build discovers `features/*/mcp/*/index.html` automatically — no extra config needed

Standalone tool (no corresponding skill):

1. Add the TypeScript file to `tools/<tool-name>/<toolName>.ts`
2. Use the standard `register*` pattern (see AGENTS.md)
3. Register it directly in `mcp/src/index.ts`

## MCP local development

```bash
cd mcp
pnpm install
cp ../.env.example ../.env  # fill in secrets
pnpm dev           # hot-reload server + widgets (full)
pnpm dev:server    # hot-reload server only (faster — skips widget build)
pnpm jam           # MCP inspector UI
pnpm build         # compile (tsc + widgets)
pnpm typecheck     # type-check only (no emit — fast)
pnpm check         # biome lint + format
```

## Deployment

Trigger the **Deploy** GitHub Actions workflow from the repository UI. It builds the Docker image from `mcp/Dockerfile` with the repo root as build context and pushes to your container registry.

Update the production MCP URL in `.claude-plugin/plugin.json` to your live server address after the first deployment.
