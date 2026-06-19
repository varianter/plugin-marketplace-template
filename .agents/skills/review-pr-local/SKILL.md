---
name: review-pr-local
specializes: review-pr
description: Repo-specific review guidance for varianter/plugin-template. Only the categories declared overridable by the core review-pr skill may be specialized here.
---

# Repo-specific review guidance for `varianter/plugin-template`

This file is a companion to the core `review-pr` skill. It does not
redefine the review output schema, severity labels, safety rules, or
evidence rules. It only specializes the override categories the core
skill marks as overridable.

## MCP tools and server changes

- Verify MCP tools import shared infrastructure from `@variant/mcp-server`, not relative paths into `packages/mcp-server`.
- New tools must export an explicit registrar function and be added to `plugins/<plugin>/mcp/registerTools.ts`.
- Tool-level user errors should return `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }`; reserve thrown errors for unexpected infrastructure failures.
- For widget-backed tools, check that server code loads the compiled widget through the shared widget helper/path and that browser entry files live in the expected `skills/*/mcp/*/` structure.

## Skills and plugin manifests

- When a skill changes, require validation with `cd scripts && pnpm exec tsx validate.ts ../plugins/<plugin>/skills/<name>` or `pnpm validate-skills` when broad validation is more appropriate.
- Check that new or moved skills are reflected in the relevant `plugins/<plugin>/.claude-plugin/plugin.json` manifest when needed.
- Flag checked-in planning specs under `specs/`; this repository does not use repo-persisted product or technical specs.

## Workspace and TypeScript boundaries

- Preserve the workspace split: shared infrastructure belongs in `packages/mcp-server`, plugin-specific code belongs under `plugins/<plugin>/`.
- Avoid plugin code reaching into another plugin's internals unless there is an explicit shared abstraction.
- Check that TypeScript imports include `.js` extensions where required for emitted ESM imports.
- Prefer existing root scripts (`pnpm build`, `pnpm typecheck`, `pnpm check`, `pnpm test`, `pnpm validate-skills`) over ad-hoc validation commands.

## Configuration and deployment

- Configuration should come from environment variables and committed defaults in `plugin.config.json`; do not hard-code secrets, tenant IDs, client IDs, or deployment-specific URLs in code.
- Local-only host settings should not weaken the AKS requirement that deployed MCP servers bind to `0.0.0.0`.
- Deployment workflow changes should keep plugin names, image names, marketplace entries, and workflow matrix/options in sync.
