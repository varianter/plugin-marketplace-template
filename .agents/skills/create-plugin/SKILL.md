---
name: create-plugin
description: Create a new plugin from baked-in template repository best practices without depending on an existing example plugin.
allowed-tools: Read, Bash, Edit, Write
---

# Create Plugin

Use this skill when adding a new plugin to a repository that follows this template's best-practice shape. Do not assume any existing plugin can be copied. Generate the required files from the patterns below, adapting to the current repository if it has evolved.

## Inputs

- `plugin`: new plugin directory name in kebab-case.
- Optional description, homepage, repository, category, MCP URL, local port.

## Best-practice plugin shape

```text
plugins/<plugin>/
  .claude-plugin/plugin.json
  package.json
  tsconfig.json
  mcp.config.json
  mcp-server/
    Dockerfile
    index.ts
    vite.config.ts
    svelte.config.js
    assets/icon.png        # optional placeholder if available
  skills/
  tools/
```

Shared MCP infrastructure should be imported from `@variant/mcp-server`. Plugin TypeScript should compile with `rootDir: "."` so standalone `tools/` and skill-colocated `skills/*/tools/` compile into `mcp-server/dist/`.

## Steps

1. Inspect current repo files first: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, existing `plugins/`, `.claude-plugin/marketplace.json`, `.github/workflows/deploy.yml`, and any existing plugin files if present. Use current conventions when they are compatible with the best-practice shape here.
2. Validate `plugin` is kebab-case and does not already exist under `plugins/`.
3. Create the plugin directory structure above. If there is no current plugin to inspect, use these minimal files.
4. `plugins/<plugin>/package.json`:
   ```json
   {
     "name": "@variant/plugin-<plugin>",
     "version": "0.1.0",
     "private": true,
     "type": "module",
     "scripts": {
       "dev": "pnpm build:widgets && concurrently \"pnpm build:widgets -- --watch --mode development\" \"pnpm dev:server\"",
       "dev:server": "tsx watch --env-file ../../.env mcp-server/index.ts",
       "build": "rm -rf mcp-server/dist && pnpm build:widgets && tsc -p tsconfig.json && cp -r mcp-server/assets mcp-server/dist/mcp-server/assets 2>/dev/null || true",
       "build:widgets": "node ../../packages/mcp-server/dist/buildWidgets.js",
       "typecheck": "tsc -p tsconfig.json --noEmit",
       "start": "node mcp-server/dist/mcp-server/index.js",
       "jam": "pnpm dlx @mcpjam/inspector@latest --no-telemetry --config ./mcp.config.json --server plugin-mcp --oauth"
     },
     "dependencies": {
       "@variant/mcp-server": "workspace:*",
       "zod": "4.4.3"
     },
     "devDependencies": {
       "@modelcontextprotocol/sdk": "1.29.0",
       "@sveltejs/vite-plugin-svelte": "^7.0.0",
       "@types/node": "25.9.1",
       "concurrently": "^10.0.3",
       "svelte": "^5.56.1",
       "tsx": "4.22.4",
       "typescript": "6.0.3"
     }
   }
   ```
   Adjust versions to match root/current repo dependencies if they differ.
5. `plugins/<plugin>/tsconfig.json`:
   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "rootDir": ".",
       "outDir": "mcp-server/dist",
       "noEmit": false
     },
     "include": ["mcp-server/**/*.ts", "tools/**/*.ts", "skills/**/*.ts"],
     "exclude": ["mcp-server/dist", "node_modules", "**/*.svelte"]
   }
   ```
6. `.claude-plugin/plugin.json` should include plugin metadata, `"skills": ["./skills"]`, and an HTTP MCP server entry named `plugin-mcp` with URL ending in `/mcp`.
7. `mcp.config.json` should point local inspectors at `http://127.0.0.1:<port>/mcp` using `streamable-http`.
8. `mcp-server/index.ts` should start with no local tools:
   ```ts
   import {
     createAndStartMcpServer,
     definePluginTools,
     readPluginMcpServerConfig,
   } from '@variant/mcp-server';

   const config = readPluginMcpServerConfig();
   await createAndStartMcpServer(config, definePluginTools([]));
   ```
9. `mcp-server/Dockerfile` should build from the repo root and run the plugin package. Mirror current repo Dockerfile conventions if present; otherwise create a conventional pnpm workspace Dockerfile.
10. `mcp-server/vite.config.ts` and `mcp-server/svelte.config.js` should support widget builds through `WIDGET_PATH` and `WIDGET_NAME`. Prefer copying the current best-practice Vite/Svelte config from any existing plugin only as a convention reference, not as a dependency.
11. Update root `package.json` scripts if the repo uses per-plugin scripts:
    - `dev:<plugin>`
    - `dev:server:<plugin>`
    - include the plugin in `build` if build is explicit rather than recursive.
12. Update `.claude-plugin/marketplace.json` if present by adding a plugin entry with source `./plugins/<plugin>`.
13. Update `.github/workflows/deploy.yml` if present by adding `<plugin>` to plugin choices and the `all` matrix.
14. Validate:
    ```bash
    pnpm --filter @variant/plugin-<plugin> run typecheck
    pnpm validate-skills
    ```

## Important

- This skill encodes template best practices but must inspect and adapt to the current repository state.
- Do not fail just because `plugins/standard` does not exist.
- Do not import shared infrastructure via relative paths.
